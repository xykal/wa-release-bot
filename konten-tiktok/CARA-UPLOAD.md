# Konten TikTok — WA Release Bot (Eps 1)

File terbaru (versi 6, ±152 detik, 720p60 langsung) — PAKAI INI:
- `tiktok-v6-wa-release-bot.mp4` — lengkap
- `tiktok-v6-tanpa-musik.mp4` — tanpa musik latar (buat pasang sound viral)

Render di **GitHub Actions** (tab Actions → Render TikTok v6 → Run workflow),
hasilnya di Artifacts. JANGAN render di lokal/HP — 9093 frame, berat.

Yang baru di v6: render langsung 720p60 satu pass (tanpa file 1080 perantara),
cue SFX/stiker/meme di-stagger (tidak ada yang bunyi/muncul bersamaan), stiker
meme tanpa border putih, scene Kall gaya WA penuh, HP digedein 1.08x, judul
dinaikin, VO Kall di-tune (tempo + nada disamain kayak VO utama).

Versi 5 (±154 detik, 720p30):
- `tiktok-v5-wa-release-bot.mp4` — lengkap
- `tiktok-v5-tanpa-musik.mp4` — tanpa musik latar (buat pasang sound viral)

Yang baru di v5: scene "si Kall ngapain wok" (kenalin developer + komentar),
kartu varian APK (arm64/32-bit/universal + ukuran rilis beneran), chip interval
+ token anti rate-limit, balasan Kall di CTA, 9 SFX + 3 meme + 4 stiker baru.

Versi 4 (±140 detik, 1080p60):
- `tiktok-v4-wa-release-bot.mp4` — lengkap
- `tiktok-v4-tanpa-musik.mp4` — tanpa musik latar (buat pasang sound viral)

Yang baru di v4: penjelasan hosting detail (Node.js di dalam APK, bukan Termux;
perangkat tertaut; rilis GitHub → channel; pipa lagu Cloudflare + HP; hosting
ZIP), meme + sound lebih banyak, stiker KOTAK tegak tajam (tanpa radius),
subtitle gaya v3, tanpa label episode, CTA join saluran WA + follow.

Versi 3 (±78 detik):
- `tiktok-v3-wa-release-bot.mp4` — lengkap
- `tiktok-v3-tanpa-musik.mp4` — tanpa musik latar (buat pasang sound viral)

Stiker meme dari pack "Stiker Meme" by IG @rullvierro_ (getstickerpack.com) — kalau mau aman,
tag/kredit di caption: "stiker: @rullvierro_".

Versi 2 (lama):
- `tiktok-v2-wa-release-bot.mp4` — lengkap: suara + efek meme + musik latar pelan
- `tiktok-v2-tanpa-musik.mp4` — suara + efek meme aja, buat dipasang sound TikTok yang lagi viral

Efek suara meme diambil dari myinstants (vine boom, rizz, bonk, tuturu, rimshot, jangkrik, dll.).
Itu suara meme yang umum dipakai, tapi hak ciptanya bukan punya kita — kalau TikTok nge-mute
atau kasih peringatan hak cipta, pakai versi tanpa musik + sound resmi dari TikTok.

## Caption (copy-paste)
Grup WA kamu sering kemasukan akun aneh? Aku bikin bot yang jagain otomatis, langsung dari HP 🤖🛡️
Fitur apa lagi yang harus aku tambahin? Tulis di komen 👇

#botwhatsapp #whatsapp #androiddeveloper #bikinaplikasi #coding #programmer #teknologi #fyp #xyverse

## Biar gampang masuk FYP
0. **Wajib:** sebelum posting, buka *Setelan lainnya* → nyalakan **"Konten yang dibuat AI"** (suaranya AI). Jangan tulis "link APK"/"download di bio" di caption.
1. Upload versi **tanpa musik**, terus tambahin sound yang lagi viral di TikTok dengan volume kecil (±10–15%). Sound yang lagi rame bikin video lebih sering dimunculin.
2. Waktu posting yang biasanya rame: **11.00–13.00** atau **19.00–21.00** WIB.
3. Pilih sampul (cover) dari detik ±2–3 (ada perisai "DIJAGA BOT" + judul besar).
4. Balas komentar pakai **video balasan** — itu jadi bahan Eps 2, dan bikin seri yang konsisten.
5. Pin komentar sendiri: "Eps 2 mau bahas fitur lagu otomatis atau cara pasangnya?"
6. Jangan hapus lalu upload ulang video yang sama; kalau sepi, bikin versi baru dengan judul pembuka (hook) yang beda.

## Bikin episode berikutnya
Template sama (warna, font, posisi judul/HP/subtitle) ada di `render.py`. Ganti isi `SCENES`,
bikin rekaman suara baru di `vo/`, lalu jalankan `python3 render.py`.
