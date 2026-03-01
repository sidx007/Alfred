import json
import os
import uuid
import datetime
import random
import requests

# ── Collections ──────────────────────────────────────────────────────
MEMORY_COLLECTION = "memory"
KNOWLEDGE_BASE_COLLECTION = "knowledge_base"
DAILY_REPORT_COLLECTION = "daily report"
PREVIOUS_REPORTS_COLLECTION = "previous reports"

GEMINI_GENERATE_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"

# ── Tone randomiser ─────────────────────────────────────────────────
TONE_OPTIONS = [
    "witty and eloquent, with subtle dry humour befitting a seasoned butler",
    "warm yet authoritative, like a trusted mentor sharing invaluable wisdom",
    "sharp and incisive, cutting straight to the essence of each idea",
    "scholarly and refined, with the precision of a world-class academic",
    "conversational and engaging, as if narrating over afternoon tea",
    "crisp and commanding, like a strategic briefing before a critical mission",
    "thoughtful and contemplative, weaving connections between ideas",
    "energetic and vivid, painting each concept in bold strokes",
]

SYSTEM_PROMPT = """You are Alfred Pennyworth — Bruce Wayne's trusted butler, confidant, and intellectual equal.

Your task: craft a **dense, high-quality revision report** on the topic below. Bruce logged this information over the past several days and needs to revise it to strengthen long-term retention.

Guidelines:
- Address Bruce naturally ("Master Wayne", "Sir", or simply "Bruce" — vary it).
- Open with a brief, engaging introduction that sets the context for this topic.
- The **core report** must be built from the MEMORY CONTEXT provided — this is what Bruce actually recorded. Cover every key idea; do not omit details.
- After the core report, include an **"Additional Intelligence"** section drawn from the KNOWLEDGE BASE CONTEXT. Frame this as supplementary insight — "bonus intel" that places Bruce in the top percentile of understanding.
- Close with a concise takeaway or call-to-action that reinforces retention.
- Use clear structure: headings, bullet points, numbered lists, bold key terms.
- **Tone for this report**: {tone}
- Be thorough yet concise — every sentence must earn its place."""


# ══════════════════════════════════════════════════════════════════════
#  HELPERS
# ══════════════════════════════════════════════════════════════════════

def _qdrant_headers(api_key: str) -> dict:
    return {"api-key": api_key, "Content-Type": "application/json"}


def _scroll_all(qdrant_url: str, qdrant_key: str, collection: str) -> list[dict]:
    """Scroll an entire Qdrant collection. Returns all points."""
    headers = _qdrant_headers(qdrant_key)
    points = []
    offset = None

    while True:
        body: dict = {"limit": 100, "with_payload": True, "with_vector": False}
        if offset is not None:
            body["offset"] = offset

        resp = requests.post(
            f"{qdrant_url}/collections/{collection}/points/scroll",
            headers=headers, json=body, timeout=15,
        )
        if resp.status_code == 404:
            return []
        resp.raise_for_status()

        data = resp.json().get("result", {})
        pts = data.get("points", [])
        points.extend(pts)

        next_offset = data.get("next_page_offset")
        if next_offset is None or not pts:
            break
        offset = next_offset

    return points


def _scroll_and_cluster(
    qdrant_url: str, qdrant_key: str,
    collection: str, target_dates: set[str],
) -> dict[str, list[str]]:
    """Scroll collection, return chunk IDs clustered by topic for matching dates."""
    headers = _qdrant_headers(qdrant_key)
    clustered: dict[str, list[str]] = {}
    offset = None

    while True:
        body: dict = {"limit": 100, "with_payload": True, "with_vector": False}
        if offset is not None:
            body["offset"] = offset

        resp = requests.post(
            f"{qdrant_url}/collections/{collection}/points/scroll",
            headers=headers, json=body, timeout=15,
        )
        if resp.status_code == 404:
            return {}
        resp.raise_for_status()

        data = resp.json().get("result", {})
        points = data.get("points", [])

        for pt in points:
            payload = pt.get("payload", {})
            if payload.get("date", "") not in target_dates:
                continue

            point_id = pt.get("id", "")
            topic_str = payload.get("topic", "Uncategorized")
            topics = [t.strip() for t in topic_str.split(",") if t.strip()] or ["Uncategorized"]
            for topic in topics:
                clustered.setdefault(topic, []).append(point_id)

        next_offset = data.get("next_page_offset")
        if next_offset is None or not points:
            break
        offset = next_offset

    return clustered


def _fetch_texts_by_ids(
    qdrant_url: str, qdrant_key: str,
    collection: str, point_ids: list[str],
) -> list[str]:
    """Fetch text payloads from Qdrant by IDs."""
    if not point_ids:
        return []

    resp = requests.post(
        f"{qdrant_url}/collections/{collection}/points",
        headers=_qdrant_headers(qdrant_key),
        json={"ids": point_ids, "with_payload": True, "with_vector": False},
        timeout=15,
    )
    if resp.status_code == 404:
        return []
    resp.raise_for_status()

    return [
        pt["payload"]["text"].strip()
        for pt in resp.json().get("result", [])
        if pt.get("payload", {}).get("text", "").strip()
    ]


