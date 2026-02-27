// ── Alfred API client for mobile app ────────────────────────────────
// Calls the Alfred web server (proxy) for Qdrant-backed data so that
// Qdrant credentials are never shipped in the mobile bundle.
//
// Configure EXPO_PUBLIC_ALFRED_API_URL (not a secret) in your .env:
//   EXPO_PUBLIC_ALFRED_API_URL=https://your-alfred-server.example.com

const ALFRED_API_URL = (
  process.env.EXPO_PUBLIC_ALFRED_API_URL ?? ""
).replace(/\/+$/, "");

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

/**
 * Fetch flashcards from the Alfred API server.
 * Returns an empty array if the server is not configured or unreachable.
 */
export async function fetchFlashcards(): Promise<Flashcard[]> {
  if (!ALFRED_API_URL) return [];
  const res = await fetch(`${ALFRED_API_URL}/api/flashcards`);
  if (!res.ok) throw new Error(`Alfred API ${res.status}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Failed to fetch flashcards");
  return data.flashcards as Flashcard[];
}

/**
 * Fetch checklist items from the Alfred API server.
 * Returns an empty array if the server is not configured or unreachable.
 */
export async function fetchChecklist(): Promise<ChecklistItem[]> {
  if (!ALFRED_API_URL) return [];
  const res = await fetch(`${ALFRED_API_URL}/api/checklist`);
  if (!res.ok) throw new Error(`Alfred API ${res.status}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Failed to fetch checklist");
  return data.items as ChecklistItem[];
}
