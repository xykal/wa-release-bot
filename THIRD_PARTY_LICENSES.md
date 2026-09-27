# Lisensi pihak ketiga

WA Release Bot sendiri pakai [lisensi pemakaian pribadi](LICENSE). Komponen di
bawah ini **bukan** karya proyek ini dan tetap ikut lisensi aslinya masing-masing.
Teks lengkap lisensinya ada di repo tiap proyek (link di tabel) dan, buat paket
npm, di `node_modules/<paket>/LICENSE` setelah `npm ci`.

## Ikut ke dalam APK

| Komponen | Dipakai buat | Lisensi |
|---|---|---|
| [Baileys](https://github.com/WhiskeySockets/Baileys) 6.7.24 | klien WhatsApp (linked device) | MIT |
| [nodejs-mobile](https://github.com/nodejs-mobile/nodejs-mobile) | `libnode.so` — Node.js di Android | MIT (+ lisensi Node.js & dependensinya) |
| [Node.js](https://github.com/nodejs/node) 18.20.4 | runtime engine bot | MIT (+ OpenSSL Apache-2.0, dll — lihat `LICENSE` Node.js) |
| [pino](https://github.com/pinojs/pino) | logger engine | MIT |
| [ws](https://github.com/websockets/ws) | WebSocket app ↔ engine | MIT |
| dependensi transitif Baileys (libsignal, protobufjs, dll) | enkripsi & protokol WA | MIT / BSD / Apache-2.0 / GPL-3.0* |
| [OkHttp](https://github.com/square/okhttp) 4.12 | WebSocket di sisi app | Apache-2.0 |
| [ZXing core](https://github.com/zxing/zxing) 3.5 | gambar QR | Apache-2.0 |
| [AndroidX](https://developer.android.com/jetpack/androidx) (core, appcompat, activity, work) | kerangka app | Apache-2.0 |
| [Material Components](https://github.com/material-components/material-components-android) | tema dasar | Apache-2.0 |
| [Kotlin stdlib & coroutines](https://github.com/JetBrains/kotlin) | bahasa app | Apache-2.0 |

\* **Catatan penting soal GPL-3.0.** Baileys bergantung ke `libsignal`
([whiskeysockets/libsignal-node](https://github.com/WhiskeySockets/libsignal-node)) yang
berlisensi **GPL-3.0**, dan libsignal ikut dibundel ke `bundle.cjs` di dalam APK.
GPL-3.0 bisa berarti APK yang disebar (sebagai satu kesatuan) wajib tunduk ke syarat
GPL-3.0 — yang nggak cocok sama larangan "jangan sebar ulang" di [LICENSE](LICENSE).
Proyek ini **nggak** berusaha ngebatasi hak apa pun yang lo dapet dari GPL-3.0: kalau
dua lisensi itu bentrok buat APK, hak dari GPL-3.0 yang berlaku. Lisensi pemakaian
pribadi tetap berlaku buat kode asli di repo ini (app Kotlin, engine `bot-js/src`,
dokumen, logo). Ini bukan nasihat hukum.

Dependensi opsional Baileys yang berlisensi LGPL (`sharp` / libvips) **nggak**
ikut dibundel — diganti stub di `bot-js/build.mjs`.

## Cuma dipakai waktu build / CI (nggak ikut APK)

esbuild (MIT), ESLint (MIT), Gradle (Apache-2.0), Android Gradle Plugin (Apache-2.0),
GitHub Actions pihak ketiga (lihat `.github/workflows/`, masing-masing ada lisensinya).
