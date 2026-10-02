// ============================================================================
//  Unit test moderasi grup + perintah chat pribadi (M14/M15).
//  Semua fungsi di src/pesan.mjs murni (tanpa jaringan/WhatsApp), jadi bisa
//  diuji di Node biasa:  npm test -w bot-js
// ============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  daftarLink,
  hostDari,
  nilaiPesan,
  bacaPerintah,
  hukumanModerasi,
  menuTeks,
  PERINTAH,
  DOMAIN_DIIZINKAN,
} from '../src/pesan.mjs';

test('daftarLink: ambil link, buang tanda baca di ujung', () => {
  const link = daftarLink('coba https://t.me/judol88, terus www.contoh.com.');
  assert.deepEqual(link, ['https://t.me/judol88', 'www.contoh.com']);
});

test('hostDari: normalisasi www dan skema', () => {
  assert.equal(hostDari('https://WWW.Tokopedia.com/x'), 'tokopedia.com');
  assert.equal(hostDari('chat.whatsapp.com/abc'), 'chat.whatsapp.com');
  assert.equal(hostDari('bukan url'), '');
});

test('nilaiPesan: admin, bot sendiri, dan pengirim sendiri selalu dilewatkan', () => {
  const isi = 'PROMO SLOT GACOR https://t.me/judol88';
  assert.equal(nilaiPesan({ teks: isi, dariAdmin: true }).aksi, 'abaikan');
  assert.equal(nilaiPesan({ teks: isi, dariBot: true }).aksi, 'abaikan');
  assert.equal(nilaiPesan({ teks: isi, dariSaya: true }).aksi, 'abaikan');
});

test('nilaiPesan: link Telegram dihapus (kategori phishing)', () => {
  const hasil = nilaiPesan({ teks: 'join yuk t.me/cuancepat' });
  assert.equal(hasil.aksi, 'hapus');
  assert.equal(hasil.kategori, 'phishing');
});

test('nilaiPesan: link luar dihapus (promosi), domain yang diizinkan aman', () => {
  const luar = nilaiPesan({ teks: 'cek https://tokoserba.co.id/produk' });
  assert.equal(luar.aksi, 'hapus');
  assert.equal(luar.kategori, 'promosi');

  for (const host of DOMAIN_DIIZINKAN) {
    const aman = nilaiPesan({ teks: `undangan grup https://${host}/x` });
    assert.equal(aman.aksi, 'abaikan', `${host} harus diizinkan`);
  }
});

test('nilaiPesan: izinkanLink = true meloloskan link luar', () => {
  const hasil = nilaiPesan({ teks: 'baca di https://blog.contoh.com/postingan', izinkanLink: true });
  assert.equal(hasil.aksi, 'abaikan');
});

test('nilaiPesan: kata judi/pinjol/promo kena, kata netral tidak', () => {
  assert.equal(nilaiPesan({ teks: 'slot gacor hari ini' }).kategori, 'judi');
  assert.equal(nilaiPesan({ teks: 'pinjam uang cepat cair' }).kategori, 'judi');
  assert.equal(nilaiPesan({ teks: 'PROMO gede di toko gua' }).kategori, 'promosi');
  assert.equal(nilaiPesan({ teks: 'assalamualaikum semua' }).aksi, 'abaikan');
  assert.equal(nilaiPesan({ teks: '' }).aksi, 'abaikan');
});

test('nilaiPesan: domain & kata tambahan dari setting ikut dipakai', () => {
  const hasil = nilaiPesan({ teks: 'kunjungi https://situsnakal.biz/x', linkDilarang: ['situsnakal.biz'] });
  assert.equal(hasil.aksi, 'hapus');
  assert.equal(hasil.kategori, 'phishing');

  const kata = nilaiPesan({ teks: 'jangan lupa mampir ya', kataTambahan: ['mampir'] });
  assert.equal(kata.aksi, 'hapus');
});

test('bacaPerintah: titik dan garis miring, argumen dipisah', () => {
  assert.deepEqual(bacaPerintah('.ping'), { nama: 'ping', arg: '', dikenal: true });
  assert.deepEqual(bacaPerintah('  .stiker  '), { nama: 'stiker', arg: '', dikenal: true });
  assert.deepEqual(bacaPerintah('/menu'), { nama: 'menu', arg: '', dikenal: true });
  assert.deepEqual(bacaPerintah('.storygrup halo'), { nama: 'storygrup', arg: 'halo', dikenal: true });
  assert.deepEqual(bacaPerintah('.brat halo dunia'), { nama: 'brat', arg: 'halo dunia', dikenal: true });
  assert.deepEqual(bacaPerintah('.welcome on'), { nama: 'welcome', arg: 'on', dikenal: true });
  assert.equal(bacaPerintah('halo semua'), null);
  assert.equal(bacaPerintah('.'), null);
  assert.equal(bacaPerintah('.ngawur').dikenal, false);
});

test('menuTeks: semua perintah yang dikenal disebut', () => {
  const teks = menuTeks('WA Release Bot');
  for (const nama of Object.keys(PERINTAH)) {
    assert.ok(teks.includes(`.${nama}`), `menu harus menyebut .${nama}`);
  }
  assert.ok(teks.includes('chat ini saja'), 'menu menegaskan perintah cuma buat chat sendiri');
  assert.ok(teks.includes('*MEDIA & STATUS*'));
  assert.ok(teks.includes('— SukiBot'), 'menu menyertakan tagline bot');
});

test('hukumanModerasi: peringatan dulu, strike kedua keluar', () => {
  const satu = hukumanModerasi({ strikeSebelumnya: 0, batasStrike: 2, kategori: 'promosi' });
  assert.equal(satu.hukuman, 'peringatan');
  assert.equal(satu.strike, 1);
  assert.ok(satu.teks.includes('1/2'));

  const dua = hukumanModerasi({ strikeSebelumnya: 1, batasStrike: 2, kategori: 'judi' });
  assert.equal(dua.hukuman, 'kick');
  assert.equal(dua.strike, 2);
  assert.ok(dua.teks.includes('judi'));

  const santai = hukumanModerasi({ strikeSebelumnya: 1, batasStrike: 3 });
  assert.equal(santai.hukuman, 'peringatan');
});
