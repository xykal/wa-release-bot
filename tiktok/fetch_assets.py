#!/usr/bin/env python3
"""Download stiker + SFX sekali, cache di tiktok/assets/.

- Stiker: trim transparan, resize max 320px, TEGAK TAJEM (tanpa rounded mask).
- SFX: download mp3 myinstants, verifikasi >2KB, kalau 404 bikin backup lokal pakai ffmpeg.
- Idempotent: file yang udah ada + valid di-skip (biar Actions cache ngefek).

Usage:
    python tiktok/fetch_assets.py
"""
from __future__ import annotations

import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / "assets"
ASSETS.mkdir(exist_ok=True)
(ASSETS / "sfx").mkdir(exist_ok=True)
(ASSETS / "stickers").mkdir(exist_ok=True)

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128 Safari/537.36"}


def parse_list(path: Path):
    out = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = [p.strip() for p in line.split("|")]
        if len(parts) >= 2:
            out.append((parts[0], parts[1]))
    return out


def download(url: str, dest: Path, min_bytes: int = 2048) -> bool:
    if dest.exists() and dest.stat().st_size >= min_bytes:
        print(f"  skip (cached): {dest.name}")
        return True
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=25) as r, open(dest, "wb") as f:
            f.write(r.read())
        if dest.stat().st_size < min_bytes:
            dest.unlink(missing_ok=True)
            print(f"  GAGAL (kekecilan): {url}")
            return False
        print(f"  OK: {dest.name} ({dest.stat().st_size // 1024} KB)")
        return True
    except Exception as e:  # noqa: BLE001 - fallback di bawah
        print(f"  GAGAL: {url} → {e}")
        return False


def ffmpeg(*args: str) -> bool:
    try:
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *args], check=True, timeout=60)
        return True
    except Exception as e:  # noqa: BLE001
        print(f"  ffmpeg gagal: {e}")
        return False


def backup_sfx(nama: str, dest: Path):
    """Bikin SFX pengganti lokal kalau myinstants 404 — biar render nggak gagal."""
    print(f"  bikin backup lokal: {nama}")
    if "ketawa" in nama or "tawa" in nama:
        # tawa palsu: 3x sweep naik (600→900Hz), total 1.8s
        ffmpeg("-f", "lavfi", "-i", "sine=frequency=700:duration=1.8",
               "-af", "tremolo=f=8:d=0.8,volume=0.5", str(dest))
    elif "boom" in nama or "airhorn" in nama:
        ffmpeg("-f", "lavfi", "-i", "sine=frequency=120:duration=1.0",
               "-af", "volume=0.8", str(dest))
    else:
        ffmpeg("-f", "lavfi", "-i", "sine=frequency=440:duration=0.8",
               "-af", "volume=0.4", str(dest))


def proses_stiker(path: Path):
    """Trim + resize, TANPA rounded corner. Fallback: placeholder Pillow."""
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        print("  Pillow belum ada, skip proses stiker")
        return
    try:
        if not path.exists():
            raise FileNotFoundError(path.name)
        im = Image.open(path).convert("RGBA")
        # trim transparan
        bbox = im.getbbox()
        if bbox:
            im = im.crop(bbox)
        # resize max 320px, TEGAK (tidak diputar, tidak di-mask bulat)
        im.thumbnail((320, 320), Image.LANCZOS)
        # bayangan tipis: TIDAK glow neon, TIDAK gradient ungu — cuma offset gelap
        canvas = Image.new("RGBA", (im.width + 12, im.height + 12), (0, 0, 0, 0))
        shadow = Image.new("RGBA", im.size, (0, 0, 0, 160))
        canvas.alpha_composite(shadow, (6, 8))
        canvas.alpha_composite(im, (0, 0))
        canvas.save(path, "PNG")
        print(f"  stiker OK: {path.name} {canvas.size} (tajem, tanpa radius)")
    except Exception:
        # Fallback: placeholder kotak TEGAS (bukan bulat) biar render tetap jalan
        print(f"  stiker fallback lokal: {path.name}")
        im = Image.new("RGBA", (280, 160), (17, 24, 39, 255))
        d = ImageDraw.Draw(im)
        d.rectangle([0, 0, 279, 159], outline=(250, 204, 21, 255), width=6)
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 28)
        except Exception:  # noqa: BLE001
            font = ImageFont.load_default()
        d.text((20, 55), path.stem.upper()[:12], fill=(255, 255, 255, 255), font=font)
        im.save(path, "PNG")


def main() -> int:
    gagal = 0

    print("== SFX ==")
    for nama, url in parse_list(ROOT / "meme_sfx.txt"):
        dest = ASSETS / "sfx" / f"{nama}.mp3"
        if not download(url, dest):
            backup_sfx(nama, dest)
            if not dest.exists():
                gagal += 1

    print("== STIKER ==")
    for nama, url in parse_list(ROOT / "stickers.txt"):
        dest = ASSETS / "stickers" / f"{nama}.png"
        # coba download apa adanya (png/webp/jpg → dinormalisasi ke png)
        tmp = ASSETS / "stickers" / f"{nama}.tmp"
        ok = download(url, tmp, min_bytes=512)
        if ok:
            try:
                from PIL import Image
                Image.open(tmp).convert("RGBA").save(dest, "PNG")
            except Exception:  # noqa: BLE001
                dest.unlink(missing_ok=True)
            tmp.unlink(missing_ok=True)
        proses_stiker(dest)

    print(f"\nSelesai. gagal={gagal}")
    return 1 if gagal else 0


if __name__ == "__main__":
    sys.exit(main())
