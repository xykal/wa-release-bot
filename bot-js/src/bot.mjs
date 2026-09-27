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

import fs from 'node:fs';
import path from 'node:path';
import { createBridge } from './bridge.mjs';
import { fetchLatestRelease } from './github.mjs';
import { connectToWhatsApp, resolveChannel, statusSesi, hapusSesi, nomorSesi } from './wa.mjs';
import { kirimTeks, kirimPertanyaan, ambilRespons, ambilTerkirim, pernahKirim } from './kirim.mjs';
import { createKoneksi } from './koneksi.mjs';
import { createPengaman } from './pengaman.mjs';
import { createPlugin } from './plugin.mjs';
import { cariTeks, pisahPerintah, samarkan, jedaGrup, faktorBerikut, normalMode } from './pesan.mjs';
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
import {
  formatReleasePost, formatTestMessage, formatTesGrup, formatRules, formatMenu, formatInfoGrup,
  LINK_RULES_DEFAULT,
} from './format.mjs';

// ----------------------------- selftest ------------------------------------
async function selftest() {
  const tmp = fs.mkdtempSync('/tmp/warbot-test-');
  process.env.WR_DATA_DIR = tmp;
  console.log('SELFTEST: dataDir =', tmp);
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

// ----------------------------- jaga proses (Android) -------------------------
//  Di Android, Node jalan DI DALAM proses app (nodejs-mobile). Kalau Node
//  manggil exit() — lewat process.exit(), atau error yang nggak ketangkep —
//  seluruh app ikut ditutup, dan pas library-library-nya dibongkar, thread
//  lain (UI, coroutine, perekam log) nyentuh mutex yang udah dihancurin:
//
//    FORTIFY: pthread_mutex_lock called on a destroyed mutex
//    Fatal signal 6 (SIGABRT) … (DefaultDispatch / RenderThread / wr-logcat)
//
//  Itu persis crash yang kecatat di HP user. Jadi di Android:
//    1. jaring error dipasang PALING AWAL (sebelum apa pun jalan),
//    2. process.exit / reallyExit diblok — cuma dicatat,
//    3. event loop ditahan biar node::Start nggak pernah balik.
const jaring = { log: (m) => logDarurat(m), onBanjir: () => {} };
let pengamanGlobal = null;

function logDarurat(msg) {
  try { console.warn(msg); } catch { /* ignore */ }
  try {
    const dir = process.env.WR_DATA_DIR;
    if (dir) fs.appendFileSync(path.join(dir, 'events.jsonl'), JSON.stringify({ type: 'log', msg, ts: Date.now() }) + '\n');
  } catch { /* ignore */ }
}

function jagaProsesAndroid() {
  pengamanGlobal = createPengaman({ log: (m) => jaring.log(m), onBanjir: () => jaring.onBanjir() });
  pengamanGlobal.pasang();
  const blokir = (nama) => (code) => {
    const e = new Error('stack');
    jaring.log(`🧱 ${nama}(${code ?? ''}) diblok — di Android itu bikin app force close. Engine tetap idup.`);
    try { console.warn(e.stack); } catch { /* ignore */ }
  };
  process.exit = blokir('process.exit');
  process.reallyExit = blokir('process.reallyExit');
  setInterval(() => {}, 1 << 30);
}

if (process.argv.includes('--selftest')) {
  selftest().catch((e) => { console.error('SELFTEST ERROR:', e); process.exit(1); });
  // jangan lanjut ke main
  if (typeof module !== 'undefined') { /* keep cjs happy */ }
} else {
  jagaProsesAndroid();
  main().catch((e) => {
    // JANGAN process.exit di sini — lihat jagaProsesAndroid().
    jaring.log(`💥 Engine gagal mulai: ${e?.message || e}`);
    try { console.error(e?.stack || e); } catch { /* ignore */ }
  });
}

// ----------------------------- main ----------------------------------------
async function main() {
  const dataDir = process.env.WR_DATA_DIR;
  if (!dataDir) {
    throw new Error('WR_DATA_DIR belum di-set oleh app.');
  }

  const cfgFile = path.join(dataDir, 'config.json');
  const stateFile = path.join(dataDir, 'state.json');
  const sessionDir = path.join(dataDir, 'session');

  let state = {
    lastTag: null, channelJid: null, channelName: null, postCount: 0, lastPostedAt: null,
    grup: null, // { target, jid, nama, anggota: [[id...]], hitam: [id...], disetujui, ditolak, lastCekAt }
    pertanyaan: [], // [{ serverId, jid, judul, t }] — pertanyaan channel terakhir (buat "Lihat respons")
    plugin: {},     // simpanan kecil per script bot
    pesanTerakhirTs: 0,
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
  let faktorAdaptif = 1;
  let kegiatanGrup = false; // ada perintah / permintaan join sejak putaran terakhir (mode adaptif)
  let terakhirBangun = 0;
  let timerBangun = null;
  let adminCache = { jid: null, ids: new Set(), sampai: 0 };

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
    onCommand: (cmd) => { void handleCommand(cmd); },
  });

  // Error nyasar jangan sampai matiin proses — di Android itu = app force close.
  // Jaringnya udah kepasang dari awal (jagaProsesAndroid); sekarang log-nya
  // diarahin ke kartu Log app.
  jaring.log = log;
  jaring.onBanjir = () => { stopEngine(); };
  const pengaman = pengamanGlobal || createPengaman({ log, onBanjir: () => stopEngine() });

  const repoAda = () => Boolean(cfg?.github?.repo);
  const grupAktif = () => Boolean(cfg?.grup?.aktif && cfg?.grup?.target);
  // v1.4.2: pilihan mode (adaptif / pintar / realtime) dihapus — bikin HP
  // berat & app crash di HP user. Selalu berkala, kayak sebelum v1.4.0.
  const mode = () => 'berkala';
  const pluginDir = path.join(dataDir, 'plugins');
  const plugin = createPlugin({ dir: pluginDir, log });

  function emitStatus() {
    const g = state.grup || {};
    bridge.send({
      type: 'status',
      running,
      busy,
      waLinked: statusSesi(sessionDir) === 'siap',
      waConnected,
      waNomor: nomorSesi(sessionDir),
      mode: mode(),
      lastTag: state.lastTag,
      lastPostedAt: state.lastPostedAt,
      postCount: state.postCount,
      lastCheckAt,
      nextCheckAt,
      channel: cfg?.whatsapp?.channel || null,
      channelName: state.channelName || null,
      repo: cfg?.github?.repo || null,
      grupAktif: grupAktif(),
      grupNama: g.nama || null,
      grupDisetujui: g.disetujui || 0,
      grupDitolak: g.ditolak || 0,
      grupHitam: (g.hitam || []).length,
      grupLastCekAt: g.lastCekAt || null,
      nextGrupAt,
      pluginJumlah: plugin.jumlah,
      pertanyaanAda: (state.pertanyaan || []).length > 0,
    });
  }

  // ------------------------- koneksi WA ------------------------------------
  // Semua pemakaian WA lewat `kon` (lihat koneksi.mjs): diantrikan satu-satu,
  // socket dipakai bareng, dan baru ditutup setelah sepi ±25 dtk — cukup buat
  // ngeladenin permintaan kirim ulang pesan grup & baca perintah yang masuk.
  const kon = createKoneksi({
    log,
    buka: async () => {
      const r = await connectToWhatsApp({
        sessionDir,
        mode: 'none',
        onStatus: (m) => { if (!/^Terhubung/.test(m)) log(m); },
        getMessage: ambilTerkirim,
      });
      pasangPendengar(r.sock);
      return r;
    },
    onBerubah: (nyambung) => { waConnected = nyambung; emitStatus(); },
    bolehSambungUlang: () => statusSesi(sessionDir) === 'siap',
  });
  const pakaiWA = (_nama, fn) => kon.pakai(fn);

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
    return jedaGrup({
      mode: mode(),
      dasarMenit: Number(cfg?.grup?.intervalMinutes ?? 5),
      faktor: faktorAdaptif,
      maksMenit: Number(cfg?.bot?.adaptifMaksMenit ?? 60),
    });
  }

  function jadwalGrup(delayMs) {
    clearTimeout(timerGrup);
    if (!running || !grupAktif()) { nextGrupAt = null; return; }
    nextGrupAt = Date.now() + delayMs;
    timerGrup = setTimeout(() => { void runGrup('jadwal'); }, delayMs);
  }

  const NAMA_MODE = {
    berkala: 'Berkala',
    adaptif: 'Adaptif',
    pintar: 'Pintar (dibangunin notif WA)',
    realtime: 'Realtime (selalu nyambung)',
  };

  /** Terapin mode aktivitas: realtime = socket selalu nyala. */
  function terapkanMode() {
    const realtime = running && mode() === 'realtime' && statusSesi(sessionDir) === 'siap';
    kon.setSelalu(realtime);
  }

  function startEngine() {
    if (running) return;
    if (!cfg) {
      log('⚠️ Config belum di-set. Tekan "Simpan" di app dulu.');
      return;
    }
    running = true;
    pengaman.reset();
    faktorAdaptif = 1;
    const bagian = [];
    if (repoAda()) bagian.push(`cek release tiap ${Math.round(intervalMs() / 60000)} mnt`);
    if (grupAktif()) bagian.push(`jaga grup tiap ${Math.round(intervalGrupMs() / 60000)} mnt`);
    log(`▶️ Engine nyala — mode ${NAMA_MODE[mode()]}: ` + (bagian.join(' + ') || 'belum ada tugas'));
    emitStatus();
    scheduleNext(3000);
    jadwalGrup(8000);
    terapkanMode();
  }

  function stopEngine() {
    running = false;
    clearTimeout(timer);
    clearTimeout(timerGrup);
    clearTimeout(timerBangun);
    nextCheckAt = null;
    nextGrupAt = null;
    kon.tutup();
    log('⏸️ Engine jeda (istirahat). Tekan "Mulai" di app buat lanjut.');
    emitStatus();
  }

  /**
   * Mode pintar: app nerima notifikasi dari WhatsApp (grup / permintaan join)
   * → nyuruh engine bangun. Dikasih jeda biar notif beruntun nggak bikin
   * nyambung berkali-kali.
   */
  function bangun(sumber) {
    if (!running) return;
    // Notif WA di grup rame bisa dateng tiap beberapa detik. Dulu jedanya 20
    // dtk → bot nyambung-putus terus (praktis kayak realtime, tapi lebih berat
    // karena login ulang tiap kali). Sekarang notif paling cepat 2 menit sekali.
    const jeda = sumber === 'notif' ? 120_000 : 20_000;
    // Socket masih kebuka → pesan grup udah masuk langsung, nggak perlu dibangunin.
    if (sumber === 'notif' && kon.nyambung) return;
    const sejak = Date.now() - terakhirBangun;
    clearTimeout(timerBangun);
    const tunda = sejak > jeda ? 3_000 : jeda - sejak;
    timerBangun = setTimeout(() => {
      terakhirBangun = Date.now();
      if (grupAktif()) void runGrup(sumber || 'notif');
      else void kon.pakai(async () => { kon.tahan(15_000); }).catch(() => {});
    }, tunda);
  }

  // ----------------------------- cek & post --------------------------------
  async function runCheck(source) {
    if (busy || !cfg || !repoAda()) return;
    busy = true;
    lastCheckAt = Date.now();
    emitStatus();
    try {
      log(`👀 Cek GitHub ${cfg.github.repo} ... (trigger: ${source})`);
      const rel = await fetchLatestRelease(cfg.github.repo, {
        token: cfg.github?.token || '',
        includePrereleases: Boolean(cfg.github?.includePrereleases),
      });

      if (state.lastTag === rel.tag) {
        log(`😴 Nggak ada update (terakhir: ${state.lastTag}). Bot tidur lagi.`);
        return;
      }

      if (!state.lastTag) {
        if (cfg.bot?.postOnFirstRun) {
          log('✨ First run + postOnFirstRun=on → posting release yang sedang ada.');
          await postRelease(rel);
        } else {
          state.lastTag = rel.tag;
          saveState();
          log(`🌱 First run. Baseline dicatat: ${rel.tag}. Baru post kalau ada yang lebih baru.`);
        }
        return;
      }

      log(`🚀 ADA RELEASE BARU! ${state.lastTag} → ${rel.tag}`);
      await postRelease(rel);
    } catch (e) {
      log(`⚠️ Gagal cek: ${e.message}`);
    } finally {
      busy = false;
      if (running) scheduleNext(intervalMs());
      else nextCheckAt = null;
      emitStatus();
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

  // Format pesan ke channel: 'pertanyaan' (default — follower bisa bales,
  // balasannya cuma sampai ke admin) atau 'teks' (pesan biasa).
  const formatPertanyaan = () => cfg?.whatsapp?.format !== 'teks';

  function catatPertanyaan(jid, serverId, judul) {
    if (!serverId) return;
    state.pertanyaan = [{ serverId: String(serverId), jid, judul, t: Date.now() }, ...(state.pertanyaan || [])].slice(0, 10);
    saveState();
  }

  /** Kirim ke channel (atau grup) + pastiin diterima server. */
  async function kirimKeChannel(sock, jid, text, judul = 'Pesan') {
    if (formatPertanyaan() && String(jid).endsWith('@newsletter')) {
      try {
        const h = await kirimPertanyaan(sock, jid, text);
        if (h.ok) {
          log(`📨 Diterima server sebagai Pertanyaan${h.serverId ? ` (#${h.serverId})` : ''}.`);
          catatPertanyaan(jid, h.serverId, judul);
        } else {
          log('ℹ️ Server nggak bales konfirmasi (ack) — cek channel-nya buat mastiin.');
        }
        return h;
      } catch (e) {
        log(`⚠️ Kirim sebagai "Pertanyaan" gagal (${e.message}) — dikirim sebagai teks biasa.`);
        if (e.kodeWA === '403' || e.kodeWA === 403) {
          log('ℹ️ Kemungkinan fitur Pertanyaan belum kebuka buat channel ini. Coba bikin 1 pertanyaan manual dari app WA dulu, atau pakai format Teks.');
        }
      }
    }
    const h = await kirimTeks(sock, jid, text);
    if (h.ok === null) log('ℹ️ Server nggak bales konfirmasi (ack) — cek tujuan buat mastiin.');
    return h;
  }
  const ajak = (jid) => ({ ajakBalas: formatPertanyaan() && String(jid).endsWith('@newsletter') });

  async function postRelease(rel) {
    if (!cfg.whatsapp?.channel) {
      log('⚠️ Ada release baru tapi "Channel WA" masih kosong — nggak ada tujuan posting.');
      return;
    }
    await pakaiWA('posting', async (sock) => {
      const jid = await cariTarget(sock);
      await kirimKeChannel(sock, jid, formatReleasePost(rel, cfg.github.repo, ajak(jid)), `Rilis ${rel.tag}`);
      state.lastTag = rel.tag;
      state.lastPostedAt = new Date().toISOString();
      state.postCount = (state.postCount || 0) + 1;
      saveState();
      log(`✅ POSTINGAN TERKIRIM ke channel! (postingan ke-${state.postCount})`);
      bridge.send({ type: 'posted', tag: rel.tag, count: state.postCount });
    });
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
      await pakaiWA('grup', async (sock) => {
        const ada = await jagaGrup(sock, source);
        if (ada) kegiatanGrup = true;
        await jalankanJadwalPlugin(sock);
        kon.tahan(10_000); // kasih waktu pesan/perintah yang ketunda masuk
      });
    } catch (e) {
      log(`⚠️ Jaga grup gagal: ${e.message}`);
    } finally {
      if (mode() === 'adaptif') {
        const lama = faktorAdaptif;
        faktorAdaptif = faktorBerikut({
          faktor: faktorAdaptif,
          adaKegiatan: kegiatanGrup,
          dasarMenit: Number(cfg?.grup?.intervalMinutes ?? 5),
          maksMenit: Number(cfg?.bot?.adaptifMaksMenit ?? 60),
        });
        if (faktorAdaptif !== lama) {
          log(faktorAdaptif === 1
            ? '⚡ Adaptif: ada kegiatan di grup → cek dirapetin lagi.'
            : `🐢 Adaptif: grup sepi → cek berikutnya ${Math.round(intervalGrupMs() / 60000)} mnt lagi.`);
        }
      } else {
        faktorAdaptif = 1;
      }
      kegiatanGrup = false;
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
    simpanAdmin(jid, meta);

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

    const adaKegiatan = setuju.length > 0 || tolak.length > 0 || sekarang.length !== lamaJumlah;
    if (source !== 'jadwal' || setuju.length || tolak.length) {
      log(`🛡️ Grup "${g.nama}": ${sekarang.length} anggota, ${permintaan.length} permintaan ` +
        `(${setuju.length} approve, ${tolak.length} tolak), daftar hitam ${g.hitam.length} + manual ${manual.length}.`);
    }
    return adaKegiatan;
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
      await pakaiWA('tes-grup', async (sock) => {
        const g = grupState();
        const jid = await cariGrup(sock, g);
        let nama = g.nama;
        try { nama = (await sock.groupMetadata(jid)).subject || nama; } catch { /* nggak wajib */ }
        if (nama) g.nama = nama;
        saveState();
        const h = await kirimTeks(sock, jid, formatTesGrup(nama, opsiRules()));
        kon.tahan(30_000); // ladenin permintaan kirim ulang dari HP anggota
        log(h.ok
          ? `✅ Pesan tes diterima server & dikirim ke grup "${nama || jid}".`
          : `ℹ️ Pesan tes dikirim ke grup "${nama || jid}", tapi server belum ngasih konfirmasi. Cek grupnya.`);
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
    let caraSambung = cara === 'qr' ? 'qr' : 'pairing';
    try {
      if (statusSesi(sessionDir) === 'siap') {
        caraSambung = 'none';
        log('ℹ️ WA udah tertaut. Kalau mau ganti akun, tekan "Lepas WA" dulu.');
      } else if (caraSambung === 'pairing') {
        const n = normalisasiNomor(nomorMentah || cfg?.whatsapp?.phone);
        if (!n) throw new Error('Isi nomor WA dulu (contoh 6281234567890).');
        nomorMentah = n;
        log(`🔧 SETUP: minta pairing code buat +${n}...`);
      } else {
        log('🔧 SETUP: tunjukkan QR di layar, scan pakai WA dari HP lain (Perangkat tertaut).');
      }
      bridge.send({ type: 'setup_start', mode: caraSambung });

      await kon.eksklusif(async () => {
        if (batal.aktif) throw new Error('Dibatalin.');
        const { sock, close } = await connectToWhatsApp({
          sessionDir,
          onStatus: (m) => log(m),
          getMessage: ambilTerkirim,
          mode: caraSambung,
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
        waConnected = true;
        emitStatus();
        try {
          let jid = null;
          if (cfg?.whatsapp?.channel) {
            jid = await cariTarget(sock);
            if (cfg.bot?.testMessageOnSetup !== false) {
              await kirimKeChannel(sock, jid, formatTestMessage(cfg.github?.repo || '-', ajak(jid)));
              log('📨 Test message dikirim ke channel. Cek channel-nya!');
            }
          }
          if (repoAda()) {
            const rel = await fetchLatestRelease(cfg.github.repo, {
              token: cfg.github?.token || '',
              includePrereleases: Boolean(cfg.github?.includePrereleases),
            });
            if (!state.lastTag) {
              state.lastTag = rel.tag;
              saveState();
              log(`🌱 Baseline release dicatat: ${rel.tag}`);
            }
          }
          if (grupAktif()) await jagaGrup(sock, 'setup');
          bridge.send({ type: 'setup_done', jid });
          log('🎉 SETUP SELESAI!');
          await new Promise((r) => setTimeout(r, 3000));
        } finally {
          close();
          waConnected = false;
          emitStatus();
        }
      });
      terapkanMode();
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
    kon.setSelalu(false);
    await kon.eksklusif(async () => {
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
      await pakaiWA('cek-channel', async (sock) => {
        state.channelJid = null; // paksa resolve ulang
        const jid = await cariTarget(sock);
        log(`✅ Ketemu: ${state.channelName || '(tanpa nama)'} → ${jid}`);
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
      await pakaiWA('bikin-channel', async (sock) => {
        const repo = cfg.github?.repo || 'bot';
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
      await pakaiWA('test', async (sock) => {
        const jid = await cariTarget(sock);
        await kirimKeChannel(sock, jid, formatTestMessage(cfg.github?.repo || '-', ajak(jid)));
        log(`✅ Test message terkirim ke ${jid}`);
      });
    } catch (e) {
      log(`💥 Test gagal: ${e.message}`);
    }
  }

  // ----------------------------- pesan masuk & perintah -------------------
  // Yang didengerin cuma 2 tempat: grup yang dijaga, dan chat "Pesan ke diri
  // sendiri" (buat nyoba perintah / script tanpa ganggu grup).
  const opsiRules = () => ({
    linkRules: cfg?.grup?.linkRules ?? LINK_RULES_DEFAULT,
    ringkasRules: cfg?.grup?.ringkasRules || undefined,
    perintah: cfg?.grup?.perintahAktif !== false,
  });

  function simpanAdmin(jid, meta) {
    const ids = new Set();
    for (const p of meta?.participants || []) if (p.admin) identitas(p).forEach((i) => ids.add(i));
    adminCache = { jid, ids, sampai: Date.now() + 5 * 60_000 };
  }

  async function adalahAdmin(sock, jidGrup, pengirim) {
    if (adminCache.jid !== jidGrup || Date.now() > adminCache.sampai) {
      simpanAdmin(jidGrup, await sock.groupMetadata(jidGrup));
    }
    return identitas(pengirim).some((i) => adminCache.ids.has(i));
  }

  const sudahDiproses = new Set();
  const jedaOrang = new Map();

  function pasangPendengar(sock) {
    sock.ev.on('messages.upsert', ({ messages }) => {
      for (const m of messages || []) {
        terimaPesan(sock, m).catch((e) => log(`⚠️ Proses pesan gagal: ${e.message}`));
      }
    });
    sock.ev.on('group.join-request', (e) => {
      const g = state.grup;
      if (!running || !grupAktif() || !g?.jid || e?.id !== g.jid) return;
      if (e.action && e.action !== 'created') return;
      kegiatanGrup = true;
      log('📥 Ada permintaan join baru — diproses sebentar lagi.');
      bangun('permintaan-join');
    });
  }

  async function terimaPesan(sock, m) {
    const id = m?.key?.id;
    if (!m?.message || !id || sudahDiproses.has(id) || pernahKirim(id)) return;
    sudahDiproses.add(id);
    if (sudahDiproses.size > 500) sudahDiproses.delete(sudahDiproses.values().next().value);

    // Pesan yang ketunda (dikirim pas bot lagi tidur) tetap diproses, asal
    // belum lewat 1 jam — lebih dari itu udah basi.
    const ts = Number(m.messageTimestamp || 0) * 1000;
    if (!ts || Date.now() - ts > 60 * 60_000) return;

    const jid = m.key.remoteJid;
    const g = state.grup;
    const diGrup = Boolean(grupAktif() && g?.jid && jid === g.jid);
    const saya = identitas({ id: sock.user?.id, lid: sock.user?.lid });
    const chatSendiri = Boolean(m.key.fromMe && identitas(jid).some((i) => saya.includes(i)));
    if (!diGrup && !chatSendiri) return;

    const teks = cariTeks(m.message);
    if (!teks) return;
    const pengirimId = m.key.fromMe ? sock.user?.id : (m.key.participant || m.participant || jid);
    const p = pisahPerintah(teks);

    const balas = async (isi) => {
      const h = await kirimTeks(sock, jid, String(isi), { quoted: m });
      kon.tahan(diGrup ? 30_000 : 10_000);
      return h;
    };
    const ctxDasar = {
      teks,
      pesan: m,
      jid,
      diGrup,
      chatSendiri,
      dariSaya: Boolean(m.key.fromMe),
      pengirim: {
        id: pengirimId,
        nama: m.pushName || (m.key.fromMe ? 'Saya' : ''),
        nomor: identitas(pengirimId).map((i) => i.split('@')[0])[0] || '',
      },
      grup: g?.jid ? { jid: g.jid, nama: g.nama || null } : null,
      balas,
      kirim: async (tujuan, isi) => kirimTeks(sock, tujuan, String(isi)),
      sock,
    };
    const adminKah = async () => {
      if (m.key.fromMe) return true;
      if (!diGrup) return false;
      try { return await adalahAdmin(sock, jid, pengirimId); } catch { return false; }
    };
    const ctxPlugin = (d, tambahan = {}) => ({
      ...ctxDasar,
      ...tambahan,
      log: (msg) => log(`🧩 [${d.nama}] ${msg}`),
      ambil: (k) => state.plugin?.[d.nama]?.[k],
      simpan: (k, v) => {
        state.plugin = state.plugin || {};
        state.plugin[d.nama] = { ...(state.plugin[d.nama] || {}), [k]: v };
        saveState();
      },
    });

    if (!p) {
      if (plugin.jumlah) {
        kon.tahan(10_000);
        await plugin.onPesan((d) => ctxPlugin(d, { adalahAdmin: m.key.fromMe }));
      }
      return;
    }

    const bawaan = ['!rules', '!aturan', '!menu', '!bantuan', '!help', '!info', '!ping'];
    const dariScript = plugin.cari(p.perintah);
    if (!bawaan.includes(p.perintah) && !dariScript) return; // bukan perintah bot
    if (diGrup && cfg?.grup?.perintahAktif === false && !dariScript) return;

    // Anti-spam: 1 perintah / 4 dtk per orang.
    const kunciOrang = identitas(pengirimId)[0] || pengirimId;
    if (Date.now() - (jedaOrang.get(kunciOrang) || 0) < 4000) return;
    jedaOrang.set(kunciOrang, Date.now());

    kegiatanGrup = true;
    kon.tahan(20_000);
    log(`⌨️ Perintah ${p.perintah} dari ${ctxDasar.pengirim.nama || ctxDasar.pengirim.nomor || 'seseorang'}${diGrup ? ' (grup)' : ' (chat sendiri)'}.`);

    switch (p.perintah) {
      case '!rules':
      case '!aturan':
        await balas(formatRules(g?.nama, opsiRules()));
        return;
      case '!menu':
      case '!bantuan':
      case '!help':
        await balas(formatMenu(plugin.semuaPerintah()));
        return;
      case '!ping':
        await balas(`🏓 Pong! Bot nyala — mode ${NAMA_MODE[mode()]}.`);
        return;
      case '!info': {
        if (!(await adminKah())) {
          await balas('🔒 *!info* khusus admin grup.');
          return;
        }
        if (!grupAktif() || !g) {
          await balas('ℹ️ Penjaga grup belum dinyalain di app.');
          return;
        }
        await balas(await infoGrup(sock, { samarkan: diGrup && cfg?.grup?.samarkanNomor !== false }));
        return;
      }
      default: {
        const admin = await adminKah();
        await plugin.jalankan(dariScript.plugin, dariScript.fn,
          ctxPlugin(dariScript.plugin, { perintah: p.perintah, argumen: p.argumen, sisa: p.sisa, adalahAdmin: admin }),
          p.perintah);
      }
    }
  }

  async function infoGrup(sock, { samarkan: samar = true } = {}) {
    const g = grupState();
    const jid = await cariGrup(sock, g);
    const meta = await sock.groupMetadata(jid);
    simpanAdmin(jid, meta);
    let permintaan = null;
    try { permintaan = (await sock.groupRequestParticipantsList(jid)).length; } catch { /* bukan admin / fitur mati */ }
    const otomatis = kelompokHitam(g.hitam || [], g.hitamInfo || []);
    return formatInfoGrup({
      nama: meta.subject || g.nama,
      anggota: meta.participants.length,
      admin: meta.participants.filter((x) => x.admin).length,
      permintaan,
      disetujui: g.disetujui,
      ditolak: g.ditolak,
      hitam: otomatis.map((o) => ({ label: samar ? samarkan(o.label) : o.label, sejak: o.sejak })),
      manual: daftarHitamManual(cfg?.grup?.daftarHitam, normalisasiNomor).length,
      lastCekAt: g.lastCekAt,
      mode: NAMA_MODE[mode()],
    });
  }

  /** onJadwal punya script: dipanggil tiap putaran jaga grup. */
  async function jalankanJadwalPlugin(sock) {
    if (!plugin.jumlah) return;
    const g = state.grup;
    await plugin.onJadwal((d) => ({
      grup: g?.jid ? { jid: g.jid, nama: g.nama || null } : null,
      kirim: async (tujuan, isi) => kirimTeks(sock, tujuan, String(isi)),
      kirimKeGrup: async (isi) => (g?.jid ? kirimTeks(sock, g.jid, String(isi)) : null),
      log: (msg) => log(`🧩 [${d.nama}] ${msg}`),
      ambil: (k) => state.plugin?.[d.nama]?.[k],
      simpan: (k, v) => {
        state.plugin = state.plugin || {};
        state.plugin[d.nama] = { ...(state.plugin[d.nama] || {}), [k]: v };
        saveState();
      },
      sock,
    }));
  }

  function kirimDaftarPlugin() {
    bridge.send({ type: 'plugin_daftar', items: plugin.info() });
    emitStatus();
  }

  // ----------------------------- lihat respons -----------------------------
  async function doLihatRespons(serverIdMinta) {
    const daftar = state.pertanyaan || [];
    const q = serverIdMinta ? daftar.find((x) => x.serverId === String(serverIdMinta)) : daftar[0];
    if (!q) {
      const msg = 'Belum ada Pertanyaan yang tercatat. Kirim satu dulu (Tes kirim / rilis baru) pakai format Pertanyaan.';
      log('ℹ️ ' + msg);
      bridge.send({ type: 'respons', ok: false, msg, daftar });
      return;
    }
    log(`💬 Ngambil respons buat "${q.judul}" (#${q.serverId})...`);
    try {
      const items = await pakaiWA('respons', (sock) => ambilRespons(sock, q.jid, q.serverId));
      log(`💬 ${items.length} respons buat "${q.judul}".`);
      bridge.send({ type: 'respons', ok: true, serverId: q.serverId, judul: q.judul, t: q.t, items, daftar });
    } catch (e) {
      log(`💥 Gagal ngambil respons: ${e.message}`);
      bridge.send({ type: 'respons', ok: false, msg: e.message, daftar });
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
        const next = {
          github: {
            repo: String(cmd.repo || '').trim(),
            token: cmd.token || '',
            includePrereleases: Boolean(cmd.includePrereleases),
          },
          whatsapp: {
            channel: cmd.channel || '',
            phone: cmd.phone || '',
            format: cmd.formatChannel === 'teks' ? 'teks' : 'pertanyaan',
          },
          bot: {
            checkIntervalMinutes: Number(cmd.intervalMinutes) || 15,
            postOnFirstRun: Boolean(cmd.postOnFirstRun),
            testMessageOnSetup: cmd.testMessageOnSetup !== false,
            mode: normalMode(cmd.mode),
            adaptifMaksMenit: Math.min(240, Math.max(10, Number(cmd.adaptifMaksMenit) || 60)),
          },
          grup: {
            aktif: Boolean(cmd.grupAktif),
            target: String(cmd.grupTarget || '').trim(),
            intervalMinutes: Number(cmd.grupInterval) || 5,
            daftarHitam: String(cmd.grupHitam || ''),
            linkRules: cmd.linkRules == null ? LINK_RULES_DEFAULT : String(cmd.linkRules).trim(),
            ringkasRules: String(cmd.ringkasRules || '').trim(),
            perintahAktif: cmd.perintahAktif !== false,
            samarkanNomor: cmd.samarkanNomor !== false,
          },
        };
        if (!next.github.repo && !next.grup.aktif) {
          bridge.send({ type: 'cmd_error', msg: 'Isi repo GitHub, atau nyalain penjaga grup — minimal salah satu.' });
          return;
        }
        if (next.grup.aktif && !next.grup.target) {
          bridge.send({ type: 'cmd_error', msg: 'Penjaga grup nyala tapi link grup-nya kosong.' });
          return;
        }
        if (cfg?.whatsapp?.channel !== next.whatsapp.channel) state.channelJid = null;
        cfg = next;
        fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 2));
        saveState();
        log(`⚙️ Setting diperbarui: repo=${next.github.repo || '-'}, channel=${next.whatsapp.channel || '-'}, ` +
          `interval=${next.bot.checkIntervalMinutes}m, grup=${next.grup.aktif ? 'nyala' : 'mati'}, mode=${next.bot.mode}`);
        if (running) {
          faktorAdaptif = 1;
          scheduleNext(repoAda() ? intervalMs() : 0);
          jadwalGrup(5000);
          terapkanMode();
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

      case 'bangun':
        // dari app (mode pintar): ada notifikasi WhatsApp baru
        if (mode() === 'pintar' || cmd.paksa) bangun('notif');
        break;

      case 'lihat-respons':
        if (!perluCfg()) return;
        void doLihatRespons(cmd.serverId);
        break;

      case 'plugin-muat':
        plugin.muat();
        kirimDaftarPlugin();
        break;

      case 'plugin-daftar':
        kirimDaftarPlugin();
        break;

      case 'reset-hitam':
        if (state.grup) { state.grup.hitam = []; state.grup.hitamInfo = []; saveState(); }
        log('🧽 Daftar hitam otomatis dikosongin (yang manual di setting nggak disentuh).');
        lihatHitam(true);
        emitStatus();
        break;

      default:
        log('cmd tidak dikenal: ' + cmd?.type);
    }
  }

  // ----------------------------- init ---------------------------------------
  log('🦴 wa-release-bot engine siap (node ' + process.version + '). Menunggu perintah dari app.');
  plugin.muat();
  emitStatus();

  if (cfg) {
    log('Config terbaca: repo=' + (cfg.github?.repo || '-') + ', channel=' + (cfg.whatsapp?.channel || '-') +
      (cfg.grup?.aktif ? ', penjaga grup nyala' : ''));
    if (cfg._autoStart) startEngine();
  }
}
