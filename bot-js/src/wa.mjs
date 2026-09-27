// Klien WhatsApp (Baileys). Prinsip: nyambung HANYA pas perlu, selesai →
// disconnect. Session disimpan di file, jadi nautin cuma sekali seumur hidup.
//
// Cara nautin ada dua:
//   - QR            : tampil di layar, discan dari HP LAIN.
//   - Pairing code  : 8 huruf, diketik di WA (Perangkat tertaut → Tautkan
//                     dengan nomor telepon). Ini yang cocok kalau bot-nya
//                     jalan di HP yang sama dengan WA-nya — QR di layar sendiri
//                     kan nggak bisa discan.

import pino from 'pino';
import fs from 'node:fs';
import path from 'node:path';
import { resolveTarget } from './channel.mjs';
import { normalisasiNomor } from './nomor.mjs';
import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  Browsers,
  proto,
} from '@whiskeysockets/baileys';

export { normalisasiNomor };

/**
 * Status sesi di folder session:
 *   'kosong'   → belum pernah ditautkan
 *   'setengah' → pairing code udah diminta tapi nggak pernah diselesaikan
 *                (creds.me ada, tapi `account` — tanda tangan dari HP — belum)
 *   'siap'     → udah tertaut, tinggal nyambung
 */
export function statusSesi(sessionDir) {
  const f = path.join(sessionDir, 'creds.json');
  if (!fs.existsSync(f)) return 'kosong';
  try {
    const c = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (c?.me?.id && c?.account) return 'siap';
    return 'setengah';
  } catch {
    return 'setengah';
  }
}

export function hapusSesi(sessionDir) {
  fs.rmSync(sessionDir, { recursive: true, force: true });
}

// Kode yang artinya "coba sambung lagi aja", bukan gagal beneran.
//   515 restartRequired → NORMAL tepat setelah QR discan / pairing code
//                         dimasukin. WA emang nyuruh nyambung ulang.
//   408 timedOut, 428 connectionClosed, 503 unavailable → jaringan goyang.
const KODE_ULANG = new Set([
  DisconnectReason.restartRequired,
  DisconnectReason.timedOut,
  DisconnectReason.connectionClosed,
  503,
]);

/**
 * @param {{
 *   sessionDir: string,
 *   mode?: 'none'|'qr'|'pairing',   // none = cuma pakai sesi yang ada
 *   phone?: string,                  // wajib kalau mode = 'pairing'
 *   emitQr?: (qr: string) => void,
 *   emitPairingCode?: (code: string) => void,
 *   onStatus?: (msg: string) => void,
 *   timeoutMs?: number,
 *   batal?: { aktif: boolean, sock: any },  // buat ngebatalin setup yang lagi jalan
 *   onTertaut?: () => void                  // dipanggil sekali: HP udah nerima QR/kode
 * }} opts
 */
