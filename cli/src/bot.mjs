#!/usr/bin/env node
// Entry CLI. Sengaja tanpa import statis ke engine: kalau dependensi belum
// terpasang (npm install dijalankan di folder cli/, bukan di root repo),
// import statis gagal di tahap link dan pesannya cuma "Cannot find package".
// Di sini dicek dulu, baru engine dimuat secara dinamis.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const versi = () => {
  try { return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version; } catch { return '?'; }
};

if (process.argv.includes('--version') || process.argv.includes('-v')) {
  const { NAMA_PAKET, BRAND } = await import('../../bot-js/src/config/brand.mjs');
  console.log(`${NAMA_PAKET} ${versi()} — ${BRAND}`);
  process.exit(0);
}

const butuh = createRequire(new URL('../../bot-js/src/wa.mjs', import.meta.url));
for (const paket of ['@whiskeysockets/baileys', 'pino', 'semver']) {
  try {
    butuh.resolve(paket);
  } catch {
    console.error(`Dependensi "${paket}" belum terpasang.`);
    console.error('Jalankan  npm install  di folder ROOT repo (wa-release-bot/), bukan di cli/.');
    console.error('CLI dan APK memakai engine yang sama di bot-js/, dependensinya dipasang sekali di root.');
    process.exit(1);
  }
}

await import('./cli.mjs');
