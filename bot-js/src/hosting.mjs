// ============================================================================
//  Hosting bot custom — app jadi "rumah" buat project bot orang lain.
//
//  Project (ZIP) dibongkar sama app ke  <dataDir>/hosting/proyek/ . Di sini:
//    - cari file utama (package.json "main" / script "start" / index.js)
//    - kalau node_modules belum ada → dipasang pakai pasang-modul.mjs
//    - dijalanin di worker_threads, BUKAN di thread engine:
//        · process.exit() di bot orang cuma matiin worker-nya, bukan app
//        · error yang nggak ketangkep cuma nge-crash worker → bisa restart
//        · memori dibatesin (resourceLimits)
//
//  Node-nya ya Node bawaan app (nodejs-mobile 18). Versi Node cuma bisa naik
//  lewat update APK — binary Node nempel di APK dan Android nggak ngizinin
//  app nge-download lalu ngejalanin binary baru.
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { pasangModul } from './pasang-modul.mjs';

const MAKS_BARIS = 400;
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g; // eslint-disable-line no-control-regex

/** Cari file yang dijalanin, persis urutan yang biasanya dipakai orang. */
export function cariFileUtama(dir) {
  let pkg = null;
  try { pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')); } catch { /* nggak ada */ }
  const kandidat = [];
  const start = String(pkg?.scripts?.start || '');
  // "node index.js", "node --no-warnings src/main.mjs", "nodemon bot.js"
  const m = /(?:^|&&|;)\s*(?:node|nodemon|pm2 start)\s+(?:--?[\w-]+(?:=\S+)?\s+)*([^\s&;|]+\.(?:m?js|cjs))/.exec(start);
  if (m) kandidat.push(m[1]);
  if (pkg?.main) kandidat.push(pkg.main);
  kandidat.push('index.js', 'main.js', 'bot.js', 'app.js', 'index.mjs', 'src/index.js', 'src/main.js');
  for (const k of kandidat) {
    let f = path.resolve(dir, k);
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.js');
    if (!fs.existsSync(f) && !path.extname(f) && fs.existsSync(f + '.js')) f += '.js';
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return { file: f, pkg };
  }
  return { file: null, pkg };
}

/** .env sederhana: KEY=nilai, # komentar, tanda kutip dibuang. */
export function bacaEnv(teks) {
  const hasil = {};
  for (const baris of String(teks || '').split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(baris);
    if (!m) continue;
    let v = m[2];
    const kutip = /^(['"])(.*?)\1/.exec(v);
    if (kutip) v = kutip[2];
    else v = v.replace(/\s+#.*$/, '');
    hasil[m[1]] = v;
  }
  return hasil;
}

// Dijalanin di dalam worker sebelum kode bot orang. `Module.runMain` itu
// cara Node sendiri ngejalanin file utama → ESM & CommonJS sama-sama jalan,
// dan `require.main === module` di bot orang tetap bener.
const BOOTSTRAP = `
const { workerData, parentPort } = require('node:worker_threads');
// Tombol Stop di app = Ctrl+C: bot yang punya handler SIGINT bisa nutup rapi.
parentPort.on('message', (m) => { if (m && m.type === 'stop') { try { process.emit('SIGINT', 'SIGINT'); } catch {} } });
parentPort.unref();
try { if (!globalThis.crypto) globalThis.crypto = require('node:crypto').webcrypto; } catch {}
process.argv[1] = workerData.file;
process.on('unhandledRejection', (e) => { console.error('[unhandledRejection]', e && e.stack || e); });
require('node:module').runMain();
`;

export function buatHosting({ dataDir, log: _log, kirim }) {
  const akar = path.join(dataDir, 'hosting');
  const dirProyek = path.join(akar, 'proyek');
  const fileKonsol = path.join(akar, 'konsol.log');
  const fileState = path.join(akar, 'state.json');
  fs.mkdirSync(akar, { recursive: true });

  let status = 'kosong'; // kosong | siap | install | jalan | mati | error
  let pesan = '';
  let worker = null;
  let dihentikan = false;
  let mulaiPada = null;
  const riwayatRestart = [];
  let timerRestart = null;
  let batalInstall = null;
  const baris = [];
  let antreKirim = [];
  let timerKirim = null;

  let st = { autoJalan: false, autoRestart: true };
  try { st = { ...st, ...JSON.parse(fs.readFileSync(fileState, 'utf8')) }; } catch { /* baru */ }
  const simpan = () => { try { fs.writeFileSync(fileState, JSON.stringify(st)); } catch { /* ignore */ } };

  function konsol(teks, jenis = 'out') {
    const bersih = String(teks).replace(ANSI, '').replace(/\r/g, '');
    for (const b of bersih.split('\n')) {
      if (!b && jenis !== 'sys') continue;
      const item = { t: Date.now(), j: jenis, b };
      baris.push(item);
      if (baris.length > MAKS_BARIS) baris.shift();
      antreKirim.push(item);
      try { fs.appendFileSync(fileKonsol, `[${new Date().toISOString().slice(11, 19)}] ${b}\n`); } catch { /* ignore */ }
    }
    try { if (fs.statSync(fileKonsol).size > 1024 * 1024) fs.writeFileSync(fileKonsol, ''); } catch { /* ignore */ }
    // Dikumpulin dulu, dikirim per 400 ms — bot yang spam log nggak bikin app berat.
    if (!timerKirim) {
      timerKirim = setTimeout(() => {
        timerKirim = null;
        const kiriman = antreKirim.splice(0, 200);
        antreKirim = [];
        if (kiriman.length) kirim({ type: 'hosting_log', baris: kiriman });
      }, 400);
    }
  }
  const sys = (t) => konsol('» ' + t, 'sys');

  function info() {
    const { file, pkg } = fs.existsSync(dirProyek) ? cariFileUtama(dirProyek) : { file: null, pkg: null };
    return {
      ada: fs.existsSync(dirProyek) && fs.readdirSync(dirProyek).length > 0,
      nama: pkg?.name || null,
      versi: pkg?.version || null,
      file: file ? path.relative(dirProyek, file) : null,
      punyaModul: fs.existsSync(path.join(dirProyek, 'node_modules')),
      jumlahDep: Object.keys(pkg?.dependencies || {}).length,
    };
  }

  function emit() {
    kirim({
      type: 'hosting_status',
      status,
      pesan,
      node: process.version,
      mulaiPada,
      autoJalan: st.autoJalan,
      autoRestart: st.autoRestart,
      ...info(),
    });
  }

  function setStatus(s, p = '') { status = s; pesan = p; emit(); }

  function statusDasar() {
    const i = info();
    if (!i.ada) return setStatus('kosong', 'Belum ada project. Upload ZIP project bot lo.');
    if (!i.file) return setStatus('error', 'File utama nggak ketemu (isi "main" di package.json, atau bikin index.js).');
    if (i.jumlahDep && !i.punyaModul) return setStatus('siap', 'node_modules belum ada — tekan Pasang modul (atau langsung Jalankan).');
    return setStatus('siap', `Siap dijalanin: ${i.file}`);
  }

  async function pasang() {
    if (status === 'install') return;
    if (worker) { sys('Stop bot-nya dulu sebelum pasang modul.'); return; }
    const i = info();
    if (!i.ada) { statusDasar(); return; }
    setStatus('install', 'Lagi pasang modul…');
    batalInstall = { aktif: false };
    let terakhir = 0;
    try {
      await pasangModul(dirProyek, {
        log: (m) => sys(m),
        batal: batalInstall,
        progres: ({ selesai, total, nama }) => {
          if (Date.now() - terakhir < 700) return;
          terakhir = Date.now();
          pesan = `Pasang modul ${selesai}/${total} — ${nama}`;
          emit();
        },
      });
      statusDasar();
    } catch (e) {
      sys('Pasang modul gagal: ' + e.message);
      setStatus('error', 'Pasang modul gagal: ' + e.message);
    } finally {
      batalInstall = null;
    }
  }

  async function mulai({ otomatis = false } = {}) {
    if (worker || status === 'install') return;
    clearTimeout(timerRestart);
    const i = info();
    if (!i.ada || !i.file) { statusDasar(); return; }
    if (i.jumlahDep && !i.punyaModul) {
      sys('node_modules belum ada — dipasang dulu otomatis.');
      await pasang();
      if (status !== 'siap') return;
    }
    const { file } = cariFileUtama(dirProyek);
    let envFile = {};
    try { envFile = bacaEnv(fs.readFileSync(path.join(dirProyek, '.env'), 'utf8')); } catch { /* opsional */ }

    // Banyak bot nyimpen sesi pakai path relatif ('./session') → cwd harus
    // folder project. Engine sendiri selalu pakai path absolut, jadi aman.
    try { process.chdir(dirProyek); } catch (e) { sys('Gagal pindah folder: ' + e.message); }

    dihentikan = false;
    sys(`Menjalankan ${path.relative(dirProyek, file)} pakai Node ${process.version}${otomatis ? ' (otomatis)' : ''}…`);
    try {
      worker = new Worker(BOOTSTRAP, {
        eval: true,
        workerData: { file },
        stdin: true,
        stdout: true,
        stderr: true,
        env: { ...process.env, ...envFile, WR_HOSTING: '1' },
        resourceLimits: { maxOldGenerationSizeMb: 320 },
      });
    } catch (e) {
      worker = null;
      setStatus('error', 'Gagal nyalain worker: ' + e.message);
      return;
    }
    mulaiPada = Date.now();
    st.autoJalan = true;
    simpan();
    setStatus('jalan', `Jalan: ${path.relative(dirProyek, file)}`);

    const w = worker;
    w.stdout.setEncoding('utf8');
    w.stderr.setEncoding('utf8');
    w.stdout.on('data', (d) => konsol(d, 'out'));
    w.stderr.on('data', (d) => konsol(d, 'err'));
    w.on('error', (e) => { konsol('💥 ' + (e?.stack || e), 'err'); });
    w.on('exit', (kode) => {
      if (worker !== w) return;
      worker = null;
      mulaiPada = null;
      try { process.chdir(dataDir); } catch { /* ignore */ }
      if (dihentikan) { sys('Bot dihentikan.'); setStatus('mati', 'Dihentikan.'); return; }
      sys(`Bot berhenti sendiri (kode ${kode}).`);
      if (!st.autoRestart) { setStatus('mati', `Berhenti (kode ${kode}).`); return; }
      // Restart otomatis, jedanya makin lama; kalau crash terus → nyerah.
      const kini = Date.now();
      while (riwayatRestart.length && kini - riwayatRestart[0] > 10 * 60_000) riwayatRestart.shift();
      if (riwayatRestart.length >= 5) {
        setStatus('error', 'Crash 5x dalam 10 menit — restart otomatis distop. Cek konsol.');
        return;
      }
      riwayatRestart.push(kini);
      const jeda = [5, 15, 30, 60, 120][riwayatRestart.length - 1] * 1000;
      setStatus('mati', `Crash (kode ${kode}) — nyala lagi dalam ${jeda / 1000} dtk.`);
      timerRestart = setTimeout(() => { void mulai({ otomatis: true }); }, jeda);
    });
  }

  async function stop({ lupakan = true } = {}) {
    clearTimeout(timerRestart);
    if (batalInstall) batalInstall.aktif = true;
    if (lupakan) { st.autoJalan = false; simpan(); }
    if (!worker) { statusDasar(); return; }
    dihentikan = true;
    const w = worker;
    // Kasih kesempatan bot nutup sendiri (SIGINT ala Ctrl+C) sebelum dipaksa.
    try { w.postMessage({ type: 'stop' }); } catch { /* ignore */ }
    await new Promise((r) => setTimeout(r, 1500));
    await Promise.race([w.terminate(), new Promise((r) => setTimeout(r, 5000))]);
  }

  function input(teks) {
    if (!worker) { sys('Bot lagi nggak jalan — input nggak kekirim.'); return; }
    konsol('> ' + teks, 'in');
    try { worker.stdin.write(String(teks) + '\n'); } catch (e) { sys('Gagal kirim input: ' + e.message); }
  }

  async function hapus() {
    await stop();
    fs.rmSync(dirProyek, { recursive: true, force: true });
    try { fs.writeFileSync(fileKonsol, ''); } catch { /* ignore */ }
    baris.length = 0;
    sys('Project dihapus.');
    statusDasar();
  }

  function atur({ autoRestart }) {
    if (typeof autoRestart === 'boolean') st.autoRestart = autoRestart;
    simpan();
    emit();
  }

  function kirimRiwayat() {
    kirim({ type: 'hosting_log', baris: baris.slice(-MAKS_BARIS), penuh: true });
    emit();
  }

  /** Dipanggil sekali pas engine nyala: lanjutin bot yang tadinya jalan. */
  function init() {
    statusDasar();
    if (st.autoJalan && status === 'siap') {
      sys('Engine nyala lagi → bot custom dilanjutin.');
      setTimeout(() => { void mulai({ otomatis: true }); }, 4000);
    }
  }

  async function perintah(cmd) {
    switch (cmd.type) {
      case 'hosting-status': kirimRiwayat(); break;
      case 'hosting-cek': sys('Project baru masuk.'); statusDasar(); break;
      case 'hosting-pasang': await pasang(); break;
      case 'hosting-mulai': await mulai(); break;
      case 'hosting-stop': await stop(); break;
      case 'hosting-restart': await stop({ lupakan: false }); await mulai(); break;
      case 'hosting-input': input(cmd.teks || ''); break;
      case 'hosting-hapus': await hapus(); break;
      case 'hosting-atur': atur(cmd); break;
      default: return false;
    }
    return true;
  }

  return { perintah, init, stop, dirProyek, get jalan() { return Boolean(worker); } };
}
