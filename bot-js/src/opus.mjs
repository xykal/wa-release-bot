// ============================================================================
//  MP3 → voice note (Ogg Opus) — tanpa ffmpeg, jalan di HP.
//
//  Kenapa: saluran WA cuma nerima VOICE NOTE (ptt), bukan file audio biasa.
//  Audio MP3 yang dikirim ke saluran tampil "tidak didukung". Voice note WA
//  wajib Ogg Opus, jadi potongan MP3 60 dtk diubah dulu di sini:
//    mpg123 (WASM) decode → mono 48 kHz → libopus (WASM, opusscript) → Ogg.
//  Semua di memori (~12 MB buat 60 dtk), habis itu dibuang.
// ============================================================================
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { MPEGDecoder } from 'mpg123-decoder';
import buatModulOpus from 'opusscript/build/opusscript_native_wasm.js';

// ---- libopus (WASM) --------------------------------------------------------
// opusscript aslinya baca file .wasm dari sebelah file JS-nya. Di bundle APK
// file itu nggak ada, jadi binary-nya di-embed (lihat plugin di build.mjs)
// lalu dikasih langsung ke loader emscripten-nya.
let modulOpus = null;
async function ambilModulOpus() {
  if (modulOpus) return modulOpus;
  let wasmBinary;
  try {
    wasmBinary = (await import('virtual:opus-wasm')).default; // versi bundle
  } catch {
    // jalan langsung dari src/ (tes): baca file .wasm aslinya
    const req = createRequire(import.meta.url);
    wasmBinary = fs.readFileSync(req.resolve('opusscript/build/opusscript_native_wasm.wasm'));
  }
  modulOpus = buatModulOpus({ wasmBinary });
  return modulOpus;
}

const APLIKASI_AUDIO = 2049; // OPUS_APPLICATION_AUDIO (musik, bukan suara)
const SET_BITRATE = 4002; // OPUS_SET_BITRATE_REQUEST
const PRE_SKIP = 312; // lookahead encoder libopus @48 kHz
const FRAME = 960; // 20 ms @48 kHz

// ---- Ogg -------------------------------------------------------------------
const TABEL_CRC = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let r = i << 24;
  for (let j = 0; j < 8; j++) r = (r & 0x80000000) ? ((r << 1) ^ 0x04c11db7) : (r << 1);
  TABEL_CRC[i] = r >>> 0;
}
function crcOgg(buf) {
  let c = 0;
  for (let i = 0; i < buf.length; i++) c = ((c << 8) ^ TABEL_CRC[((c >>> 24) ^ buf[i]) & 0xff]) >>> 0;
  return c;
}

/** Satu halaman Ogg berisi beberapa paket utuh. flag: 2 = awal, 4 = akhir. */
export function halamanOgg(paket, granule, serial, seq, flag) {
  const seg = [];
  for (const p of paket) {
    let n = p.length;
    while (n >= 255) { seg.push(255); n -= 255; }
    seg.push(n);
  }
  if (seg.length > 255) throw new Error('Halaman Ogg kepenuhan');
  const h = Buffer.alloc(27 + seg.length);
  h.write('OggS', 0, 'latin1');
  h[4] = 0;
  h[5] = flag;
  h.writeBigInt64LE(BigInt(granule), 6);
  h.writeUInt32LE(serial, 14);
  h.writeUInt32LE(seq, 18);
  h[26] = seg.length;
  Buffer.from(seg).copy(h, 27);
  const out = Buffer.concat([h, ...paket]);
  out.writeUInt32LE(crcOgg(out), 22);
  return out;
}

