import requests
from pathlib import Path
import sys

p = Path("uploaded_docs/sample.txt")

print("exists:", p.exists(), "path:", p.resolve())

if not p.exists():
    sys.exit("❌ File missing")

with p.open("rb") as f:
    r = requests.post("http://127.0.0.1:8000/api/docs/upload", files={"files": ("sample.txt", f)})

print("status:", r.status_code)
print("response text:", r.text)
