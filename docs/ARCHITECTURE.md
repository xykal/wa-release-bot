# Arsitektur

## Gambaran besar

```
┌─────────────────────────────── HP ANDROID ───────────────────────────────┐
│                                                                          │
│  MainActivity (Kotlin)                                                   │
│      │  subscribe                                                       │
│      ▼                                                                   │
│  BotBus  ── state tunggal (data class immutable) ──────────────────┐     │
│      ▲                                                             │     │
│      │ publish                                                     │     │
│  BotService (foreground service, dataSync)                         │     │
│      │   • extract bundle.cjs dari assets → filesDir               │     │
│      │   • tulis config.json dari SharedPreferences                │     │
│      │   • jalankan NodeBridge.start()                             │     │
│      │   • FileBridge (poll events.jsonl) + WsClient (cmd cepat)   │     │
│      │                                                             │     │
│      ├──────────────► libnodebridge.so (JNI, native-lib.cpp)       │     │
│      │                      │  node::Start(argc, argv)             │     │
│      │                      ▼                                      │     │
│      │                libnode.so  (nodejs-mobile v18.20.4)         │     │
│      │                      │                                      │     │
│      │                      ▼                                      │     │
│      └──────────────► bundle.cjs  (engine bot, 1 file hasil esbuild)     │
│                             │                                      │     │
│                             ├─ scheduler tidur-bangun              │     │
│                             ├─ GitHub REST API  (1 req/interval)   │     │
│                             └─ Baileys → WebSocket ke WA           │     │
│                                                                    │     │
│  BotWatchdogWorker (WorkManager, ≥15 mnt) ── service mati? nyalain │     │
│  BootReceiver ── auto-start setelah reboot (opsional)              │     │
└──────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
                     api.github.com  +  web.whatsapp.com
```

## Kenapa Node.js di-embed?

