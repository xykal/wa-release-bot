// Helper pesan yang nggak butuh Baileys (biar bisa dites langsung).

/** Arti kode error di ack WA (yang sering muncul). */
const ARTI_ERROR = {
  400: 'format pesan ditolak server',
  401: 'nggak punya izin kirim ke sini',
  403: 'dilarang — mungkin bukan admin / fiturnya belum aktif di channel ini',
  404: 'tujuan nggak ketemu',
  406: 'jenis pesan ini nggak diterima di sini',
  421: 'daftar anggota grup berubah, perlu kirim ulang',
  463: 'akun kena batas kirim (rate limit)',
  479: 'server nolak pesan (jenis / format nggak didukung)',
  500: 'server WA lagi error',
};

export function artiError(kode) {
  const k = Number(kode);
  return ARTI_ERROR[k] ? `${k} — ${ARTI_ERROR[k]}` : String(kode);
}

/**
 * Baca ack dari server.
 *  null            → nggak ada ack (timeout) — status nggak jelas
 *  { ok:false }    → ditolak server (ada atribut error)
 *  { ok:true }     → diterima server; serverId = nomor pesan di channel
 */
export function bacaAck(node) {
  if (!node) return null;
  const a = node.attrs || {};
  if (a.error) return { ok: false, error: a.error, arti: artiError(a.error) };
  return { ok: true, serverId: a.server_id || null, t: a.t ? Number(a.t) : null };
}

/**
 * Ambil teks dari objek pesan apa aja (hasil decode proto → JSON). Dicari
 * rekursif: `conversation`, `text`, `caption` — jadi mau pesannya dibungkus
 * ephemeral / viewOnce / questionResponse, teksnya tetap ketemu.
 */
export function cariTeks(obj, dalam = 0) {
  if (!obj || typeof obj !== 'object' || dalam > 8) return '';
  for (const k of ['conversation', 'text', 'caption']) {
    if (typeof obj[k] === 'string' && obj[k].trim()) return obj[k];
  }
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'contextInfo' || k === 'quotedMessage') continue; // jangan ambil teks kutipan
    if (v && typeof v === 'object' && !(v instanceof Uint8Array)) {
      const t = cariTeks(v, dalam + 1);
      if (t) return t;
    }
  }
  return '';
}

/** Pisah perintah: "!info  grup  a" → { perintah: '!info', argumen: ['grup','a'], sisa: 'grup  a' } */
export function pisahPerintah(teks) {
  const t = String(teks || '').trim();
  if (!/^[!./]/.test(t)) return null;
  const m = t.match(/^([!./][\p{L}\p{N}_-]+)\s*([\s\S]*)$/u);
  if (!m) return null;
  const perintah = '!' + m[1].slice(1).toLowerCase();
  const sisa = m[2].trim();
  return { perintah, argumen: sisa ? sisa.split(/\s+/) : [], sisa };
}

/** "+6281234567890" → "+62812****7890" (buat daftar yang dikirim ke grup). */
export function samarkan(label) {
  const s = String(label || '');
  const m = s.match(/^(\+?\d{5})(\d+)(\d{4})$/);
  if (!m) return s;
  return m[1] + '*'.repeat(Math.min(4, m[2].length)) + m[3];
}

/**
 * Jeda cek grup sesuai mode.
 *   berkala  → selalu interval dasar
 *   adaptif  → interval × faktor (faktor naik 2× tiap putaran sepi, maks `maksMenit`)
 *   pintar   → cadangan aja (dibangunin notif WA); minimal 30 menit
 *   realtime → interval dasar (socket udah nyala, murah)
 */
export function jedaGrup({ mode, dasarMenit, faktor = 1, maksMenit = 60 }) {
  const dasar = Math.max(2, Number(dasarMenit) || 5);
  if (mode === 'adaptif') return Math.min(Math.max(dasar, maksMenit), dasar * Math.max(1, faktor)) * 60_000;
  if (mode === 'pintar') return Math.max(30, dasar) * 60_000;
  return dasar * 60_000;
}

/** Faktor adaptif berikutnya: ada kegiatan → balik 1, sepi → 2× (dibatasi). */
export function faktorBerikut({ faktor = 1, adaKegiatan, dasarMenit, maksMenit = 60 }) {
  if (adaKegiatan) return 1;
  const batas = Math.max(1, Math.floor(Math.max(dasarMenit, maksMenit) / Math.max(2, dasarMenit)));
  return Math.min(batas, Math.max(1, faktor) * 2);
}

export const MODE = ['berkala', 'adaptif', 'pintar', 'realtime'];
export const normalMode = (m) => (MODE.includes(m) ? m : 'berkala');
