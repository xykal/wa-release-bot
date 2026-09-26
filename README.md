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

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Android](https://img.shields.io/badge/Android-8.0%2B%20(arm64)-3DDC84?logo=android&logoColor=white)](#-pakai-setelah-install)
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
- ✅ **Scan QR sekali seumur hidup** — session WA tersimpan di storage privat app
- ✅ **Post ke channel WA** (username `@...` atau JID `120363...@g.us`)
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
| Shell app | Kotlin + Material 3, foreground service, WorkManager |
| "Otak" bot | **Node.js 18.20.4 sungguhan** di-embed via [nodejs-mobile](https://github.com/nodejs-mobile/nodejs-mobile) (`libnode.so` + jembatan JNI) |
| Klien WhatsApp | [Baileys 6.7.24](https://github.com/WhiskeySockets/Baileys) (linked device) |
| Bot ↔ App | File bridge (`events.jsonl` / `cmd.json`) + WebSocket `127.0.0.1` sebagai jalur cepat |
| Cek release | GitHub REST API `/releases/latest` |

Detail lengkap: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

### Pakai Setelah Install

1. Buka app → isi **Repo GitHub** (`owner/nama-repo`) & **Channel WA** (`@username_channel`)
   → **Simpan Setting**
2. Tekan **Setup (Scan QR)** → scan QR di layar pakai WA
   (WA → ☰ → *Perangkat Tertaut* → *Hubungkan Perangkat*)
3. Bot kirim **test message** ke channel → muncul? Beres 🎉
4. Tekan **Mulai** → bot jalan dalam mode bangun-tidur
5. (Opsional) centang **Mulai otomatis saat HP boot**

| Tombol | Fungsi |
|---|---|
| **Simpan Setting** | Simpan konfigurasi + kirim ke engine |
| **Mulai** | Nyalakan service + engine (mode bangun-tidur) |
| **Jeda** | Engine berhenti cek — proses app tetap hidup, 0% aktivitas |
| **Cek Sekarang** | Paksa cek GitHub sekarang (hasilnya di Log) |
| **Setup (Scan QR)** | Tampilkan QR buat linking device |
| **Test** | Kirim test message ke channel |
| **Matikan Service** | Matikan semuanya sampai service dinyalakan lagi |

**Biar HP nggak "neror":**
- Charge HP-nya terus (layar boleh mati)
- *Settings → Apps → WA Release Bot → Battery → Unrestricted*
- Biarkan notifikasi bot tetap — itu jangkar foreground service-nya

---

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

# 4. Scan QR sekali seumur hidup (±30 detik)
npm run setup

# 5. Jadwalkan (ini yang bikin bot "nggak nyala 24 jam")
crontab -e
```

Baris cron — bangun tiap 15 menit, posting kalau ada release baru, langsung mati lagi:

```cron
*/15 * * * * cd ~/wa-release-bot/cli && /data/data/com.termux/files/usr/bin/node src/bot.mjs --once >> bot.log 2>&1
```

| Perintah | Fungsi |
|---|---|
| `npm run setup` | Scan QR + catat channel + baseline release |
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
git tag v1.1.0 && git push origin v1.1.0
```

→ APK + `sha256` otomatis di-attach ke [GitHub Release](../../releases).

**Signing resmi (opsional).** Set 4 secrets di *Settings → Secrets and variables → Actions*:

| Secret | Isi |
|---|---|
| `KEYSTORE_BASE64` | `base64 -w0 my-release.keystore` |
| `KEYSTORE_PASSWORD` | password store |
| `KEY_ALIAS` | alias key |
| `KEY_PASSWORD` | password key |

Bikin keystore-nya sekali:

```bash
keytool -genkeypair -v -keystore my-release.keystore -alias wa-release \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass GANTI_INI -keypass GANTI_INI
```

> Tanpa secrets, workflow tetap jalan dan menghasilkan APK yang **bisa di-install**
> (di-sign debug key). Pasang dulu, pastiin jalan, baru set keystore resmi.

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

Butuh: **JDK 17**, **Android SDK 34**, **NDK 26.1.10909125**, **CMake 3.22.1**, **Node 18+**.

---

## 🔧 Troubleshooting

| Gejala | Solusi |
|---|---|
| `bundle.cjs tidak ditemukan` | APK di-build tanpa langkah bundling — build ulang via Actions / `scripts/build-local.sh` |
| `libnode.so tidak ditemukan` | Jalankan `bash scripts/fetch-nodejs-mobile.sh` |
| QR tidak muncul | Pastikan service aktif (baru tekan Setup? tunggu ±4 detik). Cek Log di app |
| QR tidak muncul di CLI | Pastikan pakai Baileys 6.7.24 + `qrcode-terminal` (sudah otomatis sejak v1.1.0) |
| `Cannot destructure property 'subtle' of globalThis.crypto` | Runtime Node 18 tanpa polyfill. Sudah diperbaiki di v1.1.0 — update dulu |
| `Sesi WA ke-logout` | Session terbuang — tekan **Setup** lagi dan scan QR |
| `Channel @x tidak ketemu` | Cek username channel; pastikan lo **admin**; atau pakai JID (`120363...@g.us`) |
| GitHub 403/429 (rate limit) | Isi **Token GitHub** di setting (classic token, scope `public_repo` cukup) |
| Bot tidur terus padahal ada release | Cek **Log** di app + tab **Terakhir**. Pakai **Cek Sekarang** buat paksa |
| Log mentah (debug) | `adb logcat -s WRBot` — semua `console.log` engine Node ke sana |

Masih mentok? Buka [Issue](../../issues/new/choose) — sertakan output Log dari app.

---

## 🔒 Keamanan

- Session WA tersimpan di **storage privat app** (`/data/data/.../wa_release_bot/session`)
  — nggak bisa diakses app lain
- `allowBackup=false` → session nggak ikut backup/restore
- Bot posting pakai **nomor WA lo sendiri** (sebagai linked device) — pastikan lo admin channel-nya
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
│   ├── src/main/java/…/      #    service, bridge, UI
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
| [`build-apk.yml`](.github/workflows/build-apk.yml) | lint + unit test engine → bundle → APK arm64 → artifact / GitHub Release |
| [`code-quality.yml`](.github/workflows/code-quality.yml) | ESLint, unit test di Node 18/20/22, `npm audit`, shellcheck, actionlint, cek token bocor |
| [`codeql.yml`](.github/workflows/codeql.yml) | SAST CodeQL untuk JavaScript **dan** Kotlin (muncul di tab Security) |
| [`security.yml`](.github/workflows/security.yml) | dependency-review, gitleaks secret scan, OpenSSF Scorecard |

Plus [Dependabot](.github/dependabot.yml) untuk npm, Gradle, dan GitHub Actions.
Detail: [docs/CI.md](docs/CI.md).

---

## 📄 Lisensi

[MIT](LICENSE) — pakai, modif, whatever. Risikonya tanggung sendiri 😄

<div align="center">
<sub>Built in <strong>XyVerse</strong> · dibuat buat yang males bot-nya nyala 24 jam</sub>
</div>
