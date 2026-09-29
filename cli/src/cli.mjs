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
import { formatReleasePost, formatTestMessage, formatLaporGagal } from '../../bot-js/src/format.mjs';
import { connectToWhatsApp, resolveChannel, kirimKeChannel, pakaiPertanyaan, laporKeDiri } from '../../bot-js/src/wa.mjs';
import { putuskanRilis, pendingBerikut, MAKS_PERCOBAAN } from '../../bot-js/src/rilis.mjs';
import { daftarRepo, repoTidakValid, teksRepo, stateRepo, sinkronState } from '../../bot-js/src/repo.mjs';
import { rekamChannel } from '../../bot-js/src/rekam.mjs';

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
  // Boleh lebih dari satu: "vercel/next.js, xykal/wa-release-bot" (atau array).
  const salah = repoTidakValid(cfg.github?.repo);
  if (salah.length) {
    console.error(`config.json: "github.repo" nggak valid: ${salah.join(', ')}. Formatnya pemilik/nama-repo, pisahkan koma kalau lebih dari satu.`);
    process.exit(1);
  }
  cfg.github.repos = daftarRepo(cfg.github?.repo);
  if (!cfg.github.repos.length || cfg.github.repos[0] === 'owner/nama-repo') {
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
  return { channelJid: null, postCount: 0, lastPostedAt: null, repos: {} };
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
  format: cfg.whatsapp.format === 'pertanyaan' ? 'pertanyaan' : 'teks',
  ajak: { ajakBalas: pakaiPertanyaan(jid, cfg.whatsapp.format) },
});

async function postRelease(cfg, state, repo, st, rel, { dryRun = false, manual = false }) {
  if (dryRun) {
    log('DRY RUN — ini pesan yang bakal dikirim (nggak dikirim beneran):');
    console.log('\n' + '─'.repeat(50) + '\n' + formatReleasePost(rel, repo) + '\n' + '─'.repeat(50) + '\n');
    return;
  }
  st.pending = pendingBerikut(st.pending, rel.tag, { manual });
  saveState(state);
  if (st.pending.percobaan > 1) log(`Kirim ${repo} ${rel.tag} percobaan ke-${st.pending.percobaan} dari ${MAKS_PERCOBAAN}.`);

  // WA baru nyambung DI SINI. Nggak ada release = nggak pernah nyambung.
  const { sock, close } = await sambung(cfg);
  try {
    try {
      const jid = await targetJid(sock, cfg, state);
      const { format, ajak } = opsiKirim(cfg, jid);
      await kirimKeChannel(sock, jid, formatReleasePost(rel, repo, ajak), { format, log });
    } catch (e) {
      // Percobaan terakhir: lapor ke chat diri sendiri selagi socket masih ada.
      if (st.pending.percobaan >= MAKS_PERCOBAAN) {
        await laporKeDiri(sock, formatLaporGagal({ tag: rel.tag, repo, percobaan: st.pending.percobaan, maks: MAKS_PERCOBAAN, error: e.message, cli: true }), log);
      }
      throw e;
    }
    st.lastTag = rel.tag;
    st.pending = null;
    state.lastPostedAt = new Date().toISOString();
    state.postCount = (state.postCount || 0) + 1;
    saveState(state);
    log(`POSTINGAN TERKIRIM ke channel! (postingan ke-${state.postCount})`);
  } finally {
    close(); // WA langsung dilepas, proses ikut mati
  }
}

/** Inti bot: cek 1x semua repo, post kalau ada yang baru. */
async function checkOnce(cfg, state, { dryRun = false, manual = false } = {}) {
  if (!dryRun && sinkronState(state, cfg.github.repos)) saveState(state); // state era satu repo
  let gagal = 0;
  for (const repo of cfg.github.repos) {
    try {
      await cekSatuRepo(cfg, state, repo, { dryRun, manual });
    } catch (e) {
      gagal += 1;
      log(`Gagal cek ${repo}: ${e.message}`);
    }
  }
  if (gagal && gagal === cfg.github.repos.length) throw new Error('semua repo gagal dicek');
}

