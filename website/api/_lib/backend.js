const COLLECTIONS = {
  topics: "topics",
  memory: "memory",
  knowledgeBase: "knowledge_base",
  dailyReport: "daily report",
  flashcards: "flashcards",
};

const GEMINI_EMBED_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent";
const GEMINI_GENERATE_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

const APPWRITE_SYNC_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_APPWRITE_ENDPOINT = "https://sgp.cloud.appwrite.io/v1";

function env(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  return "";
}

function requireValue(value, message) {
  if (!value) throw new Error(message);
  return value;
}

function getQdrantConfig() {
  const url = env("QDRANT_URL", "EXPO_PUBLIC_QDRANT_URL").replace(/\/+$/, "");
  const apiKey = env("QDRANT_API_KEY", "EXPO_PUBLIC_QDRANT_API_KEY");
  return { url, apiKey };
}

function getGeminiApiKey() {
  return env("GEMINI_API_KEY", "EXPO_PUBLIC_GEMINI_API_KEY");
}

function getAppwriteConfig() {
  return {
    endpoint: env("APPWRITE_ENDPOINT", "EXPO_PUBLIC_APPWRITE_ENDPOINT") || DEFAULT_APPWRITE_ENDPOINT,
    projectId: env("APPWRITE_PROJECT_ID", "EXPO_PUBLIC_APPWRITE_PROJECT_ID"),
    apiKey: env("APPWRITE_API_KEY", "EXPO_PUBLIC_APPWRITE_API_KEY"),
  };
}

function getFunctionId(type) {
  switch (type) {
    case "audio":
      return env("AUDIOFUNCTION_ID", "EXPO_PUBLIC_AUDIOFUNCTION_ID");
    case "image":
      return env("IMAGEFUNCTION_ID", "EXPO_PUBLIC_IMAGEFUNCTION_ID");
    case "clustering":
      return env("CLUSTERINGFUNCTION_ID", "EXPO_PUBLIC_CLUSTERINGFUNCTION_ID");
    case "processSegment":
      return env("PROCESSSEGMENTFUNCTION_ID", "EXPO_PUBLIC_PROCESSSEGMENTFUNCTION_ID");
    case "customReport":
      return env("CUSTOMREPORTFUNCTION_ID", "EXPO_PUBLIC_CUSTOMREPORTFUNCTION_ID");
    default:
      return "";
  }
}

async function qdrantRequest(method, path, body = null) {
  const { url, apiKey } = getQdrantConfig();
  requireValue(url, "QDRANT_URL is not configured");
  requireValue(apiKey, "QDRANT_API_KEY is not configured");

  const response = await fetch(`${url}${path}`, {
    method,
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok && response.status !== 404) {
    const text = await response.text();
    throw new Error(`Qdrant ${response.status}: ${text.slice(0, 400)}`);
  }

  return response;
}

export async function scrollAll(collection, filter = null) {
  const rows = [];
  let offset = null;

  while (true) {
    const requestBody = {
      limit: 100,
      with_payload: true,
    };

    if (offset !== null) requestBody.offset = offset;
    if (filter) requestBody.filter = filter;

    const response = await qdrantRequest(
      "POST",
      `/collections/${encodeURIComponent(collection)}/points/scroll`,
      requestBody,
    );

    if (response.status === 404) return [];

    const json = await response.json();
    const result = json.result || {};
    const points = result.points || [];

    rows.push(...points);

    if (!result.next_page_offset || points.length === 0) break;
    offset = result.next_page_offset;
  }

  return rows;
}

export async function embedText(text) {
  const geminiApiKey = getGeminiApiKey();
  requireValue(geminiApiKey, "GEMINI_API_KEY is not configured");

  const response = await fetch(`${GEMINI_EMBED_URL}?key=${geminiApiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "models/gemini-embedding-001",
      content: { parts: [{ text }] },
    }),
  });

  if (!response.ok) {
    const textResponse = await response.text();
    throw new Error(`Gemini embed ${response.status}: ${textResponse.slice(0, 300)}`);
  }

  const json = await response.json();
  return json.embedding?.values || [];
}

export async function searchQdrant(collection, vector, topK = 5) {
  const response = await qdrantRequest(
    "POST",
    `/collections/${encodeURIComponent(collection)}/points/search`,
    {
      vector,
      limit: topK,
      with_payload: true,
    },
  );

  if (response.status === 404) return [];

  const json = await response.json();
  return json.result || [];
}

export async function callGemini(prompt, retries = 3) {
  const geminiApiKey = getGeminiApiKey();
  requireValue(geminiApiKey, "GEMINI_API_KEY is not configured");

  const boundedPrompt = String(prompt || "").slice(0, 14000);

  for (let attempt = 0; attempt < retries; attempt += 1) {
    const response = await fetch(`${GEMINI_GENERATE_URL}?key=${geminiApiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: boundedPrompt }] }],
        generationConfig: { temperature: 0.4 },
      }),
    });

    if (response.status === 429 && attempt < retries - 1) {
      const waitMs = Math.pow(2, attempt + 1) * 1000;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }

    if (!response.ok) {
      const textResponse = await response.text();
      throw new Error(`Gemini generate ${response.status}: ${textResponse.slice(0, 300)}`);
    }

    const json = await response.json();
    const parts = json.candidates?.[0]?.content?.parts || [];
    return parts.map((p) => p.text || "").join("");
  }

  throw new Error("Gemini generation failed after retries");
}

