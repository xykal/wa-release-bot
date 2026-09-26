// ============================================================================
//  wa-release-bot — engine bot (jalan di dalam app Android via nodejs-mobile)
//
//  Alur "bot tidur":
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
import { connectToWhatsApp, resolveChannelJid, sendText } from './wa.mjs';
import { formatReleasePost, formatTestMessage } from './format.mjs';

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

  const cfgFile = path.join(dataDir, 'config.json');
  const stateFile = path.join(dataDir, 'state.json');
  const sessionDir = path.join(dataDir, 'session');

  let state = { lastTag: null, channelJid: null, postCount: 0, lastPostedAt: null };
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
  let timer = null;
  let setupInFlight = false;

  // ----------------------------- bridge ------------------------------------
  function log(msg) {
    console.log(msg); // juga ke logcat (redirect dari native)
    bridge.send({ type: 'log', msg, ts: Date.now() });
  }

  const bridge = createBridge({
    dataDir,
    wsPort: Number(process.env.WR_WS_PORT || 18790),
    log,
    onCommand: (cmd) => { void handleCommand(cmd); },
  });

  function emitStatus() {
    bridge.send({
      type: 'status',
      running,
      busy,
      waLinked: fs.existsSync(path.join(sessionDir, 'creds.json')),
      waConnected,
      lastTag: state.lastTag,
      lastPostedAt: state.lastPostedAt,
      postCount: state.postCount,
      lastCheckAt,
      nextCheckAt,
      channel: cfg?.whatsapp?.channel || null,
      repo: cfg?.github?.repo || null,
    });
  }

  // ----------------------------- scheduler ---------------------------------
  function scheduleNext(delayMs) {
    clearTimeout(timer);
    nextCheckAt = Date.now() + delayMs;
    emitStatus();
    timer = setTimeout(() => { void runCheck('jadwal'); }, delayMs);
  }

  function intervalMs() {
    const min = Number(cfg?.bot?.checkIntervalMinutes ?? 15);
    return Math.max(1, min) * 60_000;
  }

  function startEngine() {
    if (running) return;
    if (!cfg) {
      log('⚠️ Config belum di-set. Tekan "Simpan Setting" di app dulu.');
      return;
    }
    running = true;
    log('▶️ Engine nyala. Cek berikutnya dalam ' + Math.round(intervalMs() / 60000) + ' menit.');
    emitStatus();
    // cek pertama 3 detik setelah start
    scheduleNext(3000);
  }

  function stopEngine() {
    running = false;
    clearTimeout(timer);
    nextCheckAt = null;
    log('⏸️ Engine jeda (istirahat). Tekan "Mulai" di app buat lanjut.');
    emitStatus();
  }

  // ----------------------------- cek & post --------------------------------
  async function runCheck(source) {
    if (busy || !cfg) return;
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

  async function postRelease(rel) {
    const text = formatReleasePost(rel, cfg.github.repo);

    // WA baru nyambung DI SINI.
    const { sock, close } = await connectToWhatsApp({
      sessionDir,
      allowQr: false,
      onStatus: (m) => log(m),
    });
    waConnected = true;
    emitStatus();
    try {
      let jid = state.channelJid;
      if (!jid) {
        jid = await resolveChannelJid(sock, cfg.whatsapp.channel);
        state.channelJid = jid;
      }
      await sendText(sock, jid, text);
      state.lastTag = rel.tag;
      state.lastPostedAt = new Date().toISOString();
      state.postCount = (state.postCount || 0) + 1;
      saveState();
      log(`✅ POSTINGAN TERKIRIM ke channel! (postingan ke-${state.postCount})`);
      bridge.send({ type: 'posted', tag: rel.tag, count: state.postCount });
    } finally {
      waConnected = false;
      close();
      emitStatus();
    }
  }

  // ----------------------------- setup & test ------------------------------
  async function doSetup() {
    if (setupInFlight) { log('Setup lagi jalan... tunggu QR-nya discan dulu.'); return; }
    setupInFlight = true;
    emitStatus();
    try {
      log('🔧 SETUP: tunjukkan QR di layar, scan pakai WA lo (Linked Devices).');
      bridge.send({ type: 'setup_start' });
      const { sock, close } = await connectToWhatsApp({
        sessionDir,
        allowQr: true,
        emitQr: (qr) => {
          log('📱 QR baru ditampilkan — scan sekarang (QR ke-expire tiap ±20 dtk).');
          bridge.send({ type: 'qr', qr });
        },
        onStatus: (m) => log(m),
        timeoutMs: 240000,
      });
      try {
        const jid = await resolveChannelJid(sock, cfg.whatsapp.channel);
        state.channelJid = jid;
        log(`📡 Channel ketemu: ${jid}`);
        if (cfg.bot?.testMessageOnSetup !== false) {
          await sendText(sock, jid, formatTestMessage(cfg.github.repo));
          log('📨 Test message dikirim ke channel. Cek channel-nya!');
        }
        const rel = await fetchLatestRelease(cfg.github.repo, {
          token: cfg.github?.token || '',
          includePrereleases: Boolean(cfg.github?.includePrereleases),
        });
        state.lastTag = rel.tag;
        saveState();
        log(`🌱 Baseline release dicatat: ${rel.tag}`);
        bridge.send({ type: 'setup_done', tag: rel.tag, jid });
        log('🎉 SETUP SELESAI!');
      } finally {
        close();
      }
    } catch (e) {
      log(`💥 Setup gagal: ${e.message}`);
      bridge.send({ type: 'setup_error', msg: e.message });
      bridge.send({ type: 'qr', qr: null });
    } finally {
      setupInFlight = false;
      emitStatus();
    }
  }

  async function doTest() {
    try {
      log('🧪 Mengirim test message ke channel...');
      const { sock, close } = await connectToWhatsApp({ sessionDir, allowQr: false });
      try {
        let jid = state.channelJid;
        if (!jid) {
          jid = await resolveChannelJid(sock, cfg.whatsapp.channel);
          state.channelJid = jid;
          saveState();
        }
        await sendText(sock, jid, formatTestMessage(cfg.github.repo));
        log(`✅ Test message terkirim ke ${jid}`);
      } finally {
        close();
      }
    } catch (e) {
      log(`💥 Test gagal: ${e.message}`);
    }
  }

  // ----------------------------- commands ----------------------------------
  async function handleCommand(cmd) {
    switch (cmd?.type) {
      case 'ping':
        bridge.send({ type: 'pong', ts: Date.now() });
        break;

      case 'configure': {
        const next = {
          github: {
            repo: cmd.repo,
            token: cmd.token || '',
            includePrereleases: Boolean(cmd.includePrereleases),
          },
          whatsapp: { channel: cmd.channel },
          bot: {
            checkIntervalMinutes: Number(cmd.intervalMinutes) || 15,
            postOnFirstRun: Boolean(cmd.postOnFirstRun),
            testMessageOnSetup: cmd.testMessageOnSetup !== false,
          },
        };
        if (!next.github.repo || !next.whatsapp.channel) {
          bridge.send({ type: 'cmd_error', msg: 'repo & channel wajib diisi' });
          return;
        }
        cfg = next;
        fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 2));
        log(`⚙️ Setting diperbarui: repo=${next.github.repo}, channel=${next.whatsapp.channel}, interval=${next.bot.checkIntervalMinutes}m`);
        if (running) scheduleNext(intervalMs());
        emitStatus();
        break;
      }

      case 'start':
        if (!cfg) {
          bridge.send({ type: 'cmd_error', msg: 'Setting belum di-simpan. Tekan "Simpan Setting" dulu.' });
          return;
        }
        startEngine();
        break;

      case 'stop':
        stopEngine();
        break;

      case 'check':
        if (!cfg) { bridge.send({ type: 'cmd_error', msg: 'Setting belum di-simpan.' }); return; }
        void runCheck('manual');
        break;

      case 'setup':
        if (!cfg) { bridge.send({ type: 'cmd_error', msg: 'Setting belum di-simpan.' }); return; }
        void doSetup();
        break;

      case 'test':
        if (!cfg) { bridge.send({ type: 'cmd_error', msg: 'Setting belum di-simpan.' }); return; }
        void doTest();
        break;

      default:
        log('cmd tidak dikenal: ' + cmd?.type);
    }
  }

  // ----------------------------- init ---------------------------------------
  log('🦴 wa-release-bot engine siap (node ' + process.version + '). Menunggu perintah dari app.');
  emitStatus();

  if (cfg) {
    log('Config terbaca: repo=' + cfg.github.repo + ', channel=' + cfg.whatsapp.channel);
    // auto-start kalau app mengizinkan
    if (cfg._autoStart) startEngine();
  }
}
