// Logika murni moderasi grup + perintah chat pribadi.
//
// Semua di sini sengaja TANPA jaringan dan TANPA Baileys, jadi bisa diuji unit
// (test/pesan.test.mjs) — bagian yang bicara ke WhatsApp ada di
// mesin/jaga-pesan.mjs. Aturan yang dipilih kall (2026-09-30):
//   - perintah pribadi (stiker, story, menu) HANYA di chat sendiri,
//     bukan di grup;
//   - moderasi grup: kiriman berisi link/phishing/promo dihapus, pelakunya
//     dikasih peringatan; strike kedua = dikeluarkan;
//   - admin dan pemilik grup TIDAK pernah disentuh.
//     Aturannya bisa diubah lewat config (kata kunci tambahan).

import { NAMA_BOT } from './config/brand.mjs';
import { pesanRapi } from './format.mjs';

/** Domain yang dianggap wajar dikirim di grup (undangan grup, link WA sendiri). */
export const DOMAIN_DIIZINKAN = [
  'chat.whatsapp.com',
  'wa.me',
  'whatsapp.com',
];

/** Pola judi/pinjol/promosi yang hampir selalu spam di grup. */
export const KATA_TERLARANG = [
  'slot', 'gacor', 'judi', 'togel', 'casino', 'kasino', 'betting', 'taruhan',
  'pinjol', 'pinjam uang', 'dana cepat', 'kredit tanpa', 'paylater cair',
  'promo', 'diskon', 'obat kuat', 'viagra', 'bokep', 'open bo',
  'crypto gratis', 'airdrop', 'investasi profit', 'profit pasti',
  'join sekarang', 'daftar sekarang', 'minat dm', 'cek dm', 'hub wa',
  // Jualan / promosi dagang (kall 2026-10-04: "kalau ada unsur jualan juga
  // bisa dihapus"). Admin tetap kebal — mereka boleh promoin apa aja.
  'open po', 'pre order', 'pre-order', 'preorder', 'ready stock', 'jual rugi',
  'harga spesial', 'murah banget', 'bisa cod', 'bayar ditempat', 'bayar di tempat',
  'dm for price', 'dm harga', 'minat? dm', 'order sekarang', 'order via wa',
  'chat aja kak', 'wa aja kak', 'tokped', 'link shopee', 'link tokopedia',
];

/** Pola link phishing: domain mirip + parameter aneh yang umum di scam. */
const POLA_LINK = /(?:https?:\/\/|www\.)[^\s<>"']+/gi;
const POLA_TELEGRAM = /(?:^|\s)t\.me\/[^\s]+/i;

/** Ambil semua link dari satu teks (buang tanda baca di ujung). */
export function daftarLink(teks) {
  const hasil = [];
  const bersih = String(teks || '');
  for (const m of bersih.matchAll(POLA_LINK)) {
    const link = m[0].replace(/[.,)\]]+$/, '');
    hasil.push(link);
  }
  return hasil;
}

