import json
import os
import requests

GEMINI_EMBED_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001"


# ── Helpers ──────────────────────────────────────────────────────────

def _embed_query(text: str, api_key: str) -> list[float]:
    """Embed a single query string via Gemini and return its vector."""
    resp = requests.post(
        f"{GEMINI_EMBED_URL}:embedContent",
        params={"key": api_key},
        headers={"Content-Type": "application/json"},
        json={"content": {"parts": [{"text": text}]}},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["embedding"]["values"]


def _search_qdrant(
    qdrant_url: str,
    qdrant_key: str,
    collection: str,
    vector: list[float],
    top_k: int,
) -> list[dict]:
    """Search Qdrant for nearest neighbours and return scored results."""
    resp = requests.post(
        f"{qdrant_url}/collections/{collection}/points/search",
        headers={"api-key": qdrant_key, "Content-Type": "application/json"},
        json={
            "vector": vector,
            "limit": top_k,
            "with_payload": True,
        },
        timeout=15,
    )
    resp.raise_for_status()

    results = []
    for hit in resp.json().get("result", []):
        payload = hit.get("payload", {})
        results.append({
            "text": payload.pop("text", ""),
            "score": hit.get("score", 0),
            "metadata": payload,  # everything except 'text'
        })
    return results


# ── Appwrite entry point ────────────────────────────────────────────

def main(context):
    # ── Parse request body ──────────────────────────────────────────
    try:
        body = context.req.body
        if isinstance(body, str):
            body = json.loads(body)
    except Exception:
        return context.res.json({"success": False, "error": "Invalid JSON body"}, 400)

    query = body.get("query", "").strip()
    collection = body.get("collection", "").strip()
    top_k = body.get("topK", 5)

    if not query:
        return context.res.json(
            {"success": False, "error": "Missing or empty 'query' field"}, 400
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

    # ── Embed query & search ────────────────────────────────────────
    try:
        vector = _embed_query(query, embedding_key)
        results = _search_qdrant(qdrant_url, qdrant_key, collection, vector, top_k)

        return context.res.json({"success": True, "results": results}, 200)

    except requests.HTTPError as exc:
        err_body = getattr(exc.response, "text", str(exc))
        context.error(f"HTTP Error: {err_body}")
        return context.res.json(
            {"success": False, "error": f"Upstream API error: {exc.response.status_code}"}, 502
        )
    except Exception as exc:
        context.error(f"Function Crash: {str(exc)}")
        return context.res.json({"success": False, "error": str(exc)}, 500)
