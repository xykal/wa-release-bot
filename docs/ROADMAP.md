# Roadmap

Status per 2026-09-29. Ukuran effort: S (< 1 hari kerja), M (1-3 hari), L (> 3 hari).
Semua item di sini menunggu "gas" dari kall kecuali ditandai *sedang jalan*.

## Sekarang (v1.6.x, sedang jalan)

| Item | Status | Catatan |
|---|---|---|
| Audit 2026-09-29 + perbaikan [HIGH]/[MED] | di CI | lihat `docs/AUDIT-2026-09-29.md` |
| Tes di HP: APK dari CI + CLI di Termux | menunggu kall | baru tag `v1.7.0` setelah lolos |
| Deploy Worker lagu (burst + harian) | selesai 2026-09-29 | `scripts-dev/deploy_worker_lagu.py`; bukti: `scripts-dev/cek-batas-worker.sh` |

## Berikutnya (v1.7)

| Item | Effort | Kenapa |
|---|---|---|
| Pecah `bot.mjs` (~1100 baris) jadi `perintah/*.mjs` per fitur + `state.mjs` | M | file > 250 baris susah di-review; test per modul jadi mungkin |
| Pecah `MainActivity.kt` (1263 baris): `TampilanStatus`, `FormKonfigurasi`, `JembatanEngine` | M | alasan sama; sekarang satu file pegang UI, service, dan bridge |
| i18n Android: pindahkan 77 literal `android:text` ke `strings.xml`, tambah `values-en` | M | app cuma bisa Bahasa Indonesia; brand sudah dipisah ke `brand.xml` |
| CLI: `--json` untuk `--dry-run` | S | gampang dipakai skrip / cron alert |
| Test integrasi CLI di CI (`--version`, `--dry-run` dengan `fetch` palsu) | S | sekarang CLI cuma `node --check` |

## Nanti (v2, butuh keputusan produk)

| Item | Effort | Kenapa / syarat |
|---|---|---|
| Play Store / 16 KB page size | L | butuh libnode.so build ulang dengan alignment 16 KB (upstream nodejs-mobile) |
| Multi-repo per channel | M | permintaan wajar kalau ada pengguna; sekarang 1 repo per instalasi |
| Sumber selain GitHub Releases (GitLab, tag saja, RSS) | M | abstraksi `sumber/*.mjs` di atas `rilis.mjs` |
| Notifikasi gagal ke nomor pribadi (bukan channel) | S | kalau 3x gagal kirim, sekarang cuma tercatat di status |
| Counter Worker pakai Durable Object (SQLite, free plan) | M | hanya kalau butuh angka tepat: Rate Limiting binding permisif dan KV eventually consistent, keduanya bisa bocor 2-3x saat burst |

## Tidak akan dikerjakan

- Bot "online 24 jam" atau auto-reply chat umum: bertentangan dengan ide dasar (bot tidur).
- Fitur yang butuh server berbayar di sisi proyek. Satu-satunya komponen cloud adalah
  Worker lagu di free tier, dan itu opsional.
- Konten promosi (video TikTok) di repo produk: dipindah keluar, lihat `docs/KONTEN-TIKTOK.md`.

## Arah produk

Dipakai sementara (kall menjawab "gas aja" 2026-09-29 tanpa memilih; bisa diubah kapan saja):
**portofolio + donasi** — repo tetap seperti sekarang, `FUNDING.yml` aktif, tidak ada fitur
berbayar, tidak ada pengumpulan data pengguna. Alternatif yang tidak dipilih: open-core
(engine source-available, "hosting bot sendiri" + dukungan berbayar; butuh pemisahan modul
hosting, lisensi ganda, halaman produk).

Built by xykal — XyVerse Technology Global
