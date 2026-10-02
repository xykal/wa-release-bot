// ============================================================================
//  wa-release-bot — engine bot (jalan di dalam app Android via nodejs-mobile)
//
//  Alur "bot tidur" (hemat batre):
//    - engine hidup di proses (ringan, hampir 0% CPU saat idle)
//    - tiap N menit → cek GitHub (1 request, ~1 detik)
//    - ada release baru → WA nyambung 2-5 detik → post ke channel → WA dilepas
//    - nggak ada update → tidur lagi
//
//  App <-> engine berkomunikasi lewat file bridge (events.jsonl / cmd.json)
//  + WebSocket fast path untuk perintah.
// ============================================================================

import os from 'node:os';
import dns from 'node:dns';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { createBridge } from './bridge.mjs';
import { pcmKeOgg } from './opus.mjs';
import { MPEGDecoder } from 'mpg123-decoder';
import { connectToWhatsApp, statusSesi } from './wa.mjs';
import { sambungDenganSocketJaga } from './wa-socket-share.mjs';
import { daftarRepo, teksRepo, sinkronState, ringkasTag, pendingAktif } from './repo.mjs';
import { buatHosting } from './hosting.mjs';
import { buatRilis } from './mesin/rilis.mjs';
import { buatLaguMood } from './mesin/lagu-mood.mjs';
import { buatPenjagaGrup } from './mesin/penjaga-grup.mjs';
import { buatRekamChannel } from './mesin/rekam-channel.mjs';
import { buatTautan } from './mesin/tautan.mjs';
import { buatPerintah } from './mesin/perintah.mjs';
import { buatJagaPesan } from './mesin/jaga-pesan.mjs';
import { buatPesanBerkala } from './mesin/pesan-berkala.mjs';

// ----------------------------- selftest ------------------------------------
async function selftest() {
  const tmp = fs.mkdtempSync('/tmp/warbot-test-');
  process.env.WR_DATA_DIR = tmp;
  console.log('SELFTEST: dataDir =', tmp);
  // voice note: libopus (WASM yang di-embed) + decoder MP3 harus bisa jalan
  const ogg = await pcmKeOgg(new Int16Array(48000));
  if (ogg.subarray(0, 4).toString('latin1') !== 'OggS' || ogg.length < 200) throw new Error('Opus/Ogg gagal');
  const dec = new MPEGDecoder(); await dec.ready; dec.free();
  console.log('SELFTEST: voice note OK (' + ogg.length + ' byte Ogg Opus)');
  const bridge = createBridge({ dataDir: tmp, wsPort: 0, log: (m) => console.log('  [bridge]', m), onCommand: (c) => {
    console.log('  [cmd diterima]', c);
    bridge.send({ type: 'selftest_cmd_ok', echo: c });
    bridge.close();
    setTimeout(() => { console.log('SELFTEST OK ✅'); process.exit(0); }, 200);
  }});
  bridge.send({ type: 'selftest_ping' });
  // tulis cmd lewat file, cek apakah polling bridge menangkapnya
  setTimeout(() => {
    fs.writeFileSync(bridge.cmdFile, JSON.stringify({ type: 'ping' }));
  }, 300);
  setTimeout(() => {
    console.log('SELFTEST GAGAL: cmd tidak masuk dalam 5s');
    process.exit(1);
  }, 5000);
}

if (process.argv.includes('--selftest')) {
  selftest().catch((e) => { console.error('SELFTEST ERROR:', e); process.exit(1); });
  // jangan lanjut ke main
  if (typeof module !== 'undefined') { /* keep cjs happy */ }
} else {
  main().catch((e) => {
    try { console.error('FATAL:', e.message); } catch { /* ignore */ }
    process.exit(1);
  });
}

