import base64
import json
import requests

EASYOCR_API_URL = "https://api.easyocr.org/ocr"
BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Origin": "https://www.jaided.ai",
    "Referer": "https://www.jaided.ai/easyocr/",
}

def _guess_mime(data: bytes) -> str:
    if data[:8] == b'\x89PNG\r\n\x1a\n': return "image/png"
    if data[:2] == b'\xff\xd8': return "image/jpeg"
    if data[:4] == b'RIFF' and data[8:12] == b'WEBP': return "image/webp"
    return "image/jpeg"

def _get_image_bytes(body: dict) -> tuple[bytes, str]:
    if "imageBase64" in body:
        raw = body["imageBase64"]
        if "," in raw:
            raw = raw.split(",", 1)[1]
        return base64.b64decode(raw), "image.jpg"
    if "imageUrl" in body:
        url = body["imageUrl"]
        resp = requests.get(url, headers=BROWSER_HEADERS, timeout=15)
        resp.raise_for_status()
        return resp.content, "image.jpg"
    raise ValueError("Provide imageBase64 or imageUrl")

def main(context):
    try:
        body = context.req.body
        if isinstance(body, str):
            body = json.loads(body)
    except Exception as exc:
        context.res.set_status(400)
        return context.res.json({"success": False, "error": f"Invalid JSON: {exc}"})

    try:
        image_bytes, filename = _get_image_bytes(body)
        mime = _guess_mime(image_bytes)
        
        # Using the standard multipart/form-data expected by the API
        files = {"file": (filename, image_bytes, mime)}
        data = {"lang": body.get("language", "en")}

        resp = requests.post(
            EASYOCR_API_URL,
            files=files,
            data=data,
            headers=BROWSER_HEADERS,
            timeout=30,
        )
        resp.raise_for_status()
        
        # The API returns a list or dict; we just return the whole result for now
        return context.res.json({"success": True, "data": resp.json()})

    except requests.HTTPError as exc:
        context.error(f"API Error: {exc.response.text}")
        context.res.set_status(502)
        return context.res.json({"success": False, "error": f"EasyOCR API HTTP {exc.response.status_code}"})
    except Exception as exc:
        context.error(f"Function error: {exc}")
        context.res.set_status(500)
        return context.res.json({"success": False, "error": str(exc)})
