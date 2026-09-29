#!/usr/bin/env python3
"""
Deploy landing page (web/) sebagai Cloudflare Worker + Static Assets: "wa-release-bot-web".

  CF_API_TOKEN=... [CF_ACCOUNT_ID=...] python3 scripts-dev/deploy_web.py [--cek]

Alur sama dengan `wrangler deploy` tapi tanpa npm/wrangler (aturan repo: tanpa
dependensi runtime tambahan; cuma butuh paket Python `blake3`):
  1. manifest {"/path": {"hash", "size"}}; hash = 32 hex pertama dari
     blake3(base64(isi) + ekstensi) -- persis rumus wrangler, server memakainya
     sebagai kunci konten;
  2. POST /workers/scripts/<nama>/assets-upload-session -> jwt + bucket hash yang
     belum ada di server (file yang tidak berubah tidak diunggah ulang);
  3. POST /workers/assets/upload?base64=true per bucket (Bearer jwt) -> jwt penyelesaian;
  4. PUT /workers/scripts/<nama> multipart: metadata (assets.jwt, binding ASSETS) + worker.js;
  5. POST /workers/scripts/<nama>/subdomain {enabled: true} -> <nama>.<akun>.workers.dev;
  6. PUT /workers/domains: pasang custom domain CF_WEB_DOMAIN (default wabot.projectkal.my.id,
     zone dicari otomatis; DNS + sertifikat dibuat Cloudflare). Kosongkan env untuk melewati.
--cek: hanya cetak manifest (tanpa token, tanpa jaringan).
"""
import base64
import json
import mimetypes
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

AKAR = Path(__file__).resolve().parent.parent
WEB = AKAR / "web"
NAMA = "wa-release-bot-web"
API = "https://api.cloudflare.com/client/v4"
MIME = {".woff2": "font/woff2", ".webp": "image/webp", ".ics": "text/calendar", ".js": "text/javascript", ".mjs": "text/javascript"}


def hash_wrangler(isi: bytes, ekstensi: str) -> str:
    try:
        import blake3  # pip install blake3
    except ImportError:
        sys.exit("butuh paket Python 'blake3':  pip install blake3")
    return blake3.blake3(base64.b64encode(isi) + ekstensi.encode()).hexdigest()[:32]


def daftar_aset():
    """Semua file di web/ kecuali worker.js (itu skripnya, bukan aset)."""
    hasil = {}
    for p in sorted(WEB.rglob("*")):
        if p.is_file() and p.name != "worker.js":
            rel = "/" + p.relative_to(WEB).as_posix()
            isi = p.read_bytes()
            hasil[rel] = {"isi": isi, "hash": hash_wrangler(isi, p.suffix.lstrip(".")), "size": len(isi),
                          "mime": MIME.get(p.suffix) or mimetypes.guess_type(p.name)[0] or "application/octet-stream"}
    return hasil


def api(method, path, data=None, ct="application/json", token=None):
    req = urllib.request.Request(API + path, data=data, method=method, headers={
        "Authorization": "Bearer " + (token or os.environ["CF_API_TOKEN"]), "Content-Type": ct})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f"{method} {path} -> HTTP {e.code}: {e.read()[:600].decode(errors='replace')}")


def multipart(bagian):
    """bagian: list (nama, filename|None, content-type, bytes) -> (body, boundary)."""
    bd = "----wrb-web-" + os.urandom(8).hex()
    body = b""
    for nama, fn, ct, isi in bagian:
        body += f'--{bd}\r\nContent-Disposition: form-data; name="{nama}"'.encode()
        body += (f'; filename="{fn}"'.encode() if fn else b"") + f"\r\nContent-Type: {ct}\r\n\r\n".encode()
        body += isi + b"\r\n"
    return body + f"--{bd}--\r\n".encode(), bd