async function cekSatuRepo(cfg, state, repo, { dryRun, manual }) {
  const st = stateRepo(state, repo);
  const nama = cfg.github.repos.length > 1 ? `${repo}: ` : '';
  log(`Cek GitHub ${repo} ...`);
  const rel = await fetchLatestRelease(repo, {
    token: cfg.github.token,
    includePrereleases: cfg.github.includePrereleases,
    etag: dryRun ? '' : st.rilisEtag || '',
  });
  if (!rel.notModified && rel.etag && rel.etag !== st.rilisEtag && !dryRun) {
    st.rilisEtag = rel.etag;
    saveState(state);
  }

  const { aksi, alasan } = putuskanRilis({ state: st, rel, postOnFirstRun: Boolean(cfg.bot?.postOnFirstRun), manual });
  switch (aksi) {
    case 'tidur':
      log(`${nama}Nggak ada update (${alasan}). Bot tidur lagi.`);
      return;
    case 'baseline':
      st.lastTag = rel.tag;
      saveState(state);
      log(`${nama}First run. Baseline dicatat: ${rel.tag}. Baru bakal posting kalau muncul yang lebih baru.`);
      return;
    case 'rollback':
      st.lastTag = rel.tag;
      st.pending = null;
      saveState(state);
      log(`${nama}Release terbaru sekarang ${rel.tag} (${alasan}) — dianggap rollback, nggak diumumkan.`);
      return;
    case 'lewati-gagal':
      log(`${nama}${alasan}. Dilewati; jalankan  npm run once -- --ulang  buat coba dari nol.`);
      return;
    default:
      log(st.lastTag ? `${nama}ADA RELEASE BARU! ${alasan}` : `${nama}${alasan} -> posting release yang sedang ada.`);
      await postRelease(cfg, state, repo, st, rel, { dryRun, manual });
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
      await kirimKeChannel(sock, jid, formatTestMessage(teksRepo(cfg.github.repos), ajak), { format, log });
      log('Test message dikirim. Cek channel-nya — kalau muncul, semua beres.');
    }
    sinkronState(state, cfg.github.repos);
    for (const repo of cfg.github.repos) {
      const rel = await fetchLatestRelease(repo, {
        token: cfg.github.token,
        includePrereleases: cfg.github.includePrereleases,
      });
      const st = stateRepo(state, repo);
      st.lastTag = rel.tag;
      st.rilisEtag = rel.etag || null;
      saveState(state);
      log(`Baseline release dicatat: ${repo} ${rel.tag}`);
    }
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
    await kirimKeChannel(sock, jid, formatTestMessage(teksRepo(cfg.github.repos), ajak), { format, log });
    log(`Test message terkirim ke ${jid}`);
  } finally {
    close();
  }
}

async function runDryRun(cfg, state) {
  log('MODE DRY RUN — cek GitHub doang, WA nggak disentuh, state nggak diubah.');
  const salinan = JSON.parse(JSON.stringify(state)); // state asli tidak boleh berubah
  sinkronState(salinan, cfg.github.repos);
  for (const repo of cfg.github.repos) {
    const st = stateRepo(salinan, repo);
    const rel = await fetchLatestRelease(repo, {
      token: cfg.github.token,
      includePrereleases: cfg.github.includePrereleases,
    });
    log(`${repo}: release terbaru ${rel.tag} | baseline bot: ${st.lastTag || '(belum ada — first run)'}\n`);
    console.log('─'.repeat(50) + '\n' + formatReleasePost(rel, repo) + '\n' + '─'.repeat(50));
    const { aksi } = putuskanRilis({ state: st, rel, postOnFirstRun: Boolean(cfg.bot?.postOnFirstRun) });
    log(`Keputusan kalau ini cek beneran: ${aksi}`);
  }
  log('Beres.');
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

/**
 * Alat debug: rekam pesan channel (riwayat + live) ke rekaman-channel.json.
 * Dipakai buat nangkep bentuk asli post "Pertanyaan" yang dibuat dari HP.
 */
async function runRekam(cfg, state, { jumlah, tungguDetik }) {
  const { sock, close } = await sambung(cfg);
  try {
    const jid = await targetJid(sock, cfg, state);
    const rekaman = await rekamChannel(sock, jid, { jumlah, tungguDetik, log });
    const tujuan = path.join(ROOT, 'rekaman-channel.json');
    writeFileSync(tujuan, JSON.stringify(rekaman, null, 2));
    for (const e of [...rekaman.diambil, ...rekaman.masuk]) log(`  ${e.attrs?.server_id ?? 'live'}: ${e.jenis ?? e.gagalDecode ?? 'tanpa plaintext'}`);
    log(`Rekaman disimpan: ${tujuan} (kirim file ini ke dev, isinya udah dipotong & tanpa media).`);
  } finally {
    close();
  }
}

// ------------------------------- main ------------------------------------
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const flagVal = (f) => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : undefined;
};

const mode = flag('--setup') ? 'setup' : flag('--test') ? 'test' : flag('--loop') ? 'loop' : flag('--dry-run') ? 'dry-run' : flag('--rekam') ? 'rekam' : 'once';

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
  else if (mode === 'rekam') await runRekam(cfg, state, { jumlah: parseInt(flagVal('--jumlah') ?? 10, 10), tungguDetik: parseInt(flagVal('--tunggu') ?? 0, 10) });
  else await checkOnce(cfg, state, { manual: flag('--ulang') }); // --once (default)
} catch (e) {
  log(`Gagal: ${e.message}`);
  process.exit(1);
}
