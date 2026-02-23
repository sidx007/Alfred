import json
import os
import uuid
import requests

GEMINI_EMBED_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001"
EMBED_DIM = 768


# ── Helpers ──────────────────────────────────────────────────────────

def _embed_texts(texts: list[str], api_key: str) -> list[list[float]]:
    """Call Gemini batchEmbedContents API and return a list of vectors."""
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
    """Create the Qdrant collection if it does not already exist."""
    headers = {"api-key": qdrant_key, "Content-Type": "application/json"}

    # Check existence
    check = requests.get(
        f"{qdrant_url}/collections/{collection}", headers=headers, timeout=10
    )
    if check.status_code == 200:
        return  # already exists

    # Create collection
    create_resp = requests.put(
        f"{qdrant_url}/collections/{collection}",
        headers=headers,
        json={
            "vectors": {
                "size": EMBED_DIM,
                "distance": "Cosine",
            }
        },
        timeout=15,
    )
    create_resp.raise_for_status()


def _upsert_points(
    qdrant_url: str,
    qdrant_key: str,
    collection: str,
    texts: list[str],
    vectors: list[list[float]],
    metadata: list[dict] | None,
):
    """Upsert embedded points into Qdrant."""
    points = []
    for i, (text, vec) in enumerate(zip(texts, vectors)):
        payload = {"text": text}
        if metadata and i < len(metadata):
            payload.update(metadata[i])
        points.append(
            {
                "id": str(uuid.uuid4()),
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


# ── Appwrite entry point ────────────────────────────────────────────

def main(context):
    # ── Parse request body ──────────────────────────────────────────
    try:
        body = context.req.body
        if isinstance(body, str):
            body = json.loads(body)
    except Exception:
        return context.res.json({"success": False, "error": "Invalid JSON body"}, 400)

    texts = body.get("texts", [])
    collection = body.get("collection", "").strip()
    metadata = body.get("metadata")  # optional list[dict]

    if not texts or not isinstance(texts, list):
        return context.res.json(
            {"success": False, "error": "'texts' must be a non-empty list of strings"}, 400
        )
    if not collection:
        return context.res.json(
            {"success": False, "error": "Missing 'collection' name"}, 400
        )

    # ── Validate env vars ───────────────────────────────────────────
    embedding_key = os.environ.get("GEMINI_API_KEY", "")
    qdrant_url = os.environ.get("QDRANT_URL", "").rstrip("/")
    qdrant_key = os.environ.get("QDRANT_API_KEY", "")

    if not embedding_key:
        return context.res.json({"success": False, "error": "GEMINI_API_KEY not configured"}, 500)
    if not qdrant_url:
        return context.res.json({"success": False, "error": "QDRANT_URL not configured"}, 500)

    # ── Embed & upsert ──────────────────────────────────────────────
    try:
        _ensure_collection(qdrant_url, qdrant_key, collection)
        vectors = _embed_texts(texts, embedding_key)
        count = _upsert_points(qdrant_url, qdrant_key, collection, texts, vectors, metadata)

        return context.res.json({"success": True, "pointsInserted": count}, 200)

    except requests.HTTPError as exc:
        err_body = getattr(exc.response, "text", str(exc))
        context.error(f"HTTP Error: {err_body}")
        return context.res.json(
            {"success": False, "error": f"Upstream API error: {exc.response.status_code}"}, 502
        )
    except Exception as exc:
        context.error(f"Function Crash: {str(exc)}")
        return context.res.json({"success": False, "error": str(exc)}, 500)
