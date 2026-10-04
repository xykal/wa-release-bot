// Pertanyaan mood: beberapa kali sehari kirim pertanyaan ngejoks ke channel
// sebagai postingan "Pertanyaan" (follower bisa jawab privat ke admin).
// Mirror dari lagu-mood.mjs — jadwal acak lewat jadwalBerikut, tapi teks saja
// tanpa audio, dan memakai kirimKeChannel({ format: 'pertanyaan' }) yang sudah
// punya fallback aman ke teks biasa kalau fitur Pertanyaan ditolak server.
import { jadwalBerikut } from '../lagu.mjs';
import { acakPertanyaanLawak, formatPertanyaanLawak } from '../lawak.mjs';
import { kirimKeChannel } from '../wa.mjs';

/** @param {object} ctx konteks engine (lihat bot.mjs) @param {{ rilis: object }} deps modul rilis (cariTarget) */
export function buatLawakMood(ctx, { rilis }) {
  const { log, saveState, emitStatus, pakaiWA, sambung, lawakAktif, bridge } = ctx;

  function jadwalTanya(paksaMs) {
    clearTimeout(ctx.timerTanya);
    if (!ctx.running || !lawakAktif()) { ctx.nextTanyaAt = null; return; }
    const kini = Date.now();
    ctx.nextTanyaAt = paksaMs != null ? kini + paksaMs : jadwalBerikut(kini, {
      perHari: ctx.cfg.lawak.perHari,
      jamMulai: ctx.cfg.lawak.jamMulai,
      jamSelesai: ctx.cfg.lawak.jamSelesai,
      tzMenit: ctx.cfg.lawak.tzMenit,
    });
    ctx.timerTanya = setTimeout(() => { void runTanya('mood'); }, Math.max(1000, ctx.nextTanyaAt - kini));
    emitStatus();
  }

  let tanyaSibuk = false;
  async function runTanya(source) {
    if (tanyaSibuk) return;
    if (!ctx.cfg?.whatsapp?.channel) {
      log('❓ Pertanyaan mood nyala, tapi "Channel WA" masih kosong — nggak ada tujuan.');
      if (source !== 'manual') jadwalTanya();
      return;
    }
    tanyaSibuk = true;
    try {
      const q = acakPertanyaanLawak(ctx.state.lawak?.terbaru || []);
      const teks = formatPertanyaanLawak(q);
      let formatTerkirim = 'teks';
      await pakaiWA('tanya', async () => {
        const { sock, close } = await sambung();
        try {
          const jid = await rilis.cariTarget(sock);
          formatTerkirim = await kirimKeChannel(sock, jid, teks, { format: 'pertanyaan', log });
          // Napas bentar sebelum close — lihat catatan yang sama di lagu-mood.mjs.
          await new Promise((r) => setTimeout(r, 3000));
        } finally {
          close();
        }
      });
      ctx.state.lawak = ctx.state.lawak || { count: 0 };
      ctx.state.lawak.count = (ctx.state.lawak.count || 0) + 1;
      ctx.state.lawak.lastAt = new Date().toISOString();
      ctx.state.lawak.lastTanya = q;
      ctx.state.lawak.terbaru = [q, ...(ctx.state.lawak.terbaru || [])].slice(0, 12);
      saveState();
      log(`✅ Pertanyaan mood terkirim ke channel (format=${formatTerkirim}, tanya ke-${ctx.state.lawak.count}).`);
      bridge.send({ type: 'tanya_terkirim', teks: q });
    } catch (e) {
      log(`⚠️ Kirim pertanyaan mood gagal: ${e.message}`);
    } finally {
      tanyaSibuk = false;
      if (source !== 'manual' || ctx.running) jadwalTanya();
      emitStatus();
    }
  }

  return { jadwalTanya, runTanya };
}
