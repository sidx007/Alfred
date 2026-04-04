import { randomUUID } from "node:crypto";

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
const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";

const APPWRITE_SYNC_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_APPWRITE_ENDPOINT = "https://sgp.cloud.appwrite.io/v1";
const DAILY_FLASHCARD_SOURCE = "daily-reports-groq";
const DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile";

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

function getGroqConfig() {
  return {
    apiKey: env("GROQ_API_KEY", "EXPO_PUBLIC_GROQ_API_KEY"),
    model: env("GROQ_MODEL", "EXPO_PUBLIC_GROQ_MODEL") || DEFAULT_GROQ_MODEL,
  };
}

function getAppwriteConfig() {
  return {
    endpoint:
      env("APPWRITE_ENDPOINT", "EXPO_PUBLIC_APPWRITE_ENDPOINT") ||
      DEFAULT_APPWRITE_ENDPOINT,
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
      return env(
        "PROCESSSEGMENTFUNCTION_ID",
        "EXPO_PUBLIC_PROCESSSEGMENTFUNCTION_ID",
      );
    case "customReport":
      return env(
        "CUSTOMREPORTFUNCTION_ID",
        "EXPO_PUBLIC_CUSTOMREPORTFUNCTION_ID",
      );
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

function inferVectorSize(points) {
  const candidate = Array.isArray(points)
    ? points.find(
        (point) => Array.isArray(point?.vector) && point.vector.length > 0,
      )
    : null;

  const size = Number(candidate?.vector?.length || 0);
  return Number.isInteger(size) && size > 0 ? size : 3072;
}

async function ensureQdrantCollection(collection, vectorSize) {
  const size =
    Number.isInteger(vectorSize) && vectorSize > 0 ? vectorSize : 3072;

  const response = await qdrantRequest(
    "PUT",
    `/collections/${encodeURIComponent(collection)}?wait=true`,
    {
      vectors: {
        size,
        distance: "Cosine",
      },
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Failed to create Qdrant collection '${collection}': ${text.slice(0, 300)}`,
    );
  }

  await response.json();
}

async function upsertPoints(collection, points) {
  if (!Array.isArray(points) || points.length === 0) return;

  let response = await qdrantRequest(
    "PUT",
    `/collections/${encodeURIComponent(collection)}/points?wait=true`,
    { points },
  );

  if (response.status === 404) {
    await ensureQdrantCollection(collection, inferVectorSize(points));
    response = await qdrantRequest(
      "PUT",
      `/collections/${encodeURIComponent(collection)}/points?wait=true`,
      { points },
    );
  }

  if (response.status === 404) {
    throw new Error(`Qdrant collection '${collection}' does not exist`);
  }

  const json = await response.json();
  if (json.status !== "ok") {
    throw new Error("Qdrant upsert failed");
  }
}

async function deletePointsByFilter(collection, filter) {
  if (!filter) return;

  const response = await qdrantRequest(
    "POST",
    `/collections/${encodeURIComponent(collection)}/points/delete?wait=true`,
    { filter },
  );

  if (response.status === 404) return;
  await response.json();
}

async function deletePointsByIds(collection, pointIds) {
  const ids = Array.isArray(pointIds)
    ? pointIds.map((id) => String(id || "").trim()).filter(Boolean)
    : [];
  if (!ids.length) return;

  const response = await qdrantRequest(
    "POST",
    `/collections/${encodeURIComponent(collection)}/points/delete?wait=true`,
    { points: ids },
  );

  if (response.status === 404) return;
  await response.json();
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
    throw new Error(
      `Gemini embed ${response.status}: ${textResponse.slice(0, 300)}`,
    );
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
      throw new Error(
        `Gemini generate ${response.status}: ${textResponse.slice(0, 300)}`,
      );
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

  const response = await fetch(
    `${appwrite.endpoint}/functions/${functionId}/executions`,
    {
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
    },
  );

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
    throw new Error(
      `Function execution failed with status: ${execution.status}`,
    );
  }

  const body =
    execution.responseBody ??
    execution.response ??
    execution.body ??
    execution.output ??
    "";

  if (!body) {
    throw new Error("Function completed but returned an empty response body");
  }

  try {
    return JSON.parse(body);
  } catch {
    throw new Error(
      `Function returned non-JSON body: ${String(body).slice(0, 200)}`,
    );
  }
}

export async function fetchTopics() {
  const points = await scrollAll(COLLECTIONS.topics);
  return points
    .map((point) => String(point.payload?.text || "").trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

function formatLocalDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function normalizeDateKey(rawDate) {
  const value = String(rawDate || "").trim();
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return value.slice(0, 10);
  return formatLocalDateKey(value);
}

function truncateText(value, maxChars) {
  const source = String(value || "").trim();
  if (source.length <= maxChars) return source;
  return `${source.slice(0, maxChars)}...`;
}

function hashSignature(parts) {
  const joined = Array.isArray(parts) ? parts.join("||") : String(parts || "");
  let hash = 2166136261;
  for (let idx = 0; idx < joined.length; idx += 1) {
    hash ^= joined.charCodeAt(idx);
    hash +=
      (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return `sig-${(hash >>> 0).toString(16)}`;
}

function createQdrantPointId(index = 0) {
  try {
    return randomUUID();
  } catch {
    // Fallback for runtimes without randomUUID support.
    return Date.now() * 1000 + (index % 1000);
  }
}

function buildReportSignature(reports) {
  const stable = [...reports]
    .map((report) => {
      return [
        String(report.id || ""),
        String(report.topic || ""),
        truncateText(report.report || "", 1800),
        String(report.date || ""),
      ].join("|");
    })
    .sort();

  return hashSignature(stable);
}

function isValidFlashcard(card) {
  if (!card || typeof card !== "object") return false;
  const question = String(card.question || "").trim();
  const answer = String(card.answer || "").trim();
  return question.length >= 8 && answer.length >= 8;
}

function toFlashcard(card, index) {
  return {
    id: String(card.id || `card-${index + 1}`),
    question: String(card.question || "").trim(),
    answer: String(card.answer || "").trim(),
  };
}

function parseGroqFlashcards(rawText) {
  const source = String(rawText || "").trim();
  if (!source) return [];

  let jsonText = source;
  const fenced = source.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) jsonText = fenced[1].trim();

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    const objectMatch = jsonText.match(/\{[\s\S]*\}/);
    if (!objectMatch) {
      throw new Error("Groq returned invalid JSON for flashcards");
    }
    parsed = JSON.parse(objectMatch[0]);
  }

  const cards = Array.isArray(parsed?.flashcards) ? parsed.flashcards : [];
  const unique = new Map();

  cards
    .filter(isValidFlashcard)
    .map((card, index) => toFlashcard(card, index))
    .forEach((card) => {
      const key = card.question.toLowerCase();
      if (!unique.has(key)) unique.set(key, card);
    });

  return [...unique.values()].slice(0, 24);
}

function buildFlashcardPrompt(todayReports, dateKey) {
  const reportContext = todayReports
    .map((report, index) => {
      const topic = String(report.topic || "Untitled").trim();
      const body = truncateText(report.report || "", 2400);
      return `Report ${index + 1} | Topic: ${topic}\n${body}`;
    })
    .join("\n\n---\n\n");

  return `Generate high-utility study flashcards from today's reports.

Date: ${dateKey}

Return ONLY valid JSON with this exact schema:
{
  "flashcards": [
    {
      "question": "...",
      "answer": "..."
    }
  ]
}

Rules:
- Produce 12 to 20 flashcards.
- Questions must test understanding, not rote definitions.
- Avoid duplicate questions and avoid yes/no questions.
- Answers should be concise (1-4 sentences) and grounded in the provided context.
- Cover key insights, mechanisms, tradeoffs, and actionable takeaways.
- Do not invent facts outside the reports.

Today's report context:
${reportContext}`;
}

async function callGroqForFlashcards(todayReports, dateKey) {
  const groq = getGroqConfig();
  requireValue(groq.apiKey, "GROQ_API_KEY is not configured");

  const prompt = buildFlashcardPrompt(todayReports, dateKey);
  const response = await fetch(GROQ_CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${groq.apiKey}`,
    },
    body: JSON.stringify({
      model: groq.model,
      temperature: 0.25,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are an expert learning coach that writes clear and practical active-recall flashcards.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Groq ${response.status}: ${text.slice(0, 300)}`);
  }

  const json = await response.json();
  const content = json?.choices?.[0]?.message?.content || "";
  const flashcards = parseGroqFlashcards(content);

  if (flashcards.length < 6) {
    throw new Error("Groq returned too few usable flashcards");
  }

  return flashcards;
}

function selectActiveReportBatch(reports) {
  const now = new Date();
  const localDateKey = formatLocalDateKey(now);
  const utcDateKey = now.toISOString().slice(0, 10);

  const reportsByDate = new Map();
  const reportsWithoutDate = [];

  for (const report of reports) {
    const key = normalizeDateKey(report.date);
    if (!key) {
      reportsWithoutDate.push(report);
      continue;
    }
    if (!reportsByDate.has(key)) reportsByDate.set(key, []);
    reportsByDate.get(key).push(report);
  }

  if (reportsByDate.has(localDateKey)) {
    return { dateKey: localDateKey, reports: reportsByDate.get(localDateKey) };
  }

  if (reportsByDate.has(utcDateKey)) {
    return { dateKey: utcDateKey, reports: reportsByDate.get(utcDateKey) };
  }

  if (reportsByDate.size > 0) {
    const latestDateKey = [...reportsByDate.keys()].sort().at(-1);
    return {
      dateKey: latestDateKey,
      reports: reportsByDate.get(latestDateKey) || [],
    };
  }

  if (reportsWithoutDate.length > 0) {
    return { dateKey: localDateKey, reports: reportsWithoutDate };
  }

  return { dateKey: localDateKey, reports: [] };
}

async function getTodayReportSnapshot() {
  const reports = await fetchDailyReports();
  const batch = selectActiveReportBatch(reports);
  const todayReports = batch.reports;
  const dateKey = batch.dateKey;
  const signature = buildReportSignature(todayReports);
  return { dateKey, todayReports, signature };
}

async function fetchCachedDailyFlashcards(dateKey, signature) {
  const points = await scrollAll(COLLECTIONS.flashcards);
  return points
    .map((point) => {
      const payload = point.payload || {};
      return {
        id: String(point.id),
        question: String(payload.question || "").trim(),
        answer: String(payload.answer || "").trim(),
        order: Number(payload.order || 0),
        sourceType: String(payload.sourceType || ""),
        sourceDate: String(payload.sourceDate || ""),
        sourceSignature: String(payload.sourceSignature || ""),
      };
    })
    .filter(
      (card) =>
        card.question &&
        card.sourceType === DAILY_FLASHCARD_SOURCE &&
        card.sourceDate === dateKey &&
        card.sourceSignature === signature,
    )
    .sort((a, b) => a.order - b.order)
    .map(({ id, question, answer }) => ({ id, question, answer }));
}

async function clearDailyFlashcardsForDate(dateKey) {
  const points = await scrollAll(COLLECTIONS.flashcards);
  const toDelete = points
    .filter((point) => {
      const payload = point.payload || {};
      return (
        String(payload.sourceType || "") === DAILY_FLASHCARD_SOURCE &&
        String(payload.sourceDate || "") === dateKey
      );
    })
    .map((point) => String(point.id || ""))
    .filter(Boolean);

  await deletePointsByIds(COLLECTIONS.flashcards, toDelete);
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
      date: payload.date
        ? String(payload.date)
        : payload.createdAt
          ? String(payload.createdAt)
          : null,
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
  const { dateKey, todayReports, signature } = await getTodayReportSnapshot();
  if (!todayReports.length) return [];
  if (!signature) return [];
  return fetchCachedDailyFlashcards(dateKey, signature);
}

export async function generateDailyFlashcards() {
  const { dateKey, todayReports, signature } = await getTodayReportSnapshot();

  if (!todayReports.length) {
    throw new Error(
      "No reports found for today. Generate today's reports first.",
    );
  }

  if (!signature) {
    throw new Error("Unable to build report signature for today's reports.");
  }

  const cached = await fetchCachedDailyFlashcards(dateKey, signature);
  if (cached.length) {
    return { flashcards: cached, cached: true };
  }

  const generated = await callGroqForFlashcards(todayReports, dateKey);

  await clearDailyFlashcardsForDate(dateKey);

  const generatedAt = new Date().toISOString();
  const points = await Promise.all(
    generated.map(async (card, index) => {
      const contentForVector = `${card.question}\n\n${card.answer}`;
      const vector = await embedText(contentForVector);
      return {
        id: createQdrantPointId(index),
        vector,
        payload: {
          question: card.question,
          answer: card.answer,
          order: index,
          sourceType: DAILY_FLASHCARD_SOURCE,
          sourceDate: dateKey,
          sourceSignature: signature,
          generatedAt,
          reportCount: todayReports.length,
        },
      };
    }),
  );

  await upsertPoints(COLLECTIONS.flashcards, points);

  return {
    flashcards: generated.map((card, index) => ({
      id: points[index].id,
      question: card.question,
      answer: card.answer,
    })),
    cached: false,
  };
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
  const queryText =
    normalizedPrompt ||
    (Array.isArray(legacyTopics) ? legacyTopics.join(", ") : "");
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
    .map((result) =>
      String(result.payload?.text || "")
        .trim()
        .slice(0, 2000),
    )
    .filter(Boolean);

  const prompt = `You are a report generator for a personal knowledge management system.

User request: ${queryText}

--- USER NOTES ---
${
  [...textByContent.values()]
    .map(
      (entry, index) =>
        `${index + 1}. [${entry.topic} | ${entry.date}] ${entry.text}`,
    )
    .join("\n\n") || "(No relevant notes found)"
}

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
  const type = String(payload.type || "")
    .trim()
    .toLowerCase();
  const language = String(payload.language || "en");

  let extractedText = "";

  if (type === "text") {
    extractedText = String(payload.text || "").trim();
    if (!extractedText) throw new Error("Text payload is required");
  } else if (type === "audio") {
    const audioBase64 = String(payload.audioBase64 || "").trim();
    if (!audioBase64)
      throw new Error("audioBase64 is required for audio uploads");

    const audioRes = await invokeAppwriteFunction(getFunctionId("audio"), {
      audioBase64,
      contentType: String(payload.contentType || "audio/m4a"),
      language,
    });

    if (!audioRes.success)
      throw new Error(audioRes.error || "Audio transcription failed");
    extractedText = String(audioRes.text || "").trim();
  } else if (type === "image") {
    const imagesBase64 = Array.isArray(payload.imagesBase64)
      ? payload.imagesBase64
      : [];
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

  const clusterResponse = await invokeAppwriteFunction(
    getFunctionId("clustering"),
    {
      paragraph: extractedText,
    },
  );

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
        .flatMap((result) =>
          Array.isArray(result.topics) ? result.topics : [],
        )
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
