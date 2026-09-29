# Konten TikTok — arsip dan cara ambil ulang

Per 2026-09-29 folder `konten-tiktok/` (render `render*.py`, SFX, stiker, VO, timing) dan workflow
`render-v4/v5/v6.yml` dikeluarkan dari repo produk. Alasannya ada di `docs/AUDIT-2026-09-29.md` H3:

- SFX meme, ringtone, dan potongan suara tokoh publik di `sfx/` bukan aset berlisensi. Repo ini
  publik dan source-available, jadi tiap clone ikut menyebarkan ulang file itu.
- Stiker dari pack orang lain (IG @rullvierro_) dipakai tanpa lisensi tertulis.
- 39 MB media bikin clone repo APK jadi 75 MB.
- Render 180 menit di GitHub Actions untuk materi pemasaran itu area abu-abu kebijakan Actions.

## Ambil ulang aset (kalau perlu render episode baru)

Riwayat git di GitHub sudah ditulis ulang (2026-09-29) supaya aset pihak ketiga itu tidak
ikut repo publik lagi, jadi `git checkout <sha-lama>` tidak jalan dari clone baru. Sumbernya:

- clone lokal kall yang dibuat sebelum 2026-09-29 (commit lama `371f5da`, versi v6), atau
- artefak MP4 dari run workflow render lama di tab Actions (retensi 30 hari sejak 2026-09-27), atau
- unduh ulang dari sumber aslinya pakai daftar di `konten-tiktok/README` versi lama tersebut.

Jangan commit lagi ke repo ini. Kalau mau lanjut bikin episode: repo terpisah, dan ganti SFX
dengan yang berlisensi CC0 (mis. freesound dengan filter CC0) atau bikin sendiri; stiker bikin
sendiri dari maskot bot. Riwayat lama baru bisa benar-benar dihapus dari GitHub dengan
`git filter-repo` + force push — itu keputusan terpisah, jangan dijalankan tanpa perintah.

Video hasil render v6 ada di artifact run `Render TikTok v6` (retensi 30 hari dari 2026-09-28).
Unduh dan simpan di luar repo sebelum kadaluarsa.

## Caption (copy-paste)

Grup WA kamu sering kemasukan akun aneh? Aku bikin bot yang jagain otomatis, langsung dari HP.
Fitur apa lagi yang harus aku tambahin? Tulis di komen.

#botwhatsapp #whatsapp #androiddeveloper #bikinaplikasi #coding #programmer #teknologi #fyp #xyverse

## Catatan upload

0. Sebelum posting, nyalakan label "Konten yang dibuat AI" (suaranya AI). Jangan tulis "link APK"
   atau "download di bio" di caption; arahkan ke komentar yang di-pin.
1. Upload versi tanpa musik, tambahkan sound yang sedang ramai dengan volume 10-15%.
2. Jam posting yang biasanya ramai: 11.00-13.00 atau 19.00-21.00 WIB.
3. Sampul dari detik 2-3 (perisai "DIJAGA BOT" + judul besar).
4. Balas komentar dengan video balasan; itu bahan episode 2.
5. Pin komentar sendiri: "Eps 2 mau bahas fitur lagu otomatis atau cara pasangnya?"
6. Jangan hapus lalu upload ulang video yang sama; kalau sepi, bikin versi baru dengan hook beda.
