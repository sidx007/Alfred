"""
Alfred — Image to Text Appwrite Function
==========================================
Converts an image to text using the EasyOCR REST API (https://api.easyocr.org/ocr).

Accepts (POST application/json) — one of:
  { "imageUrl":    "https://..." }
  { "imageBase64": "<base64-string>" }

Optional:
  { "language": "en" }   — OCR language code (default: "en")

Returns (200 application/json):
  { "success": true,  "text": "extracted text..." }
  { "success": false, "error": "..." }
"""

import base64
import json
import os

import requests

EASYOCR_API_URL = "https://api.easyocr.org/ocr"

# Full browser headers to pass Cloudflare's bot check
BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Origin": "https://www.jaided.ai",
    "Referer": "https://www.jaided.ai/easyocr/",
}


# ── helpers ───────────────────────────────────────────────────────────────────

def _get_image_bytes(body: dict) -> tuple[bytes, str]:
    """Returns (image_bytes, filename)."""
    if "imageBase64" in body:
        raw = body["imageBase64"]
        if "," in raw:
            raw = raw.split(",", 1)[1]
        return base64.b64decode(raw), "image.jpg"

    if "imageUrl" in body:
        url = body["imageUrl"]
        resp = requests.get(url, headers=BROWSER_HEADERS, timeout=15)
        resp.raise_for_status()
        filename = url.split("/")[-1].split("?")[0] or "image.jpg"
        return resp.content, filename

    raise ValueError("Provide either imageBase64 or imageUrl in the request body.")


def _extract_text(resp_body) -> str:
    """
    Extracts only the text from the EasyOCR API response.
    Handles formats:
      - JSON string: '{"words": [{"text": "...", ...}, ...]}'
      - Dict:        {"words": [{"text": "...", ...}, ...]}
      - List:        [[bbox, "text", score], ...]
    """
    # If it's a string, parse it first
    if isinstance(resp_body, str):
        resp_body = json.loads(resp_body)

    # Dict with "words" key — each word has a "text" field
    if isinstance(resp_body, dict):
        # Check for nested JSON string in "text" or "result" keys
        for key in ("text", "result"):
            val = resp_body.get(key)
            if isinstance(val, str):
                try:
                    parsed = json.loads(val)
                    return _extract_text(parsed)
                except json.JSONDecodeError:
                    return val

        if "words" in resp_body:
            return " ".join(w["text"] for w in resp_body["words"] if "text" in w)

    # List of [bbox, text, confidence]
    if isinstance(resp_body, list):
        return " ".join(item[1] for item in resp_body if len(item) >= 2)

    return str(resp_body)


# ── Appwrite function entry-point ─────────────────────────────────────────────

def main(context):
    # ── Parse body ────────────────────────────────────────────────────────────
    try:
        raw = context.req.body
        if isinstance(raw, (bytes, bytearray)):
            raw = raw.decode("utf-8")
        body = json.loads(raw) if isinstance(raw, str) and raw.strip() else (raw or {})
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        return context.res.json({"success": False, "error": f"Invalid JSON: {exc}"}, status=400)

    # ── Resolve image bytes ───────────────────────────────────────────────────
    try:
        image_bytes, filename = _get_image_bytes(body)
        context.log(f"Image resolved — {len(image_bytes)} bytes.")
    except (ValueError, Exception) as exc:
        return context.res.json({"success": False, "error": str(exc)}, status=400)

    # ── Call EasyOCR API ──────────────────────────────────────────────────────
    try:
        language = body.get("language", "en")
        files = {"file": (filename, image_bytes, "image/jpeg")}
        data  = {"lang": language}

        resp = requests.post(
            EASYOCR_API_URL,
            files=files,
            data=data,
            headers=BROWSER_HEADERS,
            timeout=30,
        )
        resp.raise_for_status()

        resp_body = resp.json()

        # Parse text from response — handle all known formats
        text = _extract_text(resp_body)
        context.log(f"OCR complete — {len(text)} characters extracted.")

        return context.res.json({"success": True, "text": text.strip()})

    except requests.HTTPError as exc:
        err = f"EasyOCR API HTTP {exc.response.status_code}: {exc.response.text}"
        context.error(err)
        return context.res.json({"success": False, "error": err}, status=502)
    except Exception as exc:
        context.error(f"EasyOCR API error: {exc}")
        return context.res.json({"success": False, "error": str(exc)}, status=502)
