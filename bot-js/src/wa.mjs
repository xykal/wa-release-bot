// Klien WhatsApp (Baileys). Prinsip: nyambung HANYA pas perlu kirim pesan,
// selesai → disconnect. Session disimpan di file, QR cuma discan 1x seumur hidup.

import pino from 'pino';
import { existsSync } from 'node:fs';
import { resolveTarget } from './channel.mjs';
import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  Browsers,
} from '@whiskeysockets/baileys';

/**
 * @param {{
 *   sessionDir: string,
 *   allowQr: boolean,            // setup: iya; posting biasa: tidak
 *   emitQr?: (qr: string) => void,
 *   onStatus?: (msg: string) => void,
 *   timeoutMs?: number
 * }} opts
 */
export async function connectToWhatsApp({ sessionDir, allowQr, emitQr, onStatus, timeoutMs = 180000 }) {
  if (!allowQr && !existsSync(`${sessionDir}/creds.json`)) {
    throw new Error('Sesi WA belum ada. Tekan tombol "Setup" di app lalu scan QR-nya.');
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

  let version;
  try {
    ({ version } = await fetchLatestBaileysVersion());
  } catch {
    version = undefined; // jaringan bermasalah → pakai versi default Baileys
  }

  const sock = makeWASocket({
    version,
    auth: state,
    browser: Browsers.macOS('Desktop'),
    logger: pino({ level: 'silent' }),
    markOnlineOnConnect: false, // bot jangan muncul "online"
  });
  sock.ev.on('creds.update', saveCreds);

  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timeout ${Math.round(timeoutMs / 1000)}s nunggu koneksi WA. Coba lagi.`)),
      timeoutMs
    );

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        if (emitQr) emitQr(qr);
        if (onStatus) onStatus('Menunggu scan QR...');
      }
      if (connection === 'open') {
        clearTimeout(timer);
        if (onStatus) onStatus('Terhubung ke WA');
        resolve();
      } else if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;
        clearTimeout(timer);
        if (code === DisconnectReason.loggedOut) {
          reject(new Error('Sesi WA ke-logout. Tekan "Setup" lagi dan scan QR.'));
        } else {
          reject(new Error(`Koneksi WA tutup (code ${code}). Coba lagi.`));
        }
      }
    });
  });

  return { sock, close: () => sock.end() };
}

/**
 * Ubah target channel jadi JID.
 *
 * Logika bacanya ada di channel.mjs (file itu nggak import apa-apa, jadi bisa
 * dites tanpa Baileys). Di sini cuma neruskan.
 *
 * Catatan penting: dulu fungsi ini manggil `sock.onWhatsApp('@username')` —
 * itu buat nyari NOMOR HP, bukan channel, jadi selalu gagal buat channel.
 * Sekarang username ditolak dengan pesan yang jelas + cara benerinnya.
 */
export async function resolveChannel(sock, target, log) {
  return resolveTarget(sock, target, log);
}

export async function sendText(sock, jid, text) {
  await sock.sendMessage(jid, { text });
}
