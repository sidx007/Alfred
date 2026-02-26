import base64
import io
import json
import os
import requests
from PIL import Image

OCR_SPACE_URL = "https://api.ocr.space/parse/image"
MAX_FILE_KB = 1024

# Language mapping: short codes -> OCR.space engine-1 language codes
_LANG_MAP = {
    "en": "eng", "fr": "fre", "de": "ger", "es": "spa", "pt": "por",
    "it": "ita", "ja": "jpn", "ko": "kor", "zh": "chs", "ar": "ara",
    "hi": "hin", "ru": "rus", "nl": "dut", "pl": "pol", "tr": "tur",
}


def _compress_image_bytes(img_bytes: bytes, max_kb: int = MAX_FILE_KB) -> tuple[bytes, str]:
    """Compress image to fit under max_kb. Returns (compressed_bytes, mime_type)."""
    img = Image.open(io.BytesIO(img_bytes))
    # Convert RGBA/palette to RGB for JPEG
    if img.mode in ("RGBA", "P", "LA"):
        img = img.convert("RGB")

    # If already small enough as PNG, return as-is
    if len(img_bytes) <= max_kb * 1024:
        return img_bytes, "image/png"

    # Try JPEG at decreasing quality
    for quality in (85, 70, 50, 35, 20):
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=quality, optimize=True)
        data = buf.getvalue()
        if len(data) <= max_kb * 1024:
            return data, "image/jpeg"

    # Still too large — resize down
    for scale in (0.75, 0.5, 0.35, 0.25):
        resized = img.resize(
            (int(img.width * scale), int(img.height * scale)),
            Image.LANCZOS,
        )
        buf = io.BytesIO()
        resized.save(buf, format="JPEG", quality=50, optimize=True)
        data = buf.getvalue()
        if len(data) <= max_kb * 1024:
            return data, "image/jpeg"

    # Last resort: smallest resize at lowest quality
    buf = io.BytesIO()
    resized.save(buf, format="JPEG", quality=20, optimize=True)
    return buf.getvalue(), "image/jpeg"


def _get_base64_data_uri(body: dict, context=None) -> str:
    """Decode image, compress under 1MB, return as data URI."""
    if "imageBase64" in body:
        raw = body["imageBase64"]
        if raw.startswith("data:"):
            raw = raw.split(",", 1)[1]
        elif "," in raw:
            raw = raw.split(",", 1)[1]
        img_bytes = base64.b64decode(raw)
    elif "imageUrl" in body:
        resp = requests.get(body["imageUrl"], timeout=15)
        resp.raise_for_status()
        img_bytes = resp.content
    else:
        raise ValueError("Missing image data")

    original_kb = len(img_bytes) / 1024
    if context:
        context.log(f"Original image: {original_kb:.1f} KB")

    compressed, mime = _compress_image_bytes(img_bytes)
    compressed_kb = len(compressed) / 1024
    if context:
        context.log(f"Compressed image: {compressed_kb:.1f} KB ({mime})")

    b64 = base64.b64encode(compressed).decode()
    ext = "jpeg" if "jpeg" in mime else "png"
    return f"data:image/{ext};base64,{b64}"


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
