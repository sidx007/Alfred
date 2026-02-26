import base64
import json
import os
import requests

OCR_SPACE_URL = "https://api.ocr.space/parse/image"

_LANG_MAP = {
    "en": "eng", "fr": "fre", "de": "ger", "es": "spa", "pt": "por",
    "it": "ita", "ja": "jpn", "ko": "kor", "zh": "chs", "ar": "ara",
}


def _get_base64_data_uri(body: dict) -> str:
    if "imageBase64" in body:
        raw = body["imageBase64"]
        if raw.startswith("data:"):
            return raw
        if "," in raw:
            raw = raw.split(",", 1)[1]
        return f"data:image/png;base64,{raw}"
    if "imageUrl" in body:
        resp = requests.get(body["imageUrl"], timeout=15)
        resp.raise_for_status()
        b64 = base64.b64encode(resp.content).decode()
        return f"data:image/png;base64,{b64}"
    raise ValueError("Missing image data")


def main():
    from PIL import Image, ImageDraw
    import io

    # Generate a test image with text
    img = Image.new("RGB", (300, 60), color="white")
    d = ImageDraw.Draw(img)
    d.text((10, 15), "Hello World OCR Test", fill="black")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode()

    data_uri = f"data:image/png;base64,{b64}"
    api_key = 'K81094151588957'

    print(f"Sending image ({len(b64)} chars base64) to OCR.space...")
    resp = requests.post(
        OCR_SPACE_URL,
        data={
            "base64Image": data_uri,
            "language": "eng",
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
        print("ERROR: No parsed results")
        print(json.dumps(result, indent=2))
        return

    extracted = " ".join(
        p.get("ParsedText", "").strip() for p in parsed if p.get("ParsedText")
    )
    print(f"Extracted text: {extracted!r}")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
