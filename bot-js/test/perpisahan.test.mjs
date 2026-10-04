import test from 'node:test';
import assert from 'node:assert/strict';
import {
  tagOrang,
  renderPerpisahan,
  susunKirimanPerpisahan,
  tandaiDisalam,
  sudahDisalam,
  TEKS_PERPISAHAN_BAWAAN,
  MAKS_PISAH_SATUAN,
} from '../src/grup.mjs';

// Kall 2026-10-04: "pesan buat yang keluar, kustom, pasti ngetag yg keluar".

test('tagOrang: nomor HP diprioritaskan; token @ selaras dengan JID-nya', () => {
  assert.deepEqual(tagOrang(['6281234567890@s.whatsapp.net', '777000@lid']), {
    jid: '6281234567890@s.whatsapp.net',
    teks: '@6281234567890',
  });
  assert.deepEqual(tagOrang(['777000@lid']), { jid: '777000@lid', teks: '@777000' });
  // tanpa identitas valid: teksnya label polos, nggak crash
  const t = tagOrang(['@ rusak']);
  assert.equal(t.jid, null);
  assert.ok(t.teks.length > 0);
});

test('renderPerpisahan: placeholder diganti; nama jatuh ke tag kalau nggak tahu', () => {
  const tag = { jid: '6281234567890@s.whatsapp.net', teks: '@6281234567890' };
  const t = renderPerpisahan('{tag} aka {nama} cabut dari {grup}!', { tag, nama: 'Budi', namaGrup: 'Alumni' });
  assert.equal(t, '@6281234567890 aka Budi cabut dari Alumni!');
  const t2 = renderPerpisahan('sayonara {nama}', { tag, nama: null, namaGrup: 'Alumni' });
  assert.ok(t2.includes('@6281234567890'), 'nama kosong → token mention');
});

test('renderPerpisahan: template TANPA {tag} tetap PASTI ngetag (disisipkan otomatis)', () => {
  const tag = { jid: '777000@lid', teks: '@777000' };
  const t = renderPerpisahan('weh ada yang kabur!', { tag, nama: null, namaGrup: 'Grup' });
  assert.ok(t.includes('@777000'), 'token tetap ada');
  // template kosong → bawaan, tetap ngetag
  const b = renderPerpisahan('', { tag, nama: null, namaGrup: 'Grup' });
  assert.ok(b.includes('@777000'));
  assert.ok(TEKS_PERPISAHAN_BAWAAN.includes('{tag}'), 'bawaan pakai placeholder {tag}');
});

test('susunKirimanPerpisahan: 1 orang = 1 pesan mention-1-jid; kepala SukiBot di atas', () => {
  const { daftar } = susunKirimanPerpisahan([
    ['6281234567890@s.whatsapp.net'],
  ], { template: 'dadah {tag}', namaGrup: 'Alumni', peta: {} });
  assert.equal(daftar.length, 1);
  assert.ok(daftar[0].teks.startsWith('*🦴 SUKIBOT · PERPISAHAN*'));
  assert.ok(daftar[0].teks.includes('dadah @6281234567890'));
  assert.deepEqual(daftar[0].mentions, ['6281234567890@s.whatsapp.net']);
});

test('susunKirimanPerpisahan: rame-rame keluar → maks N satu-satu, sisanya gabung tapi SEMUA ke-tag', () => {
  const keluar = Array.from({ length: 6 }, (_, i) => [`6281200000${i}@s.whatsapp.net`]);
  const { daftar } = susunKirimanPerpisahan(keluar, { template: 'ciao {tag}', namaGrup: 'X', peta: {} });
  assert.equal(daftar.length, MAKS_PISAH_SATUAN + 1, '3 satuan + 1 gabungan');
  const gabungan = daftar[MAKS_PISAH_SATUAN];
  assert.equal(gabungan.mentions.length, 3, '3 sisa di-mention semua di pesan gabungan');
  for (const m of gabungan.mentions) {
    assert.ok(gabungan.teks.includes('@' + m.split('@')[0]), `token ${m} ada di teks gabungan`);
  }
});

test('susunKirimanPerpisahan: JUDUL kustom dipakai, kosong → PERPISAHAN bawaan', () => {
  const satu = [['6281234567890@s.whatsapp.net']];
  const kustom = susunKirimanPerpisahan(satu, { template: 'x {tag}', namaGrup: 'G', peta: {}, judul: 'SELAMAT TINGGAL' });
  assert.ok(kustom.daftar[0].teks.startsWith('*🦴 SUKIBOT · SELAMAT TINGGAL*'));
  const bawaan = susunKirimanPerpisahan(satu, { template: 'x {tag}', namaGrup: 'G', peta: {}, judul: '   ' });
  assert.ok(bawaan.daftar[0].teks.startsWith('*🦴 SUKIBOT · PERPISAHAN*'));
});

test('tanda salam: sudahDisalam mencegah dobel salam antar jalur (real-time vs polling)', () => {
  const orang1 = ['6281234567890@s.whatsapp.net', '777000@lid'];
  let tanda = tandaiDisalam({}, [orang1], 1000);
  assert.ok(sudahDisalam(tanda, orang1), 'sudah ditandai → polling skip');
  assert.ok(!sudahDisalam(tanda, ['999999@s.whatsapp.net']), 'orang lain tetap disalam');
  assert.equal(Object.keys(tanda).length, 2, 'kedua identitasnya ditandai');
  // Tanda basi (lebih dari 7 hari) dibersihkan
  tanda = tandaiDisalam(tanda, [['111@s.whatsapp.net']], 1000 + 8 * 24 * 3_600_000);
  assert.ok(!sudahDisalam(tanda, orang1), 'tanda kedaluwarsa dibersihkan');
});
