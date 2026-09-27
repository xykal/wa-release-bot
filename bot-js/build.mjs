// ============================================================================
//  Bundel engine bot jadi SATU file CJS (dist/bundle.cjs) yang di-asset ke APK.
//
//  Catatan penting:
//   - `target: node18` karena nodejs-mobile terakhir cuma sampai Node 18.20.4
//   - banner WebCrypto polyfill WAJIB (lihat polyfills/webcrypto.cjs)
//   - TLA (top-level await) tidak boleh dipakai: output CJS tidak mendukungnya.
//     Kalau perlu await, bungkus dalam fungsi async dan panggil dari `main()`.
// ============================================================================
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import esbuild from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const banner = readFileSync(path.join(here, 'polyfills/webcrypto.cjs'), 'utf8');

const result = await esbuild.build({
  entryPoints: ['src/bot.mjs'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  outfile: 'dist/bundle.cjs',
  // Dependensi opsional Baileys (sharp native + jimp/qrcode-terminal/link-preview)
  // tidak bisa / tidak perlu di-embed → semua di-stub
  alias: {
    sharp: './sharp-stub.cjs',
    'qrcode-terminal': './optional-stub.cjs',
    jimp: './optional-stub.cjs',
    'link-preview-js': './optional-stub.cjs',
  },
  banner: { js: banner },
  // libopus WASM (buat voice note lagu) di-embed ke bundle — lihat src/opus.mjs
  plugins: [{
    name: 'opus-wasm',
    setup(b) {
      b.onResolve({ filter: /^virtual:opus-wasm$/ }, () => ({ path: 'opus-wasm', namespace: 'opus-wasm' }));
      b.onLoad({ filter: /.*/, namespace: 'opus-wasm' }, () => ({
        contents: readFileSync(path.join(here, 'node_modules/opusscript/build/opusscript_native_wasm.wasm')),
        loader: 'binary',
      }));
    },
  }],
  // Buang komentar lisensi pihak ketiga dari bundle — memangkas ukuran APK.
  // (Atribusi lisensi tetap ada di THIRD_PARTY_LICENSES.md repo ini.)
  legalComments: 'none',
  logLevel: 'info',
  metafile: true,
});

if (result.errors.length) process.exit(1);

const size = statSync('dist/bundle.cjs').size;
console.log(`✅ Bundle selesai: dist/bundle.cjs (${(size / 1024 / 1024).toFixed(1)} MB)`);

// Sanity check: pastikan polyfill benar-benar ke-inject di baris awal.
const head = readFileSync('dist/bundle.cjs', 'utf8').slice(0, 4000);
if (!head.includes('installWebCryptoPolyfill')) {
  console.error('❌ Polyfill WebCrypto tidak masuk ke bundle — cek banner di build.mjs');
  process.exit(1);
}
console.log('✅ Polyfill WebCrypto terpasang di banner bundle.');
