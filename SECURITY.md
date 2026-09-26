# Keamanan

## Melaporkan kerentanan

Jangan buka issue publik. Pakai
[**Security → Report a vulnerability**](../../security/advisories/new) di tab
Security repo ini (GitHub Private Vulnerability Reporting).

Sertakan: versi (APK/CLI), langkah reproduksi, dan dampaknya. Akan dibalas
dalam 7 hari. Kalau nggak ada respons setelah 14 hari, silakan eskalasi
dengan issue publik **tanpa** detail teknis.

## Versi yang didukung

Cuma rilis terbaru yang dapat perbaikan. Karena ini proyek personal, nggak ada
backport ke versi lama.

## Kalau token kamu pernah bocor

Repo ini sengaja **nggak pernah** menyimpan token apa pun. Tapi kalau kamu
pernah menaruh token di file yang ikut ter-commit, di chat, atau di tempat
publik — token itu **harus dianggap sudah bocor**. Melihat saja sudah cukup.

Urutan yang benar:

1. **Rotate/revoke** token-nya dulu di dashboard penyedianya. Jangan tunggu
   sampai ngapus dari git.
2. Baru bersihkan sejarahnya (kalau repo publik):

   ```bash
   # pakai git-filter-repo, JANGAN filter-branch (rawan salah)
   pip install git-filter-repo
   git filter-repo --invert-paths --path ini-buat-kerja.json
   git push --force --all
   ```

3. Aktifkan **Secret scanning** + **Push protection** di
   *Settings → Code security*.

> Menghapus dari commit terakhir **nggak cukup** — nilai itu masih ada di
> riwayat. Selalu rotate dulu.

## Model ancaman proyek ini

Yang **dilindungi**:

| Aset | Perlindungan |
|---|---|
| Session WhatsApp (linked device) | storage privat app, `allowBackup=false`, nggak pernah keluar dari HP |
| Token GitHub (buat naikin rate limit) | SharedPreferences privat; kalau pakai CLI, di `config.json` yang di-gitignore |
| Keystore signing | cuma di GitHub Secrets + runner sementara, nggak pernah ke repo |

Yang **bukan** tanggung jawab proyek ini:

- **Risiko akun WhatsApp dibatasi/diblokir Meta.** Ini automasi pihak ketiga
  lewat protokol nggak resmi (Baileys). Risikonya nyata dan sepenuhnya
  tanggung jawab pemakai. Jangan pakai buat spam.
- **HP yang di-root.** Kalau HP di-root, storage privat app bisa dibaca. Itu
  di luar kendali aplikasi.
- **Token GitHub dengan scope berlebih.** Buat repo publik, `public_repo` udah
  cukup. Jangan pakai classic token dengan `repo` + `admin:*` kalau nggak perlu.

## Praktik yang dipakai repo ini

- Semua token di CI dibaca dari **GitHub Secrets**, ditulis ke `$RUNNER_TEMP`
  (bukan working dir), dan nggak pernah di-`echo`.
- **gitleaks** jalan di tiap push/PR, dengan aturan khusus untuk pola token
  ekosistem proyek ini.
- Job `audit` di CI grep pola token umum di seluruh isi repo.
- **CodeQL** (`security-and-quality`) + **OpenSSF Scorecard** + **dependency-review**
  (blokir dependency high/critical dan lisensi copyleft kuat).
- Dependabot mingguan untuk npm, Gradle, dan GitHub Actions.
- Engine diuji di **Node 18.20.4** — versi asli di dalam APK — bukan cuma di
  Node terbaru.

## Batasan yang diketahui

- `libnode.so` dari nodejs-mobile masih align 4 KB, belum 16 KB (syarat
  Android 15+ / Play Store). Batasan upstream, nggak bisa diperbaiki dari sini.
- `usesCleartextTraffic="true"` masih aktif (dipakai WebSocket `127.0.0.1`).
  Rencananya diganti `network_security_config` yang cuma mengizinkan loopback.

Detail lengkap + status tiap temuan: [docs/SECURITY-AUDIT.md](docs/SECURITY-AUDIT.md).
