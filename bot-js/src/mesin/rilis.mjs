// Cek release GitHub + posting ke channel: inti "bot tidur" (bangun, cek,
// posting kalau ada yang baru, tidur lagi). Keadaan bersama ada di `ctx`
// (bot.mjs); modul ini hanya mengubah ctx.busy/lastCheckAt/nextCheckAt dan
// state per repo lewat stateRepo().
import { fetchLatestRelease } from '../github.mjs';
import { resolveChannel, kirimKeChannel as kirimWA, pakaiPertanyaan, laporKeDiri } from '../wa.mjs';
import { putuskanRilis, pendingBerikut, MAKS_PERCOBAAN } from '../rilis.mjs';
import { stateRepo, channelRepo } from '../repo.mjs';
import { JENIS } from '../channel.mjs';
import { formatReleasePost, formatLaporGagal } from '../format.mjs';

/** @param {object} ctx konteks engine (lihat bot.mjs) */
export function buatRilis(ctx) {
  const { log, saveState, emitStatus, pakaiWA, sambung, repos, repoAda, scheduleNext, intervalMs, bridge } = ctx;

  async function runCheck(source) {
    if (ctx.busy || !ctx.cfg || !repoAda()) return;
    ctx.busy = true;
    ctx.lastCheckAt = Date.now();
    emitStatus();
    const manual = source === 'manual';
    try {
      // Berurutan, bukan Promise.all: satu socket WA saja yang boleh hidup,
      // dan repo yang error tidak boleh menggagalkan repo lain.
      for (const repo of repos()) {
        try {
          await cekSatuRepo(repo, { source, manual });
        } catch (e) {
          log(`⚠️ Gagal cek ${repo}: ${e.message}`);
        }
      }
    } finally {
      ctx.busy = false;
      if (ctx.running) scheduleNext(intervalMs());
      else ctx.nextCheckAt = null;
      emitStatus();
    }
  }

  async function cekSatuRepo(repo, { source, manual }) {
    const st = stateRepo(ctx.state, repo);
    const nama = repos().length > 1 ? `${repo}: ` : '';
    log(`👀 Cek GitHub ${repo} ... (trigger: ${source})`);
    const rel = await fetchLatestRelease(repo, {
      token: ctx.cfg.github?.token || '',
      includePrereleases: Boolean(ctx.cfg.github?.includePrereleases),
      etag: st.rilisEtag || '',
    });
    if (!rel.notModified && rel.etag && rel.etag !== st.rilisEtag) {
      st.rilisEtag = rel.etag;
      saveState();
    }

    const { aksi, alasan } = putuskanRilis({ state: st, rel, postOnFirstRun: Boolean(ctx.cfg.bot?.postOnFirstRun), manual });
    switch (aksi) {
      case 'tidur':
        log(`😴 ${nama}Nggak ada update (${alasan}). Bot tidur lagi.`);
        return;
      case 'baseline':
        st.lastTag = rel.tag;
        saveState();
        log(`🌱 ${nama}First run. Baseline dicatat: ${rel.tag}. Baru post kalau ada yang lebih baru.`);
        return;
      case 'rollback':
        st.lastTag = rel.tag;
        st.pending = null;
        saveState();
        log(`↩️ ${nama}Release terbaru di GitHub sekarang ${rel.tag} (${alasan}) — dianggap rollback, nggak diumumkan.`);
        return;
      case 'lewati-gagal':
        log(`⏭️ ${nama}${alasan}. Dilewati sampai lo tekan "Cek sekarang" (itu ngulang dari nol).`);
        return;
      default:
        log(st.lastTag ? `🚀 ${nama}ADA RELEASE BARU! ${alasan}` : `✨ ${nama}${alasan} → posting release yang sedang ada.`);
        await postRelease(repo, st, rel, { manual });
    }
  }

  /**
   * Cari JID channel/grup tujuan posting. Hasilnya di-cache di ctx.state supaya
   * nggak query WhatsApp terus tiap mau posting.
   */
  async function cariTarget(sock, channel = ctx.cfg.whatsapp?.channel) {
    const utama = channel === ctx.cfg.whatsapp?.channel;
    if (!utama) {
      // channel khusus repo (repo.mjs PEMISAH_CHANNEL): cache per channel, tidak
      // menyentuh channelJid utama supaya tombol tes/bikin channel tetap seperti biasa
      ctx.state.targetLain ||= {};
      if (ctx.state.targetLain[channel]?.jid) return ctx.state.targetLain[channel].jid;
    }
    let jid = utama ? ctx.state.channelJid : null;
    if (jid) return jid;

    const hasil = await resolveChannel(sock, channel, log);
    jid = hasil.jid;
    if (utama) {
      ctx.state.channelJid = jid;
      ctx.state.channelName = hasil.nama;
    } else {
      ctx.state.targetLain[channel] = { jid, nama: hasil.nama };
    }
    saveState();

    const subs = hasil.subscribers != null ? `, ${hasil.subscribers} subscriber` : '';
    log(`📡 Target ketemu: ${hasil.nama || '(tanpa nama)'} → ${jid}${subs}`);
    if (hasil.jenis === JENIS.GRUP) log('ℹ️ Target-nya GRUP WA, bukan channel. Pesan bakal masuk ke grup itu.');
    return jid;
  }

  // Format pesan ke channel: default 'teks'. 'pertanyaan' opt-in dari setelan
  // app — formatnya belum terbukti (lihat catatan di wa.mjs sendPertanyaan).
  const formatPertanyaan = () => ctx.cfg?.whatsapp?.format === 'pertanyaan';

  async function kirimKeChannel(sock, jid, text) {
    await kirimWA(sock, jid, text, { format: formatPertanyaan() ? 'pertanyaan' : 'teks', log });
  }
  const ajak = (jid) => ({ ajakBalas: pakaiPertanyaan(jid, formatPertanyaan() ? 'pertanyaan' : 'teks') });

  async function postRelease(repo, st, rel, { manual = false } = {}) {
    // channel khusus repo (kalau diisi di layar Repo) menang atas channel utama
    const channel = channelRepo(ctx.cfg.github?.repo, repo) || ctx.cfg.whatsapp?.channel;
    if (!channel) {
      log('⚠️ Ada release baru tapi "Channel WA" masih kosong — nggak ada tujuan posting.');
      return;
    }
    // Write-ahead: kalau proses mati di tengah kirim, cek berikutnya tahu
    // percobaan ke berapa ini dan berhenti setelah MAKS_PERCOBAAN.
    st.pending = pendingBerikut(st.pending, rel.tag, { manual });
    saveState();
    const ke = st.pending.percobaan;
    if (ke > 1) log(`🔁 Kirim ${repo} ${rel.tag} percobaan ke-${ke} dari ${MAKS_PERCOBAAN}.`);
    try {
      await pakaiWA('posting', async () => {
        const { sock, close } = await sambung();
        try {
          try {
            const jid = await cariTarget(sock, channel);
            await kirimKeChannel(sock, jid, formatReleasePost(rel, repo, ajak(jid)));
          } catch (e) {
            // Percobaan terakhir gagal: channel tidak dapat pesan, tapi pemilik
            // bot dikasih tahu lewat chat ke diri sendiri (socket masih ada).
            if (ke >= MAKS_PERCOBAAN) {
              await laporKeDiri(sock, formatLaporGagal({ tag: rel.tag, repo, percobaan: ke, maks: MAKS_PERCOBAAN, error: e.message }), log);
            }
            throw e;
          }
          st.lastTag = rel.tag;
          st.pending = null;
          ctx.state.lastPostedAt = new Date().toISOString();
          ctx.state.postCount = (ctx.state.postCount || 0) + 1;
          saveState();
          log(`✅ POSTINGAN TERKIRIM ke channel! (postingan ke-${ctx.state.postCount})`);
          bridge.send({ type: 'posted', tag: rel.tag, repo, count: ctx.state.postCount });
        } finally {
          close();
        }
      });
    } catch (e) {
      // Termasuk gagal nyambung WA (belum ada socket buat laporKeDiri):
      // app tetap dapat notifikasi Android lewat BotService.
      if (ke >= MAKS_PERCOBAAN) {
        bridge.send({ type: 'gagal_kirim', tag: rel.tag, repo, percobaan: ke, maks: MAKS_PERCOBAAN, error: String(e?.message || e).slice(0, 300) });
      }
      throw e;
    }
  }

  return { runCheck, cekSatuRepo, cariTarget, kirimKeChannel, ajak, postRelease, formatPertanyaan };
}
