// Tautan WA: setup (pairing code / QR), lepas, cek channel, bikin channel,
// test message. Semua butuh socket WA sebentar lalu ditutup; antrian
// koneksi (pakaiWA) dan status ada di ctx (bot.mjs).
import fs from 'node:fs';
import { connectToWhatsApp, statusSesi, hapusSesi } from '../wa.mjs';
import { fetchLatestRelease } from '../github.mjs';
import { stateRepo, teksRepo } from '../repo.mjs';
import { bikinChannel, linkChannel } from '../channel.mjs';
import { normalisasiNomor } from '../nomor.mjs';
import { formatTestMessage } from '../format.mjs';

/**
 * @param {object} ctx konteks engine (lihat bot.mjs)
 * @param {{ rilis: object, grup: object }} deps cariTarget/kirimKeChannel/ajak dari rilis, jagaGrup dari grup
 */
export function buatTautan(ctx, { rilis, grup }) {
  const { log, saveState, emitStatus, pakaiWA, sambung, repos, grupAktif, sessionDir, cfgFile, bridge } = ctx;

  // Setup yang lagi jalan + tombol pembatalnya. Kalau user minta setup lagi
  // (mis. tadi pilih QR, sekarang pilih kode), yang lama DIBATALIN dan diganti
  // — dulu yang baru ditolak ("Setup lagi jalan"), jadi QR lama tetap nongol
  // barengan sama kode yang diminta.
  let setupJalan = null;
  let setupBatal = null;

  async function mintaSetup(cara, nomorMentah) {
    if (setupJalan) {
      log('↩️ Setup sebelumnya dibatalin, ganti ke yang baru.');
      setupBatal.aktif = true;
      try { setupBatal.sock?.end(undefined); } catch { /* ignore */ }
      await setupJalan.catch(() => {});
    }
    const batal = { aktif: false, sock: null };
    setupBatal = batal;
    setupJalan = doSetup(cara, nomorMentah, batal).finally(() => {
      if (setupBatal === batal) { setupJalan = null; emitStatus(); }
    });
  }

  /**
   * Nautin WA. `cara` = 'pairing' (pakai nomor + kode 8 huruf) atau 'qr'.
   */
  async function doSetup(cara, nomorMentah, batal) {
    // Bersihin sisa tampilan setup sebelumnya: QR & kode nggak boleh nongol bareng.
    bridge.send({ type: 'qr', qr: null });
    bridge.send({ type: 'pairing_code', code: null });
    emitStatus();
    let mode = cara === 'qr' ? 'qr' : 'pairing';
    try {
      if (statusSesi(sessionDir) === 'siap') {
        mode = 'none';
        log('ℹ️ WA udah tertaut. Kalau mau ganti akun, tekan "Lepas WA" dulu.');
      } else if (mode === 'pairing') {
        const n = normalisasiNomor(nomorMentah || ctx.cfg?.whatsapp?.phone);
        if (!n) throw new Error('Isi nomor WA dulu (contoh 6281234567890).');
        nomorMentah = n;
        log(`🔧 SETUP: minta pairing code buat +${n}...`);
      } else {
        log('🔧 SETUP: tunjukkan QR di layar, scan pakai WA dari HP lain (Perangkat tertaut).');
      }
      bridge.send({ type: 'setup_start', mode });

      await pakaiWA('setup', async () => {
        if (batal.aktif) throw new Error('Dibatalin.');
        const { sock, close } = await sambung({
          mode,
          phone: nomorMentah,
          batal,
          emitQr: (qr) => {
            if (batal.aktif) return;
            log('📱 QR baru ditampilkan — scan sekarang (QR ganti tiap ±20 dtk).');
            bridge.send({ type: 'qr', qr });
          },
          emitPairingCode: (code) => { if (!batal.aktif) bridge.send({ type: 'pairing_code', code }); },
          onTertaut: () => {
            // HP udah nerima kode / QR → tutup tampilannya, kasih tau lagi ngapain.
            bridge.send({ type: 'qr', qr: null });
            bridge.send({ type: 'pairing_code', code: null });
            bridge.send({ type: 'setup_tahap', msg: 'Diterima WhatsApp! Nyelesaiin tautan (±20 dtk) — jangan tutup app.' });
          },
          timeoutMs: 300000,
        });
        bridge.send({ type: 'qr', qr: null });
        bridge.send({ type: 'pairing_code', code: null });
        log('🔗 WA tertaut!');
        try {
          let jid = null;
          if (ctx.cfg?.whatsapp?.channel) {
            jid = await rilis.cariTarget(sock);
            if (ctx.cfg.bot?.testMessageOnSetup !== false) {
              await rilis.kirimKeChannel(sock, jid, formatTestMessage(teksRepo(ctx.cfg.github?.repo) || '-', rilis.ajak(jid)));
              log('📨 Test message dikirim ke channel. Cek channel-nya!');
            }
          }
          for (const repo of repos()) {
            const st = stateRepo(ctx.state, repo);
            if (st.lastTag) continue; // baseline lama tetap dipakai
            const rel = await fetchLatestRelease(repo, {
              token: ctx.cfg.github?.token || '',
              includePrereleases: Boolean(ctx.cfg.github?.includePrereleases),
            });
            st.lastTag = rel.tag;
            st.rilisEtag = rel.etag || null;
            saveState();
            log(`🌱 Baseline release dicatat: ${repo} ${rel.tag}`);
          }
          if (grupAktif()) await grup.jagaGrup(sock, 'setup');
          bridge.send({ type: 'setup_done', jid });
          log('🎉 SETUP SELESAI!');
        } finally {
          close();
        }
      });
    } catch (e) {
      if (batal.aktif) {
        log('(setup yang lama udah dihentiin)');
        return;
      }
      log(`💥 Setup gagal: ${e.message}`);
      bridge.send({ type: 'setup_error', msg: e.message });
      bridge.send({ type: 'qr', qr: null });
      bridge.send({ type: 'pairing_code', code: null });
    }
  }

  async function doLepas() {
    await pakaiWA('lepas', async () => {
      if (statusSesi(sessionDir) === 'siap') {
        try {
          const { sock } = await connectToWhatsApp({ sessionDir, mode: 'none', timeoutMs: 30000 });
          await sock.logout('dilepas dari app');
        } catch { /* nggak nyambung → minimal hapus file-nya */ }
      }
      hapusSesi(sessionDir);
      ctx.state.channelJid = null;
      saveState();
      log('🔌 WA dilepas. Tautkan lagi kapan aja lewat "Tautkan WA".');
    });
    emitStatus();
  }

  /** Cek doang: target-nya ketemu nggak? Nggak kirim apa-apa. */
  async function doCekChannel() {
    if (!ctx.cfg.whatsapp.channel) {
      log('⚠️ Channel WA masih kosong. Tekan "Bikin Channel", atau tempel link channel-nya.');
      return;
    }
    log('🔎 Nyari channel/grup dari isi setting...');
    try {
      await pakaiWA('cek-channel', async () => {
        const { sock, close } = await sambung();
        try {
          ctx.state.channelJid = null; // paksa resolve ulang
          const jid = await rilis.cariTarget(sock);
          log(`✅ Ketemu: ${ctx.state.channelName || '(tanpa nama)'} → ${jid}`);
        } finally {
          close();
        }
      });
    } catch (e) {
      log(`💥 Gagal nyari channel: ${e.message}`);
    }
  }

  /**
   * Bikin channel WA baru dari nomor yang lagi login, lalu simpan JID-nya.
   * Jalan pintas buat yang bingung "channel-nya dapet dari mana?".
   */
  async function doBikinChannel(namaMinta) {
    log('🏗️ Bikin channel baru di WhatsApp lo...');
    try {
      await pakaiWA('bikin-channel', async () => {
        const { sock, close } = await sambung();
        try {
          const repo = repos()[0] || 'bot';
          const nama = (namaMinta && String(namaMinta).trim()) || `Release ${repo}`;
          const meta = await bikinChannel(sock, nama, `Info release dari ${repo} — dijaga sama wa-release-bot.`);
          const link = linkChannel(meta);

          ctx.state.channelJid = meta.id;
          ctx.state.channelName = meta.name || nama;
          ctx.cfg.whatsapp.channel = meta.id;
          fs.writeFileSync(cfgFile, JSON.stringify(ctx.cfg, null, 2));
          saveState();

          log(`✅ Channel dibuat: ${ctx.state.channelName}`);
          log(`   JID-nya: ${meta.id}`);
          if (link) log(`🔗 Link channel (buat dibagikan): ${link}`);

          if (ctx.cfg.bot?.testMessageOnSetup !== false) {
            await rilis.kirimKeChannel(sock, meta.id, formatTestMessage(repo, rilis.ajak(meta.id)));
            log('📨 Test message dikirim ke channel baru. Cek tab Saluran di WA.');
          }
          bridge.send({ type: 'channel_dibuat', jid: meta.id, nama: ctx.state.channelName, link });
          emitStatus();
        } finally {
          close();
        }
      });
    } catch (e) {
      log(`💥 Gagal bikin channel: ${e.message}`);
      bridge.send({ type: 'channel_gagal', msg: e.message });
    }
  }

  async function doTest() {
    if (!ctx.cfg.whatsapp?.channel) { log('⚠️ Channel WA masih kosong.'); return; }
    try {
      log('🧪 Mengirim test message ke channel...');
      await pakaiWA('test', async () => {
        const { sock, close } = await sambung();
        try {
          const jid = await rilis.cariTarget(sock);
          await rilis.kirimKeChannel(sock, jid, formatTestMessage(teksRepo(ctx.cfg.github?.repo) || '-', rilis.ajak(jid)));
          log(`✅ Test message terkirim ke ${jid}`);
        } finally {
          close();
        }
      });
    } catch (e) {
      log(`💥 Test gagal: ${e.message}`);
    }
  }

  /** Dipanggil saat engine di-stop: setup yang lagi jalan ikut dihentikan. */
  function hentikanSetup() {
    if (setupJalan && setupBatal) {
      setupBatal.aktif = true;
      try { setupBatal.sock?.end(undefined); } catch { /* ignore */ }
    }
  }

  return { mintaSetup, doSetup, doLepas, doCekChannel, doBikinChannel, doTest, hentikanSetup };
}
