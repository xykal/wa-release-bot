// ============================================================================
//  Lagu mood — sesekali ngirim potongan lagu lama (slow rock / jiwang 80-90an)
//  ke channel, lengkap sama kata-kata.
//
//  Pembagian kerja (biar HP enteng):
//    GitHub Actions (terjadwal) : cari lagu di YouTube pakai yt-dlp, potong
//                                 ~60 dtk pakai ffmpeg, bikin kata-kata pakai
//                                 AI, simpan ke Cloudflare
//    Cloudflare Worker + KV     : nyimpen antrian + file audionya
//    HP (file ini)              : pas "lagi mood", ambil satu dari antrian,
//                                 kirim ke channel
//
//  "Mood" = jadwalnya acak: rata-rata N kali sehari, cuma di jam aktif,
//  jaraknya nggak pernah mepet. Jadi nggak kerasa kayak bot yang nembak tiap
//  jam pas.
// ============================================================================

export const SUMBER_BAWAAN = 'https://wa-release-bot-lagu.akuntiktok76y.workers.dev';

/** Jam lokal (0-23.99) dari timestamp + offset zona waktu HP (menit). */
export function jamLokal(ts, tzMenit = 0) {
  const d = new Date(ts + tzMenit * 60_000);
  return d.getUTCHours() + d.getUTCMinutes() / 60;
}

/**
 * Tentuin kapan kirim lagu berikutnya.
 * @param {number} kini timestamp ms
 * @param {{perHari?:number, jamMulai?:number, jamSelesai?:number, tzMenit?:number}} opsi
 * @param {() => number} acak Math.random (bisa diganti buat tes)
 */
export function jadwalBerikut(kini, { perHari = 2, jamMulai = 9, jamSelesai = 22, tzMenit = 0 } = {}, acak = Math.random) {
  const n = Math.min(Math.max(Number(perHari) || 2, 1), 8);
  let mulai = Math.min(Math.max(Number(jamMulai) || 0, 0), 23);
  let selesai = Math.min(Math.max(Number(jamSelesai) || 24, 1), 24);
  if (selesai <= mulai) { mulai = 9; selesai = 22; }
  const panjangJam = selesai - mulai;
  const rata = (panjangJam / n) * 3600_000;
  // jarak acak 60%–140% dari rata-rata, minimal 45 menit
  let t = kini + Math.max(45 * 60_000, rata * (0.6 + acak() * 0.8));
  // Kalau jatuh di luar jam aktif → geser ke jam aktif berikutnya + acak dikit
  for (let i = 0; i < 3; i++) {
    const j = jamLokal(t, tzMenit);
    if (j >= mulai && j < selesai) return Math.round(t);
    const majuJam = j < mulai ? mulai - j : 24 - j + mulai;
    t += majuJam * 3600_000 + acak() * Math.min(2, panjangJam / 2) * 3600_000;
  }
  return Math.round(t);
}

/** Ambil lagu tertua di antrian yang belum pernah dikirim. */
export function pilihLagu(antrian, terkirim = []) {
  const sudah = new Set(terkirim);
  const daftar = (Array.isArray(antrian) ? antrian : [])
    .filter((x) => x && x.id && !sudah.has(x.id))
    .sort((a, b) => (a.dibuat || 0) - (b.dibuat || 0));
  return daftar[0] || null;
}

/** Pesan teks yang nemenin audio-nya. */
export function formatKataLagu(lagu) {
  const kata = String(lagu.kata || '').trim();
  const judul = [lagu.judul, lagu.artis].filter(Boolean).join(' — ');
  return [kata, judul ? `🎧 *${judul}*` : ''].filter(Boolean).join('\n\n');
}

async function ambilDgnTimeout(url, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'wa-release-bot (android app)' }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  } finally {
    clearTimeout(t);
  }
}

export async function ambilAntrian(sumber = SUMBER_BAWAAN) {
  const res = await ambilDgnTimeout(String(sumber).replace(/\/+$/, '') + '/antrian', 20_000);
  const j = await res.json();
  return Array.isArray(j?.lagu) ? j.lagu : [];
}

export async function ambilKlip(sumber, id) {
  const res = await ambilDgnTimeout(`${String(sumber).replace(/\/+$/, '')}/klip/${encodeURIComponent(id)}`, 60_000);
  return Buffer.from(await res.arrayBuffer());
}

/** Lapor ke Worker "klip ini udah dikirim" → workflow bikinin yang baru. Boleh gagal. */
export async function laporTerpakai(sumber, id) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15_000);
  try {
    await fetch(`${String(sumber).replace(/\/+$/, '')}/terpakai/${encodeURIComponent(id)}`, {
      method: 'POST',
      headers: { 'User-Agent': 'wa-release-bot (android app)' },
      signal: ctrl.signal,
    });
  } catch { /* nggak penting — paling antriannya telat keisi */ } finally {
    clearTimeout(t);
  }
}
