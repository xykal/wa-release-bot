// Satu-satunya sumber string brand di engine. Sisi Android membaca
// res/values/brand.xml dengan nilai yang sama; jangan ubah salah satu saja.
export const NAMA_APP = 'WA Release Bot';

// NAMA_BOT skrg bisa diganti dari app (kolom "Nama bot di pesan", kall 2026-10-04).
// `let` + ESM live binding: semua file yang import { NAMA_BOT } membaca nilai
// TERAKHIR asalkan dipakai di dalam fungsi, bukan disalin ke const module-level.
export let NAMA_BOT = 'SukiBot';
/** Bawaan, dipakai fallback & di UI Android. */
export const NAMA_BOT_BAWAAN = 'SukiBot';

/** Ganti nama bot saat jalan. Disaring dari karakter perusak markup WA (* _ ~ `). */
export function aturNamaBot(nama) {
  const bersih = String(nama || '')
    .replace(/[*_~`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 24);
  NAMA_BOT = bersih || NAMA_BOT_BAWAAN;
}
export const NAMA_PAKET = 'wa-release-bot';
export const BRAND = 'XyVerse Technology Global';
export const POWERED_BY = `Powered by ${BRAND}`;
export const TANDA_TANGAN = `${NAMA_PAKET} — ${BRAND}`;
export const PEMBUAT = `xykal (${BRAND})`;
