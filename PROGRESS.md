# PROGRESS

Start: 2026-09-26 (commit pertama repo)

Catatan: 2026-09-26 sampai 2026-09-28 — tidak ada log di file ini (PROGRESS.md baru dibuat
2026-09-29). Aktivitas hari-hari itu hanya terlihat dari `git log`, tidak direkonstruksi di sini.

## 2026-09-29 — hari kerja ke-1

Done:
- Audit penuh repo: `docs/AUDIT-2026-09-29.md` (0 CRIT, 3 HIGH, 10 MED, 6 LOW).
- Root cause CI `Code quality` merah: SC2086 di step "Ringkasan" `render-v4/v5/v6.yml`. Fix dikutip.
- `PROGRESS.md` dan `IDEAS.md` dibuat.

- kall: "gas semua". Dikerjakan hari yang sama, satu commit besar (lihat CHANGELOG `[Unreleased]`):
  H2 npm workspaces + CLI port; H3 hapus `konten-tiktok/` dan 3 workflow render;
  M1-M2 pin SHA + checksum actionlint; M3 ETag/timeout; M4-M5 `rilis.mjs` + pending anti dobel;
  M6 Worker batas per perangkat/IP (kode saja); M7 network_security_config; M8 brand tunggal;
  L1/L2/L4 dokumen, `formatTanggal` tanpa ICU, file standar (PRD, ROADMAP, CoC, CODEOWNERS, FUNDING).
- Unit test bertambah ~21 (github mock fetch, rilis, kirimKeChannel, mdKeWa, potongAman, brand, tanggal).
- kall: "gas aja" (ronde 2). Deploy Worker lagu pakai token Cloudflare kall: ketemu URL default
  salah subdomain (NXDOMAIN) -> fitur lagu mati sejak v1.6.0, diperbaiki + cek DNS di CI. Batas
  harian KV terbukti bocor saat burst (13 request, counter cuma 7) -> tambah lapis Rate Limiting
  binding; proving test `scripts-dev/cek-batas-worker.sh` lolos. Tes integrasi CLI (5 skenario).
  History `konten-tiktok` dihapus (filter-branch, force-push; tag v1.6.7 ke bawah tidak berubah).

- kall: "boleh juga" + minta semua update lewat PR dulu. Branch `feat/lapor-gagal-jatah-lagu`:
  lapor ke chat diri sendiri saat percobaan ke-3 gagal (app + CLI), jatah lagu harian tampil di
  app, `/lagu/batas` tanpa token burst kecuali `?uji=1` (Worker di-deploy ulang, proving test lolos).
- kall: "boleh semua" (notifikasi Android 3x gagal, M10 pecah modul, M9 i18n disetujui) + minta
  kata-kata channel lebih bagus, fix post "Pertanyaan", caption lagu lebih gacor, lagu lebih banyak.
  Dikerjakan di PR #10 (commit lanjutan): post rilis ditulis ulang + lampiran file, caption lagu,
  5 gaya caption baru, ayat 20 → 42 (equran.id), lagu 48 → 148, perekam channel `npm run rekam`.
  "Pertanyaan": format aslinya tidak diketahui (bukan bug kode yang bisa dibuktikan dari sini) →
  default dibalik ke teks, pertanyaan opt-in eksperimental, butuh rekaman dari HP kall.

Blocked:
- Tes di HP asli (APK v1.7.0) dan CLI di Termux: belum ada; kall memutuskan rilis dulu ("merge").
- Format "Pertanyaan": butuh `rekaman-channel.json` dari kall (post Pertanyaan manual di HP).

Next:
- Disetujui, belum dikerjakan: notifikasi Android saat 3x gagal (S), M10 pecah
  `bot.mjs`/`cli.mjs`/`MainActivity.kt` (M), M9 i18n `values-en` (M). PR terpisah setelah #10.
- kall: "merge". PR #10 di-merge ke main (`8ff5ba3`). Bump 1.6.7 → 1.7.0 (gradle versionCode 24,
  3 package.json + lockfile, CHANGELOG [1.7.0]) lewat PR `chore/rilis-1.7.0`, lalu tag `v1.7.0`
  → job `release` build-apk.yml bikin GitHub Release otomatis. Belum ada tes di HP asli.
