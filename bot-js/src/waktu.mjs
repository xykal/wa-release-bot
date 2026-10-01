// Format waktu buat pesan WhatsApp — sengaja NGGAK pakai toLocaleString/Intl.
//
// Kenapa: mesin Node di dalam APK (nodejs-mobile) dibangun dengan ICU kecil,
// jadi `toLocaleString('id-ID')` diam-diam jatuh ke format Amerika
// ("10/1/2026, 7:00:00 PM") — pernah bikin pesan daftar hitam kelihatan rusak.
// Di sini tanggal ditulis tangan: hasilnya sama di HP, di CI, dan di CLI.
//
// Berkas ini murni (nggak import apa-apa) → diuji di test/waktu.test.mjs.

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

/** Label zona dari selisih menit (Date#getTimezoneOffset dibalik tandanya). */
export function zonaLabel(menitDariUtc) {
  if (menitDariUtc === 420) return 'WIB';
  if (menitDariUtc === 480) return 'WITA';
  if (menitDariUtc === 540) return 'WIT';
  const jam = menitDariUtc / 60;
  const tanda = jam >= 0 ? '+' : '-';
  const bulat = Math.abs(jam);
  return `UTC${tanda}${bulat % 1 === 0 ? bulat : bulat.toFixed(1)}`;
}

/**
 * "30 Sep 2026" / "30 Sep 2026, 19.06 WIB" — pakai waktu lokal mesin.
 *
 * @param {number|Date} ms
 * @param {{ jam?: boolean, zona?: boolean }} opsi
 */
export function formatWaktu(ms, { jam = true, zona = true } = {}) {
  if (!ms) return '';
  const d = ms instanceof Date ? ms : new Date(Number(ms));
  if (Number.isNaN(d.getTime())) return '';
  const dua = (n) => String(n).padStart(2, '0');
  const tanggal = `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
  if (!jam) return tanggal;
  const label = zona ? ` ${zonaLabel(-d.getTimezoneOffset())}` : '';
  return `${tanggal}, ${dua(d.getHours())}.${dua(d.getMinutes())}${label}`;
}

/** "30/9" — dipakai di dalam daftar biar barisnya pendek. */
export function tanggalPendek(ms) {
  if (!ms) return '';
  const d = ms instanceof Date ? ms : new Date(Number(ms));
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()}/${d.getMonth() + 1}`;
}
