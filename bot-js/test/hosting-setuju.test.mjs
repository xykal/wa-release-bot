// Proving test gerbang persetujuan hosting: kode bot pihak ketiga tidak boleh
// jalan sebelum ada persetujuan untuk sidik jari ZIP yang sedang terpasang.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SIDIK_LAMA, buatPersetujuan, sidikDariSumber } from '../src/hosting-setuju.mjs';
import { buatHosting } from '../src/hosting.mjs';

const SHA_A = 'a'.repeat(64);
const SHA_B = '0123456789abcdef'.repeat(4);

function akarBaru() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wr-hosting-setuju-'));
}

function tulisSumber(akar, sha256) {
  fs.mkdirSync(akar, { recursive: true });
  fs.writeFileSync(path.join(akar, 'sumber.json'), JSON.stringify({ sha256 }));
}

async function tungguSampai(cek, batasMs = 8000) {
  const mulai = Date.now();
  while (!cek()) {
    if (Date.now() - mulai > batasMs) throw new Error('timeout menunggu kondisi');
    await new Promise((r) => setTimeout(r, 25));
  }
}

test('sidikDariSumber: cuma hex SHA-256 huruf kecil yang diterima', () => {
  assert.equal(sidikDariSumber(JSON.stringify({ sha256: SHA_B })), SHA_B);
  assert.equal(sidikDariSumber(JSON.stringify({ sha256: SHA_B.toUpperCase() })), SIDIK_LAMA);
  assert.equal(sidikDariSumber(JSON.stringify({ sha256: 'abc' })), SIDIK_LAMA);
  assert.equal(sidikDariSumber(JSON.stringify({ sha256: 42 })), SIDIK_LAMA);
  assert.equal(sidikDariSumber('{ bukan json'), SIDIK_LAMA);
  assert.equal(sidikDariSumber('null'), SIDIK_LAMA);
});

test('buatPersetujuan: sidik salah ditolak, ZIP baru menggugurkan persetujuan lama', () => {
  const akar = akarBaru();
  const p = buatPersetujuan(akar);
  assert.equal(p.sidik(), SIDIK_LAMA);
  assert.equal(p.sudah(), false);

  tulisSumber(akar, SHA_A);
  assert.equal(p.catat(SIDIK_LAMA), false);
  assert.equal(p.catat(SHA_B), false);
  assert.equal(p.catat(undefined), false);
  assert.equal(p.sudah(), false);
  assert.equal(p.catat(SHA_A), true);
  assert.equal(p.sudah(), true);

  tulisSumber(akar, SHA_B);
  assert.equal(p.sudah(), false, 'ZIP baru wajib disetujui ulang');

  p.lupakan();
  assert.equal(fs.existsSync(path.join(akar, 'sumber.json')), false);
  assert.equal(fs.existsSync(path.join(akar, 'persetujuan.json')), false);
});

test('hosting: project tidak jalan sebelum disetujui, jalan setelah sidik yang benar disetujui', async () => {
  const dataDir = akarBaru();
  const akar = path.join(dataDir, 'hosting');
  const proyek = path.join(akar, 'proyek');
  const penanda = path.join(proyek, 'jalan.txt');
  fs.mkdirSync(proyek, { recursive: true });
  fs.writeFileSync(path.join(proyek, 'package.json'), JSON.stringify({ name: 'bot-tes', main: 'index.js' }));
  fs.writeFileSync(path.join(proyek, 'index.js'),
    "require('fs').writeFileSync(require('path').join(__dirname, 'jalan.txt'), 'ya');\nsetInterval(() => {}, 1000);\n");

  const status = [];
  const h = buatHosting({ dataDir, log: () => {}, kirim: (e) => { if (e.type === 'hosting_status') status.push(e); } });
  await h.perintah({ type: 'hosting-atur', autoRestart: false });

  await h.perintah({ type: 'hosting-mulai' });
  assert.equal(h.jalan, false, 'tanpa persetujuan tidak boleh jalan');
  assert.equal(status.at(-1).setuju, false);
  assert.equal(status.at(-1).sha256, null);

  await h.perintah({ type: 'hosting-setuju', sha256: SHA_A });
  assert.equal(status.at(-1).setuju, false, 'sidik tidak cocok harus ditolak');
  await h.perintah({ type: 'hosting-setuju', sha256: SIDIK_LAMA });
  assert.equal(status.at(-1).setuju, true, 'project lama tanpa sumber.json boleh disetujui');

  tulisSumber(akar, SHA_A);
  await h.perintah({ type: 'hosting-cek' });
  assert.equal(status.at(-1).setuju, false);
  assert.equal(status.at(-1).sha256, SHA_A);
  await h.perintah({ type: 'hosting-mulai' });
  assert.equal(h.jalan, false, 'ZIP baru tanpa persetujuan baru tidak boleh jalan');
  assert.equal(fs.existsSync(penanda), false);

  await h.perintah({ type: 'hosting-setuju', sha256: SHA_A });
  assert.equal(status.at(-1).setuju, true);
  await h.perintah({ type: 'hosting-mulai' });
  assert.equal(h.jalan, true);
  await tungguSampai(() => fs.existsSync(penanda));

  await h.perintah({ type: 'hosting-stop' });
  assert.equal(h.jalan, false);
});