// ----------------------------- main ----------------------------------------
// Semua keadaan bersama engine hidup di satu objek `ctx` yang dibagikan ke
// modul fitur di ./mesin (rilis, lagu mood, penjaga grup, tautan, perintah).
// Kenapa objek, bukan variabel closure seperti dulu: modul terpisah tidak bisa
// menulis `let` milik bot.mjs, sedangkan cfg/running/nextCheckAt memang harus
// bisa diubah dari mana saja. Fungsi yang stabil (log, saveState, ...) ikut
// ditaruh di ctx supaya modul cukup menerima satu argumen.
async function main() {
  const dataDir = process.env.WR_DATA_DIR;
  if (!dataDir) {
    console.error('WR_DATA_DIR belum di-set oleh app.');
    process.exit(1);
  }

  // ---- Jaring pengaman: Node JANGAN sampai exit() ----
  // nodejs-mobile jalan DI DALAM proses app. Kalau Node exit (process.exit
  // atau error yang nggak ketangkep), libc ngejalanin destructor global dan
  // ngancurin mutex yang masih dipakai thread Android → app force close
  // ("FORTIFY: pthread_mutex_lock called on a destroyed mutex", SIGABRT).
  // Jadi: error apa pun dicatat, engine tetap hidup.
  const fileFatal = path.join(dataDir, 'engine-fatal.log');
  const catatFatal = (jenis, e) => {
    const teks = `[${new Date().toISOString()}] ${jenis}: ${(e && e.stack) || e}`;
    try { fs.appendFileSync(fileFatal, teks.replace(/\s*\n\s*/g, ' ⏎ ') + '\n'); } catch { /* ignore */ }
    try { console.error(teks); } catch { /* ignore */ }
    try { logAman?.(`🩹 Error nyasar ketangkep (${jenis}): ${(e && e.message) || e} — engine tetap jalan.`); } catch { /* ignore */ }
  };
  let logAman = null;
  process.on('uncaughtException', (e) => catatFatal('uncaughtException', e));
  process.on('unhandledRejection', (e) => catatFatal('unhandledRejection', e));
  const exitAsli = process.exit.bind(process);
  process.exit = (kode) => {
    catatFatal('process.exit', new Error(`process.exit(${kode}) dicegah`));
  };
  void exitAsli;
  if (process.env.WR_TES_GALAT) { // cuma buat ngetes jaring pengaman ini
    setTimeout(() => { void Promise.reject(new Error('tes rejection')); }, 300);
    setTimeout(() => { throw new Error('tes throw'); }, 600);
    setTimeout(() => process.exit(3), 900);
  }
  let sisaFatal = '';
  try { sisaFatal = fs.readFileSync(fileFatal, 'utf8').trim(); fs.rmSync(fileFatal, { force: true }); } catch { /* belum ada */ }

  // Jaringan: pilih IPv4 dulu. Node 18 defaultnya ngikutin urutan DNS (IPv6
  // duluan kalau ada), dan belum otomatis pindah ke IPv4 kalau IPv6-nya
  // mati — di data seluler yang IPv6-nya ngadat, fetch ke Cloudflare /
  // SoundCloud jadi "fetch failed" (GitHub aman karena emang cuma IPv4).
  try { dns.setDefaultResultOrder('ipv4first'); } catch { /* ignore */ }
  try { if (typeof net.setDefaultAutoSelectFamily === 'function') net.setDefaultAutoSelectFamily(true); } catch { /* ignore */ }

  // Baileys nulis file sementara ke os.tmpdir() waktu upload media (audio
  // lagu ke channel). Di Android nggak ada /tmp. Ngeset env TMPDIR aja NGGAK
  // cukup: di nodejs-mobile os.tmpdir() tetep balikin '/tmp' (kebukti dari
  // log HP: "ENOENT … open '/tmp/audio…'"). Jadi fungsinya langsung diganti.
  const dirTmp = path.join(dataDir, 'tmp');
  try { fs.mkdirSync(dirTmp, { recursive: true }); } catch { /* ignore */ }
  process.env.TMPDIR = dirTmp;
  os.tmpdir = () => {
    try { fs.mkdirSync(dirTmp, { recursive: true }); } catch { /* ignore */ }
    return dirTmp;
  };
  // sisa file sementara dari engine sebelumnya
  try { for (const f of fs.readdirSync(dirTmp)) fs.rmSync(path.join(dirTmp, f), { force: true, recursive: true }); } catch { /* ignore */ }

  // Sisa file lagu dari engine sebelumnya (mis. mati pas lagi ngirim) → buang.
  const dirLaguTmp = path.join(dataDir, 'lagu-tmp');
  try { fs.rmSync(dirLaguTmp, { recursive: true, force: true }); } catch { /* ignore */ }

  // Sisa berkas stiker (foto masuk / WebP keluar, M14) dari sesi sebelumnya.
  // Dititipkan lewat folder ini, bukan base64 di bridge: WS bridge batasnya 1 MB.
  try { fs.rmSync(path.join(dataDir, 'stiker'), { recursive: true, force: true }); } catch { /* ignore */ }

  const cfgFile = path.join(dataDir, 'config.json');
  const stateFile = path.join(dataDir, 'state.json');
  const sessionDir = path.join(dataDir, 'session');

  const ctx = {
    dataDir, cfgFile, stateFile, sessionDir, dirLaguTmp,
    rekamExportDir: process.env.WR_REKAM_EXPORT_DIR || null,
    state: {
      lastTag: null, channelJid: null, channelName: null, postCount: 0, lastPostedAt: null,
      rilisEtag: null, // ETag jawaban GitHub terakhir -> cek berikutnya conditional (304 gratis)
      pending: null,   // { tag, percobaan, mulai } ditulis SEBELUM kirim, dihapus setelah sukses
      welcomeAktif: false, // opt-in agar grup nggak menerima sambutan tanpa persetujuan admin
      grup: null, // { target, jid, nama, anggota: [[id...]], hitam: [id...], disetujui, ditolak, lastCekAt }
      lagu: null, // { terkirim: [id...], count, lastAt, lastJudul }
    },
    cfg: null,
    running: false,
    busy: false,
    lastCheckAt: null,
    waConnected: false,
    nextCheckAt: null,
    nextGrupAt: null,
    nextLaguAt: null,
    timerLagu: null,
    bridge: null,
    hosting: null,
    fitur: null, // { rilis, lagu, grup, tautan, perintah } — diisi setelah modul dibuat
  };
  if (fs.existsSync(stateFile)) {
    try { ctx.state = { ...ctx.state, ...JSON.parse(fs.readFileSync(stateFile, 'utf8')) }; } catch { /* abaikan */ }
  }
  function saveState() {
    fs.writeFileSync(stateFile, JSON.stringify(ctx.state, null, 2));
  }
  if (fs.existsSync(cfgFile)) {
    try { ctx.cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8')); } catch { /* abaikan */ }
  }

  let timer = null;
  let timerGrup = null;

  // ----------------------------- bridge ------------------------------------
  // `bridge` sengaja di-`let` dan dicek null: createBridge() memanggil log()
  // secara sinkron (mis. waktu WS gagal start), sedangkan saat itu `bridge`
  // belum selesai di-assign.
  let bridge = null;

  function log(msg) {
    console.log(msg); // juga ke logcat (redirect dari native)
    try {
      bridge?.send({ type: 'log', msg, ts: Date.now() });
    } catch { /* bridge belum siap — log tetap ke console */ }
  }

  bridge = createBridge({
    dataDir,
    wsPort: Number(process.env.WR_WS_PORT || 18790),
    log,
    onCommand: (cmd) => {
      ctx.fitur.perintah.handleCommand(cmd).catch((e) => log('⚠️ Perintah ' + cmd?.type + ' gagal: ' + e.message));
    },
  });
  ctx.bridge = bridge;
  logAman = log;
  if (sisaFatal) {
    for (const baris of sisaFatal.split('\n').slice(-3)) log('🩹 Catatan error sebelumnya: ' + baris.slice(0, 600));
  }

  // Bot custom orang (worker_threads) — lihat hosting.mjs
  const hosting = buatHosting({ dataDir, log, kirim: (e) => bridge?.send(e) });
  ctx.hosting = hosting;

  // Bisa lebih dari satu repo ("a/x, b/y"); lihat repo.mjs.
  const repos = () => daftarRepo(ctx.cfg?.github?.repo);
  const repoAda = () => repos().length > 0;
  if (ctx.cfg && sinkronState(ctx.state, repos())) saveState(); // pindahkan state era satu repo
  const grupAktif = () => Boolean(ctx.cfg?.grup?.aktif && ctx.cfg?.grup?.target);
  const laguAktif = () => Boolean(ctx.cfg?.lagu?.aktif);

  function emitStatus() {
    const { state, cfg } = ctx;
    const g = state.grup || {};
    const rekamRingkas = ctx.fitur?.rekam?.ringkas?.();
    bridge.send({
      type: 'status',
      running: ctx.running,
      busy: ctx.busy,
      waLinked: statusSesi(sessionDir) === 'siap',
      waConnected: ctx.waConnected,
      lastTag: ringkasTag(state, repos()),
      lastPostedAt: state.lastPostedAt,
      postCount: state.postCount,
      pendingTag: pendingAktif(state, repos())?.tag || null,
      pendingPercobaan: pendingAktif(state, repos())?.percobaan || 0,
      lastCheckAt: ctx.lastCheckAt,
      nextCheckAt: ctx.nextCheckAt,
      channel: cfg?.whatsapp?.channel || null,
      channelName: state.channelName || null,
      repo: teksRepo(cfg?.github?.repo) || null,
      grupAktif: grupAktif(),
      grupNama: g.nama || null,
      grupDisetujui: g.disetujui || 0,
      grupDitolak: g.ditolak || 0,
      grupHitam: (g.hitam || []).length,
      grupLastCekAt: g.lastCekAt || null,
      nextGrupAt: ctx.nextGrupAt,
      laguAktif: laguAktif(),
      laguCount: state.lagu?.count || 0,
      laguLastAt: state.lagu?.lastAt || null,
      laguJudul: state.lagu?.lastJudul || null,
      laguJatah: state.lagu?.jatah?.pemasang || null, // "n/12" hari ini, dari Worker
      nextLaguAt: ctx.nextLaguAt,
      // Moderasi & perintah pribadi (mesin/jaga-pesan.mjs)
      jagaAktif: Boolean(ctx.cfg?.jaga?.moderasi || ctx.cfg?.jaga?.perintah),
      moderasiAktif: Boolean(ctx.cfg?.jaga?.moderasi),
      moderasiHapus: ctx.fitur?.jaga?.hitung?.().dihapus || 0,
      moderasiPeringatan: ctx.fitur?.jaga?.hitung?.().peringatan || 0,
      moderasiKick: ctx.fitur?.jaga?.hitung?.().kick || 0,
      perintahJalan: ctx.fitur?.jaga?.hitung?.().perintah || 0,
      stikerDibuat: ctx.fitur?.jaga?.hitung?.().stiker || 0,
      storyDikirim: ctx.fitur?.jaga?.hitung?.().story || 0,
      perangkat: ctx.perangkat?.ringkas || null,
      // pesan berkala (daftar hitam / teks sendiri)
      berkalaAktif: Boolean(ctx.cfg?.berkala?.aktif),
      berkalaJam: ctx.fitur?.berkala?.intervalJam?.() || null,
      // Mode isi: true = selalu daftar hitam (teks di app diabaikan).
      berkalaHitamSaja: Boolean(ctx.cfg?.berkala?.hitamSaja),
      berkalaCount: ctx.state.berkala?.count || 0,
      berkalaLastAt: ctx.state.berkala?.lastAt || null,
      berkalaTerakhir: ctx.state.berkala?.terakhir || null,
      nextBerkalaAt: ctx.nextBerkalaAt || null,
      // rekam postingan channel (buat fitur WA yang belum didukung Baileys)
      rekamChannelAktif: Boolean(rekamRingkas?.aktif),
      rekamChannelJumlah: rekamRingkas?.jumlah || 0,
      rekamChannelTerakhir: rekamRingkas?.terakhirStatus || null,
    });
  }

  // ------------------------- kunci koneksi WA ------------------------------
  // Posting, cek grup, setup — semuanya pakai WA. Kalau jalan barengan, dua
  // socket login pakai sesi yang sama → WA nendang salah satunya. Jadi
  // diantrikan satu-satu.
  let antrianWA = Promise.resolve();
  function pakaiWA(_nama, fn) {
    const giliran = antrianWA.then(fn, fn);
    antrianWA = giliran.catch(() => { /* error ditangani pemanggil */ });
    return giliran;
  }

  async function sambung(opsi = {}) {
    // Socket jaga pesan sudah login dengan sesi yang sama. Login kedua—misalnya
    // cek grup atau kirim berkala—membuat WA menutup salah satunya (code 440).
    // Tugas singkat nebeng socket persisten; hanya jaga-pesan yang boleh bikin
    // koneksi baru saat loop itu sedang membangun ulang socket-nya.
    const { lewatiSocketJaga = false, ...opsiWA } = opsi;
    if (!lewatiSocketJaga) {
      const bersama = await sambungDenganSocketJaga({
        pinjamSocket: () => ctx.fitur?.jaga?.pinjamSocket?.() || null,
        sambungBaru: async () => {
          const { sock, close } = await connectToWhatsApp({
            sessionDir, mode: 'none', onStatus: (m) => log(m), ...opsiWA,
          });
          return { sock, close: () => { ctx.waConnected = false; close(); emitStatus(); } };
        },
      });
      ctx.waConnected = true;
      emitStatus();
      return bersama;
    }
    const { sock, close } = await connectToWhatsApp({
      sessionDir, mode: 'none', onStatus: (m) => log(m), ...opsiWA,
    });
    ctx.waConnected = true;
    emitStatus();
    return {
      sock,
      close: () => { ctx.waConnected = false; close(); emitStatus(); },
    };
  }

  // ----------------------------- scheduler ---------------------------------
  function scheduleNext(delayMs) {
    clearTimeout(timer);
    if (!repoAda()) { ctx.nextCheckAt = null; return; }
    ctx.nextCheckAt = Date.now() + delayMs;
    emitStatus();
    timer = setTimeout(() => { void ctx.fitur.rilis.runCheck('jadwal'); }, delayMs);
  }

  function intervalMs() {
    const min = Number(ctx.cfg?.bot?.checkIntervalMinutes ?? 15);
    return Math.max(1, min) * 60_000;
  }

  function intervalGrupMs() {
    const min = Number(ctx.cfg?.grup?.intervalMinutes ?? 5);
    return Math.max(2, min) * 60_000;
  }

  function jadwalGrup(delayMs) {
    clearTimeout(timerGrup);
    if (!ctx.running || !grupAktif()) { ctx.nextGrupAt = null; return; }
    ctx.nextGrupAt = Date.now() + delayMs;
    timerGrup = setTimeout(() => { void ctx.fitur.grup.runGrup('jadwal'); }, delayMs);
  }

  function startEngine() {
    if (ctx.running) return;
    if (!ctx.cfg) {
      log('⚠️ Config belum di-set. Tekan "Simpan" di app dulu.');
      return;
    }
    ctx.running = true;
    const bagian = [];
    if (repoAda()) bagian.push(`cek release tiap ${Math.round(intervalMs() / 60000)} mnt`);
    if (grupAktif()) bagian.push(`jaga grup tiap ${Math.round(intervalGrupMs() / 60000)} mnt`);
    if (laguAktif()) bagian.push(`lagu mood ±${ctx.cfg.lagu.perHari}x/hari`);
    if (ctx.cfg.jaga?.moderasi) bagian.push('moderasi grup');
    if (ctx.cfg.berkala?.aktif) bagian.push(`pesan berkala tiap ${ctx.fitur.berkala.intervalJam()} jam`);
    if (ctx.cfg.jaga?.perintah) bagian.push('perintah pribadi di chat sendiri');
    log('▶️ Engine nyala: ' + (bagian.join(' + ') || 'belum ada tugas'));
    emitStatus();
    scheduleNext(3000);
    jadwalGrup(8000);
    ctx.fitur.lagu.jadwalLagu();
    ctx.fitur.berkala.jadwal(60_000);
    if (ctx.cfg.jaga?.moderasi || ctx.cfg.jaga?.perintah) void ctx.fitur.jaga.mulai();
  }

  function stopEngine() {
    ctx.running = false;
    ctx.fitur?.jaga?.hentikan();
    ctx.fitur?.berkala?.hentikan();
    clearTimeout(timer);
    clearTimeout(timerGrup);
    clearTimeout(ctx.timerLagu);
    ctx.nextCheckAt = null;
    ctx.nextGrupAt = null;
    ctx.nextLaguAt = null;
    log('⏸️ Engine jeda (istirahat). Tekan "Mulai" di app buat lanjut.');
    emitStatus();
  }

  // ----------------------------- modul fitur --------------------------------
  Object.assign(ctx, {
    log, saveState, emitStatus, pakaiWA, sambung,
    repos, repoAda, grupAktif, laguAktif,
    scheduleNext, intervalMs, intervalGrupMs, jadwalGrup, startEngine, stopEngine,
  });
  const rilis = buatRilis(ctx);
  const lagu = buatLaguMood(ctx, { rilis });
  const grup = buatPenjagaGrup(ctx);
  const berkala = buatPesanBerkala(ctx);
  const tautan = buatTautan(ctx, { rilis, grup });
  const rekam = buatRekamChannel(ctx);
  const jaga = buatJagaPesan(ctx, { rekam });
  const perintah = buatPerintah(ctx, { rilis, lagu, grup, tautan, jaga, berkala });
  ctx.fitur = { rilis, lagu, grup, tautan, perintah, jaga, berkala, rekam };

  // ----------------------------- init ---------------------------------------
  log('🦴 wa-release-bot engine siap (node ' + process.version + '). Menunggu perintah dari app.');
  emitStatus();
  try { hosting.init(); } catch (e) { log('⚠️ Hosting gagal init: ' + e.message); }

  if (ctx.cfg) {
    log('Config terbaca: repo=' + (teksRepo(ctx.cfg.github?.repo) || '-') + ', channel=' + (ctx.cfg.whatsapp?.channel || '-') +
      (ctx.cfg.grup?.aktif ? ', penjaga grup nyala' : ''));
    if (ctx.cfg._autoStart) startEngine();
  }
}
