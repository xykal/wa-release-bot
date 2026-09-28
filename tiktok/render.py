#!/usr/bin/env python3
"""Renderer TikTok ringan: Pillow + edge-tts + ffmpeg. Tanpa browser/Remotion.

Alur:
  1. Baca script.json → TTS per scene (edge-tts, id-ID-GadisNeural)
  2. Ukur durasi VO → tentukan durasi tiap scene (VO + padding)
  3. Gambar background 1080x1920 per scene (Pillow, gradient + kartu teks)
  4. Tulis subtitle ASS karaoke (distribusi merata per baris, highlight per kata)
  5. ffmpeg: concat scene → overlay stiker (enable between) → mix VO + SFX → mp4

Usage (di GitHub Actions):
    pip install -r tiktok/requirements.txt
    python tiktok/fetch_assets.py
    python tiktok/render.py --script tiktok/script.json --out dist/tiktok_vertical.mp4

Validasi lokal tanpa TTS/jaringan:
    python tiktok/render.py --dry-run --out /tmp/preview.mp4
"""
from __future__ import annotations

import argparse
import asyncio
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / "assets"
W, H, FPS = 1080, 1920, 30

# Gradient background per scene (gelap, kontras tinggi, BUKAN neon/ungu-AI-slop).
GRADIENTS = {
    "gradient_merah_maroon_gelap": ((90, 10, 20), (25, 8, 12)),
    "gradient_navy_gelap": ((10, 25, 70), (6, 10, 28)),
    "gradient_hijau_toska_gelap": ((6, 60, 55), (4, 20, 24)),
    "gradient_biru_dongker": ((15, 40, 100), (8, 14, 40)),
    "gradient_ungu_plum_gelap": ((55, 20, 60), (18, 8, 24)),
    "gradient_hijau_WA_gelap": ((8, 70, 45), (4, 25, 18)),
}

FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"


def sh(*args: str) -> str:
    p = subprocess.run(args, capture_output=True, text=True, timeout=300)
    if p.returncode != 0:
        raise RuntimeError(f"{' '.join(args)}\n{p.stderr[-2000:]}")
    return p.stdout


def durasi_audio(path: Path) -> float:
    """Durasi detik via ffprobe (fallback: mutagen)."""
    try:
        out = sh("ffprobe", "-v", "error", "-show_entries", "format=duration",
                 "-of", "csv=p=0", str(path)).strip()
        return max(0.5, float(out))
    except Exception:  # noqa: BLE001
        try:
            from mutagen.mp3 import MP3
            return max(0.5, float(MP3(str(path)).info.length))
        except Exception:  # noqa: BLE001
            return 3.0


async def tts_edge(teks: str, out: Path, voice: str, rate: str, pitch: str):
    import edge_tts  # diimpor di sini biar --dry-run nggak butuh paketnya
    t = edge_tts.Communicate(teks, voice=voice, rate=rate, pitch=pitch)
    await t.save(str(out))


def _wrap_px(d, teks: str, font, max_w: int) -> list[str]:
    """Bungkus teks berdasarkan lebar pixel (bukan jumlah karakter)."""
    kata = teks.split()
    baris, cur = [], ""
    for k in kata:
        coba = (cur + " " + k).strip()
        if d.textlength(coba, font=font) <= max_w:
            cur = coba
        else:
            if cur:
                baris.append(cur)
            cur = k
    if cur:
        baris.append(cur)
    return baris


def _kartu(d, x0, y0, x1, y1, fill=(16, 24, 48), outline=(255, 255, 255), r=28):
    # Catatan: base image mode RGB (bukan RGBA) → alpha diabaikan.
    # Jadi pakai warna solid gelap, jangan putih-transparan (nanti jadi putih polos).
    if isinstance(outline, tuple) and len(outline) == 4:
        outline = outline[:3]
    d.rounded_rectangle([(x0, y0), (x1, y1)], radius=r, fill=fill, outline=outline, width=3)


