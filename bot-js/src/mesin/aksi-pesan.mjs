// Aksi yang jalan waktu ada pesan WA masuk: perintah pribadi di chat sendiri
// dan penindakan moderasi grup. Semua kiriman balik ke WhatsApp ada di sini;
// loop koneksinya di mesin/jaga-pesan.mjs. Dipisah supaya dua berkas tetap
// di bawah ~250 baris dan logikanya gampang diuji.

import { bacaPerintah, nilaiPesan, hukumanModerasi, menuTeks } from '../pesan.mjs';
import { sendText } from '../wa.mjs';
import { identitas, kelompokHitam } from '../grup.mjs';
import { pilihIsi, teksBerkala } from '../berkala.mjs';
import { formatWaktu } from '../waktu.mjs';

/** Teks dari semua bentuk pesan yang kita pedulikan. */
export function teksPesan(m) {
  const msg = m?.message || {};
  return (
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    msg.documentMessage?.caption ||
    msg.stickerMessage?.caption ||
    ''
  );
}

/** Media apa yang ikut pesan ini (buat stiker & story). */
export function mediaPesan(m) {
  const msg = m?.message || {};
  if (msg.imageMessage) return { jenis: 'gambar', isi: msg.imageMessage };
  if (msg.videoMessage) return { jenis: 'video', isi: msg.videoMessage };
  return null;
}

/**
 * @param {object} ctx konteks engine (cfg, state, running, tungguStiker)
 * @param {{
 *   log: Function, saveState: Function, emitStatus: Function,
 *   jawab: (sock: object, teks: string) => Promise<void>,
 *   unduhMedia: (sock: object, m: object) => Promise<Buffer>,
 *   adminDi: (jidGrup: string, pengirim: string) => Promise<boolean>,
 *   papan: object,
 *   media: { mintaStiker: Function, kirimStory: Function },
 *   rekam?: { nyalakan: Function, matikan: Function, kosongkan: Function, kirimKe: Function, ringkas: Function }
 * }} alat
 */
