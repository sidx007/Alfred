import json
import hashlib
import os
import uuid
import datetime
import requests

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
MODEL = "llama-3.1-8b-instant"

GEMINI_EMBED_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001"
GEMINI_GENERATE_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent"
EMBED_DIM = 3072

TOPICS_COLLECTION = "topics"
MEMORY_COLLECTION = "memory"
KNOWLEDGE_BASE_COLLECTION = "knowledge_base"

SYSTEM_PROMPT = """You are a topic classification engine for a learning app.

You will receive:
1. "segment": a text passage the user just learned.
2. "existingTopics": a JSON array of current topic names.
Your job: Assign the MINIMUM number of core topics required to accurately categorize the segment. 

Decision rules (apply in strict order):
1. Hierarchy Resolution (No Overlap): If multiple topics apply but have a parent/child relationship (e.g., "Business" and "Financial Statements", or "Science" and "Biology"), you MUST assign ONLY the single, broadest parent topic. 
2. Mutual Exclusivity: Each assigned topic must represent a completely distinct, non-overlapping domain. 
3. Reuse First: If an existing topic in the array captures the core theme, use it exactly as-is. Do not create a new topic if an existing one is a 70%+ match.
4. New Topic Creation: Only create a new topic if no existing topic applies. New topics must be 2-5 words, Title Case, and represent broad, highly reusable macro-categories (e.g., "Corporate Finance", not "QonQ Revenue Growth").
5. Fallback: If the segment is empty, gibberish, or unclassifiable, return: {"topics": [{"topic": "Uncategorized", "isNew": false}]}

Return ONLY valid JSON — no markdown, no explanation:
{
  "topics": [
    {"topic": "<topic name>", "isNew": true | false}
  ]
}
"""

SEARCH_PROMPT_TEMPLATE = """You are a research assistant. Given a text passage and its classified topics, retrieve detailed, relevant, and accurate information that expands on the passage's content.

Topics: {topics}

Passage:
{segment}

Provide a comprehensive, well-structured summary of relevant information about this topic. Focus on facts, definitions, key concepts, and recent developments. Be thorough but concise."""


# ── Helpers ──────────────────────────────────────────────────────────

def _scroll_all_topics(qdrant_url: str, qdrant_key: str) -> list[str]:
    """Scroll through all points in the topics collection and return topic names."""
    headers = {"api-key": qdrant_key, "Content-Type": "application/json"}
    topics = []
    offset = None

    while True:
        body = {"limit": 100, "with_payload": True}
        if offset is not None:
            body["offset"] = offset

        resp = requests.post(
            f"{qdrant_url}/collections/{TOPICS_COLLECTION}/points/scroll",
            headers=headers,
            json=body,
            timeout=15,
        )

        # Collection may not exist yet — return empty list
        if resp.status_code == 404:
            return []
        resp.raise_for_status()

        data = resp.json().get("result", {})
        points = data.get("points", [])

        for pt in points:
            text = pt.get("payload", {}).get("text", "")
            if text:
                topics.append(text)

        next_offset = data.get("next_page_offset")
        if next_offset is None or not points:
            break
        offset = next_offset

    return topics


def _call_groq(segment: str, existing_topics: list[str], api_key: str) -> dict:
    """Ask Llama to label the segment given existing topics."""
    user_content = (
        f"Text segment:\n{segment}\n\n"
        f"Existing topics:\n{json.dumps(existing_topics)}"
    )
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
    }

    resp = requests.post(GROQ_API_URL, headers=headers, json=payload, timeout=60)
    resp.raise_for_status()

    content = resp.json()["choices"][0]["message"]["content"]
    return json.loads(content)


def _search_with_gemini(segment: str, topics: list[str], api_key: str) -> str:
    """Call Gemini 2.0 Flash with Google Search grounding to retrieve relevant info."""
    topic_str = ", ".join(topics) if topics else "General"
    prompt = SEARCH_PROMPT_TEMPLATE.format(topics=topic_str, segment=segment)

    payload = {
        "contents": [
            {
                "parts": [{"text": prompt}]
            }
        ],
        "tools": [
            {"google_search": {}}
        ],
    }

    resp = requests.post(
        GEMINI_GENERATE_URL,
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": api_key,
        },
        json=payload,
        timeout=90,
    )
    resp.raise_for_status()

    data = resp.json()
    candidates = data.get("candidates", [])
    if not candidates:
        return ""

    parts = candidates[0].get("content", {}).get("parts", [])
    return "".join(p.get("text", "") for p in parts)


