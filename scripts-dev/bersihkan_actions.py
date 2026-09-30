#!/usr/bin/env python3
"""Bersihkan jejak GitHub Actions: riwayat run, artifact, dan cache yang menua.

Kenapa ada: tiap push ke main bikin 5 workflow jalan (Build APK, Code quality,
Security, CodeQL, Screenshot app). Tiap run menahan log + artifact; Gradle dan
npm juga menyimpan cache. Dibiarkan, repo ini numpuk gigabyte walau yang dipakai
cuma satu APK terakhir. APK-nya sendiri sekarang ditaruh di **draft release**
(lihat `scripts-dev/rilis_internal.py`), jadi artifact Actions cuma perlu umur
pendek buat debug.

Aturan bawaan (bisa ditimpa lewat env):

| Yang dibersihkan | Umur | Env |
|---|---|---|
| riwayat run (log + artifact-nya) | > 2 hari | `HARI_RUN` (run termuda `SIMPAN_RUN` selalu disimpan) |
| artifact (yang run-nya sudah hilang) | > 1 hari | `HARI_ARTIFACT` |
| cache (Gradle, npm, nodejs-mobile) | > 2 hari tidak dipakai | `HARI_CACHE` |

Pakai:
    python3 scripts-dev/bersihkan_actions.py --kering   # cuma lapor, tidak hapus
    python3 scripts-dev/bersihkan_actions.py            # hapus sungguhan

Butuh `GITHUB_TOKEN` dengan izin `actions: write` (workflow `bersihkan.yml`
memakainya lewat `secrets.GITHUB_TOKEN`).
"""
from __future__ import annotations

import datetime as dt
import json
import os
import sys
import urllib.error
import urllib.request

API = "https://api.github.com"
TOKEN = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN") or ""
REPO = os.environ.get("GITHUB_REPOSITORY") or "xykal/wa-release-bot"
KERING = "--kering" in sys.argv


def angka_env(nama: str, bawaan: float) -> float:
    mentah = os.environ.get(nama)
    if not mentah:
        return bawaan
    try:
        return float(mentah)
    except ValueError:
        print(f"env {nama}='{mentah}' bukan angka, pakai bawaan {bawaan}")
        return bawaan


def panggil(metode: str, url: str, data: dict | None = None) -> dict:
    isi = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(
        url,
        data=isi,
        method=metode,
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "xykal-bersihkan-actions",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            badan = r.read()
            return json.loads(badan) if badan else {}
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return {}
        print(f"  gagal {metode} {url}: {e.code} {e.read().decode()[:200]}")
        return {}


def semua_halaman(jalur: str, kunci: str, maks: int = 30) -> list:
    hasil: list = []
    for halaman in range(1, maks + 1):
        pemisah = "&" if "?" in jalur else "?"
        d = panggil("GET", f"{jalur}{pemisah}per_page=100&page={halaman}")
        isi = d.get(kunci, [])
        hasil += isi
        if len(isi) < 100:
            break
    return hasil


def waktu(teks: str | None) -> dt.datetime:
    if not teks:
        return dt.datetime.now(dt.timezone.utc)
    return dt.datetime.fromisoformat(teks.replace("Z", "+00:00"))


def lebih_tua(teks: str | None, jam: float) -> bool:
    return (dt.datetime.now(dt.timezone.utc) - waktu(teks)) > dt.timedelta(hours=jam)


def bersihkan_run(hari: float, simpan: int) -> int:
    batas = hari * 24
    runs = semua_halaman(f"{API}/repos/{REPO}/actions/runs", "workflow_runs")
    runs.sort(key=lambda r: waktu(r.get("created_at")), reverse=True)
    dihapus = 0
    for i, r in enumerate(runs):
        if i < simpan or not lebih_tua(r.get("created_at"), batas):
            continue
        if KERING:
            print(f"  [kering] run {r['id']} {r['name']} ({r['created_at']})")
            dihapus += 1
            continue
        if panggil("DELETE", f"{API}/repos/{REPO}/actions/runs/{r['id']}") == {}:
            dihapus += 1
    print(f"run: {len(runs)} dibaca, {dihapus} {'akan dihapus' if KERING else 'dihapus'}")
    return dihapus


def bersihkan_artifact(hari: float) -> int:
    batas = hari * 24
    arts = semua_halaman(f"{API}/repos/{REPO}/actions/artifacts", "artifacts")
    dihapus = 0
    for a in arts:
        if not (lebih_tua(a.get("created_at"), batas) or a.get("expired")):
            continue
        if KERING:
            print(f"  [kering] artifact {a['id']} {a['name']}")
            dihapus += 1
            continue
        if panggil("DELETE", f"{API}/repos/{REPO}/actions/artifacts/{a['id']}") == {}:
            dihapus += 1
    print(f"artifact: {len(arts)} dibaca, {dihapus} {'akan dihapus' if KERING else 'dihapus'}")
    return dihapus


def bersihkan_cache(hari: float) -> int:
    batas = hari * 24
    caches = semua_halaman(f"{API}/repos/{REPO}/actions/caches", "actions_caches")
    dihapus = 0
    for c in caches:
        if not lebih_tua(c.get("last_accessed_at") or c.get("created_at"), batas):
            continue
        if KERING:
            print(f"  [kering] cache {c['id']} {c['key']}")
            dihapus += 1
            continue
        if panggil("DELETE", f"{API}/repos/{REPO}/actions/caches/{c['id']}") == {}:
            dihapus += 1
    print(f"cache: {len(caches)} dibaca, {dihapus} {'akan dihapus' if KERING else 'dihapus'}")
    return dihapus


def main() -> int:
    if not TOKEN:
        print("GITHUB_TOKEN kosong: tidak bisa membersihkan apa pun")
        return 1
    hari_run = angka_env("HARI_RUN", 2)
    hari_artifact = angka_env("HARI_ARTIFACT", 1)
    hari_cache = angka_env("HARI_CACHE", 2)
    simpan_run = int(angka_env("SIMPAN_RUN", 15))
    print(f"repo {REPO} | run > {hari_run} hari (sisakan {simpan_run} terbaru) | "
          f"artifact > {hari_artifact} hari | cache > {hari_cache} hari "
          f"tidak dipakai{' [KERING]' if KERING else ''}")

    total = bersihkan_run(hari_run, simpan_run)
    total += bersihkan_artifact(hari_artifact)
    total += bersihkan_cache(hari_cache)

    # Sisa pakai (kalau API-nya masih melaporkan angka lama, tidak apa-apa)
    pakai = panggil("GET", f"{API}/repos/{REPO}/actions/cache/usage")
    besar = pakai.get("active_caches_size_in_bytes")
    if besar is not None:
        print(f"sisa cache: {besar / 1048576:.1f} MB")

    ringkas = os.environ.get("GITHUB_STEP_SUMMARY")
    if ringkas:
        with open(ringkas, "a", encoding="utf-8") as f:
            f.write("### Bersihkan Actions\n\n")
            f.write(f"- run > {hari_run} hari (sisakan {simpan_run} terbaru)\n")
            f.write(f"- artifact > {hari_artifact} hari\n")
            f.write(f"- cache > {hari_cache} hari tidak dipakai\n")
            f.write(f"- {'akan dihapus' if KERING else 'dihapus'}: **{total}** item\n")
            if besar is not None:
                f.write(f"- sisa cache: {besar / 1048576:.1f} MB\n")
    print(f"total {'akan dihapus' if KERING else 'dihapus'}: {total}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
