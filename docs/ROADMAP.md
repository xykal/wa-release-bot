# Roadmap

Status per 2026-10-03. Fokus saat ini adalah kestabilan calon rilis publik
1.0.0, bukan penambahan fitur.

## Prinsip prioritas

1. Jalur **GitHub Release ke WhatsApp** adalah produk inti.
2. Fitur tambahan tidak boleh mengubah bawaan hemat baterai.
3. Fitur yang belum terbukti di perangkat nyata tetap opt-in/eksperimental.
4. Temuan keamanan dan risiko kehilangan pesan lebih penting daripada kosmetik.

## P0 — gerbang rilis publik 1.0.0

Target yang direncanakan: Minggu, 11 Oktober 2026 pukul 19.00 WIB
(12.00 UTC). Target boleh ditunda; checklist keamanan dan uji perangkat tidak
boleh dipotong demi tanggal.

| Item | Status 2026-10-03 | Syarat selesai |
|---|---|---|
| Semua fitur tambahan default mati | dikerjakan di hardening pre-launch | unit test + APK compile |
| Hosting: env allowlist, SHA-256, persetujuan risiko | dikerjakan di hardening pre-launch | test JS/Kotlin + dialog terlihat di APK |
| Boot receiver tidak dapat dipicu app lain | dikerjakan di hardening pre-launch | `exported=false`, hanya broadcast sistem standar |
| Sinkronkan PRD, roadmap, README, panduan, keamanan | dikerjakan di hardening pre-launch | review dokumen + pemeriksaan CI |
| Uji 24–48 jam arm64 | menunggu perangkat nyata | semua skenario checklist lulus |
| Uji 24–48 jam armeabi-v7a | menunggu perangkat nyata | semua skenario checklist lulus |
| Selidiki self-chat "Waiting for this message" | terbuka | tidak memblokir core release jika fitur terkait tetap eksperimental |
| Tangkapan layar dan situs sesuai UI kandidat | menunggu kandidat APK | screenshot CI + pemeriksaan manual |
| Seluruh workflow kandidat hijau | menunggu PR/commit kandidat | Build APK, Quality, CodeQL, Security sukses |

Checklist operasional lengkap: [CHECKLIST-PRELAUNCH.md](CHECKLIST-PRELAUNCH.md).

## Paket rilis 1.0.0

### Janji stabil

- pairing WhatsApp;
- multi-repo GitHub dan channel per repo;
- ETag, baseline, rollback guard, pending state, dan retry;
- notifikasi kegagalan;
- CLI yang memakai engine sama;
- log dan ekspor diagnostik.

### Tambahan opt-in

Penjaga grup dan pesan berkala tetap tersedia tetapi bukan alasan utama produk.
Moderasi, perintah pribadi, stiker, Brat, welcome, Status, rekam channel, lagu,
dan hosting diberi status eksperimental. `.storygrup` tetap fail-closed.

## Prosedur rilis 1.0.0

Build internal saat ini memakai versi 1.8.0. Karena 1.0.0 memiliki versionCode
lebih rendah jika memakai rumus lama, PR rilis harus memakai offset permanen:

`1_000_000 + major*10000 + minor*100 + patch`

Untuk 1.0.0 hasilnya `1010000`.

Urutan hari rilis:

1. Bekukan fitur dan pilih commit kandidat.
2. Jalankan checklist perangkat nyata pada APK yang berasal dari commit itu.
3. Bump `versionName` seluruh package ke 1.0.0 dan `versionCode` ke 1010000.
4. Pastikan CHANGELOG hanya memuat klaim yang telah dibuktikan.
5. Merge melalui PR dan tunggu seluruh workflow `main` hijau.
6. Hapus draft/tag internal lama sesuai kebijakan release pemilik.
7. Push tag `v1.0.0`.
8. Verifikasi `releases/latest` mengembalikan APK arm64, v7a, universal, dan
   checksum yang cocok.
9. Pasang APK publik di perangkat bersih sebelum mengumumkan tautan.

Tidak ada penjadwal otomatis untuk langkah destruktif atau publikasi tag; semua
membutuhkan konfirmasi pemilik.

## P1 — setelah rilis stabil

| Item | Effort | Catatan |
|---|---:|---|
| Investigasi E2EE self-chat | M/L | butuh log dan reproduksi perangkat nyata |
| CLI `--json` untuk dry-run | S | mempermudah otomasi tanpa memengaruhi APK |
| Rapikan API sumber release | M | persiapan GitLab/RSS tanpa menambah UI dulu |
| Telemetri lokal kesehatan scheduler | M | lokal saja, tanpa mengirim data pengguna |
| Audit akses filesystem hosting | L | worker_threads bukan boundary keamanan |

## P2 — membutuhkan keputusan arsitektur

| Item | Effort | Gerbang |
|---|---:|---|
| Runtime Node yang didukung | L | port/build nodejs-mobile baru untuk seluruh ABI |
| Android page size 16 KB / Play Store | L | `libnode.so` harus dibangun ulang |
| Native Status group mention | M/L | dukungan protokol, CI, dan uji akun nyata |
| Sumber GitLab, tag, atau RSS | M | abstraksi sumber stabil + desain migrasi state |
| Sumber audio berlisensi | M | mengganti alur SoundCloud sebelum lagu dipromosikan |

## Tidak dikerjakan sebelum P0 selesai

- fitur bot baru;
- redesain besar;
- klaim kualitas Status/HD tanpa bukti;
- memindahkan tanggal launch dengan mengurangi pengujian;
- membuat bot inti online 24 jam.

Built by xykal — XyVerse Technology Global
