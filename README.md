# 🦴 WA Release Bot

**Bot WhatsApp Android yang nggak nyala 24 jam.** Dia tidur.

Aplikasi ini nge-host bot langsung di HP (tanpa Termux, tanpa PC, tanpa VPS). Tiap beberapa menit bot bangun, cek GitHub — ada **release baru**? Otomatis posting info ke **channel WhatsApp**. Nggak ada update? Bot tidur lagi.

## Flow

```
 App berjalan (foreground service)
        │
        ▼
 Engine Node.js bangun tiap N menit (default 15)
        │
        ▼
 Cek GitHub (1 request API, ±1 detik)
        │
   ┌────┴──────────┐
   ▼               ▼
 NGGAK ADA         ADA!
   │               │
   ▼               ▼
 TIDUR 😴      WA nyambung 2-5 detik
 (0% CPU,      → posting ke channel
  0% data)     → WA dilepas → TIDUR lagi
```

> ⚠️ **HP harus tetap NYALA** (bisa di-charge, layar boleh mati). HP yang di-**Off** tidak bisa menjalankan aplikasi apa pun — itu batasan fisik, bukan batasan app ini.

## Fitur

- ✅ **Host di HP sendiri** — aplikasi Android native, tanpa Termux
- ✅ **Tidur-bangun beneran** — WhatsApp baru terhubung pas mau posting; cek GitHub cuma 1 request per interval
- ✅ **Scan QR sekali seumur hidup** — session WA tersimpan di storage privat app
- ✅ **Post ke channel WA** (username `@...` atau JID) — lo harus jadi **admin** channel
- ✅ **Watchdog** — WorkManager + boot receiver: kalau service ke-bunuh Android, nyala lagi
- ✅ UI status real-time: log, tag terakhir, hitungan mundur cek berikutnya, dialog QR
- ⚙️ Repo, interval, token GitHub, prerelease, dsb. bisa diganti dari UI kapan aja

## Cara Kerja (singkat)