- Konten: repo `wa-release-bot-konten` Eps 2 (render di Actions) v1 → v4: aset asli app, stiker +
  SFX meme (unduh saat render, sha256, tidak di-commit), hook spam jam 02.00 (judol disamarkan),
  2 scene teknis (stack + siklus 15 menit), subtitle gaya CapCut. Durasi 2:30, menunggu review kall.
- kall: "gas aja semua" + minta multi repo; tanya "Pertanyaan" sudah fix? (belum — masih butuh
  `rekaman-channel.json`). PR `feat/multi-repo`: `repo.mjs` (daftar repo + state per repo + migrasi),
  bot.mjs/cli.mjs cek semua repo berurutan, notifikasi Android 3x gagal (BotService), versionCode
  dari tag di CI, tes unit + integrasi CLI baru. Belum: M10 pecah modul, M9 i18n, Eps 2 versi pendek.
- kall: "merge final semua, rilis versi terbaru, hapus release lama sisakan terbaru + stable"
  (dipilih: stable = v1.7.0; release + tag lama dihapus). PR #12 di-merge, bump 1.8.0 (versionCode
  default 10800 ikut rumus CI), tag `v1.8.0` -> release otomatis. Eps 2 potongan pendek 1:13 jadi.
- kall: minta layar Repo sendiri di app (PR terpisah), landing page + halaman unduh dengan popup
  hitung mundur launching (Jumat 2026-10-09 19.00 WIB, versi publik 1.0.0), release jadi draft
  supaya tidak bisa diunduh publik, hosting Cloudflare. Dikerjakan: v1.7.0/v1.8.0 -> draft,
  73 artifact Actions dihapus, `web/` (statis, id/en, CSP ketat, font Archivo subset) tayang di
  Workers Static Assets lewat `scripts-dev/deploy_web.py`, workflow `deploy-web.yml`, rencana
  launching di ROADMAP. kall: logo web harus logo asli app (bulan sabit) -> diganti; domain
  `wabot.projectkal.my.id` dipasang (workers/domains). Belum: layar Repo, M10, M9, PR launching 1.0.0.
- kall: "gas kejar waktu", web wajib responsif semua layar, README bersih tanpa emoji, cek stars,
  screenshot app asli di web. Dikerjakan: QA Chromium 14 layar (bug: HP hero/cara keluar layar di
  HP kecil dan 1024 px, modal terpotong di landscape, nav 320 px) -> diperbaiki + job CI `tangkapan`;
  emoji dihapus dari 11 dokumen + cek CI; `bingkai_screenshot.py` siap terima screenshot asli.
  Stars: API GitHub bilang 0 stargazer di wa-release-bot (XyDownloader dan AppPerms masing-masing 1).
- kall: "selesaikan semua trus merge". PR #14 (web) di-merge. Dikerjakan hari yang sama: PR #16
  layar Repo + channel per repo (engine, CLI, app, tes) di-merge; PR #17 README 580 -> 271 baris
  (detail ke docs/PANDUAN-APP, BUILD, TROUBLESHOOTING) di-merge; PR #15 screenshot emulator di
  Actions (3 kali gagal: grep+pipefail, layar sambutan, run-as di build release -> adb root) lalu
  galeri situs memakai tangkapan asli. Belum: PR launching 1.0.0 (draft), M10, M9, Eps 2 logo.
- kall: "gas" rencana H-1; video Eps 2 versi lengkap (sampai 10 menit) ditunda setelah launching;
  tanya kenapa M10/M9 tidak sebelum launching -> jawab: bisa, penundaan cuma soal risiko. M10 bagian
  engine dikerjakan: `bot.mjs` -> `src/mesin/*` + uji ujung-ke-ujung engine (GitHub palsu).
  Belum: pecah `MainActivity.kt`, M9 i18n, PR launching (draft).
- kall: "gas aja". `MainActivity.kt` 1285 -> 507 baris + 7 file kecil (form, panel status, dialog
  tautan, lembar hitam, aksi sistem, splash, komponen lembar). Verifikasi: compile CI + workflow
  Screenshot app di branch sebagai smoke test UI. Belum: M9 i18n, PR launching (draft).
- M9 i18n tahap 1: layar utama app dua bahasa (75 literal layout + 126 literal Kotlin ke
  `strings.xml` + `values-en`), dipindah oleh `scripts-dev/i18n_layout.py` dan `i18n_kotlin.py`
  supaya layar lain bisa menyusul. Belum: Onboarding/Repo/Hosting, PR launching (draft).
