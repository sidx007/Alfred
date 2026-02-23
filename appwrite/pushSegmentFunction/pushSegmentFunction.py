import json
import os
import uuid
from datetime import datetime, timezone
import requests

PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions"
SONAR_MODEL = "sonar"

GEMINI_EMBED_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001"
EMBED_DIM = 3072

KNOWLEDGE_BASE_COLLECTION = "KnowledgeBase"
ADDITIONAL_INFO_COLLECTION = "AdditionalInformation"

SONAR_SYSTEM_PROMPT = """You are a knowledge-enrichment engine. A user has just learned a piece of information (the "segment"). 
Your job is to produce a concise briefing that does THREE things — and nothing else:

1. COMPLEMENT: Add context, background, or perspective that makes the segment more meaningful 
   (e.g. historical origins, underlying mechanisms, real-world implications).
2. FILL GAPS: Identify what the segment leaves unsaid or assumes the reader already knows, 
   and supply those missing pieces (definitions, prerequisites, caveats, counter-arguments).
3. ENRICH: Offer one or two genuinely interesting or surprising facts, recent developments, 
   or cross-domain connections that a curious learner would appreciate.

Rules:
- Do NOT repeat or paraphrase what the segment already states.
- Keep your response focused and concise (aim for 150-300 words).
- Write in clear, factual prose — no bullet lists, no headers, no filler phrases."""


# ── Helpers ──────────────────────────────────────────────────────────

def _call_perplexity(segment: str, api_key: str) -> str:
    """Call Perplexity Sonar API to get additional information about the segment."""
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": SONAR_MODEL,
        "messages": [
            {"role": "system", "content": SONAR_SYSTEM_PROMPT},
            {"role": "user", "content": f"Here is the segment the user just learned:\n\n\"{segment}\"\n\nProvide complementary knowledge, fill any gaps, and add interesting context."},
        ],
        "temperature": 0.3,
    }

    resp = requests.post(PERPLEXITY_API_URL, headers=headers, json=payload, timeout=60)
    resp.raise_for_status()

    return resp.json()["choices"][0]["message"]["content"]


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


def _ensure_collection(qdrant_url: str, qdrant_key: str, collection: str):
    """Create a Qdrant collection if it does not already exist."""
    headers = {"api-key": qdrant_key, "Content-Type": "application/json"}

    check = requests.get(
        f"{qdrant_url}/collections/{collection}", headers=headers, timeout=10
    )
    if check.status_code == 200:
        return

    create_resp = requests.put(
        f"{qdrant_url}/collections/{collection}",
        headers=headers,
        json={"vectors": {"size": EMBED_DIM, "distance": "Cosine"}},
        timeout=15,
    )
    create_resp.raise_for_status()


def _upsert_point(
    qdrant_url: str,
    qdrant_key: str,
    collection: str,
    text: str,
    vector: list[float],
    metadata: dict,
):
    """Upsert a single point into a Qdrant collection."""
    payload = {"text": text}
    payload.update(metadata)

    point = {
        "id": str(uuid.uuid4()),
        "vector": vector,
        "payload": payload,
    }
    resp = requests.put(
        f"{qdrant_url}/collections/{collection}/points",
        headers={"api-key": qdrant_key, "Content-Type": "application/json"},
        json={"points": [point]},
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
    topics = body.get("topics", [])

    if not segment:
        return context.res.json(
            {"success": False, "error": "Missing or empty 'segment' field"}, 400
        )
    if not topics or not isinstance(topics, list):
        return context.res.json(
            {"success": False, "error": "'topics' must be a non-empty list of strings"}, 400
        )

    # ── Validate env vars ───────────────────────────────────────────
    perplexity_key = os.environ.get("PERPLEXITY_API_KEY", "")
    gemini_key = os.environ.get("GEMINI_API_KEY", "")
    qdrant_url = os.environ.get("QDRANT_URL", "").rstrip("/")
    qdrant_key = os.environ.get("QDRANT_API_KEY", "")

    if not perplexity_key:
        return context.res.json({"success": False, "error": "PERPLEXITY_API_KEY not configured"}, 500)
    if not gemini_key:
        return context.res.json({"success": False, "error": "GEMINI_API_KEY not configured"}, 500)
    if not qdrant_url:
        return context.res.json({"success": False, "error": "QDRANT_URL not configured"}, 500)

    # Build metadata
    now = datetime.now(timezone.utc).isoformat()
    metadata = {"date": now, "topics": topics}

    # ── Step 1: Call Perplexity Sonar ───────────────────────────────
    try:
        additional_info = _call_perplexity(segment, perplexity_key)
    except requests.HTTPError as exc:
        err_body = getattr(exc.response, "text", str(exc))
        context.error(f"Perplexity API Error: {err_body}")
        return context.res.json(
            {"success": False, "error": f"Perplexity API Error {exc.response.status_code}"}, 502
        )
    except Exception as exc:
        context.error(f"Perplexity call failed: {exc}")
        return context.res.json({"success": False, "error": f"Perplexity call failed: {exc}"}, 502)

    # ── Step 2: Embed both texts ────────────────────────────────────
    try:
        vectors = _embed_texts_batch([segment, additional_info], gemini_key)
        segment_vector = vectors[0]
        additional_vector = vectors[1]
    except Exception as exc:
        context.error(f"Embedding failed: {exc}")
        return context.res.json({"success": False, "error": f"Embedding failed: {exc}"}, 502)

    # ── Step 3: Upsert segment into KnowledgeBase ───────────────────
    try:
        _ensure_collection(qdrant_url, qdrant_key, KNOWLEDGE_BASE_COLLECTION)
        _upsert_point(qdrant_url, qdrant_key, KNOWLEDGE_BASE_COLLECTION, segment, segment_vector, metadata)
    except Exception as exc:
        context.error(f"KnowledgeBase upsert failed: {exc}")
        return context.res.json(
            {"success": False, "error": f"KnowledgeBase upsert failed: {exc}"}, 502
        )

    # ── Step 4: Upsert Sonar output into AdditionalInformation ──────
    try:
        _ensure_collection(qdrant_url, qdrant_key, ADDITIONAL_INFO_COLLECTION)
        _upsert_point(qdrant_url, qdrant_key, ADDITIONAL_INFO_COLLECTION, additional_info, additional_vector, metadata)
    except Exception as exc:
        context.error(f"AdditionalInformation upsert failed: {exc}")
        return context.res.json(
            {"success": False, "error": f"AdditionalInformation upsert failed: {exc}"}, 502
        )

    return context.res.json({
        "success": True,
        "additionalInfo": additional_info,
        "knowledgeBaseStored": True,
        "additionalInfoStored": True,
    }, 200)
