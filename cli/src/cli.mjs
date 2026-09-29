// ============================================================================
//  wa-release-bot CLI — bot WA yang tidur. Engine-nya SAMA dengan APK
//  (../../bot-js/src); file ini cuma pembungkus terminal: config.json,
//  state.json, QR di terminal, dan mode --once buat cron.
//
//  Mode:
//    --setup    (sekali seumur hidup) tautkan WA + catat channel + baseline release
//               tambah  --pair 08xxxx  buat pakai PAIRING CODE (tanpa scan QR)
//    --test     kirim test message ke channel
//    --once     cek sekali -> post kalau ada yang baru -> mati (buat cron)
//    --loop     cek berulang tiap N menit (WA tetap cuma nyambung pas posting)
//    --dry-run  cek GitHub + tampilkan pesan yang bakal dikirim, tanpa kirim
//    --version  versi + brand
//  Opsi: --interval <menit>  override interval (buat --loop)
// ============================================================================
import '../../bot-js/polyfills/webcrypto.cjs';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import qrcode from 'qrcode-terminal';
import { fetchLatestRelease } from '../../bot-js/src/github.mjs';
import { formatReleasePost, formatTestMessage } from '../../bot-js/src/format.mjs';
import { connectToWhatsApp, resolveChannel, kirimKeChannel, pakaiPertanyaan } from '../../bot-js/src/wa.mjs';
import { putuskanRilis, pendingBerikut, MAKS_PERCOBAAN } from '../../bot-js/src/rilis.mjs';

// Folder config.json / state.json / wa-session. Default: folder cli/ ini.
// WA_RELEASE_BOT_DIR memindahkannya (beberapa bot di satu mesin, atau tes).
const ROOT = process.env.WA_RELEASE_BOT_DIR
  ? path.resolve(process.env.WA_RELEASE_BOT_DIR)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATE_FILE = path.join(ROOT, 'state.json');