def _call_gemini(prompt: str, system_prompt: str, api_key: str) -> str:
    """Call Gemini and return generated text. Retries on 429 (rate limit)."""
    import time as _time

    max_retries = 3
    for attempt in range(max_retries + 1):
        resp = requests.post(
            GEMINI_GENERATE_URL,
            headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
            json={
                "system_instruction": {"parts": [{"text": system_prompt}]},
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {
                    "temperature": 1.2, "topP": 0.95, "topK": 40,
                    "maxOutputTokens": 65536,
                },
            },
            timeout=120,
        )

        if resp.status_code == 429 and attempt < max_retries:
            # Rate limited — wait 60s then retry
            _time.sleep(60)
            continue

        resp.raise_for_status()
        candidates = resp.json().get("candidates", [])
        if not candidates:
            return ""
        parts = candidates[0].get("content", {}).get("parts", [])
        return "".join(p.get("text", "") for p in parts)

    # Should not reach here, but just in case
    resp.raise_for_status()
    return ""


def _ensure_collection(qdrant_url: str, qdrant_key: str, collection: str):
    """Create a Qdrant collection if it doesn't exist (no vectors needed)."""
    check = requests.get(
        f"{qdrant_url}/collections/{collection}",
        headers=_qdrant_headers(qdrant_key), timeout=10,
    )
    if check.status_code == 200:
        return  # already exists

    # Create with a tiny dummy vector size — we won't use vectors
    requests.put(
        f"{qdrant_url}/collections/{collection}",
        headers=_qdrant_headers(qdrant_key),
        json={"vectors": {"size": 4, "distance": "Cosine"}},
        timeout=10,
    )


def _upsert_report_points(
    qdrant_url: str, qdrant_key: str,
    collection: str, points: list[dict],
):
    """Upsert points with dummy vectors into a collection."""
    if not points:
        return

    for pt in points:
        if "vector" not in pt:
            pt["vector"] = [0.0, 0.0, 0.0, 0.0]

    resp = requests.put(
        f"{qdrant_url}/collections/{collection}/points",
        headers=_qdrant_headers(qdrant_key),
        json={"points": points},
        timeout=30,
    )
    resp.raise_for_status()


def _delete_all_points(qdrant_url: str, qdrant_key: str, collection: str, point_ids: list):
    """Delete specific points from a collection."""
    if not point_ids:
        return

    resp = requests.post(
        f"{qdrant_url}/collections/{collection}/points/delete",
        headers=_qdrant_headers(qdrant_key),
        json={"points": point_ids},
        timeout=15,
    )
    resp.raise_for_status()


# ══════════════════════════════════════════════════════════════════════
#  APPWRITE ENTRY POINT
# ══════════════════════════════════════════════════════════════════════

