// Tes integrasi CLI: jalankan cli/src/bot.mjs sebagai proses sungguhan, tanpa
// jaringan dan tanpa WhatsApp. GitHub dipalsukan lewat --import (fetch global
// diganti sebelum modul apa pun jalan); WA tidak pernah disentuh karena semua
// skenario di sini berhenti sebelum connectToWhatsApp.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ENTRY = fileURLToPath(new URL('../src/bot.mjs', import.meta.url));

const FAKE_FETCH = `
globalThis.fetch = async (url, init = {}) => {
  const etagKlien = init.headers?.['If-None-Match'];
  if (etagKlien === '"etag-v9"') return new Response(null, { status: 304, headers: { etag: '"etag-v9"' } });
  if (!String(url).includes('/releases/latest')) return new Response('not found', { status: 404 });
  return new Response(JSON.stringify({
    tag_name: 'v9.9.9', name: 'Rilis sembilan', body: '## Baru\\n- fitur **X**', draft: false, prerelease: false,
    html_url: 'https://github.com/octo/demo/releases/tag/v9.9.9', published_at: '2026-09-29T00:00:00Z',
    assets: [],
  }), { status: 200, headers: { 'content-type': 'application/json', etag: '"etag-v9"' } });
};
`;

function siapkanDir({ state } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'wrb-cli-'));
  writeFileSync(path.join(dir, 'config.json'), JSON.stringify({
    github: { repo: 'octo/demo', token: '', includePrereleases: false },
    whatsapp: { channel: '120363000000000000@g.us', sessionDir: './sesi', format: 'pertanyaan' },
    bot: { checkIntervalMinutes: 15, postOnFirstRun: false, testMessageOnSetup: false },
  }));
  writeFileSync(path.join(dir, 'fake-fetch.mjs'), FAKE_FETCH);
  if (state) writeFileSync(path.join(dir, 'state.json'), JSON.stringify(state));
  return dir;
}

function jalan(args, dir, { fake = true } = {}) {
  const nodeArgs = fake && dir ? ['--import', path.join(dir, 'fake-fetch.mjs')] : [];
  const r = spawnSync(process.execPath, [...nodeArgs, ENTRY, ...args], {
    encoding: 'utf8',
    timeout: 60_000,
    env: { ...process.env, WA_RELEASE_BOT_DIR: dir || '', NO_COLOR: '1' },
  });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

test('cli --version: nama, versi, brand', () => {
  const { code, out } = jalan(['--version'], null, { fake: false });
  assert.equal(code, 0, out);
  assert.match(out.trim(), /^wa-release-bot \d+\.\d+\.\d+ — XyVerse Technology Global$/);
});

test('cli tanpa config.json: keluar 1 dengan petunjuk', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'wrb-cli-kosong-'));
  const { code, out } = jalan(['--dry-run'], dir, { fake: false });
  assert.equal(code, 1);
  assert.match(out, /config\.json belum ada/);
});

test('cli --dry-run: tampilkan pesan, keputusan baseline, state tidak ditulis', () => {
  const dir = siapkanDir();
  const { code, out } = jalan(['--dry-run'], dir);
  assert.equal(code, 0, out);
  assert.match(out, /v9\.9\.9/);
  assert.match(out, /Rilis sembilan/);
  assert.match(out, /\*Baru\*/, 'markdown ## harus jadi *bold* WA');
  assert.match(out, /Keputusan kalau ini cek beneran: baseline/);
  assert.equal(existsSync(path.join(dir, 'state.json')), false);
});

test('cli --once dengan baseline sama: tidur, simpan etag, tidak sentuh WA', () => {
  const dir = siapkanDir({ state: { lastTag: 'v9.9.9', channelJid: null, postCount: 0 } });
  const pertama = jalan(['--once'], dir);
  assert.equal(pertama.code, 0, pertama.out);
  assert.match(pertama.out, /Nggak ada update/);
  const state = JSON.parse(readFileSync(path.join(dir, 'state.json'), 'utf8'));
  assert.equal(state.rilisEtag, '"etag-v9"');
  assert.equal(existsSync(path.join(dir, 'sesi')), false, 'WA tidak boleh dibuka');

  const kedua = jalan(['--once'], dir); // sekarang fetch palsu menjawab 304
  assert.equal(kedua.code, 0, kedua.out);
  assert.match(kedua.out, /Nggak ada update \(GitHub bilang belum berubah \(304/);
});

test('cli --once first run tanpa postOnFirstRun: catat baseline saja', () => {
  const dir = siapkanDir();
  const { code, out } = jalan(['--once'], dir);
  assert.equal(code, 0, out);
  assert.match(out, /Baseline dicatat: v9\.9\.9/);
  const state = JSON.parse(readFileSync(path.join(dir, 'state.json'), 'utf8'));
  assert.equal(state.lastTag, 'v9.9.9');
  assert.equal(existsSync(path.join(dir, 'sesi')), false);
});
