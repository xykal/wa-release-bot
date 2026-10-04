import test from 'node:test';
import assert from 'node:assert/strict';
import { NAMA_BOT, NAMA_BOT_BAWAAN, aturNamaBot } from '../src/config/brand.mjs';
import { pesanRapi } from '../src/format.mjs';
import { teksDenganTagline, TAGLINE_BOT } from '../src/wa.mjs';

// Kall 2026-10-04: nama bot + judul bisa diganti dari dashboard app.

test('aturNamaBot: nama rapi dipakai langsung di kepala & tagline', () => {
  try {
    aturNamaBot('JokiBot');
    assert.equal(NAMA_BOT, 'JokiBot');
    assert.ok(pesanRapi('TES', 'isi').startsWith('*🦴 JOKIBOT · TES*'));
    assert.equal(teksDenganTagline('hello'), 'hello\n\n— JokiBot');
  } finally {
    aturNamaBot('');
  }
  assert.equal(NAMA_BOT, NAMA_BOT_BAWAAN);
});

test('aturNamaBot: karakter perusak markup dibuang; nama kosong/kepanjangan ditangani', () => {
  try {
    aturNamaBot('*Bot~Nakal`*');
    assert.equal(NAMA_BOT, 'Bot Nakal', NAMA_BOT);
    assert.ok(!/[*_~`]/.test(NAMA_BOT));
    aturNamaBot('   ');
    assert.equal(NAMA_BOT, NAMA_BOT_BAWAAN, 'kosong → bawaan SukiBot');
    aturNamaBot('x'.repeat(50));
    assert.ok(NAMA_BOT.length <= 24);
  } finally {
    aturNamaBot('');
  }
});

test('TAGLINE_BOT snapshot tetap bawaan (dokumentasi bentuk); pesan lewat taglineBot()', () => {
  assert.equal(TAGLINE_BOT, `— ${NAMA_BOT_BAWAAN}`);
});
