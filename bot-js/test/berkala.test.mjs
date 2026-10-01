// ============================================================================
//  Unit test pesan berkala (M16) — murni, tanpa WhatsApp.
//  Jalankan:  npm test -w bot-js
// ============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';

import { jelaskanInterval, jatuhTempo, teksBerkala, susunDaftarHitam, pilihIsi } from '../src/berkala.mjs';

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
      { ids: ['628120000001@s.whatsapp.net'], label: '+628120000001', sejak: Date.parse('2026-09-30T10:00:00Z') },
      { ids: ['628110000002@s.whatsapp.net'], label: '+628110000002', sejak: null },
    ],
    sekarang: Date.parse('2026-10-01T12:00:00Z'),
  });
  assert.ok(teks.includes('Daftar hitam Alumni SMK (2 orang)'));
  // Urut dari nomor kecil ke besar, jadi yang 811 duluan walau didaftarkan belakangan.
  assert.ok(teks.includes('1. +628110000002'));
  assert.ok(teks.includes('2. +628120000001 (sejak 30/9)'));
  assert.ok(!teks.includes('null'));
  assert.ok(!teks.includes('@s.whatsapp.net'), 'JID mentah jangan muncul di pesan grup');
});

test('teksBerkala: nomor yang didaftarkan admin dinormalkan, bukan ditempel mentah', () => {
  const teks = teksBerkala({
    namaGrup: 'Grup Jualan',
    hitam: [{ ids: ['628120000111@s.whatsapp.net'], label: '+628120000111', sejak: null }],
    manual: ['0812-3456-7890', '+62 813 1111 2222', '813999888777', 'abc', ''],
  });
  assert.ok(teks.includes('(4 orang)'), 'abc dan baris kosong nggak dihitung');
  assert.ok(teks.includes('1. +628120000111'));
  assert.ok(teks.includes('(didaftarkan admin)'));
  assert.ok(teks.includes('+6281234567890'), 'nomor 0812… dinormalkan ke +62…');
  assert.ok(teks.includes('+6281311112222'), 'spasi/strip dibuang');
  assert.ok(teks.includes('+62813999888777'), 'nomor tanpa 0 diberi kode negara');
  assert.ok(!teks.includes('abc'));
});

test('susunDaftarHitam: satu orang dua kali tetap satu baris + dihitung sekali', () => {
  const { baris, jumlah } = susunDaftarHitam({
    hitam: [{ ids: ['628120000001@s.whatsapp.net', '555000001@lid'], sejak: null }],
    manual: ['+62 812-0000-001'], // orang yang sama, diketik admin
  });
  assert.equal(jumlah, 1);
  assert.equal(baris.length, 1);
  assert.match(baris[0], /^\+628120000001 \(didaftarkan admin\)$/);
});

test('susunDaftarHitam: nomor HP dulu, ID samaran di belakang, dari kecil ke besar', () => {
  const { baris } = susunDaftarHitam({
    hitam: [
      { ids: ['777@lid'], sejak: null },
      { ids: ['628999999999@s.whatsapp.net'], sejak: null },
      { ids: ['628111111111@s.whatsapp.net'], sejak: null },
    ],
  });
  assert.deepEqual(baris, ['+628111111111', '+628999999999', 'ID samaran …777']);
});

test('teksBerkala: daftar kepanjangan diringkas, nggak dicopot diam-diam', () => {
  const manual = Array.from({ length: 35 }, (_, i) => `6281200${String(i).padStart(4, '0')}`);
  const teks = teksBerkala({ namaGrup: 'Grup Besar', manual });
  assert.ok(teks.includes('(35 orang)'), 'hitungan tetap jujur walau barisnya diringkas');
  assert.ok(teks.includes('…dan 5 orang lainnya.'));
  assert.ok(!teks.includes('31. '), 'baris ke-31 ke atas nggak ditulis');
});

test('teksBerkala: daftar kosong dikasih pesan yang jelas, bukan daftar hampa', () => {
  const teks = teksBerkala({ namaGrup: 'Grup Baru', hitam: [], manual: ['abc', '??'] });
  assert.ok(teks.includes('masih kosong'));
  assert.ok(!/\d\.\s/.test(teks), 'nggak ada nomor urut kalau kosong');
});

test('teksBerkala: teks sendiri menang, daftar hitam dilewati', () => {
  const teks = teksBerkala({
    namaGrup: 'Grup X',
    hitam: [{ ids: ['628120000001@s.whatsapp.net'], sejak: null }],
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

test('teksBerkala: waktu ditulis Indonesia tanpa ICU (bukan 10/1/2026 7:00 PM)', () => {
  const teks = teksBerkala({ namaGrup: 'Grup X', manual: [], hitam: [], });
  assert.match(teks, /masih kosong/);
  const denganIsi = teksBerkala({
    namaGrup: 'Grup X', manual: ['628120000001'], sekarang: Date.parse('2026-10-01T12:06:00Z'),
  });
  assert.match(denganIsi, /Diperbarui \d{1,2} \w{3} \d{4}, \d{2}\.\d{2}/);
  assert.ok(!/AM|PM/.test(denganIsi), 'jangan format 12 jam Amerika');
});

test('pilihIsi: daftar hitam vs teks sendiri (mode "selalu daftar hitam")', () => {
  // teks kosong = daftar hitam (bawaan lama, nggak berubah)
  assert.deepEqual(pilihIsi({ teks: '' }), { kustom: '', mode: 'hitam' });
  assert.deepEqual(pilihIsi({ teks: '   ' }), { kustom: '', mode: 'hitam' });
  // ada teks = teks sendiri
  assert.deepEqual(pilihIsi({ teks: '  aturan grup  ' }), { kustom: 'aturan grup', mode: 'teks' });
  // saklar nyala: teks diabaikan, walau ada isinya
  assert.deepEqual(pilihIsi({ hitamSaja: true, teks: 'aturan grup' }), { kustom: '', mode: 'hitam' });
  assert.deepEqual(pilihIsi({ hitamSaja: true }), { kustom: '', mode: 'hitam' });
  assert.deepEqual(pilihIsi(), { kustom: '', mode: 'hitam' });
});
