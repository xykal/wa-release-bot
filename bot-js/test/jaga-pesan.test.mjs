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

test('sambutan SukiBot hanya muncul di grup pantauan setelah opt-in privat', async () => {
  const ev = new EventEmitter();
  const terkirim = [];
  const sock = {
    ev,
    ws: new EventEmitter(),
    user: { id: '628111222333:4@s.whatsapp.net', lid: '900000000000001@lid' },
    sendMessage: async (jid, isi) => { terkirim.push({ jid, isi }); },
    end: () => ev.emit('connection.update', { connection: 'close' }),
  };
  const state = { welcomeAktif: false, grup: { target: '12345@g.us', jid: '12345@g.us', nama: 'Xyclous' } };
  const jaga = buatJagaPesan({
    cfg: { brand: { nama: 'SukiBot' }, grup: { aktif: true, target: '12345@g.us' }, jaga: { perintah: true, moderasi: false } },
    state,
    dataDir: '/tmp/jaga-welcome-test',
    saveState() {},
    emitStatus() {},
    log() {},
    sambung: async () => ({ sock, close() {} }),
  });
  const mulai = jaga.mulai();
  try {
    await new Promise(setImmediate);
    ev.emit('group-participants.update', { id: '12345@g.us', action: 'add', participants: ['628999@s.whatsapp.net'] });
    await new Promise(setImmediate);
    assert.equal(terkirim.length, 0, 'default mati agar nggak spam tanpa opt-in');

    ev.emit('messages.upsert', {
      type: 'notify',
      messages: [{ key: { remoteJid: '900000000000001@lid', fromMe: true }, message: { conversation: '.welcome on' } }],
    });
    await new Promise(setImmediate);
    assert.equal(terkirim.length, 1);
    assert.equal(terkirim[0].jid, '628111222333@s.whatsapp.net');

    ev.emit('group-participants.update', { id: '99999@g.us', action: 'add', participants: ['628999@s.whatsapp.net'] });
    await new Promise(setImmediate);
    assert.equal(terkirim.length, 1, 'grup lain tidak disentuh');
    ev.emit('group-participants.update', { id: '12345@g.us', action: 'remove', participants: ['628999@s.whatsapp.net'] });
    await new Promise(setImmediate);
    assert.equal(terkirim.length, 1, 'keluar grup tidak disambut');
    ev.emit('group-participants.update', { id: '12345@g.us', action: 'add', participants: ['628999@s.whatsapp.net'] });
    await new Promise(setImmediate);
    assert.equal(terkirim.length, 2);
    assert.equal(terkirim[1].jid, '12345@g.us');
    assert.match(terkirim[1].isi.text, /Selamat datang di \*Xyclous\*/);
    assert.match(terkirim[1].isi.text, /SukiBot/);

    ev.emit('messages.upsert', {
      type: 'notify',
      messages: [{ key: { remoteJid: '900000000000001@lid', fromMe: true }, message: { conversation: '.welcome off' } }],
    });
    await new Promise(setImmediate);
    assert.equal(state.welcomeAktif, false);
    assert.equal(terkirim.length, 3);
    ev.emit('group-participants.update', { id: '12345@g.us', action: 'add', participants: ['628777@s.whatsapp.net'] });
    await new Promise(setImmediate);
    assert.equal(terkirim.length, 3, 'off menghentikan sambutan');
  } finally {
    jaga.hentikan();
    await mulai;
  }
});
