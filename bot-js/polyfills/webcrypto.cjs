// ============================================================================
//  Polyfill WebCrypto untuk runtime Node 18.
//
//  KENAPA INI ADA:
//    nodejs-mobile (mesin Node.js yang di-embed di APK) rilis terakhirnya
//    adalah Node 18.20.4. Di Node 18, `globalThis.crypto` BELUM ada — baru
//    otomatis tersedia sejak Node 19. Baileys >= 6.7.x memakai
//    `globalThis.crypto.subtle` di top-level module, jadi tanpa polyfill ini
//    bundle langsung mati saat di-require:
//
//        TypeError: Cannot destructure property 'subtle' of
//                   'globalThis.crypto' as it is undefined.
//
//    `node:crypto`.webcrypto sendiri SUDAH ada di Node 18 (sejak v15), cuma
//    belum dipasang ke globalThis. Jadi kita tinggal pasang.
//
//  File ini di-inject oleh esbuild sebagai `banner` (lihat build.mjs) supaya
//  jalan SEBELUM kode Baileys mana pun.
//
//  Di Node 20+ / 22+, `globalThis.crypto` sudah ada → blok ini di-skip.
// ============================================================================

(function installWebCryptoPolyfill() {
  var g = globalThis;
  if (typeof g.crypto !== 'undefined' && g.crypto && g.crypto.subtle) return;

  var webcrypto;
  try {
    webcrypto = require('node:crypto').webcrypto;
  } catch (e) {
    // Node 18 punya `webcrypto` sejak v15, jadi ini praktis nggak akan kena.
    // Kalau kena, biarkan error aslinya muncul dari Baileys biar jelas.
    return;
  }
  if (!webcrypto) return;

  try {
    Object.defineProperty(g, 'crypto', {
      value: webcrypto,
      configurable: true,
      writable: true,
      enumerable: false,
    });
  } catch (e) {
    // Properti read-only (beberapa runtime) → coba jalur yang lebih kasar.
    try {
      g.crypto = webcrypto;
    } catch (e2) {
      /* menyerah — error aslinya akan muncul dari Baileys */
    }
  }
})();
