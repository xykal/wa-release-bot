# IDEAS — backlog

Format: apa — kenapa penting buat pengguna nyata — dampak/usaha (S/M/L). Dipangkas berkala.

## Inti produk (rilis -> channel)
- Conditional request ETag ke GitHub — cek jadi 0 byte dan tidak makan kuota rate limit; menepati
  janji "0% data" secara harfiah — dampak tinggi / S.
- Konversi markdown GitHub -> format WA (`##` jadi *bold*, `[teks](url)` jadi `teks: url`, blok kode
  jadi ```) — release notes tampil rapi di channel, bukan markdown mentah — tinggi / S.
- Semver guard: release dihapus/rollback tidak diumumkan sebagai "baru" — sedang / S.
- Multi-repo dalam satu bot (daftar repo, satu channel atau per repo) — pengguna yang punya lebih
  dari satu proyek tidak perlu dua HP — tinggi / M.
- Template pesan bisa diedit dari app (placeholder `{tag}`, `{repo}`, `{notes}`) — tiap proyek
  punya gaya sendiri — sedang / M.
- Filter tag (regex, mis. hanya `v*` atau abaikan `nightly-*`) — sedang / S.
- Lampirkan aset rilis (APK) langsung ke channel kalau ukurannya di bawah batas WA — pengguna tidak
  perlu buka GitHub — tinggi / M (batas ukuran WA dan hemat data harus dipikirkan).

## Keandalan
- Write-ahead `state.pending` sebelum kirim + tombol "kirim ulang" — hilangkan posting dobel — S.
- Selftest di HP yang melaporkan `process.versions.icu` dan hasil `toLocaleString('id-ID')` — S.
- Health ping opsional (healthchecks.io) tiap siklus — pengguna tahu botnya mati tanpa buka app — S.

## Keamanan dan platform
- `network_security_config` cleartext hanya 127.0.0.1 — S.
- Rate limit per IP + kuota per install di Worker lagu, proving test k6 di CI — M.
- Pin semua action ke SHA penuh, satu PR — S.
- Pantau nodejs-mobile untuk build 16 KB; kalau ada, jalur Play Store terbuka — L (upstream).

## Pertumbuhan
- README bagian English 20 baris di atas + GIF demo asli dari app — S.
- Pisahkan konten pemasaran ke repo sendiri; repo produk bersih sebelum trafik TikTok datang — S.
- `FUNDING.yml` + halaman "Sponsor" kalau jalur (a) portofolio dipilih — S.
