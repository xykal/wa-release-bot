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

test('perpisahan instan: mode jaga hidup tanpa perintah/moderasi, salam keluar detik itu', async () => {
  const ev = new EventEmitter();
  const terkirim = [];
  const sock = {
    ev,
    ws: new EventEmitter(),
    user: { id: '628111222333:4@s.whatsapp.net', lid: '900000000000001@lid' },
    sendMessage: async (jid, isi) => { terkirim.push({ jid, isi }); },
    end: () => ev.emit('connection.update', { connection: 'close' }),
  };
  const state = { grup: { target: '12345@g.us', jid: '12345@g.us', nama: 'Xyclous' } };
  const jaga = buatJagaPesan({
    // PERINTAH dan MODERASI mati dua-duanya — dulu mode jaga nggak mau hidup,
    // jadi perpisahan cuma jalan pas cek rutin (sampai menit berikutnya).
    cfg: {
      brand: { nama: 'SukiBot' },
      grup: { aktif: true, target: '12345@g.us', perpisahan: { aktif: true, instan: true } },
      jaga: { perintah: false, moderasi: false },
    },
    state,
    running: true,
    dataDir: '/tmp/jaga-instan-test',
    saveState() {},
    emitStatus() {},
    log() {},
    sambung: async () => ({ sock, close() {} }),
  });
  assert.equal(jaga.sedangJalan(), false, 'belum nyala sebelum mulai()');
  const mulai = jaga.mulai();
  try {
    await new Promise(setImmediate);
    assert.equal(jaga.sedangJalan(), true, 'instan harus nyalain mode jaga walau perintah/moderasi mati');

    ev.emit('group-participants.update', { id: '12345@g.us', action: 'remove', participants: ['628999@s.whatsapp.net'] });
    await new Promise(setImmediate);
    assert.equal(terkirim.length, 1, 'salam perpisahan langsung terkirim lewat event');
    assert.equal(terkirim[0].jid, '12345@g.us');
    assert.deepEqual(terkirim[0].isi.mentions, ['628999@s.whatsapp.net'], 'yang keluar pasti ke-mention');
    assert.match(terkirim[0].isi.text, /@628999/);
    assert.ok(state.grup.hitam.includes('628999@s.whatsapp.net'), 'langsung dicatat ke daftar hitam tanpa nunggu polling');
    assert.ok(state.grup.pisahTerkirim, 'tanda sudah-disalam disimpan agar polling tidak kirim ulang');

    // Orang yang sama lewat polling: tidak dikirimi salam kedua.
    assert.ok(!state.grup.pisahTerkirim['628999@lid'], 'identitas lain belum ditandai');
  } finally {
    jaga.hentikan();
    await mulai;
  }
  assert.equal(jaga.sedangJalan(), false);
});

test('perpisahan instan mati + perintah/moderasi mati: mode jaga tetap tidur (hemat batre)', async () => {
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
    cfg: {
      brand: { nama: 'SukiBot' },
      grup: { aktif: true, target: '12345@g.us', perpisahan: { aktif: true, instan: false } },
      jaga: { perintah: false, moderasi: false },
    },
    state: { grup: { target: '12345@g.us', jid: '12345@g.us', nama: 'Xyclous' } },
    running: true,
    dataDir: '/tmp/jaga-instan-mati-test',
    saveState() {},
    emitStatus() {},
    log() {},
    sambung: async () => ({ sock, close() {} }),
  });
  const mulai = jaga.mulai();
  await mulai; // guard langsung balik — tidak ada yang butuh koneksi nyala
  assert.equal(jaga.sedangJalan(), false, 'tanpa instan, mode jaga tidak boleh nyala sendiri');

  ev.emit('group-participants.update', { id: '12345@g.us', action: 'remove', participants: ['628999@s.whatsapp.net'] });
  await new Promise(setImmediate);
  assert.equal(terkirim.length, 0, 'tidak ada pengirim; salam ditangguk jalur polling');
});

test('koneksi jaga putus: cek grup susulan jalan biar yang kelewat tetap disalam kilat', async () => {
  const ev = new EventEmitter();
  const sock = {
    ev,
    ws: new EventEmitter(),
    user: { id: '628111222333:4@s.whatsapp.net', lid: '900000000000001@lid' },
    sendMessage: async () => {},
    end: () => ev.emit('connection.update', { connection: 'close' }),
  };
  const susulan = [];
  const jaga = buatJagaPesan({
    cfg: {
      brand: { nama: 'SukiBot' },
      grup: { aktif: true, target: '12345@g.us', perpisahan: { aktif: true, instan: true } },
      jaga: { perintah: false, moderasi: false },
    },
    state: { grup: { target: '12345@g.us', jid: '12345@g.us', nama: 'Xyclous' } },
    running: true,
    dataDir: '/tmp/jaga-susulan-test',
    saveState() {},
    emitStatus() {},
    log() {},
    sambung: async () => ({ sock, close() {} }),
    fitur: { grup: { runGrup: async (sumber) => { susulan.push(sumber); } } },
  });
  const mulai = jaga.mulai();
  try {
    await new Promise(setImmediate);
    assert.deepEqual(susulan, [], 'belum ada putus-nyambung, belum ada susulan');
    ev.emit('connection.update', { connection: 'close' });
    await new Promise(setImmediate);
    assert.deepEqual(susulan, ['susulan'], 'setelah koneksi putus, cek susulan dipanggil');
  } finally {
    jaga.hentikan();
    await mulai;
  }
});
