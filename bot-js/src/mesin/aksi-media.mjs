// Aksi yang butuh media: foto jadi stiker, story/status HD + tag grup.
//
// Dipisah dari aksi-pesan.mjs supaya tiap berkas tetap di bawah ~250 baris.
// Yang nempel ke WhatsApp cuma `sock.sendMessage`; semua keputusan ada di sini.

import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

import { jidSendiri } from '../wa.mjs';
import { penontonStory as hitungPenonton, keteranganPenonton } from '../story.mjs';
import { mediaPesan } from './aksi-pesan.mjs';

/**
 * @param {object} ctx konteks engine (cfg, state, dataDir, tungguStiker, bridge)
 * @param {{ log: Function, jawab: Function, unduhMedia: Function, papan: object, emitStatus: Function }} alat
 */
export function buatAksiMedia(ctx, alat) {
  const { log, jawab, unduhMedia, papan, emitStatus } = alat;

  // -------------------------------- stiker ---------------------------------

  /**
   * Stiker WA harus WebP. Node di HP nggak punya encoder WebP, jadi gambar
   * dititipkan ke app lewat berkas di dataDir (JEMBATANNYA SAMA: app dan mesin
   * Node jalan di satu sandbox, `WR_DATA_DIR`), bukan lewat base64 di bridge —
   * WS bridge batasnya 1 MB, foto WhatsApp gampang lewat batas itu.
   */
  const dirStiker = () => path.join(ctx.dataDir, 'stiker');

  /** Buang sisa berkas stiker yang gagal/nyangkut, biar nggak numpuk di HP. */
  function bersihkanStikerTua() {
    try {
      const batas = Date.now() - 10 * 60 * 1000;
      for (const f of fs.readdirSync(dirStiker())) {
        const b = path.join(dirStiker(), f);
        if (fs.statSync(b).mtimeMs < batas) fs.unlinkSync(b);
      }
    } catch { /* folder belum ada: nggak masalah */ }
  }

  /** Batas ukuran gambar yang dititipkan ke app (foto WA normal jauh di bawah). */
  const BATAS_STIKER_BYTE = 6 * 1024 * 1024;

  async function mintaStiker(sock, m) {
    const media = mediaPesan(m);
    if (!media || media.jenis !== 'gambar') {
      await jawab(sock, 'Kirim/rebalas FOTO dengan keterangan .stiker ya.');
      return;
    }
    if (!ctx.bridge.adaKlien?.()) {
      await jawab(sock, '.stiker cuma jalan lewat app Android: konversi WebP-nya dikerjakan app, engine Node nggak punya encodernya.');
      return;
    }
    try {
      const buf = await unduhMedia(sock, m);
      if (!buf?.length) throw new Error('gambarnya nggak kebaca');
      if (buf.length > BATAS_STIKER_BYTE) {
        await jawab(sock, `Fotonya kegedean (${Math.round(buf.length / 1048576)} MB). Kirim ulang sebagai foto biasa ya, jangan sebagai dokumen.`);
        return;
      }
      // Use an unpredictable, exclusive, owner-only temp file: photos are private
      // and a stale path/symlink must never be overwritten by a new request.
      const id = randomBytes(16).toString('hex');
      bersihkanStikerTua();
      fs.mkdirSync(dirStiker(), { recursive: true, mode: 0o700 });
      const berkas = `stiker/masuk-${id}.img`;
      fs.writeFileSync(path.join(ctx.dataDir, berkas), buf, { flag: 'wx', mode: 0o600 });
      ctx.tungguStiker = ctx.tungguStiker || new Map();
      ctx.tungguStiker.set(id, { dimintaAt: Date.now() });
      ctx.bridge.send({ type: 'minta_stiker', id, file: berkas });
      log(`🎨 Foto diterima (${Math.round(buf.length / 1024)} KB) — dikonversi app jadi stiker.`);
      await jawab(sock, 'Lagi diproses jadi stiker...');
    } catch (e) {
      log(`⚠️ Gagal ambil fotonya: ${e.message}`);
      await jawab(sock, `Gagal ambil fotonya: ${e.message}`);
    }
  }

  /**
   * Dipanggil perintah.mjs waktu app selesai konversi (cmd `stiker-jadi`):
   * app nulis hasil WebP-nya di dataDir, engine tinggal ngirim. Berkas masuk
   * dan keluar dihapus lagi di akhir, apa pun yang terjadi.
   */
  async function kirimStikerJadi(cmd, sock) {
    const id = String(cmd.id || '');
    // IPC is local, but validate identifiers and never trust a returned path:
    // this prevents a malformed app command from reading/deleting outside dataDir.
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return;
    const masuk = path.join(ctx.dataDir, 'stiker', `masuk-${id}.img`);
    const keluar = path.join(ctx.dataDir, 'stiker', `keluar-${id}.webp`);
    try {
      if (cmd.file !== `stiker/keluar-${id}.webp`) throw new Error('jalur stiker tidak valid');
      if (cmd.gagal) {
        log(`⚠️ Konversi stiker ${id} gagal di app (${cmd.gagal}).`);
        return;
      }
      if (!sock) throw new Error('WA lagi nggak nyambung');
      const buf = fs.readFileSync(keluar);
      await sock.sendMessage(jidSendiri(sock), { sticker: buf, mimetype: 'image/webp' });
      papan.stiker += 1;
      log(`✅ Stiker terkirim (${Math.round(buf.length / 1024)} KB).`);
      emitStatus();
    } catch (e) {
      log(`⚠️ Stiker gagal dikirim (${id}): ${e.message}`);
    } finally {
      for (const b of [masuk, keluar]) {
        try { if (b) fs.unlinkSync(b); } catch { /* sudah kehapus */ }
      }
      ctx.tungguStiker?.delete(id);
    }
  }

  // -------------------------------- story ----------------------------------

  /** Penonton story: lihat ../story.mjs (pribadi dulu, grup cuma kalau diminta). */
  function penontonStory({ tagGrup } = {}) {
    return hitungPenonton(
      {
        storyKe: ctx.cfg?.jaga?.storyKe || [],
        anggota: ctx.state.grup?.anggota || [],
        grupAktif: Boolean(ctx.cfg?.grup?.aktif && ctx.cfg?.grup?.target),
      },
      { tagGrup }
    );
  }

  async function kirimStory(sock, m, { tagGrup } = {}) {
    const media = mediaPesan(m);
    if (!media) {
      await jawab(sock, 'Kirim FOTO/VIDEO dengan keterangan .story (atau .storygrup buat tag grup).');
      return;
    }
    const grupAktif = Boolean(ctx.cfg?.grup?.aktif && ctx.cfg?.grup?.target);
    // `.storygrup` cuma ngikutkan grup kalau Penjaga grup memang nyala; kalau
    // nggak, turun jadi `.story` (jangan kirim ke grup yang belum dicek).
    const daftar = penontonStory({ tagGrup: Boolean(tagGrup) && grupAktif });
    const pribadi = (ctx.cfg?.jaga?.storyKe || []).length;
    if (!daftar.length) {
      await jawab(sock, 'Belum ada penonton: isi daftar nomor story di app (tab Fitur, kartu Bot WA umum).');
      return;
    }
    try {
      const buf = await unduhMedia(sock, m);
      // Tanpa re-encode: yang dikirim byte aslinya, jadi kualitasnya tetap
      // seperti di HP. Baileys cuma bikin thumbnail kecil buat preview; file
      // yang diunggah tetap utuh (lihat prepareWAMessageMedia di messages.ts).
      const isi = media.jenis === 'gambar'
        ? { image: buf, caption: '' }
        : { video: buf, caption: '', mimetype: media.isi?.mimetype || 'video/mp4' };
      await sock.sendMessage('status@broadcast', isi, { statusJidList: daftar });
      papan.story += 1;
      const ket = keteranganPenonton(pribadi, daftar.length, {
        tagGrup: Boolean(tagGrup),
        grupAktif,
      });
      log(`📸 Story terkirim ke ${ket}.`);
      await jawab(sock, `Story terkirim ke ${ket}.`);
      emitStatus();
    } catch (e) {
      log(`⚠️ Story gagal: ${e.message}`);
      await jawab(sock, `Story gagal dikirim: ${e.message}`);
    }
  }

  return { mintaStiker, kirimStikerJadi, kirimStory, penontonStory };
}
