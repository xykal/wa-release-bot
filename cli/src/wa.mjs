// Modul WhatsApp (Baileys). Prinsip: nyambung HANYA pas mau kirim pesan,
// selesai → disconnect. Session disimpan di file, jadi QR cuma discan 1x seumur hidup.

import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { existsSync } from 'node:fs';
import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  Browsers,
} from '@whiskeysockets/baileys';
import { resolveTarget } from './channel.mjs';

/**
 * Nyambung ke WA sebagai linked device.
 *
 * CATATAN: opsi `printQRInTerminal` sudah DIHAPUS dari Baileys sejak 6.6.
 * Jadi QR sekarang kita render sendiri pakai `qrcode-terminal`.
 *
 * @param {{
 *   sessionDir?: string,
 *   allowQr?: boolean,
 *   emitQr?: (qr: string) => void,
 *   printQr?: boolean,          // render QR ke terminal (default: true kalau allowQr)
 *   onStatus?: (msg: string) => void,
 *   timeoutMs?: number
 * }} opts
 * @returns {Promise<{sock: object, close: () => void}>}
 */
export async function connectToWhatsApp({
  sessionDir = './wa-session',
  allowQr = false,
  emitQr,
  printQr,
  onStatus,
  timeoutMs = 180000,
} = {}) {
  if (!allowQr && !existsSync(`${sessionDir}/creds.json`)) {
    throw new Error(
      'Sesi WA belum ada (belum scan QR). Jalankan dulu:  npm run setup  — di terminal, terus scan QR-nya.'
    );
  }
  const shouldPrintQr = printQr ?? allowQr;

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

  let version;
  try {
    ({ version } = await fetchLatestBaileysVersion());
  } catch {
    version = undefined; // jaringan lagi bermasalah → pakai default Baileys
  }

  const sock = makeWASocket({
    version,
    auth: state,
    browser: Browsers.macOS('Desktop'),
    logger: pino({ level: 'silent' }),
    markOnlineOnConnect: false,
  });
  sock.ev.on('creds.update', saveCreds);

  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timeout ${timeoutMs / 1000}s nunggu koneksi WA. Coba lagi.`)),
      timeoutMs
    );

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        // Baileys tidak lagi mencetak QR sendiri → kita render di sini.
        if (shouldPrintQr) {
          console.log('\n📱 Scan QR ini pakai WhatsApp lo:');
          console.log('   WA → ☰ → Perangkat Tertaut → Hubungkan Perangkat\n');
          qrcode.generate(qr, { small: true });
          console.log('\n   (QR ke-expire tiap ±20 detik — kalau lewat, QR baru muncul lagi)\n');
        }
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
          reject(new Error('Sesi WA ke-logout. Jalankan ulang:  npm run setup  (scan QR lagi).'));
        } else {
          reject(new Error(`Koneksi WA tutup (code ${code}). Coba jalankan lagi.`));
        }
      }
    });
  });

  return { sock, close: () => sock.end() };
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
