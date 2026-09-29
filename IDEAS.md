# IDEAS — backlog

Dipangkas 2026-09-29: yang sudah dikerjakan dihapus (ETag, markdown->WA, semver, pending,
cleartext, pin SHA); lihat CHANGELOG `[Unreleased]`.

Format: apa — kenapa penting buat pengguna nyata — dampak/usaha (S/M/L). Dipangkas berkala.

## Inti produk (rilis -> channel)
- Multi-repo dalam satu bot (daftar repo, satu channel atau per repo) — pengguna yang punya lebih
  dari satu proyek tidak perlu dua HP — tinggi / M.
- Template pesan bisa diedit dari app (placeholder `{tag}`, `{repo}`, `{notes}`) — tiap proyek
  punya gaya sendiri — sedang / M.
- Filter tag (regex, mis. hanya `v*` atau abaikan `nightly-*`) — sedang / S.
- Lampirkan aset rilis (APK) langsung ke channel kalau ukurannya di bawah batas WA — pengguna tidak
  perlu buka GitHub — tinggi / M (batas ukuran WA dan hemat data harus dipikirkan).

## Keandalan
- Health ping opsional (healthchecks.io) tiap siklus — pengguna tahu botnya mati tanpa buka app — S.

## Keamanan dan platform
- Counter Worker lagu yang tepat (Durable Object SQLite) kalau suatu saat kuota AI beneran jadi
  masalah; sekarang burst limiter + KV cukup buat penyalahgunaan kasual — M.
- Pantau nodejs-mobile untuk build 16 KB; kalau ada, jalur Play Store terbuka — L (upstream).

## Pertumbuhan
- README bagian English 20 baris di atas + GIF demo asli dari app — S.
- Pisahkan konten pemasaran ke repo sendiri; repo produk bersih sebelum trafik TikTok datang — S.
- `FUNDING.yml` + halaman "Sponsor" kalau jalur (a) portofolio dipilih — S.
