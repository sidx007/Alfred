import json
import os
import requests

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
MODEL = "llama-3.3-70b-versatile"

SYSTEM_PROMPT = """You are a paragraph segmentation assistant. 
Given a single block of text, split it into multiple paragraphs based on the *topic or content type* of each section. 
Each segment should cover one coherent topic (e.g. History, Geography, Science, Biography, Economics, Opinion, etc.).

Return ONLY valid JSON — no markdown fences, no commentary. Use this exact schema:
{
  "segments": [
    {
      "topic": "<short topic label>",
      "content": "<the verbatim text belonging to this topic>"
    }
  ]
}

Rules:
- Preserve the original wording; do NOT paraphrase or summarise.
- Every sentence of the original text must appear in exactly one segment.
- Keep the segments in the same order as the original text.
- If the entire text is about one topic, return a single segment."""


def _call_groq(paragraph: str, api_key: str) -> dict:
    """Call Groq chat completions and return parsed JSON."""
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": paragraph},
        ],
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
    }

    resp = requests.post(GROQ_API_URL, headers=headers, json=payload, timeout=60)
    resp.raise_for_status()

    content = resp.json()["choices"][0]["message"]["content"]
    return json.loads(content)


def main(context):
    # ── Parse request body ──────────────────────────────────────────
    try:
        body = context.req.body
        if isinstance(body, str):
            body = json.loads(body)
    except Exception:
        return context.res.json({"success": False, "error": "Invalid JSON body"}, 400)

    paragraph = body.get("paragraph", "").strip()
    if not paragraph:
        return context.res.json(
            {"success": False, "error": "Missing or empty 'paragraph' field"}, 400
        )

    # ── Validate API key ────────────────────────────────────────────
    api_key = os.environ.get("GROQ_API_KEY", "")
    if not api_key:
        return context.res.json(
            {"success": False, "error": "GROQ_API_KEY not configured"}, 500
        )

    # ── Call Groq / Llama ───────────────────────────────────────────
    try:
        result = _call_groq(paragraph, api_key)
        segments = result.get("segments", [])

        return context.res.json({"success": True, "segments": segments}, 200)

    except requests.HTTPError as exc:
        context.error(f"Groq API Error: {exc.response.text}")
        return context.res.json(
            {"success": False, "error": f"Groq API Error {exc.response.status_code}"},
            502,
        )
    except (json.JSONDecodeError, KeyError) as exc:
        context.error(f"Failed to parse Groq response: {exc}")
        return context.res.json(
            {"success": False, "error": "Invalid response from language model"}, 502
        )
    except Exception as exc:
        context.error(f"Function Crash: {str(exc)}")
        return context.res.json({"success": False, "error": str(exc)}, 500)