def _embed_texts_batch(texts: list[str], api_key: str) -> list[list[float]]:
    """Embed multiple text strings via Gemini batch API."""
    if not texts:
        return []
    requests_body = [
        {
            "model": "models/gemini-embedding-001",
            "content": {"parts": [{"text": t}]},
        }
        for t in texts
    ]
    resp = requests.post(
        f"{GEMINI_EMBED_URL}:batchEmbedContents",
        params={"key": api_key},
        headers={"Content-Type": "application/json"},
        json={"requests": requests_body},
        timeout=60,
    )
    resp.raise_for_status()
    return [e["values"] for e in resp.json()["embeddings"]]


def _ensure_collection(qdrant_url: str, qdrant_key: str, collection_name: str):
    """Create a Qdrant collection if it does not already exist."""
    headers = {"api-key": qdrant_key, "Content-Type": "application/json"}

    check = requests.get(
        f"{qdrant_url}/collections/{collection_name}", headers=headers, timeout=10
    )
    if check.status_code == 200:
        return

    create_resp = requests.put(
        f"{qdrant_url}/collections/{collection_name}",
        headers=headers,
        json={"vectors": {"size": EMBED_DIM, "distance": "Cosine"}},
        timeout=15,
    )
    create_resp.raise_for_status()


def _deterministic_id(collection: str, text: str) -> str:
    """Generate a deterministic UUID from collection name + text content.
    Same input always produces the same ID, so Qdrant upsert overwrites
    instead of creating duplicates."""
    key = f"{collection}::{text}"
    return str(uuid.uuid5(uuid.NAMESPACE_DNS, key))


def _upsert_to_collection(
    qdrant_url: str,
    qdrant_key: str,
    collection: str,
    texts: list[str],
    vectors: list[list[float]],
    metadata_list: list[dict],
) -> int:
    """Upsert embedded points into a Qdrant collection. Returns count of points upserted."""
    points = []
    for i, (text, vec) in enumerate(zip(texts, vectors)):
        payload = {"text": text}
        if i < len(metadata_list):
            payload.update(metadata_list[i])
        points.append(
            {
                "id": _deterministic_id(collection, text),
                "vector": vec,
                "payload": payload,
            }
        )

    resp = requests.put(
        f"{qdrant_url}/collections/{collection}/points",
        headers={"api-key": qdrant_key, "Content-Type": "application/json"},
        json={"points": points},
        timeout=30,
    )
    resp.raise_for_status()
    return len(points)


def _upsert_topics(qdrant_url: str, qdrant_key: str, topics: list[str], vectors: list[list[float]]):
    """Add new topic points to the topics collection (deduplicated by topic name)."""
    points = [
        {
            "id": _deterministic_id(TOPICS_COLLECTION, topic),
            "vector": vec,
            "payload": {"text": topic},
        }
        for topic, vec in zip(topics, vectors)
    ]
    resp = requests.put(
        f"{qdrant_url}/collections/{TOPICS_COLLECTION}/points",
        headers={"api-key": qdrant_key, "Content-Type": "application/json"},
        json={"points": points},
        timeout=15,
    )
    resp.raise_for_status()


# ── Appwrite entry point ────────────────────────────────────────────

