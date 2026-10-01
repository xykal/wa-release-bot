// ============================================================================
//  Unit test pesan berkala (M16) — murni, tanpa WhatsApp.
//  Jalankan:  npm test -w bot-js
// ============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';

import { jelaskanInterval, jatuhTempo, teksBerkala } from '../src/berkala.mjs';

test('jelaskanInterval: dijepit 1..168 jam, bukan error', () => {
  assert.equal(jelaskanInterval(12), 12);
  assert.equal(jelaskanInterval('6'), 6);
  assert.equal(jelaskanInterval(0), 1);
  assert.equal(jelaskanInterval(-5), 1);
  assert.equal(jelaskanInterval(999), 168);
  assert.equal(jelaskanInterval('abc'), 1);
  assert.equal(jelaskanInterval(undefined), 1);
});

test('jatuhTempo: belum pernah kirim = langsung, sesudahnya tunggu jeda', () => {
  const jam = 3_600_000;
  assert.equal(jatuhTempo({ lastAt: null, intervalJam: 12, sekarang: 1_000 }), true);
  assert.equal(jatuhTempo({ lastAt: 1_000, intervalJam: 12, sekarang: 1_000 + 11 * jam }), false);
  assert.equal(jatuhTempo({ lastAt: 1_000, intervalJam: 12, sekarang: 1_000 + 12 * jam }), true);
  assert.equal(jatuhTempo({ lastAt: 1_000, intervalJam: 12, sekarang: 1_000 + 30 * jam }), true);
});

test('teksBerkala: daftar hitam bernomor + label + tanggal', () => {
  const teks = teksBerkala({
    namaGrup: 'Alumni SMK',
    hitam: [
      { label: '+62 812-3456-7890', sejak: Date.parse('2026-09-30T10:00:00Z') },
      { label: '+62 811-222-333', sejak: null },
    ],
    sekarang: Date.parse('2026-10-01T12:00:00Z'),
  });
  assert.ok(teks.includes('Daftar hitam Alumni SMK (2 orang)'));
  assert.ok(teks.includes('1. +62 812-3456-7890 (sejak 30/9)'));
  assert.ok(teks.includes('2. +62 811-222-333'));
  assert.ok(!teks.includes('null'));
});

test('teksBerkala: nomor yang didaftarkan admin ikut, tanpa tanggal', () => {
  const teks = teksBerkala({
    namaGrup: 'Grup Jualan',
    hitam: [{ label: '+62 812-000-111', sejak: null }],
    manual: ['628123456789'],
  });
  assert.ok(teks.includes('(2 orang)'));
  assert.ok(teks.includes('2. 628123456789 (didaftarkan admin)'));
});

test('teksBerkala: daftar kosong dikasih pesan yang jelas, bukan daftar hampa', () => {
  const teks = teksBerkala({ namaGrup: 'Grup Baru', hitam: [], manual: [] });
  assert.ok(teks.includes('masih kosong'));
  assert.ok(!/\d\.\s/.test(teks), 'nggak ada nomor urut kalau kosong');
});

test('teksBerkala: teks sendiri menang, daftar hitam dilewati', () => {
  const teks = teksBerkala({
    namaGrup: 'Grup X',
    hitam: [{ label: '+62 812', sejak: null }],
    teksKustom: '  Aturan grup: jangan kirim link.\nTerima kasih.  ',
  });
  assert.equal(teks, 'Aturan grup: jangan kirim link.\nTerima kasih.');
  assert.ok(!teks.includes('Daftar hitam'));
});

test('teksBerkala: nama grup kosong diganti "grup ini", bukan undefined', () => {
  const teks = teksBerkala({ hitam: [] });
  assert.ok(teks.includes('grup ini'));
  assert.ok(!teks.includes('undefined'));
});
