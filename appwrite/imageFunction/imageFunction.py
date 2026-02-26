import base64
import json
import os
import requests

OCR_SPACE_URL = "https://api.ocr.space/parse/image"

# Language mapping: short codes -> OCR.space engine-1 language codes
_LANG_MAP = {
    "en": "eng", "fr": "fre", "de": "ger", "es": "spa", "pt": "por",
    "it": "ita", "ja": "jpn", "ko": "kor", "zh": "chs", "ar": "ara",
    "hi": "hin", "ru": "rus", "nl": "dut", "pl": "pol", "tr": "tur",
}


def _get_base64_data_uri(body: dict) -> str:
    """Return a data-URI string (data:image/png;base64,...) from the request body."""
    if "imageBase64" in body:
        raw = body["imageBase64"]
        # Already a data URI
        if raw.startswith("data:"):
            return raw
        # Strip accidental prefix
        if "," in raw:
            raw = raw.split(",", 1)[1]
        return f"data:image/png;base64,{raw}"
    if "imageUrl" in body:
        resp = requests.get(body["imageUrl"], timeout=15)
        resp.raise_for_status()
        b64 = base64.b64encode(resp.content).decode()
        return f"data:image/png;base64,{b64}"
    raise ValueError("Missing image data")


def main(context):
    try:
        body = context.req.body
        if isinstance(body, str):
            body = json.loads(body)
    except Exception:
        return context.res.json({"success": False, "error": "Invalid JSON"}, 400)

    try:
        data_uri = _get_base64_data_uri(body)
        lang = body.get("language", "en")
        ocr_lang = _LANG_MAP.get(lang, "eng")

        api_key = os.environ.get("OCR_SPACE_API_KEY", "helloworld")

        resp = requests.post(
            OCR_SPACE_URL,
            data={
                "base64Image": data_uri,
                "language": ocr_lang,
                "isOverlayRequired": "false",
                "OCREngine": "2",
            },
            headers={"apikey": api_key},
            timeout=30,
        )
        resp.raise_for_status()

        result = resp.json()
        parsed = result.get("ParsedResults", [])
        if not parsed:
            error_msg = result.get("ErrorMessage") or result.get("ErrorDetails") or "No results"
            return context.res.json({"success": False, "error": error_msg}, 502)

        extracted_text = " ".join(
            p.get("ParsedText", "").strip() for p in parsed if p.get("ParsedText")
        )

        return context.res.json({
            "success": True,
            "text": extracted_text,
        }, 200)

    except requests.HTTPError as exc:
        context.error(f"OCR.space API Error: {exc.response.text}")
        return context.res.json({"success": False, "error": f"API Error {exc.response.status_code}"}, 502)
    except Exception as exc:
        context.error(f"Function Crash: {str(exc)}")
        return context.res.json({"success": False, "error": str(exc)}, 500)
