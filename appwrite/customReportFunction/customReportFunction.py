import json
import os
import random
import requests

GEMINI_GENERATE_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"

MEMORY_COLLECTION = "memory"
KNOWLEDGE_BASE_COLLECTION = "knowledge_base"

# ── Tone randomiser for daily variety ────────────────────────────────
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

Your task: craft a **dense, high-quality custom report** covering ALL of the topics listed below. Bruce has specifically requested a consolidated briefing on these subjects.

Guidelines:
- Address Bruce naturally ("Master Wayne", "Sir", or simply "Bruce" — vary it).
- Open with a brief, engaging introduction that frames why these topics are being covered together.
- For EACH topic, create a dedicated section. The **core content** must be built from the MEMORY CONTEXT — this is what Bruce actually recorded. Cover every key idea; do not omit details.
- After covering each topic's core content, include an **"Additional Intelligence"** subsection drawn from the KNOWLEDGE BASE CONTEXT for that topic. Frame this as supplementary insight — "bonus intel" that places Bruce in the top percentile of understanding.
- Weave connections between topics where relevant — Bruce values seeing the bigger picture.
- Close with a unified takeaway that ties the topics together and reinforces retention.
- Use clear structure: headings, bullet points, numbered lists, bold key terms.
- **Tone for this report**: {tone}
- Be thorough yet concise — every sentence must earn its place."""


# ── Helpers ──────────────────────────────────────────────────────────

def _scroll_by_topics(
    qdrant_url: str,
    qdrant_key: str,
    collection: str,
    target_topics: set[str],
) -> dict[str, list[str]]:
    """Scroll a Qdrant collection and return texts grouped by matching topic.

    A point matches if any of its comma-separated topics intersect with
    *target_topics* (case-insensitive).
    """
    headers = {"api-key": qdrant_key, "Content-Type": "application/json"}
    grouped: dict[str, list[str]] = {t: [] for t in target_topics}
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

        if resp.status_code == 404:
            return grouped
        resp.raise_for_status()

        data = resp.json().get("result", {})
        points = data.get("points", [])

        for pt in points:
            payload = pt.get("payload", {})
            topic_str = payload.get("topic", "")
            text = payload.get("text", "").strip()
            if not text:
                continue

            point_topics = {t.strip().lower() for t in topic_str.split(",") if t.strip()}
            target_lower = {t.lower(): t for t in target_topics}

            for pt_topic in point_topics:
                if pt_topic in target_lower:
                    grouped[target_lower[pt_topic]].append(text)

        next_offset = data.get("next_page_offset")
        if next_offset is None or not points:
            break
        offset = next_offset

    return grouped


def _call_gemini(prompt: str, system_prompt: str, api_key: str) -> str:
    """Call Gemini 2.5 Flash and return the generated text."""
    payload = {
        "system_instruction": {
            "parts": [{"text": system_prompt}]
        },
        "contents": [
            {"parts": [{"text": prompt}]}
        ],
        "generationConfig": {
            "temperature": 1.2,
            "topP": 0.95,
            "topK": 40,
            "maxOutputTokens": 65536,
        },
    }

    resp = requests.post(
        GEMINI_GENERATE_URL,
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": api_key,
        },
        json=payload,
        timeout=120,
    )
    resp.raise_for_status()

    data = resp.json()
    candidates = data.get("candidates", [])
    if not candidates:
        return ""

    parts = candidates[0].get("content", {}).get("parts", [])
    return "".join(p.get("text", "") for p in parts)


# ── Appwrite entry point ────────────────────────────────────────────

def main(context):
    # ── Parse request body ──────────────────────────────────────────
    try:
        body = context.req.body
        if isinstance(body, str):
            body = json.loads(body)
    except Exception:
        return context.res.json({"success": False, "error": "Invalid JSON body"}, 400)

    topics = body.get("topics", [])

    if not topics or not isinstance(topics, list):
        return context.res.json(
            {"success": False, "error": "'topics' must be a non-empty list of topic names"}, 400
        )

    # Clean & deduplicate
    topics = list(dict.fromkeys(t.strip() for t in topics if t.strip()))

    # ── Validate env vars ───────────────────────────────────────────
    gemini_key = os.environ.get("GEMINI_API_KEY", "")
    qdrant_url = os.environ.get("QDRANT_URL", "").rstrip("/")
    qdrant_key = os.environ.get("QDRANT_API_KEY", "")

    if not gemini_key:
        return context.res.json({"success": False, "error": "GEMINI_API_KEY not configured"}, 500)
    if not qdrant_url:
        return context.res.json({"success": False, "error": "QDRANT_URL not configured"}, 500)

    # ── Fetch all context for requested topics ──────────────────────
    try:
        target_set = set(topics)
        memory_grouped = _scroll_by_topics(qdrant_url, qdrant_key, MEMORY_COLLECTION, target_set)
        kb_grouped = _scroll_by_topics(qdrant_url, qdrant_key, KNOWLEDGE_BASE_COLLECTION, target_set)

        total_mem = sum(len(v) for v in memory_grouped.values())
        total_kb = sum(len(v) for v in kb_grouped.values())
        context.log(f"Fetched {total_mem} memory + {total_kb} KB chunks across {len(topics)} topic(s)")

    except requests.HTTPError as exc:
        err_body = getattr(exc.response, "text", str(exc))
        context.error(f"Qdrant fetch error: {err_body}")
        return context.res.json(
            {"success": False, "error": f"Qdrant API error: {exc.response.status_code}"}, 502
        )

    # ── Build the prompt ────────────────────────────────────────────
    sections = []
    for topic in topics:
        mem_texts = memory_grouped.get(topic, [])
        kb_texts = kb_grouped.get(topic, [])

        mem_block = "\n\n---\n\n".join(mem_texts) if mem_texts else "(No memory entries for this topic.)"
        kb_block = "\n\n---\n\n".join(kb_texts) if kb_texts else "(No additional knowledge base entries.)"

        sections.append(
            f"## Topic: {topic}\n\n"
            f"### MEMORY CONTEXT (Bruce's own notes)\n\n{mem_block}\n\n"
            f"### KNOWLEDGE BASE CONTEXT (supplementary intelligence)\n\n{kb_block}"
        )

    user_prompt = "\n\n" + ("\n\n" + "=" * 60 + "\n\n").join(sections)

    # Pick a random tone for variety
    tone = random.choice(TONE_OPTIONS)
    system = SYSTEM_PROMPT.format(tone=tone)

    context.log(f"Generating custom report with tone: {tone}")

    # ── Call Gemini 2.5 Flash ───────────────────────────────────────
    try:
        report = _call_gemini(user_prompt, system, gemini_key)

        if not report.strip():
            return context.res.json(
                {"success": False, "error": "Gemini returned an empty response"}, 502
            )

        return context.res.json(
            {
                "success": True,
                "topics": topics,
                "report": report,
                "memoryChunksUsed": total_mem,
                "knowledgeBaseChunksUsed": total_kb,
            },
            200,
        )

    except requests.HTTPError as exc:
        err_body = getattr(exc.response, "text", str(exc))
        context.error(f"Gemini API Error: {err_body}")
        return context.res.json(
            {"success": False, "error": f"Gemini API error: {exc.response.status_code}"}, 502
        )
    except Exception as exc:
        context.error(f"Function Crash: {str(exc)}")
        return context.res.json({"success": False, "error": str(exc)}, 500)