export async function invokeAppwriteFunction(functionId, payload) {
  requireValue(functionId, "Appwrite function ID is missing");

  const appwrite = getAppwriteConfig();
  requireValue(appwrite.projectId, "APPWRITE_PROJECT_ID is not configured");
  requireValue(appwrite.apiKey, "APPWRITE_API_KEY is not configured");

  const response = await fetch(`${appwrite.endpoint}/functions/${functionId}/executions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Appwrite-Project": appwrite.projectId,
      "X-Appwrite-Key": appwrite.apiKey,
    },
    body: JSON.stringify({
      body: JSON.stringify(payload),
      async: false,
      method: "POST",
    }),
    signal: AbortSignal.timeout(APPWRITE_SYNC_TIMEOUT_MS),
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`Appwrite HTTP ${response.status}: ${raw.slice(0, 300)}`);
  }

  let execution;
  try {
    execution = JSON.parse(raw);
  } catch {
    throw new Error("Appwrite returned non-JSON execution payload");
  }

  if (execution.status !== "completed") {
    throw new Error(`Function execution failed with status: ${execution.status}`);
  }

  const body =
    execution.responseBody ?? execution.response ?? execution.body ?? execution.output ?? "";

  if (!body) {
    throw new Error("Function completed but returned an empty response body");
  }

  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`Function returned non-JSON body: ${String(body).slice(0, 200)}`);
  }
}

export async function fetchTopics() {
  const points = await scrollAll(COLLECTIONS.topics);
  return points
    .map((point) => String(point.payload?.text || "").trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

function splitTopics(rawTopic) {
  return String(rawTopic || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export async function fetchTopicCounts() {
  const [memoryPoints, kbPoints] = await Promise.all([
    scrollAll(COLLECTIONS.memory),
    scrollAll(COLLECTIONS.knowledgeBase),
  ]);

  const counts = {};
  for (const point of [...memoryPoints, ...kbPoints]) {
    const parts = splitTopics(point.payload?.topic);
    for (const topic of parts) {
      const key = topic.toLowerCase();
      counts[key] = (counts[key] || 0) + 1;
    }
  }

  return counts;
}

export async function runChat(message) {
  const query = String(message || "").trim();
  if (!query) throw new Error("Message is required");

  const queryVector = await embedText(query);

  const [memResults, kbResults] = await Promise.all([
    searchQdrant(COLLECTIONS.memory, queryVector, 5),
    searchQdrant(COLLECTIONS.knowledgeBase, queryVector, 5),
  ]);

  const memoryContext = memResults
    .slice(0, 3)
    .map((result, index) => {
      const chunk = String(result.payload?.text || "").slice(0, 2000);
      return `[Memory ${index + 1}] (score: ${Number(result.score || 0).toFixed(3)})\n${chunk}`;
    })
    .join("\n\n");

  const kbContext = kbResults
    .slice(0, 3)
    .map((result, index) => {
      const chunk = String(result.payload?.text || "").slice(0, 2000);
      return `[Knowledge ${index + 1}] (score: ${Number(result.score || 0).toFixed(3)})\n${chunk}`;
    })
    .join("\n\n");

  const topics = [
    ...new Set(
      [...memResults, ...kbResults]
        .map((result) => String(result.payload?.topic || "").trim())
        .filter(Boolean),
    ),
  ];

  const prompt = `You are Alfred, an intelligent assistant that answers questions using the user's personal knowledge base.

Relevant context:

--- USER MEMORIES ---
${memoryContext || "(No relevant memories found)"}

--- KNOWLEDGE BASE ---
${kbContext || "(No relevant knowledge found)"}

User question: ${query}

Instructions:
- Use the provided context whenever possible.
- If information is incomplete, say that clearly.
- Format with markdown for readability.
- Keep the answer concise but complete.`;

  const answer = await callGemini(prompt);
  return { answer, topics };
}

export async function fetchDailyReports() {
  const points = await scrollAll(COLLECTIONS.dailyReport);

  return points.map((point, index) => {
    const payload = point.payload || {};
    return {
      id: String(point.id ?? index + 1),
      topic: String(payload.topic || "Untitled Report"),
      report: String(payload.report || payload.content || payload.text || ""),
      date: payload.date ? String(payload.date) : payload.createdAt ? String(payload.createdAt) : null,
      memoryChunks: Number(payload.memoryChunks || 0),
      kbChunks: Number(payload.kbChunks || 0),
      completed: false,
    };
  });
}

export async function fetchChecklistItems() {
  return fetchDailyReports();
}

export async function fetchFlashcards() {
  const points = await scrollAll(COLLECTIONS.flashcards);

  return points
    .map((point) => ({
      id: String(point.id),
      question: String(point.payload?.question || point.payload?.front || point.payload?.text || ""),
      answer: String(point.payload?.answer || point.payload?.back || ""),
    }))
    .filter((card) => card.question);
}

export async function generateCustomReport(topics) {
  if (!Array.isArray(topics) || topics.length === 0) {
    throw new Error("A non-empty topics array is required");
  }

  const response = await invokeAppwriteFunction(getFunctionId("customReport"), {
    topics,
  });

  if (!response.success) {
    throw new Error(response.error || "Custom report generation failed");
  }

  return {
    report: response.report,
    topics: response.topics || topics,
    stats: {
      memoryPoints: Number(response.memoryChunksUsed || 0),
      knowledgePoints: Number(response.knowledgeBaseChunksUsed || 0),
    },
  };
}

export async function generatePromptReport(promptText, legacyTopics = []) {
  const normalizedPrompt = String(promptText || "").trim();
  const queryText = normalizedPrompt || (Array.isArray(legacyTopics) ? legacyTopics.join(", ") : "");
  if (!queryText) throw new Error("A prompt or topics array is required");

  const queryVector = await embedText(queryText);

  const [memResults, kbResults] = await Promise.all([
    searchQdrant(COLLECTIONS.memory, queryVector, 15),
    searchQdrant(COLLECTIONS.knowledgeBase, queryVector, 15),
  ]);

  const textByContent = new Map();
  for (const result of memResults) {
    const raw = String(result.payload?.text || "").trim();
    if (!raw) continue;
    const text = raw.slice(0, 2000);
    if (!textByContent.has(text)) {
      textByContent.set(text, {
        text,
        topic: String(result.payload?.topic || "General"),
        date: String(result.payload?.date || "Unknown date"),
      });
    }
  }

  const knowledgeEntries = kbResults
    .map((result) => String(result.payload?.text || "").trim().slice(0, 2000))
    .filter(Boolean);

  const prompt = `You are a report generator for a personal knowledge management system.

User request: ${queryText}

--- USER NOTES ---
${[...textByContent.values()]
  .map((entry, index) => `${index + 1}. [${entry.topic} | ${entry.date}] ${entry.text}`)
  .join("\n\n") || "(No relevant notes found)"}

--- KNOWLEDGE BASE ENTRIES ---
${knowledgeEntries.map((entry, index) => `${index + 1}. ${entry}`).join("\n\n") || "(No relevant knowledge base entries found)"}

Instructions:
- Provide an executive summary.
- Organize with clear markdown headings.
- Highlight key insights and takeaways.
- If context is limited, be explicit about it.`;

  const report = await callGemini(prompt);

  return {
    report,
    stats: {
      memoryPoints: textByContent.size,
      knowledgePoints: knowledgeEntries.length,
    },
  };
}

export async function runUploadPipeline(payload) {
  const type = String(payload.type || "").trim().toLowerCase();
  const language = String(payload.language || "en");

  let extractedText = "";

  if (type === "text") {
    extractedText = String(payload.text || "").trim();
    if (!extractedText) throw new Error("Text payload is required");
  } else if (type === "audio") {
    const audioBase64 = String(payload.audioBase64 || "").trim();
    if (!audioBase64) throw new Error("audioBase64 is required for audio uploads");

    const audioRes = await invokeAppwriteFunction(getFunctionId("audio"), {
      audioBase64,
      contentType: String(payload.contentType || "audio/m4a"),
      language,
    });

    if (!audioRes.success) throw new Error(audioRes.error || "Audio transcription failed");
    extractedText = String(audioRes.text || "").trim();
  } else if (type === "image") {
    const imagesBase64 = Array.isArray(payload.imagesBase64) ? payload.imagesBase64 : [];
    if (!imagesBase64.length) {
      throw new Error("imagesBase64 is required for image uploads");
    }

    const texts = [];
    for (const imageBase64 of imagesBase64) {
      const imageRes = await invokeAppwriteFunction(getFunctionId("image"), {
        imageBase64,
        language,
      });

      if (!imageRes.success) {
        throw new Error(imageRes.error || "Image OCR failed");
      }

      const text = String(imageRes.text || "").trim();
      if (text) texts.push(text);
    }

    extractedText = texts.join("\n\n").trim();
  } else {
    throw new Error("type must be one of: text, audio, image");
  }

  if (!extractedText) {
    throw new Error("No text was extracted for processing");
  }

  const clusterResponse = await invokeAppwriteFunction(getFunctionId("clustering"), {
    paragraph: extractedText,
  });

  if (!clusterResponse.success) {
    throw new Error(clusterResponse.error || "Text clustering failed");
  }

  const segments = (clusterResponse.segments || [])
    .map((segment) => String(segment.content || "").trim())
    .filter(Boolean);

  const processResults = await Promise.all(
    segments.map((segment) =>
      invokeAppwriteFunction(getFunctionId("processSegment"), { segment }),
    ),
  );

  const topics = [
    ...new Set(
      processResults
        .flatMap((result) => (Array.isArray(result.topics) ? result.topics : []))
        .map((topicObj) => String(topicObj.topic || "").trim())
        .filter(Boolean),
    ),
  ];

  const summary = {
    memoryStored: processResults.reduce(
      (total, result) => total + Number(result.memoryStored || 0),
      0,
    ),
    knowledgeBaseStored: processResults.reduce(
      (total, result) => total + Number(result.knowledgeBaseStored || 0),
      0,
    ),
    skipped: processResults.filter((result) => result.skipped).length,
    processed: processResults.length,
    segments: segments.length,
  };

  return {
    extractedText,
    topics,
    summary,
    results: processResults,
  };
}
