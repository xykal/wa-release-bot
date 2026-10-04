// Pesan berkala ke grup: bagian murni (tanpa jaringan), jadi bisa diuji unit.
//
// Yang dikirim bisa dua macam (permintaan kall 2026-10-01):
//   1. daftar hitam grup — "siapa aja yang nggak boleh masuk lagi";
//   2. teks sendiri, kalau user mau pesan lain (aturan grup, jadwal, dsb).
// Kapan kirimnya juga di sini, bukan di bot.mjs: biar gampang dites tanpa WA.
//
// Susunan daftar hitam dirapikan lagi 2026-10-01 (kall: "list daftar hitamnya
// rusak"): nomor yang diketik admin dulu ditampilkan mentah apa adanya, jadi
// barisnya campur ("0812-3456-7890", "+62 813 1111 2222"), ada baris sampah
// ("abc"), dan satu orang bisa muncul dua kali (versi otomatis + versi manual)
// sementara hitungannya bilang "6 orang" padahal isinya 3. Sekarang semua
// masukan lewat normalisasi nomor, dibuang duplikatnya, diurutkan, dan
// hitungannya = jumlah orang.

import { normalisasiNomor } from './nomor.mjs';
import { formatWaktu, tanggalPendek } from './waktu.mjs';
import { pesanRapi } from './format.mjs';

/**
 * Putuskan isi yang dikirim: daftar hitam grup atau teks sendiri.
 *
 * `hitamSaja` = saklar "Selalu kirim daftar hitam" di app (permintaan kall
 * 2026-10-01: pengin pesan berkala yang isinya CUMA daftar hitam). Kalau nyala,
 * kolom teks diabaikan — jadi orang bisa nyimpen draf teks tanpa takut kepakai.
 *
 * @returns {{ kustom: string, mode: 'hitam'|'teks' }}
 */
export function pilihIsi({ hitamSaja = false, teks = '' } = {}) {
  const kustom = String(teks || '').trim();
  if (hitamSaja) return { kustom: '', mode: 'hitam' };
  if (kustom) return { kustom, mode: 'teks' };
  return { kustom: '', mode: 'hitam' }; // teks kosong = daftar hitam (bawaan lama)
}

/** Paling banyak sekian baris ditulis; sisanya diringkas. Pesan grup jangan kepanjangan. */
export const MAKS_BARIS = 30;

/** Jarak antar pesan: 1-168 jam (seminggu). Di luar itu dijepit, bukan error. */
export function jelaskanInterval(jam) {
  const n = Math.round(Number(jam));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 168);
}

/** Jam-kirim yang masih enak dibaca mesin mahal batre: kelipatan ke bawah. */
export function jatuhTempo({ lastAt, intervalJam, sekarang = Date.now() }) {
  const jeda = jelaskanInterval(intervalJam) * 3_600_000;
  if (!lastAt) return true; // belum pernah kirim → langsung kirim di jadwal pertama
  return sekarang - lastAt >= jeda;
}

/** Satu masukan (nomor apa pun bentuknya) → satu orang yang bisa dibandingkan. */
function orangDariMasukan(masukan) {
  const t = String(masukan ?? '').trim();
  if (!t) return null;
  // Sudah berbentuk JID (dari daftar otomatis atau ditempel apa adanya).
  if (t.includes('@')) {
    const [user, domain] = t.split('@');
    const angka = user.split(':')[0].replace(/[^\d]/g, '');
    if (!angka) return null;
    if (domain === 's.whatsapp.net' || domain === 'c.us') {
      // JID yang belum ber-kode-negara (mis. "813…@s.whatsapp.net" yang
      // ditempel manual) dinormalkan dulu, biar nggak muncul dua baris buat
      // satu nomor yang sama.
      const n = normalisasiNomor(angka) || angka;
      return { kunci: n, label: `+${n}` };
    }
    // LID ditampilkan UTUH polos tanpa label tambahan (kall 2026-10-04).
    return { kunci: `lid:${angka}`, label: `ID ${angka}` };
  }
  const n = normalisasiNomor(t);
  if (n) return { kunci: n, label: `+${n}` };
  // Bukan nomor dan bukan JID: jangan ditampilkan sebagai baris hantu.
  return null;
}

