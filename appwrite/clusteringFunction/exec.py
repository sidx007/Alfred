import json
import os
from dotenv import load_dotenv
from appwrite.client import Client
from appwrite.services.functions import Functions

load_dotenv()

PROJECT_ID  = os.getenv("APPWRITE_PROJECT_ID", "")
FUNCTION_ID = os.getenv("CLUSTERINGFUNCTION_ID", "")
API_KEY     = os.getenv("APPWRITE_API_KEY", "")
ENDPOINT    = os.getenv("APPWRITE_ENDPOINT", "https://sgp.cloud.appwrite.io/v1")


def invoke_clustering_function(request_body: dict) -> dict:
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
    sample_paragraph = (
        "The French Revolution began in 1789 and fundamentally transformed "
        "European politics. France is located in Western Europe and shares "
        "borders with Belgium, Luxembourg, Germany, Switzerland, Italy, Spain, "
        "and Andorra. The revolution led to the rise of Napoleon Bonaparte, "
        "who crowned himself Emperor in 1804. Meanwhile, the Alps mountain "
        "range stretches across eight countries and is home to Mont Blanc, the "
        "highest peak in Western Europe at 4,808 metres."
    )

    result = invoke_clustering_function({"paragraph": sample_paragraph})
    print(json.dumps(result, indent=2))
