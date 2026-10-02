// Audience test for Status privacy list; native group mention is separate.
import test from 'node:test';
import assert from 'node:assert/strict';

import { penontonStory, keteranganPenonton } from '../src/story.mjs';

const PRIBADI = ['628111@s.whatsapp.net', '628222@s.whatsapp.net'];
const ANGGOTA = [{ id: '628333@s.whatsapp.net' }, { id: '999@lid', lid: '888@lid' }];

test('audience story hanya berisi nomor yang dipilih secara eksplisit', () => {
  const hasil = penontonStory({ storyKe: PRIBADI, anggota: ANGGOTA, grupAktif: true });
  assert.deepEqual(hasil, PRIBADI);
});

test('field grup tidak memperluas audience seolah-olah native mention', () => {
  const hasil = penontonStory({ storyKe: PRIBADI, anggota: ANGGOTA, grupAktif: true }, { tagGrup: true });
  assert.deepEqual(hasil, PRIBADI);
});

test('nomor dobel dan baris kosong dibuang', () => {
  const hasil = penontonStory({ storyKe: ['628111@s.whatsapp.net', ' 628111@s.whatsapp.net ', '', '628444@s.whatsapp.net'] });
  assert.deepEqual(hasil, ['628111@s.whatsapp.net', '628444@s.whatsapp.net']);
});

test('belum ada nomor = daftar kosong; pemanggil yang menolak kiriman kosong', () => {
  assert.deepEqual(penontonStory({}), []);
  assert.deepEqual(penontonStory({ storyKe: '628111@s.whatsapp.net' }), ['628111@s.whatsapp.net']);
});

test('keterangan jumlah audience tidak menyiratkan mention grup', () => {
  assert.equal(keteranganPenonton(5), '5 nomor pribadi');
});
