// Router perintah dari app (cmd.json / WebSocket) ke modul-modul engine.
// Satu-satunya tempat yang menulis config.json (case 'configure'), supaya
// bentuk config punya satu sumber kebenaran.
import fs from 'node:fs';
import { repoTidakValid, teksEntri, daftarRepo, sinkronState } from '../repo.mjs';
import { SUMBER_BAWAAN } from '../lagu.mjs';
import { aturNamaBot } from '../config/brand.mjs';

/**
 * @param {object} ctx konteks engine (lihat bot.mjs)
 * @param {{ rilis: object, lagu: object, lawak: object, grup: object, tautan: object, jaga: object, berkala: object }} deps modul-modul fitur
 */
export function buatPerintah(ctx, { rilis, lagu, lawak, grup, tautan, jaga, berkala }) {
  const {
    log, saveState, emitStatus, bridge, cfgFile, hosting,
    scheduleNext, intervalMs, repoAda, grupAktif, laguAktif, lawakAktif, jadwalGrup, startEngine, stopEngine,
  } = ctx;

  async function handleCommand(cmd) {
    const perluCfg = () => {
      if (ctx.cfg) return true;
      bridge.send({ type: 'cmd_error', msg: 'Setting belum di-simpan. Tekan "Simpan" dulu.' });
      return false;
    };

    switch (cmd?.type) {
      case 'ping':
        bridge.send({ type: 'pong', ts: Date.now() });
        break;

      case 'configure': {
        const repoSalah = repoTidakValid(cmd.repo);
        if (repoSalah.length) {
          bridge.send({ type: 'cmd_error', msg: `Repo nggak valid: ${repoSalah.join(', ')}. Formatnya pemilik/nama-repo; pisahkan pakai koma kalau lebih dari satu.` });
          return;
        }
        const next = {
          github: {
            repo: teksEntri(cmd.repo), // pertahankan channel per repo ("a/x|link")
            token: cmd.token || '',
            includePrereleases: Boolean(cmd.includePrereleases),
          },
          whatsapp: {
            channel: cmd.channel || '',
            phone: cmd.phone || '',
            format: cmd.formatChannel === 'pertanyaan' ? 'pertanyaan' : 'teks',
          },
          bot: {
            checkIntervalMinutes: Number(cmd.intervalMinutes) || 15,
            postOnFirstRun: Boolean(cmd.postOnFirstRun),
            testMessageOnSetup: cmd.testMessageOnSetup !== false,
            // Nama bot di semua pesan (kepala SUKIBOT + tagline); kosong → bawaan.
            namaBot: String(cmd.namaBot || '').trim(),
          },
          grup: {
            aktif: Boolean(cmd.grupAktif),
            target: String(cmd.grupTarget || '').trim(),
            // Minimal 1 menit (kall minta respons cepat); maks 12 jam.
            intervalMinutes: Math.min(Math.max(Number(cmd.grupInterval) || 5, 1), 720),
            daftarHitam: String(cmd.grupHitam || ''),
            perpisahan: {
              // Pesan per pisahan opt-in: teks kustom dukung {tag} {nama} {grup};
              // kosong → bawaan (TEKS_PERPISAHAN_BAWAAN) di sisi pengirim.
              aktif: Boolean(cmd.grupPerpisahanAktif),
              judul: String(cmd.grupPerpisahanJudul || '').trim(),
              teks: String(cmd.grupPerpisahanTeks || '').trim(),
              // Respons instan: koneksi jaga nyala walau moderasi/perintah
              // mati, biar salam keluar dalam detik (opt-in, makan batre).
              instan: Boolean(cmd.grupPerpisahanInstan),
            },
          },
          jaga: {
            // Moderasi grup + perintah pribadi (chat sendiri). Saklarnya
            // terpisah karena keduanya bikin WA harus nyambung terus.
            moderasi: Boolean(cmd.moderasiAktif),
            // Opt-in: CLI yang nggak pernah nyetel ini nggak kena efek samping
            // WA nyambung terus. App selalu ngirim nilainya.
            perintah: cmd.perintahPribadi === true,
            batasStrike: Math.min(Math.max(Number(cmd.moderasiStrike) || 2, 1), 5),
            izinkanLink: Boolean(cmd.moderasiIzinkanLink),
            kataTerlarang: String(cmd.moderasiKata || '').split(/[,\n]/).map((s) => s.trim()).filter(Boolean),
            linkTerlarang: String(cmd.moderasiDomain || '').split(/[,\n]/).map((s) => s.trim()).filter(Boolean),
            storyKe: String(cmd.storyKe || '').split(/[,\n]/).map((s) => s.trim()).filter(Boolean)
              .map((n) => (n.includes('@') ? n : `${n.replace(/[^0-9]/g, '')}@s.whatsapp.net`)),
          },
          berkala: {
            // Pesan berkala ke grup (mis. daftar hitam tiap N jam). Butuh grup
            // yang dipantau: tanpa itu nggak ada tujuan kirim.
            aktif: Boolean(cmd.berkalaAktif),
            intervalJam: Math.min(Math.max(Number(cmd.berkalaJam) || 12, 1), 168),
            teks: String(cmd.berkalaTeks || '').trim(),
            // Saklar "selalu daftar hitam": teks di atas diabaikan kalau nyala.
            hitamSaja: Boolean(cmd.berkalaHitamSaja),
          },
          lagu: {
            aktif: Boolean(cmd.laguAktif),
            perHari: Math.min(Math.max(Number(cmd.laguPerHari) || 2, 1), 8),
            jamMulai: Number.isFinite(Number(cmd.laguJamMulai)) ? Number(cmd.laguJamMulai) : 9,
            jamSelesai: Number.isFinite(Number(cmd.laguJamSelesai)) ? Number(cmd.laguJamSelesai) : 22,
            tzMenit: Number(cmd.tzMenit) || 0,
            sumber: String(cmd.laguSumber || '').trim() || SUMBER_BAWAAN,
          },
          lawak: {
            // Pertanyaan ngejoks harian ke channel (postingan "Pertanyaan").
            // Teks lokal (lawak.mjs) — nggak butuh internet buat isi, cuma buat kirim.
            aktif: Boolean(cmd.pertanyaanAktif),
            perHari: Math.min(Math.max(Number(cmd.pertanyaanPerHari) || 2, 1), 8),
            jamMulai: Number.isFinite(Number(cmd.pertanyaanJamMulai)) ? Number(cmd.pertanyaanJamMulai) : 10,
            jamSelesai: Number.isFinite(Number(cmd.pertanyaanJamSelesai)) ? Number(cmd.pertanyaanJamSelesai) : 21,
            tzMenit: Number(cmd.tzMenit) || 0,
          },
        };
        if (!next.github.repo && !next.grup.aktif && !next.lagu.aktif && !next.lawak.aktif && !next.jaga.moderasi && !next.jaga.perintah) {
          bridge.send({ type: 'cmd_error', msg: 'Isi repo GitHub, nyalain penjaga grup, lagu mood, moderasi grup, atau perintah pribadi — minimal salah satu.' });
          return;
        }
        if (next.berkala.aktif && !next.grup.aktif) {
          bridge.send({ type: 'cmd_error', msg: 'Pesan berkala butuh Penjaga grup nyala: grup itu tujuan kirimnya. Nyalain dulu di kartu Penjaga grup.' });
          return;
        }
        if (next.grup.aktif && !next.grup.target) {
          bridge.send({ type: 'cmd_error', msg: 'Penjaga grup nyala tapi link grup-nya kosong.' });
          return;
        }
        if (ctx.cfg?.whatsapp?.channel !== next.whatsapp.channel) ctx.state.channelJid = null;
        // Repo yang dihapus dibuang dari ctx.state (repo baru otomatis mulai dari
        // nol); includePrereleases berubah = semua baseline dari nol, karena
        // tag stable dan prerelease tidak sebanding.
        sinkronState(ctx.state, daftarRepo(next.github.repo), {
          reset: Boolean(ctx.cfg?.github?.includePrereleases) !== next.github.includePrereleases,
        });
        ctx.cfg = next;
        aturNamaBot(next.bot.namaBot);
        fs.writeFileSync(cfgFile, JSON.stringify(ctx.cfg, null, 2));
        saveState();
        log(`⚙️ Setting diperbarui: repo=${next.github.repo || '-'}, channel=${next.whatsapp.channel || '-'}, ` +
          `interval=${next.bot.checkIntervalMinutes}m, grup=${next.grup.aktif ? 'nyala' : 'mati'}`);
        // Pesan berkala dijadwalkan ulang tiap setting disimpan: interval, teks,
        // atau saklarnya bisa berubah kapan aja.
        berkala.hentikan();
        if (ctx.running && next.berkala.aktif) berkala.jadwal(60_000);
        // Mode jaga pesan nyala/mati mengikuti setting yang baru disimpan.
        // Perpisahan instan ikut: dia butuh koneksi nyala terus juga.
        if (ctx.running) {
          if (next.jaga.moderasi || next.jaga.perintah ||
            (next.grup.aktif && next.grup.perpisahan?.aktif && next.grup.perpisahan?.instan)) {
            if (!jaga.sedangJalan()) void jaga.mulai();
          } else {
            jaga.hentikan();
          }
        }
        if (ctx.running) {
          scheduleNext(repoAda() ? intervalMs() : 0);
          jadwalGrup(5000);
          const laguLama = ctx.nextLaguAt;
          if (!laguAktif()) lagu.jadwalLagu();
          else if (!laguLama) lagu.jadwalLagu();
          const lawakLama = ctx.nextTanyaAt;
          if (!lawakAktif()) lawak.jadwalTanya();
          else if (!lawakLama) lawak.jadwalTanya();
        }
        emitStatus();
        break;
      }

      case 'start':
        if (!perluCfg()) return;
        startEngine();
        break;

      case 'stop':
        stopEngine();
        // Setup yang lagi jalan ikut dihentiin (mis. service dimatiin pas nautin).
        tautan.hentikanSetup();
        break;

      case 'check':
        if (!perluCfg()) return;
        void rilis.runCheck('manual');
        if (grupAktif()) void grup.runGrup('manual');
        break;

      case 'setup':
        // Sengaja nggak wajib setting: nautin WA boleh duluan.
        void tautan.mintaSetup(cmd.cara, cmd.phone);
        break;

      case 'status':
        emitStatus();
        break;

      case 'lepas':
        void tautan.doLepas();
        break;

      case 'test':
        if (!perluCfg()) return;
        void tautan.doTest();
        break;

      case 'bikin-channel':
        if (!perluCfg()) return;
        void tautan.doBikinChannel(cmd.nama);
        break;

      case 'cek-channel':
        if (!perluCfg()) return;
        void tautan.doCekChannel();
        break;

      case 'cek-grup':
        if (!perluCfg()) return;
        if (!grupAktif()) { log('⚠️ Penjaga grup belum dinyalain / link grup kosong.'); return; }
        void grup.runGrup('manual');
        break;

      case 'lihat-hitam':
        grup.lihatHitam();
        break;

      case 'hapus-hitam':
        grup.hapusHitam(cmd.kunci);
        break;

      case 'tes-grup':
        if (!perluCfg()) return;
        void grup.doTesGrup();
        break;

      case 'reset-hitam':
        if (ctx.state.grup) { ctx.state.grup.hitam = []; ctx.state.grup.hitamInfo = []; saveState(); }
        log('🧽 Daftar hitam otomatis dikosongin (yang manual di setting nggak disentuh).');
        grup.lihatHitam(true);
        emitStatus();
        break;

      case 'berkala-sekarang':
        // Tombol "Kirim sekarang" di app: nggak nunggu jadwal.
        void berkala.kirimSekarang({ paksa: true, sumber: 'diminta app' });
        break;

      case 'menu-sekarang':
        void jaga.kirimMenuSekarang();
        break;

      case 'bersih-moderasi':
        jaga.bersihkanHitungan();
        log('🧽 Hitungan moderasi dikosongkan.');
        break;

      case 'stiker-jadi':
        // Balasan dari app: gambar sudah dikonversi jadi WebP.
        void jaga.kirimStikerJadi(cmd);
        break;

      case 'perangkat':
        // Ringkasan spek HP dari app (lihat Perangkat.kt): dipakai buat nyetel
        // fitur berat. Bukan wajib; kalau nggak ada, semua fitur tetap jalan.
        ctx.perangkat = { ringkas: String(cmd.ringkas || ''), hemat: Boolean(cmd.hemat), padaAt: Date.now() };
        log(`📱 Perangkat: ${ctx.perangkat.ringkas || 'info nggak dikirim'}${ctx.perangkat.hemat ? ' (mode hemat: animasi fitur berat diturunin)' : ''}`);
        emitStatus();
        break;

      case 'lagu-sekarang':
        if (!perluCfg()) return;
        void lagu.runLagu('manual');
        break;

      case 'tanya-sekarang':
        if (!perluCfg()) return;
        void lawak.runTanya('manual');
        break;

      default:
        if (String(cmd?.type || '').startsWith('hosting-')) {
          await hosting.perintah(cmd);
          break;
        }
        log('cmd tidak dikenal: ' + cmd?.type);
    }
  }

  return { handleCommand };
}
