#!/usr/bin/env python3
"""Taruh APK hasil build `main` di **draft release** GitHub.

Kenapa draft release, bukan artifact Actions: artifact cuma hidup 1-2 hari lalu
hilang, dan repo ini jadi penuh log run yang numpuk. Draft release:

- asetnya **tidak bisa diunduh orang lain** (tautan aset draft butuh login
  pemilik repo; `releases/latest` juga tidak ikut menghitung draft), cocok untuk
  build internal sebelum launching;
- umurnya tidak habis sendiri, jadi APK yang dikirim ke kall masih ada besok;
- cukup satu rilis yang asetnya diganti tiap build (`tag internal-<versi>`),
  jadi tidak ada jejak rilis yang menumpuk.

Yang dilakukan skrip ini, urutannya:

1. baca `versionName` dari `app/build.gradle`;
2. pastikan tag `internal-<versi>` ada dan menunjuk commit yang barusan dibuild;
3. bikin/ambil release **draft** dengan tag itu, lalu ganti isinya dengan APK +
   `.sha256` dari folder `dist/`;
4. hapus draft `internal-*` versi lain (biar cuma ada satu jejak internal).

Pakai (dipanggil workflow `Build APK`, job `release-internal`):
    python3 scripts-dev/rilis_internal.py --dist dist

Butuh `GITHUB_TOKEN` dengan izin `contents: write` dan env `GITHUB_REPOSITORY`,
`GITHUB_SHA` (otomatis ada di runner).
"""
from __future__ import annotations

import json
import mimetypes
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://api.github.com"
TOKEN = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN") or ""
REPO = os.environ.get("GITHUB_REPOSITORY") or "xykal/wa-release-bot"
SHA = os.environ.get("GITHUB_SHA") or ""
KERING = "--kering" in sys.argv

AWALAN = "internal-"


def ambil_dist() -> Path:
    for i, arg in enumerate(sys.argv):
        if arg == "--dist" and i + 1 < len(sys.argv):
            return Path(sys.argv[i + 1])
    return Path(os.environ.get("DIST") or "dist")


def versi_app() -> str:
    """Ambil versionName dari `app/build.gradle` (satu sumber kebenaran).

    Bentuknya `def appVersionName = (project.findProperty('versionName') ?: '1.8.0')`
    - ambil nilai cadangannya. Kalau CI menimpa versinya (build dari tag), env
    `VERSI` yang dipakai.
    """
    dari_ci = os.environ.get("VERSI", "").strip()
    if dari_ci:
        return dari_ci
    isi = Path("app/build.gradle").read_text(encoding="utf-8")
    cocok = re.search(r"findProperty\(\s*[\"']versionName[\"']\s*\)\s*\?:\s*[\"']([^\"']+)[\"']", isi)
    if not cocok:
        cocok = re.search(r"^\s*versionName\s+[\"']([^\"']+)[\"']", isi, re.M)
    if not cocok:
        raise SystemExit("versionName tidak ketemu di app/build.gradle")
    versi = cocok.group(1).strip()
    if not re.fullmatch(r"[0-9][0-9A-Za-z.\-+]*", versi):
        raise SystemExit(f"versionName tidak masuk akal: {versi!r}")
    return versi


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
            "User-Agent": "xykal-rilis-internal",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            badan = r.read()
            return json.loads(badan) if badan else {}
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return {}
        raise SystemExit(f"gagal {metode} {url}: {e.code} {e.read().decode()[:300]}")


def unggah_berkas(upload_url: str, berkas: Path) -> dict:
    """POST ke {upload_url}?name=... dengan isi file mentah."""
    alamat = upload_url.split("{")[0] + "?" + urllib.parse.urlencode({"name": berkas.name})
    jenis = "application/vnd.android.package-archive" if berkas.suffix == ".apk" else "text/plain"
    req = urllib.request.Request(
        alamat,
        data=berkas.read_bytes(),
        method="POST",
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Accept": "application/vnd.github+json",
            "Content-Type": jenis,
            "Content-Length": str(berkas.stat().st_size),
            "User-Agent": "xykal-rilis-internal",
        },
    )
    with urllib.request.urlopen(req, timeout=900) as r:
        return json.loads(r.read())


def pastikan_tag(tag: str) -> None:
    """Tag `internal-<versi>` selalu menunjuk commit yang barusan dibuild."""
    alamat = f"{API}/repos/{REPO}/git/ref/tags/{tag}"
    ada = panggil("GET", alamat)
    if KERING:
        print(f"  [kering] tag {tag}: {'update' if ada else 'bikin'} -> {SHA[:8]}")
        return
    if ada:
        panggil("PATCH", f"{API}/repos/{REPO}/git/refs/tags/{tag}",
                {"sha": SHA, "force": True})
    else:
        panggil("POST", f"{API}/repos/{REPO}/git/refs",
                {"ref": f"refs/tags/{tag}", "sha": SHA})


