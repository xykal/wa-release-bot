# Changelog

Semua perubahan penting proyek ini. Format mengikuti
[Keep a Changelog](https://keepachangelog.com/id/1.1.0/) dan
[Semantic Versioning](https://semver.org/lang/id/).

## [Unreleased]

## [1.1.3] — 2026-09-27

### 🐛 Diperbaiki

- **App terhenti waktu tombol ditekan (paling sering kelihatan di Setup).**
  `BotService` baca setting lewat `private val settings = SettingsStore(this)`
  di badan class. Field itu jalan di **constructor**, sedangkan Android baru
  memasang Context-nya setelah constructor selesai
  (`newService()` → `attach(ctx)` → `onCreate()`). Jadi di titik itu `this`
  masih Context kosong → `getSharedPreferences()` melempar NullPointerException
  di thread utama → **seluruh proses app mati**.
  Sekarang `settings` `lateinit` dan diisi di `onCreate()`.
  Ini bug lama, bukan bawaan v1.1.2 — baru ketahuan sekarang karena belum
  pernah dites di HP sungguhan.
- **Layar beku waktu dialog QR muncul.** Gambar QR 640×640 digambar dengan
  400 ribu panggilan `Bitmap.setPixel()` **di thread utama** — dan digambar
  ulang tiap kali ada event masuk (walau isi QR-nya sama). Sekarang: gambar
  QR disusun dulu di array, dikirim ke bitmap lewat satu panggilan
  `setPixels()`, diproses di thread belakang, dan hasinya di-cache per isi QR.
- `QrBitmap` cuma nangkep `Exception`; kalau yang kelempar `OutOfMemoryError`
  (itu `Error`, bukan `Exception`) aplikasinya tetap mati. Sekarang `Throwable`.
- Semua tombol dibungkus try/catch: kalau ada yang meledak, muncul toast + jejak
  di log — app-nya nggak ikut mati.
- Tombol yang ditekan waktu service belum siap nggak lagi diam-diam nggak
  ngapa-ngapain (`withService` cuma nunggu 4 detik lalu kirim; kalau service-nya
  belum kelar, perintahnya hilang tanpa pesan). Sekarang ditunggu sampai
  instance-nya benar-benar ada, maksimal ~10 detik, lalu dikasih tahu kalau gagal.

### ✨ Ditambahkan

- **Perekam log**, tersimpan di `Android/media/<nama-paket>/log/`:
  `app.log` (aktivitas app), `mesin.log` (engine Node), `logcat.log` (log
  mentah Android, termasuk output Node), dan `crash.log` (penyebab app mati).
  Folder itu bisa dibuka tanpa root dan tanpa izin penyimpanan — beda dengan
  `/data/data/...` yang nggak bisa diakses siapa-siapa.
- **Penangkap crash** yang dipasang dari `App.onCreate()`, jadi crash paling
  awal pun kecatat lengkap dengan versi app, tipe HP, dan stack trace.
- Tombol **Buka Folder Log** dan **Kirim Log** (bagi file log lewat
  WA/email/Drive pakai FileProvider — cuma folder log yang bisa dibagikan).
- **Cari channel dari link.** Field "Channel WA" sekarang nerima
  `https://whatsapp.com/channel/...`, JID `<angka>@newsletter`, JID grup
  `<angka>@g.us`, dan link undangan grup `chat.whatsapp.com/...`.
- **Tombol Bikin Channel** — bot bikin channel baru dari akun lo, nyimpen
  JID-nya ke setting, lalu kirim test message. Buat yang belum punya channel.
- Channel boleh dikosongin pas nyimpen setting. Sebelumnya wajib diisi — dan
  itu bikin muter: nggak bisa nyimpen setting → engine nggak nyala → tombol
  Bikin Channel nggak bisa dipakai → nggak punya channel.
- Perintah `cek-channel` (`bikin-channel` juga) di engine + pemakaian grup WA
  sebagai target posting.

### 🔧 Diubah

- **Emoji di UI diganti ikon vektor.** Emoji (▶️ ⏸️ 💾 dst) dirender beda-beda
  tiap HP, ukurannya nggak bisa diatur, dan ada yang muncul kotak kosong.
  Sekarang semua ikon gambar vektor yang warnanya ngikut tema (jadi ikut
  mode terang/gelap).
- **Ikon app digambar ulang**: balon obrolan + panah naik. Yang lama (bulan
  sabit kuning + bintang) kelihatan kayak emoji 🌙. Sekalian ditambah layer
  `monochrome` biar ikut "themed icon" Android 13+.

### ⚠️ Perubahan perilaku (penting)

- **Username channel (`@nama_channel`) sekarang ditolak** dengan pesan yang
  jelas. Dulu "didukung", tapi kodenya manggil `onWhatsApp()`
  — fungsi itu buat nyari **nomor HP**, bukan channel, jadi selalu gagal.
  API WhatsApp yang dipakai engine ini juga nggak nyediain pencarian channel
  lewat username. Yang benar: pakai **link** channel, atau tombol Bikin Channel.
  Ini berlaku juga di CLI (`cli/src/wa.mjs`).

## [1.1.2] — 2026-09-27

### ✨ Ditambahkan

- **Tiga APK di setiap Release**, bukan satu:
  `arm64-v8a` (HP 64-bit), `armeabi-v7a` (HP 32-bit), dan `universal`
  (buat yang nggak mau mikir). Ketiganya dibuild **paralel** lewat matrix,
  jadi nggak nambah waktu CI.
- **Verifikasi dex setelah R8** di CI. R8 me-rename class jadi nama pendek;
  kalau ada nama yang masih dipanggil lewat string (JNI, WorkManager,
  komponen manifest) ikut ke-rename, aplikasinya crash di HP — bukan di CI.
  Jadi nama-nama itu sekarang diperiksa langsung di dalam `classes.dex`.
- Artifact `r8-mapping-*` berisi `mapping.txt`, buat menerjemahkan stack trace
  dari HP (yang namanya sudah di-obfuscate) balik ke nama class asli.

### ⚡️ Ukuran APK

- **R8 diaktifkan** untuk build release: `minifyEnabled` + `shrinkResources`.
  Kode dan resource yang nggak kepakai dibuang, sisanya di-rename jadi pendek.
- Efeknya terbatas dan itu wajar: yang bikin APK ini besar adalah `libnode.so`
  (±49 MB mentah), bukan kode Kotlin. R8 memangkas `classes.dex`, dan itu
  bagian yang jauh lebih kecil.
- Karena `libnode.so` inilah APK-nya dipisah per-arsitektur: satu HP cuma butuh
  satu, jadi mengirim keduanya sekaligus cuma bikin unduhan dua kali lebih
  besar dari yang perlu.

### 🔒 Keamanan

- Aturan keep R8 ditulis eksplisit di `app/proguard-rules.pro` (4 titik:
  JNI, WorkManager, komponen manifest, anotasi). Sengaja pendek — aplikasi ini
  nggak pakai reflection dan nggak ada `addJavascriptInterface`, karena
  bridge ke Node lewat file (`events.jsonl` / `cmd.json`), bukan lewat nama
  class.

## [1.1.1] — 2026-09-26

Versi ini soal **tanda tangan APK** dan **dukungan HP 32-bit**.

### ✨ Ditambahkan

- **Dukungan `armeabi-v7a`** (HP Android 32-bit). Sebelumnya cuma `arm64-v8a`.

  Aturan ABI-nya sekarang:

  | Build dari | ABI yang dipackage |
  |---|---|
  | **tag `v*`** (yang masuk GitHub Release) | `arm64-v8a` **+** `armeabi-v7a` — satu APK, jalan di HP 64-bit maupun 32-bit |
  | push / pull request | `arm64-v8a` saja (paling cepat & kecil) |
  | *Actions → Build APK → Run workflow* | bisa pilih: `arm64-v8a`, `armeabi-v7a`, atau dua-duanya |

  Jadi APK yang di-attach ke Release selalu yang universal — nggak ada lagi
  kejadian "release-nya cuma arm64, HP 32-bit nggak bisa pasang".
- `scripts-dev/apk_signer.py` — baca sertifikat penandatangan APK langsung dari
  APK Signing Block (v2/v3), tanpa perlu install Android SDK. Gunanya buat
  menjawab "APK ini bisa nimpa yang lama atau nggak".
- `-Pabis=...` untuk build lokal, dan `ABIS=...` untuk script yang mengunduh
  `libnode.so`.

### 🐛 Diperbaiki

- **Komentar ABI di `app/build.gradle` salah** — ditulis "nodejs-mobile cuma
  menyediakan prebuilt arm64-v8a + x86_64". Faktanya `armeabi-v7a` juga ada,
  dan itu yang bikin HP 32-bit nggak bisa didukung.
- **Cache key `nodejs-mobile` nggak memuat daftar ABI-nya.** Build `armeabi-v7a`
  bakal kena cache `arm64-v8a`, jadi `libnode.so` versi v7a nggak pernah
  keunduh dan build-nya berhenti di CMake. Sekarang cache key-nya per-set-ABI.
- **Verifikasi isi APK cuma cek "ada `libnode.so`".** Kalau minta dua ABI tapi
  cuma satu yang kepackage, APK-nya tetap lolos dan HP yang satunya cuma dapat
  crash. Sekarang dicek per-ABI.

### 🔒 Keamanan

- **APK sekarang di-sign dengan kunci yang tetap.** Sebelumnya di-sign pakai
  debug key bawaan runner CI, dan runner itu bersih tiap kali — jadi kuncinya
  di-generate ulang tiap build. Akibatnya tiap APK punya sidik jari berbeda dan
  **nggak bisa dipasang nimpa APK sebelumnya** (`App not installed`), sehingga
  tiap update menghapus sesi WhatsApp. Sudah diverifikasi: 3 build dari commit
  dan event berbeda menghasilkan sidik jari yang sama.

## [1.1.0] — 2026-09-26

Versi ini fokusnya **bikin proyeknya benar-benar bisa di-build dan aman**.
Sebelum ini, APK-nya nggak akan pernah jadi: ada 6 bug kompilasi + 1 kerentanan
kritikal di dependency.

### 🔒 Keamanan

- **Naikkan Baileys `6.17.16` → `6.7.24`** — menutup
  [CVE-2026-48063 / GHSA-qvv5-jq5g-4cgg](https://github.com/WhiskeySockets/Baileys/security/advisories/GHSA-qvv5-jq5g-4cgg)
  (**critical, CVSS 9.3**): message upsert / history-sync spoofing + app-state
  corruption dari payload `protocolMessage` yang dibuat jahat. Versi lama juga
  sudah ditandai deprecated oleh maintainer-nya.
- Tambah override dependency transitive: `file-type@^21.3.1` (infinite loop di
  ASF parser) dan `uuid@^11.1.1` (missing buffer bounds check).
- Tambah `gitleaks` + pemeriksaan pola token di CI supaya nggak ada secret
  yang ke-commit.
- Tambah `dependency-review` di PR: blokir dependency baru yang high/critical
  atau berlisensi copyleft kuat.

### 🐛 Perbaikan (semuanya bikin build gagal — ini yang paling penting)

- **`app/build.gradle`: dependency `androidx.appcompat` hilang.**
  `MainActivity` extends `AppCompatActivity`, tapi `androidx.appcompat:appcompat`
  nggak ada di daftar dependency → `Unresolved reference: AppCompatActivity`.
- **`app/src/main/res/layout/activity_main.xml`:** ada `&` mentah di
  `android:text` (baris 262). XML gagal di-parse → `mergeDebugResources` FAILED.
  Diganti `&amp;`.
- **`BotBus.kt`: API `publish {}` nggak bisa dipakai dari mana pun.**
  `publish(block: BotUi.() -> BotUi)` dipanggil dengan lambda yang isinya
  assignment (`BotBus.publish { serviceRunning = true }`) — hasilnya `Unit`,
  bukan `BotUi`; dan field `BotUi` semuanya `val` jadi nggak bisa di-assign.
  Sekarang field-nya `var` + `publish(block: BotUi.() -> Unit)` yang bekerja di
  atas `copy()` (thread-safe). Memperbaiki ~30 error kompilasi di
  `BotService.kt`, `NodeBridge.kt`, `MainActivity.kt`.
- **`QrBitmap.kt`: import zxing salah paket** — `com.google.zxing.QRCodeWriter`
  → `com.google.zxing.qrcode.QRCodeWriter`.
- **`MainActivity.kt`: `tvLog.scrollHeight`** — `TextView` nggak punya properti
  itu. Log sekarang di-scroll lewat `ScrollView` pembungkusnya
  (id baru `svLog`) pakai `fullScroll(View.FOCUS_DOWN)`.
- **`MainActivity.kt`: `ScrollView(this).apply { content = iv }`** — `ScrollView`
  nggak punya properti `content`. Diganti `addView(iv)`.
- **`MainActivity.kt`: tipe `busListener` nggak eksplisit** — `handler.post {}`
  mengembalikan `Boolean`, jadi lambda-nya bertipe `(BotUi) -> Boolean` dan
  nggak cocok dengan `subscribe(l: (BotUi) -> Unit)`. Tipe sekarang ditulis
  eksplisit.
- **`CMakeLists.txt`: path header Node salah.** CMake menebak
  `app/src/main/libnode/include`, sedangkan README & CI menaruh header di
  `app/libnode/include` → `FATAL_ERROR`. Sekarang path di-supply dari
  `app/build.gradle` lewat `-DLIBNODE_ROOT=…` dan `-DJNI_LIBS_DIR=…`, plus
  pesan error yang nyuruh jalanin script yang bener.
- **`build-apk.yml`: tanda tangan release rusak.** Langkah keystore menulis
  string literal `RELEASE_KEYSTORE_PASSWORD=***` dan `RELEASE_KEY_PASSWORD=***`
  ke `$GITHUB_ENV` — jadi password-nya beneran `***` dan signing selalu gagal.
  Sekarang nilainya diambil dari `secrets`.
- **`build-apk.yml`: `gradle/gradle-build-action@v3`** sudah di-deprecate dan
  nggak punya input `ndk` / `cmake`. Diganti `gradle/actions/setup-gradle@v4`
  + `android-actions/setup-android@v3` dengan daftar package eksplisit.
- **`bot.mjs`: TDZ `bridge`.** `createBridge()` memanggil `log()` yang
  mengakses `bridge` — kalau WebSocket gagal start, error-nya jadi
  `ReferenceError: Cannot access 'bridge' before initialization`.
  Sekarang `bridge` di-`let` + dicek null.

### ✨ Ditambahkan

- **Polyfill WebCrypto (`bot-js/polyfills/webcrypto.cjs` + `cli/src/webcrypto.mjs`).**
  Baileys 6.7.x memakai `globalThis.crypto.subtle`, yang **baru ada di Node 19+**.
  nodejs-mobile (runtime di dalam APK) mentok di **Node 18.20.4**, jadi tanpa
  polyfill ini bundle mati saat di-require. Di-inject sebagai esbuild `banner`.
- **`--dry-run` + `qrcode-terminal` di CLI.** Baileys menghapus opsi
  `printQRInTerminal` sejak 6.6, jadi QR setup di Termux sudah nggak muncul.
  Sekarang QR di-render sendiri.
- **Unit test**: 4 test Kotlin (`DurasiTest`) + 9 test Node (`node --test`)
  untuk `parseRepo`, `formatReleasePost`, dan `file bridge`.
- **`util/Durasi.kt`** — `fmtDurasi` dipindah keluar dari `MainActivity` biar
  bisa diuji tanpa Android runtime.
- **`scripts/fetch-nodejs-mobile.sh`** dan **`scripts/build-local.sh`** —
  satu perintah buat build lengkap dari nol, dipakai baik oleh developer
  maupun CI (jadi nggak mungkin lagi beda langkah).
- **4 workflow CI**: `build-apk`, `code-quality`, `codeql`, `security`
  (+ Dependabot). Lihat [docs/CI.md](docs/CI.md).
- **Release otomatis**: push tag `v*` → APK + `sha256` nempel di GitHub Release.
- `versionCode` / `versionName` bisa di-override dari CI
  (`-PversionName=… -PversionCode=…`).
- `.editorconfig`, `.gitleaks.toml`, `SECURITY.md`, `docs/ARCHITECTURE.md`,
  `docs/CI.md`, `docs/SECURITY-AUDIT.md`.

### 🔧 Diubah

- **Repo digabung jadi satu.** Dulu ada dua folder terpisah
  (`wa-release-bot-app` dan `wa-release-bot`). Sekarang:
  Android di root, engine di `bot-js/`, CLI di `cli/`.
- Debug build dapat `applicationIdSuffix .debug` supaya bisa dipasang
  berdampingan dengan versi release.
- `packagingOptions` → `packaging` (API AGP baru), buang resource META-INF
  yang nggak perlu.
- `ndkVersion` dan `buildToolsVersion` dipatok di `build.gradle` supaya build
  lokal dan CI pakai toolchain yang sama.
- Lint diatur supaya tetap menghasilkan laporan SARIF tapi **nggak** ngeblok build.

### 📌 Catatan kompatibilitas

- `engines: node >= 18` di `bot-js/package.json`, tapi Baileys 6.7.24 minta
  `>= 20`. Itu cuma deklarasi — bundle-nya sudah diverifikasi jalan di
  **Node 18.20.4** (bikin QR asli dari server WA). `.npmrc` menyetel
  `engine-strict=false`.
- `libnode.so` dari nodejs-mobile masih **align 4 KB**, jadi belum memenuhi
  syarat halaman 16 KB Android 15+. Ini batasan upstream — lihat
  [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#-batasan-yang-diketahui).

## [1.0.0] — 2026-09-24

Versi awal: aplikasi Android (Kotlin + nodejs-mobile + Baileys) dan versi CLI Termux.

[Unreleased]: ../../compare/v1.1.3...HEAD
[1.1.3]: ../../compare/v1.1.2...v1.1.3
[1.1.2]: ../../compare/v1.1.1...v1.1.2
[1.1.1]: ../../compare/v1.1.0...v1.1.1
[1.1.0]: ../../compare/v1.0.0...v1.1.0
[1.0.0]: ../../releases/tag/v1.0.0
