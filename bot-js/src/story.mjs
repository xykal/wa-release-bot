// Penonton story (status WA). Berkas ini SENGAJA nggak import Baileys, jadi
// keputusannya bisa diuji langsung: `node --test test/story.test.mjs`.
//
// Aturan (permintaan kall 2026-10-01): story itu urusan PRIBADI.
//   .story      -> cuma nomor yang didaftarkan di kolom Story app.
//   .storygrup  -> nomor itu DITAMBAH anggota grup yang dipantau, dan itu pun
//                  cuma kalau Penjaga grup memang nyala.
// Jadi grup nggak pernah kebagian story tanpa diminta eksplisit, dan kalau
// penjaga grup mati, `.storygrup` turun jadi `.story` (bukan kirim ke grup
// yang belum dicek).

import { identitas } from './grup.mjs';

/**
 * Daftar JID penonton story.
 *
 * @param {{ storyKe?: string[]|string, anggota?: object[], grupAktif?: boolean }} sumber
 *   storyKe = hasil normalisasi config (sudah berbentuk JID), anggota = entri
 *   dari metadata grup (punya id/lid), grupAktif = penjaga grup nyala.
 * @param {{ tagGrup?: boolean }} opsi
 * @returns {string[]} JID unik, urutan: nomor pribadi dulu, lalu anggota grup.
 */
export function penontonStory({ storyKe = [], anggota = [], grupAktif = false } = {}, { tagGrup = false } = {}) {
  const mentah = Array.isArray(storyKe) ? storyKe : [storyKe];
  const pribadi = [
    ...new Set(mentah.map((j) => String(j ?? '').trim()).filter(Boolean)),
  ];
  if (!tagGrup || !grupAktif) return pribadi;

  const semua = new Set(pribadi);
  for (const p of anggota) for (const i of identitas(p)) semua.add(i);
  return [...semua];
}

/**
 * Keterangan penonton buat log & jawaban chat sendiri, biar kelihatan jelas
 * story-nya lari ke mana (ini yang bikin salah paham "kok ke grup").
 *
 * @param {number} pribadi jumlah nomor pribadi
 * @param {number} total jumlah penonton yang benar-benar dipakai
 * @param {{ tagGrup?: boolean, grupAktif?: boolean }} opsi
 */
export function keteranganPenonton(pribadi, total, { tagGrup = false, grupAktif = false } = {}) {
  if (tagGrup && grupAktif) {
    return `${total} penonton (${pribadi} nomor pribadi + ${total - pribadi} dari anggota grup)`;
  }
  if (tagGrup) {
    return `${total} nomor pribadi (Penjaga grup mati, jadi anggota grup nggak diikutkan)`;
  }
  return `${total} nomor pribadi`;
}
