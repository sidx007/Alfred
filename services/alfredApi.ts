// ── Alfred API client — talks directly to Qdrant Cloud ──────────────
// No web-server proxy needed. Qdrant credentials are read from env.

const QDRANT_URL = (process.env.EXPO_PUBLIC_QDRANT_URL ?? "").replace(
  /\/+$/,
  "",
);
const QDRANT_API_KEY = process.env.EXPO_PUBLIC_QDRANT_API_KEY ?? "";

console.log(
  `[alfredApi] QDRANT_URL=${QDRANT_URL ? QDRANT_URL.slice(0, 30) + "..." : "(empty)"}, API_KEY=${QDRANT_API_KEY ? "set" : "(empty)"}`,
);

const DAILY_REPORT_COLLECTION = "daily report";
const FLASHCARDS_COLLECTION = "flashcards";

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
