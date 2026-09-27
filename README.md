<div align="center">

# 🦴 WA Release Bot

**Bot WhatsApp yang nggak nyala 24 jam. Dia tidur.**

Bangun tiap N menit → cek GitHub → ada release baru? posting ke channel WA → tidur lagi.
Nggak ada update? 0% CPU, 0% data.

[![Build APK](https://github.com/xykal/wa-release-bot/actions/workflows/build-apk.yml/badge.svg)](https://github.com/xykal/wa-release-bot/actions/workflows/build-apk.yml)
[![Code quality](https://github.com/xykal/wa-release-bot/actions/workflows/code-quality.yml/badge.svg)](https://github.com/xykal/wa-release-bot/actions/workflows/code-quality.yml)
[![CodeQL](https://github.com/xykal/wa-release-bot/actions/workflows/codeql.yml/badge.svg)](https://github.com/xykal/wa-release-bot/actions/workflows/codeql.yml)
[![Security](https://github.com/xykal/wa-release-bot/actions/workflows/security.yml/badge.svg)](https://github.com/xykal/wa-release-bot/actions/workflows/security.yml)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/xykal/wa-release-bot/badge)](https://securityscorecards.dev/viewer/?uri=github.com/xykal/wa-release-bot)

[![Lisensi: pemakaian pribadi](https://img.shields.io/badge/Lisensi-pemakaian%20pribadi-orange.svg)](LICENSE)
[![Android](https://img.shields.io/badge/Android-8.0%2B%20(arm64%20%7C%20v7a)-3DDC84?logo=android&logoColor=white)](#-pakai-setelah-install)
[![Node](https://img.shields.io/badge/Node.js-18.20.4-339933?logo=nodedotjs&logoColor=white)](docs/ARCHITECTURE.md)

</div>

---

Ada **dua cara** pakai bot ini:

| | [📱 Aplikasi Android](#-aplikasi-android--host-di-hp-sendiri) | [💻 CLI (Termux / PC)](#-cli--termux--pc) |
|---|---|---|
| Butuh Termux / PC | ❌ nggak | ✅ iya |
| Mulai otomatis setelah HP reboot | ✅ | ✅ (cron/termux-boot) |
| Cara instal | unduh APK dari [Releases](../../releases) | `git clone` + `npm install` |
| Paling cocok buat | HP nganggur yang bisa dicharge terus | yang udah nyaman di terminal |

Keduanya pakai **engine bot yang sama** (`bot-js/`), jadi perilakunya identik.

---

## 🔁 Flow

```
   Service nyala (foreground service / cron)
             │
             ▼
   Engine bangun tiap N menit (default 15)
             │
             ▼
   Cek GitHub  ──  1 request API, ±1 detik
             │
      ┌──────┴───────┐
      ▼              ▼
   NGGAK ADA       ADA!
      │              │
      ▼              ▼
   TIDUR 😴     WA nyambung 2–5 detik
   (0% CPU,     → posting ke channel
    0% data)    → WA dilepas → TIDUR lagi
```

> ⚠️ **HP harus tetap nyala.** HP yang di-*off* nggak bisa menjalankan aplikasi apa pun —
> itu batasan fisik, bukan batasan app ini. Charge terus, layar boleh mati.

---

## ✨ Fitur

- ✅ **Host di HP sendiri** — aplikasi Android native, tanpa Termux, tanpa VPS
- ✅ **Tidur-bangun beneran** — WhatsApp baru terhubung pas mau posting
- ✅ **Tautkan sekali seumur hidup** — pakai **pairing code** (8 huruf, tanpa HP kedua) atau QR
- ✅ **Penjaga grup** — auto-approve permintaan join, tolak yang dulu udah keluar/dikeluarin
- ✅ **Post ke channel WA** (tempel link channel-nya) — atau ke **grup WA** kalau lebih gampang
- ✅ **Bikin channel dari app** — belum punya channel? bot yang bikinin, sekali klik
- ✅ **Watchdog** — WorkManager + boot receiver: service ke-bunuh Android → nyala lagi
- ✅ **UI status real-time** — log, tag terakhir, hitungan mundur, dialog QR
- ✅ **Semua setting bisa diubah dari UI** — repo, interval, token, prerelease, dll.
- 🔒 **Zero secret di repo** — token cuma hidup di HP lo / GitHub Secrets

---

## 📱 Aplikasi Android — host di HP sendiri

### Instal

**Cara cepat** — unduh APK dari halaman [**Releases**](../../releases), pasang di HP
(aktifkan *Install unknown apps*), lanjut ke [Pakai Setelah Install](#-pakai-setelah-install).

**Build sendiri** — lihat [🏗️ Build](#%EF%B8%8F-build-dari-source).

### Cara kerja (singkat)

| Bagian | Teknologi |
|---|---|
| Shell app | Kotlin, UI custom (tanpa komponen Material), foreground service, WorkManager |
| "Otak" bot | **Node.js 18.20.4 sungguhan** di-embed via [nodejs-mobile](https://github.com/nodejs-mobile/nodejs-mobile) (`libnode.so` + jembatan JNI) |
| Klien WhatsApp | [Baileys 6.7.24](https://github.com/WhiskeySockets/Baileys) (linked device) |
| Bot ↔ App | File bridge (`events.jsonl` / `cmd.json`) + WebSocket `127.0.0.1` sebagai jalur cepat |
| Cek release | GitHub REST API `/releases/latest` |

Detail lengkap: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

### Pakai Setelah Install

1. Buka app → kartu **Tautkan WhatsApp** → isi **nomor WA** lo → **Tautkan pakai kode**
2. Muncul kode 8 huruf. Di WhatsApp: **⋮ → Perangkat tertaut → Tautkan perangkat →
   Tautkan dengan nomor telepon saja** → ketik kodenya. (Biasanya WA juga ngirim
   notifikasi "masukkan kode" — tinggal tap.)
   Punya HP kedua? Boleh juga pakai **Pakai QR**.
3. Kartu **Rilis GitHub → Channel**: isi repo (`owner/nama-repo`) + link channel
   (belum punya? tekan **Bikin channel**) → **Simpan setting**
4. Tekan **Mulai**
5. Kartu **Batre & nyala otomatis**: tekan dua tombolnya (izin batre + Autostart).
   Di Xiaomi ini **wajib**, kalau nggak bot dibunuh pas layar mati dan nggak
   nyala habis restart.

> Log bilang `code 515` terus "Setup gagal"? Itu bug v1.1.4 ke bawah — 515
> artinya QR-nya **udah** kescan dan WA nyuruh nyambung ulang. Fixed di v1.2.0.

### Penjaga grup (auto-approve)

Buat grup yang nyalain **Setujui anggota baru** (Info grup → Setelan grup):

- yang minta join → **di-approve otomatis**
- yang dulu **udah keluar / dikeluarin** lalu minta join lagi → **ditolak otomatis**

Syarat: akun WA yang ditautkan harus **admin** di grup itu. Isi **link undangan
grup** di kartu **Penjaga grup**, nyalain saklarnya, simpan.

Cara kerjanya berkala (default tiap 5 menit, bisa diubah): nyambung → cek
anggota + permintaan → approve/tolak → putus. Jadi approve-nya bisa telat
sampai 5 menit, tapi batre aman. "Siapa yang keluar" dihitung dari daftar
anggota yang berubah antar-cek, jadi:

- orang yang keluar **sebelum** fitur ini nyala nggak ketahuan → ketik nomornya
  di kolom **Selalu tolak nomor ini**
- orang yang dimasukin lagi manual sama admin otomatis dihapus dari daftar hitam
- **Daftar hitam** buka daftar orang yang diblokir; tiap orang ada tombol
  **Buka blokir** biar bisa join lagi. **Kosongin** buat reset semuanya
- **Tes kirim** (di kartu Penjaga grup) kirim pesan singkat ke grup buat ngecek

### Batre

Bot ini **tidur** hampir sepanjang waktu. Yang nyala terus cuma proses kecil +
notifikasi (itu syarat Android biar nggak dibunuh). Tiap jadwal: cek GitHub
(1 request) dan/atau nyambung WA beberapa detik, lalu tidur lagi. WA **nggak**
nyambung terus-terusan, dan riwayat chat nggak pernah ditarik.

Yang paling berpengaruh ke batre: interval. Cek rilis tiap 15 menit + grup tiap
5 menit itu ringan; interval 1–2 menit bakal kerasa.

### Channel WA: dapetnya dari mana?

**Channel** itu fitur WhatsApp yang isinya cuma siaran satu arah — cuma lo yang
 bisa nge-post, yang lain cuma bisa baca. Jadi cocok banget buat kabarin rilis.
 Ini **bukan** grup dan bukan status.

Ada tiga cara, dari yang paling gampang:

**1. Biarin bot yang bikin (paling gampang).**
Tekan **Bikin Channel** di app. Bot bikin channel baru di akun lo, nulis JID-nya
ke kolom setting, kirim test message, dan nampilin link channel-nya di Log.
Karena lo yang bikin, lo otomatis pemiliknya — jadi bot boleh nge-post ke situ.
Ini butuh WA-nya udah ditautkan dulu (langkah 3 di atas lewat **Setup**).

**2. Pake channel yang udah lo punya.**
Buka channel-nya di WA → tap nama channel → **⋯** → **Bagikan** → salin link-nya.
Bentuknya `https://whatsapp.com/channel/0029...` — tempel apa adanya di kolom
**Channel WA**. Bot yang ngurusin sisanya.

**3. Pake grup WA.**
Kalau males bikin channel: bikin grup (boleh grup isi lo sendiri), lalu tempel
JID grup (`120363...@g.us`) atau link undangan grup-nya
(`https://chat.whatsapp.com/...`). Bot nge-post ke grup itu.

> **Yang NGGAK bisa: username channel (`@nama_channel`).**
> Dulu kolom ini nerima username, dan itu selalu gagal — kodenya nyari pakai
> `onWhatsApp()`, padahal fungsi itu buat nyari **nomor HP**, bukan channel.
> API WhatsApp yang dipakai engine ini juga nggak nyediain pencarian channel
> lewat username. Sekarang username ditolak dengan pesan yang nyaranin pakai
> link. Ini bukan salah lo kalau bingung — pesan errornya yang dulu menyesatkan.

> **Syarat:** lo harus **pemilik/admin** channel-nya, karena bot nge-post pakai
> nomor WA lo sendiri (sebagai perangkat tertaut). Channel orang lain → pesannya
> nggak akan terkirim.

| Tombol | Fungsi |
|---|---|
| **Simpan setting** (bar bawah) | Simpan konfigurasi + kirim ke engine |
| **Mulai / Jeda** | Nyalain engine / istirahatin (proses tetap hidup, 0% aktivitas) |
| **Cek sekarang** | Paksa cek GitHub (+ grup kalau nyala) sekarang |
| **Tautkan pakai kode** | Nautin WA pakai pairing code 8 huruf |
| **Pakai QR** | Nautin WA pakai QR (scan dari HP lain) |
| **Lepas WA** | Logout perangkat bot dari WA |
| **Bikin channel** | Bikin channel WA baru dari akun lo + isi kolom Channel otomatis |
| **Kirim sebagai Pertanyaan** | Pesan ke channel pakai fitur "Pertanyaan" WA — follower bisa bales (cuma lo yang baca). Matiin → teks biasa |
| **Tes kirim ke channel** | Kirim pesan tes ke channel (formatnya sama kayak pesan rilis) |
| **Cek sekarang** (grup) | Jalanin penjaga grup sekarang |
| **Tes kirim** (grup) | Kirim pesan tes ke grup target |
| **Daftar hitam** | Lihat orang yang bakal ditolak + **Buka blokir** satu-satu |
| **Kosongin** | Reset daftar hitam otomatis |
| **Izinkan jalan di latar** | Minta dikecualikan dari optimasi batre |
| **Buka izin Autostart** | Buka menu Autostart (Xiaomi dll) |
| **Buka folder / Kirim log** | Buka / bagikan file log |
| **Matikan service** | Matikan semuanya sampai dinyalakan lagi |

**Biar HP nggak "neror":**
- Charge HP-nya terus (layar boleh mati)
- *Settings → Apps → WA Release Bot → Battery → Unrestricted*
- Biarkan notifikasi bot tetap — itu jangkar foreground service-nya

---

## 🎵 Lagu mood

Sesekali bot ngirim **potongan ~60 detik** lagu lama (slow rock / jiwang 80-90an,
pop lawas Indonesia) plus kata-kata ke channel. Jadwalnya diacak kayak orang lagi
mood: rata-rata N kali sehari, cuma di jam aktif yang lo atur.

Pembagiannya **Cloudflare x HP** — tanpa GitHub Actions:

```
HP (pas "mood")  ──GET /lagu/berikut──▶  Cloudflare Worker (gratis)
                                           pilih lagu: 50% daftar lawas,
                                           50% lagi trend di Indonesia (chart
                                           harian Spotify ID, disaring AI)
                                           cari di SoundCloud → link stream
                                           kata-kata dari AI (key Groq di Worker):
                                           gaya curhat / surat / puitis /
                                           lucu-miris / nostalgia, ±35% ditemenin
                                           ayat Al-Qur'an (lagu/ayat.json)
HP  ◀── { judul, artis, kata, url, mulai } ──┘
HP: download CUMA potongan ~60 dtk (HTTP Range, ±1 MB) → rapiin frame MP3
    → ubah jadi VOICE NOTE (Ogg Opus, WASM, tanpa ffmpeg)
    → kirim kata-kata + voice note ke channel → file-nya langsung DIHAPUS
```

**Semua yang di Cloudflare bisa di-update tanpa update app** (milih lagu,
kata-kata, ayat) — cukup deploy ulang Worker. Update app cuma perlu kalau yang
berubah bagian HP (download / ubah ke voice note / kirim).

Soal ayat: AI **nggak pernah nulis ayat sendiri**. Dia cuma milih nomor dari
[`lagu/ayat.json`](lagu/ayat.json), teksnya ditempel apa adanya. Isi file itu =
terjemahan Kemenag, dicek kata per kata ke [equran.id](https://equran.id).

Kenapa voice note? Saluran WA cuma nerima voice note — file audio MP3 biasa
tampil **"tidak didukung"** di saluran.

Daftar lagunya di [`lagu/daftar.txt`](lagu/daftar.txt). Habis ngubah, deploy ulang
Worker-nya: `python3 scripts-dev/deploy_worker_lagu.py` (butuh env `CF_API_TOKEN`,
`CF_ACCOUNT_ID`, `CF_KV_LAGU`, opsional `GROQ_API_KEY`). Kode Worker:
[`lagu/worker/worker.js`](lagu/worker/worker.js).

> ⚠️ Lagunya punya orang. Yang dikirim cuma potongan, tapi channel publik
> tetap bisa kena laporan hak cipta — pakai secukupnya.

## 🧩 Hosting bot custom

Punya project bot Node.js sendiri? Buka **Hosting bot** di app → upload ZIP.

- ZIP isinya `package.json` + file utama (`scripts.start`, `main`, atau `index.js`).
- `node_modules` boleh ikut atau nggak. Kalau nggak ada, app masang sendiri dari
  npm (modul JS murni aja — paket native kayak `sharp` nggak jalan di HP).
- `.env` ikut dibaca. Path relatif (`./session`) jalan, karena folder kerjanya
  folder project.
- Bot jalan di **worker thread** terpisah: `process.exit()` atau crash di bot
  itu nggak matiin app. Ada restart otomatis, konsol, dan kolom input (stdin)
  buat bot yang nanya nomor WA.
- Ganti ZIP → file lama yang nggak ada di ZIP baru (sesi WA, `.env`,
  `node_modules`) tetap dipertahankan.
- Node-nya **Node 18** bawaan app. Versinya cuma bisa naik lewat update APK.

## 💻 CLI — Termux / PC

```bash
# 1. Dependensi (Termux)
pkg update -y && pkg install -y nodejs git
# atau jalankan: bash cli/setup-termux.sh

# 2. Ambil kode + install
git clone https://github.com/xykal/wa-release-bot.git
cd wa-release-bot/cli
npm install

# 3. Konfigurasi
cp config.example.json config.json
nano config.json

# 4. Tautkan WA sekali seumur hidup — pakai pairing code (satu HP cukup):
npm run setup -- --pair 081234567890
#    ...atau scan QR dari HP lain:  npm run setup

# 5. Jadwalkan (ini yang bikin bot "nggak nyala 24 jam")
crontab -e
```

Baris cron — bangun tiap 15 menit, posting kalau ada release baru, langsung mati lagi:

```cron
*/15 * * * * cd ~/wa-release-bot/cli && /data/data/com.termux/files/usr/bin/node src/bot.mjs --once >> bot.log 2>&1
```

| Perintah | Fungsi |
|---|---|
| `npm run setup -- --pair 08xxxx` | Tautkan pakai pairing code + catat channel + baseline release |
| `npm run setup` | Sama, tapi pakai QR |
| `npm run test` | Kirim test message ke channel |
| `npm run once` | **Cek sekali lalu mati** — ini yang dipakai cron |
| `npm run loop` | Cek berulang tiap N menit (proses tetap nyala) |
| `npm run dry-run` | Cek GitHub + tampilkan pesan yang bakal dikirim, **tanpa** kirim |

> 💡 Tidak ada Node di HP? Bisa juga jalanin di **PC/VPS + cron**, atau pakai
> **systemd timer** di Linux.

---

## 🏗️ Build dari source

### Opsi A — GitHub Actions (rekomendasi)

Push repo → workflow [`build-apk.yml`](.github/workflows/build-apk.yml) jalan otomatis →
APK muncul di tab **Actions → Artifacts**.

Bikin **release** resmi:

```bash
git tag v1.1.1 && git push origin v1.1.1
```

→ APK + `sha256` otomatis di-attach ke [GitHub Release](../../releases).

> Build dari **tag** menghasilkan **ketiga APK** sekaligus (arm64, v7a, dan
> universal) dan semuanya di-attach ke Release. Build push/PR cuma `arm64-v8a`
> biar CI-nya cepat.

**APK-nya ada tiga, pilih satu.** Ketiganya aplikasi yang sama — bedanya cuma
arsitektur prosesor yang disertakan, dan itu yang bikin ukurannya beda jauh:

| File | Buat HP | Ukuran |
|---|---|---|
| `wa-release-bot-arm64-release.apk` | 64-bit — hampir semua HP sekarang | ±21 MB |
| `wa-release-bot-armeabi-v7a-release.apk` | 32-bit — HP lama | ±20 MB |
| `wa-release-bot-universal-release.apk` | nggak yakin? pakai ini | ±37 MB |

Nggak tahu HP-nya yang mana? Pakai `universal` — jalan di dua-duanya.

Ukurannya beda jauh karena `libnode.so` (mesin Node.js-nya) gemuk: ±49 MB
mentah, ±19 MB setelah dikompresi. Satu HP cuma butuh satu arsitektur, jadi
mengirim dua-duanya sekaligus cuma bikin unduhannya dua kali lebih besar.

Kalau mau build sendiri dengan ABI tertentu: *Actions → Build APK → Run
workflow* lalu pilih input `abis` (`arm64-v8a`, `armeabi-v7a`, atau
`arm64-v8a,armeabi-v7a`).

> nodejs-mobile v18.20.4 nyediain 3 prebuilt: `arm64-v8a`, `armeabi-v7a`, dan
> `x86_64` (buat emulator). Yang nggak diambil di langkah fetch nggak bisa
> dipackage — build-nya bakal berhenti di CMake.

**Signing.** Set 4 secrets di *Settings → Secrets and variables → Actions*:

| Secret | Isi |
|---|---|
| `KEYSTORE_BASE64` | `base64 -w0 my-release.jks` |
| `KEYSTORE_PASSWORD` | password store |
| `KEY_ALIAS` | alias key |
| `KEY_PASSWORD` | password key |

Bikin keystore-nya sekali:

```bash
keytool -genkeypair -v -keystore my-release.jks -alias warelease \
  -keyalg RSA -keysize 4096 -validity 10000 -storetype PKCS12 \
  -storepass GANTI_INI -keypass GANTI_INI \
  -dname "CN=Nama Lo, O=nama-lo, C=ID"

base64 -w0 my-release.jks    # tempel hasilnya ke KEYSTORE_BASE64
```

> ⚠️ **Keystore itu identitas aplikasinya.** Kalau hilang, lo nggak bisa lagi
> bikin update yang bisa nimpa versi lama — pemakai harus uninstall dulu.
> Kalau bocor, orang bisa bikin APK palsu yang dianggap "aplikasi yang sama".
> Simpan di tempat aman, **jangan pernah** masuk repo.

> Tanpa secrets, workflow tetap jalan dan menghasilkan APK yang **bisa di-install**
> (di-sign otomatis dengan debug key bawaan runner). Tapi tiap build punya kunci
> yang BEDA, jadi APK baru nggak bisa dipasang nimpa APK lama — harus uninstall
> dulu, dan itu menghapus sesi WA-nya.

### Opsi B — lokal (Android Studio / CLI)

```bash
bash scripts/build-local.sh              # assembleRelease
bash scripts/build-local.sh assembleDebug # debug
```

Script itu melakukan 4 langkah yang sama persis dengan CI:

1. `cd bot-js && npm ci && npm run build` → `bot-js/dist/bundle.cjs`
2. copy bundle ke `app/src/main/assets/node/`
3. `bash scripts/fetch-nodejs-mobile.sh` → `libnode.so` + header
4. `./gradlew assembleRelease`

Butuh: **JDK 17**, **Android SDK 35**, **NDK 26.1.10909125**, **CMake 3.22.1**, **Node 18+**.

---

## 🩺 Debugging — log ada di mana

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

## 🔧 Troubleshooting

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
| `Username channel (...) nggak bisa dipakai` | Memang nggak didukung. Pakai **link** channel, atau tekan **Bikin Channel**. Lihat [Channel WA: dapetnya dari mana?](#channel-wa-dapetnya-dari-mana) |
| `Link channel-nya nggak kebaca` | Link-nya kadaluarsa / salah. Buka channel → ⋯ → Bagikan → salin ulang |
| Pesan nggak terkirim ke channel | Pastikan lo **pemilik/admin** channel-nya. Cek `mesin.log` |
| Mau lapor bug tapi nggak tau kenapa | Tekan **Kirim Log** → kirim hasilnya. Yang paling penting `crash.log` |
| GitHub 403/429 (rate limit) | Isi **Token GitHub** di setting (classic token, scope `public_repo` cukup) |
| Bot tidur terus padahal ada release | Cek **Log** di app + tab **Terakhir**. Pakai **Cek Sekarang** buat paksa |
| Log mentah (debug) | `adb logcat -s WRBot` — semua `console.log` engine Node ke sana. Atau `logcat.log` di folder log app |

Masih mentok? Buka [Issue](../../issues/new/choose) — sertakan output Log dari app.

---

## 🔒 Keamanan

- Session WA tersimpan di **storage privat app** (`/data/data/.../wa_release_bot/session`)
  — nggak bisa diakses app lain
- `allowBackup=false` → session nggak ikut backup/restore
- Bot posting pakai **nomor WA lo sendiri** (sebagai linked device) — pastikan lo pemilik/admin channel-nya
- **Folder log bisa dibaca siapa aja yang pegang HP-nya.** Isinya tag release, isi pesan, dan error — **bukan** token atau kredensial session. Kalau mau bersih, hapus foldernya
- **Jangan pernah commit** keystore / token ke repo
  (`.gitignore` + [gitleaks](.github/workflows/security.yml) sudah jaga, tapi tetap hati-hati)
- Token di CI taruh di **GitHub Secrets**, jangan di file

Laporan kerentanan: lihat [SECURITY.md](SECURITY.md).

> ⚠️ WA automation pihak ketiga selalu punya risiko akun dibatasi Meta. Pakai akun/kanal
> yang siap-siap untuk itu, dan **jangan** buat bot spam.

---

## 📁 Struktur

```
.
├── app/                      # 📱 aplikasi Android (Kotlin)
│   ├── src/main/cpp/         #    jembatan JNI → node::Start()
│   ├── src/main/java/…/      #    App (log+capture crash), BotService, LogRecorder, bridge, UI
│   ├── src/test/             #    unit test (JVM)
│   └── build.gradle
├── bot-js/                   # 🧠 engine bot (plain Node.js + Baileys)
│   ├── src/                  #    bot, bridge, github, wa, format
│   ├── polyfills/            #    WebCrypto polyfill (wajib di Node 18)
│   ├── test/                 #    unit test (node --test)
│   └── build.mjs             #    esbuild → bundle.cjs (1 file)
├── cli/                      # 💻 versi Termux/PC (pakai engine yang sama)
├── scripts/                  # 🔧 build-local.sh, fetch-nodejs-mobile.sh
├── docs/                     # 📚 ARCHITECTURE, CI, SECURITY-AUDIT, CHANGELOG
└── .github/workflows/        # ⚙️ build-apk, code-quality, codeql, security
```

---

## 🧪 Analisis & CI

Repo ini punya 4 workflow:

| Workflow | Isi |
|---|---|
| [`build-apk.yml`](.github/workflows/build-apk.yml) | lint + unit test engine → bundle → APK (ABI bisa dipilih) → artifact / GitHub Release |
| [`code-quality.yml`](.github/workflows/code-quality.yml) | ESLint, unit test di Node 18/20/22, `npm audit`, shellcheck, actionlint, cek token bocor |
| [`codeql.yml`](.github/workflows/codeql.yml) | SAST CodeQL untuk JavaScript **dan** Kotlin (muncul di tab Security) |
| [`security.yml`](.github/workflows/security.yml) | dependency-review, gitleaks secret scan, OpenSSF Scorecard |

Plus [Dependabot](.github/dependabot.yml) untuk npm, Gradle, dan GitHub Actions.
Detail: [docs/CI.md](docs/CI.md).

---

## 📄 Lisensi

**Lisensi pemakaian pribadi (source-available) — BUKAN open source.** Lengkapnya: [LICENSE](LICENSE).

- ✅ Boleh: pakai buat diri sendiri, baca & pelajari kodenya, ubah buat dipakai sendiri, kirim PR
- ❌ Nggak boleh tanpa izin: jual / sewain / jasa pasang, sebar ulang APK atau kode, rebrand, pakai buat bisnis

Rilis **v1.3.0 ke bawah** terlanjur rilis di bawah MIT dan tetap MIT; mulai
**v1.4.0** ikut lisensi baru. Kode pihak ketiga (Baileys, nodejs-mobile, dll)
tetap ikut lisensi aslinya — lihat [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).

<div align="center">
<sub>Built in <strong>XyVerse</strong> · dibuat buat yang males bot-nya nyala 24 jam</sub>
</div>
