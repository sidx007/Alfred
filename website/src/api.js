// ── Frontend API client — calls the Express proxy ───────────────────

const BASE = "/api";

export async function fetchTopics() {
    const res = await fetch(`${BASE}/topics`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "Failed to fetch topics");
    return data.topics;
}

export async function sendChatMessage(message) {
    const res = await fetch(`${BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "Chat failed");
    return { answer: data.answer, topics: data.topics || [] };
}

export async function fetchRevisions() {
    const res = await fetch(`${BASE}/revision`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "Revision fetch failed");
    return data.revisions;
}

export async function generateReport(topics) {
    const res = await fetch(`${BASE}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topics }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "Report generation failed");
    return { report: data.report, stats: data.stats };
}
