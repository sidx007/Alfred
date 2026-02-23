import json
import os
from dotenv import load_dotenv
from appwrite.client import Client
from appwrite.services.functions import Functions

load_dotenv()

PROJECT_ID  = os.getenv("APPWRITE_PROJECT_ID", "")
FUNCTION_ID = os.getenv("PROCESSSEGMENTFUNCTION_ID", "")
API_KEY     = os.getenv("APPWRITE_API_KEY", "")
ENDPOINT    = os.getenv("APPWRITE_ENDPOINT", "https://sgp.cloud.appwrite.io/v1")


def invoke_process_segment(request_body: dict) -> dict:
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

    print("--- FULL EXECUTION ---")
    print(json.dumps(execution, indent=2, default=str))
    print("--- END ---")

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
    sample_segment = (
        "Nothing Phone company has been progressing very well in the past few years."
        "the qonq growth has been very good and net revenue has been positive."

    )
    result = invoke_process_segment({"segment": sample_segment})
    print(json.dumps(result, indent=2))
