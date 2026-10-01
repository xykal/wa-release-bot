// Loop "jaga pesan": satu koneksi WhatsApp yang dibiarkan terbuka selama fitur
// Bot WA umum nyala. Dua tugasnya:
//   1. perintah pribadi di CHAT SENDIRI (.menu, .stiker, .story, ...) — sesuai
//      permintaan kall: perintah bot jangan di grup, cukup di chat sendiri;
//   2. moderasi grup yang dipantau: hapus link/phishing/promo, peringatan,
//      strike terakhir dikeluarkan. Admin & bot sendiri tidak pernah disentuh.
//
// Konsekuensinya satu: WA nyambung terus (beda dari penjaga grup yang cuma
// nyambung tiap N menit). Jadi saklarnya terpisah, bawaannya mati, dan app
// ngejelasin harganya (batre) di kartu Bot WA umum.
//
// Aksi per pesannya sendiri ada di mesin/aksi-pesan.mjs.

import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { menuTeks } from '../pesan.mjs';
import { sendText, jidSendiri } from '../wa.mjs';
import { identitas } from '../grup.mjs';
import { bacaTarget, JENIS } from '../channel.mjs';
import { buatAksiPesan, teksPesan } from './aksi-pesan.mjs';
import { buatAksiMedia } from './aksi-media.mjs';

