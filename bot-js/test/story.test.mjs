// ============================================================================
//  Unit test penonton story — murni, tanpa WhatsApp.
//  Aturan yang dijaga: `.story` = pribadi saja; anggota grup cuma ikut lewat
//  `.storygrup` DAN kalau Penjaga grup nyala (permintaan kall 2026-10-01).
//  Jalankan:  npm test -w bot-js
// ============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';

import { penontonStory, keteranganPenonton } from '../src/story.mjs';

const PRIBADI = ['628111@s.whatsapp.net', '628222@s.whatsapp.net'];
const ANGGOTA = [{ id: '628333@s.whatsapp.net' }, { id: '999@lid', lid: '888@lid' }];

test('story polos: cuma nomor pribadi, grup nggak pernah kesentuh', () => {
  const hasil = penontonStory({ storyKe: PRIBADI, anggota: ANGGOTA, grupAktif: true });
  assert.deepEqual(hasil, PRIBADI);
});

test('storygrup: anggota grup ikut kalau penjaga grup nyala', () => {
  const hasil = penontonStory({ storyKe: PRIBADI, anggota: ANGGOTA, grupAktif: true }, { tagGrup: true });
  assert.deepEqual(hasil, [...PRIBADI, '628333@s.whatsapp.net', '999@lid', '888@lid']);
});

test('storygrup: penjaga grup mati = turun jadi pribadi saja', () => {
  const hasil = penontonStory({ storyKe: PRIBADI, anggota: ANGGOTA, grupAktif: false }, { tagGrup: true });
  assert.deepEqual(hasil, PRIBADI);
});

test('nomor dobel nggak dihitung dua kali, baris kosong dibuang', () => {
  const hasil = penontonStory({
    storyKe: ['628111@s.whatsapp.net', ' 628111@s.whatsapp.net ', '', '628444@s.whatsapp.net'],
    anggota: [{ id: '628444@s.whatsapp.net' }],
    grupAktif: true,
  }, { tagGrup: true });
  assert.deepEqual(hasil, ['628111@s.whatsapp.net', '628444@s.whatsapp.net']);
});

test('belum ada nomor = daftar kosong (pemanggil yang nolak, bukan kirim kosong)', () => {
  assert.deepEqual(penontonStory({}, { tagGrup: true }), []);
  assert.deepEqual(penontonStory({ storyKe: '628111@s.whatsapp.net' }), ['628111@s.whatsapp.net']);
});

test('keterangan penonton jujur soal grup', () => {
  assert.equal(keteranganPenonton(2, 5, { tagGrup: true, grupAktif: true }), '5 penonton (2 nomor pribadi + 3 dari anggota grup)');
  assert.equal(keteranganPenonton(2, 2, { tagGrup: true, grupAktif: false }), '2 nomor pribadi (Penjaga grup mati, jadi anggota grup nggak diikutkan)');
  assert.equal(keteranganPenonton(3, 3), '3 nomor pribadi');
});
