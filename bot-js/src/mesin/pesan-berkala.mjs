// Pengirim pesan berkala ke grup yang dipantau (mis. daftar hitam).
//
// Kenapa ini nggak numpang penjaga grup: penjaga grup nyambung tiap N menit
// (batre hemat), sedangkan jadwal di sini hitungan jam. Jadi socket dibuka
// sekali per pesan, kirim, lalu tutup — tetap hemat, dan nggak nambah koneksi
// yang nyala terus seperti mode jaga pesan.
//
// Isi pesannya sendiri disusun berkala.mjs (murni, ada unit test-nya).

import { sendText } from '../wa.mjs';
import { bacaTarget, JENIS } from '../channel.mjs';
import { kelompokHitam } from '../grup.mjs';
import { jatuhTempo, jelaskanInterval, teksBerkala } from '../berkala.mjs';

export function buatPesanBerkala(ctx, { grup }) {
  const { log, saveState, emitStatus, pakaiWA, sambung, bridge } = ctx;
  let timer = null;

  const aktif = () => Boolean(ctx.cfg?.berkala?.aktif);
  const intervalJam = () => jelaskanInterval(ctx.cfg?.berkala?.intervalJam ?? 12);

  function intervalMs() {
    return intervalJam() * 3_600_000;
  }

  /** JID grup: pakai yang sudah diketahui penjaga grup; kalau belum, hitung dari target. */
  async function jidGrup(sock) {
    const g = ctx.state.grup || (ctx.state.grup = {});
    if (g.jid) return g.jid;
    const t = bacaTarget(String(ctx.cfg?.grup?.target || '').trim());
    let jid = null;
    if (t.jenis === JENIS.GRUP) jid = t.nilai;
    else if (t.jenis === JENIS.LINK_GRUP) jid = (await sock.groupGetInviteInfo(t.nilai))?.id || null;
    if (!jid) throw new Error('Grup-nya belum kebaca. Isi link undangan grup di kartu Penjaga grup dulu.');
    g.jid = jid;
    return jid;
  }

  /**
   * Kirim sekarang juga. `paksa` = true dipakai tombol "Kirim sekarang" di app
   * (nggak nunggu jadwal), sedangkan jadwal otomatis lewat jatuhTempo().
   */
  async function kirimSekarang({ paksa = false, sumber = 'jadwal' } = {}) {
    if (!ctx.running && !paksa) return false;
    if (!aktif() && !paksa) return false;
    if (ctx.busy) {
      // Jangan rebutan socket dengan tugas lain; jadwalnya diulang nanti.
      log('⏳ Pesan berkala ditunda: ada tugas lain yang lagi pakai WhatsApp.');
      return false;
    }
    const g = ctx.state.grup || {};
    if (!grup.aktif()) {
      log('⚠️ Pesan berkala nggak dikirim: Penjaga grup belum nyala.');
      return false;
    }
    const kustom = String(ctx.cfg?.berkala?.teks || '').trim();
    const hitam = kustom ? [] : kelompokHitam(g.hitam || [], g.hitamInfo || []);
    const manual = kustom ? [] : String(ctx.cfg?.grup?.daftarHitam || '')
      .split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    const teks = teksBerkala({ namaGrup: g.nama, hitam, manual, teksKustom: kustom });

    try {
      const hasil = await pakaiWA('berkala', async () => {
        const { sock, close } = await sambung({ onStatus: () => {} });
        try {
          const jid = await jidGrup(sock);
          await sendText(sock, jid, teks);
          return jid;
        } finally {
          try { close(); } catch { /* socket sudah tertutup */ }
        }
      });
      ctx.state.berkala = {
        lastAt: Date.now(),
        count: (ctx.state.berkala?.count || 0) + 1,
        terakhir: kustom ? 'teks sendiri' : `${hitam.length + manual.length} nomor`,
      };
      saveState();
      log(`📣 Pesan berkala (${sumber}) ke ${g.nama || hasil || 'grup'}: ${ctx.state.berkala.terakhir}.`);
      emitStatus();
      return true;
    } catch (e) {
      log(`⚠️ Pesan berkala gagal: ${e.message}`);
      emitStatus();
      return false;
    }
  }

  /** Jadwal berikutnya. Dipanggil start engine, selesai configure, dan tiap selesai kirim. */
  function jadwal(delayMs) {
    clearTimeout(timer);
    timer = null;
    if (!ctx.running || !aktif() || !grup.aktif()) {
      ctx.nextBerkalaAt = null;
      emitStatus();
      return;
    }
    // Belum pernah kirim → jangan langsung (bisa barengan dengan start), tapi
    // sekitar satu menit setelah engine nyala; sesudah itu pakai jeda penuh.
    const pernah = ctx.state.berkala?.lastAt;
    const jeda = pernah ? intervalMs() : Math.max(Number(delayMs) || 0, 60_000);
    ctx.nextBerkalaAt = Date.now() + jeda;
    timer = setTimeout(() => { void siklus(); }, jeda);
  }

  async function siklus() {
    const terkirim = await kirimSekarang({ sumber: 'jadwal' });
    if (terkirim || !jatuhTempo({ lastAt: ctx.state.berkala?.lastAt, intervalJam: intervalJam() })) {
      jadwal(intervalMs());
    } else {
      // Gagal kirim (mis. WA putus) → coba lagi lebih cepat, jangan nunggu 12 jam.
      log('↩️ Pesan berkala dicoba lagi 10 menit lagi.');
      jadwal(10 * 60_000);
    }
  }

  function hentikan() {
    clearTimeout(timer);
    timer = null;
    ctx.nextBerkalaAt = null;
  }

  return { jadwal, hentikan, kirimSekarang, aktif, intervalJam, intervalMs };
}