export async function connectToWhatsApp({
  sessionDir,
  mode = 'none',
  phone,
  emitQr,
  emitPairingCode,
  onStatus,
  timeoutMs = 180000,
  batal,
  onTertaut,
}) {
  const status = (m) => { if (onStatus) onStatus(m); };
  const sesi = statusSesi(sessionDir);

  if (mode === 'none' && sesi !== 'siap') {
    throw new Error('WA belum ditautkan. Tekan "Tautkan WA" di app (pakai pairing code atau QR).');
  }
  if (mode !== 'none' && sesi === 'setengah') {
    // Sisa pairing yang nggak selesai bikin login berikutnya ditolak WA.
    status('🧹 Sisa tautan yang nggak selesai dibuang dulu.');
    hapusSesi(sessionDir);
  }

  let nomor = null;
  if (mode === 'pairing') {
    nomor = normalisasiNomor(phone);
    if (!nomor) throw new Error('Nomor WA buat pairing code nggak valid. Contoh: 6281234567890');
  }

  let version;
  try {
    ({ version } = await fetchLatestBaileysVersion());
  } catch {
    version = undefined; // jaringan bermasalah → pakai versi default Baileys
  }

  const batasWaktu = Date.now() + timeoutMs;
  let kodeSudahDiminta = false;
  let percobaan = 0;
  let tautBaru = false; // koneksi ini hasil nautin baru (bukan login biasa)
  let sudahLaporTertaut = false;
  const laporTertaut = () => {
    if (sudahLaporTertaut || !tautBaru) return;
    sudahLaporTertaut = true;
    if (onTertaut) onTertaut();
  };

  // Sesi dibaca SEKALI, lalu objek yang sama dipakai terus waktu nyambung
  // ulang. Dulu dibaca ulang dari file tiap nyambung — padahal nyimpennya
  // (saveCreds) jalan di belakang dan belum tentu kelar pas 515 datang.
  // Hasilnya socket kedua kadang dapat sesi lama → minta QR lagi.
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const sesiSiap = () => Boolean(state.creds?.me?.id && state.creds?.account);

  for (;;) {
    percobaan++;
    if (batal?.aktif) throw new Error('Dibatalin.');
    const sock = makeWASocket({
      version,
      auth: state,
      // Pairing code cuma diterima WA kalau "browser"-nya dikenal.
      browser: Browsers.macOS('Chrome'),
      logger: pino({ level: 'silent' }),
      markOnlineOnConnect: false, // bot jangan muncul "online"
      // Hemat batre & kuota: jangan tarik riwayat chat sama sekali.
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => false,
      generateHighQualityLinkPreview: false,
      // Pairing code: kasih waktu ngetik yang lebih lega (QR-nya nggak dipakai).
      qrTimeout: mode === 'pairing' ? 60000 : undefined,
    });
    if (batal) batal.sock = sock;
    sock.ev.on('creds.update', saveCreds);
    let notifPendingKelar = null; // dipanggil waktu WA selesai ngirim antrean notifikasi
    let pendingSudah = false;

    const hasil = await new Promise((resolve) => {
      const sisa = Math.max(5000, batasWaktu - Date.now());
      const timer = setTimeout(() => resolve({ ok: false, err: new Error(
        `Timeout ${Math.round(timeoutMs / 1000)} dtk nunggu koneksi WA. Coba lagi.`) }), sisa);

      sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr, receivedPendingNotifications } = update;
        if (receivedPendingNotifications) {
          pendingSudah = true;
          if (notifPendingKelar) notifPendingKelar();
        }

        if (qr) {
          tautBaru = true;
          if (mode === 'pairing') {
            // Event `qr` pertama = socket udah siap nerima permintaan tautan.
            if (!kodeSudahDiminta) {
              kodeSudahDiminta = true;
              try {
                const kode = await sock.requestPairingCode(nomor);
                const rapi = kode.length === 8 ? `${kode.slice(0, 4)}-${kode.slice(4)}` : kode;
                if (emitPairingCode) emitPairingCode(rapi);
                status(`🔑 Pairing code: ${rapi} — masukin di WA lo.`);
              } catch (e) {
                clearTimeout(timer);
                resolve({ ok: false, err: new Error('Gagal minta pairing code: ' + e.message) });
              }
            }
          } else if (mode === 'qr') {
            if (emitQr) emitQr(qr);
            status('Menunggu scan QR...');
          } else {
            clearTimeout(timer);
            resolve({ ok: false, err: new Error('Sesi WA nggak berlaku lagi. Tautkan ulang.') });
          }
        }

        if (connection === 'open') {
          clearTimeout(timer);
          resolve({ ok: true });
        } else if (connection === 'close') {
          clearTimeout(timer);
          const code = lastDisconnect?.error?.output?.statusCode;
          resolve({ ok: false, code, err: lastDisconnect?.error });
        }
      });
    });

    if (hasil.ok) {
      status('Terhubung ke WA');
      laporTertaut();
      if (tautBaru) {
        // PENTING: habis nautin, JANGAN langsung diputus. HP lagi nunggu
        // perangkat baru ini: login ulang, upload pre-key, terima & balas
        // notifikasi sinkron riwayat. Kalau socket keburu ditutup, WA di HP
        // muter "Sedang masuk..." lama banget lalu bisa gagal nautin.
        status('⏳ Nyelesaiin tautan sama WhatsApp (±20 dtk) — jangan tutup app...');
        await new Promise((resolve) => {
          const maks = setTimeout(resolve, 60000);
          const selesai = () => { clearTimeout(maks); setTimeout(resolve, 12000); };
          notifPendingKelar = () => { notifPendingKelar = null; selesai(); };
          if (pendingSudah) notifPendingKelar();
          // jaga-jaga kalau event-nya nggak datang: minimal 20 dtk
          setTimeout(() => { if (notifPendingKelar) { notifPendingKelar = null; selesai(); } }, 20000);
        });
        status('✅ Tautan beres di sisi WhatsApp.');
      }
      return { sock, close: () => { try { sock.end(undefined); } catch { /* ignore */ } } };
    }

    try { sock.end(undefined); } catch { /* ignore */ }

    if (hasil.code === DisconnectReason.loggedOut) {
      hapusSesi(sessionDir);
      throw new Error('Sesi WA ke-logout (perangkat dilepas dari HP). Tautkan ulang.');
    }
    if (hasil.code === DisconnectReason.restartRequired) {
      status('🔁 Tautan diterima WA, nyambung ulang (ini normal)...');
      laporTertaut();
    } else if (batal?.aktif) {
      throw new Error('Dibatalin.');
    } else if (hasil.code === DisconnectReason.timedOut && !sesiSiap()) {
      throw new Error(mode === 'pairing'
        ? 'Kode-nya kelamaan nggak dimasukin (kadaluarsa). Minta kode baru.'
        : 'QR-nya kelamaan nggak discan. Coba lagi.');
    } else if (KODE_ULANG.has(hasil.code) && percobaan < 4 && sesiSiap()) {
      status(`🔁 Koneksi putus (code ${hasil.code}), coba lagi...`);
      await new Promise((r) => setTimeout(r, 2000 * percobaan));
    } else if (hasil.code == null && hasil.err) {
      throw hasil.err;
    } else {
      throw new Error(`Koneksi WA tutup (code ${hasil.code}). Coba lagi.`);
    }

    if (Date.now() > batasWaktu) throw new Error('Kelamaan nunggu WA. Coba lagi.');
    if (percobaan >= 6) throw new Error('WA nyuruh nyambung ulang terus. Coba lagi bentar lagi.');
  }
}

/**
 * Ubah target channel jadi JID. Logikanya ada di channel.mjs (file itu nggak
 * import apa-apa, jadi bisa dites tanpa Baileys).
 */
export async function resolveChannel(sock, target, log) {
  return resolveTarget(sock, target, log);
}

export async function sendText(sock, jid, text) {
  await sock.sendMessage(jid, { text });
}

/**
 * Kirim pesan ke CHANNEL sebagai "Pertanyaan" (fitur saluran WA: follower bisa
 * bales, balasannya cuma sampai ke admin). Di protokol WA ini pesan teks biasa
 * yang dibungkus `questionMessage`. Buat grup / chat biasa → teks biasa.
 */
export async function sendPertanyaan(sock, jid, text) {
  if (!String(jid).endsWith('@newsletter')) return sendText(sock, jid, text);
  const pesan = proto.Message.fromObject({
    questionMessage: { message: { extendedTextMessage: { text } } },
  });
  await sock.relayMessage(jid, pesan, {});
}
