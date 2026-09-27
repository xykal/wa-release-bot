#!/usr/bin/env python3
"""
Nyiapin antrian "lagu mood" (dijalanin GitHub Actions, lihat lagu-mood.yml).

Alur tiap jalan:
  1. baca antrian sekarang dari Cloudflare KV
  2. kalau yang siap < TARGET → ambil lagu acak dari lagu/daftar.txt yang
     belum dipakai belakangan ini
  3. yt-dlp: cari di YouTube, download audionya
  4. cari bagian paling "nendang" (energi tertinggi ~ reff) → potong 60 dtk,
     fade in/out, AAC .m4a
  5. Groq (AI) bikin kata-kata pendek buat nemenin
  6. upload audio + antrian baru ke KV

Env: CF_API_TOKEN, CF_ACCOUNT_ID, CF_KV_LAGU, GROQ_API_KEY
Opsional: LAGU_TARGET (default 8), LAGU_MAKS_BARU (default 3), FFMPEG
"""
from __future__ import annotations

import json
import os
import random
import re
import secrets
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

import numpy as np

AKAR = Path(__file__).resolve().parent
TARGET = int(os.environ.get("LAGU_TARGET", "8"))
MAKS_BARU = int(os.environ.get("LAGU_MAKS_BARU", "3"))
PANJANG = 60  # detik
UMUR_MAKS = 21 * 86400  # klip di KV kedaluwarsa sendiri setelah 21 hari
FFMPEG = os.environ.get("FFMPEG", "ffmpeg")

CF = f"https://api.cloudflare.com/client/v4/accounts/{os.environ.get('CF_ACCOUNT_ID', '')}/storage/kv/namespaces/{os.environ.get('CF_KV_LAGU', '')}"


def log(*a):
    print(*a, flush=True)


# ------------------------------------------------------------------ KV
def kv(method: str, kunci: str, data: bytes | None = None, ttl: int | None = None, ct="application/octet-stream"):
    url = f"{CF}/values/{urllib.request.quote(kunci, safe='')}"
    if ttl:
        url += f"?expiration_ttl={ttl}"
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": "Bearer " + os.environ["CF_API_TOKEN"],
        "Content-Type": ct,
    })
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        if e.code == 404 and method == "GET":
            return None
        raise RuntimeError(f"KV {method} {kunci}: HTTP {e.code} {e.read()[:200]!r}") from e


def daftar_terpakai() -> set[str]:
    """Klip yang udah dilaporin HP "udah dikirim" (key pakai:<id>)."""
    hasil, cursor = set(), ""
    for _ in range(20):
        url = f"{CF}/keys?prefix=pakai:&limit=1000" + (f"&cursor={cursor}" if cursor else "")
        req = urllib.request.Request(url, headers={"Authorization": "Bearer " + os.environ["CF_API_TOKEN"]})
        with urllib.request.urlopen(req, timeout=60) as r:
            j = json.load(r)
        hasil |= {k["name"][len("pakai:"):] for k in j.get("result", [])}
        cursor = (j.get("result_info") or {}).get("cursor") or ""
        if not cursor:
            break
    return hasil


def baca_json(kunci: str, bawaan):
    b = kv("GET", kunci)
    if not b:
        return bawaan
    try:
        return json.loads(b)
    except ValueError:
        return bawaan


# ------------------------------------------------------------------ daftar
def baca_daftar() -> list[tuple[str, str]]:
    hasil = []
    for baris in (AKAR / "daftar.txt").read_text(encoding="utf-8").splitlines():
        baris = baris.strip()
        if not baris or baris.startswith("#") or " - " not in baris:
            continue
        artis, judul = baris.split(" - ", 1)
        hasil.append((artis.strip(), judul.strip()))
    return hasil


def kunci_lagu(artis: str, judul: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", f"{artis}-{judul}".lower()).strip("-")


# ------------------------------------------------------------------ YouTube
def kata_kunci(s: str) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9]+", s.lower()) if len(w) > 2}


