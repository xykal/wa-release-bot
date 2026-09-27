// ============================================================================
//  Kirim pesan + NUNGGU JAWABAN SERVER (ack).
//
//  Dulu: `await sock.sendMessage(...)` → langsung dianggap "terkirim". Padahal
//  itu cuma artinya "udah ditulis ke socket". Server WA bisa aja nolak (ack
//  dengan atribut `error`) dan kita nggak pernah tau — log bilang ✅, pesan
//  nggak pernah nongol. Sekarang tiap kirim nunggu ack-nya, dan kalau ditolak
//  kode error-nya ditulis ke log.
//
//  Pertanyaan channel: struktur & atribut <meta questiontype="question"/>
//  diambil dari hasil bongkar protokol di fork Baileys lain
//  (rexxzyid/elaina-baileys). Baileys 6.7.24 yang dipakai di sini nggak bisa
//  nambahin node <meta> ke pesan channel, jadi stanza-nya dirakit & dikirim
//  manual lewat sock.sendNode.
// ============================================================================

import {
  proto,
  generateMessageIDV2,
  getBinaryNodeChild,
  getBinaryNodeChildren,
} from '@whiskeysockets/baileys';
import { bacaAck, cariTeks } from './pesan.mjs';

/** Pesan yang barusan dikirim — buat ngeladenin permintaan kirim ulang (retry) dari HP penerima. */
const terkirim = new Map();
const MAKS_SIMPAN = 200;

export function simpanTerkirim(id, message) {
  if (!id || !message) return;
  terkirim.set(id, message);
  while (terkirim.size > MAKS_SIMPAN) terkirim.delete(terkirim.keys().next().value);
}

/** Dipasang ke makeWASocket({ getMessage }) */
export async function ambilTerkirim(key) {
  return terkirim.get(key?.id) || undefined;
}

export const pernahKirim = (id) => terkirim.has(id);

/** Tunggu ack dari server buat pesan `id`. Resolve null kalau timeout. */
export function tungguAck(sock, id, timeoutMs = 20_000) {
  return new Promise((resolve) => {
    const ws = sock?.ws;
    if (!ws?.on) { resolve(null); return; }
    const ev = `TAG:${id}`;
    let selesai = false;
    const beres = (hasil) => {
      if (selesai) return;
      selesai = true;
      clearTimeout(t);
      try { ws.off(ev, dengar); ws.off('close', tutup); } catch { /* ignore */ }
      resolve(hasil);
    };
    const dengar = (node) => { if (node?.tag === 'ack') beres(node); };
    const tutup = () => beres(null);
    const t = setTimeout(() => beres(null), timeoutMs);
    ws.on(ev, dengar);
    ws.on('close', tutup);
  });
}

function periksa(ack, apa) {
  const h = bacaAck(ack);
  if (!h) return { ok: null }; // nggak ada jawaban — belum tentu gagal
  if (!h.ok) {
    const e = new Error(`${apa} ditolak server WA (error ${h.arti})`);
    e.kodeWA = h.error;
    throw e;
  }
  return h;
}

/**
 * Kirim teks biasa (grup / chat / channel format teks). Nunggu ack.
 * @returns {{ id: string, ok: boolean|null, serverId?: string }}
 */
export async function kirimTeks(sock, jid, text, opsi = {}) {
  const id = generateMessageIDV2(sock.user?.id);
  const ack = tungguAck(sock, id);
  const m = await sock.sendMessage(jid, { text }, { messageId: id, ...opsi });
  simpanTerkirim(id, m?.message);
  const h = periksa(await ack, 'Pesan');
  return { id, ...h };
}

/**
 * Kirim ke channel sebagai "Pertanyaan" (follower bisa bales, balasannya
 * cuma masuk ke admin, di WA muncul tombol "Lihat respons").
 * @returns {{ id: string, ok: boolean|null, serverId?: string }}
 */
export async function kirimPertanyaan(sock, jid, text) {
  const pesan = proto.Message.fromObject({
    questionMessage: {
      message: {
        extendedTextMessage: {
          text,
          contextInfo: { isQuestion: true },
        },
      },
    },
  });
  const id = generateMessageIDV2(sock.user?.id);
  const ack = tungguAck(sock, id);
  await sock.sendNode({
    tag: 'message',
    attrs: { to: jid, id, type: 'text' },
    content: [
      { tag: 'meta', attrs: { questiontype: 'question' }, content: undefined },
      { tag: 'plaintext', attrs: {}, content: proto.Message.encode(pesan).finish() },
    ],
  });
  const h = periksa(await ack, 'Pertanyaan');
  return { id, ...h };
}

/**
 * Ambil respons follower buat satu pertanyaan (butuh serverId dari ack).
 * @returns {Promise<Array<{ nama: string, teks: string, t: number|null, dibalas: boolean }>>}
 */
export async function ambilRespons(sock, jid, serverId, jumlah = 30) {
  const hasil = await sock.query({
    tag: 'iq',
    attrs: { type: 'get', xmlns: 'newsletter', to: jid },
    content: [{ tag: 'question_responses', attrs: { server_id: String(serverId), count: String(jumlah) } }],
  });
  const wadah = getBinaryNodeChild(hasil, 'question_responses');
  if (!wadah) return [];
  return getBinaryNodeChildren(wadah, 'question_response').map((r) => {
    const msg = getBinaryNodeChild(r, 'message');
    const sender = getBinaryNodeChild(r, 'sender');
    const flags = getBinaryNodeChild(r, 'flags');
    const plain = msg && getBinaryNodeChild(msg, 'plaintext');
    let teks = '';
    if (plain?.content instanceof Uint8Array) {
      try {
        teks = cariTeks(proto.Message.toObject(proto.Message.decode(plain.content)));
      } catch { /* format nggak dikenal */ }
    }
    return {
      nama: sender?.attrs?.notify_name || (sender?.attrs?.lid || '').split('@')[0] || 'Follower',
      teks: teks || '(bukan teks)',
      t: msg?.attrs?.t ? Number(msg.attrs.t) * 1000 : null,
      dibalas: Boolean(flags && getBinaryNodeChild(flags, 'replied')),
    };
  });
}
