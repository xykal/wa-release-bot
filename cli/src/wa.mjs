// Modul WhatsApp (Baileys). Prinsip: nyambung HANYA pas mau kirim pesan,
// selesai → disconnect. Session disimpan di file, jadi QR cuma discan 1x seumur hidup.

import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { normalisasiNomor } from './nomor.mjs';
import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  Browsers,
} from '@whiskeysockets/baileys';
import { resolveTarget } from './channel.mjs';

/**
 * Nyambung ke WA. Tangani kode 515 ("restart required") — itu NORMAL tepat
 * setelah QR discan / pairing code dimasukin: WA nyuruh nyambung ulang.
 * Dulu 515 dianggap gagal, jadi setup selalu "gagal" padahal udah berhasil.
 *
 * @param {{
 *   sessionDir?: string,
 *   allowQr?: boolean,     // boleh nautin baru (setup)
 *   phone?: string,        // kalau diisi + allowQr → pakai PAIRING CODE, bukan QR
 *   emitQr?: (qr: string) => void,
 *   printQr?: boolean,     // render QR ke terminal (default: true kalau allowQr)
 *   onStatus?: (msg: string) => void,
 *   timeoutMs?: number
 * }} [opts]
 * @returns {Promise<{sock: object, close: () => void}>}
 */
