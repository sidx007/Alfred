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
    "The French Revolution began in 1789 and fundamentally transformed European politics, "
    "leading to the abolition of the monarchy and the rise of radical republican ideals. "
    "France, located in Western Europe, shares borders with Belgium, Luxembourg, Germany, "
    "Switzerland, Italy, Spain, and Andorra, and has a population of over 68 million people. "
    "The revolution gave rise to Napoleon Bonaparte, who crowned himself Emperor in 1804 and "
    "went on to conquer much of continental Europe before his defeat at the Battle of Waterloo in 1815. "
    "Meanwhile, the Alps mountain range stretches across eight countries including France, Switzerland, "
    "Austria, and Italy, and is home to Mont Blanc, the highest peak in Western Europe at 4,808 metres. "
    "The Industrial Revolution, which began in Britain around 1760, introduced steam-powered machinery "
    "and mass production, fundamentally changing labor and economic structures across the globe. "
    "Machine learning is a subset of artificial intelligence that enables computers to learn from data "
    "without being explicitly programmed, with key algorithms including decision trees, neural networks, "
    "and support vector machines. "
    "The human brain contains approximately 86 billion neurons, each forming thousands of synaptic "
    "connections, making it the most complex biological structure known to science. "
    "Climate change, driven largely by the burning of fossil fuels since the Industrial Revolution, "
    "has caused global average temperatures to rise by approximately 1.1 degrees Celsius since 1850. "
    "The Amazon rainforest spans over 5.5 million square kilometres across nine countries in South America "
    "and is home to 10 percent of all species on Earth, making it critical to global biodiversity. "
    "Python is a high-level, interpreted programming language created by Guido van Rossum and first "
    "released in 1991, widely used today in web development, data science, and artificial intelligence. "
    "The 2008 global financial crisis, triggered by the collapse of the US housing market and the failure "
    "of mortgage-backed securities, led to the worst economic recession since the Great Depression of 1929."
    )
    result = invoke_clustering_function({"paragraph": sample_paragraph})
print(json.dumps(result, indent=2))
