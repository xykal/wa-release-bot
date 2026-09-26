// ============================================================================
//  Unit test engine bot — jalan di Node biasa (nggak butuh HP / WhatsApp).
//  Jalankan:  npm test
// ============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { parseRepo } from '../src/github.mjs';
import { formatReleasePost, formatTestMessage } from '../src/format.mjs';
import { createBridge } from '../src/bridge.mjs';

// ---------------------------------------------------------------- parseRepo
test('parseRepo: format valid diterima', () => {
  assert.deepEqual(parseRepo('vercel/next.js'), { owner: 'vercel', repo: 'next.js' });
  assert.deepEqual(parseRepo('  xykal/wa-release-bot  '), {
    owner: 'xykal',
    repo: 'wa-release-bot',
  });
  assert.deepEqual(parseRepo('a_b-c/D.E_F'), { owner: 'a_b-c', repo: 'D.E_F' });
});

test('parseRepo: format salah ditolak dengan pesan yang jelas', () => {
  for (const bad of ['', 'tanpa-slash', 'a/b/c', 'https://github.com/a/b', '/b', 'a/']) {
    assert.throws(() => parseRepo(bad), /Format repo salah/, `harus ditolak: "${bad}"`);
  }
});

// ------------------------------------------------------------ formatRelease
const sampleRel = {
  tag: 'v1.4.0',
  name: 'Rilis Keren',
  body: '### Perubahan\n- Fitur A\n- Fix B',
  url: 'https://github.com/xykal/wa-release-bot/releases/tag/v1.4.0',
  author: 'xykal',
  publishedAt: '2026-09-20T10:00:00Z',
  isPrerelease: false,
};

test('formatReleasePost: memuat tag, repo, author, link', () => {
  const msg = formatReleasePost(sampleRel, 'xykal/wa-release-bot');
  assert.match(msg, /v1\.4\.0/);
  assert.match(msg, /xykal\/wa-release-bot/);
  assert.match(msg, /@xykal/);
  assert.match(msg, /releases\/tag\/v1\.4\.0/);
  assert.match(msg, /Fitur A/);
  // markdown WhatsApp: bold pakai *...*
  assert.match(msg, /\*RELEASE BARU DETEKSI!\*/);
  // bukan prerelease → nggak ada penanda
  assert.doesNotMatch(msg, /prerelease/);
});

test('formatReleasePost: prerelease dikasih penanda', () => {
  const msg = formatReleasePost({ ...sampleRel, isPrerelease: true }, 'a/b');
  assert.match(msg, /prerelease/);
});

test('formatReleasePost: body panjang dipotong, tetap ada link', () => {
  const msg = formatReleasePost({ ...sampleRel, body: 'x'.repeat(5000) }, 'a/b');
  assert.ok(msg.length < 5000, 'pesan harus lebih pendek dari body aslinya');
  assert.match(msg, /notes-nya panjang/);
  assert.match(msg, /releases\/tag\/v1\.4\.0/);
});

test('formatReleasePost: release tanpa deskripsi tetap valid', () => {
  const msg = formatReleasePost({ ...sampleRel, body: '' }, 'a/b');
  assert.match(msg, /tidak ada deskripsi/);
});

test('formatTestMessage: menyebut repo yang dipantau', () => {
  const msg = formatTestMessage('xykal/wa-release-bot');
  assert.match(msg, /xykal\/wa-release-bot/);
  assert.match(msg, /SETUP SUKSES/);
});

// ------------------------------------------------------------------- bridge
test('bridge: perintah lewat cmd.json ditangkap & file-nya dibersihkan', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'warbot-test-'));
  const received = [];

  const bridge = createBridge({
    dataDir: dir,
    wsPort: 0, // port acak / mati — file bridge harus tetap jalan
    log: () => {},
    onCommand: (cmd) => received.push(cmd),
  });

  bridge.send({ type: 'halo' });
  fs.writeFileSync(bridge.cmdFile, JSON.stringify({ type: 'ping', n: 1 }));

  // bridge polling tiap 250ms — kasih waktu beberapa siklus
  await new Promise((r) => setTimeout(r, 1200));
  bridge.close();

  assert.equal(received.length, 1, 'harus dapat tepat 1 perintah');
  assert.equal(received[0].type, 'ping');
  assert.equal(received[0].n, 1);
  assert.equal(fs.existsSync(bridge.cmdFile), false, 'cmd.json harus dihapus setelah dibaca');

  // event yang dikirim bridge harus tercatat di events.jsonl
  const lines = fs
    .readFileSync(bridge.eventsFile, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  assert.equal(lines[0].type, 'halo');

  fs.rmSync(dir, { recursive: true, force: true });
});

test('bridge: cmd.json rusak tidak bikin proses mati', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'warbot-test-'));
  const received = [];
  const bridge = createBridge({
    dataDir: dir,
    wsPort: 0,
    log: () => {},
    onCommand: (cmd) => received.push(cmd),
  });

  fs.writeFileSync(bridge.cmdFile, '{ ini bukan json');
  await new Promise((r) => setTimeout(r, 600));
  fs.writeFileSync(bridge.cmdFile, JSON.stringify({ type: 'masih-hidup' }));
  await new Promise((r) => setTimeout(r, 600));
  bridge.close();

  assert.equal(received.length, 1);
  assert.equal(received[0].type, 'masih-hidup');

  fs.rmSync(dir, { recursive: true, force: true });
});