/**
 * Susun daftar hitam yang siap ditampilkan: normalisasi, buang duplikat
 * (otomatis vs manual), urutkan nomor HP dulu, ID LID di belakang.
 * Kalau nama WA-nya kebaca, ditulis di depan nomornya: "Nama (+62812…)".
 *
 * @param {{ hitam?: object[], manual?: (string|number)[] }} opsi
 *   `hitam` = hasil `kelompokHitam()` (punya { label, ids, nama, sejak }).
 * @returns {{ baris: string[], jumlah: number, sejak: Map<string, number|null> }}
 */
export function susunDaftarHitam({ hitam = [], manual = [] } = {}) {
  const orang = new Map(); // kunci → { label, nama, sejak, manual }

  // 1. dari daftar otomatis (yang keluar dari grup)
  for (const o of hitam || []) {
    const kandidat = (o?.ids || []).map(orangDariMasukan).filter(Boolean);
    const utama = kandidat.find((k) => k.kunci.startsWith('62')) || kandidat[0];
    if (!utama) continue;
    if (!orang.has(utama.kunci)) {
      orang.set(utama.kunci, { label: utama.label, nama: o?.nama || null, sejak: o?.sejak || null, manual: false });
    } else if (o?.nama && !orang.get(utama.kunci).nama) {
      orang.get(utama.kunci).nama = o.nama;
    }
  }

  // 2. dari yang diketik admin di app (nomor bisa berantakan: spasi, strip, +62)
  for (const m of manual || []) {
    const o = orangDariMasukan(m);
    if (!o) continue;
    const ada = orang.get(o.kunci);
    if (ada) {
      ada.manual = true; // ditandai admin, tetap satu baris
      ada.sejak = ada.sejak || null;
    } else {
      orang.set(o.kunci, { label: o.label, sejak: null, manual: true });
    }
  }

  const urut = [...orang.entries()].sort((a, b) => {
    const lidA = a[0].startsWith('lid:');
    const lidB = b[0].startsWith('lid:');
    if (lidA !== lidB) return lidA ? 1 : -1; // nomor HP dulu, ID LID belakang
    return a[0].localeCompare(b[0], 'en', { numeric: true });
  });

  const baris = [];
  const sejak = new Map();
  for (const [kunci, info] of urut) {
    const tanda = [info.sejak ? `sejak ${tanggalPendek(info.sejak)}` : null, info.manual ? 'didaftarkan admin' : null]
      .filter(Boolean).join(', ');
    const tampil = info.nama ? `${info.nama} (${info.label})` : info.label;
    baris.push(`${tampil}${tanda ? ` — ${tanda}` : ''}`);
    sejak.set(kunci, info.sejak);
  }
  return { baris, jumlah: baris.length, sejak };
}

/**
 * Susun isi pesan berkala.
 *
 * @param {{ namaGrup?: string, hitam?: object[], manual?: string[], teksKustom?: string, sekarang?: number }} opsi
 *   `hitam` = hasil `kelompokHitam()` (punya { label, sejak }), `manual` = nomor yang
 *   didaftarkan user sendiri (bentuk bebas: "0812-3456-7890", "+62 813 …", JID).
 * @returns {string}
 */
export function teksBerkala({ namaGrup = '', hitam = [], manual = [], teksKustom = '', sekarang = Date.now() } = {}) {
  const kustom = String(teksKustom || '').trim();
  if (kustom) return kustom;

  const grup = namaGrup || 'grup ini';
  const { baris, jumlah } = susunDaftarHitam({ hitam, manual });

  if (!jumlah) {
    return pesanRapi(
      `Daftar hitam ${grup} 🚫`,
      '',
      'Masih kosong.',
      '',
      'Artinya semua yang minta join boleh masuk, dan yang keluar sendiri bakal',
      'otomatis masuk daftar ini.'
    );
  }

  const tampil = baris.slice(0, MAKS_BARIS);
  const isi = [
    `*${jumlah} orang* yang nggak boleh masuk lagi:`,
    '',
    ...tampil.map((b, i) => `${i + 1}. ${b}`),
  ];
  if (baris.length > tampil.length) isi.push(`…dan ${baris.length - tampil.length} orang lainnya.`);
  isi.push(
    '',
    `_Diperbarui ${formatWaktu(sekarang)}._`,
    '_Admin grup bisa minta buka blokir lewat app._'
  );
  return pesanRapi(`Daftar hitam ${grup} 🚫`, ...isi);
}
