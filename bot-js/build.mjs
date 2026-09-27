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

// ---------------------------------------------------------------------------
//  Tambalan Baileys 6.7.24 (dipasang waktu bundling, node_modules nggak diubah)
//
//  Grup WA sekarang banyak yang pakai "LID" (ID samaran, bukan nomor HP).
//  Baileys 6.7.24 ngenkripsi pesan grup pakai identitas NOMOR kita walaupun
//  grupnya LID → HP anggota nyari kunci pengirim pakai LID kita, nggak ketemu,
//  pesannya cuma jadi "Menunggu pesan ini". Baileys 7 udah benerin ini
//  (groupSenderIdentity = meLid kalau grupnya LID), tapi Baileys 7 butuh
//  Node 20 — sedangkan nodejs-mobile mentok di Node 18. Jadi baris yang sama
//  ditambal di sini.
// ---------------------------------------------------------------------------
const TAMBALAN = [
  {
    file: /baileys[\\/]lib[\\/]Socket[\\/]messages-send\.js$/,
    cari: `                    data: bytes,
                    meId
                });`,
    ganti: `                    data: bytes,
                    // [wa-release-bot] grup LID → kunci pengirim pakai LID kita (sama kayak Baileys 7)
                    meId: (groupData?.addressingMode === 'lid' && authState.creds.me?.lid) ? authState.creds.me.lid : meId
                });`,
  },
];

const tambalBaileys = {
  name: 'tambal-baileys',
  setup(build) {
    for (const t of TAMBALAN) {
      build.onLoad({ filter: t.file }, (args) => {
        const asli = readFileSync(args.path, 'utf8');
        if (!asli.includes(t.cari)) {
          throw new Error(`Tambalan Baileys nggak nemu baris targetnya di ${args.path} — versi Baileys berubah? Cek build.mjs.`);
        }
        t.kepakai = true;
        return { contents: asli.replace(t.cari, t.ganti), loader: 'js' };
      });
    }
  },
};

const result = await esbuild.build({
  plugins: [tambalBaileys],
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
  // Buang komentar lisensi pihak ketiga dari bundle — memangkas ukuran APK.
  // (Atribusi lisensi tetap ada di THIRD_PARTY_LICENSES.md repo ini.)
  legalComments: 'none',
  logLevel: 'info',
  metafile: true,
});

if (result.errors.length) process.exit(1);
for (const t of TAMBALAN) {
  if (!t.kepakai) {
    console.error('❌ Tambalan Baileys nggak kepasang:', t.file);
    process.exit(1);
  }
}
console.log(`✅ Tambalan Baileys kepasang (${TAMBALAN.length}).`);

const size = statSync('dist/bundle.cjs').size;
console.log(`✅ Bundle selesai: dist/bundle.cjs (${(size / 1024 / 1024).toFixed(1)} MB)`);

// Sanity check: pastikan polyfill benar-benar ke-inject di baris awal.
const head = readFileSync('dist/bundle.cjs', 'utf8').slice(0, 4000);
if (!head.includes('installWebCryptoPolyfill')) {
  console.error('❌ Polyfill WebCrypto tidak masuk ke bundle — cek banner di build.mjs');
  process.exit(1);
}
console.log('✅ Polyfill WebCrypto terpasang di banner bundle.');