export function hostDari(link) {
  try {
    return new URL(link.includes('://') ? link : `https://${link}`).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Baca kiriman satu pesan dan putuskan harus diapain.
 *
 * @param {{
 *   teks?: string,
 *   dariBot?: boolean,
 *   dariAdmin?: boolean,
 *   dariSaya?: boolean,
 *   adaMedia?: boolean,
 *   kataTambahan?: string[],
 *   linkDilarang?: string[],
 *   izinkanLink?: boolean
 * }} pesan
 * @returns {{ aksi: 'abaikan'|'hapus', kategori: string|null, alasan: string }}
 */
export function nilaiPesan(pesan = {}) {
  const {
    teks = '',
    dariBot = false,
    dariAdmin = false,
    dariSaya = false,
    adaMedia = false,
    kataTambahan = [],
    linkDilarang = [],
    izinkanLink = false,
  } = pesan;

  // Admin (dan bot sendiri) nggak pernah diperiksa: merekalah yang jaga grup.
  if (dariBot || dariAdmin || dariSaya) return { aksi: 'abaikan', kategori: null, alasan: 'pengirim dikecualikan' };

  const isi = String(teks || '').toLowerCase();
  if (!isi && !adaMedia) return { aksi: 'abaikan', kategori: null, alasan: 'nggak ada isi' };

  // 1. link Telegram (kanal jualan/pinjol langganan spam).
  if (POLA_TELEGRAM.test(isi)) {
    return { aksi: 'hapus', kategori: 'phishing', alasan: 'link Telegram' };
  }

  // 2. domain yang dilarang eksplisit (dari config) atau di luar daftar izin.
  for (const link of daftarLink(isi)) {
    const host = hostDari(link);
    if (!host) continue;
    if (linkDilarang.some((d) => host === d.toLowerCase() || host.endsWith('.' + d.toLowerCase()))) {
      return { aksi: 'hapus', kategori: 'phishing', alasan: `domain terlarang: ${host}` };
    }
    if (!izinkanLink && !DOMAIN_DIIZINKAN.some((d) => host === d || host.endsWith('.' + d))) {
      return { aksi: 'hapus', kategori: 'promosi', alasan: `link luar: ${host}` };
    }
  }

  // 3. kata kunci judi/promo/pinjol.
  const semuaKata = [...KATA_TERLARANG, ...kataTambahan.map((k) => String(k).toLowerCase().trim())]
    .filter(Boolean);
  for (const kata of semuaKata) {
    if (isi.includes(kata)) {
      const judi = ['slot', 'gacor', 'judi', 'togel', 'casino', 'kasino', 'betting', 'taruhan',
        'pinjol', 'pinjam uang', 'dana cepat', 'kredit tanpa', 'paylater cair']
        .some((k) => kata.includes(k));
      return { aksi: 'hapus', kategori: judi ? 'judi' : 'promosi', alasan: `kata: ${kata}` };
    }
  }

  return { aksi: 'abaikan', kategori: null, alasan: 'bersih' };
}

/**
 * Perintah pribadi dibaca dari chat sendiri. Sama seperti nilaiPesan: murni.
 *
 * @param {string} teks
 * @returns {{ nama: string, arg: string, dikenal: boolean } | null}
 */
export function bacaPerintah(teks) {
  const t = String(teks || '').trim();
  // Awalan titik biar tidak bentrok dengan obrolan biasa.
  const cocok = t.match(/^[.!/](\S+)\s*([\s\S]*)$/);
  if (!cocok) return null;
  const nama = cocok[1].toLowerCase();
  return { nama, arg: cocok[2].trim(), dikenal: nama in PERINTAH };
}

/** Daftar perintah yang dikenal + keterangannya (dipakai `.menu` dan dokumentasi). */
export const PERINTAH = {
  menu: 'Daftar perintah ini',
  ping: 'Cek bot hidup (dijawab cepat)',
  status: 'Ringkasan status: engine, rilis terakhir, penjaga grup, lagu',
  brat: 'Buat stiker teks gaya Brat: .brat <teks>',
  stiker: 'Balas/kirim foto dengan keterangan .stiker → jadi stiker WA',
  story: 'Kirim foto/video dengan keterangan .story → Status memakai byte media asli; penonton = daftar Story',
  storygrup: 'Native mention grup di Status — belum aktif pada runtime yang dipakai saat ini',
  welcome: 'Sambutan anggota baru di grup dipantau: .welcome on/off',
  berkala: 'Lihat pesan berkala; tambah "kirim" buat kirim sekarang',
  rekam: 'Rekam postingan channel: on/off/kirim/kosong',
  grup: 'Info grup dipantau: anggota, moderasi, dan status penjagaan',
  bersih: 'Kosongkan hitungan moderasi hari ini',
  bantu: 'Alias .menu',
};

const KELOMPOK_MENU = [
  ['MEDIA & STATUS', ['brat', 'stiker', 'story', 'storygrup']],
  ['BOT & INFO', ['menu', 'ping', 'status', 'bantu']],
  ['GRUP & CHANNEL', ['welcome', 'grup', 'berkala', 'rekam', 'bersih']],
];

/** Teks menu ringkas dan terkelompok; perintah tetap khusus chat pribadi. */
export function menuTeks(namaBot = 'WA Release Bot') {
  const baris = KELOMPOK_MENU.flatMap(([judul, nama]) => [
    `\n*${judul}*`,
    ...nama.map((k) => `• .${k} — ${PERINTAH[k]}`),
  ]);
  return pesanRapi(
    `${namaBot} — Menu 📖`,
    'Perintah pribadi · chat ini saja',
    ...baris,
    '',
    'Kirim media dengan caption `.stiker` atau `.story`; `.storygrup` menunggu dukungan native mention.',
    'Buat stiker teks: `.brat <teks>` · Sambutan grup: `.welcome on/off`.',
    '',
    `— ${NAMA_BOT}`
  );
}

/** Label kategori yang manusiawi buat ditampilkan di peringatan. */
export function labelKategori(kategori) {
  return kategori === 'judi' ? 'judi'
    : kategori === 'phishing' ? 'link mencurigakan'
    : 'promosi / jualan';
}

/**
 * Rencana moderasi: dari satu kiriman yang kena, putuskan hukuman berdasarkan
 * hitungan strike yang sudah ada.
 *
 * Pesan dirapikan 2026-10-04 (kall: "gaya pesan rapi, SukiBot di atas"):
 * kepala SukiBot → judul peringatan → siapa (mention) → alasan → konsekuensi.
 * `siapa` = teks mention('@628xx'); aksi-pesan mengirimnya bersama field
 * `mentions` supaya orangnya ke-tag beneran.
 *
 * @param {{ strikeSebelumnya?: number, batasStrike?: number, kategori?: string, siapa?: string, alasan?: string }} opsi
 * @returns {{ hukuman: 'peringatan'|'kick', strike: number, teks: string }}
 */
export function hukumanModerasi({ strikeSebelumnya = 0, batasStrike = 2, kategori = 'promosi', siapa = '', alasan = '' } = {}) {
  const strike = strikeSebelumnya + 1;
  const label = labelKategori(kategori);
  const target = siapa ? siapa : 'Anggota ini';
  const barisAlasan = alasan ? [`• Alasan: kiriman berisi ${label} (${alasan}).`] : [`• Alasan: kiriman berisi ${label}.`];
  if (strike >= batasStrike) {
    return {
      hukuman: 'kick',
      strike,
      teks: pesanRapi(
        'Dikeluarkan dari grup ⛔',
        '',
        `${target} dikeluarkan dari grup ini.`,
        ...barisAlasan,
        `• Riwayat: ${strike}/${batasStrike} peringatan — batas terlampaui.`,
        '',
        `_Dijaga otomatis oleh ${NAMA_BOT}. Admin tetap kebal dari aturan ini._`
      ),
    };
  }
  return {
    hukuman: 'peringatan',
    strike,
    teks: pesanRapi(
      `Peringatan ${strike}/${batasStrike} ⚠️`,
      '',
      `Halo ${target}, pesan kamu sudah *dihapus*.`,
      ...barisAlasan,
      '',
      `Kirim hal yang sama lagi (${strike + 1}/${batasStrike}) = *dikeluarkan dari grup*.`,
      '',
      `_Dijaga otomatis oleh ${NAMA_BOT}. Admin tetap kebal dari aturan ini._`
    ),
  };
}
