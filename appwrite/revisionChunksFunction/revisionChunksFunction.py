import json
import os
import datetime
import requests

MEMORY_COLLECTION = "memory"


# ── Helpers ──────────────────────────────────────────────────────────

def _scroll_memory_chunks(
    qdrant_url: str,
    qdrant_key: str,
    target_dates: set[str],
) -> dict[str, list[str]]:
    """Scroll the memory collection and return chunk IDs clustered by topic.

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
            f"{qdrant_url}/collections/{MEMORY_COLLECTION}/points/scroll",
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

    # ── Scroll & cluster ────────────────────────────────────────────
    try:
        clustered = _scroll_memory_chunks(qdrant_url, qdrant_key, target_dates)

        total_chunks = sum(len(ids) for ids in clustered.values())
        context.log(
            f"Found {total_chunks} chunk(s) across {len(clustered)} topic(s)"
        )

        return context.res.json(
            {"success": True, "clusteredChunks": clustered}, 200
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
