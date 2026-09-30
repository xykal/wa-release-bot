// Uji ujung-ke-ujung engine TANPA WhatsApp.
//
// Kenapa perlu: unit test di unit.test.mjs cuma menguji fungsi murni. Sejak
// bot.mjs dipecah ke src/mesin/*, kesalahan yang paling mungkin adalah salah
// rujuk antar modul (fungsi tidak ada di ctx, import kelewat) — dan itu baru
// meledak saat perintah tertentu dijalankan. Test ini menjalankan src/bot.mjs
// sebagai proses anak persis seperti di APK: perintah lewat file cmd.json,
// jawaban lewat events.jsonl, dan GitHub API diarahkan ke server HTTP lokal
// (WR_GITHUB_API). Perintah yang menyentuh WhatsApp (setup, test, cek-channel,
// lagu, grup) sengaja TIDAK dipanggil: butuh sesi WA sungguhan.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BOT = fileURLToPath(new URL('../src/bot.mjs', import.meta.url));
const POLYFILL = fileURLToPath(new URL('../polyfills/webcrypto.cjs', import.meta.url));
const REPO = 'octo/demo';
const TAG = 'v1.2.3';

function tidur(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// GitHub palsu: hanya endpoint yang dipakai engine untuk repo di atas.
function buatGithubPalsu() {
  const server = http.createServer((req, res) => {
    if (req.url === `/repos/${REPO}/releases/latest`) {
      res.writeHead(200, { 'content-type': 'application/json', etag: 'W/"tes-etag"' });
      res.end(JSON.stringify({
        tag_name: TAG,
        name: TAG,
        body: 'catatan rilis uji',
        html_url: `https://github.com/${REPO}/releases/tag/${TAG}`,
        published_at: '2026-09-29T00:00:00Z',
        author: { login: 'octo' },
        prerelease: false,
        draft: false,
        assets: [],
      }));
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end('{}');
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

class Engine {
  constructor(dataDir, port) {
    this.dataDir = dataDir;
    this.eventsFile = path.join(dataDir, 'events.jsonl');
    this.cmdFile = path.join(dataDir, 'cmd.json');
    this.dibaca = 0; // jumlah baris events.jsonl yang sudah dibaca dari disk
    this.antrian = []; // event yang sudah dibaca tapi belum dipakai tunggu()
    this.keluaran = '';
    // -r polyfill: di Node 18 Baileys butuh globalThis.crypto (di APK bundle
    // membawa polyfill ini di banner; di sini source dijalankan langsung).
    this.proc = spawn(process.execPath, ['-r', POLYFILL, BOT], {
      env: {
        ...process.env,
        WR_DATA_DIR: dataDir,
        WR_WS_PORT: '0', // port acak: tiga job matrix CI tidak boleh saling tabrak
        WR_GITHUB_API: `http://127.0.0.1:${port}`,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.proc.stdout.on('data', (d) => { this.keluaran += d; });
    this.proc.stderr.on('data', (d) => { this.keluaran += d; });
  }

  kirim(cmd) {
    // Bridge memindahkan cmd.json ke cmd.json.proc sebelum membaca. Kalau file
    // sebelumnya belum diambil (poll tiap 1 dtk), tunggu dulu supaya tidak
    // menimpa perintah yang belum diproses.
    return (async () => {
      for (let i = 0; i < 50 && fs.existsSync(this.cmdFile); i++) await tidur(100);
      fs.writeFileSync(this.cmdFile, JSON.stringify(cmd) + '\n');
    })();
  }

  bacaBaru() {
    if (!fs.existsSync(this.eventsFile)) return;
    const semua = fs.readFileSync(this.eventsFile, 'utf8').split('\n').filter(Boolean);
    for (const baris of semua.slice(this.dibaca)) this.antrian.push(JSON.parse(baris));
    this.dibaca = semua.length;
  }

  /**
   * Tunggu event pertama yang lolos `cocok`. Event SEBELUM yang cocok dibuang
   * (urutan harapan test memang berurutan); event SESUDAHNYA tetap di antrian
   * supaya status yang menyusul di batch yang sama tidak hilang.
   */
  async tunggu(cocok, keterangan, batasMs = 20000) {
    const mulai = Date.now();
    while (Date.now() - mulai < batasMs) {
      this.bacaBaru();
      while (this.antrian.length) {
        const ev = this.antrian.shift();
        if (cocok(ev)) return ev;
      }
      if (this.proc.exitCode !== null) break;
      await tidur(100);
    }
    throw new Error(`Tidak ada event "${keterangan}" dalam ${batasMs} ms. Keluaran engine:\n${this.keluaran.slice(-3000)}`);
  }

  tungguLog(potongan) {
    return this.tunggu((ev) => ev.type === 'log' && String(ev.msg).includes(potongan), `log berisi "${potongan}"`);
  }

  async tungguStatus(cocok, keterangan) {
    // Status dikirim berulang; ambil yang terbaru yang memenuhi syarat.
    return this.tunggu((ev) => ev.type === 'status' && cocok(ev), keterangan);
  }

  matikan() {
    // Engine sengaja mencegat process.exit (jaring pengaman nodejs-mobile),
    // jadi SIGKILL adalah satu-satunya cara bersih untuk mengakhiri.
    if (this.proc.exitCode === null) this.proc.kill('SIGKILL');
  }
}

test('engine: nyala, configure, start, cek release ke GitHub palsu, stop', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-engine-'));
  const { server, port } = await buatGithubPalsu();
  const engine = new Engine(dataDir, port);
  t.after(() => {
    engine.matikan();
    server.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  await engine.tungguLog('engine siap');
  const awal = await engine.tungguStatus(() => true, 'status awal');
  assert.equal(awal.running, false);
  assert.equal(awal.repo, null);

  await engine.kirim({ type: 'ping' });
  await engine.tunggu((ev) => ev.type === 'pong', 'pong');

  // start tanpa setting harus ditolak dengan pesan, bukan crash.
  await engine.kirim({ type: 'start' });
  await engine.tunggu((ev) => ev.type === 'cmd_error' && /Setting belum/.test(ev.msg), 'cmd_error start tanpa cfg');

  await engine.kirim({ type: 'configure', repo: 'bukan-repo', intervalMinutes: 15 });
  await engine.tunggu((ev) => ev.type === 'cmd_error' && /Repo nggak valid/.test(ev.msg), 'cmd_error repo salah');

  await engine.kirim({
    type: 'configure', repo: REPO, channel: '', token: '', intervalMinutes: 15,
    includePrereleases: false, postOnFirstRun: false, testMessageOnSetup: false,
  });
  const sesudahCfg = await engine.tungguStatus((ev) => ev.repo === REPO, 'status repo tersimpan');
  assert.equal(sesudahCfg.running, false);
  const cfg = JSON.parse(fs.readFileSync(path.join(dataDir, 'config.json'), 'utf8'));
  assert.equal(cfg.github.repo, REPO);
  assert.equal(cfg.bot.checkIntervalMinutes, 15);

  // --- Modul "Bot WA umum" (M14/M15): moderasi grup + perintah pribadi. ---
  // Semua di bawah ini dites TANPA WA: yang diuji cuma bacaan setting, jawaban
  // perintah chat, dan konversi stiker dari app — persis bagian yang nggak
  // butuh jaringan.
  assert.equal(cfg.jaga.moderasi, false, 'moderasi default mati');
  assert.equal(cfg.jaga.perintah, false, 'perintah pribadi opt-in: default mati');

  await engine.kirim({
    type: 'configure', repo: REPO, channel: '', token: '', intervalMinutes: 15,
    moderasiAktif: true, moderasiStrike: 3, moderasiKata: 'sewa akun\njudol',
    moderasiDomain: 'bit.ly, scam.example', moderasiIzinkanLink: true,
    storyKe: '628111222333, 628444555666', perintahPribadi: true,
  });
  await engine.tungguStatus((ev) => ev.moderasiAktif === true, 'status moderasi nyala');
  const cfg2 = JSON.parse(fs.readFileSync(path.join(dataDir, 'config.json'), 'utf8'));
  assert.equal(cfg2.jaga.moderasi, true);
  assert.equal(cfg2.jaga.batasStrike, 3);
  assert.deepEqual(cfg2.jaga.kataTerlarang, ['sewa akun', 'judol']);
  assert.deepEqual(cfg2.jaga.linkTerlarang, ['bit.ly', 'scam.example']);
  assert.equal(cfg2.jaga.izinkanLink, true);
  assert.deepEqual(cfg2.jaga.storyKe, ['628111222333@s.whatsapp.net', '628444555666@s.whatsapp.net']);

  // batasStrike dijepit 1..5
  await engine.kirim({ type: 'configure', repo: REPO, channel: '', token: '', intervalMinutes: 15, moderasiAktif: true, moderasiStrike: 99 });
  await engine.tungguStatus((ev) => ev.moderasiAktif === true, 'status moderasi nyala lagi');
  const cfg3 = JSON.parse(fs.readFileSync(path.join(dataDir, 'config.json'), 'utf8'));
  assert.equal(cfg3.jaga.batasStrike, 5);

  // Perintah engine: stiker-jadi tanpa data harus diam (bukan crash).
  await engine.kirim({ type: 'stiker-jadi', id: 'stiker-1' });

  // Stiker lewat berkas: app nulis hasil WebP di dataDir, engine baca + kirim,
  // lalu dua berkasnya (masuk & keluar) dihapus. Di test ini WA belum nyambung,
  // jadi kirimnya pasti gagal — yang dibuktikan: gagalnya ke-log, bukan crash,
  // dan berkas sementaranya tetap dibersihkan (kalau nggak, numpuk di HP).
  const dirStiker = path.join(dataDir, 'stiker');
  fs.mkdirSync(dirStiker, { recursive: true });
  fs.writeFileSync(path.join(dirStiker, 'masuk-uji.img'), Buffer.from('foto-palsu'));
  fs.writeFileSync(path.join(dirStiker, 'keluar-uji.webp'), Buffer.from('webp-palsu'));
  await engine.kirim({ type: 'stiker-jadi', id: 'uji', file: 'stiker/keluar-uji.webp', kb: 1 });
  // Log-nya nyebut id: perintah stiker-jadi sebelumnya juga nge-log pesan serupa,
  // jadi nunggu pesan tanpa id bisa kejawab log lama (tes lolos padahal belum).
  await engine.tungguLog('Stiker gagal dikirim (uji)');
  const hilang = async (f) => {
    for (let i = 0; i < 25; i += 1) {
      if (!fs.existsSync(f)) return true;
      await new Promise((r) => setTimeout(r, 100));
    }
    return false;
  };
  assert.equal(await hilang(path.join(dirStiker, 'masuk-uji.img')), true, 'berkas foto masuk dibersihkan');
  assert.equal(await hilang(path.join(dirStiker, 'keluar-uji.webp')), true, 'berkas stiker keluar dibersihkan');
  await engine.kirim({ type: 'bersih-moderasi' });
  await engine.tungguLog('Hitungan moderasi dikosongkan');
  const stMod = await engine.tungguStatus(() => true, 'status setelah moderasi');
  assert.equal(stMod.moderasiHapus, 0);
  assert.equal(stMod.moderasiKick, 0);

  // Perintah `perangkat` dari app (Perangkat.kt) dicatat di status.
  await engine.kirim({ type: 'perangkat', ringkas: 'RAM 3.6 GB, API 30, hemat: tidak', hemat: false });
  const stHp = await engine.tungguStatus((ev) => Boolean(ev.perangkat), 'status perangkat');
  assert.ok(/RAM 3\.6 GB/.test(stHp.perangkat));

  await engine.kirim({ type: 'start' });
  await engine.tungguLog('Engine nyala');
  const jalan = await engine.tungguStatus((ev) => ev.running === true && ev.nextCheckAt, 'status running');
  assert.ok(jalan.nextCheckAt > Date.now() - 1000);

  // Cek pertama (3 dtk setelah start): repo baru -> baseline dicatat, tidak posting.
  await engine.tungguLog(`Baseline dicatat: ${TAG}`);
  const st = await engine.tungguStatus((ev) => ev.lastTag === TAG && ev.busy === false, 'status lastTag baseline');
  assert.equal(st.postCount, 0);
  const state = JSON.parse(fs.readFileSync(path.join(dataDir, 'state.json'), 'utf8'));
  assert.equal(state.repos[REPO].lastTag, TAG);
  assert.equal(state.repos[REPO].rilisEtag, 'W/"tes-etag"');

  // Cek manual kedua: tag sama -> tidur, tetap tidak posting.
  await engine.kirim({ type: 'check' });
  await engine.tungguLog('Nggak ada update');

  await engine.kirim({ type: 'lihat-hitam' });
  await engine.tunggu((ev) => ev.type === 'daftar_hitam', 'daftar_hitam');

  await engine.kirim({ type: 'stop' });
  await engine.tungguLog('Engine jeda');
  const berhenti = await engine.tungguStatus((ev) => ev.running === false && ev.nextCheckAt === null, 'status berhenti');
  assert.equal(berhenti.lastTag, TAG);

  // Perintah asing tidak boleh mematikan engine.
  await engine.kirim({ type: 'perintah-ngawur' });
  await engine.tungguLog('cmd tidak dikenal');
  assert.equal(engine.proc.exitCode, null, 'engine masih hidup');
});

// ---------------------------------------------------------------------------
// Banyak repo + prerelease + ETag + deteksi release baru tanpa menyentuh WA.
// GitHub palsu kedua: dua repo, isinya bisa diubah di tengah tes, 304 kalau
// If-None-Match cocok. Channel utama dikosongkan supaya release baru berhenti
// di "Channel WA masih kosong" (tidak ada koneksi WhatsApp dari CI).
// ---------------------------------------------------------------------------
function buatGithubPalsuBanyak() {
  const rilis = {
    'octo/alpha': { tag: 'v1.0.0', prerelease: false, etag: 'W/"alpha-1"' },
    'octo/beta': { tag: 'v2.0.0-rc.1', prerelease: true, etag: 'W/"beta-1"' },
  };
  const hitung = { permintaan: {}, tigaEmpat: {} };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const m = url.pathname.match(/^\/repos\/([^/]+\/[^/]+)\/releases(?:\/latest)?$/);
    const r = m && rilis[m[1]];
    if (!r) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end('{}');
      return;
    }
    hitung.permintaan[m[1]] = (hitung.permintaan[m[1]] || 0) + 1;
    if (req.headers['if-none-match'] === r.etag) {
      hitung.tigaEmpat[m[1]] = (hitung.tigaEmpat[m[1]] || 0) + 1;
      res.writeHead(304, { etag: r.etag });
      res.end();
      return;
    }
    const isi = {
      tag_name: r.tag, name: r.tag, body: 'uji', prerelease: r.prerelease, draft: false, assets: [],
      html_url: `https://github.com/${m[1]}/releases/tag/${r.tag}`,
      published_at: '2026-09-29T00:00:00Z', author: { login: 'octo' },
    };
    res.writeHead(200, { 'content-type': 'application/json', etag: r.etag });
    // includePrereleases -> /releases?per_page=1 (array); tanpa itu /releases/latest (objek)
    res.end(JSON.stringify(url.pathname.endsWith('/latest') ? isi : [isi]));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, rilis, hitung }));
  });
}

test('engine: dua repo (satu prerelease), ETag 304, release baru terdeteksi tanpa WA', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-engine-multi-'));
  const { server, port, rilis, hitung } = await buatGithubPalsuBanyak();
  const engine = new Engine(dataDir, port);
  t.after(() => {
    engine.matikan();
    server.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  await engine.tungguLog('engine siap');

  // beta punya channel khusus (format layar Repo: repo|channel); channel utama kosong.
  await engine.kirim({
    type: 'configure', repo: 'octo/alpha, octo/beta|https://whatsapp.com/channel/ContohKhusus',
    channel: '', token: '', intervalMinutes: 15,
    includePrereleases: true, postOnFirstRun: false, testMessageOnSetup: false,
  });
  // status.repo = daftar repo saja (untuk ubin UI); channel per repo tetap di config.
  const cfgStatus = await engine.tungguStatus((ev) => /octo\/beta/.test(ev.repo || ''), 'status dua repo');
  assert.equal(cfgStatus.repo, 'octo/alpha, octo/beta');
  const cfg = JSON.parse(fs.readFileSync(path.join(dataDir, 'config.json'), 'utf8'));
  assert.equal(cfg.github.repo, 'octo/alpha, octo/beta|https://whatsapp.com/channel/ContohKhusus');
  assert.equal(cfg.github.includePrereleases, true);

  await engine.kirim({ type: 'start' });
  // Dua repo -> log diberi awalan nama repo; prerelease ikut karena includePrereleases.
  await engine.tungguLog('octo/alpha: First run. Baseline dicatat: v1.0.0');
  await engine.tungguLog('octo/beta: First run. Baseline dicatat: v2.0.0-rc.1');
  await engine.tungguStatus((ev) => ev.busy === false && ev.lastCheckAt, 'cek pertama selesai');
  let state = JSON.parse(fs.readFileSync(path.join(dataDir, 'state.json'), 'utf8'));
  assert.equal(state.repos['octo/alpha'].lastTag, 'v1.0.0');
  assert.equal(state.repos['octo/beta'].lastTag, 'v2.0.0-rc.1');
  assert.equal(state.repos['octo/beta'].rilisEtag, 'W/"beta-1"');

  // Cek kedua: ETag dikirim balik -> 304 untuk keduanya, tidak ada posting.
  await engine.kirim({ type: 'check' });
  await engine.tungguLog('octo/alpha: Nggak ada update');
  await engine.tungguLog('octo/beta: Nggak ada update');
  assert.equal(hitung.tigaEmpat['octo/alpha'], 1, 'alpha 304');
  assert.equal(hitung.tigaEmpat['octo/beta'], 1, 'beta 304');

  // Release baru di alpha (ETag baru). Terdeteksi, tapi alpha tidak punya channel
  // dan channel utama kosong -> berhenti sebelum WA; lastTag belum berubah supaya
  // dicoba lagi begitu channel diisi.
  rilis['octo/alpha'] = { tag: 'v1.1.0', prerelease: false, etag: 'W/"alpha-2"' };
  await engine.kirim({ type: 'check' });
  await engine.tungguLog('octo/alpha: ADA RELEASE BARU!');
  await engine.tungguLog('"Channel WA" masih kosong');
  await engine.tungguLog('octo/beta: Nggak ada update');
  const akhir = await engine.tungguStatus((ev) => ev.busy === false && ev.postCount === 0, 'status akhir');
  assert.equal(akhir.postCount, 0);
  state = JSON.parse(fs.readFileSync(path.join(dataDir, 'state.json'), 'utf8'));
  assert.equal(state.repos['octo/alpha'].lastTag, 'v1.0.0');
  assert.equal(state.repos['octo/alpha'].rilisEtag, 'W/"alpha-2"');
  assert.ok(hitung.permintaan['octo/alpha'] >= 3);
  assert.equal(engine.proc.exitCode, null, 'engine masih hidup');
});
