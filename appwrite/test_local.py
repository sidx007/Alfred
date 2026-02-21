import json
import sys
import os

# ── Load .env from project root ───────────────────────────────────────────────
def load_env(env_path: str):
    if not os.path.exists(env_path):
        return
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip())

env_file = os.path.join(os.path.dirname(__file__), "..", ".env")
load_env(env_file)

# ── Mock Appwrite context ─────────────────────────────────────────────────────
class MockRes:
    def json(self, data, status=200):
        print(f"\n[{status}] Response:")
        print(json.dumps(data, indent=2, ensure_ascii=False))
        return data

class MockReq:
    def __init__(self, body: dict):
        self.body = json.dumps(body)
        self.method = "POST"

class MockContext:
    def __init__(self, body: dict):
        self.req = MockReq(body)
        self.res = MockRes()
    def log(self, msg):   print(f"[LOG]   {msg}")
    def error(self, msg): print(f"[ERROR] {msg}", file=sys.stderr)

# ── Run ───────────────────────────────────────────────────────────────────────
from imageFunction import main

# Test with a public image that contains text:
ctx = MockContext({"imageUrl": "https://raw.githubusercontent.com/JaidedAI/EasyOCR/master/examples/english.png"})
main(ctx)

# Or test with a local image as base64:
# import base64
# with open("test.jpg", "rb") as f:
#     b64 = base64.b64encode(f.read()).decode()
# ctx = MockContext({"imageBase64": b64})
# main(ctx)
