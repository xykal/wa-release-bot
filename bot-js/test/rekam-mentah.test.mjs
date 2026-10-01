// ============================================================================
//  Unit test "rekam channel" — murni (nggak import Baileys), stanza palsu
//  dipakai sebagai contoh. Yang dijaga: cuma postingan channel yang direkam,
//  react/view/metadata diabaikan, byte mentah tersimpan utuh sebagai base64.
//  Jalankan:  npm test -w bot-js
// ============================================================================
import '../polyfills/webcrypto.cjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { entriRekaman, tambahEntri, ringkasRekaman, cariAnak, keBuffer } from '../src/rekam-mentah.mjs';
import { buatRekamChannel } from '../src/mesin/rekam-channel.mjs';

/** Stanza seperti yang dikirim WA buat postingan channel. */
function stanza({ tipe = 'text', plaintext = Buffer.from('{"question":"halo"}', 'binary'), attrs = {} } = {}) {
  return {
    tag: 'notification',
    attrs: { type: 'newsletter', from: '120363000000000000@newsletter', id: 'N1', participant: '628111@s.whatsapp.net' },
    content: [
      {
        tag: 'message',
        attrs: { type: tipe, message_id: 'MSG1', server_id: '7', t: '1759000000', ...attrs },
        content: plaintext === null ? [] : [{ tag: 'plaintext', attrs: {}, content: plaintext }],
      },
    ],
  };
}

test('postingan channel: byte mentah disimpan apa adanya', () => {
  const isi = Buffer.from([0x01, 0x02, 0xff, 0x00]);
  const h = entriRekaman(stanza({ plaintext: isi }), { waktu: 111 });
  assert.equal(h.ok, true);
  assert.equal(h.entri.channel, '120363000000000000@newsletter');
  assert.equal(h.entri.id, 'MSG1');
  assert.equal(h.entri.tipe, 'text');
  assert.equal(h.entri.byte, 4);
  assert.equal(h.entri.waktu, 111);
  assert.deepEqual(Buffer.from(h.entri.b64, 'base64'), isi);
});