def cari_video(artis: str, judul: str) -> dict | None:
    """Cari 5 hasil teratas, pilih yang judulnya nyambung & durasinya wajar."""
    q = f"ytsearch5:{artis} {judul}"
    out = subprocess.run(
        ["yt-dlp", "--dump-json", "--flat-playlist", "--no-warnings", q],
        capture_output=True, text=True, timeout=120,
    )
    kandidat = []
    for baris in out.stdout.splitlines():
        try:
            kandidat.append(json.loads(baris))
        except ValueError:
            pass
    butuh = kata_kunci(judul)
    for v in kandidat:
        dur = v.get("duration") or 0
        judul_v = (v.get("title") or "").lower()
        if not (120 <= dur <= 540):
            continue
        if butuh and len(butuh & kata_kunci(judul_v)) < max(1, len(butuh) // 2):
            continue
        if re.search(r"\b(cover|karaoke|live|remix|tiktok|slowed|reverb|8d|instrumental|minus one)\b", judul_v):
            continue
        return v
    return None


def download_audio(video_id: str, tujuan: Path) -> Path:
    templ = str(tujuan / "asli.%(ext)s")
    subprocess.run(
        ["yt-dlp", "-f", "bestaudio[ext=m4a]/bestaudio", "--no-playlist", "--no-warnings", "--no-progress",
         "-o", templ, f"https://www.youtube.com/watch?v={video_id}"],
        check=True, timeout=300,
    )
    file = next(tujuan.glob("asli.*"))
    return file


# ------------------------------------------------------------------ potong
def cari_bagian_reff(file: Path) -> tuple[float, float]:
    """Energi (RMS) per detik → jendela 60 dtk paling keras di tengah lagu."""
    sr = 8000
    raw = subprocess.run(
        [FFMPEG, "-v", "error", "-i", str(file), "-ac", "1", "-ar", str(sr), "-f", "s16le", "-"],
        capture_output=True, check=True, timeout=300,
    ).stdout
    x = np.frombuffer(raw, dtype=np.int16).astype(np.float32)
    durasi = len(x) / sr
    n = int(durasi)
    if n <= PANJANG + 10:
        return 0.0, durasi
    rms = np.sqrt(np.mean(x[: n * sr].reshape(n, sr) ** 2, axis=1) + 1e-9)
    kum = np.concatenate([[0], np.cumsum(rms)])
    awal_min = int(n * 0.2)
    awal_maks = max(awal_min, min(int(n * 0.65), n - PANJANG))
    terbaik, skor = awal_min, -1.0
    for s in range(awal_min, awal_maks + 1):
        # reff pertama/kedua lebih enak daripada outro → yang lebih awal dikasih bonus dikit
        v = (kum[s + PANJANG] - kum[s]) * (1.0 - 0.15 * s / n)
        if v > skor:
            terbaik, skor = s, v
    # mulai 3 dtk lebih awal biar ada ancang-ancang sebelum reff
    return float(max(0, terbaik - 3)), durasi


def potong(file: Path, mulai: float, tujuan: Path) -> Path:
    out = tujuan / "klip.m4a"
    subprocess.run(
        [FFMPEG, "-v", "error", "-y", "-ss", f"{mulai:.2f}", "-t", str(PANJANG), "-i", str(file),
         "-af", f"afade=t=in:d=2,afade=t=out:st={PANJANG - 4}:d=4,loudnorm=I=-14:TP=-1.5:LRA=11",
         "-ac", "2", "-ar", "44100", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", str(out)],
        check=True, timeout=300,
    )
    return out


# ------------------------------------------------------------------ kata-kata
SUDUT = [
    "kangen seseorang yang udah jauh", "cinta pertama zaman sekolah", "patah hati yang udah ikhlas",
    "perjalanan pulang sambil dengerin radio", "hujan dan kenangan", "orang tua yang dulu sering muter lagu ini",
    "persahabatan lama", "janji yang nggak jadi ditepati", "bersyukur pernah ngerasain", "nongkrong di warung sambil gitaran",
]


def bikin_kata(artis: str, judul: str) -> str:
    kunci = os.environ.get("GROQ_API_KEY", "")
    cadangan = random.choice([
        "Ada lagu yang nggak pernah benar-benar selesai diputar — cuma pindah dari telinga ke ingatan.",
        "Sore-sore gini, lagu lama tuh kayak surat dari diri kita yang dulu.",
        "Nggak semua yang lewat harus dilupain. Sebagian cukup diputer pelan-pelan.",
        "Buat yang lagi kangen tapi gengsi bilang: nih, biar lagunya aja yang ngomong.",
    ])
    if not kunci:
        return cadangan
    prompt = (
        f'Tulis kata-kata pendek buat caption channel WhatsApp yang nemenin potongan lagu "{judul}" – {artis}.\n'
        "Aturan:\n"
        "- Bahasa Indonesia santai tapi puitis, nuansa nostalgia / galau manis, kayak anak senja.\n"
        "- 2 sampai 3 kalimat, maksimal 280 karakter.\n"
        "- JANGAN mengutip lirik lagunya, JANGAN sebut judul/artis (udah ditulis terpisah).\n"
        "- Tanpa hashtag, tanpa tanda kutip, maksimal 1 emoji.\n"
        "- Jangan sebut waktu (malam/pagi/sore/senja) — jam kirimnya acak.\n"
        f"- Sudut pandang kali ini: {random.choice(SUDUT)}.\n"
        "Balas cuma teks caption-nya."
    )
    for model in ("openai/gpt-oss-120b", "llama-3.3-70b-versatile", "openai/gpt-oss-20b"):
        try:
            body = json.dumps({
                "model": model, "temperature": 0.95, "max_completion_tokens": 700,
                "messages": [
                    {"role": "system", "content": "Kamu penulis caption channel musik lawas yang jago bikin baper."},
                    {"role": "user", "content": prompt},
                ],
            }).encode()
            req = urllib.request.Request(
                "https://api.groq.com/openai/v1/chat/completions", data=body,
                headers={"Authorization": "Bearer " + kunci, "Content-Type": "application/json", "User-Agent": "wa-release-bot"},
            )
            with urllib.request.urlopen(req, timeout=60) as r:
                teks = json.load(r)["choices"][0]["message"]["content"].strip()
            teks = teks.strip('"“”').replace("\u2011", "-")
            if 20 <= len(teks) <= 400:
                return teks
        except Exception as e:  # noqa: BLE001 — model lain dicoba
            log(f"  (kata-kata via {model} gagal: {e})")
    return cadangan


# ------------------------------------------------------------------ utama
def main() -> int:
    for v in ("CF_API_TOKEN", "CF_ACCOUNT_ID", "CF_KV_LAGU"):
        if not os.environ.get(v):
            log(f"❌ env {v} belum di-set")
            return 1

    kini = int(time.time())
    antrian = baca_json("antrian", {"lagu": []})
    riwayat = baca_json("riwayat", {"kunci": []})

    # buang yang udah dikirim HP & yang klip-nya udah (hampir) kedaluwarsa
    terpakai = daftar_terpakai()
    for x in antrian.get("lagu", []):
        if x.get("id") in terpakai:
            try:
                kv("DELETE", "klip:" + x["id"])
            except RuntimeError as e:
                log(f"  (hapus klip lama gagal: {e})")
    siap = [x for x in antrian.get("lagu", [])
            if x.get("id") not in terpakai and kini - int(x.get("dibuat", 0) / 1000) < UMUR_MAKS - 86400]
    log(f"Antrian sekarang: {len(siap)} lagu siap (target {TARGET}).")
    kurang = min(MAKS_BARU, TARGET - len(siap))
    if kurang <= 0:
        log("Udah cukup, nggak nambah.")
        if len(siap) != len(antrian.get("lagu", [])):
            kv("PUT", "antrian", json.dumps({"lagu": siap, "diperbarui": kini * 1000}).encode(), ct="application/json")
        return 0

    daftar = baca_daftar()
    dipakai = set(riwayat.get("kunci", [])[-max(0, len(daftar) - 5):]) | {x.get("kunci") for x in siap}
    calon = [d for d in daftar if kunci_lagu(*d) not in dipakai] or daftar
    random.shuffle(calon)

    baru = 0
    for artis, judul in calon:
        if baru >= kurang:
            break
        log(f"🎵 {artis} - {judul}")
        try:
            v = cari_video(artis, judul)
            if not v:
                log("  nggak nemu video yang pas, skip")
                continue
            with tempfile.TemporaryDirectory() as tmp:
                t = Path(tmp)
                asli = download_audio(v["id"], t)
                mulai, durasi = cari_bagian_reff(asli)
                klip = potong(asli, mulai, t)
                data = klip.read_bytes()
            kata = bikin_kata(artis, judul)
            id_ = secrets.token_urlsafe(9).replace("-", "a").replace("_", "b")
            kv("PUT", "klip:" + id_, data, ttl=UMUR_MAKS)
            item = {
                "id": id_, "kunci": kunci_lagu(artis, judul), "artis": artis, "judul": judul,
                "kata": kata, "detik": PANJANG, "mime": "audio/mp4", "mulai": round(mulai),
                "durasiAsli": round(durasi), "video": v["id"], "dibuat": int(time.time() * 1000),
            }
            siap.append(item)
            riwayat.setdefault("kunci", []).append(item["kunci"])
            riwayat["kunci"] = riwayat["kunci"][-200:]
            # simpan tiap selesai satu, biar kalau job-nya mati di tengah nggak ilang semua
            kv("PUT", "antrian", json.dumps({"lagu": siap, "diperbarui": item["dibuat"]}).encode(), ct="application/json")
            kv("PUT", "riwayat", json.dumps(riwayat).encode(), ct="application/json")
            baru += 1
            log(f"  ✅ {len(data) // 1024} KB, potong dari detik {round(mulai)} / {round(durasi)} — {kata[:80]}…")
        except Exception as e:  # noqa: BLE001 — satu lagu gagal, lanjut yang lain
            log(f"  ⚠️ gagal: {e}")

    log(f"Selesai: {baru} lagu baru, total siap {len(siap)}.")
    return 0 if baru or siap else 1


if __name__ == "__main__":
    sys.exit(main())