export function buatAksiPesan(ctx, alat) {
  const { log, saveState, emitStatus, jawab, adminDi, papan, media, rekam } = alat;

  const aktifModerasi = () => Boolean(ctx.cfg?.jaga?.moderasi);
  const aktifPerintah = () => Boolean(ctx.cfg?.jaga?.perintah);

  // ------------------------------- moderasi --------------------------------

  async function tanganiGrup(sock, m, jidGrup) {
    const g = ctx.state.grup || (ctx.state.grup = {});
    const pengirim = m.key?.participant || m.key?.remoteJid || '';
    const saya = identitas({ id: sock.user?.id, lid: sock.user?.lid });

    const hasil = nilaiPesan({
      teks: teksPesan(m),
      dariSaya: identitas(m.key).some((i) => saya.includes(i)),
      dariAdmin: await adminDi(jidGrup, pengirim),
      adaMedia: Boolean(mediaPesan(m)),
      kataTambahan: ctx.cfg?.jaga?.kataTerlarang || [],
      linkDilarang: ctx.cfg?.jaga?.linkTerlarang || [],
      izinkanLink: Boolean(ctx.cfg?.jaga?.izinkanLink),
    });
    if (hasil.aksi === 'abaikan') return;

    const putusan = hukumanModerasi({
      strikeSebelumnya: g.strike?.[pengirim] || 0,
      batasStrike: ctx.cfg?.jaga?.batasStrike || 2,
      kategori: hasil.kategori,
    });
    g.strike = { ...(g.strike || {}), [pengirim]: putusan.strike };

    // Hapus kirimannya. Kalau bot bukan admin, WA bakal nolak — dilaporkan
    // sekali saja biar log nggak dibanjiri orang yang sama.
    try {
      await sock.sendMessage(jidGrup, { delete: m.key });
      papan.dihapus += 1;
    } catch (e) {
      log(`⚠️ Nggak bisa hapus pesan di grup (bot harus admin): ${e.message}`);
    }

    if (putusan.hukuman === 'kick') {
      try {
        await sock.groupParticipantsUpdate(jidGrup, [pengirim], 'remove');
        papan.kick += 1;
        log(`⛔ ${pengirim.split('@')[0]} dikeluarkan: ${hasil.alasan} (strike ${putusan.strike}).`);
        await sendText(sock, jidGrup, `⛔ Dikeluarkan: ${putusan.teks}`);
      } catch (e) {
        log(`⚠️ Nggak bisa keluarin ${pengirim.split('@')[0]}: ${e.message}`);
      }
    } else {
      papan.peringatan += 1;
      log(`🧹 Pesan dihapus: ${hasil.alasan} (strike ${putusan.strike}).`);
      await sendText(sock, jidGrup, `🧹 ${putusan.teks}`);
    }
    saveState();
    emitStatus();
  }

  // ---------------------------- perintah pribadi ---------------------------

  async function tanganiPerintah(sock, m, teks) {
    const p = bacaPerintah(teks);
    if (!p || !p.dikenal) {
      if (p) await jawab(sock, `Perintah .${p.nama} nggak dikenal. Ketik .menu buat daftarnya.`);
      return;
    }
    papan.perintah += 1;

    switch (p.nama) {
      case 'menu':
      case 'bantu':
        await jawab(sock, menuTeks(ctx.cfg?.brand?.nama || 'WA Release Bot'));
        break;

      case 'ping':
        await jawab(sock, `Pong. Engine ${ctx.running ? 'jalan' : 'jeda'}, ${formatWaktu(Date.now())}.`);
        break;

      case 'status': {
        const s = ctx.state || {};
        await jawab(sock, [
          'Status bot:',
          `• Engine: ${ctx.running ? 'jalan' : 'jeda'}`,
          `• Repo: ${ctx.cfg?.github?.repo || '-'}`,
          `• Rilis terakhir: ${s.rilis?.lastTag || '-'}`,
          `• Penjaga grup: ${ctx.cfg?.grup?.aktif ? (s.grup?.nama || 'nyala') : 'mati'}`,
          `• Moderasi: ${aktifModerasi() ? `nyala (hapus ${papan.dihapus}, kick ${papan.kick})` : 'mati'}`,
        ].join('\n'));
        break;
      }

      case 'brat':
        await media.buatBrat(sock, p.arg);
        break;

      case 'stiker':
        await media.mintaStiker(sock, m);
        break;

      case 'welcome': {
        const mode = String(p.arg || '').toLowerCase().split(/\s+/)[0] || '';
        ctx.state = ctx.state || {};
        if (mode === 'on' || mode === 'nyala') {
          if (!ctx.cfg?.grup?.aktif || !ctx.cfg?.grup?.target) {
            await jawab(sock, 'Nyalain dan pilih Grup yang dipantau dulu di pengaturan.');
            break;
          }
          ctx.state.welcomeAktif = true;
          await saveState();
          await jawab(sock, 'Pesan sambutan NYALA hanya di grup yang dipantau.');
        } else if (mode === 'off' || mode === 'mati') {
          ctx.state.welcomeAktif = false;
          await saveState();
          await jawab(sock, 'Pesan sambutan mati.');
        } else {
          await jawab(sock, `Pesan sambutan ${ctx.state.welcomeAktif ? 'NYALA' : 'mati'}; pakai .welcome on/off.`);
        }
        break;
      }

      case 'story':
      case 'storygrup':
        await media.kirimStory(sock, m, { tagGrup: p.nama === 'storygrup' });
        break;

      case 'rekam': {
        if (!rekam) {
          await jawab(sock, 'Fitur rekam channel nggak kepasang di engine ini.');
          break;
        }
        const arg = String(p.arg || '').toLowerCase().split(/\s+/)[0] || '';
        if (arg === 'on' || arg === 'nyala') {
          rekam.nyalakan();
          await jawab(sock, [
            'Rekam channel NYALA.',
            'Publikasikan postingan baru di channel (mis. Pertanyaan); rekaman tersimpan otomatis.',
            'Ketik .rekam kirim kalau perlu lihat lokasi file ekspornya.',
          ].join('\n'));
        } else if (arg === 'off' || arg === 'mati') {
          rekam.matikan();
          await jawab(sock, 'Rekam channel mati.');
        } else if (arg === 'kirim' || arg === 'unduh') {
          const hasil = await rekam.kirimKe(sock);
          if (!hasil.ok) await jawab(sock, `Rekaman nggak tersedia: ${hasil.alasan}`);
          else if (hasil.lokasi) await jawab(sock, `Rekaman sudah disimpan di ${hasil.lokasi}`);
        } else if (arg === 'kosong' || arg === 'hapus') {
          rekam.kosongkan();
          await jawab(sock, 'Rekaman channel dikosongkan.');
        } else {
          const r = rekam.ringkas();
          await jawab(sock, [
            `Rekam channel: ${r.aktif ? 'NYALA' : 'mati'} — ${r.jumlah} postingan tersimpan` +
              (r.terakhir ? `, terakhir ${formatWaktu(r.terakhir)}` : '') + '.',
            'Pakai: .rekam on | .rekam off | .rekam kirim | .rekam kosong',
          ].join('\n'));
        }
        break;
      }

      case 'berkala': {
        const berkala = ctx.fitur?.berkala;
        const arg = String(p.arg || '').toLowerCase().split(/\s+/)[0] || '';
        if (arg === 'kirim' || arg === 'sekarang') {
          if (!berkala) {
            await jawab(sock, 'Fitur pesan berkala nggak kepasang di engine ini.');
            break;
          }
          // Dikirim lewat socket mode jaga yang lagi kebuka: nggak buka
          // koneksi kedua (dua socket sesi sama = WA nendang salah satunya).
          const ok = await berkala.kirimSekarang({ paksa: true, sumber: 'chat', sock });
          await jawab(sock, ok
            ? 'Pesan berkala dikirim ke grup sekarang.'
            : 'Nggak terkirim — cek Penjaga grup nyala dan link grup udah bener.');
          break;
        }
        if (arg === 'kustom' && berkala) {
          await jawab(sock, [
            'Isi pesan berkala di app, tab Fitur, kartu Pesan berkala:',
            'kalau kolom teksnya diisi, yang dikirim teks itu; kalau kosong,',
            'daftar hitam grup yang dikirim (versi yang barusan kamu lihat).',
          ].join('\n'));
          break;
        }
        const { teks, mode } = teksBerkalaSekarang();
        await jawab(sock, [
          `Isi pesan berkala sekarang: ${mode === 'teks' ? 'teks sendiri' : 'daftar hitam grup'}.`,
          '',
          teks,
          '',
          'Ketik .berkala kirim buat ngirim versi ini ke grup sekarang.',
        ].join('\n'));
        break;
      }

      case 'grup': {
        const g = ctx.state.grup || {};
        await jawab(sock, [
          `Grup dipantau: ${g.nama || '(belum dicek)'}`,
          `• Anggota: ${(g.anggota || []).length}`,
          `• Daftar hitam: ${(g.hitam || []).length}`,
          `• Moderasi: ${aktifModerasi() ? 'nyala' : 'mati'}`,
          `• Pesan dihapus hari ini: ${papan.dihapus}`,
        ].join('\n'));
        break;
      }

      case 'bersih':
        bersihkanHitungan();
        await jawab(sock, 'Hitungan moderasi dikosongkan.');
        break;

      default:
        await jawab(sock, 'Perintahnya belum diimplementasi.');
    }
  }

  /** Teks pesan berkala apa adanya (daftar hitam atau teks sendiri) tanpa kirim. */
  function teksBerkalaSekarang() {
    const g = ctx.state.grup || {};
    const { kustom, mode } = pilihIsi({
      hitamSaja: Boolean(ctx.cfg?.berkala?.hitamSaja),
      teks: ctx.cfg?.berkala?.teks,
    });
    const hitam = kustom ? [] : kelompokHitam(g.hitam || [], g.hitamInfo || []);
    const manual = kustom ? [] : String(ctx.cfg?.grup?.daftarHitam || '')
      .split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    return { teks: teksBerkala({ namaGrup: g.nama, hitam, manual, teksKustom: kustom }), mode };
  }

  function bersihkanHitungan() {
    Object.assign(papan, { dihapus: 0, peringatan: 0, kick: 0, perintah: 0, stiker: 0, story: 0 });
    emitStatus();
  }

  return { tanganiGrup, tanganiPerintah, bersihkanHitungan, aktifModerasi, aktifPerintah };
}
