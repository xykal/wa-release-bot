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
import { bacaTarget, JENIS, pesanCaraIsiChannel, linkChannel } from '../src/channel.mjs';
import { formatReleasePost, formatTestMessage } from '../src/format.mjs';
import { createBridge } from '../src/bridge.mjs';
import { normalisasiNomor } from '../src/nomor.mjs';
import {
  rapikanJid, identitas, cariYangKeluar, catatAnggota, putuskan, daftarHitamManual, namaOrang,
} from '../src/grup.mjs';

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

// --------------------------------------------------------------- bacaTarget
// Regresi penting: dulu field "Channel WA" nerima @username dan diproses pakai
// onWhatsApp() — itu buat nyari NOMOR HP, bukan channel, jadi selalu gagal.
// Sekarang username harus DITOLAK dengan pesan yang ngasih jalan keluar.
test('bacaTarget: link channel → kode undangan', () => {
  const t = bacaTarget('https://whatsapp.com/channel/0029VbAbCdEf1234567890xyZ');
  assert.equal(t.jenis, JENIS.INVITE);
  assert.equal(t.nilai, '0029VbAbCdEf1234567890xyZ');

  // tanpa protokol / pakai www / ada trailing slash → tetap kebaca
  assert.equal(bacaTarget('whatsapp.com/channel/0029Vaaaaabbbbb').jenis, JENIS.INVITE);
  assert.equal(bacaTarget('http://www.whatsapp.com/channel/0029Vaaaaabbbbb/').nilai, '0029Vaaaaabbbbb');
});

test('bacaTarget: JID channel & JID grup diterima apa adanya', () => {
  assert.deepEqual(bacaTarget('120363123456789012@newsletter'), {
    jenis: JENIS.JID,
    nilai: '120363123456789012@newsletter',
  });
  assert.deepEqual(bacaTarget('120363123456789012@g.us'), {
    jenis: JENIS.GRUP,
    nilai: '120363123456789012@g.us',
  });
});

test('bacaTarget: link undangan grup dikenali', () => {
  const t = bacaTarget('https://chat.whatsapp.com/AbCdEfGhIjKlMnOp');
  assert.equal(t.jenis, JENIS.LINK_GRUP);
  assert.equal(t.nilai, 'AbCdEfGhIjKlMnOp');
});

test('bacaTarget: kode undangan telanjang (tanpa link) dikenali', () => {
  const t = bacaTarget('0029VbAbCdEf1234567890xyZ');
  assert.equal(t.jenis, JENIS.INVITE);
});

test('bacaTarget: angka doang dikasih pesan yang nyuruh lengkapin akhiran', () => {
  const t = bacaTarget('120363123456789012');
  assert.equal(t.jenis, JENIS.SALAH);
  assert.match(t.pesan, /@newsletter/);
});

test('bacaTarget: username ditolak + ada jalan keluarnya', () => {
  for (const s of ['@nama_channel', 'nama_channel']) {
    const t = bacaTarget(s);
    assert.equal(t.jenis, JENIS.USERNAME, `harus kebaca username: ${s}`);
    assert.equal(t.nilai, '@nama_channel');
  }
  const pesan = pesanCaraIsiChannel('@nama_channel');
  assert.match(pesan, /LINK channel/);
  assert.match(pesan, /Bikin Channel/);
});

test('bacaTarget: kosong & sampah ditolak', () => {
  assert.equal(bacaTarget('').jenis, JENIS.SALAH);
  assert.equal(bacaTarget('   ').jenis, JENIS.SALAH);
  assert.equal(bacaTarget('ada spasi di sini').jenis, JENIS.SALAH);
  assert.equal(bacaTarget('!!!').jenis, JENIS.SALAH);
});

test('linkChannel: bikin link dari metadata channel', () => {
  assert.equal(
    linkChannel({ invite: '0029VbAbCd' }),
    'https://whatsapp.com/channel/0029VbAbCd'
  );
  assert.equal(linkChannel({}), null);
  assert.equal(linkChannel(null), null);
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

// ---------------------------------------------------------------- nomor
test('normalisasiNomor: format Indonesia yang umum', () => {
  assert.equal(normalisasiNomor('0812-3456-7890'), '6281234567890');
  assert.equal(normalisasiNomor('+62 812 3456 7890'), '6281234567890');
  assert.equal(normalisasiNomor('812 3456 7890'), '6281234567890');
  assert.equal(normalisasiNomor('006281234567890'), '6281234567890');
  assert.equal(normalisasiNomor('14155552671'), '14155552671');
  assert.equal(normalisasiNomor('abc'), null);
  assert.equal(normalisasiNomor('123'), null);
  assert.equal(normalisasiNomor(''), null);
});

// ---------------------------------------------------------------- grup
test('rapikanJid: buang nomor device & samain c.us', () => {
  assert.equal(rapikanJid('628111:12@s.whatsapp.net'), '628111@s.whatsapp.net');
  assert.equal(rapikanJid('628111@c.us'), '628111@s.whatsapp.net');
  assert.equal(rapikanJid('999@lid'), '999@lid');
  assert.equal(rapikanJid('ngawur'), null);
});

test('identitas: gabung nomor HP + LID', () => {
  assert.deepEqual(
    identitas({ id: '999@lid', jid: '628111@s.whatsapp.net', lid: '999@lid' }).sort(),
    ['628111@s.whatsapp.net', '999@lid']
  );
  assert.deepEqual(identitas({ jid: '777@lid', phone_number: '628222@s.whatsapp.net' }).sort(),
    ['628222@s.whatsapp.net', '777@lid']);
});

test('cariYangKeluar: yang hilang dari daftar = keluar; diri sendiri nggak dihitung', () => {
  const lama = [['628111@s.whatsapp.net', '1@lid'], ['628222@s.whatsapp.net'], ['628999@s.whatsapp.net']];
  // 628111 sekarang cuma kelihatan pakai LID-nya → tetap dianggap masih ada
  const sekarang = [{ id: '1@lid' }];
  const keluar = cariYangKeluar(lama, sekarang, ['628999:3@s.whatsapp.net']);
  assert.deepEqual(keluar, [['628222@s.whatsapp.net']]);
});

test('putuskan: yang di daftar hitam ditolak, sisanya di-approve', () => {
  const hitam = new Set(['628222@s.whatsapp.net', '5@lid']);
  assert.equal(putuskan({ jid: '628222@s.whatsapp.net' }, hitam), 'reject');
  assert.equal(putuskan({ jid: '5@lid', phone_number: '628333@s.whatsapp.net' }, hitam), 'reject');
  // dulu keluar pakai nomor, sekarang minta join kelihatan LID + nomor → tetap ketangkep
  assert.equal(putuskan({ jid: '8@lid', phone_number: '628222@s.whatsapp.net' }, hitam), 'reject');
  assert.equal(putuskan({ jid: '628444@s.whatsapp.net' }, hitam), 'approve');
});

test('daftarHitamManual: koma/spasi/baris + format lokal', () => {
  assert.deepEqual(
    daftarHitamManual('0812-3456-7890,\n+62811000111 ; 55@lid', normalisasiNomor).sort(),
    ['55@lid', '62811000111@s.whatsapp.net', '6281234567890@s.whatsapp.net']
  );
});

test('catatAnggota + namaOrang', () => {
  const c = catatAnggota([{ id: '1@lid', jid: '628111@s.whatsapp.net' }, { id: '2@lid' }]);
  assert.equal(c.length, 2);
  assert.equal(namaOrang(c[0]), '628111');
  assert.equal(namaOrang(c[1]), '2');
});
