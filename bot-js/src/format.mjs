// Format pesan WhatsApp (markdown WA: *bold*, _italic_, ~coret~, `mono`, ```blok```).
import { BRAND, NAMA_BOT, NAMA_PAKET, TANDA_TANGAN } from './config/brand.mjs';

const MAX_BODY = 1800;

// Kepala pesan: SukiBot SEKARANG selalu di atas (permintaan kall 2026-10-04).
// Revisi ronda 3 (kall: "pesan kurang rapi"): garis strip panjang dibuang —
// di layar sempit strip itu kepotong/melahap dua baris dan malah kelihatan
// berantakan. Sekarang satu baris bold rapi: "SUKIBOT · JUDUL", lalu baris
// kosong, baru isi. Ringkas, konsisten, nggak ada yang wrap aneh.
/**
 * Susun pesan baku: kepala SukiBot+judul di atas → baris kosong → isi…
 * Nama bot dibaca PER PANGGILAN (bukan const module-level) karena bisa diganti
 * dari app pas engine jalan — lihat aturNamaBot() di config/brand.mjs.
 * @param {string} judul baris judul (digabung ke kepala, tanpa bold tambahan)
 * @param {string[]} isi baris-baris isi
 */
export function pesanRapi(judul, ...isi) {
  const tajuk = String(judul || '').trim();
  const kepala = tajuk ? `*🦴 ${NAMA_BOT.toUpperCase()} · ${tajuk}*` : `*🦴 ${NAMA_BOT.toUpperCase()}*`;
  return [kepala, '', ...isi].flat().join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
}

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

/** Kalimat pembuka dipilih dari tag (bukan acak) supaya retry ngirim teks yang sama persis. */
const PEMBUKA = [
  'Baru aja mendarat dari GitHub, masih anget.',
  'Buat kamu yang udah nungguin: update-nya udah siap.',
  'Versi baru siap dicoba. Ini yang berubah:',
  'Ada yang baru di dapur kode. Cek rangkumannya:',
];

function pilihPembuka(tag) {
  let h = 0;
  for (const ch of String(tag || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PEMBUKA[h % PEMBUKA.length];
}

/** Ukuran file gaya Indonesia: koma buat desimal, "MB" buat yang biasa dipakai user awam. */
export function formatUkuran(bytes) {
  const n = Number(bytes) || 0;
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

// Link unduh yang ditulis per file dibatasi biar pesan nggak kepanjangan;
// sisanya nunjuk ke halaman rilis (permintaan kall: "link download masing-masing").
const MAKS_LAMPIRAN = 5;

/**
 * Seksi "Download": satu file = nama + ukuran di satu baris, lalu URL unduh
 * langsung di baris berikutnya (WA otomatis bikin link-nya bisa diketuk).
 * File tanpa URL unduh tetap disebut namanya, diarahkan ke halaman rilis.
 */
function barisLampiran(assets) {
  const daftar = Array.isArray(assets) ? assets.filter((a) => a && a.name) : [];
  if (!daftar.length) return [];
  const tampil = daftar.slice(0, MAKS_LAMPIRAN).map((a) =>
    a.url ? `• *${a.name}* (${formatUkuran(a.size)})\n  ${a.url}` : `• *${a.name}* (${formatUkuran(a.size)}) _— di halaman rilis_`
  );
  const baris = ['📥 *Download:*', ...tampil];
  const sisa = daftar.length - tampil.length;
  if (sisa > 0) baris.push(`_(+${sisa} file lain di link rilis)_`);
  baris.push('');
  return baris;
}

export function formatReleasePost(rel, repoStr, { ajakBalas = false } = {}) {
  const tanggal = formatTanggal(rel.publishedAt || new Date());
  const namaRepo = String(repoStr || '').split('/').pop() || repoStr;

  const body = mdKeWa(rel.body);
  const bodyFinal =
    body.length > MAX_BODY ? potongAman(body, MAX_BODY) + '\n\n_(notes-nya panjang, lanjut di link changelog)_' : body;

  const isi = [];
  const sub = [];
  if (rel.name && rel.name.trim() !== rel.tag) sub.push(`📌 *${rel.name.trim()}*`);
  if (rel.isPrerelease) sub.push('🧪 _Versi prerelease (uji coba), wajar kalau masih ada bug._');
  if (sub.length) isi.push(...sub, '');
  isi.push(
    `✨ ${pilihPembuka(rel.tag)}`,
    '',
    '*📜 Changelog (apa yang baru):*',
    bodyFinal || '_(nggak ada catatan di rilis ini, langsung cek link changelog)_',
    '',
    ...barisLampiran(rel.assets),
    '🔗 *Link changelog & rilis lengkap:*',
    `${rel.url}`,
    '',
    `📦 ${repoStr} · 👤 @${rel.author}`,
    `🕐 ${tanggal}`,
    ...(ajakBalas ? ['', AJAKAN_BALAS] : []),
    '',
    `_🦴 Dikirim otomatis oleh ${NAMA_BOT} — ${NAMA_PAKET} (${BRAND}). Botnya tidur, bangun cuma pas ada rilis baru._`
  );

  return pesanRapi(`${namaRepo} ${rel.tag} udah rilis! 🚀`, ...isi);
}

export function formatTestMessage(repoStr, { ajakBalas = false } = {}) {
  return pesanRapi(
    'Setup sukses! ✅',
    '',
    `Bot ini sekarang siap ngabarin update release dari repo: \`${repoStr}\``,
    '',
    '• Setiap ada *release baru* di GitHub → bot bangun & posting info-nya ke channel ini.',
    '• Kalau nggak ada update → bot tidur. Nggak nyala 24 jam.',
    ...(ajakBalas ? ['', AJAKAN_BALAS] : []),
    '',
    `🦴 _${TANDA_TANGAN}_ ` + formatTanggal()
  );
}

export function formatTesGrup(namaGrup) {
  return pesanRapi(
    'Bot nyambung ke grup ini! ✅',
    '',
    `Penjaga grup${namaGrup ? ` "${namaGrup}"` : ''} aktif: permintaan join di-approve otomatis,`,
    'kecuali yang dulu udah keluar / dikeluarin.',
    '',
    `🦴 _${TANDA_TANGAN}_ ` + formatTanggal()
  );
}

/**
 * Pesan ke chat diri sendiri setelah percobaan TERAKHIR kirim rilis gagal.
 * Dikirim sekali (percobaan == maks), bukan tiap gagal.
 */
export function formatLaporGagal({ tag, repo, percobaan, maks, error, cli = false }) {
  const caraUlang = cli ? 'jalankan `npm run once -- --ulang`' : 'tekan *Cek sekarang* di app';
  return pesanRapi(
    'Gagal kirim rilis ⚠️',
    '',
    `Rilis *${tag}* (${repo}) gagal dikirim ke channel ${percobaan}x berturut-turut (batas ${maks}x).`,
    `Error terakhir: ${potongAman(String(error || 'tidak diketahui'), 300)}`,
    '',
    `Bot berhenti mencoba sampai lo ${caraUlang}.`,
    '',
    `🦴 _${TANDA_TANGAN}_ ` + formatTanggal()
  );
}
