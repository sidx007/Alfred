import json
import os
import datetime
import requests

MEMORY_COLLECTION = "memory"
KNOWLEDGE_BASE_COLLECTION = "knowledge_base"


# ── Helpers ──────────────────────────────────────────────────────────

def _scroll_and_cluster(
    qdrant_url: str,
    qdrant_key: str,
    collection: str,
    target_dates: set[str],
) -> dict[str, list[str]]:
    """Scroll a Qdrant collection and return chunk IDs clustered by topic.

    Only points whose payload.date matches one of *target_dates* are included.
    Returns a dict mapping each topic string to a list of point IDs.
    """
    headers = {"api-key": qdrant_key, "Content-Type": "application/json"}
    clustered: dict[str, list[str]] = {}
    offset = None

    while True:
        body: dict = {"limit": 100, "with_payload": True, "with_vector": False}
        if offset is not None:
            body["offset"] = offset

        resp = requests.post(
            f"{qdrant_url}/collections/{collection}/points/scroll",
            headers=headers,
            json=body,
            timeout=15,
        )

        # Collection may not exist yet
        if resp.status_code == 404:
            return {}
        resp.raise_for_status()

        data = resp.json().get("result", {})
        points = data.get("points", [])

        for pt in points:
            payload = pt.get("payload", {})
            point_date = payload.get("date", "")
            if point_date not in target_dates:
                continue

            point_id = pt.get("id", "")
            topic_str = payload.get("topic", "Uncategorized")

            # topic_str can be comma-separated (e.g. "Finance, Business")
            topics = [t.strip() for t in topic_str.split(",") if t.strip()]
            if not topics:
                topics = ["Uncategorized"]

            for topic in topics:
                clustered.setdefault(topic, []).append(point_id)

        next_offset = data.get("next_page_offset")
        if next_offset is None or not points:
            break
        offset = next_offset

    return clustered


def _merge_into_result(
    result: dict[str, dict],
    clustered: dict[str, list[str]],
    key: str,
):
    """Merge clustered chunk IDs into the combined result dict under *key*."""
    for topic, ids in clustered.items():
        if topic not in result:
            result[topic] = {"memory": [], "knowledgeBase": []}
        result[topic][key].extend(ids)


# ── Appwrite entry point ────────────────────────────────────────────

def main(context):
    # ── Validate env vars ───────────────────────────────────────────
    qdrant_url = os.environ.get("QDRANT_URL", "").rstrip("/")
    qdrant_key = os.environ.get("QDRANT_API_KEY", "")

    if not qdrant_url:
        return context.res.json(
            {"success": False, "error": "QDRANT_URL not configured"}, 500
        )

    # ── Compute target dates (1, 3, 5, 7 days ago) ─────────────────
    today = datetime.date.today()
    offsets = [1, 3, 5, 7]
    target_dates = {
        (today - datetime.timedelta(days=d)).isoformat() for d in offsets
    }

    context.log(f"Target dates: {sorted(target_dates)}")

    # ── Scroll & cluster both collections ───────────────────────────
    try:
        memory_clustered = _scroll_and_cluster(
            qdrant_url, qdrant_key, MEMORY_COLLECTION, target_dates
        )
        kb_clustered = _scroll_and_cluster(
            qdrant_url, qdrant_key, KNOWLEDGE_BASE_COLLECTION, target_dates
        )

        # Merge into a single dict keyed by topic
        combined: dict[str, dict] = {}
        _merge_into_result(combined, memory_clustered, "memory")
        _merge_into_result(combined, kb_clustered, "knowledgeBase")

        total_mem = sum(len(v["memory"]) for v in combined.values())
        total_kb = sum(len(v["knowledgeBase"]) for v in combined.values())
        context.log(
            f"Found {total_mem} memory + {total_kb} knowledge_base chunk(s) "
            f"across {len(combined)} topic(s)"
        )

        return context.res.json(
            {"success": True, "clusteredChunks": combined}, 200
        )

    except requests.HTTPError as exc:
        err_body = getattr(exc.response, "text", str(exc))
        context.error(f"Qdrant HTTP Error: {err_body}")
        return context.res.json(
            {"success": False, "error": f"Qdrant API error: {exc.response.status_code}"},
            502,
        )
    except Exception as exc:
        context.error(f"Function Crash: {str(exc)}")
        return context.res.json({"success": False, "error": str(exc)}, 500)
