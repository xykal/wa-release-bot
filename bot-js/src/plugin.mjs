// ============================================================================
//  Script bot (plugin) — file .js yang di-upload dari app ke folder
//  <dataDir>/plugins/. Formatnya CommonJS:
//
//    module.exports = {
//      nama: 'Sapa',
//      versi: '1.0',
//      deskripsi: 'Bales !halo',
//      perintah: {
//        '!halo': async (ctx) => ctx.balas(`Halo ${ctx.pengirim.nama}!`),
//      },
//      onPesan: async (ctx) => { ... },   // opsional: tiap pesan non-perintah
//      onJadwal: async (ctx) => { ... },  // opsional: tiap putaran jaga grup
//    };
//
//  ⚠️ Script jalan dengan akses penuh (Node.js + akun WA bot). Cuma pasang
//  script yang lo tulis sendiri / lo percaya. Dokumen: docs/PLUGIN.md.
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const BATAS_WAKTU = 15_000;

function denganBatas(janji, ms, apa) {
  let t;
  return Promise.race([
    Promise.resolve(janji).finally(() => clearTimeout(t)),
    new Promise((_, tolak) => { t = setTimeout(() => tolak(new Error(`${apa} kelamaan (>${ms / 1000} dtk)`)), ms); }),
  ]);
}

export function createPlugin({ dir, log = () => {} }) {
  /** @type {Array<{file:string,nama:string,versi:string,deskripsi:string,perintah:Record<string,Function>,onPesan?:Function,onJadwal?:Function,error?:string}>} */
  let daftar = [];

  function muat() {
    daftar = [];
    try { fs.mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
    let file = [];
    try {
      file = fs.readdirSync(dir).filter((f) => /\.c?js$/i.test(f)).sort();
    } catch { /* folder nggak kebaca */ }
    for (const f of file) {
      const full = path.join(dir, f);
      const item = { file: f, nama: f.replace(/\.c?js$/i, ''), versi: '', deskripsi: '', perintah: {} };
      try {
        const req = createRequire(full);
        try { delete req.cache[req.resolve(full)]; } catch { /* belum pernah dimuat */ }
        const mod = req(full);
        const p = mod?.default || mod;
        if (!p || typeof p !== 'object') throw new Error('module.exports harus objek');
        item.nama = String(p.nama || item.nama).slice(0, 40);
        item.versi = String(p.versi || '').slice(0, 20);
        item.deskripsi = String(p.deskripsi || '').slice(0, 200);
        for (const [k, fn] of Object.entries(p.perintah || {})) {
          if (typeof fn !== 'function') continue;
          const kunci = '!' + String(k).replace(/^[!./]/, '').toLowerCase();
          item.perintah[kunci] = fn;
        }
        if (typeof p.onPesan === 'function') item.onPesan = p.onPesan;
        if (typeof p.onJadwal === 'function') item.onJadwal = p.onJadwal;
        if (typeof p.onMuat === 'function') {
          try { p.onMuat({ log: (m) => log(`🧩 [${item.nama}] ${m}`) }); } catch (e) { log(`⚠️ [${item.nama}] onMuat error: ${e.message}`); }
        }
      } catch (e) {
        item.error = e.message;
        log(`⚠️ Script ${f} gagal dimuat: ${e.message}`);
      }
      daftar.push(item);
    }
    const ok = daftar.filter((d) => !d.error);
    if (daftar.length) {
      log(`🧩 Script bot dimuat: ${ok.length}/${daftar.length}` +
        (ok.length ? ` (${ok.map((d) => d.nama).join(', ')})` : ''));
    }
    return info();
  }

  function info() {
    return daftar.map((d) => ({
      file: d.file,
      nama: d.nama,
      versi: d.versi,
      deskripsi: d.deskripsi,
      perintah: Object.keys(d.perintah),
      error: d.error || null,
    }));
  }

  function cari(perintah) {
    for (const d of daftar) {
      if (!d.error && d.perintah[perintah]) return { plugin: d, fn: d.perintah[perintah] };
    }
    return null;
  }

  async function jalankan(plugin, fn, ctx, apa) {
    try {
      await denganBatas(fn(ctx), BATAS_WAKTU, `[${plugin.nama}] ${apa}`);
      return true;
    } catch (e) {
      log(`⚠️ Script [${plugin.nama}] ${apa} error: ${e.message}`);
      return false;
    }
  }

  return {
    muat,
    info,
    cari,
    jalankan,
    /** Semua perintah dari script (buat !menu). */
    semuaPerintah() {
      return daftar.filter((d) => !d.error).flatMap((d) => Object.keys(d.perintah).map((p) => ({ perintah: p, dari: d.nama })));
    },
    async onPesan(buatCtx) {
      for (const d of daftar) if (!d.error && d.onPesan) await jalankan(d, d.onPesan, buatCtx(d), 'onPesan');
    },
    async onJadwal(buatCtx) {
      for (const d of daftar) if (!d.error && d.onJadwal) await jalankan(d, d.onJadwal, buatCtx(d), 'onJadwal');
    },
    get jumlah() { return daftar.filter((d) => !d.error).length; },
  };
}
