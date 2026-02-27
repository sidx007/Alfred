// ── Qdrant direct-access helper for mobile app ──────────────────────
// Reads EXPO_PUBLIC_QDRANT_URL and EXPO_PUBLIC_QDRANT_API_KEY from env.

const QDRANT_URL = (
  process.env.EXPO_PUBLIC_QDRANT_URL ?? ""
).replace(/\/+$/, "");
const QDRANT_API_KEY = process.env.EXPO_PUBLIC_QDRANT_API_KEY ?? "";

export interface QdrantPoint {
  id: string | number;
  payload: Record<string, unknown>;
}

/**
 * Scrolls through all points in a Qdrant collection and returns them.
 * Returns an empty array if the collection does not exist or Qdrant is
 * not configured.
 */
export async function scrollQdrantCollection(
  collection: string,
): Promise<QdrantPoint[]> {
  if (!QDRANT_URL) return [];

  const points: QdrantPoint[] = [];
  let offset: string | number | null = null;

  while (true) {
    const body: Record<string, unknown> = { limit: 100, with_payload: true };
    if (offset !== null) body.offset = offset;

    const res = await fetch(
      `${QDRANT_URL}/collections/${collection}/points/scroll`,
      {
        method: "POST",
        headers: {
          "api-key": QDRANT_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );

    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`Qdrant ${res.status}`);

    const data = await res.json();
    const result = (data.result ?? {}) as {
      points?: QdrantPoint[];
      next_page_offset?: string | number | null;
    };
    const pts = result.points ?? [];
    points.push(...pts);

    const next = result.next_page_offset;
    if (next == null || pts.length === 0) break;
    offset = next;
  }

  return points;
}
