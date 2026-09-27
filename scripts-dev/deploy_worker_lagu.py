#!/usr/bin/env python3
"""
Deploy Cloudflare Worker "wa-release-bot-lagu" (lagu/worker/worker.js).

  CF_API_TOKEN=... CF_ACCOUNT_ID=... CF_KV_LAGU=... [GROQ_API_KEY=...] \\
      python3 scripts-dev/deploy_worker_lagu.py

- daftar lagu dari lagu/daftar.txt disuntik ke kode (ganti daftar → deploy ulang)
- GROQ_API_KEY (kalau di-set) dipasang sebagai secret Worker, bukan di kode
"""
import json
import os
import urllib.request
from pathlib import Path

AKAR = Path(__file__).resolve().parent.parent
NAMA = "wa-release-bot-lagu"


def api(method, path, data=None, ct="application/json"):
    url = f"https://api.cloudflare.com/client/v4/accounts/{os.environ['CF_ACCOUNT_ID']}{path}"
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": "Bearer " + os.environ["CF_API_TOKEN"], "Content-Type": ct})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


daftar = []
for baris in (AKAR / "lagu/daftar.txt").read_text(encoding="utf-8").splitlines():
    baris = baris.strip()
    if baris and not baris.startswith("#") and " - " in baris:
        a, j = baris.split(" - ", 1)
        daftar.append({"artis": a.strip(), "judul": j.strip()})

kode = (AKAR / "lagu/worker/worker.js").read_text(encoding="utf-8")
kode = kode.replace("__DAFTAR__", json.dumps(daftar, ensure_ascii=False), 1)
ayat = json.loads((AKAR / "lagu/ayat.json").read_text(encoding="utf-8"))
kode = kode.replace("__AYAT__", json.dumps(ayat, ensure_ascii=False), 1)
meta = {
    "main_module": "worker.js",
    "compatibility_date": "2026-09-01",
    "bindings": [{"type": "kv_namespace", "name": "LAGU", "namespace_id": os.environ["CF_KV_LAGU"]}],
    "keep_bindings": ["secret_text"],
}
bd = "----wrb-lagu-deploy"
body = b""
for nama, fn, ct, isi in [("metadata", None, "application/json", json.dumps(meta)),
                          ("worker.js", "worker.js", "application/javascript+module", kode)]:
    body += f'--{bd}\r\nContent-Disposition: form-data; name="{nama}"'.encode()
    body += (f'; filename="{fn}"'.encode() if fn else b"") + f"\r\nContent-Type: {ct}\r\n\r\n".encode()
    body += isi.encode() + b"\r\n"
body += f"--{bd}--\r\n".encode()
r = api("PUT", f"/workers/scripts/{NAMA}", body, "multipart/form-data; boundary=" + bd)
print("deploy:", r["success"], f"({len(daftar)} lagu)")

if os.environ.get("GROQ_API_KEY"):
    r = api("PUT", f"/workers/scripts/{NAMA}/secrets",
            json.dumps({"name": "GROQ_API_KEY", "text": os.environ["GROQ_API_KEY"], "type": "secret_text"}).encode())
    print("secret GROQ_API_KEY:", r["success"])
