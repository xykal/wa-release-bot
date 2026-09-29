# Build dari source

Pelengkap [README](../README.md#build-dari-source). APK resmi ada di halaman unduh;
halaman ini buat yang mau build sendiri.


## Opsi A — GitHub Actions (rekomendasi)

Push repo → workflow [`build-apk.yml`](../.github/workflows/build-apk.yml) jalan otomatis →
APK muncul di tab **Actions → Artifacts**.

Bikin **release** resmi:

```bash
git tag v1.1.1 && git push origin v1.1.1
```

→ APK + `sha256` otomatis di-attach ke [GitHub Release](../../../releases).

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

> **Keystore itu identitas aplikasinya.** Kalau hilang, lo nggak bisa lagi
> bikin update yang bisa nimpa versi lama — pemakai harus uninstall dulu.
> Kalau bocor, orang bisa bikin APK palsu yang dianggap "aplikasi yang sama".
> Simpan di tempat aman, **jangan pernah** masuk repo.

> Tanpa secrets, workflow tetap jalan dan menghasilkan APK yang **bisa di-install**
> (di-sign otomatis dengan debug key bawaan runner). Tapi tiap build punya kunci
> yang BEDA, jadi APK baru nggak bisa dipasang nimpa APK lama — harus uninstall
> dulu, dan itu menghapus sesi WA-nya.

## Opsi B — lokal (Android Studio / CLI)

```bash
bash scripts/build-local.sh              # assembleRelease
bash scripts/build-local.sh assembleDebug # debug
```

Script itu melakukan 4 langkah yang sama persis dengan CI:

1. `npm ci --ignore-scripts && npm run build -w bot-js` (root, npm workspaces) → `bot-js/dist/bundle.cjs`
2. copy bundle ke `app/src/main/assets/node/`
3. `bash scripts/fetch-nodejs-mobile.sh` → `libnode.so` + header
4. `./gradlew assembleRelease`

Butuh: **JDK 17**, **Android SDK 35**, **NDK 26.1.10909125**, **CMake 3.22.1**, **Node 18+**.
