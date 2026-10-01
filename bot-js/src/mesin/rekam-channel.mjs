// Rekam postingan channel WhatsApp (butuh socket mode jaga yang memang nyala
// terus). Dipakai buat "merekam" fitur WA yang belum didukung Baileys —
// contohnya postingan Pertanyaan di channel: kita simpan byte aslinya, bukan
// hasil decode (lihat catatan di ../rekam-mentah.mjs).
//
// Hook mentah dipasang pada CB:notification dan CB:message: postingan channel
// bisa datang dalam salah satu bentuk, dan harus disalin sebelum proto decode.

import fs from 'node:fs';
import path from 'node:path';

import { entriRekaman, tambahEntri, ringkasRekaman, cariAnak, MAKS_ENTRI } from '../rekam-mentah.mjs';
import { jidSendiri } from '../wa.mjs';

/** Batas total file rekaman; postingan paling lama dibuang kalau lewat. */
export const MAKS_TOTAL_BYTE = 8 * 1024 * 1024;

/**
 * @param {object} ctx konteks engine (dataDir, log, emitStatus, state)
 */
export function buatRekamChannel(ctx) {
  const { log, emitStatus } = ctx;
  let aktif = false;
  let jumlahKirim = 0;
  let statusTerakhir = null;

  const berkas = () => path.join(ctx.dataDir, 'rekaman-channel.json');
  const namaBerkas = 'rekaman-channel.json';

  function baca() {
    try {
      const d = JSON.parse(fs.readFileSync(berkas(), 'utf8'));
      return d && typeof d === 'object' && Array.isArray(d.entri) ? d : { entri: [] };
    } catch {
      return { entri: [] };
    }
  }

  function tulis(data) {
    // Tanpa indentasi: isinya base64, indentasi cuma bikin file dua kali lipat.
    fs.mkdirSync(ctx.dataDir, { recursive: true });
    fs.writeFileSync(berkas(), JSON.stringify(data));
  }

  /** Buang entri paling lama sampai totalnya masuk batas. */
  function rapikan(data) {
    const total = () => data.entri.reduce((t, e) => t + (Number(e?.byte) || 0), 0);
    while (data.entri.length > 1 && total() > MAKS_TOTAL_BYTE) data.entri.shift();
    return data;
  }

  /**
   * Pasang hook di socket mode jaga. Dipanggil tiap kali mode jaga nyambung,
   * jadi nggak ada listener yang numpuk di socket yang sudah ditutup.
   */
  function pasang(sock) {
    const ws = sock?.ws;
    if (!ws?.on) {
      log('⚠️ Rekam channel: socket ini nggak bisa dipasangi hook, rekaman dilewati.');
      return;
    }
    const tangkap = (node) => {
      if (!aktif) return;
      try {
        const hasil = entriRekaman(node);
        if (!hasil.ok) {
          const pesanLangsung = node?.tag === 'message' && String(node?.attrs?.from || '').endsWith('@newsletter');
          const notifPost = node?.tag === 'notification' && node?.attrs?.type === 'newsletter' && cariAnak(node, 'message');
          if (pesanLangsung || notifPost) {
            statusTerakhir = { status: 'dilewatkan', alasan: hasil.alasan };
            log(`Rekam channel melewatkan postingan: ${hasil.alasan}.`);
            emitStatus();
          }
          return;
        }
        const lama = baca();
        const data = rapikan({ ...lama, entri: tambahEntri(lama.entri, hasil.entri, MAKS_ENTRI) });
        data.diperbarui = new Date().toISOString();
        tulis(data);
        jumlahKirim += 1;
        statusTerakhir = { status: 'tersimpan', alasan: null };
        log(
          `Rekam channel: 1 postingan tersimpan (${hasil.entri.byte} byte, ` +
          `tipe ${hasil.entri.tipe || 'teks'}, total ${data.entri.length}).`
        );
        emitStatus();
      } catch (e) {
        statusTerakhir = { status: 'gagal', alasan: 'gagal menyimpan file' };
        log(`⚠️ Rekam channel gagal nyimpen: ${e.message}`);
        emitStatus();
      }
    };

    // Baileys dapat menerima posting channel sebagai node message langsung,
    // bukan notification newsletter; kedua bentuk perlu direkam tanpa decode.
    ws.on('CB:notification', tangkap);
    ws.on('CB:message', tangkap);
  }

  function nyalakan() {
    aktif = true;
    const r = ringkas();
    log('🎙️ Rekam channel NYALA: postingan berikutnya di channel yang kamu ikuti bakal disimpan.');
    emitStatus();
    return r;
  }

  function matikan() {
    aktif = false;
    log('🎙️ Rekam channel mati.');
    emitStatus();
    return ringkas();
  }

  function kosongkan() {
    try { fs.unlinkSync(berkas()); } catch { /* belum ada berkasnya */ }
    log('🎙️ Rekaman channel dikosongkan.');
    emitStatus();
    return ringkas();
  }

  function ringkas() {
    return {
      aktif,
      kiriman: jumlahKirim,
      ...ringkasRekaman(baca()),
      terakhirStatus: statusTerakhir?.status || null,
      terakhirAlasan: statusTerakhir?.alasan || null,
    };
  }

  /** Kirim file rekaman ke chat sendiri (dokumen), biar bisa diteruskan ke dev. */
  async function kirimKe(sock) {
    if (!sock) return { ok: false, alasan: 'WA belum nyambung.' };
    if (!fs.existsSync(berkas())) return { ok: false, alasan: 'Belum ada rekaman.' };
    const jid = jidSendiri(sock);
    if (!jid) return { ok: false, alasan: 'Chat sendiri nggak ketemu.' };
    const data = fs.readFileSync(berkas());
    await sock.sendMessage(jid, {
      document: data,
      fileName: namaBerkas,
      mimetype: 'application/json',
      caption: 'Rekaman postingan channel. Kirim file ini ke developer (upload), jangan diedit.',
    });
    log(`📤 Rekaman channel dikirim ke chat sendiri (${Math.round(data.length / 1024)} KB).`);
    return { ok: true, byte: data.length };
  }

  return { pasang, nyalakan, matikan, kosongkan, kirimKe, ringkas, berkas, sedangRekam: () => aktif };
}
