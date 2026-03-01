// ── Frontend API client — calls the Express proxy ───────────────────

const BASE = "/api";

export async function fetchTopics() {
  const res = await fetch(`${BASE}/topics`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Failed to fetch topics");
  return data.topics;
}

export async function fetchTopicCounts() {
  const res = await fetch(`${BASE}/topic-counts`);
  const data = await res.json();
  if (!data.success)
    throw new Error(data.error || "Failed to fetch topic counts");
  return data.counts; // { "TopicName": 5, ... }
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

export async function fetchDailyReport() {
  const res = await fetch(`${BASE}/daily-report`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Daily report fetch failed");
  return { report: data.report, date: data.date };
}

export async function generateReport(prompt) {
  const res = await fetch(`${BASE}/report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Report generation failed");
  return { report: data.report, stats: data.stats };
}

export async function sendVoiceMessage(audioBlob) {
  const formData = new FormData();
  formData.append("audio", audioBlob);

  try {
    const res = await fetch(`${BASE}/voice-chat`, {
      method: "POST",
      body: formData,
    });

    const contentType = res.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      const text = await res.text();
      console.error("Non-JSON response from server:", text.slice(0, 500));
      throw new Error(
        `Server returned an invalid response (${res.status}). Please check if the backend is running.`,
      );
    }

    const data = await res.json();
    if (!data.success) throw new Error(data.error || "Voice chat failed");
    return {
      transcript: data.transcript,
      answer: data.answer,
      audioBase64: data.audio,
    };
  } catch (err) {
    console.error("sendVoiceMessage error:", err);
    throw err;
  }
}
