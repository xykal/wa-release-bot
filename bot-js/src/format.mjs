// Format pesan WhatsApp (markdown WA: *bold*, _italic_, ~coret~, `mono`, ```blok```).
import { BRAND, NAMA_PAKET, TANDA_TANGAN } from './config/brand.mjs';

const MAX_BODY = 1800;

// Penutup buat format "pertanyaan" di channel: follower bisa bales pesan ini
// (balasannya cuma keliatan sama admin channel).
export const AJAKAN_BALAS = '💬 _Ada pertanyaan / nemu bug di versi ini? Bales aja pesan ini — cuma admin yang bisa baca._';

/**
 * Markdown GitHub -> format WA. Release notes GitHub ditulis buat browser;
 * kalau ditempel mentah, `## Judul`, `**tebal**`, dan `[teks](url)` tampil
 * apa adanya di WhatsApp.
 */
export function mdKeWa(md) {
  let s = String(md || '').replace(/\r\n?/g, '\n');
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/<\/?(details|summary|p|br|div|b|strong|em|i|ul|ol|li|h[1-6])\b[^>]*>/gi, '');
  const blok = [];
  s = s.replace(/```[\s\S]*?```/g, (m) => { blok.push(m); return `\uE000${blok.length - 1}\uE000`; });
  s = s.replace(/^#{1,6}\s+(.+?)\s*#*\s*$/gm, '*$1*');
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, (m, alt, url) => (alt ? `${alt}: ${url}` : url));
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, (m, teks, url) => (teks.trim() === url ? url : `${teks} (${url})`));
  s = s.replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '*$2*');
  s = s.replace(/~~(?=\S)([\s\S]*?\S)~~/g, '~$1~');
  s = s.replace(/^(\s*)[-*+]\s+/gm, '$1• ');
  s = s.replace(/^(\s*)(\d+)\.\s+/gm, '$1$2. ');
  s = s.replace(/\uE000(\d+)\uE000/g, (m, i) => blok[Number(i)]);
  s = s.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

/**
 * Potong teks tanpa membelah surrogate pair (emoji) dan, kalau bisa, di batas
 * baris supaya markup WA (*...*) tidak terbuka tanpa penutup.
 */
export function potongAman(teks, maks) {
  const s = String(teks || '');
  if (s.length <= maks) return s;
  let p = s.slice(0, maks);
  if (/[\uD800-\uDBFF]$/.test(p)) p = p.slice(0, -1);
  const baris = p.lastIndexOf('\n');
  if (baris > maks * 0.5) p = p.slice(0, baris);
  return p.trimEnd();
}

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

/**
 * Tanggal Indonesia tanpa Intl/ICU: Node di dalam APK (nodejs-mobile) belum
 * tentu membawa data locale, dan format locale bawaan diam-diam jatuh ke
 * format Inggris. Zona ikut jam lokal proses (HP/Termux).
 * Contoh: "Selasa, 29 September 2026 10.05 WIB"
 */
export function formatTanggal(kapan = new Date(), { jam = true } = {}) {
  const t = kapan instanceof Date ? kapan : new Date(kapan);
  if (Number.isNaN(t.getTime())) return '';
  const dua = (n) => String(n).padStart(2, '0');
  const zona = -t.getTimezoneOffset();
  const abs = Math.abs(zona);
  const utc = `UTC${zona >= 0 ? '+' : '-'}${dua(Math.floor(abs / 60))}${abs % 60 ? ':' + dua(abs % 60) : ''}`;
  const namaZona = { 420: 'WIB', 480: 'WITA', 540: 'WIT' }[zona] || utc;
  const tanggal = `${HARI[t.getDay()]}, ${t.getDate()} ${BULAN[t.getMonth()]} ${t.getFullYear()}`;
  return jam ? `${tanggal} ${dua(t.getHours())}.${dua(t.getMinutes())} ${namaZona}` : tanggal;
}

export function formatReleasePost(rel, repoStr, { ajakBalas = false } = {}) {
  const tanggal = formatTanggal(rel.publishedAt || new Date());

  const body = mdKeWa(rel.body);
  const bodyFinal =
    body.length > MAX_BODY ? potongAman(body, MAX_BODY) + '\n\n_(notes-nya panjang, lanjut di link)_' : body;

  const lines = [
    '🚀 *RELEASE BARU DETEKSI!*',
    '',
    `📦 Repo: \`${repoStr}\``,
    `🏷️ Versi: *${rel.tag}*`,
  ];
  if (rel.name && rel.name.trim() !== rel.tag) lines.push(`📌 Title: ${rel.name}`);
  if (rel.isPrerelease) lines.push('🧪 _(prerelease)_');
  lines.push(
    `👤 Oleh: @${rel.author}`,
    `🕐 ${tanggal}`,
    '',
    '📝 *Changelog:*',
    bodyFinal || '_(tidak ada deskripsi di release ini)_',
    '',
    `🔗 ${rel.url}`,
    '',
    ...(ajakBalas ? [AJAKAN_BALAS, ''] : []),
    `_⚙️ Auto-posting oleh ${NAMA_PAKET} (${BRAND}) — bot cuma bangun pas ada rilis baru_ 🦴`
  );

  return lines.join('\n');
}

export function formatTestMessage(repoStr, { ajakBalas = false } = {}) {
  return [
    '✅ *WA RELEASE BOT — SETUP SUKSES!*',
    '',
    `Bot ini sekarang siap ngabarin update release dari repo: \`${repoStr}\``,
    '',
    'Setiap ada *release baru* di GitHub, bot bakal bangun & posting info-nya ke channel ini.',
    'Kalau nggak ada update? Bot tidur. Nggak nyala 24 jam.',
    '',
    ...(ajakBalas ? [AJAKAN_BALAS, ''] : []),
    `🦴 _${TANDA_TANGAN}_ ` + formatTanggal()
  ].join('\n');
}

export function formatTesGrup(namaGrup) {
  return [
    '✅ *Bot nyambung ke grup ini!*',
    '',
    `Penjaga grup${namaGrup ? ` "${namaGrup}"` : ''} aktif: permintaan join di-approve otomatis,`,
    'kecuali yang dulu udah keluar / dikeluarin.',
    '',
    `🦴 _${TANDA_TANGAN}_ ` + formatTanggal(),
  ].join('\n');
}

/**
 * Pesan ke chat diri sendiri setelah percobaan TERAKHIR kirim rilis gagal.
 * Dikirim sekali (percobaan == maks), bukan tiap gagal.
 */
export function formatLaporGagal({ tag, repo, percobaan, maks, error, cli = false }) {
  const caraUlang = cli ? 'jalankan `npm run once -- --ulang`' : 'tekan *Cek sekarang* di app';
  return [
    '⚠️ *wa-release-bot: gagal kirim rilis*',
    '',
    `Rilis *${tag}* (${repo}) gagal dikirim ke channel ${percobaan}x berturut-turut.`,
    `Error terakhir: ${potongAman(String(error || 'tidak diketahui'), 300)}`,
    '',
    `Bot berhenti mencoba sampai lo ${caraUlang}.`,
    '',
    `🦴 _${TANDA_TANGAN}_ ` + formatTanggal(),
  ].join('\n');
}
