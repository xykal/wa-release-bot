## 2026-10-06 — lanjutan pasca-rilis (sesi agent)

- PR #62 (perpisahan respons instan + cek susulan reconnect + interval 1 menit) di-merge.
- PR #60 di-merge (globals 17.13.0); PR #61 ditutup tanpa merge: core-ktx 1.19.1
  menuntut compileSdk 37 + AGP 9.1 (proyek: 35 + 8.13.2) - tunggu migrasi atau pin core.
- PR #58 di-rebase ke main: bagian yang sudah digantikan hardening (SidikZip, dialog) dibuang;
  lapisan uniknya dipertahankan - MESIN menolak jalan (termasuk autostart) tanpa persetujuan
  per sidik ZIP (hosting-setuju.mjs + perintah hosting-setuju + sumber.json atomik dari app).
- PR #18 (chore/rilis-1.0.0) ditutup, branch dihapus (basi; v1.0.0 sudah rilis).
- Worker lagu di-deploy ulang (148 lagu, benih TikTok + bobot baru); burst limiter terbukti
  (kena di request ke-19 pada cek-batas-worker.sh MAKS=40; 10 sampel kurang buat counter CF).
- Insiden: full-wipe bersihkan.yml menghapus engine-bundle build PR yang masih jalan
  (job APK gagal "Artifact not found"). Fix: bersihkan_artifact melindungi semua artifact
  milik run berstatus != completed (bersihkan_actions.py), pola insiden 2026-10-01.

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
- Hosting tidak dapat menjadi sandbox filesystem di Node 18; mitigasi hanya env allowlist,
  hash/persetujuan, dan peringatan. Fitur lagu mood tetap punya risiko hak cipta / ToS.

Next:
- Verifikasi Actions PR; uji perangkat nyata (perintah via WS, fallback file bridge, dialog
  persetujuan hosting muncul sekali per ZIP, mesin menolak project yang belum disetujui).

## 2026-10-03 — hardening pre-launch

- Fokus produk dikembalikan ke GitHub Release → WhatsApp. Onboarding hanya
  mempromosikan release dan penjaga grup; fitur tambahan tetap ada tetapi opt-in.
- Perintah pribadi dan logcat detail di app berubah dari default nyala menjadi default
  mati. Migrasi satu kali mematikan nilai default lama dari build internal; pilihan user
  setelah migrasi tetap dihormati. Semua fitur tambahan dijaga unit/static test.
- Hosting custom: worker memakai environment allowlist, `WR_*` internal tidak diwariskan,
  setiap ZIP dihitung SHA-256 dan membutuhkan persetujuan eksplisit. Batas filesystem
  tetap dijelaskan sebagai risiko; worker thread bukan sandbox keamanan.
- BootReceiver dibuat privat (`exported=false`) dan QUICKBOOT nonstandar dihapus.
- PRD/roadmap/README/panduan/security/architecture disinkronkan; checklist soak test
  arm64 + v7a 24–48 jam ditambahkan sebagai gerbang manual rilis.