Supaya **nggak perlu Termux, PC, atau VPS**. Logika bot-nya (Baileys, GitHub
API, scheduler) sudah jalan sebagai Node.js biasa; yang dibutuhkan cuma
"membungkus"-nya jadi app. [nodejs-mobile](https://github.com/nodejs-mobile/nodejs-mobile)
menyediakan `libnode.so` prebuilt untuk Android, jadi tinggal panggil
`node::Start()` dari JNI.

Alternatif yang dipertimbangkan dan ditolak:

| Alternatif | Kenapa nggak dipakai |
|---|---|
| Termux + cron | butuh instal Termux dari F-Droid, nggak semua orang mau |
| Baileys di Kotlin ulang | buang seluruh ekosistem Node (protobuf WA, socket, crypto) |
| Cloudflare Worker | nggak bisa nahan sesi WhatsApp (WebSocket persisten + state) |
| `nodejs-mobile-react-native` | bawa React Native cuma buat 1 service, jauh lebih berat |

## Komunikasi App ↔ Engine

Dua jalur, sengaja **dua**, karena jalur cepat nggak boleh jadi titik gagal tunggal:

| Jalur | Arah | Isi | Andalan? |
|---|---|---|---|
| `events.jsonl` | Node → App | `log`, `status`, `qr`, `posted`, `setup_*`, `cmd_error` | ✅ selalu jalan |
| `cmd.json` | App → Node | `ping`, `configure`, `start`, `stop`, `check`, `setup`, `test` | ✅ selalu jalan |
| WebSocket `127.0.0.1:18790` | dua arah | perintah saja (bukan event) | ⚡ opsional |

**File bridge** — Node `appendFileSync` satu baris JSON per event; app polling
tiap 300 ms pakai `RandomAccessFile` dengan offset (bukan baca ulang seluruh
file). File di-rotate kalau lewat 4 MB. Arah sebaliknya, app menulis `cmd.json`
secara atomik (tulis `cmd.json.tmp` → `rename`), Node polling tiap 250 ms lalu
**menghapus** file-nya setelah dibaca.

**WebSocket** — cuma buat mempercepat perintah (nggak nunggu 250 ms). Kalau
gagal bind/gagal connect, `WsClient.send()` balikin `false` dan pemanggilnya
fallback ke file bridge secara otomatis. Jadi WebSocket boleh mati kapan saja.

## Siklus hidup engine (mode "tidur")

```
Engine start
   │
   ├─ baca config.json + state.json
   ├─ tunggu perintah `start` dari app (atau _autoStart)
   │
   ▼
scheduleNext(3 detik)  ← cek pertama
   │
   ▼
runCheck()
   │  fetchLatestRelease()  ← 1 request ke api.github.com
   │
   ├─ tag sama dengan state.lastTag → log "nggak ada update" → TIDUR
   └─ tag beda → postRelease():
         connectToWhatsApp()   ← WA baru nyambung DI SINI (2–5 detik)
         resolveChannelJid()   ← cache JID-nya di state.json
         sendText()
         state.lastTag = tag, simpan
         close()               ← WA langsung dilepas
   │
   ▼
scheduleNext(intervalMs)   ← default 15 menit
```

Poin penting: **koneksi WA itu mahal** (handshake, enkripsi, sync).
Makanya bot nggak nyambung kalau nggak ada yang mau dikirim. Selama nggak ada
release baru, yang jalan cuma 1 HTTP request ke GitHub per interval.

`state.json` menyimpan `{ lastTag, channelJid, postCount, lastPostedAt }` supaya
baseline nggak reset tiap app restart — dan JID channel nggak perlu di-resolve
ulang (itu juga butuh koneksi WA).

## Isi APK

| Bagian | Ukuran | Asal |
|---|---|---|
| `assets/node/bundle.cjs` | ±11 MB | hasil `esbuild` dari `bot-js/src/` — semua dependency termasuk Baileys di-inline |
| `lib/arm64-v8a/libnode.so` | ±60 MB (unstripped) | rilis nodejs-mobile v18.20.4 |
| `lib/arm64-v8a/libnodebridge.so` | ±7 KB | `app/src/main/cpp/native-lib.cpp` |
| Kode Kotlin + resource | ±1 MB | `app/` |

APK hasilnya ±35–40 MB, dominan dari `libnode.so`. Itu harga yang dibayar buat
"nggak butuh Termux".

## Jembatan JNI

### Yang harus ada di sisi Kotlin

Punya `.so` di dalam APK **tidak cukup**. Android baru menautkan sebuah library
native kalau ada kode yang memintanya:

```kotlin
// URUTANNYA PENTING — libnodebridge.so punya DT_NEEDED ke libnode.so
System.loadLibrary("node")        // libnode.so
System.loadLibrary("nodebridge")  // libnodebridge.so
```

Kalau baris itu nggak ada, `startNode()` melempar `UnsatisfiedLinkError` dan
**mesin Node nggak akan pernah nyala** — bot-nya mati total, QR nggak muncul,
tapi build-nya tetap hijau. Ini pernah kejadian sampai v1.1.3 (lihat
[CHANGELOG](../CHANGELOG.md#114--2026-09-27)), makanya sekarang ada dua cek:
`readelf` memastikan `.so`-nya mengekspor
`Java_com_xykals_warelease_NodeBridge_startNode`, dan satu lagi memastikan
`loadLibrary` masih ada beserta urutannya.

Pemanggilannya ada di dalam thread Node, bukan thread utama: `libnode.so` itu
45–60 MB dan memuatnya butuh ratusan milidetik — kalau di thread UI, layarnya
nge-freeze.

### Di sisi native

`native-lib.cpp` sengaja dibuat sesederhana mungkin — resepnya sama dengan yang
dipakai React Native:

1. Set environment variable dari `Map` yang dikirim Kotlin (`WR_DATA_DIR`,
   `WR_WS_PORT`, `NODE_ENV`) lewat `setenv()`.
2. Redirect `stdout`/`stderr` ke logcat (`adb logcat -s WRBot`) pakai `pipe()` +
   thread pembaca.
3. Susun `argv[2] = { "node", "<path>/bundle.cjs" }` di satu blok memori
   kontigu (libuv butuh itu).
4. `node::Start(argc, argv)` — **blocking** selama Node hidup. Karena itu
   dipanggil dari thread terpisah (`NodeBridge.start()`), bukan thread UI.

## Polyfill WebCrypto — kenapa ada

`nodejs-mobile` rilis terakhirnya **v18.20.4 (Okt 2024)**. Node 18 **belum**
punya `globalThis.crypto` — itu baru otomatis sejak Node 19.

Baileys ≥ 6.7.x memakai `globalThis.crypto.subtle` di **top-level module**:

```js
var { subtle } = globalThis.crypto;
```

Jadi bundle langsung mati sebelum kode kita jalan:

```
TypeError: Cannot destructure property 'subtle' of 'globalThis.crypto' as it is undefined.
```

`require('node:crypto').webcrypto` **sudah ada** di Node 18 (sejak v15) — cuma
belum dipasang ke `globalThis`. Solusinya: inject
[`polyfills/webcrypto.cjs`](../bot-js/polyfills/webcrypto.cjs) sebagai esbuild
`banner`, jadi jalan sebelum modul Baileys mana pun. Di Node 20+ blok ini
di-skip sendiri.

`build.mjs` juga memverifikasi pasca-build bahwa polyfill benar-benar ada di
bundle — supaya kesalahan seperti ini nggak lolos ke APK.

## Kenapa Baileys 6.7.24, bukan 7.x

| | 6.7.24 | 7.0.0-rc14 |
|---|---|---|
| Status | `legacy` dist-tag, **sudah ditambal** CVE-2026-48063 | latest, juga ditambal |
| Modul | CJS-compatible | **ESM-only** |
| Engines | `>= 20` | `>= 20` |
| Risiko di Node 18 | rendah — sudah diuji, dapat QR asli | tinggi — sintaks & API Node 20+ di mana-mana |

Runtime di HP **mentok Node 18.20.4** dan itu nggak bisa diubah tanpa
nodejs-mobile rilis lagi. Jadi `6.7.24` adalah pilihan paling aman yang tetap
menutup kerentanan kritikalnya.

Diuji dengan: bundle di-build `target: node18`, dijalankan pakai binary
Node 18.20.4, menghasilkan `QR RECEIVED len=237` dari server WhatsApp asli.

## Batasan yang diketahui

| Batasan | Kenapa | Bisa diperbaiki? |
|---|---|---|
| `libnode.so` align 4 KB, bukan 16 KB | nodejs-mobile dibangun sebelum syarat 16 KB | perlu upstream build ulang — **nggak** |
| Runtime mentok Node 18 | nodejs-mobile nggak ada rilis lebih baru | tunggu upstream |
| Default cuma `arm64-v8a` | tiap ABI nambah ±20 MB; hampir semua HP sekarang 64-bit | **bisa** — input `abis` di workflow, atau `-Pabis=armeabi-v7a` lokal |
| HP harus tetap nyala | batasan fisik | ❌ |
| Risiko akun WA dibatasi Meta | automasi pihak ketiga | ❌ konsekuensi desain |

## Keputusan desain, singkat

- **Foreground service `dataSync`**, bukan `WorkManager` doang: WorkManager
  nggak bisa jaga proses Node tetap hidup. Watcher tetap dipakai, tapi cuma
  buat "kalau service mati, nyalain lagi".
- **`minSdk 26`** — API 26 nggak butuh kompatibilitas `Notification.Builder`
  lawas, dan cakupannya sudah >99% perangkat aktif.
- **`allowBackup=false`** — session WA nggak boleh ikut backup cloud.
- **Debug build dikasih suffix `.debug`** — biar bisa dipasang berdampingan
  dengan versi release tanpa saling menimpa.
- **`bundle.cjs` di-extract ke `filesDir`, bukan dibaca langsung dari assets** —
  Node butuh path file nyata, dan `assets/` cuma bisa dibaca lewat `AssetManager`.
