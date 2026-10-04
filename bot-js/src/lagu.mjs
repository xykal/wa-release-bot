// ============================================================================
//  Lagu mood — sesekali ngirim potongan lagu lama (slow rock / jiwang 80-90an)
//  ke channel, lengkap sama kata-kata.
//
//  Pembagian kerja Cloudflare x HP:
//    Cloudflare Worker (lagu/worker/worker.js): pilih lagu dari daftar, cari
//        di SoundCloud, kasih link stream + kata-kata dari AI + titik potong
//    HP (file ini): download CUMA potongan ~60 dtk (HTTP Range, ±1 MB),
//        rapiin per frame MP3, kirim ke channel, terus file-nya DIHAPUS
//
//  "Mood" = jadwalnya acak: rata-rata N kali sehari, cuma di jam aktif,
//  jaraknya nggak pernah mepet. Jadi nggak kerasa kayak bot yang nembak tiap
//  jam pas.
// ============================================================================

// Satu-satunya tempat URL Worker ditulis. Sisi Android TIDAK menulis URL ini
// (CI menolak literal workers.dev di app/), jadi kalau subdomain berubah cukup
// ganti di sini. Subdomain workers.dev akun = "dikanjut" (cek: GET
// /accounts/<id>/workers/subdomain); URL lama *.akuntiktok76y.workers.dev
// tidak pernah ada (NXDOMAIN) -- fitur lagu mati sejak v1.6.0 karena ini.
export const SUMBER_BAWAAN = 'https://wa-release-bot-lagu.dikanjut.workers.dev';

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

/** Pesan teks yang nemenin audio-nya. */
/**
 * Caption yang nempel di voice note: kata-kata dulu (ini yang bikin orang
 * berhenti scroll), baru judul. Judul di-bold, artis biasa, plus keterangan
 * kalau lagunya lagi trend biar follower tahu kenapa lagu itu yang dipilih.
 */
export function formatKataLagu(lagu) {
  const kata = String(lagu.kata || '').trim();
  const judul = String(lagu.judul || '').trim();
  const artis = String(lagu.artis || '').trim();
  const baris = judul ? `🎧 *${judul}*${artis ? ` — ${artis}` : ''}` : artis ? `🎧 ${artis}` : '';
  // Worker ngasih `jenis: 'trend'|'lawas'`; `trend: true` buat kompatibilitas tes/format lama.
  const lagiTrend = lagu.trend === true || lagu.jenis === 'trend';
  const trend = lagiTrend && baris ? '_lagi rame di FYP TikTok minggu ini_' : '';
  return [kata, [baris, trend].filter(Boolean).join('\n')].filter(Boolean).join('\n\n');
}

/** "fetch failed" doang nggak ngasih tau apa-apa — ambil kode aslinya dari `cause`. */
export function jelaskanGalat(e) {
  const c = e?.cause;
  const kode = c?.code || c?.errno || c?.name;
  const detail = c?.message && c.message !== e.message ? c.message : '';
  if (e?.name === 'AbortError') return 'kelamaan (timeout)';
  return [e?.message || String(e), kode && !String(detail).includes(kode) ? kode : '', detail].filter(Boolean).join(' — ');
}

async function ambilDgnTimeout(url, ms, headers = {}) {
  // Jaringan HP suka putus-nyambung (ganti sinyal, IPv6 operator yang ngadat):
  // coba sampai 3x sebelum nyerah. Error HTTP (4xx/5xx) nggak diulang.
  let terakhir;
  for (let coba = 1; coba <= 3; coba++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'wa-release-bot (android app)', ...headers }, signal: ctrl.signal });
      if (!res.ok) {
        let detail = '';
        try { const j = await res.json(); detail = j.error ? ` — ${j.error}` : ''; } catch { /* bukan json */ }
        const err = new Error(`HTTP ${res.status}${detail}`);
        err.http = true;
        throw err;
      }
      return res;
    } catch (e) {
      if (e.http) throw e;
      terakhir = e;
      if (coba < 3) await new Promise((r) => setTimeout(r, 2000 * coba));
    } finally {
      clearTimeout(t);
    }
  }
  throw new Error(jelaskanGalat(terakhir), { cause: terakhir });
}

/** Minta lagu berikutnya ke Worker: { artis, judul, kata, url, mulai, detik, kbps, ... } */
export async function ambilBerikut(sumber = SUMBER_BAWAAN, { pemasang = '' } = {}) {
  // X-Pemasang: id acak per instalasi (bukan identitas HP), dipakai Worker
  // buat jatah harian per perangkat supaya satu pihak nggak bisa ngabisin
  // kuota semua orang.
  const headers = pemasang ? { 'X-Pemasang': String(pemasang).slice(0, 64) } : {};
  const res = await ambilDgnTimeout(String(sumber).replace(/\/+$/, '') + '/lagu/berikut', 45_000, headers);
  const j = await res.json();
  if (!j?.url) throw new Error(j?.error || 'Worker nggak ngasih link lagu');
  return j;
}

