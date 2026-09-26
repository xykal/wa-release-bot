// Jembatan komunikasi App (Kotlin) <-> Engine (Node.js).
// Jalur utama: file (100% pasti jalan di nodejs-mobile).
// Jalur cepat (opsional): WebSocket 127.0.0.1 — cuma buat perintah, bukan event.

import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer } from 'ws';

export function createBridge({ dataDir, wsPort = 18790, log, onCommand }) {
  const eventsFile = path.join(dataDir, 'events.jsonl');
  const cmdFile = path.join(dataDir, 'cmd.json');

  fs.mkdirSync(dataDir, { recursive: true });
  for (const f of [eventsFile, cmdFile]) {
    if (!fs.existsSync(f)) fs.writeFileSync(f, '');
  }

  // ---------- WebSocket (fast path, boleh gagal) ----------
  let wss = null;
  const wsClients = new Set();
  try {
    wss = new WebSocketServer({ host: '127.0.0.1', port: wsPort, maxPayload: 1024 * 1024 });
    wss.on('listening', () => log(`⚡ WS bridge aktif di 127.0.0.1:${wss.address().port}`));
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
    });
  } catch (e) {
    wss = null;
    log('⚠️ WS bridge gagal start: ' + e.message + ' — pakai file bridge doang.');
  }

  // ---------- Polling cmd.json (jalur utama) ----------
  let cmdMtime = 0;
  const pollTimer = setInterval(() => {
    try {
      const st = fs.statSync(cmdFile);
      if (st.mtimeMs !== cmdMtime) {
        cmdMtime = st.mtimeMs;
        const raw = fs.readFileSync(cmdFile, 'utf8').trim();
        try { fs.unlinkSync(cmdFile); } catch { /* ignore */ }
        if (!raw) return;
        try { onCommand(JSON.parse(raw)); }
        catch (e) { log('cmd.json tidak bisa di-parse: ' + e.message); }
      }
    } catch { /* file belum ada / lagi di-tulis app */ }
  }, 250);

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
    try { wss && wss.close(); } catch { /* ignore */ }
  }

  return { send, close, eventsFile, cmdFile };
}