def main(context):
    # ── Env vars ────────────────────────────────────────────────────
    gemini_key = os.environ.get("GEMINI_API_KEY", "")
    qdrant_url = os.environ.get("QDRANT_URL", "").rstrip("/")
    qdrant_key = os.environ.get("QDRANT_API_KEY", "")

    if not gemini_key:
        return context.res.json({"success": False, "error": "GEMINI_API_KEY not set"}, 500)
    if not qdrant_url:
        return context.res.json({"success": False, "error": "QDRANT_URL not set"}, 500)

    today_str = datetime.date.today().isoformat()
    context.log(f"=== Daily Report Pipeline — {today_str} ===")

    # ─────────────────────────────────────────────────────────────────
    # STEP 1: Get revision chunks (1, 3, 5, 7 days ago)
    # ─────────────────────────────────────────────────────────────────
    today = datetime.date.today()
    target_dates = {(today - datetime.timedelta(days=d)).isoformat() for d in [1, 3, 5, 7]}
    context.log(f"Target dates: {sorted(target_dates)}")

    try:
        mem_clustered = _scroll_and_cluster(qdrant_url, qdrant_key, MEMORY_COLLECTION, target_dates)
        kb_clustered = _scroll_and_cluster(qdrant_url, qdrant_key, KNOWLEDGE_BASE_COLLECTION, target_dates)

        # Merge into combined { topic: { memory: [...], knowledgeBase: [...] } }
        combined: dict[str, dict] = {}
        for topic, ids in mem_clustered.items():
            combined.setdefault(topic, {"memory": [], "knowledgeBase": []})["memory"].extend(ids)
        for topic, ids in kb_clustered.items():
            combined.setdefault(topic, {"memory": [], "knowledgeBase": []})["knowledgeBase"].extend(ids)

        if not combined:
            context.log("No chunks found for revision dates — nothing to report.")
            return context.res.json({"success": True, "message": "No revision chunks found", "reports": []}, 200)

        context.log(f"Found {len(combined)} topic(s) to report on")

    except Exception as exc:
        context.error(f"Revision chunks step failed: {exc}")
        return context.res.json({"success": False, "error": str(exc)}, 500)

    # ─────────────────────────────────────────────────────────────────
    # STEP 2: Generate a report for each topic
    # ─────────────────────────────────────────────────────────────────
    reports = []
    for topic, chunk_data in combined.items():
        context.log(f"Generating report for '{topic}'...")
        try:
            mem_texts = _fetch_texts_by_ids(qdrant_url, qdrant_key, MEMORY_COLLECTION, chunk_data["memory"])
            kb_texts = _fetch_texts_by_ids(qdrant_url, qdrant_key, KNOWLEDGE_BASE_COLLECTION, chunk_data["knowledgeBase"])

            mem_block = "\n\n---\n\n".join(mem_texts) if mem_texts else "(No memory entries.)"
            kb_block = "\n\n---\n\n".join(kb_texts) if kb_texts else "(No KB entries.)"

            user_prompt = (
                f"## Topic: {topic}\n\n"
                f"### MEMORY CONTEXT (Bruce's own notes)\n\n{mem_block}\n\n"
                f"### KNOWLEDGE BASE CONTEXT (supplementary intelligence)\n\n{kb_block}"
            )

            tone = random.choice(TONE_OPTIONS)
            system = SYSTEM_PROMPT.format(tone=tone)
            report_text = _call_gemini(user_prompt, system, gemini_key)

            if report_text.strip():
                reports.append({
                    "topic": topic,
                    "report": report_text,
                    "memoryChunks": len(mem_texts),
                    "kbChunks": len(kb_texts),
                })
                context.log(f"  ✓ '{topic}' report generated ({len(report_text)} chars)")
            else:
                context.log(f"  ⚠ '{topic}' — Gemini returned empty response, skipping")

        except Exception as exc:
            context.error(f"  ✗ '{topic}' failed: {exc}")
            # Continue with other topics

    if not reports:
        return context.res.json({"success": True, "message": "No reports generated", "reports": []}, 200)

    # ─────────────────────────────────────────────────────────────────
    # STEP 3: Move existing daily reports → previous reports
    # ─────────────────────────────────────────────────────────────────
    context.log("Moving existing daily reports to 'previous reports'...")
    try:
        _ensure_collection(qdrant_url, qdrant_key, PREVIOUS_REPORTS_COLLECTION)

        existing_points = _scroll_all(qdrant_url, qdrant_key, DAILY_REPORT_COLLECTION)

        if existing_points:
            # Re-package existing points for upsert into previous reports
            archive_points = []
            for pt in existing_points:
                archive_points.append({
                    "id": str(uuid.uuid4()),
                    "vector": [0.0, 0.0, 0.0, 0.0],
                    "payload": pt.get("payload", {}),
                })

            _upsert_report_points(qdrant_url, qdrant_key, PREVIOUS_REPORTS_COLLECTION, archive_points)

            # Delete from daily reports
            old_ids = [pt["id"] for pt in existing_points]
            _delete_all_points(qdrant_url, qdrant_key, DAILY_REPORT_COLLECTION, old_ids)
            context.log(f"  Archived {len(existing_points)} old report(s)")
        else:
            context.log("  No existing daily reports to archive")

    except Exception as exc:
        context.error(f"Archive step failed (non-fatal): {exc}")
        # Continue — we still want to store the new reports

    # ─────────────────────────────────────────────────────────────────
    # STEP 4: Store new reports in daily reports collection
    # ─────────────────────────────────────────────────────────────────
    context.log("Storing new daily reports...")
    try:
        _ensure_collection(qdrant_url, qdrant_key, DAILY_REPORT_COLLECTION)

        new_points = []
        for r in reports:
            new_points.append({
                "id": str(uuid.uuid4()),
                "vector": [0.0, 0.0, 0.0, 0.0],
                "payload": {
                    "topic": r["topic"],
                    "report": r["report"],
                    "date": today_str,
                    "memoryChunks": r["memoryChunks"],
                    "kbChunks": r["kbChunks"],
                },
            })

        _upsert_report_points(qdrant_url, qdrant_key, DAILY_REPORT_COLLECTION, new_points)
        context.log(f"  Stored {len(new_points)} new report(s)")

    except Exception as exc:
        context.error(f"Store step failed: {exc}")
        return context.res.json({"success": False, "error": f"Failed to store reports: {exc}"}, 500)

    # ── Done ────────────────────────────────────────────────────────
    summary = [{"topic": r["topic"], "memoryChunks": r["memoryChunks"], "kbChunks": r["kbChunks"]} for r in reports]
    context.log(f"=== Pipeline complete — {len(reports)} report(s) generated ===")

    return context.res.json({
        "success": True,
        "date": today_str,
        "reportsGenerated": len(reports),
        "summary": summary,
    }, 200)
