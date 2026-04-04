// ── Alfred API client — talks directly to Qdrant Cloud + Gemini ─────
// No web-server proxy needed. Qdrant & Gemini credentials from env.

import { invokeFunction } from "./appwrite";

import Constants from "expo-constants";

const _extra = Constants.expoConfig?.extra ?? {};

const QDRANT_URL = (
  process.env.EXPO_PUBLIC_QDRANT_URL ??
  (_extra.EXPO_PUBLIC_QDRANT_URL as string) ??
  ""
).replace(/\/+$/, "");
const QDRANT_API_KEY =
  process.env.EXPO_PUBLIC_QDRANT_API_KEY ??
  (_extra.EXPO_PUBLIC_QDRANT_API_KEY as string) ??
  "";
const GEMINI_API_KEY =
  process.env.EXPO_PUBLIC_GEMINI_API_KEY ??
  (_extra.EXPO_PUBLIC_GEMINI_API_KEY as string) ??
  "";

console.log(
  `[alfredApi] QDRANT_URL=${QDRANT_URL ? QDRANT_URL.slice(0, 30) + "..." : "(empty)"}, API_KEY=${QDRANT_API_KEY ? "set" : "(empty)"}, GEMINI=${GEMINI_API_KEY ? "set" : "(empty)"}`,
);

const DAILY_REPORT_COLLECTION = "daily report";
const FLASHCARDS_COLLECTION = "flashcards";
const TOPICS_COLLECTION = "topics";
const MEMORY_COLLECTION = "memory";
const KNOWLEDGE_BASE_COLLECTION = "knowledge_base";

const GEMINI_EMBED_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent";
const GEMINI_GENERATE_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

const CUSTOM_REPORT_FN = process.env.EXPO_PUBLIC_CUSTOMREPORTFUNCTION_ID ?? "";

// ── Qdrant helpers ──────────────────────────────────────────────────

interface QdrantPoint {
  id: string | number;
  payload?: Record<string, unknown>;
}

