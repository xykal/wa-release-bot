// "Rekam mentah": ngepilih stanza notifikasi channel yang benar-benar postingan
// dan nyimpen BYTE proto aslinya (base64). Pendamping ./rekam.mjs (perekam
// lewat CLI, yang menerjemahkan hasilnya jadi JSON ringkas).
//
// Kenapa perlu byte mentah: proto yang dibundel app (Baileys 6.7.24) baru tahu
// sebagian field. Postingan **Pertanyaan** di channel, misalnya, datang sebagai
// `questionMessage` (pembungkus FutureProofMessage) — isi di dalamnya bisa
// berisi field yang belum dikenal versi ini dan itu DIBUANG waktu decode, jadi
// hasil terjemahan bakal bolong. Byte mentah aman: bisa didecode ulang pakai
// proto yang lebih baru tanpa perlu HP-nya online lagi.
//
// Berkas ini murni (nol import Baileys) → diuji di test/rekam-mentah.test.mjs.

/** Paling banyak sekian postingan disimpan (yang paling lama dibuang). */
export const MAKS_ENTRI = 10;
/** Batas wajar satu postingan; di atas ini diabaikan biar file nggak membengkak. */
export const MAKS_BYTE = 4 * 1024 * 1024;

/** Anak pertama dengan tag tertentu dari satu stanza ({ tag, attrs, content }). */
export function cariAnak(node, tag) {
  const isi = node?.content;
  if (!Array.isArray(isi)) return null;
  return isi.find((a) => a?.tag === tag) || null;
}

/** Byte dari `content` yang bisa berupa Buffer/Uint8Array/string biner. */
export function keBuffer(content) {
  if (Buffer.isBuffer(content)) return content;
  if (content instanceof Uint8Array) return Buffer.from(content);
  if (typeof content === 'string') return Buffer.from(content, 'binary');
  return null;
}

/**
 * Ubah satu stanza `<notification type="newsletter">` jadi satu entri rekaman.
 * Notifikasi lain (reaction/view/settings) ditolak: yang direkam cuma postingan.
 *
 * @param {object} node stanza CB:notification
 * @param {{ waktu?: number }} opsi
 * @returns {{ ok: boolean, alasan?: string, entri?: object }}
 */
export function entriRekaman(node, { waktu = Date.now() } = {}) {
  const tipeNotif = String(node?.attrs?.type || '');
  if (tipeNotif !== 'newsletter') {
    return { ok: false, alasan: `bukan notifikasi newsletter (${tipeNotif || 'tanpa tipe'})` };
  }

  const isi = Array.isArray(node?.content) ? node.content : [];
  const pesan = isi.find((a) => a?.tag === 'message');
  if (!pesan) return { ok: false, alasan: 'bukan postingan (nggak ada tag <message>)' };

  const teks = cariAnak(pesan, 'plaintext');
  const buf = teks ? keBuffer(teks.content) : null;
  if (!buf?.length) {
    return { ok: false, alasan: 'postingan tanpa <plaintext> — mungkin terenkripsi atau cuma metadata' };
  }
  if (buf.length > MAKS_BYTE) return { ok: false, alasan: `postingan kebesaran (${buf.length} byte)` };

  return {
    ok: true,
    entri: {
      waktu,
      channel: String(node?.attrs?.from || ''),
      id: String(pesan.attrs?.message_id || pesan.attrs?.server_id || ''),
      tipe: String(pesan.attrs?.type || ''),
      byte: buf.length,
      b64: buf.toString('base64'),
    },
  };
}

/**
 * Tambah entri ke daftar: yang terbaru di belakang, id yang sama diganti
 * (update), yang paling lama dibuang kalau lebih dari `maks`.
 */
export function tambahEntri(daftar = [], entri, maks = MAKS_ENTRI) {
  const tanpaDuplikat = (Array.isArray(daftar) ? daftar : []).filter(
    (e) => !(entri?.id && e?.id && e.id === entri.id && e.channel === entri.channel)
  );
  tanpaDuplikat.push(entri);
  return tanpaDuplikat.slice(-maks);
}

/** Ringkasan buat jawaban `.rekam` (jumlah, kapan terakhir, ukuran total). */
export function ringkasRekaman(data) {
  const entri = Array.isArray(data?.entri) ? data.entri : [];
  const terakhir = entri[entri.length - 1];
  return {
    jumlah: entri.length,
    terakhir: terakhir?.waktu || null,
    tipeTerakhir: terakhir?.tipe || null,
    byte: entri.reduce((t, e) => t + (Number(e?.byte) || 0), 0),
  };
}
