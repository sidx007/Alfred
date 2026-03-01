import cors from "cors";
import "dotenv/config";
import express from "express";
import { createServer } from "http";
import multer from "multer";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { WebSocket, WebSocketServer } from "ws";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Load env from parent .env ───────────────────────────────────────
import { config } from "dotenv";
config({ path: resolve(__dirname, "../.env") });

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Configure multer for voice upload (memory storage)
const upload = multer({ storage: multer.memoryStorage() });

const PORT = 3001;

// ── Config ──────────────────────────────────────────────────────────
const QDRANT_URL = (process.env.QDRANT_URL || "").replace(/\/+$/, "");
const QDRANT_API_KEY = process.env.QDRANT_API_KEY || "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

const GEMINI_EMBED_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001";
const GEMINI_GENERATE_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent";

// Multimodal (audio input → text output) via standard REST generateContent
const GEMINI_MULTIMODAL_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

// Live API (real-time bidirectional voice) via WebSocket
const GEMINI_LIVE_WS_URL =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";
const LIVE_MODEL = "models/gemini-2.0-flash-exp";

const TOPICS_COLLECTION = "topics";
const MEMORY_COLLECTION = "memory";
const KNOWLEDGE_BASE_COLLECTION = "knowledge_base";
const DAILY_REPORT_COLLECTION = "daily report";
const FLASHCARDS_COLLECTION = "flashcards";
const CHECKLIST_COLLECTION = "checklist";

// ── Helpers ─────────────────────────────────────────────────────────

async function qdrantRequest(method, path, body = null) {
  const opts = {
    method,
    headers: {
      "api-key": QDRANT_API_KEY,
      "Content-Type": "application/json",
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${QDRANT_URL}${path}`, opts);
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`Qdrant ${res.status}: ${text.slice(0, 300)}`);
  }
  return res;
}

async function scrollAll(collection, filterObj = null) {
  const points = [];
  let offset = null;
  while (true) {
    const body = { limit: 100, with_payload: true };
    if (offset !== null) body.offset = offset;
    if (filterObj) body.filter = filterObj;

    const res = await qdrantRequest(
      "POST",
      `/collections/${collection}/points/scroll`,
      body,
    );
    if (res.status === 404) return [];
    const data = (await res.json()).result || {};
    const pts = data.points || [];
    points.push(...pts);
    const next = data.next_page_offset;
    if (next == null || !pts.length) break;
    offset = next;
  }
  return points;
}

async function embedText(text) {
  const res = await fetch(
    `${GEMINI_EMBED_URL}:embedContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "models/gemini-embedding-001",
        content: { parts: [{ text }] },
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini embed ${res.status}`);
  const data = await res.json();
  return data.embedding.values;
}

async function searchQdrant(collection, vector, topK = 5) {
  const res = await qdrantRequest(
    "POST",
    `/collections/${collection}/points/search`,
    { vector, limit: topK, with_payload: true },
  );
  if (res.status === 404) return [];
  const data = await res.json();
  return data.result || [];
}

async function callLLM(prompt, retries = 3) {
  const MAX_PROMPT_CHARS = 14000;
  if (typeof prompt !== "string") prompt = String(prompt || "");
  if (prompt.length > MAX_PROMPT_CHARS) {
    console.warn(
      `Prompt length ${prompt.length} exceeds ${MAX_PROMPT_CHARS}, truncating before send`,
    );
    prompt =
      prompt.slice(0, MAX_PROMPT_CHARS) + "\n\n...[TRUNCATED DUE TO LENGTH]";
  }

  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(`${GEMINI_GENERATE_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4 },
      }),
    });

    if (res.status === 429 && attempt < retries - 1) {
      const wait = Math.pow(2, attempt + 1) * 1000;
      console.warn(
        `Gemini 429 — retrying in ${wait / 1000}s (attempt ${attempt + 1}/${retries})`,
      );
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `Gemini generate ${res.status}: ${errText.slice(0, 300)}`,
      );
    }
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  }
}

