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
import { randomUUID } from 'node:crypto';
import { createBridge } from './bridge.mjs';
import { mp3KeVoiceNote, pcmKeOgg } from './opus.mjs';
import { MPEGDecoder } from 'mpg123-decoder';
import { fetchLatestRelease } from './github.mjs';
import { connectToWhatsApp, resolveChannel, sendText, kirimKeChannel as kirimWA, pakaiPertanyaan, statusSesi, hapusSesi, laporKeDiri } from './wa.mjs';
import { putuskanRilis, pendingBerikut, MAKS_PERCOBAAN } from './rilis.mjs';
import { daftarRepo, repoTidakValid, teksRepo, stateRepo, sinkronState, ringkasTag, pendingAktif } from './repo.mjs';
import { bikinChannel, linkChannel, bacaTarget, JENIS } from './channel.mjs';
import { normalisasiNomor } from './nomor.mjs';
import {
  identitas,
  cariYangKeluar,
  catatAnggota,
  putuskan,
  daftarHitamManual,
  namaOrang,
  kelompokHitam,
  bukaBlokir,
} from './grup.mjs';
import { formatReleasePost, formatTestMessage, formatTesGrup, formatLaporGagal } from './format.mjs';
import { SUMBER_BAWAAN, jadwalBerikut, formatKataLagu, ambilBerikut, ambilBatas, downloadPotongan } from './lagu.mjs';
import { buatHosting } from './hosting.mjs';

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

  const cfgFile = path.join(dataDir, 'config.json');
  const stateFile = path.join(dataDir, 'state.json');
  const sessionDir = path.join(dataDir, 'session');

  let state = {
    lastTag: null, channelJid: null, channelName: null, postCount: 0, lastPostedAt: null,
    rilisEtag: null, // ETag jawaban GitHub terakhir -> cek berikutnya conditional (304 gratis)
    pending: null,   // { tag, percobaan, mulai } ditulis SEBELUM kirim, dihapus setelah sukses
    grup: null, // { target, jid, nama, anggota: [[id...]], hitam: [id...], disetujui, ditolak, lastCekAt }
    lagu: null, // { terkirim: [id...], count, lastAt, lastJudul }
  };
  if (fs.existsSync(stateFile)) {
    try { state = { ...state, ...JSON.parse(fs.readFileSync(stateFile, 'utf8')) }; } catch { /* abaikan */ }
  }
  function saveState() {
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
  }

  let cfg = null;
  if (fs.existsSync(cfgFile)) {
    try { cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8')); } catch { /* abaikan */ }
  }

  let running = false;
  let busy = false;
  let lastCheckAt = null;
  let waConnected = false;
  let nextCheckAt = null;
  let nextGrupAt = null;
  let timer = null;
  let timerGrup = null;
  let timerLagu = null;
  let nextLaguAt = null;

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
    onCommand: (cmd) => { handleCommand(cmd).catch((e) => log('⚠️ Perintah ' + cmd?.type + ' gagal: ' + e.message)); },
  });
  logAman = log;
  if (sisaFatal) {
    for (const baris of sisaFatal.split('\n').slice(-3)) log('🩹 Catatan error sebelumnya: ' + baris.slice(0, 600));
  }

  // Bot custom orang (worker_threads) — lihat hosting.mjs
  const hosting = buatHosting({ dataDir, log, kirim: (e) => bridge?.send(e) });

  // Bisa lebih dari satu repo ("a/x, b/y"); lihat repo.mjs.
  const repos = () => daftarRepo(cfg?.github?.repo);
  const repoAda = () => repos().length > 0;
  if (cfg && sinkronState(state, repos())) saveState(); // pindahkan state era satu repo
  const grupAktif = () => Boolean(cfg?.grup?.aktif && cfg?.grup?.target);
  const laguAktif = () => Boolean(cfg?.lagu?.aktif);

  function emitStatus() {
    const g = state.grup || {};
    bridge.send({
      type: 'status',
      running,
      busy,
      waLinked: statusSesi(sessionDir) === 'siap',
      waConnected,
      lastTag: ringkasTag(state, repos()),
      lastPostedAt: state.lastPostedAt,
      postCount: state.postCount,
      pendingTag: pendingAktif(state, repos())?.tag || null,
      pendingPercobaan: pendingAktif(state, repos())?.percobaan || 0,
      lastCheckAt,
      nextCheckAt,
      channel: cfg?.whatsapp?.channel || null,
      channelName: state.channelName || null,
      repo: teksRepo(cfg?.github?.repo) || null,
      grupAktif: grupAktif(),
      grupNama: g.nama || null,
      grupDisetujui: g.disetujui || 0,
      grupDitolak: g.ditolak || 0,
      grupHitam: (g.hitam || []).length,
      grupLastCekAt: g.lastCekAt || null,
      nextGrupAt,
      laguAktif: laguAktif(),
      laguCount: state.lagu?.count || 0,
      laguLastAt: state.lagu?.lastAt || null,
      laguJudul: state.lagu?.lastJudul || null,
      laguJatah: state.lagu?.jatah?.pemasang || null, // "n/12" hari ini, dari Worker
      nextLaguAt,
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
    const { sock, close } = await connectToWhatsApp({
      sessionDir,
      mode: 'none',
      onStatus: (m) => log(m),
      ...opsi,
    });
    waConnected = true;
    emitStatus();
    return {
      sock,
      close: () => { waConnected = false; close(); emitStatus(); },
    };
  }

  // ----------------------------- scheduler ---------------------------------
  function scheduleNext(delayMs) {
    clearTimeout(timer);
    if (!repoAda()) { nextCheckAt = null; return; }
    nextCheckAt = Date.now() + delayMs;
    emitStatus();
    timer = setTimeout(() => { void runCheck('jadwal'); }, delayMs);
  }

  function intervalMs() {
    const min = Number(cfg?.bot?.checkIntervalMinutes ?? 15);
    return Math.max(1, min) * 60_000;
  }

  function intervalGrupMs() {
    const min = Number(cfg?.grup?.intervalMinutes ?? 5);
    return Math.max(2, min) * 60_000;
  }

  function jadwalGrup(delayMs) {
    clearTimeout(timerGrup);
    if (!running || !grupAktif()) { nextGrupAt = null; return; }
    nextGrupAt = Date.now() + delayMs;
    timerGrup = setTimeout(() => { void runGrup('jadwal'); }, delayMs);
  }

  // ----------------------------- lagu mood --------------------------------
  function jadwalLagu(paksaMs) {
    clearTimeout(timerLagu);
    if (!running || !laguAktif()) { nextLaguAt = null; return; }
    const kini = Date.now();
    nextLaguAt = paksaMs != null ? kini + paksaMs : jadwalBerikut(kini, {
      perHari: cfg.lagu.perHari,
      jamMulai: cfg.lagu.jamMulai,
      jamSelesai: cfg.lagu.jamSelesai,
      tzMenit: cfg.lagu.tzMenit,
    });
    // setTimeout maksimal ~24,8 hari; jadwal lagu nggak pernah selama itu
    timerLagu = setTimeout(() => { void runLagu('mood'); }, Math.max(1000, nextLaguAt - kini));
    emitStatus();
  }

  let laguSibuk = false;
  async function runLagu(source) {
    if (laguSibuk) return;
    if (!cfg?.whatsapp?.channel) {
      log('🎵 Lagu mood nyala, tapi "Channel WA" masih kosong — nggak ada tujuan.');
      if (source !== 'manual') jadwalLagu();
      return;
    }
    laguSibuk = true;
    const sumber = cfg.lagu?.sumber || SUMBER_BAWAAN;
    let file = null;
    try {
      log(`🎵 Lagi mood nih… minta lagu ke Cloudflare (${source}).`);
      if (!state.pemasangId) { state.pemasangId = randomUUID(); saveState(); }
      const lagu = await ambilBerikut(sumber, { pemasang: state.pemasangId }).catch((e) => {
        throw new Error('minta lagu ke Cloudflare gagal: ' + e.message, { cause: e });
      });
      const { data, detik } = await downloadPotongan(lagu.url, lagu).catch((e) => {
        throw new Error(`download potongan "${lagu.judul}" gagal: ` + e.message, { cause: e });
      });
      // File sementara — langsung dihapus begitu kekirim (atau gagal).
      log(`🎵 Dapet: ${lagu.judul} — ${lagu.artis} (potongan ${detik} dtk, ${Math.round(data.length / 1024)} KB)`);
      // Saluran WA cuma nerima voice note (Ogg Opus) — MP3 biasa tampil
      // "tidak didukung". Jadi diubah dulu di HP (WASM, tanpa ffmpeg).
      // (Nggak ada cadangan MP3: di saluran MP3 cuma bakal jadi "tidak didukung".)
      const t0 = Date.now();
      const vn = await mp3KeVoiceNote(data).catch((e) => {
        throw new Error('gagal ngubah ke voice note: ' + e.message, { cause: e });
      });
      const isi = vn.data;
      const pesanAudio = { mimetype: 'audio/ogg; codecs=opus', seconds: vn.detik, ptt: true };
      log(`🎙️ Diubah jadi voice note (${Math.round(isi.length / 1024)} KB, ${((Date.now() - t0) / 1000).toFixed(1)} dtk).`);
      fs.mkdirSync(dirLaguTmp, { recursive: true });
      file = path.join(dirLaguTmp, `lagu-${Date.now()}.ogg`);
      fs.writeFileSync(file, isi);
      await pakaiWA('lagu', async () => {
        const { sock, close } = await sambung();
        try {
          const jid = await cariTarget(sock);
          await sendText(sock, jid, formatKataLagu(lagu));
          await sock.sendMessage(jid, { audio: { url: file }, ...pesanAudio });
          // Kasih napas bentar sebelum socket ditutup: upload/ack yang masih
          // jalan di belakang kalau diputus paksa suka lempar "Connection Closed".
          await new Promise((r) => setTimeout(r, 3000));
        } finally {
          close();
        }
      });
      state.lagu = state.lagu || { count: 0 };
      state.lagu.count = (state.lagu.count || 0) + 1;
      state.lagu.lastAt = new Date().toISOString();
      state.lagu.lastJudul = `${lagu.judul} — ${lagu.artis}`;
      delete state.lagu.terkirim;
      saveState();
      log(`✅ Lagu terkirim ke channel: ${lagu.judul} (lagu ke-${state.lagu.count})`);
      bridge.send({ type: 'lagu_terkirim', judul: state.lagu.lastJudul });
    } catch (e) {
      log(`⚠️ Kirim lagu gagal: ${e.message}`);
    } finally {
      if (file) {
        try { fs.rmSync(file, { force: true }); log('🧹 File lagu dihapus dari HP.'); } catch { /* ignore */ }
      }
      // Sisa jatah hari ini buat ditampilkan di app; gagal pun tidak apa-apa.
      try {
        const b = await ambilBatas(sumber, { pemasang: state.pemasangId });
        state.lagu = { ...(state.lagu || { count: 0 }), jatah: { hari: b.hari, pemasang: b.pemasang, global: b.global } };
        saveState();
      } catch { /* opsional */ }
      laguSibuk = false;
      if (source !== 'manual' || running) jadwalLagu();
      emitStatus();
    }
  }

  function startEngine() {
    if (running) return;
    if (!cfg) {
      log('⚠️ Config belum di-set. Tekan "Simpan" di app dulu.');
      return;
    }
    running = true;
    const bagian = [];
    if (repoAda()) bagian.push(`cek release tiap ${Math.round(intervalMs() / 60000)} mnt`);
    if (grupAktif()) bagian.push(`jaga grup tiap ${Math.round(intervalGrupMs() / 60000)} mnt`);
    if (laguAktif()) bagian.push(`lagu mood ±${cfg.lagu.perHari}x/hari`);
    log('▶️ Engine nyala: ' + (bagian.join(' + ') || 'belum ada tugas'));
    emitStatus();
    scheduleNext(3000);
    jadwalGrup(8000);
    jadwalLagu();
  }

  function stopEngine() {
    running = false;
    clearTimeout(timer);
    clearTimeout(timerGrup);
    clearTimeout(timerLagu);
    nextCheckAt = null;
    nextGrupAt = null;
    nextLaguAt = null;
    log('⏸️ Engine jeda (istirahat). Tekan "Mulai" di app buat lanjut.');
    emitStatus();
  }

  // ----------------------------- cek & post --------------------------------
  async function runCheck(source) {
    if (busy || !cfg || !repoAda()) return;
    busy = true;
    lastCheckAt = Date.now();
    emitStatus();
    const manual = source === 'manual';
    try {
      // Berurutan, bukan Promise.all: satu socket WA saja yang boleh hidup,
      // dan repo yang error tidak boleh menggagalkan repo lain.
      for (const repo of repos()) {
        try {
          await cekSatuRepo(repo, { source, manual });
        } catch (e) {
          log(`⚠️ Gagal cek ${repo}: ${e.message}`);
        }
      }
    } finally {
      busy = false;
      if (running) scheduleNext(intervalMs());
      else nextCheckAt = null;
      emitStatus();
    }
  }

  async function cekSatuRepo(repo, { source, manual }) {
    const st = stateRepo(state, repo);
    const nama = repos().length > 1 ? `${repo}: ` : '';
    log(`👀 Cek GitHub ${repo} ... (trigger: ${source})`);
    const rel = await fetchLatestRelease(repo, {
      token: cfg.github?.token || '',
      includePrereleases: Boolean(cfg.github?.includePrereleases),
      etag: st.rilisEtag || '',
    });
    if (!rel.notModified && rel.etag && rel.etag !== st.rilisEtag) {
      st.rilisEtag = rel.etag;
      saveState();
    }

    const { aksi, alasan } = putuskanRilis({ state: st, rel, postOnFirstRun: Boolean(cfg.bot?.postOnFirstRun), manual });
    switch (aksi) {
      case 'tidur':
        log(`😴 ${nama}Nggak ada update (${alasan}). Bot tidur lagi.`);
        return;
      case 'baseline':
        st.lastTag = rel.tag;
        saveState();
        log(`🌱 ${nama}First run. Baseline dicatat: ${rel.tag}. Baru post kalau ada yang lebih baru.`);
        return;
      case 'rollback':
        st.lastTag = rel.tag;
        st.pending = null;
        saveState();
        log(`↩️ ${nama}Release terbaru di GitHub sekarang ${rel.tag} (${alasan}) — dianggap rollback, nggak diumumkan.`);
        return;
      case 'lewati-gagal':
        log(`⏭️ ${nama}${alasan}. Dilewati sampai lo tekan "Cek sekarang" (itu ngulang dari nol).`);
        return;
      default:
        log(st.lastTag ? `🚀 ${nama}ADA RELEASE BARU! ${alasan}` : `✨ ${nama}${alasan} → posting release yang sedang ada.`);
        await postRelease(repo, st, rel, { manual });
    }
  }

  /**
   * Cari JID channel/grup tujuan posting. Hasilnya di-cache di state supaya
   * nggak query WhatsApp terus tiap mau posting.
   */
  async function cariTarget(sock) {
    let jid = state.channelJid;
    if (jid) return jid;

    const hasil = await resolveChannel(sock, cfg.whatsapp.channel, log);
    jid = hasil.jid;
    state.channelJid = jid;
    state.channelName = hasil.nama;
    saveState();

    const subs = hasil.subscribers != null ? `, ${hasil.subscribers} subscriber` : '';
    log(`📡 Target ketemu: ${hasil.nama || '(tanpa nama)'} → ${jid}${subs}`);
    if (hasil.jenis === JENIS.GRUP) log('ℹ️ Target-nya GRUP WA, bukan channel. Pesan bakal masuk ke grup itu.');
    return jid;
  }

  // Format pesan ke channel: default 'teks'. 'pertanyaan' opt-in dari setelan
  // app — formatnya belum terbukti (lihat catatan di wa.mjs sendPertanyaan).
  const formatPertanyaan = () => cfg?.whatsapp?.format === 'pertanyaan';

  async function kirimKeChannel(sock, jid, text) {
    await kirimWA(sock, jid, text, { format: formatPertanyaan() ? 'pertanyaan' : 'teks', log });
  }
  const ajak = (jid) => ({ ajakBalas: pakaiPertanyaan(jid, formatPertanyaan() ? 'pertanyaan' : 'teks') });

  async function postRelease(repo, st, rel, { manual = false } = {}) {
    if (!cfg.whatsapp?.channel) {
      log('⚠️ Ada release baru tapi "Channel WA" masih kosong — nggak ada tujuan posting.');
      return;
    }
    // Write-ahead: kalau proses mati di tengah kirim, cek berikutnya tahu
    // percobaan ke berapa ini dan berhenti setelah MAKS_PERCOBAAN.
    st.pending = pendingBerikut(st.pending, rel.tag, { manual });
    saveState();
    const ke = st.pending.percobaan;
    if (ke > 1) log(`🔁 Kirim ${repo} ${rel.tag} percobaan ke-${ke} dari ${MAKS_PERCOBAAN}.`);
    try {
      await pakaiWA('posting', async () => {
        const { sock, close } = await sambung();
        try {
          try {
            const jid = await cariTarget(sock);
            await kirimKeChannel(sock, jid, formatReleasePost(rel, repo, ajak(jid)));
          } catch (e) {
            // Percobaan terakhir gagal: channel tidak dapat pesan, tapi pemilik
            // bot dikasih tahu lewat chat ke diri sendiri (socket masih ada).
            if (ke >= MAKS_PERCOBAAN) {
              await laporKeDiri(sock, formatLaporGagal({ tag: rel.tag, repo, percobaan: ke, maks: MAKS_PERCOBAAN, error: e.message }), log);
            }
            throw e;
          }
          st.lastTag = rel.tag;
          st.pending = null;
          state.lastPostedAt = new Date().toISOString();
          state.postCount = (state.postCount || 0) + 1;
          saveState();
          log(`✅ POSTINGAN TERKIRIM ke channel! (postingan ke-${state.postCount})`);
          bridge.send({ type: 'posted', tag: rel.tag, repo, count: state.postCount });
        } finally {
          close();
        }
      });
    } catch (e) {
      // Termasuk gagal nyambung WA (belum ada socket buat laporKeDiri):
      // app tetap dapat notifikasi Android lewat BotService.
      if (ke >= MAKS_PERCOBAAN) {
        bridge.send({ type: 'gagal_kirim', tag: rel.tag, repo, percobaan: ke, maks: MAKS_PERCOBAAN, error: String(e?.message || e).slice(0, 300) });
      }
      throw e;
    }
  }

  // ----------------------------- penjaga grup ------------------------------
  function grupState() {
    const target = String(cfg?.grup?.target || '').trim();
    if (!state.grup || state.grup.target !== target) {
      // Grup-nya ganti → catatan lama nggak berlaku.
      state.grup = { target, jid: null, nama: null, anggota: [], hitam: [], hitamInfo: [], disetujui: 0, ditolak: 0, lastCekAt: null };
    }
    return state.grup;
  }

  async function cariGrup(sock, g) {
    if (g.jid) return g.jid;
    const t = bacaTarget(g.target);
    let jid;
    if (t.jenis === JENIS.GRUP) jid = t.nilai;
    else if (t.jenis === JENIS.LINK_GRUP) jid = (await sock.groupGetInviteInfo(t.nilai))?.id || null;
    else throw new Error('Isi "Grup" harus link undangan grup (chat.whatsapp.com/...) atau JID <angka>@g.us.');
    if (!jid) throw new Error('Link grup-nya nggak kebaca / udah di-reset. Salin ulang link undangannya.');
    g.jid = jid;
    return jid;
  }

  let grupJalan = false;
  async function runGrup(source) {
    if (!grupAktif() || grupJalan) return;
    grupJalan = true;
    try {
      await pakaiWA('grup', async () => {
        const { sock, close } = await sambung({ onStatus: () => {} });
        try {
          await jagaGrup(sock, source);
        } finally {
          close();
        }
      });
    } catch (e) {
      log(`⚠️ Jaga grup gagal: ${e.message}`);
    } finally {
      grupJalan = false;
      if (running) jadwalGrup(intervalGrupMs());
      emitStatus();
    }
  }

  async function jagaGrup(sock, source) {
    const g = grupState();
    const jid = await cariGrup(sock, g);
    const meta = await sock.groupMetadata(jid);
    g.nama = meta.subject || g.nama;

    const saya = identitas({ id: sock.user?.id, lid: sock.user?.lid });
    const aku = meta.participants.find((p) => identitas(p).some((i) => saya.includes(i)));
    if (!aku?.admin) {
      log(`⚠️ Grup "${g.nama}": akun WA lo bukan admin di sana, jadi nggak bisa approve/tolak. Jadiin admin dulu.`);
      saveState();
      return;
    }
    if (!meta.joinApprovalMode && source !== 'jadwal') {
      log(`ℹ️ Grup "${g.nama}": fitur "Setujui anggota baru" belum nyala. Nyalain di Info grup → Setelan grup.`);
    }

    // 1. Siapa yang keluar sejak cek terakhir → masuk daftar hitam.
    const sekarang = meta.participants;
    const lamaJumlah = g.anggota.length;
    const hitam = new Set(g.hitam);
    let hitamInfo = Array.isArray(g.hitamInfo) ? g.hitamInfo : [];
    if (sekarang.length === 0 || (lamaJumlah > 6 && sekarang.length < lamaJumlah / 2)) {
      // Jaga-jaga kalau WA balikin daftar anggota yang nggak lengkap: jangan
      // sampai separuh grup masuk daftar hitam gara-gara glitch.
      log(`⚠️ Daftar anggota "${g.nama}" aneh (${lamaJumlah} → ${sekarang.length}). Putaran ini nggak nyatet yang keluar.`);
    } else {
      for (const orang of cariYangKeluar(g.anggota, sekarang, saya)) {
        orang.forEach((i) => hitam.add(i));
        hitamInfo.push({ ids: orang, sejak: Date.now() });
        log(`🚪 ${namaOrang(orang)} keluar/dikeluarin dari "${g.nama}" → masuk daftar hitam.`);
      }
    }
    // Yang sekarang ada di grup (mis. dimasukin lagi manual sama admin) =
    // udah dimaafin → hapus dari daftar hitam.
    for (const p of sekarang) identitas(p).forEach((i) => hitam.delete(i));
    hitamInfo = hitamInfo.filter((o) => (o?.ids || []).some((i) => hitam.has(i)));

    // 2. Proses permintaan join.
    const manual = daftarHitamManual(cfg.grup.daftarHitam, normalisasiNomor);
    const semuaHitam = new Set([...hitam, ...manual]);
    let permintaan = [];
    try {
      permintaan = await sock.groupRequestParticipantsList(jid);
    } catch (e) {
      log(`⚠️ Nggak bisa baca permintaan join: ${e.message}`);
    }

    const setuju = [];
    const tolak = [];
    for (const r of permintaan) {
      const target = r.jid || r.phone_number;
      if (!target) continue;
      if (putuskan(r, semuaHitam) === 'reject') tolak.push({ target, r });
      else setuju.push({ target, r });
    }

    const baruMasuk = [];
    if (setuju.length) {
      const res = await sock.groupRequestParticipantsUpdate(jid, setuju.map((x) => x.target), 'approve');
      for (const x of setuju) {
        const st = res.find((y) => y.jid === x.target)?.status || '200';
        if (st === '200') {
          g.disetujui = (g.disetujui || 0) + 1;
          baruMasuk.push(identitas(x.r));
          log(`✅ ${namaOrang(x.r)} di-approve masuk "${g.nama}".`);
        } else {
          log(`⚠️ Approve ${namaOrang(x.r)} gagal (status ${st}).`);
        }
      }
    }
    if (tolak.length) {
      const res = await sock.groupRequestParticipantsUpdate(jid, tolak.map((x) => x.target), 'reject');
      for (const x of tolak) {
        const st = res.find((y) => y.jid === x.target)?.status || '200';
        if (st === '200') {
          g.ditolak = (g.ditolak || 0) + 1;
          log(`⛔ ${namaOrang(x.r)} ditolak — dulu pernah keluar/dikeluarin.`);
        } else {
          log(`⚠️ Nolak ${namaOrang(x.r)} gagal (status ${st}).`);
        }
      }
    }

    // 3. Simpan catatan anggota. Yang barusan di-approve langsung dicatat,
    //    biar kalau mereka keluar sebelum cek berikutnya tetap ketahuan.
    g.anggota = [...catatAnggota(sekarang), ...baruMasuk];
    g.hitam = [...hitam];
    g.hitamInfo = hitamInfo;
    g.lastCekAt = Date.now();
    saveState();

    if (source !== 'jadwal' || setuju.length || tolak.length) {
      log(`🛡️ Grup "${g.nama}": ${sekarang.length} anggota, ${permintaan.length} permintaan ` +
        `(${setuju.length} approve, ${tolak.length} tolak), daftar hitam ${g.hitam.length} + manual ${manual.length}.`);
    }
  }

  /** Kirim daftar hitam ke app (buat daftar yang bisa dibuka blokirnya) + tulis ke log. */
  function lihatHitam(diamDiLog = false) {
    const g = state.grup;
    const manual = daftarHitamManual(cfg?.grup?.daftarHitam, normalisasiNomor);
    const otomatis = kelompokHitam(g?.hitam || [], g?.hitamInfo || []);
    bridge.send({
      type: 'daftar_hitam',
      otomatis: otomatis.map((o) => ({ kunci: o.kunci, label: o.label, sejak: o.sejak })),
      manual: manual.map((i) => '+' + i.split('@')[0]),
    });
    if (diamDiLog) return;
    if (!otomatis.length && !manual.length) {
      log('📋 Daftar hitam kosong.');
      return;
    }
    log(`📋 Daftar hitam otomatis (${otomatis.length}): ${otomatis.map((o) => o.label).join(', ') || '-'}`);
    log(`📋 Daftar hitam manual (${manual.length}): ${manual.map((i) => i.split('@')[0]).join(', ') || '-'}`);
  }

  function hapusHitam(kunci) {
    const g = state.grup;
    const manual = daftarHitamManual(cfg?.grup?.daftarHitam, normalisasiNomor);
    const hasil = bukaBlokir(g?.hitam || [], g?.hitamInfo || [], kunci, normalisasiNomor);
    if (hasil.dihapus && g) {
      g.hitam = hasil.hitam;
      g.hitamInfo = hasil.info;
      saveState();
      log(`🔓 ${hasil.dihapus.label} dikeluarin dari daftar hitam — kalau minta join lagi bakal di-approve.`);
    } else {
      log(`⚠️ ${kunci} nggak ada di daftar hitam otomatis.`);
    }
    const n = normalisasiNomor(String(kunci ?? ''));
    if (n && manual.includes(`${n}@s.whatsapp.net`)) {
      log(`ℹ️ Nomor +${n} juga ada di kolom "Selalu tolak nomor ini" — hapus dari situ juga, terus Simpan.`);
    }
    lihatHitam(true);
    emitStatus();
  }

  async function doTesGrup() {
    const target = String(cfg?.grup?.target || '').trim();
    if (!target) { log('⚠️ Link grup masih kosong. Isi dulu di kartu Penjaga grup, terus Simpan.'); return; }
    try {
      log('🧪 Mengirim pesan tes ke grup...');
      await pakaiWA('tes-grup', async () => {
        const { sock, close } = await sambung();
        try {
          const g = grupState();
          const jid = await cariGrup(sock, g);
          let nama = g.nama;
          try { nama = (await sock.groupMetadata(jid)).subject || nama; } catch { /* nggak wajib */ }
          if (nama) g.nama = nama;
          saveState();
          await sendText(sock, jid, formatTesGrup(nama));
          log(`✅ Pesan tes terkirim ke grup "${nama || jid}".`);
        } finally {
          close();
        }
      });
    } catch (e) {
      log(`💥 Tes grup gagal: ${e.message}`);
    }
  }

  // ----------------------------- setup & test ------------------------------
  // Setup yang lagi jalan + tombol pembatalnya. Kalau user minta setup lagi
  // (mis. tadi pilih QR, sekarang pilih kode), yang lama DIBATALIN dan diganti
  // — dulu yang baru ditolak ("Setup lagi jalan"), jadi QR lama tetap nongol
  // barengan sama kode yang diminta.
  let setupJalan = null;
  let setupBatal = null;

  async function mintaSetup(cara, nomorMentah) {
    if (setupJalan) {
      log('↩️ Setup sebelumnya dibatalin, ganti ke yang baru.');
      setupBatal.aktif = true;
      try { setupBatal.sock?.end(undefined); } catch { /* ignore */ }
      await setupJalan.catch(() => {});
    }
    const batal = { aktif: false, sock: null };
    setupBatal = batal;
    setupJalan = doSetup(cara, nomorMentah, batal).finally(() => {
      if (setupBatal === batal) { setupJalan = null; emitStatus(); }
    });
  }

  /**
   * Nautin WA. `cara` = 'pairing' (pakai nomor + kode 8 huruf) atau 'qr'.
   */
  async function doSetup(cara, nomorMentah, batal) {
    // Bersihin sisa tampilan setup sebelumnya: QR & kode nggak boleh nongol bareng.
    bridge.send({ type: 'qr', qr: null });
    bridge.send({ type: 'pairing_code', code: null });
    emitStatus();
    let mode = cara === 'qr' ? 'qr' : 'pairing';
    try {
      if (statusSesi(sessionDir) === 'siap') {
        mode = 'none';
        log('ℹ️ WA udah tertaut. Kalau mau ganti akun, tekan "Lepas WA" dulu.');
      } else if (mode === 'pairing') {
        const n = normalisasiNomor(nomorMentah || cfg?.whatsapp?.phone);
        if (!n) throw new Error('Isi nomor WA dulu (contoh 6281234567890).');
        nomorMentah = n;
        log(`🔧 SETUP: minta pairing code buat +${n}...`);
      } else {
        log('🔧 SETUP: tunjukkan QR di layar, scan pakai WA dari HP lain (Perangkat tertaut).');
      }
      bridge.send({ type: 'setup_start', mode });

      await pakaiWA('setup', async () => {
        if (batal.aktif) throw new Error('Dibatalin.');
        const { sock, close } = await sambung({
          mode,
          phone: nomorMentah,
          batal,
          emitQr: (qr) => {
            if (batal.aktif) return;
            log('📱 QR baru ditampilkan — scan sekarang (QR ganti tiap ±20 dtk).');
            bridge.send({ type: 'qr', qr });
          },
          emitPairingCode: (code) => { if (!batal.aktif) bridge.send({ type: 'pairing_code', code }); },
          onTertaut: () => {
            // HP udah nerima kode / QR → tutup tampilannya, kasih tau lagi ngapain.
            bridge.send({ type: 'qr', qr: null });
            bridge.send({ type: 'pairing_code', code: null });
            bridge.send({ type: 'setup_tahap', msg: 'Diterima WhatsApp! Nyelesaiin tautan (±20 dtk) — jangan tutup app.' });
          },
          timeoutMs: 300000,
        });
        bridge.send({ type: 'qr', qr: null });
        bridge.send({ type: 'pairing_code', code: null });
        log('🔗 WA tertaut!');
        try {
          let jid = null;
          if (cfg?.whatsapp?.channel) {
            jid = await cariTarget(sock);
            if (cfg.bot?.testMessageOnSetup !== false) {
              await kirimKeChannel(sock, jid, formatTestMessage(teksRepo(cfg.github?.repo) || '-', ajak(jid)));
              log('📨 Test message dikirim ke channel. Cek channel-nya!');
            }
          }
          for (const repo of repos()) {
            const st = stateRepo(state, repo);
            if (st.lastTag) continue; // baseline lama tetap dipakai
            const rel = await fetchLatestRelease(repo, {
              token: cfg.github?.token || '',
              includePrereleases: Boolean(cfg.github?.includePrereleases),
            });
            st.lastTag = rel.tag;
            st.rilisEtag = rel.etag || null;
            saveState();
            log(`🌱 Baseline release dicatat: ${repo} ${rel.tag}`);
          }
          if (grupAktif()) await jagaGrup(sock, 'setup');
          bridge.send({ type: 'setup_done', jid });
          log('🎉 SETUP SELESAI!');
        } finally {
          close();
        }
      });
    } catch (e) {
      if (batal.aktif) {
        log('(setup yang lama udah dihentiin)');
        return;
      }
      log(`💥 Setup gagal: ${e.message}`);
      bridge.send({ type: 'setup_error', msg: e.message });
      bridge.send({ type: 'qr', qr: null });
      bridge.send({ type: 'pairing_code', code: null });
    }
  }

  async function doLepas() {
    await pakaiWA('lepas', async () => {
      if (statusSesi(sessionDir) === 'siap') {
        try {
          const { sock } = await connectToWhatsApp({ sessionDir, mode: 'none', timeoutMs: 30000 });
          await sock.logout('dilepas dari app');
        } catch { /* nggak nyambung → minimal hapus file-nya */ }
      }
      hapusSesi(sessionDir);
      state.channelJid = null;
      saveState();
      log('🔌 WA dilepas. Tautkan lagi kapan aja lewat "Tautkan WA".');
    });
    emitStatus();
  }

  /** Cek doang: target-nya ketemu nggak? Nggak kirim apa-apa. */
  async function doCekChannel() {
    if (!cfg.whatsapp.channel) {
      log('⚠️ Channel WA masih kosong. Tekan "Bikin Channel", atau tempel link channel-nya.');
      return;
    }
    log('🔎 Nyari channel/grup dari isi setting...');
    try {
      await pakaiWA('cek-channel', async () => {
        const { sock, close } = await sambung();
        try {
          state.channelJid = null; // paksa resolve ulang
          const jid = await cariTarget(sock);
          log(`✅ Ketemu: ${state.channelName || '(tanpa nama)'} → ${jid}`);
        } finally {
          close();
        }
      });
    } catch (e) {
      log(`💥 Gagal nyari channel: ${e.message}`);
    }
  }

  /**
   * Bikin channel WA baru dari nomor yang lagi login, lalu simpan JID-nya.
   * Jalan pintas buat yang bingung "channel-nya dapet dari mana?".
   */
  async function doBikinChannel(namaMinta) {
    log('🏗️ Bikin channel baru di WhatsApp lo...');
    try {
      await pakaiWA('bikin-channel', async () => {
        const { sock, close } = await sambung();
        try {
          const repo = repos()[0] || 'bot';
          const nama = (namaMinta && String(namaMinta).trim()) || `Release ${repo}`;
          const meta = await bikinChannel(sock, nama, `Info release dari ${repo} — dijaga sama wa-release-bot.`);
          const link = linkChannel(meta);

          state.channelJid = meta.id;
          state.channelName = meta.name || nama;
          cfg.whatsapp.channel = meta.id;
          fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 2));
          saveState();

          log(`✅ Channel dibuat: ${state.channelName}`);
          log(`   JID-nya: ${meta.id}`);
          if (link) log(`🔗 Link channel (buat dibagikan): ${link}`);

          if (cfg.bot?.testMessageOnSetup !== false) {
            await kirimKeChannel(sock, meta.id, formatTestMessage(repo, ajak(meta.id)));
            log('📨 Test message dikirim ke channel baru. Cek tab Saluran di WA.');
          }
          bridge.send({ type: 'channel_dibuat', jid: meta.id, nama: state.channelName, link });
          emitStatus();
        } finally {
          close();
        }
      });
    } catch (e) {
      log(`💥 Gagal bikin channel: ${e.message}`);
      bridge.send({ type: 'channel_gagal', msg: e.message });
    }
  }

  async function doTest() {
    if (!cfg.whatsapp?.channel) { log('⚠️ Channel WA masih kosong.'); return; }
    try {
      log('🧪 Mengirim test message ke channel...');
      await pakaiWA('test', async () => {
        const { sock, close } = await sambung();
        try {
          const jid = await cariTarget(sock);
          await kirimKeChannel(sock, jid, formatTestMessage(teksRepo(cfg.github?.repo) || '-', ajak(jid)));
          log(`✅ Test message terkirim ke ${jid}`);
        } finally {
          close();
        }
      });
    } catch (e) {
      log(`💥 Test gagal: ${e.message}`);
    }
  }

  // ----------------------------- commands ----------------------------------
  async function handleCommand(cmd) {
    const perluCfg = () => {
      if (cfg) return true;
      bridge.send({ type: 'cmd_error', msg: 'Setting belum di-simpan. Tekan "Simpan" dulu.' });
      return false;
    };

    switch (cmd?.type) {
      case 'ping':
        bridge.send({ type: 'pong', ts: Date.now() });
        break;

      case 'configure': {
        const repoSalah = repoTidakValid(cmd.repo);
        if (repoSalah.length) {
          bridge.send({ type: 'cmd_error', msg: `Repo nggak valid: ${repoSalah.join(', ')}. Formatnya pemilik/nama-repo; pisahkan pakai koma kalau lebih dari satu.` });
          return;
        }
        const next = {
          github: {
            repo: teksRepo(cmd.repo),
            token: cmd.token || '',
            includePrereleases: Boolean(cmd.includePrereleases),
          },
          whatsapp: {
            channel: cmd.channel || '',
            phone: cmd.phone || '',
            format: cmd.formatChannel === 'pertanyaan' ? 'pertanyaan' : 'teks',
          },
          bot: {
            checkIntervalMinutes: Number(cmd.intervalMinutes) || 15,
            postOnFirstRun: Boolean(cmd.postOnFirstRun),
            testMessageOnSetup: cmd.testMessageOnSetup !== false,
          },
          grup: {
            aktif: Boolean(cmd.grupAktif),
            target: String(cmd.grupTarget || '').trim(),
            intervalMinutes: Number(cmd.grupInterval) || 5,
            daftarHitam: String(cmd.grupHitam || ''),
          },
          lagu: {
            aktif: Boolean(cmd.laguAktif),
            perHari: Math.min(Math.max(Number(cmd.laguPerHari) || 2, 1), 8),
            jamMulai: Number.isFinite(Number(cmd.laguJamMulai)) ? Number(cmd.laguJamMulai) : 9,
            jamSelesai: Number.isFinite(Number(cmd.laguJamSelesai)) ? Number(cmd.laguJamSelesai) : 22,
            tzMenit: Number(cmd.tzMenit) || 0,
            sumber: String(cmd.laguSumber || '').trim() || SUMBER_BAWAAN,
          },
        };
        if (!next.github.repo && !next.grup.aktif && !next.lagu.aktif) {
          bridge.send({ type: 'cmd_error', msg: 'Isi repo GitHub, nyalain penjaga grup, atau nyalain lagu mood — minimal salah satu.' });
          return;
        }
        if (next.grup.aktif && !next.grup.target) {
          bridge.send({ type: 'cmd_error', msg: 'Penjaga grup nyala tapi link grup-nya kosong.' });
          return;
        }
        if (cfg?.whatsapp?.channel !== next.whatsapp.channel) state.channelJid = null;
        // Repo yang dihapus dibuang dari state (repo baru otomatis mulai dari
        // nol); includePrereleases berubah = semua baseline dari nol, karena
        // tag stable dan prerelease tidak sebanding.
        sinkronState(state, daftarRepo(next.github.repo), {
          reset: Boolean(cfg?.github?.includePrereleases) !== next.github.includePrereleases,
        });
        cfg = next;
        fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 2));
        saveState();
        log(`⚙️ Setting diperbarui: repo=${next.github.repo || '-'}, channel=${next.whatsapp.channel || '-'}, ` +
          `interval=${next.bot.checkIntervalMinutes}m, grup=${next.grup.aktif ? 'nyala' : 'mati'}`);
        if (running) {
          scheduleNext(repoAda() ? intervalMs() : 0);
          jadwalGrup(5000);
          const laguLama = nextLaguAt;
          if (!laguAktif()) jadwalLagu();
          else if (!laguLama) jadwalLagu();
        }
        emitStatus();
        break;
      }

      case 'start':
        if (!perluCfg()) return;
        startEngine();
        break;

      case 'stop':
        stopEngine();
        // Setup yang lagi jalan ikut dihentiin (mis. service dimatiin pas nautin).
        if (setupJalan && setupBatal) {
          setupBatal.aktif = true;
          try { setupBatal.sock?.end(undefined); } catch { /* ignore */ }
        }
        break;

      case 'check':
        if (!perluCfg()) return;
        void runCheck('manual');
        if (grupAktif()) void runGrup('manual');
        break;

      case 'setup':
        // Sengaja nggak wajib setting: nautin WA boleh duluan.
        void mintaSetup(cmd.cara, cmd.phone);
        break;

      case 'status':
        emitStatus();
        break;

      case 'lepas':
        void doLepas();
        break;

      case 'test':
        if (!perluCfg()) return;
        void doTest();
        break;

      case 'bikin-channel':
        if (!perluCfg()) return;
        void doBikinChannel(cmd.nama);
        break;

      case 'cek-channel':
        if (!perluCfg()) return;
        void doCekChannel();
        break;

      case 'cek-grup':
        if (!perluCfg()) return;
        if (!grupAktif()) { log('⚠️ Penjaga grup belum dinyalain / link grup kosong.'); return; }
        void runGrup('manual');
        break;

      case 'lihat-hitam':
        lihatHitam();
        break;

      case 'hapus-hitam':
        hapusHitam(cmd.kunci);
        break;

      case 'tes-grup':
        if (!perluCfg()) return;
        void doTesGrup();
        break;

      case 'reset-hitam':
        if (state.grup) { state.grup.hitam = []; state.grup.hitamInfo = []; saveState(); }
        log('🧽 Daftar hitam otomatis dikosongin (yang manual di setting nggak disentuh).');
        lihatHitam(true);
        emitStatus();
        break;

      case 'lagu-sekarang':
        if (!perluCfg()) return;
        void runLagu('manual');
        break;

      default:
        if (String(cmd?.type || '').startsWith('hosting-')) {
          await hosting.perintah(cmd);
          break;
        }
        log('cmd tidak dikenal: ' + cmd?.type);
    }
  }

  // ----------------------------- init ---------------------------------------
  log('🦴 wa-release-bot engine siap (node ' + process.version + '). Menunggu perintah dari app.');
  emitStatus();
  try { hosting.init(); } catch (e) { log('⚠️ Hosting gagal init: ' + e.message); }

  if (cfg) {
    log('Config terbaca: repo=' + (teksRepo(cfg.github?.repo) || '-') + ', channel=' + (cfg.whatsapp?.channel || '-') +
      (cfg.grup?.aktif ? ', penjaga grup nyala' : ''));
    if (cfg._autoStart) startEngine();
  }
}
