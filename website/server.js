import cors from "cors";
import "dotenv/config";
import express from "express";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Load env from parent .env ───────────────────────────────────────
import { config } from "dotenv";
config({ path: resolve(__dirname, "../.env") });

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const PORT = 3001;

// ── Config ──────────────────────────────────────────────────────────
const QDRANT_URL = (process.env.QDRANT_URL || "").replace(/\/+$/, "");
const QDRANT_API_KEY = process.env.QDRANT_API_KEY || "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";

const GEMINI_EMBED_URL =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001";
const GEMINI_GENERATE_URL =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

const TOPICS_COLLECTION = "topics";
const MEMORY_COLLECTION = "memory";
const KNOWLEDGE_BASE_COLLECTION = "knowledge_base";

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
            body
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
    const res = await fetch(`${GEMINI_EMBED_URL}:embedContent?key=${GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: "models/gemini-embedding-001",
            content: { parts: [{ text }] },
        }),
    });
    if (!res.ok) throw new Error(`Gemini embed ${res.status}`);
    const data = await res.json();
    return data.embedding.values;
}

async function searchQdrant(collection, vector, topK = 5) {
    const res = await qdrantRequest(
        "POST",
        `/collections/${collection}/points/search`,
        { vector, limit: topK, with_payload: true }
    );
    if (res.status === 404) return [];
    const data = await res.json();
    return data.result || [];
}

async function callGemini(prompt) {
    const res = await fetch(`${GEMINI_GENERATE_URL}?key=${GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
        }),
    });
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Gemini ${res.status}: ${errText.slice(0, 300)}`);
    }
    const data = await res.json();
    const candidates = data.candidates || [];
    if (!candidates.length) return "";
    const parts = candidates[0].content?.parts || [];
    return parts.map((p) => p.text || "").join("");
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

// POST /api/chat — ask the assistant
app.post("/api/chat", async (req, res) => {
    try {
        const { message } = req.body;
        if (!message?.trim()) {
            return res.status(400).json({ success: false, error: "Message required" });
        }

        // 1. Embed the user query
        const queryVec = await embedText(message);

        // 2. Search memory + knowledge_base
        const [memResults, kbResults] = await Promise.all([
            searchQdrant(MEMORY_COLLECTION, queryVec, 5),
            searchQdrant(KNOWLEDGE_BASE_COLLECTION, queryVec, 5),
        ]);

        // 3. Build context
        const memoryContext = memResults
            .map((r, i) => `[Memory ${i + 1}] (score: ${r.score.toFixed(3)})\n${r.payload?.text || ""}`)
            .join("\n\n");

        const kbContext = kbResults
            .map((r, i) => `[Knowledge ${i + 1}] (score: ${r.score.toFixed(3)})\n${r.payload?.text || ""}`)
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

        const answer = await callGemini(prompt);

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

            const allTexts = points
                .map((p) => p.payload?.text || "")
                .filter(Boolean);

            const topics = [
                ...new Set(
                    points
                        .map((p) => p.payload?.topic || "")
                        .filter(Boolean)
                ),
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

            const summary = await callGemini(prompt);

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

// POST /api/report — generate report for selected topics
app.post("/api/report", async (req, res) => {
    try {
        const { topics } = req.body;
        if (!topics?.length) {
            return res
                .status(400)
                .json({ success: false, error: "Select at least one topic" });
        }

        const topicStr = topics.join(", ");

        // Embed the topic query
        const queryVec = await embedText(topicStr);

        // Search both collections with higher topK for reports
        const [memResults, kbResults] = await Promise.all([
            searchQdrant(MEMORY_COLLECTION, queryVec, 15),
            searchQdrant(KNOWLEDGE_BASE_COLLECTION, queryVec, 15),
        ]);

        // Also do a filtered scroll for exact topic matches
        const topicFilterResults = [];
        for (const topic of topics) {
            const filtered = await scrollAll(MEMORY_COLLECTION, {
                must: [{ key: "topic", match: { value: topic } }],
            });
            topicFilterResults.push(...filtered);
        }

        // Deduplicate
        const allTexts = new Map();
        for (const r of [...memResults, ...topicFilterResults]) {
            const text = r.payload?.text || "";
            if (text && !allTexts.has(text)) {
                allTexts.set(text, { text, topic: r.payload?.topic, date: r.payload?.date });
            }
        }
        const kbTexts = kbResults
            .map((r) => r.payload?.text || "")
            .filter(Boolean);

        const prompt = `You are a report generator for a personal knowledge management system. Generate a comprehensive, well-structured report based on the user's notes and knowledge base entries.

Selected Topics: ${topicStr}

--- USER'S NOTES ---
${[...allTexts.values()]
                .map((item, i) => `${i + 1}. [${item.topic || "General"} | ${item.date || "Unknown date"}] ${item.text}`)
                .join("\n\n")}

--- KNOWLEDGE BASE ENTRIES ---
${kbTexts.map((t, i) => `${i + 1}. ${t}`).join("\n\n")}

Instructions:
- Generate a professional, detailed report covering the selected topics.
- Organize by topic with clear section headers.
- Include an executive summary at the top.
- Highlight key insights, trends, and important facts.
- Use markdown formatting extensively (headers, bullets, bold, tables where appropriate).
- Include a conclusion section with key takeaways.
- If data is limited for a topic, mention that and provide what's available.`;

        const report = await callGemini(prompt);

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

// ── Start ───────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`✓ Alfred API server running on http://localhost:${PORT}`);
    console.log(`  Qdrant: ${QDRANT_URL ? "configured" : "⚠ MISSING"}`);
    console.log(`  Gemini: ${GEMINI_API_KEY ? "configured" : "⚠ MISSING"}`);
});