def _ilustrasi_hook(d, ImageFont):
    # HP + tulisan STOP + garis kejut (tanpa emoji, digambar manual)
    d.rounded_rectangle([(340, 1180), (740, 1420)], radius=40, fill=(15, 15, 20), outline=(250, 204, 21), width=6)
    try:
        f = ImageFont.truetype(FONT_BOLD, 64)
    except Exception:  # noqa: BLE001
        f = ImageFont.load_default()
    d.text((392, 1260), "STOP", fill=(250, 204, 21), font=f)
    for i, x in enumerate([250, 290, 790, 830]):
        d.line([(x, 1210 + i * 20), (x - 40 if x < 500 else x + 40, 1300 + i * 20)],
               fill=(250, 204, 21, 200), width=8)


def _ilustrasi_masalah(d, ImageFont):
    # Kartu rilis GitHub + stempel KE-SKIP
    _kartu(d, 80, 1150, 1000, 1400)
    try:
        f1 = ImageFont.truetype(FONT_BOLD, 40)
        f2 = ImageFont.truetype(FONT_REG, 34)
        f3 = ImageFont.truetype(FONT_BOLD, 44)
    except Exception:  # noqa: BLE001
        f1 = f2 = f3 = ImageFont.load_default()
    d.text((120, 1180), "vercel / next.js", fill=(147, 197, 253), font=f2)
    d.text((120, 1235), "v15.1.0  •  2 hari lalu", fill=(255, 255, 255), font=f1)
    d.text((120, 1300), "Changelog: ...", fill=(160, 160, 170), font=f2)
    d.rectangle([(640, 1290), (960, 1360)], fill=(220, 38, 38))
    d.text((665, 1300), "KE-SKIP!", fill=(255, 255, 255), font=f3)


def _ilustrasi_cara_kerja(d, ImageFont):
    # Timeline 3 node: TIDUR -> CEK 1s -> POST 3s
    try:
        f = ImageFont.truetype(FONT_BOLD, 32)
        fk = ImageFont.truetype(FONT_REG, 28)
    except Exception:  # noqa: BLE001
        f = fk = ImageFont.load_default()
    d.line([(140, 1270), (940, 1270)], fill=(52, 211, 153, 200), width=6)
    for i, (judul, sub, c) in enumerate([
        ("TIDUR", "0% CPU", (100, 116, 139)),
        ("CEK GIT", "1 req/1 dtk", (250, 204, 21)),
        ("POST WA", "3 dtk", (52, 211, 153)),
    ]):
        x = 170 + i * 370
        d.ellipse([(x - 42, 1228), (x + 42, 1312)], fill=c)
        d.text((x - 25, 1248), str(i + 1), fill=(10, 10, 10), font=f)
        bb = d.textbbox((0, 0), judul, font=f)
        d.text((x - (bb[2] - bb[0]) / 2, 1330), judul, fill=(255, 255, 255), font=f)
        bb2 = d.textbbox((0, 0), sub, font=fk)
        d.text((x - (bb2[2] - bb2[0]) / 2, 1372), sub, fill=(180, 190, 200), font=fk)


def _ilustrasi_hosting(d, ImageFont):
    # Dua kartu: APK vs TERMUX
    try:
        f1 = ImageFont.truetype(FONT_BOLD, 40)
        f2 = ImageFont.truetype(FONT_REG, 30)
    except Exception:  # noqa: BLE001
        f1 = f2 = ImageFont.load_default()
    _kartu(d, 60, 1150, 510, 1400, outline=(52, 211, 153, 150))
    d.text((100, 1180), "1. APK", fill=(52, 211, 153), font=f1)
    d.text((100, 1240), "HP nganggur", fill=(255, 255, 255), font=f2)
    d.text((100, 1290), "+ charger", fill=(255, 255, 255), font=f2)
    d.text((100, 1340), "auto-reboot", fill=(160, 170, 180), font=f2)
    _kartu(d, 570, 1150, 1020, 1400, outline=(147, 197, 253, 150))
    d.text((610, 1180), "2. TERMUX", fill=(147, 197, 253), font=f1)
    d.text((610, 1240), "cron 15 mnt", fill=(255, 255, 255), font=f2)
    d.text((610, 1290), "node --once", fill=(255, 255, 255), font=f2)
    d.text((610, 1340), "F-Droid!", fill=(160, 170, 180), font=f2)


