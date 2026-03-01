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

Your task: craft a **dense, high-quality revision report** on the topic below. Bruce logged this information over the past several days and needs to revise it to strengthen long-term retention.

Guidelines:
- Address Bruce naturally (\"Master Wayne\", \"Sir\", or simply \"Bruce\" — vary it).
- Open with a brief, engaging introduction that sets the context for this topic.
- The **core report** must be built from the MEMORY CONTEXT provided — this is what Bruce actually recorded. Cover every key idea; do not omit details.
- After the core report, include an **\"Additional Intelligence\"** section drawn from the KNOWLEDGE BASE CONTEXT. Frame this as supplementary insight — \"bonus intel\" that places Bruce in the top percentile of understanding.
- Close with a concise takeaway or call-to-action that reinforces retention.
- Use clear structure: headings, bullet points, numbered lists, bold key terms.
- **Tone for this report**: {tone}
- Be thorough yet concise — every sentence must earn its place."""


def _fetch_points_by_ids(
    qdrant_url: str,
    qdrant_key: str,
    collection: str,
    point_ids: list[str],
) -> list[str]:
    """Fetch point payloads from Qdrant by their IDs. Return list of text contents."""
    if not point_ids:
        return []

    headers = {"api-key": qdrant_key, "Content-Type": "application/json"}
    resp = requests.post(
        f"{qdrant_url}/collections/{collection}/points",
        headers=headers,
        json={"ids": point_ids, "with_payload": True, "with_vector": False},
        timeout=15,
    )

    if resp.status_code == 404:
        return []
    resp.raise_for_status()

    texts = []
    for pt in resp.json().get("result", []):
        text = pt.get("payload", {}).get("text", "")
        if text.strip():
            texts.append(text.strip())
    return texts


def _call_gemini(prompt: str, system_prompt: str, api_key: str) -> str:
    """Call Gemini 2.5 Pro and return the generated text."""
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

    topic = body.get("topic", "").strip()
    memory_ids = body.get("memoryIds", [])
    knowledge_base_ids = body.get("knowledgeBaseIds", [])

    if not topic:
        return context.res.json(
            {"success": False, "error": "Missing or empty 'topic' field"}, 400
        )
    if not memory_ids and not knowledge_base_ids:
        return context.res.json(
            {"success": False, "error": "At least one of 'memoryIds' or 'knowledgeBaseIds' must be provided"}, 400
        )

    # ── Validate env vars ───────────────────────────────────────────
    gemini_key = os.environ.get("GEMINI_API_KEY", "")
    qdrant_url = os.environ.get("QDRANT_URL", "").rstrip("/")
    qdrant_key = os.environ.get("QDRANT_API_KEY", "")

    if not gemini_key:
        return context.res.json({"success": False, "error": "GEMINI_API_KEY not configured"}, 500)
    if not qdrant_url:
        return context.res.json({"success": False, "error": "QDRANT_URL not configured"}, 500)

    # ── Fetch chunk contents from Qdrant ────────────────────────────
    try:
        memory_texts = _fetch_points_by_ids(
            qdrant_url, qdrant_key, MEMORY_COLLECTION, memory_ids
        )
        kb_texts = _fetch_points_by_ids(
            qdrant_url, qdrant_key, KNOWLEDGE_BASE_COLLECTION, knowledge_base_ids
        )

        context.log(
            f"Fetched {len(memory_texts)} memory + {len(kb_texts)} KB chunks "
            f"for topic '{topic}'"
        )
    except requests.HTTPError as exc:
        err_body = getattr(exc.response, "text", str(exc))
        context.error(f"Qdrant fetch error: {err_body}")
        return context.res.json(
            {"success": False, "error": f"Qdrant API error: {exc.response.status_code}"}, 502
        )

    # ── Build the prompt ────────────────────────────────────────────
    memory_block = "\n\n---\n\n".join(memory_texts) if memory_texts else "(No memory entries for this topic.)"
    kb_block = "\n\n---\n\n".join(kb_texts) if kb_texts else "(No additional knowledge base entries.)"

    user_prompt = (
        f"## Topic: {topic}\n\n"
        f"### MEMORY CONTEXT (Bruce's own notes)\n\n{memory_block}\n\n"
        f"### KNOWLEDGE BASE CONTEXT (supplementary intelligence)\n\n{kb_block}"
    )

    # Pick a random tone for daily variety
    tone = random.choice(TONE_OPTIONS)
    system = SYSTEM_PROMPT.format(tone=tone)

    context.log(f"Generating report with tone: {tone}")

    # ── Call Gemini 2.5 Pro ─────────────────────────────────────────
    try:
        report = _call_gemini(user_prompt, system, gemini_key)

        if not report.strip():
            return context.res.json(
                {"success": False, "error": "Gemini returned an empty response"}, 502
            )

        return context.res.json(
            {
                "success": True,
                "topic": topic,
                "report": report,
                "memoryChunksUsed": len(memory_texts),
                "knowledgeBaseChunksUsed": len(kb_texts),
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
