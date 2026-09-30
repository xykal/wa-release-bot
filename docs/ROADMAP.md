# Roadmap

Status per 2026-09-30. Ukuran effort: S (< 1 hari kerja), M (1-3 hari), L (> 3 hari).
Semua item di sini menunggu "gas" dari kall kecuali ditandai *sedang jalan*.

## Launching publik — Minggu 2026-10-11 19.00 WIB (12.00 UTC)

Keputusan kall (2026-09-29; 2026-09-30 sempat dimajukan ke 4 Okt lalu diundur ke 11 Okt karena
scope 1.0.0 ditambah: bottom navbar + pecah layar, splash baru + voice over, fitur bot WA umum,
cek perangkat): versi rilis publik pertama adalah **1.0.0**; versi internal
1.7.x/1.8.x tetap ada sebagai release **draft** (hanya kolaborator yang lihat, aset tidak bisa
diunduh publik). Situs: <https://wabot.projectkal.my.id> — halaman unduh
menampilkan hitung mundur sampai `LAUNCH_ISO` (`web/js/teks.js`), lalu otomatis membaca
`releases/latest` (draft tidak ikut) dan mengisi kartu APK.

Checklist PR launching (`chore/rilis-1.0.0`, dibuka sebagai **draft** 2026-09-29; di-merge H-1,
bukan lebih awal, supaya `main` tetap 1.8.0 sampai hari launching):

| Langkah | Catatan |
|---|---|
| Bump `versionName` 1.0.0 di `app/build.gradle`, 3 `package.json` + lockfile, CHANGELOG `[1.0.0]` | isi changelog = gabungan 1.1–1.8 dalam bahasa pengguna |
| `versionCode` di CI: `1_000_000 + major*10000 + minor*100 + patch` = **1010000** | tanpa offset, 1.0.0 = 10000 < 10800 (v1.8.0) dan HP penguji menolak update; offset hanya diubah di PR ini |
| Hapus draft v1.7.0/v1.8.0, draft `internal-*`, **dan** tag-nya sebelum push tag `v1.0.0` | `releases/latest` memilih berdasarkan tanggal dibuat; tag lama tidak boleh tersisa |
| Tag `v1.0.0` tepat sebelum 19.00 WIB | job `release` butuh ~5 menit; halaman unduh cek tiap 60 detik |
| Setelah tayang: uji `curl https://api.github.com/repos/xykal/wa-release-bot/releases/latest` tanpa token | harus 200 dengan 3 `.apk` + 3 `.sha256` |

Jadwal hari H (butuh aba-aba kall di chat; tidak ada penjadwal otomatis):

| Kapan (WIB) | Apa |
|---|---|
| Sabtu 2026-10-10 | merge PR #18 (squash), tunggu CI `main` hijau, hapus draft + tag v1.7.0/v1.8.0 |
| Minggu 2026-10-11 18.45 | push tag `v1.0.0` dari `main`; job `release` ~5 menit |
| Minggu 2026-10-11 19.00 | popup unduh hilang sendiri; cek `releases/latest` 200 dan 6 aset; deploy situs tidak perlu |

## Menuju 1.0.0 (M11-M15, setelah launching diundur ke Minggu 2026-10-11)

| Milestone | Rencana | Status |
|---|---|---|
| M11 bottom navbar + layar dipecah lima tab | 2026-09-30 | selesai 2026-09-30 (branch `feat/nav-bawah-pecah-layar`) |
| M12 splash baru: animasi lebih halus + partikel (`PartikelView.kt`), voice over "XyVerse Technology Global" sekali setelah pasang (saklar di tab Pengaturan, mode senyap dihormati) | 2026-09-30 | selesai 2026-09-30 (branch `feat/splash-epik-vo`) |
| M13 Cek perangkat: RAM, ABI, versi Android, optimasi batre; badge peringatan di bawah spek minimum (tanpa blokir) | 2026-10-03 | selesai 2026-09-30 (branch `feat/m13-m15-fitur-bot`) |
| M14 fitur bot WA umum: foto jadi stiker HD, moderasi anti-phishing/promo kecuali admin (hapus, peringatan, kick strike kedua), menu perintah | 2026-10-04 s/d 10-06 | selesai 2026-09-30 (stiker lewat app `Stiker.kt`, moderasi `pesan.mjs` + `mesin/jaga-pesan.mjs`) |
| M15 posting story HD + tag grup (dari app dan perintah owner) | 2026-10-07/08 | selesai 2026-09-30 (perintah `.story` / `.storygrup`) |
| Jeda: tangkapan layar ulang, situs bagian fitur, dokumen | 2026-10-09 | belum |
| Merge PR launching #18 + hapus draft/tag lama, tag `v1.0.0` | 2026-10-10 s/d 10-11 | belum |

