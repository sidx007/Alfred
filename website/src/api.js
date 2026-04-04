const BASE = "/api";

async function request(path, { method = "GET", body } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const raw = await response.text();
  let data = {};

  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`API ${path} returned non-JSON response`);
  }

  if (!response.ok || data.success === false) {
    throw new Error(data.error || `API request failed (${response.status})`);
  }

  return data;
}

export async function fetchTopics() {
  const data = await request("/topics");
  return data.topics || [];
}

export async function fetchTopicCounts() {
  const data = await request("/topic-counts");
  return data.counts || {};
}

export async function sendChatMessage(message) {
  const data = await request("/chat", {
    method: "POST",
    body: { message },
  });
  return {
    answer: data.answer || "",
    topics: data.topics || [],
  };
}

export async function fetchDailyReportTasks() {
  const data = await request("/daily-report");
  return data.reports || [];
}

export async function fetchChecklistItems() {
  const data = await request("/checklist");
  return data.items || [];
}

export async function fetchFlashcards() {
  const data = await request("/flashcards");
  return data.flashcards || [];
}

export async function generateFlashcardsFromTodayReports() {
  const data = await request("/flashcards", {
    method: "POST",
  });
  return {
    flashcards: data.flashcards || [],
    cached: Boolean(data.cached),
  };
}

export async function generateCustomReport(topics) {
  const data = await request("/custom-report", {
    method: "POST",
    body: { topics },
  });
  return {
    report: data.report || "",
    topics: data.topics || topics,
    stats: data.stats || { memoryPoints: 0, knowledgePoints: 0 },
  };
}

export async function generateReport(prompt, topics = []) {
  const data = await request("/report", {
    method: "POST",
    body: { prompt, topics },
  });
  return {
    report: data.report || "",
    stats: data.stats || { memoryPoints: 0, knowledgePoints: 0 },
  };
}

export async function runUploadPipeline(payload) {
  const data = await request("/upload", {
    method: "POST",
    body: payload,
  });

  return {
    extractedText: data.extractedText || "",
    topics: data.topics || [],
    summary: data.summary || {
      memoryStored: 0,
      knowledgeBaseStored: 0,
      skipped: 0,
      processed: 0,
      segments: 0,
    },
    results: data.results || [],
  };
}
