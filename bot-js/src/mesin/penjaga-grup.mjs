// Penjaga grup: approve permintaan join, tolak yang pernah keluar, daftar
// hitam. Logika murni (siapa keluar, siapa ditolak) ada di ../grup.mjs dan
// diuji unit; modul ini yang bicara ke socket WA dan menyimpan ke ctx.state.
import { bacaTarget, JENIS } from '../channel.mjs';
import { normalisasiNomor } from '../nomor.mjs';
import { sendText } from '../wa.mjs';
import { formatTesGrup } from '../format.mjs';
import {
  identitas,
  cariYangKeluar,
  catatAnggota,
  putuskan,
  daftarHitamManual,
  namaOrang,
  kelompokHitam,
  bukaBlokir,
} from '../grup.mjs';

/** @param {object} ctx konteks engine (lihat bot.mjs) */
export function buatPenjagaGrup(ctx) {
  const { log, saveState, emitStatus, pakaiWA, sambung, grupAktif, jadwalGrup, intervalGrupMs, bridge } = ctx;

  function grupState() {
    const target = String(ctx.cfg?.grup?.target || '').trim();
    if (!ctx.state.grup || ctx.state.grup.target !== target) {
      // Grup-nya ganti → catatan lama nggak berlaku.
      ctx.state.grup = { target, jid: null, nama: null, anggota: [], hitam: [], hitamInfo: [], disetujui: 0, ditolak: 0, lastCekAt: null };
    }
    return ctx.state.grup;
  }

  async function cariGrup(sock, g) {
    if (g.jid) return g.jid;
    const t = bacaTarget(g.target);
    let jid;
    if (t.jenis === JENIS.GRUP) jid = t.nilai;
    else if (t.jenis === JENIS.LINK_GRUP) jid = (await sock.groupGetInviteInfo(t.nilai))?.id || null;
    else throw new Error('Isi "Grup" harus link undangan grup (chat.whatsapp.com/...) atau JID <angka>@g.us.');
    if (!jid) throw new Error('Link grup-nya nggak kebaca / udah di-reset. Salin ulang link undangannya.');
    g.jid = jid;
    return jid;
  }

  let grupJalan = false;
  async function runGrup(source) {
    if (!grupAktif() || grupJalan) return;
    grupJalan = true;
    try {
      await pakaiWA('grup', async () => {
        const { sock, close } = await sambung({ onStatus: () => {} });
        try {
          await jagaGrup(sock, source);
        } finally {
          close();
        }
      });
    } catch (e) {
      log(`⚠️ Jaga grup gagal: ${e.message}`);
    } finally {
      grupJalan = false;
      if (ctx.running) jadwalGrup(intervalGrupMs());
      emitStatus();
    }
  }

  async function jagaGrup(sock, source) {
    const g = grupState();
    const jid = await cariGrup(sock, g);
    const meta = await sock.groupMetadata(jid);
    g.nama = meta.subject || g.nama;

    const saya = identitas({ id: sock.user?.id, lid: sock.user?.lid });
    const aku = meta.participants.find((p) => identitas(p).some((i) => saya.includes(i)));
    if (!aku?.admin) {
      log(`⚠️ Grup "${g.nama}": akun WA lo bukan admin di sana, jadi nggak bisa approve/tolak. Jadiin admin dulu.`);
      saveState();
      return;
    }
    if (!meta.joinApprovalMode && source !== 'jadwal') {
      log(`ℹ️ Grup "${g.nama}": fitur "Setujui anggota baru" belum nyala. Nyalain di Info grup → Setelan grup.`);
    }

    // 1. Siapa yang keluar sejak cek terakhir → masuk daftar hitam.
    const sekarang = meta.participants;
    const lamaJumlah = g.anggota.length;
    const hitam = new Set(g.hitam);
    let hitamInfo = Array.isArray(g.hitamInfo) ? g.hitamInfo : [];
    if (sekarang.length === 0 || (lamaJumlah > 6 && sekarang.length < lamaJumlah / 2)) {
      // Jaga-jaga kalau WA balikin daftar anggota yang nggak lengkap: jangan
      // sampai separuh grup masuk daftar hitam gara-gara glitch.
      log(`⚠️ Daftar anggota "${g.nama}" aneh (${lamaJumlah} → ${sekarang.length}). Putaran ini nggak nyatet yang keluar.`);
    } else {
      for (const orang of cariYangKeluar(g.anggota, sekarang, saya)) {
        orang.forEach((i) => hitam.add(i));
        hitamInfo.push({ ids: orang, sejak: Date.now() });
        log(`🚪 ${namaOrang(orang)} keluar/dikeluarin dari "${g.nama}" → masuk daftar hitam.`);
      }
    }
    // Yang sekarang ada di grup (mis. dimasukin lagi manual sama admin) =
    // udah dimaafin → hapus dari daftar hitam.
    for (const p of sekarang) identitas(p).forEach((i) => hitam.delete(i));
    hitamInfo = hitamInfo.filter((o) => (o?.ids || []).some((i) => hitam.has(i)));

    // 2. Proses permintaan join.
    const manual = daftarHitamManual(ctx.cfg.grup.daftarHitam, normalisasiNomor);
    const semuaHitam = new Set([...hitam, ...manual]);
    let permintaan = [];
    try {
      permintaan = await sock.groupRequestParticipantsList(jid);
    } catch (e) {
      log(`⚠️ Nggak bisa baca permintaan join: ${e.message}`);
    }

    const setuju = [];
    const tolak = [];
    for (const r of permintaan) {
      const target = r.jid || r.phone_number;
      if (!target) continue;
      if (putuskan(r, semuaHitam) === 'reject') tolak.push({ target, r });
      else setuju.push({ target, r });
    }

    const baruMasuk = [];
    if (setuju.length) {
      const res = await sock.groupRequestParticipantsUpdate(jid, setuju.map((x) => x.target), 'approve');
      for (const x of setuju) {
        const st = res.find((y) => y.jid === x.target)?.status || '200';
        if (st === '200') {
          g.disetujui = (g.disetujui || 0) + 1;
          baruMasuk.push(identitas(x.r));
          log(`✅ ${namaOrang(x.r)} di-approve masuk "${g.nama}".`);
        } else {
          log(`⚠️ Approve ${namaOrang(x.r)} gagal (status ${st}).`);
        }
      }
    }
    if (tolak.length) {
      const res = await sock.groupRequestParticipantsUpdate(jid, tolak.map((x) => x.target), 'reject');
      for (const x of tolak) {
        const st = res.find((y) => y.jid === x.target)?.status || '200';
        if (st === '200') {
          g.ditolak = (g.ditolak || 0) + 1;
          log(`⛔ ${namaOrang(x.r)} ditolak — dulu pernah keluar/dikeluarin.`);
        } else {
          log(`⚠️ Nolak ${namaOrang(x.r)} gagal (status ${st}).`);
        }
      }
    }

    // 3. Simpan catatan anggota. Yang barusan di-approve langsung dicatat,
    //    biar kalau mereka keluar sebelum cek berikutnya tetap ketahuan.
    g.anggota = [...catatAnggota(sekarang), ...baruMasuk];
    g.hitam = [...hitam];
    g.hitamInfo = hitamInfo;
    g.lastCekAt = Date.now();
    saveState();

    if (source !== 'jadwal' || setuju.length || tolak.length) {
      log(`🛡️ Grup "${g.nama}": ${sekarang.length} anggota, ${permintaan.length} permintaan ` +
        `(${setuju.length} approve, ${tolak.length} tolak), daftar hitam ${g.hitam.length} + manual ${manual.length}.`);
    }
  }

  /** Kirim daftar hitam ke app (buat daftar yang bisa dibuka blokirnya) + tulis ke log. */
  function lihatHitam(diamDiLog = false) {
    const g = ctx.state.grup;
    const manual = daftarHitamManual(ctx.cfg?.grup?.daftarHitam, normalisasiNomor);
    const otomatis = kelompokHitam(g?.hitam || [], g?.hitamInfo || []);
    bridge.send({
      type: 'daftar_hitam',
      otomatis: otomatis.map((o) => ({ kunci: o.kunci, label: o.label, sejak: o.sejak })),
      manual: manual.map((i) => '+' + i.split('@')[0]),
    });
    if (diamDiLog) return;
    if (!otomatis.length && !manual.length) {
      log('📋 Daftar hitam kosong.');
      return;
    }
    log(`📋 Daftar hitam otomatis (${otomatis.length}): ${otomatis.map((o) => o.label).join(', ') || '-'}`);
    log(`📋 Daftar hitam manual (${manual.length}): ${manual.map((i) => i.split('@')[0]).join(', ') || '-'}`);
  }

  function hapusHitam(kunci) {
    const g = ctx.state.grup;
    const manual = daftarHitamManual(ctx.cfg?.grup?.daftarHitam, normalisasiNomor);
    const hasil = bukaBlokir(g?.hitam || [], g?.hitamInfo || [], kunci, normalisasiNomor);
    if (hasil.dihapus && g) {
      g.hitam = hasil.hitam;
      g.hitamInfo = hasil.info;
      saveState();
      log(`🔓 ${hasil.dihapus.label} dikeluarin dari daftar hitam — kalau minta join lagi bakal di-approve.`);
    } else {
      log(`⚠️ ${kunci} nggak ada di daftar hitam otomatis.`);
    }
    const n = normalisasiNomor(String(kunci ?? ''));
    if (n && manual.includes(`${n}@s.whatsapp.net`)) {
      log(`ℹ️ Nomor +${n} juga ada di kolom "Selalu tolak nomor ini" — hapus dari situ juga, terus Simpan.`);
    }
    lihatHitam(true);
    emitStatus();
  }

  async function doTesGrup() {
    const target = String(ctx.cfg?.grup?.target || '').trim();
    if (!target) { log('⚠️ Link grup masih kosong. Isi dulu di kartu Penjaga grup, terus Simpan.'); return; }
    try {
      log('🧪 Mengirim pesan tes ke grup...');
      await pakaiWA('tes-grup', async () => {
        const { sock, close } = await sambung();
        try {
          const g = grupState();
          const jid = await cariGrup(sock, g);
          let nama = g.nama;
          try { nama = (await sock.groupMetadata(jid)).subject || nama; } catch { /* nggak wajib */ }
          if (nama) g.nama = nama;
          saveState();
          await sendText(sock, jid, formatTesGrup(nama));
          log(`✅ Pesan tes terkirim ke grup "${nama || jid}".`);
        } finally {
          close();
        }
      });
    } catch (e) {
      log(`💥 Tes grup gagal: ${e.message}`);
    }
  }

  return { grupState, cariGrup, runGrup, jagaGrup, lihatHitam, hapusHitam, doTesGrup };
}
