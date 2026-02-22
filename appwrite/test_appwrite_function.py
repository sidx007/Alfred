"""
Appwrite Function Test Template
================================
Tests a deployed Appwrite function via the Appwrite SDK.

Required environment variables:
  APPWRITE_PROJECT_ID  - Your Appwrite project ID
  APPWRITE_FUNCTION_ID - The function ID to invoke
  APPWRITE_API_KEY     - An Appwrite API key with execution:any scope

Optional:
  APPWRITE_ENDPOINT    - Appwrite endpoint (default: https://cloud.appwrite.io/v1)

Usage:
  pip install appwrite
  APPWRITE_PROJECT_ID=xxx APPWRITE_FUNCTION_ID=yyy APPWRITE_API_KEY=zzz python test_appwrite_function.py
"""

import json
import os
import sys

from appwrite.client import Client
from appwrite.services.functions import Functions


# ---------------------------------------------------------------------------
# Configuration (from environment variables)
# ---------------------------------------------------------------------------

PROJECT_ID  = os.environ.get("APPWRITE_PROJECT_ID", "")
FUNCTION_ID = os.environ.get("APPWRITE_FUNCTION_ID", "")
API_KEY     = os.environ.get("APPWRITE_API_KEY", "")
ENDPOINT    = os.environ.get("APPWRITE_ENDPOINT", "https://cloud.appwrite.io/v1")

# ---------------------------------------------------------------------------
# Payload – edit this dict to match the body your function expects
# ---------------------------------------------------------------------------

REQUEST_BODY = {
    # Example: pass a public image URL for imageFunction
    # "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png",
    # Example: pass a public audio URL for audioFunction
    # "audioUrl": "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def validate_config():
    missing = [k for k, v in {
        "APPWRITE_PROJECT_ID":  PROJECT_ID,
        "APPWRITE_FUNCTION_ID": FUNCTION_ID,
        "APPWRITE_API_KEY":     API_KEY,
    }.items() if not v]
    if missing:
        print("[ERROR] Missing required environment variables:", ", ".join(missing))
        sys.exit(1)


def build_client() -> Client:
    client = Client()
    client.set_endpoint(ENDPOINT)
    client.set_project(PROJECT_ID)
    client.set_key(API_KEY)
    return client


# ---------------------------------------------------------------------------
# Test runner
# ---------------------------------------------------------------------------

def run_test():
    validate_config()

    print(f"Endpoint  : {ENDPOINT}")
    print(f"Project ID: {PROJECT_ID}")
    print(f"Function  : {FUNCTION_ID}")
    print(f"Payload   : {json.dumps(REQUEST_BODY, indent=2)}")
    print("-" * 60)

    client    = build_client()
    functions = Functions(client)

    # Execute the function synchronously (async=False waits for completion)
    execution = functions.create_execution(
        function_id=FUNCTION_ID,
        body=json.dumps(REQUEST_BODY),
        async_=False,
        method="POST",
    )

    status      = execution.get("status")
    response    = execution.get("responseBody", "")
    status_code = execution.get("responseStatusCode")
    duration    = execution.get("duration")

    print(f"Status        : {status}")
    print(f"HTTP Code     : {status_code}")
    print(f"Duration (s)  : {duration}")
    print("-" * 60)

    # Pretty-print JSON response if possible
    try:
        parsed = json.loads(response)
        print("Response (JSON):")
        print(json.dumps(parsed, indent=2, ensure_ascii=False))
    except (json.JSONDecodeError, TypeError):
        print("Response (raw):")
        print(response)

    # Fail loudly on non-2xx or function-level error
    if status != "completed":
        print(f"\n[FAIL] Execution did not complete successfully (status={status!r})")
        sys.exit(1)
    if status_code and int(status_code) >= 400:
        print(f"\n[FAIL] Function returned HTTP {status_code}")
        sys.exit(1)

    print("\n[PASS] Function executed successfully.")


if __name__ == "__main__":
    run_test()
