import base64
import json
import requests

EASYOCR_API_URL = "https://api.easyocr.org/ocr"
BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Origin": "https://www.jaided.ai",
    "Referer": "https://www.jaided.ai/easyocr/",
}

def _get_image_bytes(body: dict):
    if "imageBase64" in body:
        raw = body["imageBase64"]
        if "," in raw:
            raw = raw.split(",", 1)[1]
        return base64.b64decode(raw)
    if "imageUrl" in body:
        resp = requests.get(body["imageUrl"], headers=BROWSER_HEADERS, timeout=15)
        resp.raise_for_status()
        return resp.content
    raise ValueError("Missing image data")

def main(context):
    try:
        # Appwrite automatically parses JSON bodies into dicts
        body = context.req.body
        if isinstance(body, str):
            body = json.loads(body)
    except Exception as e:
        return context.res.json({"success": False, "error": "Invalid JSON"}, 400)

    try:
        image_bytes = _get_image_bytes(body)
        
        # Use a generic filename to avoid character issues
        files = {"file": ("image.webp", image_bytes, "image/webp")}
        data = {"lang": body.get("language", "en")}

        resp = requests.post(
            EASYOCR_API_URL,
            files=files,
            data=data,
            headers=BROWSER_HEADERS,
            timeout=30
        )
        resp.raise_for_status()

        # Extract only the text into a clean paragraph
        ocr_result = resp.json()
        extracted_text = ""
        if "words" in ocr_result:
            words = [item["text"] for item in ocr_result["words"] if "text" in item]
            extracted_text = " ".join(words)

        return context.res.json({
            "success": True,
            "text": extracted_text,
        }, 200)

    except requests.HTTPError as exc:
        context.error(f"EasyOCR API Error: {exc.response.text}")
        return context.res.json({"success": False, "error": f"API Error {exc.response.status_code}"}, 502)
    except Exception as exc:
        context.error(f"Function Crash: {str(exc)}")
        return context.res.json({"success": False, "error": str(exc)}, 500)
