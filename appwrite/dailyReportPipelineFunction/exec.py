"""
Local test harness for dailyReportPipelineFunction.
Invokes the function via the Appwrite REST API.
"""
import json
import os
import sys
import time

# Load env from the project root .env
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))

from appwrite.client import Client
from appwrite.services.functions import Functions

FUNCTION_ID = os.environ.get("DAILYREPORTPIPELINEFUNCTION_ID", "")
PROJECT_ID = os.environ.get("EXPO_PUBLIC_APPWRITE_PROJECT_ID", "")
API_KEY = os.environ.get("EXPO_PUBLIC_APPWRITE_API_KEY", "")
ENDPOINT = os.environ.get(
    "APPWRITE_ENDPOINT",
    os.environ.get("EXPO_PUBLIC_APPWRITE_ENDPOINT", "https://sgp.cloud.appwrite.io/v1"),
)

if not FUNCTION_ID:
    print("ERROR: DAILYREPORTPIPELINEFUNCTION_ID not set in .env")
    sys.exit(1)


def _invoke(function_id: str, body: dict | None, xasync: bool = False):
    """Invoke an Appwrite function and return parsed JSON."""
    client = Client()
    client.set_endpoint(ENDPOINT).set_project(PROJECT_ID).set_key(API_KEY)
    functions = Functions(client)

    execution = functions.create_execution(
        function_id=function_id,
        body=json.dumps(body) if body else "",
        xasync=xasync,
        method="POST",
    )

    if xasync:
        exec_id = execution["$id"]
        print(f"  Async execution started: {exec_id}")
        for _ in range(60):
            time.sleep(5)
            execution = functions.get_execution(function_id, exec_id)
            status = execution.get("status")
            if status == "completed":
                break
            if status == "failed":
                print(f"Execution failed. Errors: {execution.get('errors', 'N/A')}")
                sys.exit(1)
            print(f"  Polling... status={status}")
        else:
            print("Timed out waiting for async execution.")
            sys.exit(1)

    status = execution.get("status")
    if status != "completed":
        print(f"Execution {status}: {execution.get('errors', 'N/A')}")
        sys.exit(1)

    body_str = execution.get("responseBody", "")
    if not body_str:
        print("Empty response body.")
        print("--- LOGS ---")
        print(execution.get("logs", ""))
        print("--- ERRORS ---")
        print(execution.get("errors", ""))
        sys.exit(1)

    return json.loads(body_str)


if __name__ == "__main__":
    print("=== Invoking Daily Report Pipeline ===")
    print(f"Function ID: {FUNCTION_ID}")
    print()

    result = _invoke(FUNCTION_ID, {}, xasync=True)

    if result.get("success"):
        print(f"\n✓ Pipeline complete!")
        print(f"  Date: {result.get('date')}")
        print(f"  Reports generated: {result.get('reportsGenerated')}")
        if result.get("summary"):
            print("\n  Topics:")
            for s in result["summary"]:
                print(f"    - {s['topic']}: {s['memoryChunks']} mem, {s['kbChunks']} KB")
    else:
        print(f"\n✗ Failed: {result.get('error')}")
        sys.exit(1)