def _ilustrasi_pantun(d, ImageFont):
    # Bubble chat pantun
    try:
        f = ImageFont.truetype(FONT_REG, 34)
        fb = ImageFont.truetype(FONT_BOLD, 34)
    except Exception:  # noqa: BLE001
        f = fb = ImageFont.load_default()
    d.rounded_rectangle([(80, 1150), (900, 1260)], radius=24, fill=(6, 95, 70))
    d.text((120, 1185), "Ditelpon berdering...", fill=(255, 255, 255), font=f)
    d.rounded_rectangle([(180, 1280), (1000, 1390)], radius=24, fill=(250, 204, 21))
    d.text((220, 1315), "ternyata gaya miring! wkwk", fill=(20, 20, 20), font=fb)


def _ilustrasi_cta(d, ImageFont):
    # Dua tombol besar: FOLLOW + JOIN SALURAN
    try:
        f = ImageFont.truetype(FONT_BOLD, 44)
        fk = ImageFont.truetype(FONT_REG, 30)
    except Exception:  # noqa: BLE001
        f = fk = ImageFont.load_default()
    d.rounded_rectangle([(80, 1150), (1000, 1250)], radius=24, fill=(250, 204, 21))
    t = "FOLLOW  •  TOOLS GRATIS"
    bb = d.textbbox((0, 0), t, font=f)
    d.text(((1080 - (bb[2] - bb[0])) / 2, 1175), t, fill=(20, 20, 20), font=f)
    d.rounded_rectangle([(80, 1275), (1000, 1375)], radius=24, fill=(37, 211, 102))
    t2 = "JOIN SALURAN WA  •  APK TIAP MINGGU"
    try:
        fs = ImageFont.truetype(FONT_BOLD, 32)
    except Exception:  # noqa: BLE001
        fs = f
    bb = d.textbbox((0, 0), t2, font=fs)
    d.text(((1080 - (bb[2] - bb[0])) / 2, 1310), t2, fill=(10, 25, 10), font=fs)


ILUSTRASI = {
    "hook": _ilustrasi_hook,
    "masalah": _ilustrasi_masalah,
    "cara_kerja": _ilustrasi_cara_kerja,
    "hosting_detail": _ilustrasi_hosting,
    "pantun_ketawa": _ilustrasi_pantun,
    "cta": _ilustrasi_cta,
}