def main(context):
    today = datetime.date.today().isoformat()

    # ── Parse request body ──────────────────────────────────────────
    try:
        body = context.req.body
        if isinstance(body, str):
            body = json.loads(body)
    except Exception:
        return context.res.json({"success": False, "error": "Invalid JSON body"}, 400)

    segment = body.get("segment", "").strip()
    if not segment:
        return context.res.json(
            {"success": False, "error": "Missing or empty 'segment' field"}, 400
        )

    # ── Validate env vars ───────────────────────────────────────────
    groq_key = os.environ.get("GROQ_API_KEY", "")
    gemini_key = os.environ.get("GEMINI_API_KEY", "")
    qdrant_url = os.environ.get("QDRANT_URL", "").rstrip("/")
    qdrant_key = os.environ.get("QDRANT_API_KEY", "")

    if not groq_key:
        return context.res.json({"success": False, "error": "GROQ_API_KEY not configured"}, 500)
    if not gemini_key:
        return context.res.json({"success": False, "error": "GEMINI_API_KEY not configured"}, 500)
    if not qdrant_url:
        return context.res.json({"success": False, "error": "QDRANT_URL not configured"}, 500)

    # ── Step 1: Retrieve existing topics ────────────────────────────
    try:
        existing_topics = _scroll_all_topics(qdrant_url, qdrant_key)
    except Exception as exc:
        context.error(f"Failed to retrieve topics: {exc}")
        return context.res.json({"success": False, "error": f"Qdrant scroll failed: {exc}"}, 502)

    # ── Step 2: Label via Llama ─────────────────────────────────────
    try:
        label_result = _call_groq(segment, existing_topics, groq_key)
        topics_list = label_result.get("topics", [])

        if not topics_list:
            return context.res.json(
                {"success": False, "error": "Model returned no topics"}, 502
            )
    except requests.HTTPError as exc:
        context.error(f"Groq API Error: {exc.response.text}")
        return context.res.json(
            {"success": False, "error": f"Groq API Error {exc.response.status_code}"}, 502
        )
    except (json.JSONDecodeError, KeyError) as exc:
        context.error(f"Failed to parse Groq response: {exc}")
        return context.res.json(
            {"success": False, "error": "Invalid response from language model"}, 502
        )

    topic_names = [t["topic"] for t in topics_list if t.get("topic", "").strip()]
    topic_str = ", ".join(topic_names) if topic_names else "General"

    context.log(f"Segment labelled with topics: {topic_str}")

    # ── Step 3: Gemini Search Retrieval ─────────────────────────────
    search_result = ""
    try:
        search_result = _search_with_gemini(segment, topic_names, gemini_key)
        context.log(f"Gemini search returned {len(search_result)} chars")
    except Exception as exc:
        context.error(f"Gemini search failed (non-fatal): {exc}")
        # Non-fatal — we still store the segment in memory even if search fails

    # ── Step 4: Embed segment → memory collection ───────────────────
    memory_stored = 0
    try:
        memory_metadata = [{"topic": topic_str, "date": today}]

        _ensure_collection(qdrant_url, qdrant_key, MEMORY_COLLECTION)
        mem_vectors = _embed_texts_batch([segment], gemini_key)
        memory_stored = _upsert_to_collection(
            qdrant_url, qdrant_key, MEMORY_COLLECTION,
            [segment], mem_vectors, memory_metadata,
        )
        context.log(f"Stored {memory_stored} point(s) in '{MEMORY_COLLECTION}'")
    except Exception as exc:
        context.error(f"Failed to store in memory: {exc}")
        return context.res.json(
            {"success": False, "error": f"Failed to store segment in memory: {exc}"}, 502
        )

    # ── Step 5: Embed search result → knowledge_base collection ────
    kb_stored = 0
    if search_result.strip():
        try:
            kb_metadata = [{"topic": topic_str, "date": today}]

            _ensure_collection(qdrant_url, qdrant_key, KNOWLEDGE_BASE_COLLECTION)
            kb_vectors = _embed_texts_batch([search_result], gemini_key)
            kb_stored = _upsert_to_collection(
                qdrant_url, qdrant_key, KNOWLEDGE_BASE_COLLECTION,
                [search_result], kb_vectors, kb_metadata,
            )
            context.log(f"Stored {kb_stored} point(s) in '{KNOWLEDGE_BASE_COLLECTION}'")
        except Exception as exc:
            context.error(f"Failed to store in knowledge_base: {exc}")
            return context.res.json(
                {"success": False, "error": f"Failed to store in knowledge_base: {exc}"}, 502
            )

    # ── Step 6: Embed & store any new topics ────────────────────────
    new_topic_names = [
        t["topic"] for t in topics_list
        if t.get("isNew", False) and t.get("topic", "").strip()
    ]

    if new_topic_names:
        try:
            _ensure_collection(qdrant_url, qdrant_key, TOPICS_COLLECTION)
            vectors = _embed_texts_batch(new_topic_names, gemini_key)
            _upsert_topics(qdrant_url, qdrant_key, new_topic_names, vectors)
            context.log(f"Stored {len(new_topic_names)} new topic(s)")
        except Exception as exc:
            context.error(f"Failed to store new topics: {exc}")
            return context.res.json(
                {"success": False, "error": f"Failed to store new topics: {exc}"}, 502
            )

    return context.res.json(
        {
            "success": True,
            "topics": topics_list,
            "searchResult": search_result[:500] if search_result else "",
            "memoryStored": memory_stored,
            "knowledgeBaseStored": kb_stored,
        },
        200,
    )