function log(msg) {
  const t = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`[${t}] ${msg}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadConfig() {
  const p = path.join(ROOT, 'config.json');
  if (!existsSync(p)) {
    console.error(`config.json belum ada di ${ROOT}\n   Salin dulu:  cp config.example.json config.json\n   Terus isi:  nano config.json`);
    process.exit(1);
  }
  const cfg = JSON.parse(readFileSync(p, 'utf8'));
  if (!cfg.github?.repo || cfg.github.repo === 'owner/nama-repo') {
    console.error('config.json: "github.repo" belum diisi. Contoh: "vercel/next.js"');
    process.exit(1);
  }
  if (!cfg.whatsapp?.channel) {
    console.error('config.json: "whatsapp.channel" belum diisi. Contoh: link channel atau "120363XXXX@g.us"');
    process.exit(1);
  }
  cfg.whatsapp.sessionDir = path.resolve(ROOT, cfg.whatsapp.sessionDir || './wa-session');
  return cfg;
}

function loadState() {
  if (existsSync(STATE_FILE)) {
    try {
      return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    } catch {
      log('state.json rusak, dianggap kosong.');
    }
  }
  return { lastTag: null, channelJid: null, postCount: 0, lastPostedAt: null, rilisEtag: null, pending: null };
}

function saveState(state) {
  mkdirSync(ROOT, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

/** Nyambung pakai sesi yang ada; kalau belum ditautkan, kasih perintah setup. */
async function sambung(cfg, opsi = {}) {
  try {
    return await connectToWhatsApp({ sessionDir: cfg.whatsapp.sessionDir, mode: 'none', onStatus: log, ...opsi });
  } catch (e) {
    if (e?.code === 'BELUM_TAUT') {
      throw new Error('WA belum ditautkan. Jalankan dulu:  npm run setup  (QR)  atau  npm run setup -- --pair 08xxxx  (pairing code).');
    }
    throw e;
  }
}

async function targetJid(sock, cfg, state) {
  if (state.channelJid) return state.channelJid;
  const hasil = await resolveChannel(sock, cfg.whatsapp.channel, log);
  state.channelJid = hasil.jid;
  saveState(state);
  log(`Target ketemu: ${hasil.nama || '(tanpa nama)'} -> ${hasil.jid}`);
  return hasil.jid;
}

const opsiKirim = (cfg, jid) => ({
  format: cfg.whatsapp.format === 'teks' ? 'teks' : 'pertanyaan',
  ajak: { ajakBalas: pakaiPertanyaan(jid, cfg.whatsapp.format) },
});

async function postRelease(cfg, state, rel, { dryRun = false, manual = false }) {
  if (dryRun) {
    log('DRY RUN — ini pesan yang bakal dikirim (nggak dikirim beneran):');
    console.log('\n' + '─'.repeat(50) + '\n' + formatReleasePost(rel, cfg.github.repo) + '\n' + '─'.repeat(50) + '\n');
    return;
  }
  state.pending = pendingBerikut(state.pending, rel.tag, { manual });
  saveState(state);
  if (state.pending.percobaan > 1) log(`Kirim ${rel.tag} percobaan ke-${state.pending.percobaan} dari ${MAKS_PERCOBAAN}.`);

  // WA baru nyambung DI SINI. Nggak ada release = nggak pernah nyambung.
  const { sock, close } = await sambung(cfg);
  try {
    const jid = await targetJid(sock, cfg, state);
    const { format, ajak } = opsiKirim(cfg, jid);
    await kirimKeChannel(sock, jid, formatReleasePost(rel, cfg.github.repo, ajak), { format, log });
    state.lastTag = rel.tag;
    state.pending = null;
    state.lastPostedAt = new Date().toISOString();
    state.postCount = (state.postCount || 0) + 1;
    saveState(state);
    log(`POSTINGAN TERKIRIM ke channel! (postingan ke-${state.postCount})`);
  } finally {
    close(); // WA langsung dilepas, proses ikut mati
  }
}

/** Inti bot: cek 1x, post kalau ada yang baru. */
async function checkOnce(cfg, state, { dryRun = false, manual = false } = {}) {
  log(`Cek GitHub ${cfg.github.repo} ...`);
  const rel = await fetchLatestRelease(cfg.github.repo, {
    token: cfg.github.token,
    includePrereleases: cfg.github.includePrereleases,
    etag: dryRun ? '' : state.rilisEtag || '',
  });
  if (!rel.notModified && rel.etag && rel.etag !== state.rilisEtag && !dryRun) {
    state.rilisEtag = rel.etag;
    saveState(state);
  }

  const { aksi, alasan } = putuskanRilis({ state, rel, postOnFirstRun: Boolean(cfg.bot?.postOnFirstRun), manual });
  switch (aksi) {
    case 'tidur':
      log(`Nggak ada update (${alasan}). Bot tidur lagi.`);
      return;
    case 'baseline':
      state.lastTag = rel.tag;
      saveState(state);
      log(`First run. Baseline dicatat: ${rel.tag}. Baru bakal posting kalau muncul yang lebih baru.`);
      return;
    case 'rollback':
      state.lastTag = rel.tag;
      state.pending = null;
      saveState(state);
      log(`Release terbaru sekarang ${rel.tag} (${alasan}) — dianggap rollback, nggak diumumkan.`);
      return;
    case 'lewati-gagal':
      log(`${alasan}. Dilewati; jalankan  npm run once -- --ulang  buat coba dari nol.`);
      return;
    default:
      log(state.lastTag ? `ADA RELEASE BARU! ${alasan}` : `${alasan} -> posting release yang sedang ada.`);
      await postRelease(cfg, state, rel, { dryRun, manual });
  }
}

async function runSetup(cfg, state) {
  const phone = flagVal('--pair') || cfg.whatsapp.phone || '';
  log(phone ? `SETUP — mode pairing code buat nomor ${phone}` : 'SETUP — nyambung ke WA, scan QR dari HP lain');
  const { sock, close } = await connectToWhatsApp({
    sessionDir: cfg.whatsapp.sessionDir,
    mode: phone ? 'pairing' : 'qr',
    phone,
    onStatus: log,
    emitQr: (qr) => {
      console.log('\nScan QR ini pakai WhatsApp (dari HP lain):');
      console.log('   WA -> titik tiga -> Perangkat tertaut -> Tautkan perangkat\n');
      qrcode.generate(qr, { small: true });
      console.log('\n   (QR ganti tiap 20 detik. Satu HP doang? Pakai:  npm run setup -- --pair 08xxxx)\n');
    },
    emitPairingCode: (kode) => {
      console.log(`\nPAIRING CODE:  ${kode}\n`);
      console.log('   WA -> titik tiga -> Perangkat tertaut -> Tautkan perangkat');
      console.log('   -> "Tautkan dengan nomor telepon saja" -> ketik kode di atas.\n');
    },
  });
  try {
    const jid = await targetJid(sock, cfg, state);
    if (cfg.bot?.testMessageOnSetup !== false) {
      const { format, ajak } = opsiKirim(cfg, jid);
      await kirimKeChannel(sock, jid, formatTestMessage(cfg.github.repo, ajak), { format, log });
      log('Test message dikirim. Cek channel-nya — kalau muncul, semua beres.');
    }
    const rel = await fetchLatestRelease(cfg.github.repo, {
      token: cfg.github.token,
      includePrereleases: cfg.github.includePrereleases,
    });
    state.lastTag = rel.tag;
    state.rilisEtag = rel.etag || null;
    saveState(state);
    log(`Baseline release dicatat: ${rel.tag}`);
    log('SETUP SELESAI. Sekarang bot tinggal dijadwalkan (lihat README).');
  } finally {
    close();
  }
}

async function runTest(cfg, state) {
  const { sock, close } = await sambung(cfg);
  try {
    const jid = await targetJid(sock, cfg, state);
    const { format, ajak } = opsiKirim(cfg, jid);
    await kirimKeChannel(sock, jid, formatTestMessage(cfg.github.repo, ajak), { format, log });
    log(`Test message terkirim ke ${jid}`);
  } finally {
    close();
  }
}

async function runDryRun(cfg, state) {
  log('MODE DRY RUN — cek GitHub doang, WA nggak disentuh, state nggak diubah.');
  const rel = await fetchLatestRelease(cfg.github.repo, {
    token: cfg.github.token,
    includePrereleases: cfg.github.includePrereleases,
  });
  log(`Release terbaru: ${rel.tag} | baseline bot: ${state.lastTag || '(belum ada — first run)'}\n`);
  console.log('─'.repeat(50) + '\n' + formatReleasePost(rel, cfg.github.repo) + '\n' + '─'.repeat(50));
  const { aksi } = putuskanRilis({ state, rel, postOnFirstRun: Boolean(cfg.bot?.postOnFirstRun) });
  log(`Beres. Keputusan kalau ini cek beneran: ${aksi}`);
}

async function runLoop(cfg, state, intervalMin) {
  log(`MODE LOOP — cek tiap ${intervalMin} menit. Bot "nyala" tapi 99% tidur. (Ctrl+C buat stop)`);
  for (;;) {
    try {
      await checkOnce(cfg, state);
    } catch (e) {
      log(`Gagal cek: ${e.message}`);
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
    log('Bot dipanggil, tidur dulu ya.');
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
  else await checkOnce(cfg, state, { manual: flag('--ulang') }); // --once (default)
} catch (e) {
  log(`Gagal: ${e.message}`);
  process.exit(1);
}