def gambar_bg(scene: dict, kicker: str, judul_lines: list[str], badge: str = "") -> "Image.Image":
    from PIL import Image, ImageDraw, ImageFont
    atas, bawah = GRADIENTS.get(scene["visual"]["bg"], ((20, 20, 30), (8, 8, 12)))
    im = Image.new("RGB", (W, H))
    # gradient vertikal
    for y in range(H):
        t = y / H
        im.paste((int(atas[0] + (bawah[0] - atas[0]) * t),
                  int(atas[1] + (bawah[1] - atas[1]) * t),
                  int(atas[2] + (bawah[2] - atas[2]) * t)), (0, y, W, y + 1))
    d = ImageDraw.Draw(im)
    try:
        f_kicker = ImageFont.truetype(FONT_BOLD, 40)
        f_judul = ImageFont.truetype(FONT_BOLD, 72)
        f_badge = ImageFont.truetype(FONT_BOLD, 36)
        f_brand = ImageFont.truetype(FONT_BOLD, 30)
    except Exception:  # noqa: BLE001
        f_kicker = f_judul = f_badge = f_brand = ImageFont.load_default()

    # brand bar atas (aman dari notch TikTok: y 120)
    d.text((60, 120), "wa-release-bot  •  xyverse", fill=(255, 255, 255, 200), font=f_brand)
    d.line([(60, 175), (W - 60, 175)], fill=(255, 255, 255, 60), width=2)

    # kicker kuning (label penonton, BUKAN catatan internal)
    d.text((60, 230), kicker.upper()[:30], fill=(250, 204, 21), font=f_kicker)

    # badge hijau di bawah kicker
    if badge:
        bb = d.textbbox((0, 0), badge, font=f_badge)
        bw = bb[2] - bb[0] + 60
        d.rectangle([(60, 300), (60 + bw, 368)], fill=(34, 197, 94))
        d.text((90, 311), badge, fill=(10, 20, 10), font=f_badge)

    # judul tengah (y 430-1100): wrap by pixel, highlight baris KAPITAL dengan kotak kuning
    y = 430
    dibungkus: list[str] = []
    for baris in judul_lines[:4]:
        dibungkus.extend(_wrap_px(d, baris, f_judul, W - 120))
    for baris in dibungkus[:6]:
        if y > 1080:
            break
        if baris.isupper() and len(baris) > 2:
            bb = d.textbbox((60, y), baris, font=f_judul)
            d.rectangle([(bb[0] - 14, bb[1] - 8), (bb[2] + 14, bb[3] + 8)],
                        fill=(250, 204, 21))
            d.text((60, y), baris, fill=(20, 20, 20), font=f_judul)
        else:
            d.text((60, y), baris, fill=(255, 255, 255), font=f_judul)
        y += 100

    # ilustrasi per scene (digambar manual, y 1150-1400, di atas area subtitle)
    fn = ILUSTRASI.get(scene.get("id", ""))
    if fn:
        fn(d, ImageFont)

    # footer (area tombol TikTok di bawah 1600 — subtitle di ~1560)
    d.text((60, H - 120), "link APK di pinned comment", fill=(255, 255, 255, 140), font=f_brand)
    return im


KICKER = {
    "hook": "fyp • tech hack",
    "masalah": "masalahnya...",
    "cara_kerja": "cara kerja",
    "hosting_detail": "hosting gratis",
    "pantun_ketawa": "bonus pantun",
    "cta": "gas install",
}
BADGE = {
    "hook": "GRATIS",
    "masalah": "BOT TIDUR",
    "cara_kerja": "0% CPU",
    "hosting_detail": "TANPA VPS",
    "pantun_ketawa": "WKWKWK",
    "cta": "FOLLOW + JOIN",
}


def tulis_ass(scenesdanger: list[dict], timings: list[tuple[float, float]], out: Path, style: dict):
    """Subtitle ASS karaoke: tiap baris dibagi merata dalam scene, highlight per kata pakai {\\k}."""
    head = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: TikTok,{font},{size},{teks},{hl},&HFF000000,&H99000000,-1,0,0,0,100,100,0,0,1,{outline},{shadow},2,60,60,{margin},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
