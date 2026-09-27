#!/usr/bin/env node
// ============================================================================
//  wa-release-bot — bot WA yang tidur.
//
//  Mode:
//    --setup    (sekali seumur hidup) tautkan WA + catat channel + baseline release
//               tambah  --pair 08xxxx  buat pakai PAIRING CODE (tanpa scan QR)
//    --test     kirim test message ke channel buat cek
//    --once     CEK SEKALI: bangun → cek GitHub → post kalau ada baru → MATI.
//               (paling cocok buat cron — ini yang bikin bot "nggak nyala 24 jam")
//    --loop     cek berulang tiap N menit (proses tinggal nyala, tapi WA
//               tetap cuma nyambung pas mau post — buat yang males atur cron)
//    --dry-run  cek GitHub + tampilkan pesan yang bakal dikirim, nggak ngirim apa-apa
//
//  Opsi: --interval <menit>  override interval (buat --loop)
// ============================================================================

// PENTING: import polyfill WebCrypto PALING AWAL — Baileys butuh
// globalThis.crypto.subtle yang belum ada di Node 18. Lihat src/webcrypto.mjs.
import './webcrypto.mjs';

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchLatestRelease } from './github.mjs';
import { formatReleasePost, formatTestMessage } from './format.mjs';
import { connectToWhatsApp, resolveChannelJid, sendText } from './wa.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATE_FILE = path.join(ROOT, 'state.json');

