# PRD — WA Release Bot

Ditulis 2026-09-29 untuk produk yang sudah ada (v1.6.7), bukan rencana dari nol.
Fungsinya: satu tempat yang menjelaskan apa yang dijanjikan produk ini, supaya
perubahan berikutnya bisa diuji terhadap janji itu.

## 1. Masalah

Pemilik channel WhatsApp yang mengikuti sebuah repo GitHub harus mengecek sendiri
halaman Releases lalu menyalin catatan rilis ke channel. Bot WA yang ada umumnya
butuh server/VPS yang nyala 24 jam, sedangkan pekerjaannya cuma beberapa detik
per hari.

## 2. Pengguna

- **Utama**: pemilik/admin channel atau grup WA yang mengumumkan rilis proyeknya
  sendiri, punya HP Android, tidak mau bayar server. Contoh: kall sendiri.
- **Sekunder**: pengguna Termux/PC yang lebih suka cron daripada aplikasi.
- **Bukan target**: tim besar yang butuh banyak repo, banyak channel, SLA.

## 3. Janji produk

1. Setiap release baru (bukan draft; prerelease opsional) muncul di channel
   paling lambat N menit setelah dipublikasikan (N = interval cek, default 15).
2. Tidak ada rilis yang diumumkan dua kali, dan rollback tag tidak diumumkan ulang.
3. Antara dua cek, bot tidak memakai CPU/data. Repo yang tidak berubah = 0 byte body (ETag 304).
4. Sesi WA hanya tersimpan di perangkat pengguna. Tidak ada server milik proyek
   yang melihat pesan, nomor, atau token GitHub.
5. APK dan CLI memakai engine yang sama (`bot-js/src`), jadi perilakunya identik.

## 4. Fitur (status sekarang)

| Fitur | Status | Catatan |
|---|---|---|
| Pantau `/releases/latest`, posting ke channel/grup | ada | `rilis.mjs` memutuskan baru/rollback/tidur |
| Tautkan WA lewat QR atau pairing code | ada | `wa.mjs`, Baileys 6.7.24 |
| Format pesan: teks atau "pertanyaan" (ajak balas) | ada | `format.mjs` |
| Penjaga grup: auto-terima, tolak yang pernah keluar | ada | `grup.mjs` |
| Lagu mood (voice note, Cloudflare Worker + Groq) | ada, opsional | satu-satunya komponen cloud, free tier |
| Hosting bot Node.js sendiri dari ZIP | ada | `pasang-modul.mjs`, `hosting.mjs` |
| CLI Termux/PC dengan mode `--once` untuk cron | ada | `cli/src/cli.mjs` |
| Multi-repo, sumber selain GitHub, Play Store | belum | lihat `docs/ROADMAP.md` |

## 5. Batasan yang disengaja

- Satu repo per instalasi. Menyederhanakan state dan UI.
- Tidak ada server relay: kalau HP mati, bot mati. Itu bagian dari janji nomor 4.
- Node 18 di dalam APK (nodejs-mobile) meski Baileys minta Node 20: ditutup polyfill
  WebCrypto dan diuji di CI dengan Node 18.
- Emoji di UI dan pesan bot adalah gaya produk yang dipilih pemilik; dokumen
  teknis (docs/, CI, kode) tanpa emoji.

## 6. Kualitas dan keamanan

- Semua perubahan lewat GitHub Actions: lint, unit test (Node 18 dan 20), audit
  dependensi, CodeQL, build APK. Tidak ada build lokal yang dianggap bukti.
- Actions dipin ke SHA penuh; `permissions` minimal; `timeout-minutes` di tiap job.
- Cleartext di sisi Android hanya ke 127.0.0.1 (WebSocket app <-> engine).
- Endpoint publik Worker lagu dibatasi per perangkat, per IP, dan global.
- Pelaporan kerentanan: `SECURITY.md`.

## 7. Metrik keberhasilan

Produk ini portofolio + dipakai sendiri; metriknya sederhana:

- CI hijau di `main` setiap saat.
- Nol laporan "rilis diumumkan dobel" atau "rilis kelewat" dari kall selama satu bulan pemakaian.
- Waktu dari `git clone` sampai pesan tes masuk channel di Termux < 10 menit mengikuti README.

## 8. Keputusan terbuka

Lihat `docs/ROADMAP.md` bagian "Arah produk": portofolio + donasi, atau open-core.
Sampai diputuskan, tidak ada fitur berbayar dan tidak ada pengumpulan data pengguna.

Built by xykal — XyVerse Technology Global
