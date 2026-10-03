# PRD — WA Release Bot

Diperbarui 2026-10-03 untuk calon rilis publik 1.0.0. Versi 1.8.0 adalah build
internal dan bukan nomor rilis publik.

## 1. Masalah

Pemilik channel atau grup WhatsApp yang mengikuti proyek GitHub harus membuka
halaman Releases, menyalin catatan rilis, lalu mengirimkannya sendiri. Bot yang
ada biasanya membutuhkan VPS yang hidup 24 jam, padahal tugas ini hanya perlu
beberapa detik setiap ada rilis.

## 2. Pengguna

- **Utama:** developer indie atau admin komunitas yang mengumumkan rilis
  proyeknya sendiri, memiliki HP Android, dan tidak ingin mengelola VPS.
- **Sekunder:** pengguna Termux/PC yang lebih nyaman dengan cron.
- **Bukan target:** tim yang membutuhkan SLA, banyak operator, audit enterprise,
  atau dukungan resmi WhatsApp/Meta.

## 3. Janji inti produk

Satu kalimat produk:

> Rilis GitHub ke WhatsApp langsung dari HP Android, tanpa VPS.

Janji rilis publik:

1. Satu atau beberapa repo GitHub dapat dipantau; setiap repo boleh memakai
   channel tujuan sendiri.
2. Release baru yang bukan draft diumumkan paling lambat satu interval cek
   setelah dipublikasikan; prerelease bersifat opt-in.
3. Release tidak diumumkan dua kali dan rollback tag tidak diumumkan ulang.
4. Di antara pengecekan, jalur inti tidak mempertahankan koneksi WhatsApp.
   Pengecekan repo yang tidak berubah memakai ETag/304 tanpa body.
5. Session WhatsApp dan token GitHub hanya disimpan di perangkat pengguna.
6. APK dan CLI memakai engine yang sama dari `bot-js/src`.

Klaim "bot tidur" hanya berlaku saat fitur yang mempertahankan socket
(**Perintah pribadi** atau **Moderasi grup**) dimatikan. Keduanya mati pada
instalasi baru.

## 4. Tingkat kematangan fitur

### Inti rilis publik

| Fitur | Status | Gerbang rilis |
|---|---|---|
| Pantau GitHub Releases dan kirim ke channel/grup | stabil | uji multi-repo, ETag, retry, dan perangkat nyata |
| Multi-repo dan channel per repo | stabil | migrasi state + rollback/anti-duplikat lulus |
| Pairing code/QR dan penyimpanan sesi lokal | stabil | pairing ulang di HP nyata |
| Retry maksimum tiga kali + notifikasi kegagalan | stabil | skenario jaringan putus |
| CLI `--once` untuk cron | stabil | integrasi GitHub palsu di CI |
| Log dan ekspor diagnostik | stabil | ZIP dapat dibuka dan ditinjau |

### Tambahan opt-in

| Fitur | Status | Catatan |
|---|---|---|
| Penjaga grup dan pesan berkala | tambahan | mati secara bawaan; perlu akun admin grup |
| Moderasi dan perintah pribadi | eksperimental | mati secara bawaan; menjaga socket WA tetap hidup |
| Stiker, Brat, welcome, rekam channel, `.story` | eksperimental | tidak menjadi janji stabil 1.0.0 |
| `.storygrup` | diblokir | fail-closed sampai native group mention didukung dan diuji |
| Format channel "Pertanyaan" | eksperimental | default teks; protokol belum terverifikasi |
| Lagu mood | eksperimental | default mati; hanya untuk audio yang hak penggunaannya dimiliki pengguna |
| Hosting project Node.js | eksperimental | kode custom berbagi sandbox app; hanya project tepercaya |

Fitur eksperimental tidak dihapus, tetapi tidak dipasarkan sebagai alur utama,
selalu opt-in, dan harus menjelaskan risikonya sebelum dipakai.

## 5. Batasan yang disengaja

- Tidak ada relay server untuk jalur inti. Kalau HP mati, bot ikut mati.
- WhatsApp diakses lewat Baileys, bukan API resmi Meta. Risiko akun dibatasi dan
  perubahan protokol adalah risiko nyata.
- APK memakai nodejs-mobile Node 18.20.4 yang sudah EOL. Migrasi runtime harus
  menjadi proyek native Android terpisah, bukan perubahan dependency biasa.
- `libnode.so` belum siap page size 16 KB, sehingga distribusi Play Store belum
  menjadi target.
- Aplikasi bersifat personal-use/source-available, bukan layanan komersial.

## 6. Kualitas dan keamanan

- Pull request wajib melewati lint/test Node 18/20/22, build APK, unit test
  Kotlin, CodeQL, dependency review, gitleaks, dan audit dependency.
- Cleartext Android hanya diizinkan ke loopback; WebSocket loopback memakai
  token acak per proses dan menolak Origin browser.
- Project hosting tidak mewarisi seluruh environment engine. Hanya environment
  runtime yang diizinkan dan `.env` project sendiri yang diberikan ke worker.
- Setiap ZIP hosting menampilkan SHA-256 dan membutuhkan persetujuan eksplisit.
  Ini bukan sandbox filesystem: kode project tetap dapat membaca file privat app.
- Fitur tambahan yang membuka socket atau mengirim konten mati pada instalasi baru.

## 7. Gerbang rilis publik 1.0.0

Rilis hanya dilanjutkan jika:

1. Seluruh CI pada commit kandidat hijau.
2. Checklist `docs/CHECKLIST-PRELAUNCH.md` lulus pada HP arm64 dan HP uji
   armeabi-v7a selama sekurangnya 24 jam; target ideal 48 jam.
3. Pairing, reboot, layar mati, jaringan putus, release baru, retry, dan ekspor
   log telah diuji.
4. Tidak ada klaim bahwa self-chat "Waiting for this message", Status HD,
   Pertanyaan channel, atau native group mention sudah selesai tanpa bukti HP.
5. Dokumentasi, situs, versi, checksum APK, dan `releases/latest` cocok.

## 8. Metrik keberhasilan

- Tidak ada release terlewat atau terkirim dua kali selama satu bulan pemakaian.
- Setup dari APK sampai pesan tes berhasil dalam kurang dari 10 menit mengikuti
  README.
- Jalur inti dapat berjalan 24–48 jam dengan layar mati tanpa socket WA persisten.
- Tidak ada crash baru, kebocoran secret, atau temuan high/critical yang terbuka
  pada commit rilis.

Built by xykal — XyVerse Technology Global