test('rekam channel: node CB:message newsletter langsung menyimpan posting Pertanyaan', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rekam-channel-'));
  const ws = new EventEmitter();
  const log = [];
  try {
    const rekam = buatRekamChannel({ dataDir, log: (pesan) => log.push(pesan), emitStatus: () => {} });
    rekam.pasang({ ws });
    rekam.nyalakan();
    ws.emit('CB:message', {
      tag: 'message',
      attrs: { from: '628111@s.whatsapp.net', type: 'text', id: 'PRIVATE1' },
      content: [{ tag: 'plaintext', attrs: {}, content: Buffer.from('pesan pribadi') }],
    });
    assert.equal(rekam.ringkas().jumlah, 0);

    ws.emit('CB:message', {
      tag: 'message',
      attrs: { from: '120363000000000000@newsletter', type: 'text', id: 'MSG2', server_id: '8' },
      content: [{ tag: 'plaintext', attrs: {}, content: Buffer.from('{"questionMessage":{"question":"halo"}}') }],
    });

    assert.equal(rekam.ringkas().jumlah, 1);
    const tersimpan = JSON.parse(fs.readFileSync(rekam.berkas(), 'utf8'));
    assert.equal(tersimpan.entri[0].id, '8');
    assert.equal(tersimpan.entri[0].tipe, 'text');
    assert.equal(log.some((pesan) => pesan.includes('1 postingan tersimpan')), true);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('rekam channel: ekspor otomatis ke Android/media tanpa kirim dokumen WA', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rekam-export-'));
  const dataDir = path.join(root, 'internal');
  const exportDir = path.join(root, 'Android', 'media', 'com.xykals.warelease', 'rekaman');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'rekaman-channel.json'), JSON.stringify({ entri: [] }));
  const ws = new EventEmitter();
  try {
    const rekam = buatRekamChannel({
      dataDir,
      rekamExportDir: exportDir,
      log: () => {},
      emitStatus: () => {},
    });
    const fileEkspor = path.join(exportDir, 'rekaman-channel.json');
    assert.equal(fs.readFileSync(fileEkspor, 'utf8'), fs.readFileSync(rekam.berkas(), 'utf8'));

    rekam.pasang({ ws });
    rekam.nyalakan();
    ws.emit('CB:notification', stanza({ tipe: 'questionMessage' }));
    assert.equal(fs.readFileSync(fileEkspor, 'utf8'), fs.readFileSync(rekam.berkas(), 'utf8'));
    assert.equal(JSON.parse(fs.readFileSync(fileEkspor, 'utf8')).entri.length, 1);

    const hasil = await rekam.kirimKe(null);
    assert.equal(hasil.ok, true);
    assert.equal(hasil.lokasi, path.join('Android', 'media', 'com.xykals.warelease', 'rekaman', 'rekaman-channel.json'));
    rekam.kosongkan();
    assert.equal(fs.existsSync(fileEkspor), false);
    assert.equal(fs.existsSync(rekam.berkas()), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rekam channel: hanya simpan posting setelah aktif dan log payload yang dilewatkan', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rekam-channel-'));
  const ws = new EventEmitter();
  const log = [];
  let statusDikirim = 0;
  try {
    const rekam = buatRekamChannel({
      dataDir,
      log: (pesan) => log.push(pesan),
      emitStatus: () => { statusDikirim += 1; },
    });
    rekam.pasang({ ws });
    ws.emit('CB:notification', stanza({ tipe: 'questionMessage' }));
    assert.equal(rekam.ringkas().jumlah, 0);

    rekam.nyalakan();
    const statusSebelumSimpan = statusDikirim;
    ws.emit('CB:notification', stanza({ tipe: 'questionMessage' }));
    assert.equal(statusDikirim, statusSebelumSimpan + 1);
    assert.equal(rekam.ringkas().jumlah, 1);
    assert.equal(rekam.ringkas().terakhirStatus, 'tersimpan');
    const tersimpan = JSON.parse(fs.readFileSync(rekam.berkas(), 'utf8'));
    assert.equal(tersimpan.entri[0].tipe, 'questionMessage');
    assert.equal(log.some((pesan) => pesan.includes('1 postingan tersimpan')), true);

    const statusSebelumLewat = statusDikirim;
    ws.emit('CB:notification', stanza({ tipe: 'questionMessage', plaintext: null }));
    assert.equal(statusDikirim, statusSebelumLewat + 1);
    assert.equal(rekam.ringkas().jumlah, 1);
    assert.equal(rekam.ringkas().terakhirStatus, 'dilewatkan');
    assert.match(rekam.ringkas().terakhirAlasan, /plaintext/);
    assert.equal(log.some((pesan) => pesan.includes('melewatkan postingan')), true);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('notifikasi lain (reaction/view) nggak ikut direkam', () => {
  const h = entriRekaman({ tag: 'notification', attrs: { type: 'newsletter' }, content: [{ tag: 'reaction' }] });
  assert.equal(h.ok, false);
  assert.match(h.alasan, /bukan postingan/);
  assert.equal(entriRekaman({ tag: 'notification', attrs: { type: 'w:gp2' }, content: [] }).ok, false);
  assert.equal(entriRekaman(null).ok, false);
});

test('postingan tanpa plaintext (terenkripsi) ditolak, bukan disimpan kosong', () => {
  const h = entriRekaman(stanza({ plaintext: null }));
  assert.equal(h.ok, false);
  assert.match(h.alasan, /plaintext/);
});

test('tambahEntri: yang lama dibuang kalau lebih dari batas', () => {
  let d = [];
  for (let i = 1; i <= 3; i++) d = tambahEntri(d, { id: `M${i}`, channel: 'x@newsletter', byte: 10 }, 2);
  assert.deepEqual(d.map((e) => e.id), ['M2', 'M3']);
});

test('tambahEntri: id sama diganti (update), bukan dobel', () => {
  let d = tambahEntri([], { id: 'M1', channel: 'x@newsletter', byte: 1 });
  d = tambahEntri(d, { id: 'M1', channel: 'x@newsletter', byte: 2 });
  assert.equal(d.length, 1);
  assert.equal(d[0].byte, 2);
});

test('ringkasRekaman: jumlah, terakhir, total byte', () => {
  const r = ringkasRekaman({ entri: [{ byte: 5, waktu: 1 }, { byte: 7, waktu: 2, tipe: 'text' }] });
  assert.equal(r.jumlah, 2);
  assert.equal(r.terakhir, 2);
  assert.equal(r.tipeTerakhir, 'text');
  assert.equal(r.byte, 12);
  assert.deepEqual(ringkasRekaman({}).jumlah, 0);
});

test('cariAnak & keBuffer: sabar sama bentuk isi yang beda-beda', () => {
  assert.equal(cariAnak(stanza(), 'message')?.attrs?.message_id, 'MSG1');
  assert.equal(cariAnak(cariAnak(stanza(), 'message'), 'plaintext')?.tag, 'plaintext');
  assert.equal(cariAnak({ content: 'bukan array' }, 'message'), null);
  assert.deepEqual(keBuffer(new Uint8Array([1, 2])), Buffer.from([1, 2]));
  assert.equal(keBuffer(1234), null);
});