export async function connectToWhatsApp({
  sessionDir = './wa-session',
  allowQr = false,
  phone,
  emitQr,
  printQr,
  onStatus,
  timeoutMs = 180000,
} = {}) {
  const status = (m) => { if (onStatus) onStatus(m); };
  const sesi = statusSesi(sessionDir);
  if (!allowQr && sesi !== 'siap') {
    throw new Error(
      'WA belum ditautkan. Jalankan dulu:  npm run setup  (QR)  atau  npm run setup -- --pair 08xxxx  (pairing code).'
    );
  }
  if (allowQr && sesi === 'setengah') {
    status('🧹 Sisa tautan yang nggak selesai dibuang dulu.');
    rmSync(sessionDir, { recursive: true, force: true });
  }
  const nomor = phone ? normalisasiNomor(phone) : null;
  if (phone && !nomor) throw new Error(`Nomor "${phone}" nggak valid. Contoh: 6281234567890`);
  const shouldPrintQr = (printQr ?? allowQr) && !nomor;

  let version;
  try {
    ({ version } = await fetchLatestBaileysVersion());
  } catch {
    version = undefined; // jaringan lagi bermasalah → pakai default Baileys
  }

  const batas = Date.now() + timeoutMs;
  let kodeDiminta = false;
  let tautBaru = false; // koneksi ini hasil nautin baru → jangan buru-buru diputus
  // Sesi dibaca SEKALI & dipakai terus waktu nyambung ulang (habis 515).
  // Dibaca ulang dari file bisa dapat versi lama karena nyimpennya jalan di belakang.
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const sesiSiap = () => Boolean(state.creds?.me?.id && state.creds?.account);
  for (let coba = 1; ; coba++) {
    const sock = makeWASocket({
      version,
      auth: state,
      browser: Browsers.macOS('Chrome'),
      logger: pino({ level: 'silent' }),
      markOnlineOnConnect: false,
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => false,
      qrTimeout: nomor ? 60000 : undefined, // pairing: waktu ngetik kode lebih lega
    });
    sock.ev.on('creds.update', saveCreds);
    let pendingSudah = false;
    let pendingKelar = null;

    const hasil = await new Promise((resolve) => {
      const timer = setTimeout(
        () => resolve({ err: new Error(`Timeout ${timeoutMs / 1000}s nunggu koneksi WA. Coba lagi.`) }),
        Math.max(5000, batas - Date.now())
      );
      sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr, receivedPendingNotifications } = update;
        if (receivedPendingNotifications) {
          pendingSudah = true;
          if (pendingKelar) pendingKelar();
        }
        if (qr) {
          if (allowQr) tautBaru = true;
          if (!allowQr) {
            clearTimeout(timer);
            resolve({ err: new Error('Sesi WA nggak berlaku lagi. Jalankan ulang setup.') });
          } else if (nomor) {
            if (!kodeDiminta) {
              kodeDiminta = true;
              try {
                const k = await sock.requestPairingCode(nomor);
                const rapi = k.length === 8 ? `${k.slice(0, 4)}-${k.slice(4)}` : k;
                console.log(`\n🔑 PAIRING CODE:  ${rapi}\n`);
                console.log('   WA → ⋮ → Perangkat tertaut → Tautkan perangkat');
                console.log('   → "Tautkan dengan nomor telepon saja" → ketik kode di atas.\n');
              } catch (e) {
                clearTimeout(timer);
                resolve({ err: new Error('Gagal minta pairing code: ' + e.message) });
              }
            }
          } else {
            if (shouldPrintQr) {
              console.log('\n📱 Scan QR ini pakai WhatsApp (dari HP lain):');
              console.log('   WA → ⋮ → Perangkat tertaut → Tautkan perangkat\n');
              qrcode.generate(qr, { small: true });
              console.log('\n   (QR ganti tiap ±20 detik. Satu HP doang? Pakai:  npm run setup -- --pair 08xxxx)\n');
            }
            if (emitQr) emitQr(qr);
            status('Menunggu scan QR...');
          }
        }
        if (connection === 'open') {
          clearTimeout(timer);
          resolve({ ok: true });
        } else if (connection === 'close') {
          clearTimeout(timer);
          resolve({ code: lastDisconnect?.error?.output?.statusCode });
        }
      });
    });

    if (hasil.ok) {
      status('Terhubung ke WA');
      if (tautBaru) {
        // Habis nautin, HP masih nunggu perangkat baru ini beres (login ulang,
        // upload pre-key, balas notif sinkron). Kalau langsung diputus, WA di
        // HP muter "Sedang masuk..." lama lalu bisa gagal.
        status('⏳ Nyelesaiin tautan sama WhatsApp (±20 dtk), jangan dimatiin...');
        await new Promise((resolve) => {
          const maks = setTimeout(resolve, 60000);
          const selesai = () => { clearTimeout(maks); setTimeout(resolve, 12000); };
          pendingKelar = () => { pendingKelar = null; selesai(); };
          if (pendingSudah) pendingKelar();
          setTimeout(() => { if (pendingKelar) { pendingKelar = null; selesai(); } }, 20000);
        });
        status('✅ Tautan beres di sisi WhatsApp.');
      }
      return { sock, close: () => { try { sock.end(undefined); } catch { /* ignore */ } } };
    }
    try { sock.end(undefined); } catch { /* ignore */ }
    if (hasil.err) throw hasil.err;
    if (hasil.code === DisconnectReason.loggedOut) {
      rmSync(sessionDir, { recursive: true, force: true });
      throw new Error('Sesi WA ke-logout. Jalankan ulang:  npm run setup');
    }
    if (hasil.code === DisconnectReason.restartRequired) {
      status('🔁 Tautan diterima WA, nyambung ulang (normal)...');
    } else if (hasil.code === DisconnectReason.timedOut && !sesiSiap()) {
      throw new Error(nomor
        ? 'Kode-nya kelamaan nggak dimasukin (kadaluarsa). Jalankan setup lagi.'
        : 'QR-nya kelamaan nggak discan. Jalankan setup lagi.');
    } else if ([408, 428, 503].includes(hasil.code) && coba < 4 && sesiSiap()) {
      status(`🔁 Koneksi putus (code ${hasil.code}), coba lagi...`);
      await new Promise((r) => setTimeout(r, 2000 * coba));
    } else {
      throw new Error(`Koneksi WA tutup (code ${hasil.code}). Coba jalankan lagi.`);
    }
    if (coba >= 6 || Date.now() > batas) throw new Error('WA nyuruh nyambung ulang terus. Coba lagi bentar lagi.');
  }
}

/** 'kosong' | 'setengah' (pairing nggak selesai) | 'siap' */
export function statusSesi(sessionDir) {
  const f = `${sessionDir}/creds.json`;
  if (!existsSync(f)) return 'kosong';
  try {
    const c = JSON.parse(readFileSync(f, 'utf8'));
    return c?.me?.id && c?.account ? 'siap' : 'setengah';
  } catch {
    return 'setengah';
  }
}

/**
 * Ubah target channel jadi JID.
 * Terima: link channel (https://whatsapp.com/channel/...), JID <angka>@newsletter,
 * JID grup <angka>@g.us, atau link undangan grup.
 *
 * Ingat: username channel (@nama) TIDAK didukung — lihat src/channel.mjs.
 * (Dulu fungsi ini manggil onWhatsApp('@username'), padahal itu buat nyari
 * NOMOR HP, bukan channel. Jadi @username selalu gagal.)
 */
export async function resolveChannelJid(sock, target, log = () => {}) {
  const hasil = await resolveTarget(sock, target, log);
  return hasil.jid;
}

export async function sendText(sock, jid, text) {
  await sock.sendMessage(jid, { text });
}