""".format(
        font=style.get("font", "DejaVu Sans"),
        size=style.get("ukuran", 64),
        teks=style.get("warna_teks", "&H00FFFFFF"),
        hl=style.get("warna_highlight", "&H0000E5FF"),
        outline=style.get("outline", 4),
        shadow=style.get("shadow", 2),
        margin=style.get("margin_bawah", 320),
    )
    def ts(s: float) -> str:
        s = max(0, s)
        return f"{int(s // 3600)}:{int(s % 3600 // 60):02d}:{int(s % 60):02d}.{int(s % 1 * 100):02d}"

    lines = [head]
    for sc, (mulai, selesai) in zip(scenesdanger, timings):
        subs: list[str] = sc.get("subtitle", [])
        if not subs:
            continue
        slot = (selesai - mulai - 0.2) / len(subs)
        for i, baris in enumerate(subs):
            s0 = mulai + i * slot + 0.1
            s1 = min(selesai - 0.05, s0 + slot)
            kata = baris.split()
            # bagi durasi merata per kata, karaoke 100 = 1 detik
            per_kata = max(8, int((s1 - s0) * 100 / max(1, len(kata))))
            kara = "".join(f"{{\\k{per_kata}}}{k} " for k in kata).strip()
            # max 2 baris visual: selipkan \\N di tengah kalau panjang
            if len(baris) > 26 and " " in baris:
                parts = kara.split(" ")
                mid = len(parts) // 2
                kara = " ".join(parts[:mid]) + r"\N" + " ".join(parts[mid:])
            lines.append(f"Dialogue: 0,{ts(s0)},{ts(s1)},TikTok,,0,0,0,,{kara}")
    out.write_text("\n".join(lines), encoding="utf-8")
    print(f"  subtitle: {out} ({len(lines) - 1} baris)")


async def bikin_vo(script: dict, kerja: Path, dry_run: bool) -> dict[str, Path]:
    """TTS per scene → file mp3. Pantun dipisah 2 bagian + sfx ketawa di tengah (digabung di ffmpeg)."""
    meta = script["meta"]
    hasil: dict[str, Path] = {}
    for sc in script["scenes"]:
        sid = sc["id"]
        out = kerja / f"vo_{sid}.mp3"
        if dry_run:
            # dummy: bikin silence sesuai estimasi panjang teks (biar timing realistis)
            teks = sc.get("vo", "") or " ".join(p.get("teks", "") for p in sc.get("vo_parts", [])) or sc.get("vo_lanjutan", "")
            estimasi = max(2.0, len(teks.split()) / 2.6)  # ~2.6 kata/detik (cewek gaul agak cepat)
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi",
                            "-i", f"sine=frequency=440:duration={estimasi:.1f}",
                            "-af", "volume=0", str(out)], check=True, timeout=60)
            hasil[sid] = out
            continue
        if "vo_parts" in sc:
            # pantun: TTS 2 potong, gabung dengan ketawa di tengah
            p1 = kerja / f"vo_{sid}_a.mp3"
            p2 = kerja / f"vo_{sid}_b.mp3"
            await tts_edge(sc["vo_parts"][0]["teks"], p1, meta["voice"], meta["voice_rate"], meta["voice_pitch"])
            lanjutan = sc["vo_parts"][2]["teks"] + " " + sc.get("vo_lanjutan", "")
            await tts_edge(lanjutan, p2, meta["voice"], meta["voice_rate"], meta["voice_pitch"])
            ketawa = ASSETS / "sfx" / "ketawa-cewek.mp3"
            if ketawa.exists():
                sh("ffmpeg", "-y", "-loglevel", "error",
                   "-i", str(p1), "-i", str(ketawa), "-i", str(p2),
                   "-filter_complex", "[0][1][2]concat=n=3:v=0:a=1", str(out))
            else:
                sh("ffmpeg", "-y", "-loglevel", "error",
                   "-i", str(p1), "-i", str(p2),
                   "-filter_complex", "[0][1]concat=n=2:v=0:a=1", str(out))
        else:
            await tts_edge(sc["vo"], out, meta["voice"], meta["voice_rate"], meta["voice_pitch"])
        print(f"  VO {sid}: {durasi_audio(out):.1f}s")
        hasil[sid] = out
    return hasil


POSISI_STIKER = {
    "kanan_atas": ("W-w-40", "300"),
    "kiri_atas": ("40", "300"),
    "kanan_bawah": ("W-w-40", "H-h-560"),
    "kiri_bawah": ("40", "H-h-560"),
    "kiri_tengah": ("40", "(H-h)/2"),
    "kanan_tengah": ("W-w-40", "(H-h)/2"),
    "tengah_atas": ("(W-w)/2", "700"),
    "tengah_bawah": ("(W-w)/2", "H-h-560"),
}


def render(script_path: Path, out_path: Path, dry_run: bool):
    script = json.loads(script_path.read_text(encoding="utf-8"))
    kerja = out_path.parent / "_kerja_tiktok"
    kerja.mkdir(parents=True, exist_ok=True)

    print("== 1/5 VO ==")
    vo_files = asyncio.run(bikin_vo(script, kerja, dry_run))

    print("== 2/5 timing ==")
    timings: list[tuple[float, float]] = []
    t = 0.0
    for sc in script["scenes"]:
        d = durasi_audio(vo_files[sc["id"]]) + 0.5
        # hook minimal 3 detik, CTA minimal 5 detik (biar tombol kebaca)
        if sc["id"] == "hook":
            d = max(d, 3.2)
        if sc["id"] == "cta":
            d = max(d, 5.5)
        timings.append((t, t + d))
        t += d
    total = t
    print(f"  total: {total:.1f}s (target 55-65s)")

    print("== 3/5 background ==")
    seg_video: list[Path] = []
    for sc, (mulai, selesai) in zip(script["scenes"], timings):
        sid = sc["id"]
        png = kerja / f"bg_{sid}.png"
        gambar_bg(sc, KICKER.get(sid, sid), sc.get("subtitle", []), BADGE.get(sid, "")).save(png)
        seg = kerja / f"seg_{sid}.mp4"
        sh("ffmpeg", "-y", "-loglevel", "error", "-loop", "1", "-framerate", str(FPS),
           "-i", str(png), "-t", f"{selesai - mulai:.2f}",
           "-c:v", "libx264", "-pix_fmt", "yuv420p", "-vf", f"scale={W}:{H}", str(seg))
        seg_video.append(seg)

    print("== 4/5 concat + stiker + subtitle ==")
    # concat video
    daftar = kerja / "concat.txt"
    daftar.write_text("".join(f"file '{s}'\n" for s in seg_video), encoding="utf-8")
    base = kerja / "base.mp4"
    sh("ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0",
       "-i", str(daftar), "-c", "copy", str(base))

    # overlay stiker (enable between, posisi dari POSISI_STIKER)
    ass = kerja / "sub.ass"
    tulis_ass(script["scenes"], timings, ass, script.get("subtitle_style", {}))

    cmd_v: list[str] = ["ffmpeg", "-y", "-loglevel", "error", "-i", str(base)]
    overlays: list[tuple[Path, str, str, float, float]] = []
    for sc, (mulai, selesai) in zip(script["scenes"], timings):
        rel0 = sc.get("mulai_detik", 0)
        for st in sc.get("stiker", []):
            p = ASSETS / "stickers" / f"{st['nama']}.png"
            if not p.exists():
                continue
            masuk_abs = float(st.get("masuk", rel0))
            masuk_rel = max(0.0, masuk_abs - rel0)  # script pakai absolut → jadikan relatif
            t0 = mulai + masuk_rel
            t1 = min(selesai, t0 + 4.0)
            x, y = POSISI_STIKER.get(st.get("posisi", "kanan_atas"), ("W-w-40", "300"))
            overlays.append((p, x, y, t0, t1))
    filt_v: list[str] = []
    label = "0:v"
    for i, (p, x, y, t0, t1) in enumerate(overlays):
        cmd_v += ["-i", str(p)]
        out_l = f"v{i}"
        filt_v.append(f"[{label}][{i + 1}:v]overlay=x='{x}':y='{y}':enable='between(t,{t0:.2f},{t1:.2f})'[{out_l}]")
        label = out_l
    ass_esc = str(ass).replace(":", "\\:").replace("'", "")
    filt_v.append(f"[{label}]subtitles='{ass_esc}'[vout]")
    video_saja = kerja / "video_saja.mp4"
    sh(*cmd_v, "-filter_complex", ";".join(filt_v), "-map", "[vout]",
       "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", str(FPS), str(video_saja))

    print("== 5/5 audio (VO + SFX) ==")
    # VO concat sesuai timing (ada padding antar scene → sisipkan silence)
    vo_list = kerja / "vo_concat.txt"
    # bangun ulang VO dengan silence padding via ffmpeg: tiap VO + apad=whole_dur
    vo_padded: list[Path] = []
    for sc, (mulai, selesai) in zip(script["scenes"], timings):
        src = vo_files[sc["id"]]
        dst = kerja / f"vo_pad_{sc['id']}.m4a"
        sh("ffmpeg", "-y", "-loglevel", "error", "-i", str(src),
           "-af", f"apad=whole_dur={selesai - mulai:.2f}", "-t", f"{selesai - mulai:.2f}",
           "-c:a", "aac", str(dst))
        vo_padded.append(dst)
    vo_list.write_text("".join(f"file '{p}'\n" for p in vo_padded), encoding="utf-8")
    vo_full = kerja / "vo_full.m4a"
    sh("ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0",
       "-i", str(vo_list), "-c", "copy", str(vo_full))

    # SFX: absolut di script → relatif per scene → absolut aktual
    cmd_a: list[str] = ["ffmpeg", "-y", "-loglevel", "error", "-i", str(video_saja), "-i", str(vo_full)]
    sfx_inputs: list[tuple[Path, float, float]] = []
    for sc, (mulai, _) in zip(script["scenes"], timings):
        rel0 = sc.get("mulai_detik", 0)
        for s in sc.get("sfx", []):
            p = ASSETS / "sfx" / f"{s['nama']}.mp3"
            if not p.exists():
                continue
            at_rel = max(0.0, float(s.get("at", rel0)) - rel0)
            sfx_inputs.append((p, mulai + at_rel, float(s.get("vol", 60)) / 100))
    for p, _, _ in sfx_inputs:
        cmd_a += ["-i", str(p)]
    # mix: [1] VO full + tiap SFX di-delay
    if sfx_inputs:
        parts = ["[1:a]volume=1.0[vo]"]
        mix_labels = ["[vo]"]
        for i, (_, at, vol) in enumerate(sfx_inputs):
            idx = i + 2
            ms = int(at * 1000)
            parts.append(f"[{idx}:a]adelay={ms}|{ms},volume={vol:.2f}[s{i}]")
            mix_labels.append(f"[s{i}]")
        parts.append(f"{''.join(mix_labels)}amix=inputs={len(mix_labels)}:normalize=0[aout]")
        filt_a = ";".join(parts)
        sh(*cmd_a, "-filter_complex", filt_a, "-map", "0:v", "-map", "[aout]",
           "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-ar", "44100",
           "-shortest", str(out_path))
    else:
        sh(*cmd_a, "-map", "0:v", "-map", "1:a", "-c:v", "copy",
           "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-shortest", str(out_path))

    size_mb = out_path.stat().st_size / 1048576
    print(f"\nSELESAI: {out_path} ({size_mb:.1f} MB, {total:.1f}s, {W}x{H}@{FPS})")
    print("Upload manual ke TikTok. Jangan auto-post pakai bot ilegal — akun bisa keban.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--script", default=str(ROOT / "script.json"))
    ap.add_argument("--out", default="dist/tiktok_vertical.mp4")
    ap.add_argument("--dry-run", action="store_true",
                    help="tanpa TTS/jaringan: VO diganti silence biar bisa validasi timing/visual")
    args = ap.parse_args()
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    try:
        render(Path(args.script), out, args.dry_run)
    except FileNotFoundError as e:
        print(f"File nggak ketemu: {e}", file=sys.stderr)
        sys.exit(2)
    except subprocess.CalledProcessError as e:
        print(f"ffmpeg gagal: {e}", file=sys.stderr)
        sys.exit(3)


if __name__ == "__main__":
    main()
