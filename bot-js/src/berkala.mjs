// Pesan berkala ke grup: bagian murni (tanpa jaringan), jadi bisa diuji unit.
//
// Yang dikirim bisa dua macam (permintaan kall 2026-10-01):
//   1. daftar hitam grup — "siapa aja yang nggak boleh masuk lagi";
//   2. teks sendiri, kalau user mau pesan lain (aturan grup, jadwal, dsb).
// Kapan kirimnya juga di sini, bukan di bot.mjs: biar gampang dites tanpa WA.

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

/** Tanggal pendek dd/mm tanpa ICU (mesin di HP nggak punya data lokal lengkap). */
function tanggalPendek(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

/**
 * Susun isi pesan berkala.
 *
 * @param {{ namaGrup?: string, hitam?: object[], manual?: string[], teksKustom?: string, sekarang?: number }} opsi
 *   `hitam` = hasil `kelompokHitam()` (punya { label, sejak }), `manual` = nomor yang
 *   didaftarkan user sendiri.
 * @returns {string}
 */
export function teksBerkala({ namaGrup = '', hitam = [], manual = [], teksKustom = '', sekarang = Date.now() } = {}) {
  const kustom = String(teksKustom || '').trim();
  if (kustom) return kustom;

  const grup = namaGrup || 'grup ini';
  const baris = [];
  hitam.forEach((o, i) => {
    const sejak = tanggalPendek(o?.sejak);
    baris.push(`${i + 1}. ${o?.label || '?'}${sejak ? ` (sejak ${sejak})` : ''}`);
  });
  manual.forEach((n, i) => {
    baris.push(`${hitam.length + i + 1}. ${n} (didaftarkan admin)`);
  });

  if (!baris.length) {
    return [
      `Daftar hitam ${grup}: masih kosong.`,
      '',
      'Artinya semua yang minta join boleh masuk, dan yang keluar sendiri bakal',
      'otomatis masuk daftar ini.',
    ].join('\n');
  }
  const jumlah = baris.length;
  return [
    `Daftar hitam ${grup} (${jumlah} orang):`,
    ...baris,
    '',
    `Diperbarui ${new Date(sekarang).toLocaleString('id-ID')}. Orang di daftar ini`,
    'nggak bisa masuk lagi lewat link grup. Admin grup bisa minta buka blokir.',
  ].join('\n');
}
