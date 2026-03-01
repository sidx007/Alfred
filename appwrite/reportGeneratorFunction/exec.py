import json
import os
import sys
from dotenv import load_dotenv
from appwrite.client import Client
from appwrite.services.functions import Functions

load_dotenv()

PROJECT_ID  = os.getenv("EXPO_PUBLIC_APPWRITE_PROJECT_ID", "")
API_KEY     = os.getenv("EXPO_PUBLIC_APPWRITE_API_KEY", "")
ENDPOINT    = os.getenv("APPWRITE_ENDPOINT", "https://sgp.cloud.appwrite.io/v1")

REPORT_FUNCTION_ID   = os.getenv("REPORTGENERATORFUNCTION_ID", "")
REVISION_FUNCTION_ID = os.getenv("REVISIONCHUNKSFUNCTION_ID", "")


def _invoke(function_id: str, request_body: dict) -> dict:
    client = Client()
    client.set_endpoint(ENDPOINT)
    client.set_project(PROJECT_ID)
    client.set_key(API_KEY)

    execution = Functions(client).create_execution(
        function_id=function_id,
        body=json.dumps(request_body),
        xasync=False,
        method="POST",
    )

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
    # Step 1: Fetch clustered chunks from revisionChunksFunction
    print("=== Fetching revision chunks... ===")
    chunks_result = _invoke(REVISION_FUNCTION_ID, {})
    clustered = chunks_result.get("clusteredChunks", {})

    if not clustered:
        print("No chunks found for revision dates. Nothing to report.")
        sys.exit(0)

    print(f"Found {len(clustered)} topic(s):")
    for topic, data in clustered.items():
        print(f"  - {topic}: {len(data.get('memory', []))} memory, {len(data.get('knowledgeBase', []))} KB")

    # Step 2: Pick the first topic and generate a report
    first_topic = next(iter(clustered))
    topic_data = clustered[first_topic]

    print(f"\n=== Generating report for '{first_topic}'... ===")
    report_result = _invoke(REPORT_FUNCTION_ID, {
        "topic": first_topic,
        "memoryIds": topic_data.get("memory", []),
        "knowledgeBaseIds": topic_data.get("knowledgeBase", []),
    })

    print(json.dumps(report_result, indent=2))
