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

Your task: craft a **dense, high-quality consolidated revision report** covering multiple topics Bruce has been studying.

Guidelines:
- Address Bruce naturally (\"Master Wayne\", \"Sir\", or simply \"Bruce\" — vary it).
- Open with a brief, engaging introduction about the breadth of topics covered today.
- The **core report** must be built from the MEMORY CONTEXT provided — this is what Bruce actually recorded. Organise it logically, using subheadings for each topic if necessary.
- After the core report, include an **\"Additional Intelligence\"** section drawn from the KNOWLEDGE BASE CONTEXT. Frame this as supplementary insight — \"bonus intel\" that places Bruce in the top percentile of understanding.
- Close with a concise takeaway or encouraging remark about Bruce's progress.
- Use clear structure: headings, bullet points, numbered lists, bold key terms.
- **Tone for this report**: {tone}
- Be thorough yet concise — every sentence must earn its place."""


def _scroll_collection_by_topics(
    qdrant_url: str,
    qdrant_key: str,
    collection: str,
    target_topics: set[str],
) -> list[str]:
    """Scroll Qdrant collection and return contents for any point matching target topics."""
    headers = {"api-key": qdrant_key, "Content-Type": "application/json"}
    texts = []
    offset = None

    while True:
        body = {"limit": 100, "with_payload": True, "with_vector": False}
        if offset is not None:
            body["offset"] = offset

        resp = requests.post(
            f"{qdrant_url}/collections/{collection}/points/scroll",
            headers=headers,
            json=body,
            timeout=15,
        )

        if resp.status_code == 404:
            return []
        resp.raise_for_status()

        data = resp.json().get("result", {})
        points = data.get("points", [])

        for pt in points:
            payload = pt.get("payload", {})
            topic_str = payload.get("topic", "")
            
            # Point topics can be comma-separated
            point_topics = {t.strip() for t in topic_str.split(",") if t.strip()}
            
            # If there's any overlap with target_topics, include it
            if point_topics.intersection(target_topics):
                text = payload.get("text", "")
                if text.strip():
                    texts.append(text.strip())

        next_offset = data.get("next_page_offset")
        if next_offset is None or not points:
            break
        offset = next_offset

    return texts


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

    topics_list = body.get("topics", [])
    if not topics_list or not isinstance(topics_list, list):
        return context.res.json(
            {"success": False, "error": "'topics' must be a non-empty list of strings"}, 400
        )

    target_topics = {t.strip() for t in topics_list if t.strip()}
    if not target_topics:
         return context.res.json(
            {"success": False, "error": "No valid topic names provided"}, 400
        )

    # ── Validate env vars ───────────────────────────────────────────
    gemini_key = os.environ.get("GEMINI_API_KEY", "")
    qdrant_url = os.environ.get("QDRANT_URL", "").rstrip("/")
    qdrant_key = os.environ.get("QDRANT_API_KEY", "")

    if not gemini_key:
        return context.res.json({"success": False, "error": "GEMINI_API_KEY not configured"}, 500)
    if not qdrant_url:
        return context.res.json({"success": False, "error": "QDRANT_URL not configured"}, 500)

    # ── Fetch all content for these topics ──────────────────────────
    try:
        memory_texts = _scroll_collection_by_topics(
            qdrant_url, qdrant_key, MEMORY_COLLECTION, target_topics
        )
        kb_texts = _scroll_collection_by_topics(
            qdrant_url, qdrant_key, KNOWLEDGE_BASE_COLLECTION, target_topics
        )

        context.log(
            f"Fetched {len(memory_texts)} memory + {len(kb_texts)} KB segments for {len(target_topics)} topics"
        )
    except Exception as exc:
        context.error(f"Qdrant fetch error: {exc}")
        return context.res.json({"success": False, "error": f"Failed to fetch data from Qdrant: {exc}"}, 502)

    if not memory_texts and not kb_texts:
         return context.res.json(
            {"success": False, "error": "No data found for the provided topics"}, 404
        )

    # ── Build the prompt ────────────────────────────────────────────
    memory_block = "\n\n---\n\n".join(memory_texts) if memory_texts else "(No memory entries found.)"
    kb_block = "\n\n---\n\n".join(kb_texts) if kb_texts else "(No additional knowledge base entries.)"

    user_prompt = (
        f"## Topics to Cover: {', '.join(sorted(target_topics))}\n\n"
        f"### MEMORY CONTEXT (Bruce's own notes)\n\n{memory_block}\n\n"
        f"### KNOWLEDGE BASE CONTEXT (supplementary intelligence)\n\n{kb_block}"
    )

    # Pick a random tone
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
                "topics": sorted(list(target_topics)),
                "report": report,
                "segmentsUsed": len(memory_texts) + len(kb_texts),
            },
            200,
        )

    except Exception as exc:
        context.error(f"Generation error: {exc}")
        return context.res.json({"success": False, "error": str(exc)}, 500)
