/**
 * Perekam pesan channel — alat debug, bukan fitur harian.
 *
 * Kenapa ada: format "Pertanyaan" channel WA belum didokumentasikan dan Baileys
 * belum mendukungnya, jadi satu-satunya cara tahu bentuk aslinya adalah merekam
 * post Pertanyaan yang dibuat manual dari HP, lalu meniru strukturnya.
 * Hasil rekaman = protobuf pesan yang sudah di-decode jadi JSON (tanpa media,
 * string panjang dipotong) supaya aman dibagikan — plus `b64` byte mentahnya
 * kalau postingannya kecil, supaya field yang belum dikenal proto versi ini
 * masih bisa dibaca ulang nanti.
 *
 * Kalau yang dibutuhkan justru byte aslinya (field yang belum dikenal versi
 * proto ini dibuang waktu decode), lihat ./rekam-mentah.mjs + mesin/rekam-channel.mjs
 * yang dipanggil dari chat sendiri dengan `.rekam on` → `.rekam kirim`.
 */
import { proto } from '@whiskeysockets/baileys';

const MAKS_STRING = 200;
// Byte mentah ikut disimpan (biar field yang belum dikenal proto ini nggak
// hilang), tapi cuma buat postingan kecil. Yang besar dikasih penanda saja.
const MAKS_MENTAH = 256 * 1024;

/** Potong string panjang & buang byte media biar file rekaman kecil dan nggak bocorin isi. */
export function ringkas(nilai, dalam = 0) {
  if (dalam > 12) return '[terlalu dalam]';
  if (typeof nilai === 'string') {
    return nilai.length > MAKS_STRING ? `${nilai.slice(0, MAKS_STRING)}…[+${nilai.length - MAKS_STRING}]` : nilai;
  }
  if (nilai instanceof Uint8Array) return `[bytes ${nilai.length}]`;
  if (Array.isArray(nilai)) return nilai.map((v) => ringkas(v, dalam + 1));
  if (nilai && typeof nilai === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(nilai)) {
      if (v === undefined || v === null) continue;
      out[k] = ringkas(v, dalam + 1);
    }
    return out;
  }
  return nilai;
}

/** Nama jenis pesan yang gampang dibaca: "questionMessage>extendedTextMessage". */
export function jenisPesan(obj) {
  const rantai = [];
  let cur = obj;
  for (let i = 0; i < 4 && cur && typeof cur === 'object'; i++) {
    const kunci = Object.keys(cur).filter((k) => k !== 'messageContextInfo' && /Message$|^conversation$/.test(k));
    if (!kunci.length) break;
    rantai.push(kunci[0]);
    cur = cur[kunci[0]]?.message;
  }
  return rantai.join('>') || '(kosong)';
}

/** Decode isi protobuf jadi objek JSON biasa. */
export function decodePesan(bytes) {
  const m = proto.Message.decode(bytes);
  return proto.Message.toObject(m, { longs: String, enums: String, defaults: false });
}

/** Kumpulkan semua node <message> di hasil query (bentuk balasannya bisa bersarang). */
export function kumpulkanNodeMessage(node, hasil = []) {
  if (!node || typeof node !== 'object') return hasil;
  if (node.tag === 'message') hasil.push(node);
  if (Array.isArray(node.content)) for (const anak of node.content) kumpulkanNodeMessage(anak, hasil);
  return hasil;
}

/** Ubah node <message> newsletter (attrs + <plaintext>) jadi entri rekaman. */
export function susunEntri(node) {
  const entri = { attrs: node.attrs || {} };
  const anak = Array.isArray(node.content) ? node.content : [];
  const plain = anak.find((n) => n?.tag === 'plaintext');
  if (plain && plain.content instanceof Uint8Array) {
    entri.byte = plain.content.length;
    if (plain.content.length <= MAKS_MENTAH) {
      entri.b64 = Buffer.from(plain.content).toString('base64');
    } else {
      entri.mentahDilewati = `payload ${plain.content.length} byte (di atas ${MAKS_MENTAH})`;
    }
    try {
      const obj = decodePesan(plain.content);
      entri.jenis = jenisPesan(obj);
      entri.pesan = ringkas(obj);
    } catch (e) {
      entri.gagalDecode = e.message;
    }
  } else {
    entri.tanpaPlaintext = anak.map((n) => n?.tag).filter(Boolean);
  }
  return entri;
}

/**
 * Ambil N pesan terakhir dari channel lewat query newsletter Baileys, lalu
 * (opsional) tunggu pesan masuk secara live selama `tungguDetik` — dipakai
 * kalau kall mau bikin post Pertanyaan dari HP sambil perekam jalan.
 */
export async function rekamChannel(sock, jid, { jumlah = 10, tungguDetik = 0, log = () => {} } = {}) {
  const rekaman = { jid, waktu: new Date().toISOString(), diambil: [], masuk: [] };
  try {
    const hasil = await sock.newsletterFetchMessages(jid, jumlah, undefined, undefined);
    rekaman.diambil = kumpulkanNodeMessage(hasil).map(susunEntri);
    log(`Diambil ${rekaman.diambil.length} pesan dari server.`);
  } catch (e) {
    rekaman.gagalAmbil = e.message;
    log(`Ambil riwayat gagal: ${e.message}`);
  }
  if (tungguDetik > 0) {
    log(`Nunggu pesan masuk ${tungguDetik} detik — sekarang bikin post Pertanyaan dari HP.`);
    await new Promise((selesai) => {
      const timer = setTimeout(selesai, tungguDetik * 1000);
      sock.ev.on('messages.upsert', ({ messages }) => {
        for (const m of messages || []) {
          if (m?.key?.remoteJid !== jid) continue;
          const obj = proto.WebMessageInfo.toObject(proto.WebMessageInfo.fromObject(m), { longs: String, enums: String, defaults: false });
          rekaman.masuk.push({ jenis: jenisPesan(obj.message), pesan: ringkas(obj) });
          log(`Masuk: ${jenisPesan(obj.message)}`);
        }
        if (rekaman.masuk.length) {
          clearTimeout(timer);
          selesai();
        }
      });
    });
  }
  return rekaman;
}