/** Float32 stereo/mono @sr → Int16 mono @48 kHz (interpolasi linear). */
export function keMono48k(channelData, sampleRate) {
  const L = channelData[0];
  const R = channelData[1] || L;
  const n = L.length;
  const rasio = sampleRate / 48000;
  const m = Math.floor(n / rasio);
  const pcm = new Int16Array(m);
  for (let i = 0; i < m; i++) {
    const x = i * rasio;
    const a = Math.floor(x);
    const f = x - a;
    const b = Math.min(a + 1, n - 1);
    const v = ((L[a] + R[a]) * (1 - f) + (L[b] + R[b]) * f) / 2;
    pcm[i] = Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
  }
  return pcm;
}

/** Int16 mono 48 kHz → Ogg Opus. */
export async function pcmKeOgg(pcm, { kbps = 64 } = {}) {
  const M = await ambilModulOpus();
  const enc = new M.OpusScriptHandler(48000, 1, APLIKASI_AUDIO);
  // Keanehan opusscript: input ditaruh di HEAPU16 SATU BYTE PER SLOT (persis
  // kayak wrapper index.js-nya). Jadi butuh FRAME*2 slot × 2 byte.
  const inPtr = M._malloc(FRAME * 2 * 2);
  const outPtr = M._malloc(4000);
  try {
    enc._encoder_ctl(SET_BITRATE, kbps * 1000);
    const serial = (Math.random() * 2 ** 32) >>> 0;
    const head = Buffer.alloc(19);
    head.write('OpusHead', 0, 'latin1');
    head[8] = 1; // versi
    head[9] = 1; // mono
    head.writeUInt16LE(PRE_SKIP, 10);
    head.writeUInt32LE(48000, 12);
    const vendor = Buffer.from('wa-release-bot');
    const tags = Buffer.alloc(16 + vendor.length);
    tags.write('OpusTags', 0, 'latin1');
    tags.writeUInt32LE(vendor.length, 8);
    vendor.copy(tags, 12); // jumlah komentar = 0 (4 byte terakhir)
    const hal = [halamanOgg([head], 0, serial, 0, 2), halamanOgg([tags], 0, serial, 1, 0)];

    // + PRE_SKIP: encoder telat 312 sampel, jadi ekornya ikut di-encode (diisi hening)
    const total = Math.max(1, Math.ceil((pcm.length + PRE_SKIP) / FRAME));
    const frame = new Int16Array(FRAME);
    let seq = 2;
    let granule = 0;
    let antre = [];
    for (let k = 0; k < total; k++) {
      frame.fill(0);
      frame.set(pcm.subarray(k * FRAME, k * FRAME + FRAME));
      M.HEAPU16.set(new Uint8Array(frame.buffer), inPtr >> 1);
      const len = enc._encode(inPtr, FRAME * 2, outPtr, FRAME);
      if (len < 0) throw new Error('Opus encode gagal (' + len + ')');
      antre.push(Buffer.from(M.HEAPU8.subarray(outPtr, outPtr + len)));
      granule += FRAME;
      const akhir = k === total - 1;
      if (antre.length >= 50 || akhir) {
        const g = akhir ? Math.min(granule, pcm.length + PRE_SKIP) : granule;
        hal.push(halamanOgg(antre, g, serial, seq++, akhir ? 4 : 0));
        antre = [];
      }
    }
    return Buffer.concat(hal);
  } finally {
    M._free(inPtr);
    M._free(outPtr);
    try { M.OpusScriptHandler.destroy_handler(enc); } catch { /* ignore */ }
  }
}

/** MP3 (Buffer) → { data: Ogg Opus, detik }. */
export async function mp3KeVoiceNote(mp3, opsi = {}) {
  const dec = new MPEGDecoder();
  await dec.ready;
  let hasil;
  try {
    hasil = dec.decode(new Uint8Array(mp3.buffer, mp3.byteOffset, mp3.byteLength));
  } finally {
    dec.free();
  }
  if (!hasil?.samplesDecoded) throw new Error('MP3-nya nggak kebaca');
  const pcm = keMono48k(hasil.channelData, hasil.sampleRate);
  const data = await pcmKeOgg(pcm, opsi);
  return { data, detik: Math.round(pcm.length / 48000) };
}
