// ============================================================================
//  Polyfill WebCrypto untuk Node 18.
//
//  Baileys >= 6.7.x memakai `globalThis.crypto.subtle` di top-level module.
//  Di Node 18, `globalThis.crypto` belum otomatis ada (baru sejak Node 19),
//  jadi tanpa polyfill ini CLI langsung mati di Node 18 dengan:
//
//      TypeError: Cannot destructure property 'subtle' of
//                 'globalThis.crypto' as it is undefined.
//
//  Modul ini HARUS di-import paling awal di bot.mjs supaya jalan sebelum
//  Baileys di-load. (ESM mengeksekusi dependency sesuai urutan import.)
//
//  Di Node 20+ modul ini cuma lewat tanpa ngapa-ngapain.
// ============================================================================
import { webcrypto } from 'node:crypto';

if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto?.subtle) {
  try {
    Object.defineProperty(globalThis, 'crypto', {
      value: webcrypto,
      configurable: true,
      writable: true,
      enumerable: false,
    });
  } catch {
    try {
      globalThis.crypto = webcrypto;
    } catch {
      /* menyerah — error aslinya akan muncul dari Baileys biar jelas */
    }
  }
}

export {};