async function multimodalAudioChat(audioBuffer, audioMimeType, textPrompt) {
  const base64Audio = audioBuffer.toString("base64");

  const res = await fetch(`${GEMINI_MULTIMODAL_URL}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: textPrompt },
            {
              inlineData: {
                data: base64Audio,
                mimeType: audioMimeType,
              },
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `Gemini Multimodal ${res.status}: ${errText.slice(0, 300)}`,
    );
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return { transcript: text };
}

// ── API Routes ──────────────────────────────────────────────────────

// GET /api/topics — list all topic names
app.get("/api/topics", async (req, res) => {
  try {
    const points = await scrollAll(TOPICS_COLLECTION);
    const topics = points
      .map((p) => p.payload?.text || "")
      .filter(Boolean)
      .sort();
    res.json({ success: true, topics });
  } catch (err) {
    console.error("GET /api/topics error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/topic-counts — count memory chunks per topic
app.get("/api/topic-counts", async (req, res) => {
  try {
    const [memoryPoints, kbPoints] = await Promise.all([
      scrollAll(MEMORY_COLLECTION),
      scrollAll(KNOWLEDGE_BASE_COLLECTION),
    ]);
    const allPoints = [...memoryPoints, ...kbPoints];
    const counts = {};
    for (const p of allPoints) {
      const topicField = (p.payload?.topic || "").toLowerCase();
      if (!topicField) continue;
      // topic field may be comma-separated like "Machine Learning, Neural Networks"
      const parts = topicField
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const part of parts) {
        counts[part] = (counts[part] || 0) + 1;
      }
    }
    res.json({ success: true, counts });
  } catch (err) {
    console.error("GET /api/topic-counts error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Static files (Vite build)
app.use(express.static(resolve(__dirname, "dist")));

// Fallback to index.html for SPA (must be after all API routes)
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(resolve(__dirname, "dist/index.html"));
});

// POST /api/voice-chat — multimodal voice chat with Gemini
app.post("/api/voice-chat", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, error: "Audio file is required" });
    }

    const result = await multimodalAudioChat(
      req.file.buffer,
      req.file.mimetype || "audio/wav",
      "Explain or answer based on the context of this audio. Be concise and conversational. Include the transcription of what I said at the start as text followed by your answer.",
    );

    res.json({
      success: true,
      transcript: result.transcript,
      answer: result.transcript,
    });
  } catch (err) {
    console.error("POST /api/voice-chat error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/chat — ask the assistant
app.post("/api/chat", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message?.trim()) {
      return res
        .status(400)
        .json({ success: false, error: "Message required" });
    }

    // 1. Embed the user query
    const queryVec = await embedText(message);

    // 2. Search memory + knowledge_base
    const [memResults, kbResults] = await Promise.all([
      searchQdrant(MEMORY_COLLECTION, queryVec, 5),
      searchQdrant(KNOWLEDGE_BASE_COLLECTION, queryVec, 5),
    ]);

    // 3. Build context (truncate long entries and limit count)
    const MAX_ENTRY_CHARS = 2000;
    const MAX_ENTRIES_PER_SECTION = 3;

    const memoryContext = memResults
      .slice(0, MAX_ENTRIES_PER_SECTION)
      .map((r, i) => {
        let text = r.payload?.text || "";
        if (text.length > MAX_ENTRY_CHARS)
          text = text.slice(0, MAX_ENTRY_CHARS) + "\n...[truncated]";
        return `[Memory ${i + 1}] (score: ${r.score.toFixed(3)})\n${text}`;
      })
      .join("\n\n");

    const kbContext = kbResults
      .slice(0, MAX_ENTRIES_PER_SECTION)
      .map((r, i) => {
        let text = r.payload?.text || "";
        if (text.length > MAX_ENTRY_CHARS)
          text = text.slice(0, MAX_ENTRY_CHARS) + "\n...[truncated]";
        return `[Knowledge ${i + 1}] (score: ${r.score.toFixed(3)})\n${text}`;
      })
      .join("\n\n");

    const topics = [
      ...new Set([
        ...memResults.map((r) => r.payload?.topic).filter(Boolean),
        ...kbResults.map((r) => r.payload?.topic).filter(Boolean),
      ]),
    ];

    // 4. Call Gemini with RAG context
    const prompt = `You are Alfred, an intelligent assistant that answers questions using the user's personal knowledge base.

Here is the relevant context from the user's knowledge base:

--- USER'S MEMORIES ---
${memoryContext || "(No relevant memories found)"}

--- KNOWLEDGE BASE ---
${kbContext || "(No relevant knowledge found)"}

---

User's question: ${message}

Instructions:
- Answer the question using ONLY the context above when possible.
- If the context contains relevant information, synthesize it into a clear, comprehensive answer.
- If the context doesn't contain enough information, say so honestly and provide what you can.
- Use markdown formatting for readability (headers, bullets, bold).
- Be concise but thorough.`;

    const answer = await callLLM(prompt);

    res.json({ success: true, answer, topics });
  } catch (err) {
    console.error("POST /api/chat error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/revision — daily revision summaries
app.get("/api/revision", async (req, res) => {
  try {
    const today = new Date();
    const dayOffsets = [1, 3, 5, 7];

    const results = {};

    for (const offset of dayOffsets) {
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() - offset);
      const dateStr = targetDate.toISOString().split("T")[0];

      // Fetch all memory points for this date
      const points = await scrollAll(MEMORY_COLLECTION, {
        must: [
          {
            key: "date",
            match: { value: dateStr },
          },
        ],
      });

      if (points.length === 0) {
        results[`day${offset}`] = {
          date: dateStr,
          count: 0,
          summary: "No content was captured on this day.",
        };
        continue;
      }

      const REVISION_MAX_CHARS = 1200;
      const REVISION_MAX_ITEMS = 10;
      const allTexts = points
        .map((p) => p.payload?.text || "")
        .filter(Boolean)
        .slice(0, REVISION_MAX_ITEMS)
        .map((t) =>
          t.length > REVISION_MAX_CHARS
            ? t.slice(0, REVISION_MAX_CHARS) + "\n...[truncated]"
            : t,
        );

      const topics = [
        ...new Set(points.map((p) => p.payload?.topic || "").filter(Boolean)),
      ];

      // Summarize via Gemini
      const prompt = `You are a study revision assistant. Summarize the following notes that were captured ${offset} day(s) ago for a quick revision session.

Topics covered: ${topics.join(", ") || "Various"}

Notes:
${allTexts.map((t, i) => `${i + 1}. ${t}`).join("\n\n")}

Instructions:
- Create a clear, well-structured summary organized by topic.
- Highlight key concepts, facts, and takeaways.
- Use markdown formatting (headers, bullets, bold for key terms).
- Keep it concise but comprehensive enough for effective revision.
- Start with a brief overview, then break down by topic.`;

      const summary = await callLLM(prompt);

      results[`day${offset}`] = {
        date: dateStr,
        count: allTexts.length,
        topics,
        summary,
      };
    }

    res.json({ success: true, revisions: results });
  } catch (err) {
    console.error("GET /api/revision error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/daily-report — fetch report from daily report collection
app.get("/api/daily-report", async (req, res) => {
  try {
    const points = await scrollAll(DAILY_REPORT_COLLECTION);
    if (points.length === 0) {
      return res.json({ success: true, report: null });
    }
    // Return the most recent report (sort by date or createdAt if available)
    const sorted = points.sort((a, b) => {
      const da = a.payload?.date || a.payload?.createdAt || "";
      const db = b.payload?.date || b.payload?.createdAt || "";
      return db.localeCompare(da);
    });
    const latest = sorted[0].payload || {};
    const report =
      latest.report || latest.content || latest.text || JSON.stringify(latest);
    res.json({
      success: true,
      report,
      date: latest.date || latest.createdAt || null,
    });
  } catch (err) {
    console.error("GET /api/daily-report error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/flashcards — fetch flashcards from flashcards collection
app.get("/api/flashcards", async (req, res) => {
  try {
    const points = await scrollAll(FLASHCARDS_COLLECTION);
    const flashcards = points
      .map((p) => ({
        id: String(p.id),
        question:
          p.payload?.question || p.payload?.front || p.payload?.text || "",
        answer: p.payload?.answer || p.payload?.back || "",
      }))
      .filter((f) => f.question);
    res.json({ success: true, flashcards });
  } catch (err) {
    console.error("GET /api/flashcards error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/checklist — fetch checklist items from checklist collection
app.get("/api/checklist", async (req, res) => {
  try {
    const points = await scrollAll(CHECKLIST_COLLECTION);
    const items = points
      .map((p) => ({
        id: String(p.id),
        task: p.payload?.task || p.payload?.text || p.payload?.title || "",
        completed: p.payload?.completed || false,
      }))
      .filter((i) => i.task);
    res.json({ success: true, items });
  } catch (err) {
    console.error("GET /api/checklist error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/report — generate a custom report from a user prompt
app.post("/api/report", async (req, res) => {
  try {
    const { prompt: userPrompt, topics } = req.body;

    // Support both new prompt-based and legacy topics-based calls
    const queryText =
      userPrompt?.trim() || (Array.isArray(topics) ? topics.join(", ") : "");
    if (!queryText) {
      return res.status(400).json({
        success: false,
        error: "A prompt or topics array is required",
      });
    }

    // Embed the query for semantic search
    const queryVec = await embedText(queryText);

    // Search both collections
    const [memResults, kbResults] = await Promise.all([
      searchQdrant(MEMORY_COLLECTION, queryVec, 15),
      searchQdrant(KNOWLEDGE_BASE_COLLECTION, queryVec, 15),
    ]);

    // Deduplicate memory results and truncate long entries
    const MAX_REPORT_ENTRY_CHARS = 2000;
    const allTexts = new Map();
    for (const r of memResults) {
      let text = r.payload?.text || "";
      if (!text) continue;
      if (text.length > MAX_REPORT_ENTRY_CHARS)
        text = text.slice(0, MAX_REPORT_ENTRY_CHARS) + "\n...[truncated]";
      if (!allTexts.has(text)) {
        allTexts.set(text, {
          text,
          topic: r.payload?.topic,
          date: r.payload?.date,
        });
      }
    }
    const kbTexts = kbResults
      .map((r) => {
        let t = r.payload?.text || "";
        if (t.length > MAX_REPORT_ENTRY_CHARS)
          t = t.slice(0, MAX_REPORT_ENTRY_CHARS) + "\n...[truncated]";
        return t;
      })
      .filter(Boolean);

    const geminiPrompt = `You are a report generator for a personal knowledge management system. Generate a comprehensive, well-structured report based on the user's request and their knowledge base.

User's Report Request: ${queryText}

--- USER'S NOTES ---
${
  [...allTexts.values()]
    .map(
      (item, i) =>
        `${i + 1}. [${item.topic || "General"} | ${item.date || "Unknown date"}] ${item.text}`,
    )
    .join("\n\n") || "(No relevant notes found)"
}

--- KNOWLEDGE BASE ENTRIES ---
${kbTexts.map((t, i) => `${i + 1}. ${t}`).join("\n\n") || "(No relevant knowledge base entries found)"}

Instructions:
- Generate a professional, detailed report that addresses the user's request.
- Organize with clear section headers.
- Include an executive summary at the top.
- Highlight key insights, trends, and important facts.
- Use markdown formatting extensively (headers, bullets, bold, tables where appropriate).
- Include a conclusion section with key takeaways.
- If data is limited, mention that and provide what's available.`;

    const report = await callLLM(geminiPrompt);

    res.json({
      success: true,
      report,
      stats: {
        memoryPoints: allTexts.size,
        knowledgePoints: kbTexts.length,
      },
    });
  } catch (err) {
    console.error("POST /api/report error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════
//  LIVE VOICE WebSocket Proxy  (gemini-2.0-flash-live-001)
// ══════════════════════════════════════════════════════════════════════
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: "/ws/voice" });

wss.on("connection", (clientWs) => {
  console.log("[Live Voice] Client connected");

  const googleUrl = `${GEMINI_LIVE_WS_URL}?key=${GEMINI_API_KEY}`;
  const googleWs = new WebSocket(googleUrl);
  let setupDone = false;

  googleWs.on("open", () => {
    console.log("[Live Voice] Connected to Gemini Live API");

    // Send setup message
    const setup = {
      setup: {
        model: LIVE_MODEL,
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: "Puck" },
            },
          },
        },
        systemInstruction: {
          parts: [
            {
              text: "You are Alfred, a concise and helpful personal knowledge assistant. Keep answers brief and conversational.",
            },
          ],
        },
      },
    };
    googleWs.send(JSON.stringify(setup));
  });

  googleWs.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());

    // After setup acknowledgment, notify client
    if (msg.setupComplete) {
      setupDone = true;
      clientWs.send(JSON.stringify({ type: "setup_complete" }));
      return;
    }

    // Forward server content (audio / text) to client
    if (msg.serverContent) {
      const parts = msg.serverContent.modelTurn?.parts || [];
      for (const part of parts) {
        if (part.inlineData) {
          clientWs.send(
            JSON.stringify({
              type: "audio",
              data: part.inlineData.data,
              mimeType: part.inlineData.mimeType,
            }),
          );
        }
        if (part.text) {
          clientWs.send(JSON.stringify({ type: "text", data: part.text }));
        }
      }

      if (msg.serverContent.turnComplete) {
        clientWs.send(JSON.stringify({ type: "turn_complete" }));
      }
    }
  });

  googleWs.on("error", (err) => {
    console.error("[Live Voice] Google WS error:", err.message);
    clientWs.send(JSON.stringify({ type: "error", message: err.message }));
    clientWs.close();
  });

  googleWs.on("close", (code, reason) => {
    console.log(`[Live Voice] Google WS closed: ${code} ${reason}`);
    if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
  });

  // Forward client audio to Google
  clientWs.on("message", (raw) => {
    if (!setupDone) return;
    try {
      const msg = JSON.parse(raw.toString());
      // Client sends { type: "audio", data: "<base64 PCM>" }
      if (msg.type === "audio" && msg.data) {
        googleWs.send(
          JSON.stringify({
            realtimeInput: {
              mediaChunks: [
                {
                  data: msg.data,
                  mimeType: "audio/pcm;rate=16000",
                },
              ],
            },
          }),
        );
      }
    } catch (e) {
      // ignore parse errors
    }
  });

  clientWs.on("close", () => {
    console.log("[Live Voice] Client disconnected");
    if (googleWs.readyState === WebSocket.OPEN) googleWs.close();
  });
});

// ── Start ───────────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`✓ Alfred API server running on http://localhost:${PORT}`);
  console.log(`  Qdrant: ${QDRANT_URL ? "configured" : "⚠ MISSING"}`);
  console.log(
    `  Gemini (embeddings + generation): ${GEMINI_API_KEY ? "configured" : "⚠ MISSING"}`,
  );
  console.log(`  Live Voice WS: ws://localhost:${PORT}/ws/voice`);
});