def main():
    aset = daftar_aset()
    total = sum(a["size"] for a in aset.values())
    print(f"{len(aset)} aset, {total / 1024:.0f} KB")
    if "--cek" in sys.argv:
        for rel, a in aset.items():
            print(f"  {a['hash']}  {a['size']:>7}  {rel}")
        return
    if not os.environ.get("CF_ACCOUNT_ID"):
        os.environ["CF_ACCOUNT_ID"] = api("GET", "/accounts?per_page=1")["result"][0]["id"]
    acc = f"/accounts/{os.environ['CF_ACCOUNT_ID']}"

    manifest = {rel: {"hash": a["hash"], "size": a["size"]} for rel, a in aset.items()}
    sesi = api("POST", f"{acc}/workers/scripts/{NAMA}/assets-upload-session", json.dumps({"manifest": manifest}).encode())["result"]
    jwt = sesi.get("jwt")
    bucket = sesi.get("buckets") or []
    by_hash = {a["hash"]: a for a in aset.values()}
    print(f"unggah: {sum(len(b) for b in bucket)} file baru dalam {len(bucket)} bucket")
    for b in bucket:
        bagian = [(h, h, by_hash[h]["mime"], base64.b64encode(by_hash[h]["isi"])) for h in b]
        body, bd = multipart(bagian)
        r = api("POST", f"{acc}/workers/assets/upload?base64=true", body, "multipart/form-data; boundary=" + bd, token=jwt)
        if r.get("result", {}).get("jwt"):
            jwt = r["result"]["jwt"]  # token penyelesaian, dipakai di PUT skrip

    meta = {
        "main_module": "worker.js",
        "compatibility_date": "2026-09-01",
        # run_worker_first: tanpa ini aset dilayani langsung dan worker.js (header keamanan) tidak pernah jalan.
        "assets": {"jwt": jwt, "config": {"html_handling": "auto-trailing-slash", "not_found_handling": "404-page", "run_worker_first": True}},
        "bindings": [{"name": "ASSETS", "type": "assets"}],
    }
    body, bd = multipart([("metadata", None, "application/json", json.dumps(meta).encode()),
                          ("worker.js", "worker.js", "application/javascript+module", (WEB / "worker.js").read_bytes())])
    r = api("PUT", f"{acc}/workers/scripts/{NAMA}", body, "multipart/form-data; boundary=" + bd)
    print("deploy:", r["success"])
    r = api("POST", f"{acc}/workers/scripts/{NAMA}/subdomain", json.dumps({"enabled": True, "previews_enabled": False}).encode())
    sub = api("GET", f"{acc}/workers/subdomain")["result"]["subdomain"]
    print(f"workers.dev: {r['success']} -> https://{NAMA}.{sub}.workers.dev")
    pasang_domain(acc, os.environ.get("CF_WEB_DOMAIN", "wabot.projectkal.my.id"))


def pasang_domain(acc, host):
    """Custom domain Worker (idempoten): cari zone dari nama host, lalu PUT workers/domains.

    Kalau domain sudah terpasang ke Worker ini, berhenti di GET (izin account
    Workers Scripts saja). Pencarian zone + PUT hanya untuk pemasangan pertama dan
    butuh izin zone (Zone:Read, Workers Routes:Edit) - lihat docs/CI.md.
    """
    if not host:
        return
    ada = api("GET", f"{acc}/workers/domains?hostname={host}&service={NAMA}")["result"]
    if any(d.get("hostname") == host and d.get("service") == NAMA for d in ada):
        print(f"domain: sudah terpasang -> https://{host}")
        return
    label = host.split(".")
    zone = None
    for i in range(1, len(label) - 1):  # wabot.projectkal.my.id -> projectkal.my.id -> my.id
        hasil = api("GET", "/zones?name=" + ".".join(label[i:]))["result"]
        if hasil:
            zone = hasil[0]
            break
    if not zone:
        sys.exit(f"zone untuk {host} tidak ditemukan di akun ini")
    r = api("PUT", f"{acc}/workers/domains", json.dumps({"hostname": host, "service": NAMA, "environment": "production", "zone_id": zone["id"]}).encode())
    print(f"domain: {r['success']} -> https://{host}")


if __name__ == "__main__":
    main()
