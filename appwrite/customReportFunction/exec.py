import json
import os
import sys
import time
from dotenv import load_dotenv
from appwrite.client import Client
from appwrite.services.functions import Functions

load_dotenv()

PROJECT_ID  = os.getenv("EXPO_PUBLIC_APPWRITE_PROJECT_ID", "")
API_KEY     = os.getenv("EXPO_PUBLIC_APPWRITE_API_KEY", "")
ENDPOINT    = os.getenv("APPWRITE_ENDPOINT", "https://sgp.cloud.appwrite.io/v1")

FUNCTION_ID = os.getenv("CUSTOMREPORTFUNCTION_ID", "")

POLL_INTERVAL = 3
MAX_WAIT      = 120


def _invoke_async(request_body: dict) -> dict:
    client = Client()
    client.set_endpoint(ENDPOINT)
    client.set_project(PROJECT_ID)
    client.set_key(API_KEY)
    
    functions = Functions(client)

    execution = functions.create_execution(
        function_id=FUNCTION_ID,
        body=json.dumps(request_body),
        xasync=True,
        method="POST",
    )

    execution_id = execution.get("$id")
    print(f"  Async execution started: {execution_id}")

    elapsed = 0
    while elapsed < MAX_WAIT:
        time.sleep(POLL_INTERVAL)
        elapsed += POLL_INTERVAL
        execution = functions.get_execution(FUNCTION_ID, execution_id)
        status = execution.get("status")
        print(f"  Polling... status={status} ({elapsed}s)")
        if status in ("completed", "failed"):
            break

    status      = execution.get("status")
    response    = execution.get("responseBody", "")
    status_code = execution.get("responseStatusCode")

    if status != "completed":
        print(f"--- LOGS ---\n{execution.get('logs', 'No logs')}")
        print(f"--- ERRORS ---\n{execution.get('errors', 'No errors')}")
        raise RuntimeError(f"Execution failed: status={status!r}")

    if status_code and int(status_code) >= 400:
        print(f"--- LOGS ---\n{execution.get('logs', 'No logs')}")
        raise RuntimeError(f"HTTP {status_code}: {response}")

    try:
        return json.loads(response)
    except (json.JSONDecodeError, TypeError):
        return {"raw": response}


if __name__ == "__main__":
    if not FUNCTION_ID:
        print("Error: CUSTOMREPORTFUNCTION_ID not set in .env")
        sys.exit(1)

    topics = ["Classics", "Business"]
    print(f"=== Generating custom report for {topics}... ===")
    
    try:
        result = _invoke_async({"topics": topics})
        print("\n--- REPORT ---")
        print(result.get("report", "No report content found."))
        print("\n--- METADATA ---")
        print(f"Topics: {result.get('topics')}")
        print(f"Segments used: {result.get('segmentsUsed')}")
    except Exception as e:
        print(f"Error: {e}")
