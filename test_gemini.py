import json
import os
import ssl
import urllib.request

# Disable SSL verification for MSYS2/Windows cert store issues (test only)
_ssl_ctx = ssl.create_default_context()
_ssl_ctx.check_hostname = False
_ssl_ctx.verify_mode = ssl.CERT_NONE


def load_dotenv(path=".env") -> dict:
    """Minimal .env parser (no external dependencies)."""
    env = {}
    try:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, _, v = line.partition("=")
                    env[k.strip()] = v.strip()
    except FileNotFoundError:
        pass
    return env


env = load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
GEMINI_API_KEY = env.get("GEMINI_API_KEY", "")

GEMINI_GENERATE_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "gemini-2.0-flash:generateContent"
)
GEMINI_EMBED_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "gemini-embedding-001:embedContent"
)


def _post(url: str, payload: dict, retries: int = 3) -> dict:
    import time
    data = json.dumps(payload).encode()
    for attempt in range(retries):
        req = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, context=_ssl_ctx) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < retries - 1:
                wait = 2 ** (attempt + 1)
                print(f"  Rate limited, retrying in {wait}s...")
                time.sleep(wait)
            else:
                raise


def test_generate(prompt: str = "Say hello in one sentence.") -> str:
    """Test Gemini text generation."""
    data = _post(
        f"{GEMINI_GENERATE_URL}?key={GEMINI_API_KEY}",
        {"contents": [{"parts": [{"text": prompt}]}]},
    )
    return data["candidates"][0]["content"]["parts"][0]["text"]


def test_embed(text: str = "Hello, world!") -> list[float]:
    """Test Gemini text embedding."""
    data = _post(
        f"{GEMINI_EMBED_URL}?key={GEMINI_API_KEY}",
        {
            "model": "models/gemini-embedding-001",
            "content": {"parts": [{"text": text}]},
        },
    )
    return data["embedding"]["values"]


if __name__ == "__main__":
    if not GEMINI_API_KEY:
        print("ERROR: GEMINI_API_KEY not found in .env")
        exit(1)

    print("=== Available Models ===")
    list_url = f"https://generativelanguage.googleapis.com/v1beta/models?key={GEMINI_API_KEY}"
    req = urllib.request.Request(list_url, method="GET")
    with urllib.request.urlopen(req, context=_ssl_ctx) as resp:
        models_data = json.loads(resp.read())
    for m in models_data.get("models", []):
        name = m.get("name", "")
        methods = m.get("supportedGenerationMethods", [])
        if "generateContent" in methods:
            print(f"  {name}  -->  {methods}")

    print("\n=== Gemini Generate ===")
    reply = test_generate()
    print(reply)

    # print("\n=== Gemini Embed ===")
    # vector = test_embed()
    # print(f"Embedding dimensions: {len(vector)}")
    # print(f"First 5 values: {vector[:5]}")
