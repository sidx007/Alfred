import json
import os
from dotenv import load_dotenv
from appwrite.client import Client
from appwrite.services.functions import Functions
import base64
load_dotenv()

PROJECT_ID   = os.getenv("EXPO_PUBLIC_APPWRITE_PROJECT_ID", "")
FUNCTION_ID  = os.getenv("EXPO_PUBLIC_AUDIOFUNCTION_ID", "")
API_KEY      = os.getenv("EXPO_PUBLIC_APPWRITE_API_KEY", "")
ENDPOINT     = os.getenv("APPWRITE_ENDPOINT", "https://sgp.cloud.appwrite.io/v1")


def invoke_audio_function(request_body: dict) -> dict:
    # Strip data URL prefix from base64 if present
    if "audioBase64" in request_body:
        raw = request_body["audioBase64"]
        if "," in raw:
            raw = raw.split(",", 1)[1]
        request_body = {**request_body, "audioBase64": raw}

    client = Client()
    client.set_endpoint(ENDPOINT)
    client.set_project(PROJECT_ID)
    client.set_key(API_KEY)

    execution = Functions(client).create_execution(
        function_id=FUNCTION_ID,
        body=json.dumps(request_body),
        xasync=False,
        method="POST",
    )

    status      = execution.get("status")
    response    = execution.get("responseBody", "")
    status_code = execution.get("responseStatusCode")

    if status != "completed":
        raise RuntimeError(f"Execution failed: status={status!r}")
    if status_code and int(status_code) >= 400:
        raise RuntimeError(f"HTTP {status_code}: {response}")

    try:
        return json.loads(response)
    except (json.JSONDecodeError, TypeError):
        return {"raw": response}

if __name__ == "__main__":
    with open(f"C:\\Users\\User\\Desktop\\projects\\alfred\\appwrite\\audioFunction\\Recording.m4a", "rb") as f:
        audio_bytes = f.read()
    print(invoke_audio_function({
        "audioBase64": base64.b64encode(audio_bytes).decode("utf-8"),
        "language": "en",
    }))