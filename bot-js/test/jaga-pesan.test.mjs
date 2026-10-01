import '../polyfills/webcrypto.cjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

import { buatJagaPesan } from '../src/mesin/jaga-pesan.mjs';

test('balasan pribadi dan menu panel ke PN kanonis saat perintah masuk lewat LID', async () => {
  const ev = new EventEmitter();
  const terkirim = [];
  const sock = {
    ev,
    ws: new EventEmitter(),
    user: { id: '628111222333:4@s.whatsapp.net', lid: '900000000000001@lid' },
    sendMessage: async (jid, isi) => { terkirim.push({ jid, isi }); },
    end: () => ev.emit('connection.update', { connection: 'close' }),
  };
  const jaga = buatJagaPesan({
    cfg: { brand: { nama: 'Bot' }, jaga: { perintah: true, moderasi: false } },
    state: {},
    dataDir: '/tmp/jaga-pesan-test',
    saveState() {},
    emitStatus() {},
    log() {},
    sambung: async () => ({ sock, close() {} }),
  });
  const mulai = jaga.mulai();
  try {
    await new Promise(setImmediate);
    ev.emit('messages.upsert', {
      type: 'notify',
      messages: [{ key: { remoteJid: '900000000000001@lid', fromMe: true }, message: { conversation: '.menu' } }],
    });
    await new Promise(setImmediate);
    assert.equal(terkirim.length, 1);
    assert.equal(terkirim[0].jid, '628111222333@s.whatsapp.net');

    const hasilPanel = await jaga.kirimMenuSekarang();
    assert.equal(hasilPanel.ok, true);
    assert.equal(terkirim.length, 2);
    assert.equal(terkirim[1].jid, '628111222333@s.whatsapp.net');
  } finally {
    jaga.hentikan();
    await mulai;
  }
});