def bersihkan_internal_lain(tag_dipakai: str) -> int:
    """Hapus draft internal-* versi lain + tag-nya (biar jejaknya cuma satu)."""
    dihapus = 0
    hal = 0
    while True:
        hal += 1
        daftar = panggil("GET", f"{API}/repos/{REPO}/releases?per_page=100&page={hal}")
        if not daftar:
            break
        for r in daftar:
            tag = r.get("tag_name") or ""
            if not tag.startswith(AWALAN) or tag == tag_dipakai:
                continue
            print(f"  buang draft lama {tag}")
            if KERING:
                dihapus += 1
                continue
            panggil("DELETE", f"{API}/repos/{REPO}/releases/{r['id']}")
            panggil("DELETE", f"{API}/repos/{REPO}/git/refs/tags/{tag}")
            dihapus += 1
        if len(daftar) < 100:
            break
    return dihapus


def main() -> int:
    if not TOKEN:
        print("GITHUB_TOKEN kosong: rilis internal dilewati")
        return 1
    dist = ambil_dist()
    berkas = sorted([p for p in dist.glob("*") if p.is_file() and p.suffix in (".apk", ".sha256")])
    if not berkas:
        print(f"tidak ada APK/.sha256 di {dist}/: dilewati")
        return 1

    versi = versi_app()
    tag = f"{AWALAN}{versi}"
    judul = f"Build internal {versi}"
    print(f"repo {REPO} | versi {versi} | tag {tag} | {len(berkas)} berkas dari {dist}/"
          f"{' [KERING]' if KERING else ''}")

    pastikan_tag(tag)

    rilis = panggil("GET", f"{API}/repos/{REPO}/releases/tags/{tag}")
    isi_badan = (
        f"Build internal dari `main` ({SHA[:8]}), **bukan rilis publik**.\n\n"
        f"- Versi: {versi}\n"
        f"- Commit: {SHA}\n"
        f"- Isi: APK arm64-v8a + armeabi-v7a (dan `.sha256` masing-masing)\n\n"
        f"Draft: cuma pemilik repo yang bisa lihat dan unduh. Asetnya diganti tiap "
        f"build baru di `main`, jadi tidak ada tumpukan rilis internal.\n"
    )
    if not rilis:
        if KERING:
            print(f"  [kering] bikin draft release {tag}")
            rilis = {"upload_url": f"{API}/repos/{REPO}/releases/0/assets", "id": 0, "assets": []}
        else:
            rilis = panggil("POST", f"{API}/repos/{REPO}/releases", {
                "tag_name": tag,
                "target_commitish": SHA or "main",
                "name": judul,
                "body": isi_badan,
                "draft": True,
                "prerelease": False,
            })
    else:
        if KERING:
            print(f"  [kering] pakai draft {tag} yang ada ({len(rilis.get('assets', []))} aset lama dibuang)")
        else:
            rilis = panggil("PATCH", f"{API}/repos/{REPO}/releases/{rilis['id']}", {
                "name": judul,
                "body": isi_badan,
                "draft": True,
            })

    # aset lama dibuang dulu supaya isinya selalu build terakhir
    for aset in rilis.get("assets", []) or []:
        if KERING:
            continue
        panggil("DELETE", f"{API}/repos/{REPO}/releases/assets/{aset['id']}")

    upload_url = rilis.get("upload_url", "")
    for b in berkas:
        if KERING:
            print(f"  [kering] unggah {b.name} ({b.stat().st_size // 1024} KB)")
            continue
        hasil = unggah_berkas(upload_url, b)
        print(f"  unggah {b.name} ({b.stat().st_size // 1024} KB) -> {hasil.get('state')}")

    dibuang = bersihkan_internal_lain(tag)

    tautan = f"https://github.com/{REPO}/releases/tag/{tag}"
    print(f"draft: {tautan}")
    ringkas = os.environ.get("GITHUB_STEP_SUMMARY")
    if ringkas:
        with open(ringkas, "a", encoding="utf-8") as f:
            f.write("### Draft release internal\n\n")
            f.write(f"- Versi {versi}, commit `{SHA[:8]}`\n")
            f.write(f"- Aset: {', '.join(b.name for b in berkas)}\n")
            f.write(f"- Draft lama dibuang: {dibuang}\n")
            f.write(f"- {tautan}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
