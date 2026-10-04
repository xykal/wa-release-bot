import test from 'node:test';
import assert from 'node:assert/strict';
import { BANK_LAWAK, MAKS_TANYA, acakPertanyaanLawak, formatPertanyaanLawak, AJAKAN_JAWAB } from '../src/lawak.mjs';

test('BANK_LAWAK: cukup banyak, unik, dan semuanya pertanyaan plenger', () => {
  assert.ok(BANK_LAWAK.length >= 50, `bank minimal 50 pertanyaan (sekarang ${BANK_LAWAK.length})`);
  assert.equal(new Set(BANK_LAWAK).size, BANK_LAWAK.length, 'nggak boleh ada duplikat');
  for (const q of BANK_LAWAK) {
    assert.ok(q.includes('?'), `tiap entri ada tanda tanya: "${q}"`);
    assert.ok(q.length <= MAKS_TANYA, `tiap entri <= ${MAKS_TANYA} karakter: "${q}"`);
    assert.ok(q.length >= 25, `terlalu pendek (kayaknya garing): "${q}"`);
  }
});

test('acakPertanyaanLawak: menghindari yang baru kekirim, tidak pernah kosong', () => {
  const tigaPertama = BANK_LAWAK.slice(0, 3);
  for (let i = 0; i < 50; i++) {
    const q = acakPertanyaanLawak(tigaPertama);
    assert.ok(BANK_LAWAK.includes(q));
    assert.ok(!tigaPertama.includes(q), 'yang lagi "jangan" nggak boleh kepilih');
  }
  // Semua kecuali satu di-jangan → yang tersisa yang keluar
  const sisaSatu = BANK_LAWAK[BANK_LAWAK.length - 1];
  assert.equal(acakPertanyaanLawak(BANK_LAWAK.slice(0, -1)), sisaSatu);
  // Semua di-jangan (kasus aneh) → tetap balikin sesuatu, jangan undefined
  assert.ok(BANK_LAWAK.includes(acakPertanyaanLawak(BANK_LAWAK)));
});

test('formatPertanyaanLawak: kepala SukiBot di atas + ajakan jawab di bawah', () => {
  const t = formatPertanyaanLawak('Kalau nasi udah jadi bubur, dia masih ngaku nasi?');
  assert.ok(t.startsWith('*🦴 SUKIBOT · '), 'kepala SukiBot · judul di baris pertama');
  assert.ok(t.includes('Kalau nasi udah jadi bubur'));
  assert.ok(t.endsWith(AJAKAN_JAWAB), 'ajakan jawab jadi penutup');
  assert.ok(!t.includes('─'), 'nggak ada garis strip yang suka wrap di layar sempit');
});

test('formatPertanyaanLawak: pertanyaan super panjang dipotong aman', () => {
  const panjang = 'x'.repeat(1000) + '?';
  const t = formatPertanyaanLawak(panjang);
  assert.ok(t.length < 1000);
  assert.ok(!t.includes('x'.repeat(300)));
});
