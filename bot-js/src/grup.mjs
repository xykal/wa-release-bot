// ============================================================================
//  Penjaga grup: approve permintaan join otomatis, KECUALI orang yang udah
//  pernah keluar / dikeluarin dari grup — mereka ditolak.
//
//  Cara kerjanya "berkala" (hemat batre), bukan nyambung terus:
//    tiap N menit → nyambung WA → ambil daftar anggota + daftar permintaan
//    → bandingin sama daftar anggota sebelumnya → putus lagi.
//
//  "Siapa yang keluar" dihitung dari selisih daftar anggota:
//    anggota di catatan lama yang nggak ada lagi sekarang = keluar/dikeluarin.
//  Jadi yang keluar SEBELUM fitur ini nyala nggak ketahuan → buat mereka
//  ada daftar hitam manual (nomor diketik di app).
//
//  WhatsApp sekarang kadang pakai "LID" (ID samaran, akhiran @lid) selain
//  nomor HP (@s.whatsapp.net). Satu orang bisa muncul dengan dua-duanya,
//  jadi tiap orang dicatat pakai SEMUA identitas yang ketahuan.
//
//  File ini SENGAJA nggak import apa-apa → bisa dites tanpa Baileys.
// ============================================================================

/** "628xx:12@s.whatsapp.net" → "628xx@s.whatsapp.net" (buang nomor device). */
export function rapikanJid(jid) {
  const s = String(jid ?? '').trim().toLowerCase();
  if (!s.includes('@')) return null;
  const [user, domain] = s.split('@');
  const u = user.split(':')[0];
  if (!u || !domain) return null;
  if (domain === 'c.us') return `${u}@s.whatsapp.net`;
  return `${u}@${domain}`;
}

/** Semua identitas yang ketahuan dari satu entri (anggota / permintaan). */
export function identitas(entri) {
  if (!entri) return [];
  const kandidat = typeof entri === 'string'
    ? [entri]
    : [entri.id, entri.jid, entri.lid, entri.phone_number, entri.pn];
  const set = new Set();
  for (const k of kandidat) {
    const r = rapikanJid(k);
    if (r) set.add(r);
  }
  return [...set];
}

/** Nomor dari daftar hitam manual → JID. Isinya dipisah koma / spasi / baris. */
export function daftarHitamManual(teks, normalisasiNomor) {
  const hasil = new Set();
  for (const bagian of String(teks ?? '').split(/[\s,;]+/)) {
    if (!bagian) continue;
    if (bagian.includes('@')) {
      const r = rapikanJid(bagian);
      if (r) hasil.add(r);
      continue;
    }
    const n = normalisasiNomor(bagian);
    if (n) hasil.add(`${n}@s.whatsapp.net`);
  }
  return [...hasil];
}

/**
 * Bandingin anggota lama vs sekarang → siapa yang hilang.
 *
 * @param {Array<string[]>} lama    daftar identitas per orang (catatan lalu)
 * @param {Array<object>}   sekarang anggota dari groupMetadata().participants
 * @param {string[]}        saya    identitas akun bot sendiri (jangan dihitung)
 * @returns {Array<string[]>} identitas orang yang keluar/dikeluarin
 */
export function cariYangKeluar(lama, sekarang, saya = []) {
  const ada = new Set();
  for (const p of sekarang) for (const i of identitas(p)) ada.add(i);
  const sayaSet = new Set(saya.map(rapikanJid).filter(Boolean));
  const keluar = [];
  for (const orang of lama || []) {
    if (!orang?.length) continue;
    if (orang.some((i) => sayaSet.has(i))) continue;
    if (orang.some((i) => ada.has(i))) continue; // masih di grup
    keluar.push(orang);
  }
  return keluar;
}

/** Ubah participants jadi catatan yang bisa disimpan di state.json. */
export function catatAnggota(sekarang) {
  return sekarang.map((p) => identitas(p)).filter((x) => x.length);
}

/**
 * Putusin satu permintaan join.
 * @returns {'approve'|'reject'}
 */
export function putuskan(permintaan, daftarHitam) {
  const hitam = daftarHitam instanceof Set ? daftarHitam : new Set(daftarHitam);
  return identitas(permintaan).some((i) => hitam.has(i)) ? 'reject' : 'approve';
}

/** Buat log: nomor HP kalau ada, kalau nggak ya LID-nya. */
export function namaOrang(entri) {
  const ids = Array.isArray(entri) ? entri : identitas(entri);
  const pn = ids.find((i) => i.endsWith('@s.whatsapp.net'));
  return (pn || ids[0] || '?').split('@')[0];
}