Catatan risiko M14/M15: stiker butuh encoder WebP, moderasi butuh bot jadi admin grup
(dan admin harus dikecualikan), dan tag grup di story bergantung pada dukungan Baileys
6.7.24 — ketiganya hanya bisa dibuktikan di HP dengan WhatsApp sungguhan, bukan di emulator CI.

## Sekarang (v1.6.x, sedang jalan)

| Item | Status | Catatan |
|---|---|---|
| Audit 2026-09-29 + perbaikan [HIGH]/[MED] | di CI | lihat `docs/AUDIT-2026-09-29.md` |
| Tes di HP: APK dari CI + CLI di Termux | menunggu kall | baru tag `v1.7.0` setelah lolos |
| Deploy Worker lagu (burst + harian) | selesai 2026-09-29 | `scripts-dev/deploy_worker_lagu.py`; bukti: `scripts-dev/cek-batas-worker.sh` |

## Berikutnya (v1.7)

| Item | Effort | Kenapa |
|---|---|---|
| Pecah `bot.mjs` (~1100 baris) jadi modul per fitur | selesai 2026-09-29 (`bot-js/src/mesin/*`, uji `test/engine.test.mjs`) | file > 250 baris susah di-review; test per modul jadi mungkin |
| Pecah `MainActivity.kt` (1285 baris) per tanggung jawab | selesai 2026-09-29 (`FormPengaturan`, `PanelStatus`, `DialogTautan`, `LembarHitam`, `AksiSistem`, `SplashUtama`, `Lembar`) | alasan sama; sekarang satu file pegang UI, service, dan bridge |
| i18n Android tahap 1: layar utama (layout + Kotlin) ke `strings.xml` + `values-en` | selesai 2026-09-29 (`u_*` 75 dari layout, `k_*` 126 dari Kotlin; alat `scripts-dev/i18n_layout.py`, `i18n_kotlin.py`) | app cuma bisa Bahasa Indonesia; brand sudah dipisah ke `brand.xml` |
| i18n Android tahap 2: Onboarding, Repo, Hosting, notifikasi `BotService` | selesai 2026-09-29 (84 entri `k_*` tambahan, total 274) | seluruh UI app dua bahasa; pesan bot di WA tetap Indonesia |
| CLI: `--json` untuk `--dry-run` | S | gampang dipakai skrip / cron alert |
| Test integrasi CLI di CI (`--version`, `--dry-run` dengan `fetch` palsu) | S | sekarang CLI cuma `node --check` |

## Nanti (v2, butuh keputusan produk)

| Item | Effort | Kenapa / syarat |
|---|---|---|
| Play Store / 16 KB page size | L | butuh libnode.so build ulang dengan alignment 16 KB (upstream nodejs-mobile) |
| Multi-repo per channel | M | permintaan wajar kalau ada pengguna; sekarang 1 repo per instalasi |
| Sumber selain GitHub Releases (GitLab, tag saja, RSS) | M | abstraksi `sumber/*.mjs` di atas `rilis.mjs` |
| Counter Worker pakai Durable Object (SQLite, free plan) | M | hanya kalau butuh angka tepat: Rate Limiting binding permisif dan KV eventually consistent, keduanya bisa bocor 2-3x saat burst |

## Tidak akan dikerjakan

- Bot "online 24 jam" atau auto-reply chat umum: bertentangan dengan ide dasar (bot tidur).
- Fitur yang butuh server berbayar di sisi proyek. Satu-satunya komponen cloud adalah
  Worker lagu di free tier, dan itu opsional.
- Konten promosi (video TikTok) di repo produk: dipindah keluar, lihat `docs/KONTEN-TIKTOK.md`.
  Setelah launching: bikin ulang Eps 2 versi lengkap (TikTok kini mengizinkan sampai 10 menit) di repo
  konten, bukan di sini.

## Arah produk

Dipakai sementara (kall menjawab "gas aja" 2026-09-29 tanpa memilih; bisa diubah kapan saja):
**portofolio + donasi** — repo tetap seperti sekarang, `FUNDING.yml` aktif, tidak ada fitur
berbayar, tidak ada pengumpulan data pengguna. Alternatif yang tidak dipilih: open-core
(engine source-available, "hosting bot sendiri" + dukungan berbayar; butuh pemisahan modul
hosting, lisensi ganda, halaman produk).

Built by xykal — XyVerse Technology Global
