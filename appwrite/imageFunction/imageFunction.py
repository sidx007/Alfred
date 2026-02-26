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
    context.log("=== imageFunction START ===")
    try:
        body = context.req.body
        context.log(f"Body type: {type(body).__name__}, keys: {list(body.keys()) if isinstance(body, dict) else 'N/A'}")
        if isinstance(body, str):
            body = json.loads(body)
            context.log(f"Parsed JSON string, keys: {list(body.keys())}")
    except Exception as e:
        context.error(f"JSON parse error: {e}")
        return context.res.json({"success": False, "error": "Invalid JSON"}, 400)

    try:
        context.log("Building data URI...")
        data_uri = _get_base64_data_uri(body)
        context.log(f"Data URI length: {len(data_uri)} chars")

        lang = body.get("language", "en")
        ocr_lang = _LANG_MAP.get(lang, "eng")
        context.log(f"Language: {lang} -> {ocr_lang}")

        api_key = os.environ.get("OCR_SPACE_API_KEY", "helloworld")
        context.log(f"API key present: {bool(api_key)}, using: {api_key[:8]}...")

        context.log(f"Sending POST to {OCR_SPACE_URL} ...")
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
        context.log(f"OCR.space response: HTTP {resp.status_code}, length: {len(resp.text)}")
        resp.raise_for_status()

        result = resp.json()
        context.log(f"OCR exit code: {result.get('OCRExitCode')}, processing time: {result.get('ProcessingTimeInMilliseconds')}ms")

        parsed = result.get("ParsedResults", [])
        context.log(f"ParsedResults count: {len(parsed)}")

        if not parsed:
            error_msg = result.get("ErrorMessage") or result.get("ErrorDetails") or "No results"
            context.error(f"No parsed results: {error_msg}")
            context.log(f"Full response: {json.dumps(result)[:1000]}")
            return context.res.json({"success": False, "error": error_msg}, 502)

        extracted_text = " ".join(
            p.get("ParsedText", "").strip() for p in parsed if p.get("ParsedText")
        )
        context.log(f"Extracted text ({len(extracted_text)} chars): {extracted_text[:200]!r}")
        context.log("=== imageFunction SUCCESS ===")

        return context.res.json({
            "success": True,
            "text": extracted_text,
        }, 200)

    except requests.HTTPError as exc:
        context.error(f"OCR.space HTTP Error: {exc.response.status_code} - {exc.response.text[:500]}")
        return context.res.json({"success": False, "error": f"API Error {exc.response.status_code}"}, 502)
    except Exception as exc:
        context.error(f"Function Crash: {type(exc).__name__}: {str(exc)}")
        import traceback
        context.error(traceback.format_exc())
        return context.res.json({"success": False, "error": str(exc)}, 500)
