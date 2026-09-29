# Jembatan JNI dan runtime Node di APK

Bagian ini dipisah dari [ARCHITECTURE.md](ARCHITECTURE.md) (2026-09-29) supaya
berkas itu tetap di bawah 250 baris. Isinya tidak berubah: kontrak JNI antara
Kotlin dan `native-lib.cpp`, lalu alasan polyfill WebCrypto.

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
