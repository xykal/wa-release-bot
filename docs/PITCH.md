# Pitch — WA Release Bot

Satu halaman untuk menjelaskan produk ini ke orang yang belum pernah dengar.
Klaim di sini harus tetap benar; kalau fitur berubah, ubah halaman ini juga.

## Satu kalimat

Bot pribadi yang jalan di HP Android kamu sendiri: tiap ada release baru di GitHub,
dia posting ke channel atau grup WhatsApp — tanpa server, tanpa langganan.

## Masalah

- Pengguna aplikasi kecil dan komunitas Indonesia hidup di WhatsApp, bukan di GitHub.
  Release yang tidak diumumkan sama saja tidak ada.
- Bot WhatsApp biasanya butuh VPS yang harus dibayar dan dirawat, atau layanan pihak
  ketiga yang minta akses ke akun.
- Grup komunitas kemasukan akun spam dan orang yang sudah dikeluarkan masuk lagi lewat
  link undangan.

## Solusi

- **Engine Node.js 18 asli di dalam APK** (nodejs-mobile) menjalankan Baileys. HP yang
  sudah ada jadi "server"-nya; data sesi tidak pernah keluar dari HP.
- **Tidur di antara pengecekan**: cek release tiap N menit dengan ETag (repo tidak
  berubah = 0 byte, tidak makan kuota API), tersambung ke WhatsApp hanya beberapa detik
  saat perlu posting.
- **Banyak repo, satu app**: tiap repo boleh punya channel tujuan sendiri.
- **Penjaga grup opt-in**: permintaan join di-approve otomatis, yang pernah keluar
  atau dikeluarkan ditolak, ada daftar hitam manual.
- **Bawaan hemat**: seluruh fitur tambahan yang membuka socket atau mengirim konten
  lain mati pada instalasi baru.
- CLI Termux/PC memakai engine release yang sama. Lagu mood, moderasi/perintah
  persisten, dan hosting project custom tetap tersedia sebagai eksperimen opt-in,
  bukan bagian dari janji stabil produk.

## Untuk siapa

Developer indie dan pengelola komunitas yang merilis lewat GitHub dan punya audiens di
WhatsApp: pembuat mod/app Android, tool Termux, bot, script. Bukan untuk perusahaan
yang butuh SLA — ini bot pribadi di HP.

## Kenapa sekarang

Pairing code WhatsApp (tanpa HP kedua) dan channel WhatsApp membuat setup sekali jalan
cukup dari satu HP. Baileys 6.7.x stabil untuk newsletter (channel) dan grup.

## Bukti bisa dipakai

- APK dibangun di GitHub Actions, di-sign dengan keystore release dari GitHub Secrets,
  disertai `.sha256`; action dipin SHA, CodeQL, gitleaks, Scorecard.
- Uji ujung-ke-ujung engine dengan GitHub palsu di Node 18/20/22; tangkapan layar UI
  otomatis dari emulator di CI (Indonesia dan Inggris).
- Situs dan halaman unduh: <https://wabot.projectkal.my.id>.

## Batasan yang jujur

- Bergantung pada Baileys (protokol tidak resmi). Perubahan di sisi WhatsApp bisa
  mematikan fitur sampai library diperbarui.
- Node 18.20.4 di dalam APK sudah EOL; migrasinya membutuhkan port native
  nodejs-mobile dan validasi ABI, bukan sekadar menaikkan package npm.
- `libnode.so` belum mendukung page size 16 KB, jadi Play Store belum menjadi target.
- Hosting custom berbagi sandbox filesystem dengan app; hanya untuk kode tepercaya.
- Vendor Android agresif (Xiaomi, Vivo, Oppo) butuh izin batre dan Autostart manual.
- Lisensi pemakaian pribadi (source-available), bukan open source bebas.

## Model

Gratis untuk pemakaian pribadi. Tidak ada telemetri, tidak ada akun, tidak ada server
XyVerse yang menyimpan data pengguna; satu-satunya layanan sisi kami adalah Worker
lagu mood (opsional) dan situs unduh.

Built by xykal — XyVerse Technology Global.
