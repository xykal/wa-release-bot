# TikTok Renderer — wa-release-bot

Render video TikTok **100% di GitHub Actions**, bukan di lokal / Cloudflare / Vercel.

## Kenapa GitHub Actions?

| Tempat | Bisa render video? | Alasan |
|---|---|---|
| Cloudflare Workers | NGGAK | CPU 10-50ms, nggak ada ffmpeg, nggak ada filesystem, script max 1MB. R2/Stream cuma buat simpan/hosting, bukan render. |
| Vercel Serverless | NGGAK | Timeout 10-60 detik, RAM 1-3GB, nggak ada ffmpeg persistent. Cocok buat hosting preview page, bukan render. |
| Vercel Build | NGGAK rekomen | Max 45 menit tapi sekali deploy, nggak bisa trigger manual per video, nggak ada artifact video. |
| **GitHub Actions** | **BISA, ini solusinya** | 2-core, 7GB RAM, 6 jam timeout, ffmpeg + python preinstalled, free 2000 menit/bulan (public repo gratis melimpah). Bisa `workflow_dispatch` manual per video. |

Arsitektur final:

```
lu edit script.json (lokal, ringan)
        │ push
        ▼
GitHub Actions (render-tiktok.yml)
  1. edge-tts → voiceover id-ID-GadisNeural (cewek, lembut, gaul)
  2. Pillow → background 1080x1920 + kartu UI (tanpa CDN, tanpa browser)
  3. ffmpeg → gabung VO + meme SFX + stiker + subtitle karaoke
  4. output tiktok_vertical.mp4 (H.264, 30fps)
        │
        ▼
Artifact (30 hari) + Release (opsional) + Cloudinary/R2 (opsional)
```

Berat render: ~3-5 menit di Actions. Di lokal: 0% — lu cuma edit JSON.

## Cara pakai

1. Edit `tiktok/script.json` (narasi, subtitle, meme cues).
2. Commit + push ke `main`.
3. Buka tab **Actions → Render TikTok → Run workflow** → pilih voice / varian.
4. Tunggu ~4 menit → download MP4 dari Artifacts.
5. Upload manual ke TikTok (auto-post TikTok butuh API review, jangan diakalin pakai bot ilegal — akun bisa keban).

Atau trigger manual tanpa push: Actions → Run workflow → isi `narasi_override` buat testing hook baru.

## Struktur

```
tiktok/
  script.json        ← NARASI + TIMING + MEME CUES (edit ini doang)
  render.py          ← renderer ringan (Pillow + ffmpeg, tanpa browser/Remotion)
  fetch_assets.py    ← download stiker + meme SFX sekali, terus di-cache
  stickers.txt       ← daftar stiker (getstickerpack, sharp, tanpa radius)
  meme_sfx.txt       ← daftar SFX (myinstants direct mp3)
  requirements.txt   ← edge-tts + Pillow doang
  assets/            ← hasil download (di-ignore git, di-cache Actions)
  README.md          ← file ini
```

## Voiceover

- Default: `id-ID-GadisNeural` (cewek, natural, tanpa logat Inggris).
- Setting cute-lembut: `rate=+8%`, `pitch=+10Hz`.
- Pantun ketawa: narasi dipisah 2 file, disisipi `ketawa-cewek.mp3` + subtitle `wkwkwk` — jadi kedengeran natural nahan tawa, bukan TTS baca "(haha)".
- Semua teks VO ada di `script.json` → gampang diedit tanpa sentuh kode.

## Subtitle

- Format ASS karaoke, gaya TikTok: bold putih + stroke hitam tebal + highlight kuning per kata.
- Nggak ada tulisan "EPISODE" — sesuai request.
- Font: DejaVu Sans Bold (bawaan runner, nggak perlu download).

## Stiker & SFX

- Stiker: `stickers.txt` — URL getstickerpack. Render **tegak tajem, tanpa rounded corner**, sesuai request.
- SFX: `meme_sfx.txt` — URL myinstants direct mp3 (vine boom, faahhh, get out, discord, gak rispek wok, saya akan lawan).
- Lisensi: meme SFX/stiker itu fair-use buat konten, tapi JANGAN diklaim sebagai milik sendiri. Kalau video di-takedown TikTok, ganti SFX-nya di `script.json`.

## Secrets yang dibutuhkan (opsional)

| Secret | Buat apa | Wajib? |
|---|---|---|
| `CLOUDINARY_URL` | auto-upload hasil render ke Cloudinary | nggak |
| — | Artifact Actions doang udah cukup | — |

Nggak perlu token aneh-aneh. Jangan pernah commit file token ke repo.

## Biaya

- Public repo: Actions gratis (limit fair-use).
- edge-tts: gratis (pakai endpoint trial Microsoft Edge).
- ffmpeg + Pillow: gratis, preinstalled / pip.
- Total: Rp 0.
