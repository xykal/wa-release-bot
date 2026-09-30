// Router perintah dari app (cmd.json / WebSocket) ke modul-modul engine.
// Satu-satunya tempat yang menulis config.json (case 'configure'), supaya
// bentuk config punya satu sumber kebenaran.
import fs from 'node:fs';
import { repoTidakValid, teksEntri, daftarRepo, sinkronState } from '../repo.mjs';
import { SUMBER_BAWAAN } from '../lagu.mjs';

/**
 * @param {object} ctx konteks engine (lihat bot.mjs)
 * @param {{ rilis: object, lagu: object, grup: object, tautan: object, jaga: object }} deps modul-modul fitur
 */
export function buatPerintah(ctx, { rilis, lagu, grup, tautan, jaga }) {
  const {
    log, saveState, emitStatus, bridge, cfgFile, hosting,
    scheduleNext, intervalMs, repoAda, grupAktif, laguAktif, jadwalGrup, startEngine, stopEngine,
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
          },
          grup: {
            aktif: Boolean(cmd.grupAktif),
            target: String(cmd.grupTarget || '').trim(),
            intervalMinutes: Number(cmd.grupInterval) || 5,
            daftarHitam: String(cmd.grupHitam || ''),
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
          lagu: {
            aktif: Boolean(cmd.laguAktif),
            perHari: Math.min(Math.max(Number(cmd.laguPerHari) || 2, 1), 8),
            jamMulai: Number.isFinite(Number(cmd.laguJamMulai)) ? Number(cmd.laguJamMulai) : 9,
            jamSelesai: Number.isFinite(Number(cmd.laguJamSelesai)) ? Number(cmd.laguJamSelesai) : 22,
            tzMenit: Number(cmd.tzMenit) || 0,
            sumber: String(cmd.laguSumber || '').trim() || SUMBER_BAWAAN,
          },
        };
        if (!next.github.repo && !next.grup.aktif && !next.lagu.aktif && !next.jaga.moderasi && !next.jaga.perintah) {
          bridge.send({ type: 'cmd_error', msg: 'Isi repo GitHub, nyalain penjaga grup, lagu mood, moderasi grup, atau perintah pribadi — minimal salah satu.' });
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
        fs.writeFileSync(cfgFile, JSON.stringify(ctx.cfg, null, 2));
        saveState();
        log(`⚙️ Setting diperbarui: repo=${next.github.repo || '-'}, channel=${next.whatsapp.channel || '-'}, ` +
          `interval=${next.bot.checkIntervalMinutes}m, grup=${next.grup.aktif ? 'nyala' : 'mati'}`);
        // Mode jaga pesan nyala/mati mengikuti setting yang baru disimpan.
        if (ctx.running) {
          if (next.jaga.moderasi || next.jaga.perintah) {
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
