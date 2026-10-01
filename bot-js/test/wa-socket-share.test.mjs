import test from 'node:test';
import assert from 'node:assert/strict';
import { sambungDenganSocketJaga, tungguSocketJaga } from '../src/wa-socket-share.mjs';

test('tugas pendek nebeng socket jaga tanpa menutupnya', async () => {
  const sock = { id: 'socket-persisten' };
  let koneksiBaru = 0;
  const hasil = await sambungDenganSocketJaga({
    pinjamSocket: async () => sock,
    sambungBaru: async () => { koneksiBaru++; return { sock: {}, close() {} }; },
  });
  assert.equal(hasil.sock, sock);
  hasil.close();
  assert.equal(koneksiBaru, 0);
});

test('tugas menunggu socket jaga yang sedang reconnect', async () => {
  const sock = { id: 'socket-pulih' };
  let siap = null;
  setTimeout(() => { siap = sock; }, 8);
  assert.equal(await tungguSocketJaga({
    aktif: () => true,
    ambilSocket: () => siap,
    batasMs: 100,
    jedaMs: 1,
  }), sock);
});

test('mode jaga mati tidak menunggu socket', async () => {
  assert.equal(await tungguSocketJaga({ aktif: () => false, ambilSocket: () => null }), null);
});

test('koneksi sementara dipilih kalau mode jaga mati', async () => {
  const sock = { id: 'socket-sementara' };
  let ditutup = false;
  const hasil = await sambungDenganSocketJaga({
    pinjamSocket: async () => null,
    sambungBaru: async () => ({ sock, close: () => { ditutup = true; } }),
  });
  assert.equal(hasil.sock, sock);
  hasil.close();
  assert.equal(ditutup, true);
});
