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
//  WhatsApp sekarang kadang pakai "LID" (akhiran @lid, digit acak panjang) selain
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

/** Cocokkan dua bentuk akun kalau salah satunya kelihatan sebagai PN atau LID. */
export function identitasSama(a, b) {
  const kiri = new Set(identitas(a));
  return identitas(b).some((jid) => kiri.has(jid));
}

/** Nomor dari daftar hitam manual → JID. Isinya dipisah koma / spasi / baris. */
export function daftarHitamManual(teks, normalisasiNomor) {
  const hasil = new Set();
  // Dipisah koma / titik koma / baris baru. Spasi di DALAM nomor boleh
  // ("0812 3456 7890") — dulu spasi juga dianggap pemisah, jadi nomor yang
  // ditulis pakai spasi pecah jadi potongan yang nggak valid.
  const potongan = [];
  for (const baris of String(teks ?? '').split(/[,;\n]+/)) {
    const t = baris.trim();
    if (!t) continue;
    if (!t.includes('@') && normalisasiNomor(t)) potongan.push(t);
    else potongan.push(...t.split(/\s+/));
  }
  for (const bagian of potongan) {
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

// ---------------------------------------------------------------------------
//  Daftar hitam per ORANG (buat ditampilin & dibuka blokirnya satu-satu).
//  `hitam` = daftar identitas (flat, yang dipakai buat nolak). `info` =
//  catatan per orang: { ids: [...], sejak }. Entri lama (dari versi
//  sebelum ada `info`) tetap muncul, satu identitas = satu orang.
// ---------------------------------------------------------------------------

/**
 * Label satu orang: nomor penuh (+62812…) kalau ada; kalau cuma kebagian LID,
 * tampilkan digitnya UTUH (kall 2026-10-04: "daftar hitam nggak perlu ada
 * yang disamarkan"). Ronda 3: sebutan lama yang ada kata "samaran"-nya dibuang
 * total — sekarang polos "ID 100987654".
 */
export function labelOrang(ids) {
  const pn = ids.find((i) => i.endsWith('@s.whatsapp.net'));
  if (pn) return '+' + pn.split('@')[0];
  const id = (ids[0] || '?').split('@')[0];
  return `ID ${id}`;
}

// ---------------------------------------------------------------------------
//  Peta nama: nomor/LID (digit saja) → nama pushname WA. Dibangun penjaga grup
//  dari data anggota dan pesan masuk, disimpan di state (g.namaPeta) supaya
//  daftar hitam bisa nampilin "nama sesuai no" (kall), bukan cuma angka.
// ---------------------------------------------------------------------------

/** Digit kunci dari satu JID — dipakai buat nyari nama di peta. */
export function kunciNama(jid) {
  return String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');
}

/** Nama untuk sekumpulan identitas seorang (dari peta; null kalau belum tahu). */
export function namaDariPeta(ids, peta = {}) {
  for (const i of ids || []) {
    const n = peta[kunciNama(i)];
    if (n) return n;
  }
  return null;
}

/**
 * @param {object} peta { digit: nama } — boleh kosong.
 * @returns {Array<{kunci: string, ids: string[], label: string, nama: string|null, sejak: number|null}>}
 */
export function kelompokHitam(hitam = [], info = [], peta = {}) {
  const sisa = new Set(hitam);
  const hasil = [];
  for (const o of info || []) {
    const ids = (o?.ids || []).filter((i) => sisa.has(i));
    if (!ids.length) continue;
    ids.forEach((i) => sisa.delete(i));
    hasil.push({ kunci: ids[0], ids, label: labelOrang(ids), nama: namaDariPeta(ids, peta), sejak: o.sejak || null });
  }
  for (const i of sisa) hasil.push({ kunci: i, ids: [i], label: labelOrang([i]), nama: namaDariPeta([i], peta), sejak: null });
  return hasil;
}

/**
 * Buka blokir satu orang. `kunci` boleh identitas lengkap (628xx@s.whatsapp.net
 * / xxx@lid) atau nomor HP (0812… / +62812…) — dicocokin ke semua identitasnya.
 * @returns {{hitam: string[], info: object[], dihapus: object|null}}
 */
export function bukaBlokir(hitam = [], info = [], kunci, normalisasiNomor = () => null) {
  const target = new Set();
  const r = rapikanJid(kunci);
  if (r) target.add(r);
  const n = normalisasiNomor(String(kunci ?? ''));
  if (n) target.add(`${n}@s.whatsapp.net`);
  const orang = kelompokHitam(hitam, info).find((o) => o.ids.some((i) => target.has(i)));
  if (!orang) return { hitam: [...hitam], info: [...(info || [])], dihapus: null };
  const buang = new Set(orang.ids);
  return {
    hitam: hitam.filter((i) => !buang.has(i)),
    info: (info || []).filter((o) => !(o?.ids || []).some((i) => buang.has(i))),
    dihapus: orang,
  };
}