export function buatJagaPesan(ctx) {
  const { log, emitStatus, sambung } = ctx;

  let jalan = false;      // loop lagi hidup
  let berhenti = false;   // diminta berhenti (engine stop / saklar dimatiin)
  let sockAktif = null;
  const papan = { dihapus: 0, peringatan: 0, kick: 0, perintah: 0, stiker: 0, story: 0 };

  /** Jabarkan media dari satu pesan. `downloadMediaMessage` itu fungsi Baileys
   *  (bukan method socket); `reuploadRequest` dikasih socket-nya supaya media
   *  yang kadaluarsa masih bisa ditarik ulang. */
  async function unduhMedia(sock, m) {
    return downloadMediaMessage(m, 'buffer', {}, {
      logger: { level: 'silent', child: () => ({ level: 'silent' }) },
      reuploadRequest: sock.updateMediaMessage,
    });
  }

  /** Kirim jawaban ke chat sendiri (perintah pribadi tidak pernah dijawab di grup). */
  async function jawab(sock, teks) {
    const jid = jidSendiri(sock);
    if (!jid) return;
    try {
      await sendText(sock, jid, teks);
    } catch (e) {
      log(`⚠️ Nggak bisa balas di chat sendiri: ${e.message}`);
    }
  }

  const media = buatAksiMedia(ctx, { log, jawab, unduhMedia, papan, emitStatus });
  const aksi = buatAksiPesan(ctx, {
    log,
    saveState: ctx.saveState,
    emitStatus,
    jawab,
    adminDi,
    papan,
    media,
    rekam: ctx.fitur?.rekam || null,
  });

  /** Grup yang dimoderasi = grup yang sama dengan Penjaga grup. */
  function grupDipantau() {
    const t = bacaTarget(String(ctx.cfg?.grup?.target || '').trim());
    return t.jenis === JENIS.GRUP ? t.nilai : null;
  }

  /** Cek admin, di-cache per (grup, orang) biar metadata nggak ditarik tiap pesan. */
  const adminCache = new Map();
  async function adminDi(jidGrup, pengirim) {
    const kunci = `${jidGrup}|${pengirim}`;
    if (adminCache.has(kunci)) return adminCache.get(kunci);
    let admin = false;
    try {
      const meta = await sockAktif.groupMetadata(jidGrup);
      const target = identitas({ id: pengirim, lid: pengirim });
      admin = Boolean(
        meta.participants.find((p) => identitas(p).some((i) => target.includes(i)))?.admin
      );
      const g = ctx.state.grup || (ctx.state.grup = {});
      g.nama = g.nama || meta.subject;
      g.anggota = meta.participants;
    } catch {
      // Metadata gagal: anggap bukan admin (aman: peringatan dulu, bukan kick).
    }
    adminCache.set(kunci, admin);
    return admin;
  }

  /** Satu koneksi WA yang dipakai terus sampai putus / diminta berhenti. */
  async function satuSesi() {
    const { sock, close } = await sambung({ onStatus: (m) => log(m) });
    sockAktif = sock;
    // Rekam postingan channel (kalau diminta `.rekam on`) nempel di socket ini.
    try { ctx.fitur?.rekam?.pasang(sock); } catch (e) { log(`⚠️ Rekam channel nggak kepasang: ${e.message}`); }
    const jidSaya = jidSendiri(sock);
    log(
      `👀 Mode jaga pesan nyala (perintah: ${aksi.aktifPerintah() ? 'ya' : 'tidak'}, ` +
      `moderasi: ${aksi.aktifModerasi() ? 'ya' : 'tidak'}) — makan batre lebih, matikan kalau nggak dipakai.`
    );

    await new Promise((resolve) => {
      sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (berhenti) return;
        if (type !== 'notify' && type !== 'append') return;
        for (const m of messages || []) {
          try {
            const jidChat = m.key?.remoteJid || '';
            const grupTarget = grupDipantau();

            // 1. perintah pribadi: cuma di chat sendiri.
            if (aksi.aktifPerintah() && jidSaya && jidChat === jidSaya) {
              await aksi.tanganiPerintah(sock, m, teksPesan(m));
              continue;
            }

            // 2. moderasi: cuma di grup yang dipantau, dan bukan pesan sendiri.
            if (aksi.aktifModerasi() && jidChat.endsWith('@g.us') && jidChat === grupTarget && !m.key?.fromMe) {
              await aksi.tanganiGrup(sock, m, jidChat);
            }
          } catch (e) {
            log(`⚠️ Gagal proses satu pesan: ${e.message}`);
          }
        }
      });
      sock.ev.on('connection.update', ({ connection }) => {
        if (connection === 'close') {
          log('🔌 Koneksi jaga pesan putus, nyambung ulang...');
          resolve();
        }
      });
    });

    try { close(); } catch { /* socket sudah tertutup */ }
    sockAktif = null;
  }

  /**
   * Nyalain mode jaga pesan. Kalau koneksi putus, disambung ulang dengan jeda
   * naik (2 dtk x2 sampai maksimal 1 menit) — kecuali WA belum ditautkan, itu
   * berhenti tenang: user nyalain lagi setelah nautin.
   */
  async function mulai() {
    if (jalan) return;
    if (!aksi.aktifModerasi() && !aksi.aktifPerintah()) return;
    jalan = true;
    berhenti = false;
    let jeda = 2000;
    while (!berhenti) {
      try {
        await satuSesi();
        jeda = 2000;
      } catch (e) {
        if (e?.code === 'BELUM_TAUT') {
          log('ℹ️ Mode jaga pesan nunggu WA ditautkan dulu (Tautkan WhatsApp di app), terus nyalain lagi.');
          break;
        }
        log(`⚠️ Mode jaga pesan galat: ${e.message}`);
      }
      if (berhenti) break;
      await new Promise((r) => setTimeout(r, jeda));
      jeda = Math.min(jeda * 2, 60000);
    }
    jalan = false;
    sockAktif = null;
    log('🛑 Mode jaga pesan berhenti.');
    emitStatus();
  }

  function hentikan() {
    berhenti = true;
    try { sockAktif?.end(undefined); } catch { /* socket sudah tertutup */ }
    sockAktif = null;
  }

  /** Tombol "Kirim menu ke chat" di app. */
  async function kirimMenuSekarang() {
    if (!sockAktif) {
      log('⚠️ Menu nggak dikirim: WA belum nyambung. Nyalain engine + mode jaga dulu.');
      return false;
    }
    await jawab(sockAktif, menuTeks(ctx.cfg?.brand?.nama || 'WA Release Bot'));
    log('📨 Menu dikirim ke chat sendiri.');
    return true;
  }

  return {
    mulai,
    hentikan,
    hitung: () => ({ ...papan }),
    bersihkanHitungan: aksi.bersihkanHitungan,
    penontonStory: media.penontonStory,
    kirimStikerJadi: (cmd) => media.kirimStikerJadi(cmd, sockAktif),
    kirimMenuSekarang,
    aktifModerasi: aksi.aktifModerasi,
    aktifPerintah: aksi.aktifPerintah,
    sedangJalan: () => jalan,
  };
}
