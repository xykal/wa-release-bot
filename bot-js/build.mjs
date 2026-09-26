// Bundel engine bot jadi SATU file CJS (dist/bundle.cjs) yang di-asset ke APK.
import esbuild from 'esbuild';

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
  logLevel: 'info',
  banner: {
    js: '// wa-release-bot bundle — dibangun otomatis oleh esbuild. Jangan edit manual.',
  },
});

if (result.errors.length) process.exit(1);
console.log('✅ Bundle selesai: dist/bundle.cjs');