/**
 * Sisa jatah hari ini dari Worker: { hari, pemasang: "n/12", ip: "n/20", global: "n/180" }.
 * Cuma baca KV di Worker, tidak memakai kuota lagu maupun token burst.
 */
export async function ambilBatas(sumber = SUMBER_BAWAAN, { pemasang = '' } = {}) {
  const headers = pemasang ? { 'X-Pemasang': String(pemasang).slice(0, 64) } : {};
  const res = await ambilDgnTimeout(String(sumber).replace(/\/+$/, '') + '/lagu/batas', 15_000, headers);
  return res.json();
}

// ------------------------------------------------------------ MP3
// Tabel bitrate (kbps) & sample rate buat MPEG-1/2/2.5 Layer III.
const BR_V1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const BR_V2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
const SR = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

/** Baca header frame MP3 Layer III di posisi i. @returns {{panjang, sampel, sr}|null} */
export function headerMp3(buf, i) {
  if (i + 4 > buf.length) return null;
  if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) return null;
  const versi = (buf[i + 1] >> 3) & 3; // 3=MPEG1, 2=MPEG2, 0=MPEG2.5
  const layer = (buf[i + 1] >> 1) & 3; // 1=Layer III
  if (versi === 1 || layer !== 1) return null;
  const brIdx = buf[i + 2] >> 4;
  const srIdx = (buf[i + 2] >> 2) & 3;
  if (brIdx === 0 || brIdx === 15 || srIdx === 3) return null;
  const pad = (buf[i + 2] >> 1) & 1;
  const br = (versi === 3 ? BR_V1 : BR_V2)[brIdx] * 1000;
  const sr = SR[versi][srIdx];
  const panjang = Math.floor(((versi === 3 ? 144 : 72) * br) / sr) + pad;
  return { panjang, sampel: versi === 3 ? 1152 : 576, sr };
}

/**
 * Potongan byte acak dari tengah file MP3 → rapiin: mulai dari frame utuh
 * pertama (dicek 3 frame berturut-turut biar nggak ketipu byte 0xFF biasa)
 * dan berhenti di frame utuh terakhir. MP3 itu kumpulan frame mandiri, jadi
 * hasilnya file MP3 yang valid tanpa perlu ffmpeg.
 * @returns {{data: Buffer, detik: number}}
 */
export function rapikanMp3(buf, maksDetik = Infinity) {
  let mulai = -1;
  for (let i = 0; i < Math.min(buf.length, 64 * 1024); i++) {
    const a = headerMp3(buf, i);
    if (!a) continue;
    const b = headerMp3(buf, i + a.panjang);
    const c = b && headerMp3(buf, i + a.panjang + b.panjang);
    if (b && c && b.sr === a.sr && c.sr === a.sr) { mulai = i; break; }
  }
  if (mulai < 0) throw new Error('bukan data MP3 (frame nggak ketemu)');
  let i = mulai;
  let detik = 0;
  while (true) {
    const h = headerMp3(buf, i);
    if (!h || i + h.panjang > buf.length) break;
    if (detik + h.sampel / h.sr > maksDetik) break;
    detik += h.sampel / h.sr;
    i += h.panjang;
  }
  if (detik < 5) throw new Error('potongan MP3 kependekan');
  return { data: buf.subarray(mulai, i), detik: Math.round(detik) };
}

/** Download cuma bagian [mulai, mulai+detik] dari MP3 CBR pakai HTTP Range. */
export async function downloadPotongan(url, { mulai = 60, detik = 60, kbps = 128 } = {}) {
  const bps = (kbps * 1000) / 8;
  const dari = Math.max(0, Math.floor(mulai * bps));
  const sampai = dari + Math.ceil((detik + 2) * bps) + 8 * 1024; // lebihin dikit buat nyari frame
  const res = await ambilDgnTimeout(url, 90_000, { Range: `bytes=${dari}-${sampai}` });
  const buf = Buffer.from(await res.arrayBuffer());
  if (res.status === 200 && buf.length > sampai - dari + 1) {
    // server nggak dukung Range → potong sendiri dari file utuh
    return rapikanMp3(buf.subarray(dari, sampai), detik);
  }
  return rapikanMp3(buf, detik);
}
