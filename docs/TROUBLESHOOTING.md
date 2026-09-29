# Debugging dan troubleshooting

Pelengkap [README](../README.md#debugging-dan-troubleshooting).

## Debugging — log ada di mana

App-nya nulis semua yang terjadi ke:

```
Android/media/com.xykals.warelease/log/
```

Alasan folder itu yang dipakai: **bisa dibuka tanpa root dan tanpa izin
penyimpanan apa pun** (file manager, atau HP disambung ke komputer), sedangkan
folder app yang lama (`/data/data/...`) nggak bisa dibuka siapa-siapa kecuali
app-nya sendiri — jadi percuma buat nyari masalah.

| File | Isinya |
|---|---|
| `app.log` | Aktivitas app: tombol apa yang ditekan, service nyala/mati, error |
| `mesin.log` | Log engine bot (Node.js): cek release, posting, QR, error |
| `logcat.log` | Log mentah Android — termasuk output mentah Node & stack trace |
| `crash.log` | **Ada isinya = app pernah mati sendiri.** Bagian atasnya nulis versi app, HP apa, dan penyebabnya |

Cara paling gampang: **Kirim Log** di app → pilih WhatsApp/email → kirim ke
tujuan. Kalau mau lihat sendiri: **Buka Folder Log**.

Tiap file maksimal 2 MB lalu di-rotate (yang lama jadi `.1`). Folder ini boleh
dihapus kapan aja — bakal dibikin ulang.

**Kalau app-nya mati sendiri ("aplikasi terhenti"):** buka `crash.log` — di
situ ada stack trace-nya. Kalau `crash.log` kosong padahal app-nya jelas-jelas
nutup, berarti yang mati bukan app-nya (mis. service-nya dibunuh Android karena
HP-nya kehabisan RAM) — cek `app.log` baris `onTaskRemoved` / `onDestroy`.

Masih perlu log mentah? `adb logcat -s WRBot` (output engine Node).

---

## Troubleshooting

| Gejala | Solusi |
|---|---|
| `bundle.cjs tidak ditemukan` | APK di-build tanpa langkah bundling — build ulang via Actions / `scripts/build-local.sh` |
| `libnode.so tidak ditemukan` | Jalankan `bash scripts/fetch-nodejs-mobile.sh` |
| App **terhenti** pas ditekan (dulu sering kena di tombol Setup) | Fixed di **v1.1.3** — `BotService` baca SharedPreferences di constructor, padahal Context-nya belum dipasang Android → NullPointerException. Update ke v1.1.3+ |
| **QR tidak muncul sama sekali** | Buka `app.log`, cari `NodeBridge`. Kalau ada `UnsatisfiedLinkError`, mesin Node nggak bisa dimuat → pasang APK yang **cocok sama ABI HP**. Fixed total di **v1.1.4** (dulu `loadLibrary` nggak pernah dipanggil) |
| `UnsatisfiedLinkError: No implementation found for ... startNode` | v1.1.3 ke bawah: `System.loadLibrary()` nggak pernah dipanggil, jadi mesin Node nggak akan pernah jalan. **Update ke v1.1.4** |
| QR tidak muncul, mesin Node jalan | Tunggu ±4 detik (service baru dinyalakan). Kalau >10 detik, app bilang sendiri di Log. Cek `mesin.log` |
| Layar sempat beku pas QR muncul | Fixed di **v1.1.3** — gambar QR 640×640 dulu digambar di thread utama (400 ribu panggilan `setPixel`). Sekarang di thread belakang |
| QR tidak muncul di CLI | Pastikan pakai Baileys 6.7.24 + `qrcode-terminal` (sudah otomatis sejak v1.1.0) |
| `Cannot destructure property 'subtle' of globalThis.crypto` | Runtime Node 18 tanpa polyfill. Sudah diperbaiki di v1.1.0 — update dulu |
| `Setup gagal: Koneksi WA tutup (code 515)` | Bug v1.1.4 ke bawah: 515 itu **normal** habis QR discan (WA nyuruh nyambung ulang). Update ke **v1.2.0** |
| Pairing code nggak diterima WA | Pastikan nomornya nomor WA yang sama dengan HP tempat ngetik kode, pakai kode negara (`62…` / `08…` otomatis diubah). Kode cuma berlaku ±1 menit — minta lagi kalau lewat |
| Penjaga grup bilang "bukan admin" | Jadiin akun WA yang ditautkan admin di grup itu |
| Bot mati sendiri pas layar mati (Xiaomi) | Kartu **Batre**: tekan **Izinkan jalan di latar** + **Buka izin Autostart**, nyalain dua-duanya |
| Habis update, fitur baru nggak jalan | Fixed di v1.2.0 — dulu engine lama nggak ditimpa waktu update |
| `Sesi WA ke-logout` | Session terbuang — tautkan lagi (kode / QR) |
| `Username channel (...) nggak bisa dipakai` | Memang nggak didukung. Pakai **link** channel, atau tekan **Bikin Channel**. Lihat [Channel WA: dapetnya dari mana?](PANDUAN-APP.md#channel-wa-dapetnya-dari-mana) |
| `Link channel-nya nggak kebaca` | Link-nya kadaluarsa / salah. Buka channel → ⋯ → Bagikan → salin ulang |
| Pesan nggak terkirim ke channel | Pastikan lo **pemilik/admin** channel-nya. Cek `mesin.log` |
| Mau lapor bug tapi nggak tau kenapa | Tekan **Kirim Log** → kirim hasilnya. Yang paling penting `crash.log` |
| GitHub 403/429 (rate limit) | Isi **Token GitHub** di setting (classic token, scope `public_repo` cukup) |
| Bot tidur terus padahal ada release | Cek **Log** di app + tab **Terakhir**. Pakai **Cek Sekarang** buat paksa |
| Log mentah (debug) | `adb logcat -s WRBot` — semua `console.log` engine Node ke sana. Atau `logcat.log` di folder log app |

Masih mentok? Buka [Issue](../../../issues/new/choose) — sertakan output Log dari app.

> Log bilang `code 515` terus "Setup gagal"? Itu bug v1.1.4 ke bawah — 515
> artinya QR-nya **udah** kescan dan WA nyuruh nyambung ulang. Fixed di v1.2.0.
