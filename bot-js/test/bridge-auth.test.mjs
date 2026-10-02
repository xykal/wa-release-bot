// Proving test kontrol keamanan WS bridge 127.0.0.1: tanpa token yang benar,
// atau datang dari halaman web (ada Origin), handshake harus ditolak dan
// perintah tidak boleh sampai ke engine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { createBridge, izinkanHandshake, tokenCocok } from '../src/bridge.mjs';

const TOKEN = 'a1'.repeat(32);

function bridgeBaru(opsi = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-bridge-auth-'));
  const diterima = [];
  const logs = [];
  const bridge = createBridge({
    dataDir,
    wsPort: 0,
    wsToken: TOKEN,
    log: (m) => logs.push(m),
    onCommand: (c) => diterima.push(c),
    ...opsi,
  });
  return { bridge, diterima, logs };
}

function hubungkan(port, headers) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers });
    ws.once('open', () => resolve({ ws, status: 101 }));
    ws.once('error', (e) => {
      const kode = /Unexpected server response: (\d{3})/.exec(e.message);
      resolve({ ws: null, status: kode ? Number(kode[1]) : 0 });
    });
  });
}

async function tungguSampai(cek, batasMs = 3000) {
  const mulai = Date.now();
  while (!cek()) {
    if (Date.now() - mulai > batasMs) throw new Error('timeout menunggu kondisi');
    await new Promise((r) => setTimeout(r, 20));
  }
}

test('tokenCocok: cuma token identik yang lolos, input aneh ditolak', () => {
  assert.equal(tokenCocok(TOKEN, TOKEN), true);
  assert.equal(tokenCocok(TOKEN.slice(1), TOKEN), false);
  assert.equal(tokenCocok(TOKEN + 'x', TOKEN), false);
  assert.equal(tokenCocok(`${TOKEN}, ${TOKEN}`, TOKEN), false);
  assert.equal(tokenCocok(undefined, TOKEN), false);
  assert.equal(tokenCocok(['x'], TOKEN), false);
  assert.equal(tokenCocok('', ''), false);
});

test('izinkanHandshake: Origin ditolak 403 walau token benar; token salah 401', () => {
  assert.deepEqual(izinkanHandshake({ 'x-wr-token': TOKEN }, TOKEN), { ok: true, kode: 101 });
  assert.equal(izinkanHandshake({ 'x-wr-token': TOKEN, origin: 'https://contoh.invalid' }, TOKEN).kode, 403);
  assert.equal(izinkanHandshake({ origin: 'null' }, TOKEN).kode, 403);
  assert.equal(izinkanHandshake({}, TOKEN).kode, 401);
  assert.equal(izinkanHandshake(undefined, TOKEN).kode, 401);
});

test('bridge WS: tanpa token atau token pendek, WS tidak dinyalakan sama sekali', async () => {
  for (const wsToken of ['', 'pendek', undefined]) {
    const { bridge } = bridgeBaru({ wsToken });
    assert.equal(await bridge.wsSiap, null);
    bridge.close();
  }
});

test('bridge WS: handshake tanpa token, token salah, atau ber-Origin ditolak dan perintah tidak sampai', async () => {
  const { bridge, diterima, logs } = bridgeBaru();
  const port = await bridge.wsSiap;
  assert.ok(port > 0);

  assert.equal((await hubungkan(port, {})).status, 401);
  assert.equal((await hubungkan(port, { 'X-WR-Token': 'b2'.repeat(32) })).status, 401);
  assert.equal((await hubungkan(port, { 'X-WR-Token': TOKEN, Origin: 'https://contoh.invalid' })).status, 403);

  await new Promise((r) => setTimeout(r, 200));
  assert.deepEqual(diterima, []);
  assert.equal(logs.filter((m) => m.startsWith('WS handshake ditolak')).length, 1, 'log penolakan dibatasi');
  bridge.close();
});

test('bridge WS: klien dengan token benar bisa kirim perintah dan terima event', async () => {
  const { bridge, diterima } = bridgeBaru();
  const port = await bridge.wsSiap;
  const { ws, status } = await hubungkan(port, { 'X-WR-Token': TOKEN });
  assert.equal(status, 101);

  const event = new Promise((r) => ws.once('message', (d) => r(JSON.parse(d.toString()))));
  ws.send(JSON.stringify({ type: 'ping' }));
  await tungguSampai(() => diterima.length === 1);
  await tungguSampai(() => bridge.adaKlien());
  bridge.send({ type: 'halo' });

  assert.deepEqual(await event, { type: 'halo' });
  assert.deepEqual(diterima, [{ type: 'ping' }]);
  bridge.close();
});