| Bagian | Teknologi |
|---|---|
| Shell app | Kotlin + Material 3, foreground service, WorkManager |
| "Otak" bot | **Node.js 18 sungguhan** di-embed via [nodejs-mobile](https://github.com/nodejs-mobile/nodejs-mobile) (`libnode.so` + 1 jembatan JNI kecil) |
| Klien WhatsApp | [Baileys v6](https://github.com/WhiskeySockets/Baileys) (linked device) |
| Bot ↔ App | File bridge (`events.jsonl`/`cmd.json`) + WebSocket `127.0.0.1` sebagai jalur cepat |
| Cek release | GitHub REST API `/releases/latest` |

Semua logi­ka bot ada di `bot-js/` (plain Node.js — bisa diuji di PC lewat `npm run selftest`). Saat build, esbuild menjadikannya **satu file** `bundle.cjs` yang ikut ter-emas di APK.

## Kebutuhan

- Android **8.0+**, arsitektur **arm64** (praktis semua HP Android modern)
- 1 **channel WhatsApp** yang lo **admin**-nya
- Repo GitHub yang mau dipantau
- Internet (bot cuma online pas cek/post)

## 🏗️ Build

### Opsi A: GitHub Actions (rekomendasi)

Push repo ini → workflow `build-apk.yml` jalan otomatis → APK ter-upload di tab **Actions → Artifacts**.

Biar APK di-**sign resmi** (bukan debug key), set 4 secrets di repo (**Settings → Secrets and variables → Actions**):

| Secret | Isi |
|---|---|
| `KEYSTORE_BASE64` | Keystore `base64`-kan dulu: `base64 -w0 my-release.keystore` |
| `KEYSTORE_PASSWORD` | Password store |
| `KEY_ALIAS` | Alias key |
| `KEY_PASSWORD` | Password key |

Bikin keystore-nya sekali di PC:

```bash
keytool -genkeypair -v -keystore my-release.keystore -alias wa-release \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass GANTI_INI -keypass GANTI_INI
```

> Tanpa secrets, workflow tetap jalan dan menghasilkan APK yang **bisa di-install** (di-sign debug key). Pasang dulu, pastiin jalan, baru set keystore resmi.

### Opsi B: Build lokal (Android Studio)

```bash
# 1. bundel engine bot
cd bot-js && npm ci && npm run build && cd ..
mkdir -p app/src/main/assets/node && cp bot-js/dist/bundle.cjs app/src/main/assets/node/

# 2. unduh Node.js prebuilt + header (±57MB, sekali aja)
curl -fsSL -o /tmp/njsm.zip \
  https://github.com/nodejs-mobile/nodejs-mobile/releases/download/v18.20.4/nodejs-mobile-v18.20.4-android.zip
unzip -q /tmp/njsm.zip -d /tmp/njsm
mkdir -p app/src/main/jniLibs/arm64-v8a app/libnode
cp /tmp/njsm/bin/arm64-v8a/libnode.so app/src/main/jniLibs/arm64-v8a/
cp -r /tmp/njsm/include app/libnode/include

# 3. build di Android Studio (Run) atau:
./gradlew assembleDebug
```

## 📲 Pakai Setelah Install

1. Buka app → isi **Repo GitHub** (`owner/nama-repo`) & **Channel WA** (`@username_channel`) → **Simpan Setting**
2. Tekan **Setup (Scan QR)** → scan QR yang muncul di layar pakai WA lo
   (WA → ☰ → *Linked Devices* → *Link a Device*)
3. Bot ngekirim **test message** ke channel → cek channel-nya. Muncul? Beres. 🎉
4. Tekan **Mulai** → bot jalan dalam mode bangun-tidur
5. (Opsional) centang **Mulai otomatis saat HP boot**

Tombol lainnya:
- **Cek Sekarang** — paksa cek GitHub sekarang (hasilnya di Log)
- **Test** — kirim test message ke channel
- **Jeda** — engine berhenti cek (proses app tetap hidup, 0% aktivitas)
- **Matikan Service** — matikan semua sampai service dinyalakan lagi

Tips biar HP nggak "neror":
- Charge HP-nya terus (layar boleh mati)
- *Settings → Apps → WA Release Bot → Battery → Unrestricted*
- Biarkan notifikasi bot tetap (itulah jangkar foreground service-nya)

## 🔧 Troubleshooting

| Gejala | Solusi |
|---|---|
| `bundle.cjs tidak ditemukan` | APK di-build tanpa langkah bundling — build ulang via Actions / langkah lokal |
| QR tidak muncul | Pastikan service aktif (kamu baru tekan Setup? tunggu ±4 detik). Cek Log di app |
| `Sesi WA ke-logout` | Session terbuang — tekan **Setup** lagi dan scan QR |
| `Channel @x tidak ketemu` | Cek username channel; pastikan lo **admin**; atau pakai JID (`120363...@g.us`) |
| GitHub 403/429 (rate limit) | Isi **Token GitHub** di setting (classic token, scope `public_repo` cukup) |
| Bot tidur terus padahal ada release | Cek **Log** di app + tab **Terakhir**. Gunakan **Cek Sekarang** buat paksa |
| Log mentah (debug) | `adb logcat -s WRBot` — semua `console.log` engine Node ke sana |

## 🔒 Keamanan

- Session WA tersimpan di **storage privat app** (`/data/data/.../wa_release_bot/session`) — tidak bisa diakses app lain
- `allowBackup=false` → session tidak ikut backup/restore
- Bot posting pakai **nomor WA lo sendiri** (sebagai linked device) — pastikan channel-nya memang lo admin-nya
- Jangan pernah commit keystore / token ke repo
- ⚠️ WA automation pihak ketiga selalu punya risiko akun dibatasi Meta. Pakai akun/kanal yang siap-siap untuk itu, dan jangan buat bot spam.

## 📁 Struktur

```
├── app/                      # aplikasi Android (Kotlin)
│   ├── src/main/cpp/         # jembatan JNI → node::Start()
│   ├── src/main/java/.../    # service, bridge, UI
│   └── build.gradle
├── bot-js/                   # engine bot (plain Node.js + Baileys)
│   ├── src/                  # bot, bridge, github, wa, format
│   └── build.mjs             # esbuild → bundle.cjs (1 file)
└── .github/workflows/        # CI: bundle + libnode + gradle + sign
```

## 📄 License

[MIT](LICENSE) — pakai, modif, whatever. Risikonya tanggung sendiri. 😄
