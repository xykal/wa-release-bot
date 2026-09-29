// Lagu mood: beberapa kali sehari kirim potongan lagu (voice note) + caption
// ke channel utama. Dipisah dari bot.mjs supaya alur "cek release" tidak
// bercampur dengan urusan audio; semua keadaan bersama (cfg, state, jadwal)
// tetap satu di `ctx` milik bot.mjs, modul ini cuma memakainya.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { SUMBER_BAWAAN, jadwalBerikut, formatKataLagu, ambilBerikut, ambilBatas, downloadPotongan } from '../lagu.mjs';
import { mp3KeVoiceNote } from '../opus.mjs';
import { sendText } from '../wa.mjs';

/** @param {object} ctx konteks engine (lihat bot.mjs) @param {{ rilis: object }} deps modul rilis (cariTarget) */
export function buatLaguMood(ctx, { rilis }) {
  const { log, saveState, emitStatus, pakaiWA, sambung, laguAktif, dirLaguTmp, bridge } = ctx;

  function jadwalLagu(paksaMs) {
    clearTimeout(ctx.timerLagu);
    if (!ctx.running || !laguAktif()) { ctx.nextLaguAt = null; return; }
    const kini = Date.now();
    ctx.nextLaguAt = paksaMs != null ? kini + paksaMs : jadwalBerikut(kini, {
      perHari: ctx.cfg.lagu.perHari,
      jamMulai: ctx.cfg.lagu.jamMulai,
      jamSelesai: ctx.cfg.lagu.jamSelesai,
      tzMenit: ctx.cfg.lagu.tzMenit,
    });
    // setTimeout maksimal ~24,8 hari; jadwal lagu nggak pernah selama itu
    ctx.timerLagu = setTimeout(() => { void runLagu('mood'); }, Math.max(1000, ctx.nextLaguAt - kini));
    emitStatus();
  }

  let laguSibuk = false;
  async function runLagu(source) {
    if (laguSibuk) return;
    if (!ctx.cfg?.whatsapp?.channel) {
      log('🎵 Lagu mood nyala, tapi "Channel WA" masih kosong — nggak ada tujuan.');
      if (source !== 'manual') jadwalLagu();
      return;
    }
    laguSibuk = true;
    const sumber = ctx.cfg.lagu?.sumber || SUMBER_BAWAAN;
    let file = null;
    try {
      log(`🎵 Lagi mood nih… minta lagu ke Cloudflare (${source}).`);
      if (!ctx.state.pemasangId) { ctx.state.pemasangId = randomUUID(); saveState(); }
      const lagu = await ambilBerikut(sumber, { pemasang: ctx.state.pemasangId }).catch((e) => {
        throw new Error('minta lagu ke Cloudflare gagal: ' + e.message, { cause: e });
      });
      const { data, detik } = await downloadPotongan(lagu.url, lagu).catch((e) => {
        throw new Error(`download potongan "${lagu.judul}" gagal: ` + e.message, { cause: e });
      });
      // File sementara — langsung dihapus begitu kekirim (atau gagal).
      log(`🎵 Dapet: ${lagu.judul} — ${lagu.artis} (potongan ${detik} dtk, ${Math.round(data.length / 1024)} KB)`);
      // Saluran WA cuma nerima voice note (Ogg Opus) — MP3 biasa tampil
      // "tidak didukung". Jadi diubah dulu di HP (WASM, tanpa ffmpeg).
      // (Nggak ada cadangan MP3: di saluran MP3 cuma bakal jadi "tidak didukung".)
      const t0 = Date.now();
      const vn = await mp3KeVoiceNote(data).catch((e) => {
        throw new Error('gagal ngubah ke voice note: ' + e.message, { cause: e });
      });
      const isi = vn.data;
      const pesanAudio = { mimetype: 'audio/ogg; codecs=opus', seconds: vn.detik, ptt: true };
      log(`🎙️ Diubah jadi voice note (${Math.round(isi.length / 1024)} KB, ${((Date.now() - t0) / 1000).toFixed(1)} dtk).`);
      fs.mkdirSync(dirLaguTmp, { recursive: true });
      file = path.join(dirLaguTmp, `lagu-${Date.now()}.ogg`);
      fs.writeFileSync(file, isi);
      await pakaiWA('lagu', async () => {
        const { sock, close } = await sambung();
        try {
          const jid = await rilis.cariTarget(sock);
          await sendText(sock, jid, formatKataLagu(lagu));
          await sock.sendMessage(jid, { audio: { url: file }, ...pesanAudio });
          // Kasih napas bentar sebelum socket ditutup: upload/ack yang masih
          // jalan di belakang kalau diputus paksa suka lempar "Connection Closed".
          await new Promise((r) => setTimeout(r, 3000));
        } finally {
          close();
        }
      });
      ctx.state.lagu = ctx.state.lagu || { count: 0 };
      ctx.state.lagu.count = (ctx.state.lagu.count || 0) + 1;
      ctx.state.lagu.lastAt = new Date().toISOString();
      ctx.state.lagu.lastJudul = `${lagu.judul} — ${lagu.artis}`;
      delete ctx.state.lagu.terkirim;
      saveState();
      log(`✅ Lagu terkirim ke channel: ${lagu.judul} (lagu ke-${ctx.state.lagu.count})`);
      bridge.send({ type: 'lagu_terkirim', judul: ctx.state.lagu.lastJudul });
    } catch (e) {
      log(`⚠️ Kirim lagu gagal: ${e.message}`);
    } finally {
      if (file) {
        try { fs.rmSync(file, { force: true }); log('🧹 File lagu dihapus dari HP.'); } catch { /* ignore */ }
      }
      // Sisa jatah hari ini buat ditampilkan di app; gagal pun tidak apa-apa.
      try {
        const b = await ambilBatas(sumber, { pemasang: ctx.state.pemasangId });
        ctx.state.lagu = { ...(ctx.state.lagu || { count: 0 }), jatah: { hari: b.hari, pemasang: b.pemasang, global: b.global } };
        saveState();
      } catch { /* opsional */ }
      laguSibuk = false;
      if (source !== 'manual' || ctx.running) jadwalLagu();
      emitStatus();
    }
  }

  return { jadwalLagu, runLagu };
}
