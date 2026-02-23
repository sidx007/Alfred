import json
import os
import uuid
import requests

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
MODEL = "llama-3.1-8b-instant"

GEMINI_EMBED_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001"
EMBED_DIM = 3072

TOPICS_COLLECTION = "topics"

SYSTEM_PROMPT = """You are a topic classification engine for a learning app.

You will receive:
1. "segment": a text passage the user just learned.
2. "existingTopics": a JSON array of current topic names.

Your job: assign ALL relevant topics to the segment. Each topic must be mutually exclusive — covering a distinct aspect of the segment with no overlap.

Decision rules (apply in order):
1. If an existing topic is a strong or reasonable semantic match for any aspect, return it exactly as-is. Prefer reuse over creating new topics.
2. Only create a new topic if no existing topic comes close in meaning for that aspect. New topics must be 2–5 words, Title Case, and generic enough to reuse (e.g., "Organic Chemistry Basics", not "Benzene Ring Notes").
3. Each topic in the list must cover a different, non-overlapping facet of the segment.
4. If the segment is empty, gibberish, or unclassifiable, return: {"topics": [{"topic": "Uncategorized", "isNew": false}]}

Return ONLY valid JSON — no markdown, no explanation:
{
  "topics": [
    {"topic": "<topic name>", "isNew": true | false},
    ...
  ]
}
"""


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


def _ensure_collection(qdrant_url: str, qdrant_key: str):
    """Create the topics collection if it does not already exist."""
    headers = {"api-key": qdrant_key, "Content-Type": "application/json"}

    check = requests.get(
        f"{qdrant_url}/collections/{TOPICS_COLLECTION}", headers=headers, timeout=10
    )
    if check.status_code == 200:
        return

    create_resp = requests.put(
        f"{qdrant_url}/collections/{TOPICS_COLLECTION}",
        headers=headers,
        json={"vectors": {"size": EMBED_DIM, "distance": "Cosine"}},
        timeout=15,
    )
    create_resp.raise_for_status()


def _upsert_topics(qdrant_url: str, qdrant_key: str, topics: list[str], vectors: list[list[float]]):
    """Add new topic points to the topics collection."""
    points = [
        {
            "id": str(uuid.uuid4()),
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

    # ── Step 3: Embed & store any new topics ────────────────────────
    new_topic_names = [
        t["topic"] for t in topics_list
        if t.get("isNew", False) and t.get("topic", "").strip()
    ]

    if new_topic_names:
        try:
            _ensure_collection(qdrant_url, qdrant_key)
            vectors = _embed_texts_batch(new_topic_names, gemini_key)
            _upsert_topics(qdrant_url, qdrant_key, new_topic_names, vectors)
        except Exception as exc:
            context.error(f"Failed to store new topics: {exc}")
            return context.res.json(
                {"success": False, "error": f"Failed to store new topics: {exc}"}, 502
            )

    return context.res.json({"success": True, "topics": topics_list}, 200)
