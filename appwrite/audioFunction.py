import base64
import json
import os
import requests

DEEPGRAM_API_URL = "https://api.deepgram.com/v1/listen"

def _get_audio_bytes(body: dict):
    if "audioBase64" in body:
        raw = body["audioBase64"]
        if "," in raw:
            raw = raw.split(",", 1)[1]
        return base64.b64decode(raw)
    if "audioUrl" in body:
        resp = requests.get(body["audioUrl"], timeout=30)
        resp.raise_for_status()
        return resp.content
    raise ValueError("Missing audio data (provide 'audioBase64' or 'audioUrl')")

def main(context):
    try:
        body = context.req.body
        if isinstance(body, str):
            body = json.loads(body)
    except Exception:
        return context.res.json({"success": False, "error": "Invalid JSON"}, 400)

    try:
        api_key = os.environ.get("DEEPGRAM_API_KEY", "")
        if not api_key:
            return context.res.json({"success": False, "error": "DEEPGRAM_API_KEY not set"}, 500)

        audio_bytes = _get_audio_bytes(body)
        content_type = body.get("contentType", "audio/wav")
        language = body.get("language", "en")

        headers = {
            "Authorization": f"Token {api_key}",
            "Content-Type": content_type,
        }

        params = {
            "model": "nova-3",
            "language": language,
            "smart_format": "true",
            "punctuate": "true",
        }

        resp = requests.post(
            DEEPGRAM_API_URL,
            headers=headers,
            params=params,
            data=audio_bytes,
            timeout=60,
        )
        resp.raise_for_status()

        result = resp.json()
        transcript = ""
        channels = result.get("results", {}).get("channels", [])
        if channels:
            alternatives = channels[0].get("alternatives", [])
            if alternatives:
                transcript = alternatives[0].get("transcript", "")

        return context.res.json({
            "success": True,
            "text": transcript,
        }, 200)

    except requests.HTTPError as exc:
        context.error(f"Deepgram API Error: {exc.response.text}")
        return context.res.json({"success": False, "error": f"API Error {exc.response.status_code}"}, 502)
    except Exception as exc:
        context.error(f"Function Crash: {str(exc)}")
        return context.res.json({"success": False, "error": str(exc)}, 500)