function log(msg) {
  const t = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`[${t}] ${msg}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadConfig() {
  const p = path.join(ROOT, 'config.json');
  if (!existsSync(p)) {
    console.error('❌ config.json belum ada.\n   Salin dulu:  cp config.example.json config.json\n   Terus isi:  nano config.json');
    process.exit(1);
  }
  const cfg = JSON.parse(readFileSync(p, 'utf8'));
  if (!cfg.github?.repo || cfg.github.repo === 'owner/nama-repo') {
    console.error('❌ config.json: "github.repo" belum diisi. Contoh: "vercel/next.js"');
    process.exit(1);
  }
  if (!cfg.whatsapp?.channel) {
    console.error('❌ config.json: "whatsapp.channel" belum diisi. Contoh: "@channelku" atau "120363XXXX@g.us"');
    process.exit(1);
  }
  return cfg;
}

function loadState() {
  if (existsSync(STATE_FILE)) {
    try {
      return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    } catch {
      log('⚠️ state.json rusak, dianggap kosong.');
    }
  }
  return { lastTag: null, channelJid: null, postCount: 0, lastPostedAt: null };
}

function saveState(state) {
  mkdirSync(ROOT, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function postRelease(cfg, state, rel, { dryRun = false }) {
  const text = formatReleasePost(rel, cfg.github.repo);

  if (dryRun) {
    log('🔍 DRY RUN — ini pesan yang bakal dikirim (nggak dikirim beneran):');
    console.log('\n' + '─'.repeat(50) + '\n' + text + '\n' + '─'.repeat(50) + '\n');
    return;
  }

  // WA baru nyambung DI SINI. Nggak ada release = nggak pernah nyambung.
  const { sock, close } = await connectToWhatsApp({ sessionDir: cfg.whatsapp.sessionDir, allowQr: false });
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
    saveState(state);
    log(`✅ POSTINGAN TERKIRIM ke channel! (postingan ke-${state.postCount})`);
  } finally {
    close(); // WA langsung dilepas, proses ikut mati
  }
}

/** Inti bot: cek 1x, post kalau ada yang baru. */
async function checkOnce(cfg, state, { dryRun = false } = {}) {
  log(`👀 Cek GitHub ${cfg.github.repo} ...`);
  const rel = await fetchLatestRelease(cfg.github.repo, {
    token: cfg.github.token,
    includePrereleases: cfg.github.includePrereleases,
  });

  if (state.lastTag === rel.tag) {
    log(`😴 Nggak ada update (terakhir: ${state.lastTag}). Bot tidur lagi.`);
    return;
  }

  if (!state.lastTag) {
    if (cfg.bot?.postOnFirstRun) {
      log('✨ First run & postOnFirstRun=on → posting release yang sedang ada.');
      await postRelease(cfg, state, rel, { dryRun });
    } else {
      state.lastTag = rel.tag;
      saveState(state);
      log(`🌱 First run. Baseline dicatat: ${rel.tag}. Baru bakal posting kalau muncul yang lebih baru.`);
    }
    return;
  }

  log(`🚀 ADA RELEASE BARU! ${state.lastTag} → ${rel.tag}`);
  await postRelease(cfg, state, rel, { dryRun });
}

async function runSetup(cfg, state) {
  log('🔧 SETUP — nyambung ke WA. Kalau muncul QR: scan pakai WA lo');
  log('   (WA → ☰ → Linked Devices / Perangkat Tertaut → Link a Device / Hubungkan Perangkat)');
  const phone = flagVal('--pair') || cfg.whatsapp.phone || '';
  if (phone) log(`🔑 Mode pairing code buat nomor ${phone}`);
  const { sock, close } = await connectToWhatsApp({
    sessionDir: cfg.whatsapp.sessionDir,
    allowQr: true,
    phone,
    onStatus: (m) => log(m),
  });
  try {
    const jid = await resolveChannelJid(sock, cfg.whatsapp.channel);
    state.channelJid = jid;
    log(`📡 Channel ketemu: ${jid}`);

    if (cfg.bot?.testMessageOnSetup !== false) {
      await sendText(sock, jid, formatTestMessage(cfg.github.repo));
      log('📨 Test message dikirim. Cek channel-nya — kalau muncul, semua beres!');
    }

    const rel = await fetchLatestRelease(cfg.github.repo, {
      token: cfg.github.token,
      includePrereleases: cfg.github.includePrereleases,
    });
    state.lastTag = rel.tag;
    saveState(state);
    log(`🌱 Baseline release dicatat: ${rel.tag}`);
    log('🎉 SETUP SELESAI. Sekarang bot tinggal dijadwalkan (lihat README).');
  } finally {
    close();
  }
}

async function runTest(cfg, state) {
  const { sock, close } = await connectToWhatsApp({ sessionDir: cfg.whatsapp.sessionDir, allowQr: false });
  try {
    let jid = state.channelJid;
    if (!jid) {
      jid = await resolveChannelJid(sock, cfg.whatsapp.channel);
      state.channelJid = jid;
      saveState(state);
    }
    await sendText(sock, jid, formatTestMessage(cfg.github.repo));
    log(`✅ Test message terkirim ke ${jid}`);
  } finally {
    close();
  }
}

async function runDryRun(cfg, state) {
  log('🔍 MODE DRY RUN — cek GitHub doang, WA nggak disentuh, state nggak diubah.');
  const rel = await fetchLatestRelease(cfg.github.repo, {
    token: cfg.github.token,
    includePrereleases: cfg.github.includePrereleases,
  });
  log(`Release terbaru: ${rel.tag} | baseline bot: ${state.lastTag || '(belum ada — first run)'}\n`);
  const text = formatReleasePost(rel, cfg.github.repo);
  console.log('─'.repeat(50) + '\n' + text + '\n' + '─'.repeat(50));
  log('Beres. (Mode: ' + (state.lastTag && state.lastTag !== rel.tag ? '🚀 bakal posting' : '😴 bakal tidur') + ')');
}

async function runLoop(cfg, state, intervalMin) {
  log(`🔄 MODE LOOP — cek tiap ${intervalMin} menit. Bot "nyala" tapi 99% tidur. (Ctrl+C buat stop)`);
  for (;;) {
    try {
      await checkOnce(cfg, state);
    } catch (e) {
      log(`⚠️ Gagal cek: ${e.message}`);
    }
    await sleep(intervalMin * 60_000);
  }
}

// ------------------------------- main ------------------------------------
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const flagVal = (f) => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : undefined;
};

const mode = flag('--setup') ? 'setup' : flag('--test') ? 'test' : flag('--loop') ? 'loop' : flag('--dry-run') ? 'dry-run' : 'once';

if (mode === 'loop') {
  process.on('SIGINT', () => {
    log('👋 Bot dipanggil, tidur dulu ya.');
    process.exit(0);
  });
}

try {
  const cfg = loadConfig();
  const state = loadState();
  const intervalMin = Math.max(1, parseInt(flagVal('--interval') ?? cfg.bot?.checkIntervalMinutes ?? 15, 10));

  if (mode === 'setup') await runSetup(cfg, state);
  else if (mode === 'test') await runTest(cfg, state);
  else if (mode === 'dry-run') await runDryRun(cfg, state);
  else if (mode === 'loop') await runLoop(cfg, state, intervalMin);
  else await checkOnce(cfg, state); // --once (default)
} catch (e) {
  log(`💥 ${e.message}`);
  process.exit(1);
}