async function qdrantScroll(collection: string): Promise<QdrantPoint[]> {
  if (!QDRANT_URL || !QDRANT_API_KEY) {
    throw new Error(
      "Qdrant not configured — set EXPO_PUBLIC_QDRANT_URL and EXPO_PUBLIC_QDRANT_API_KEY",
    );
  }

  const points: QdrantPoint[] = [];
  let offset: string | number | null = null;

  while (true) {
    const body: Record<string, unknown> = { limit: 100, with_payload: true };
    if (offset !== null) body.offset = offset;

    const res = await fetch(
      `${QDRANT_URL}/collections/${encodeURIComponent(collection)}/points/scroll`,
      {
        method: "POST",
        headers: {
          "api-key": QDRANT_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );

    if (res.status === 404) return []; // collection doesn't exist yet
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Qdrant ${res.status}: ${text.slice(0, 300)}`);
    }

    const data =
      (
        (await res.json()) as {
          result?: {
            points?: QdrantPoint[];
            next_page_offset?: string | number;
          };
        }
      ).result ?? {};
    const pts = data.points ?? [];
    points.push(...pts);

    const next = data.next_page_offset;
    if (next == null || !pts.length) break;
    offset = next;
  }

  return points;
}

// ── Interfaces ──────────────────────────────────────────────────────

export interface Flashcard {
  id: string;
  question: string;
  answer: string;
}

export interface ChecklistItem {
  id: string;
  task: string;
  completed: boolean;
}

/** Full daily-report task with all Qdrant payload fields. */
export interface DailyReportTask {
  id: string;
  topic: string;
  report: string;
  date: string | null;
  memoryChunks: number;
  kbChunks: number;
  completed: boolean;
}

// ── Fetch functions ─────────────────────────────────────────────────

/**
 * Fetch flashcards directly from the Qdrant flashcards collection.
 */
export async function fetchFlashcards(): Promise<Flashcard[]> {
  const points = await qdrantScroll(FLASHCARDS_COLLECTION);
  return points
    .map((pt) => {
      const p = pt.payload ?? {};
      return {
        id: String(pt.id),
        question: String(p.question ?? p.front ?? p.text ?? ""),
        answer: String(p.answer ?? p.back ?? ""),
      };
    })
    .filter((f) => f.question);
}

/**
 * Fetch today's daily report topics as simple checklist items.
 */
export async function fetchChecklist(): Promise<ChecklistItem[]> {
  const points = await qdrantScroll(DAILY_REPORT_COLLECTION);
  return points.map((pt, idx) => {
    const p = pt.payload ?? {};
    return {
      id: String(idx + 1),
      task: String(p.topic ?? "Untitled Report"),
      completed: false,
    };
  });
}

/**
 * Fetch daily reports with full payload from the Qdrant daily-report collection.
 * Each chunk becomes one task named after its topic.
 */
export async function fetchDailyReportTasks(): Promise<DailyReportTask[]> {
  const points = await qdrantScroll(DAILY_REPORT_COLLECTION);
  return points.map((pt, idx) => {
    const p = pt.payload ?? {};
    return {
      id: String(idx + 1),
      topic: String(p.topic ?? "Untitled Report"),
      report: String(p.report ?? p.content ?? p.text ?? ""),
      date: p.date ? String(p.date) : p.createdAt ? String(p.createdAt) : null,
      memoryChunks: Number(p.memoryChunks ?? 0),
      kbChunks: Number(p.kbChunks ?? 0),
      completed: false,
    };
  });
}

// ── Gemini helpers ──────────────────────────────────────────────────

async function embedText(text: string): Promise<number[]> {
  const res = await fetch(`${GEMINI_EMBED_URL}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "models/gemini-embedding-001",
      content: { parts: [{ text }] },
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini embed ${res.status}: ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.embedding.values;
}

async function searchQdrant(
  collection: string,
  vector: number[],
  topK = 5,
): Promise<{ payload: Record<string, unknown>; score: number }[]> {
  if (!QDRANT_URL || !QDRANT_API_KEY) return [];
  const res = await fetch(
    `${QDRANT_URL}/collections/${encodeURIComponent(collection)}/points/search`,
    {
      method: "POST",
      headers: {
        "api-key": QDRANT_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ vector, limit: topK, with_payload: true }),
    },
  );
  if (res.status === 404) return [];
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Qdrant search ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  return (data.result ?? []) as {
    payload: Record<string, unknown>;
    score: number;
  }[];
}

async function callGemini(prompt: string): Promise<string> {
  const res = await fetch(`${GEMINI_GENERATE_URL}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4 },
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini LLM ${res.status}: ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  const candidates = data.candidates ?? [];
  if (!candidates.length) return "";
  const parts = candidates[0].content?.parts ?? [];
  return parts.map((p: { text?: string }) => p.text ?? "").join("");
}

// ── Chat (RAG pipeline) ────────────────────────────────────────────

export interface ChatResponse {
  answer: string;
  topics: string[];
}

/**
 * Send a chat message: embed → vector-search Qdrant → call Gemini LLM.
 */
export async function sendChatMessage(message: string): Promise<ChatResponse> {
  // 1. Embed the user query
  const queryVec = await embedText(message);

  // 2. Search memory + knowledge_base
  const [memResults, kbResults] = await Promise.all([
    searchQdrant(MEMORY_COLLECTION, queryVec, 5),
    searchQdrant(KNOWLEDGE_BASE_COLLECTION, queryVec, 5),
  ]);

  // 3. Build context
  const MAX_ENTRY_CHARS = 2000;
  const MAX_ENTRIES = 3;

  const memoryContext = memResults
    .slice(0, MAX_ENTRIES)
    .map((r, i) => {
      let text = String(r.payload?.text ?? "");
      if (text.length > MAX_ENTRY_CHARS)
        text = text.slice(0, MAX_ENTRY_CHARS) + "\n...[truncated]";
      return `[Memory ${i + 1}] (score: ${r.score.toFixed(3)})\n${text}`;
    })
    .join("\n\n");

  const kbContext = kbResults
    .slice(0, MAX_ENTRIES)
    .map((r, i) => {
      let text = String(r.payload?.text ?? "");
      if (text.length > MAX_ENTRY_CHARS)
        text = text.slice(0, MAX_ENTRY_CHARS) + "\n...[truncated]";
      return `[Knowledge ${i + 1}] (score: ${r.score.toFixed(3)})\n${text}`;
    })
    .join("\n\n");

  const topics = [
    ...new Set([
      ...memResults.map((r) => String(r.payload?.topic ?? "")).filter(Boolean),
      ...kbResults.map((r) => String(r.payload?.topic ?? "")).filter(Boolean),
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
  return { answer, topics };
}

// ── Topics ──────────────────────────────────────────────────────────

/**
 * Fetch all topic names from the Qdrant topics collection.
 */
export async function fetchTopics(): Promise<string[]> {
  const points = await qdrantScroll(TOPICS_COLLECTION);
  return points
    .map((pt) => String(pt.payload?.text ?? ""))
    .filter(Boolean)
    .sort();
}

// ── Custom report (via Appwrite function) ───────────────────────────

export interface CustomReportResponse {
  success: boolean;
  report: string;
  topics?: string[];
  memoryChunksUsed?: number;
  knowledgeBaseChunksUsed?: number;
  error?: string;
}

/**
 * Generate a custom report for the given topics via the Appwrite cloud function.
 */
export async function generateCustomReport(topics: string[]): Promise<{
  report: string;
  stats: { memoryPoints: number; knowledgePoints: number };
}> {
  const res = await invokeFunction<CustomReportResponse>(CUSTOM_REPORT_FN, {
    topics,
  });
  if (!res.success) {
    throw new Error(res.error ?? "Custom report generation failed");
  }
  return {
    report: res.report,
    stats: {
      memoryPoints: res.memoryChunksUsed ?? 0,
      knowledgePoints: res.knowledgeBaseChunksUsed ?? 0,
    },
  };
}
