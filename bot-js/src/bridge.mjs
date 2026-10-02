// Jembatan komunikasi App (Kotlin) <-> Engine (Node.js).
// Jalur utama: file (100% pasti jalan di nodejs-mobile).
// Jalur cepat (opsional): WebSocket 127.0.0.1 — cuma buat perintah, bukan event.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer } from 'ws';

const PANJANG_TOKEN_MIN = 32;

// Loopback di Android bukan wilayah privat: app lain mana pun yang punya izin
// INTERNET bisa membuka 127.0.0.1, dan halaman web di browser HP juga bisa
// membuka WebSocket ke sana. Port ini diperlakukan sebagai publik: klien wajib
// membawa token acak per proses, dan handshake yang membawa Origin (tanda
// datang dari halaman web; OkHttp app tidak mengirimnya) selalu ditolak.
export function tokenCocok(dikirim, diharapkan) {
  if (typeof dikirim !== 'string' || typeof diharapkan !== 'string' || !diharapkan) return false;
  // Di-hash dulu supaya panjang sama: timingSafeEqual melempar kalau panjang beda.
  const a = crypto.createHash('sha256').update(dikirim).digest();
  const b = crypto.createHash('sha256').update(diharapkan).digest();
  return crypto.timingSafeEqual(a, b);
}

export function izinkanHandshake(headers, wsToken) {
  if (headers?.origin !== undefined) return { ok: false, kode: 403 };
  if (!tokenCocok(headers?.['x-wr-token'], wsToken)) return { ok: false, kode: 401 };
  return { ok: true, kode: 101 };
}

export function createBridge({ dataDir, wsPort = 18790, wsToken = '', log, onCommand }) {
  const eventsFile = path.join(dataDir, 'events.jsonl');
  const cmdFile = path.join(dataDir, 'cmd.json');

  fs.mkdirSync(dataDir, { recursive: true });
  // events.jsonl DIKOSONGIN tiap engine nyala. Dulu isinya numpuk dari sesi-
  // sesi lama, dan app baca ulang dari awal tiap service nyala — jadi QR /
  // pairing code basi dari setup yang kepotong ikut "diputar ulang" dan
  // nongol di layar barengan sama yang baru.
  fs.writeFileSync(eventsFile, '');

  // ---------- WebSocket (fast path, boleh gagal) ----------
  let wss = null;
  const wsClients = new Set();
  let tandaiSiap = () => {};
  const wsSiap = new Promise((r) => { tandaiSiap = r; });

  // Log penolakan dibatasi sekali per menit: app jahat yang menembak handshake
  // terus-menerus tidak boleh bisa membanjiri log (dan storage) lewat jalur ini.
  let jumlahDitolak = 0;
  let terakhirLogTolak = 0;
  function catatTolak(kode) {
    jumlahDitolak += 1;
    const kini = Date.now();
    if (kini - terakhirLogTolak < 60_000) return;
    terakhirLogTolak = kini;
    log(`WS handshake ditolak (${kode}); total ${jumlahDitolak} sejak engine nyala.`);
  }

  if (typeof wsToken !== 'string' || wsToken.length < PANJANG_TOKEN_MIN) {
    log('WS bridge tidak dinyalakan (token tidak ada) — pakai file bridge doang.');
    tandaiSiap(null);
  } else {
    try {
      wss = new WebSocketServer({
        host: '127.0.0.1',
        port: wsPort,
        maxPayload: 1024 * 1024,
        verifyClient: ({ req }, selesai) => {
          const hasil = izinkanHandshake(req.headers, wsToken);
          if (!hasil.ok) catatTolak(hasil.kode);
          selesai(hasil.ok, hasil.kode);
        },
      });
      wss.on('listening', () => {
        const port = wss.address().port;
        log(`WS bridge aktif di 127.0.0.1:${port} (wajib token).`);
        tandaiSiap(port);
      });
      wss.on('connection', (ws) => {
        wsClients.add(ws);
        ws.on('message', (d) => {
          try { onCommand(JSON.parse(d.toString())); }
          catch (e) { log('WS cmd tidak bisa di-parse: ' + e.message); }
        });
        ws.on('close', () => wsClients.delete(ws));
        ws.on('error', () => wsClients.delete(ws));
      });
      wss.on('error', (e) => {
        log('⚠️ WS bridge mati (' + e.message + ') — file bridge tetap jalan.');
        try { wss.close(); } catch { /* ignore */ }
        wss = null;
        tandaiSiap(null);
      });
    } catch (e) {
      wss = null;
      log('⚠️ WS bridge gagal start: ' + e.message + ' — pakai file bridge doang.');
      tandaiSiap(null);
    }
  }

  // ---------- Polling cmd.json (jalur utama) ----------
  // Isinya boleh BANYAK perintah, satu per baris (app nambahin di ujung).
  // Dulu tiap perintah nimpa file — jadi kalau app ngirim 2 perintah dalam
  // 1 detik (mis. "configure" lalu "setup"), yang pertama hilang.
  // File dipindah dulu (rename) baru dibaca, biar perintah yang masuk pas
  // lagi diproses nggak ikut kehapus.
  const procFile = cmdFile + '.proc';
  const pollTimer = setInterval(() => {
    try {
      if (!fs.existsSync(cmdFile) || fs.statSync(cmdFile).size === 0) return;
      fs.renameSync(cmdFile, procFile);
      const raw = fs.readFileSync(procFile, 'utf8');
      try { fs.unlinkSync(procFile); } catch { /* ignore */ }
      for (const baris of raw.split('\n')) {
        const t = baris.trim();
        if (!t) continue;
        try { onCommand(JSON.parse(t)); }
        catch (e) { log('cmd.json tidak bisa di-parse: ' + e.message); }
      }
    } catch { /* file belum ada / lagi di-tulis app */ }
  }, 1000); // 1 dtk cukup: perintah normalnya lewat WS; ini cuma cadangan

  // ---------- Kirim event ke app ----------
  function send(obj) {
    const line = JSON.stringify(obj);
    try {
      fs.appendFileSync(eventsFile, line + '\n');
      // rotate kalau file besar
      const st = fs.statSync(eventsFile);
      if (st.size > 4 * 1024 * 1024) fs.writeFileSync(eventsFile, line + '\n');
    } catch (e) { log('gagal tulis event: ' + e.message); }
    for (const c of wsClients) {
      try { if (c.readyState === 1) c.send(line); } catch { /* ignore */ }
    }
  }

  function close() {
    clearInterval(pollTimer);
    // ws 8: server.close() tidak memutus klien yang masih terhubung.
    for (const c of wsClients) { try { c.terminate(); } catch { /* ignore */ } }
    wsClients.clear();
    try { wss && wss.close(); } catch { /* ignore */ }
  }

  // Ada klien yang siap nerima event? Dipakai buat nolak lebih awal fitur yang
  // cuma bisa dikerjakan app (mis. konversi stiker WebP di Android).
  function adaKlien() {
    return [...wsClients].some((c) => c.readyState === 1);
  }

  return { send, close, eventsFile, cmdFile, adaKlien, wsSiap };
}
