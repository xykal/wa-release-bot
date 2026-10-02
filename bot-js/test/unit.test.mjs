// ============================================================================
//  Unit test engine bot — jalan di Node biasa (nggak butuh HP / WhatsApp).
//  Jalankan:  npm test
// ============================================================================
// Polyfill WebCrypto HARUS paling atas: wa.mjs (diimpor di bawah) memuat Baileys
// yang membaca globalThis.crypto.subtle saat modul dievaluasi; di Node 18.20.4
// (runtime APK) global itu belum ada. Di Node 20+ baris ini tidak berefek.
import '../polyfills/webcrypto.cjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { parseRepo, fetchLatestRelease } from '../src/github.mjs';
import { bacaTarget, JENIS, pesanCaraIsiChannel, linkChannel } from '../src/channel.mjs';
import { formatReleasePost, formatTestMessage, formatTesGrup, AJAKAN_BALAS, mdKeWa, potongAman, formatTanggal, formatLaporGagal, formatUkuran } from '../src/format.mjs';
import { putuskanRilis, pendingBerikut, errorAmbigu, tagKeSemver, MAKS_PERCOBAAN } from '../src/rilis.mjs';
import { kirimKeChannel, jidSendiri, laporKeDiri, pakaiPertanyaan, sendPertanyaan, sendText, teksDenganTagline } from '../src/wa.mjs';
import { proto } from '@whiskeysockets/baileys';
import { kumpulkanNodeMessage, susunEntri, jenisPesan } from '../src/rekam.mjs';
import { BRAND, TANDA_TANGAN } from '../src/config/brand.mjs';
import { kelompokHitam, bukaBlokir, labelOrang } from '../src/grup.mjs';
import { createBridge } from '../src/bridge.mjs';
import { buatAksiPesan } from '../src/mesin/aksi-pesan.mjs';
import { buatAksiMedia } from '../src/mesin/aksi-media.mjs';
import { normalisasiNomor } from '../src/nomor.mjs';
import {
  rapikanJid, identitas, identitasSama, cariYangKeluar, catatAnggota, putuskan, daftarHitamManual, namaOrang,
} from '../src/grup.mjs';

test('tagline SukiBot: teks WhatsApp diberi footer sekali saja', async () => {
  assert.equal(teksDenganTagline('Info rilis'), 'Info rilis\n\n— SukiBot');
  assert.equal(teksDenganTagline('Info\n\n— SukiBot'), 'Info\n\n— SukiBot');
  const terkirim = [];
  await sendText({ sendMessage: async (...args) => terkirim.push(args) }, '1@s.whatsapp.net', 'Hai');
  assert.deepEqual(terkirim, [['1@s.whatsapp.net', { text: 'Hai\n\n— SukiBot' }]]);
});

test('.brat: bridge request bounded, result sent as WebP sticker to private self-chat', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sukibot-brat-'));
  const events = [];
  const balasan = [];
  const keluar = [];
  const ctx = { dataDir, bridge: { send: (obj) => events.push(obj) }, tungguStiker: new Set() };
  const sock = {
    user: { id: '628111:3@s.whatsapp.net' },
    sendMessage: async (jid, isi) => keluar.push({ jid, isi }),
  };
  const aksi = buatAksiMedia(ctx, {
    log() {}, jawab: async (_sock, teks) => balasan.push(teks), unduhMedia: async () => Buffer.alloc(0),
    papan: { stiker: 0 }, emitStatus() {},
  });
  try {
    await aksi.buatBrat(sock, '  halo\n dunia  ');
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'buat_brat');
    assert.equal(events[0].teks, 'halo dunia');
    await aksi.buatBrat(sock, '😀'.repeat(49));
    assert.equal(events.length, 1, 'teks lebih dari 48 code point ditolak');

    const id = events[0].id;
    const dirStiker = path.join(dataDir, 'stiker');
    fs.mkdirSync(dirStiker, { recursive: true });
    fs.writeFileSync(path.join(dirStiker, `keluar-${id}.webp`), Buffer.from('webp'));
    await aksi.kirimStikerJadi({ id, file: `stiker/keluar-${id}.webp` }, sock);
    assert.equal(keluar.length, 1);
    assert.equal(keluar[0].jid, '628111@s.whatsapp.net');
    assert.equal(keluar[0].isi.mimetype, 'image/webp');
    assert.equal(ctx.tungguStiker.size, 0);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('.storygrup: fail closed instead of misusing statusJidList as native mention', async () => {
  const balasan = [];
  let unduh = 0;
  const aksi = buatAksiMedia({ cfg: {}, dataDir: os.tmpdir() }, {
    log() {}, jawab: async (_sock, teks) => balasan.push(teks),
    unduhMedia: async () => { unduh += 1; return Buffer.from('media'); },
    papan: { story: 0 }, emitStatus() {},
  });
  await aksi.kirimStory({}, { message: { imageMessage: {} } }, { tagGrup: true });
  assert.equal(unduh, 0);
  assert.match(balasan[0], /native/);
});

// ---------------------------------------------------------------- parseRepo
test('parseRepo: format valid diterima', () => {
  assert.deepEqual(parseRepo('vercel/next.js'), { owner: 'vercel', repo: 'next.js' });
  assert.deepEqual(parseRepo('  xykal/wa-release-bot  '), {
    owner: 'xykal',
    repo: 'wa-release-bot',
  });
  assert.deepEqual(parseRepo('a_b-c/D.E_F'), { owner: 'a_b-c', repo: 'D.E_F' });
});

test('parseRepo: format salah ditolak dengan pesan yang jelas', () => {
  for (const bad of ['', 'tanpa-slash', 'a/b/c', 'https://github.com/a/b', '/b', 'a/']) {
    assert.throws(() => parseRepo(bad), /Format repo salah/, `harus ditolak: "${bad}"`);
  }
});

// ------------------------------------------------------------ formatRelease
const sampleRel = {
  tag: 'v1.4.0',
  name: 'Rilis Keren',
  body: '### Perubahan\n- Fitur A\n- Fix B',
  url: 'https://github.com/xykal/wa-release-bot/releases/tag/v1.4.0',
  author: 'xykal',
  publishedAt: '2026-09-20T10:00:00Z',
  isPrerelease: false,
};

test('formatReleasePost: memuat tag, repo, author, link', () => {
  const msg = formatReleasePost(sampleRel, 'xykal/wa-release-bot');
  assert.match(msg, /v1\.4\.0/);
  assert.match(msg, /xykal\/wa-release-bot/);
  assert.match(msg, /@xykal/);
  assert.match(msg, /releases\/tag\/v1\.4\.0/);
  assert.match(msg, /Fitur A/);
  // markdown WhatsApp: bold pakai *...*
  assert.match(msg, /\*wa-release-bot v1\.4\.0 udah rilis!\*/);
  assert.match(msg, /\*Apa yang baru:\*/);
  // bukan prerelease → nggak ada penanda
  assert.doesNotMatch(msg, /prerelease/);
});

test('formatReleasePost: prerelease dikasih penanda', () => {
  const msg = formatReleasePost({ ...sampleRel, isPrerelease: true }, 'a/b');
  assert.match(msg, /prerelease/);
});

test('formatReleasePost: body panjang dipotong, tetap ada link', () => {
  const msg = formatReleasePost({ ...sampleRel, body: 'x'.repeat(5000) }, 'a/b');
  assert.ok(msg.length < 5000, 'pesan harus lebih pendek dari body aslinya');
  assert.match(msg, /notes-nya panjang/);
  assert.match(msg, /releases\/tag\/v1\.4\.0/);
});

test('formatReleasePost: release tanpa deskripsi tetap valid', () => {
  const msg = formatReleasePost({ ...sampleRel, body: '' }, 'a/b');
  assert.match(msg, /nggak ada catatan/);
});

test('formatReleasePost: lampiran maks 3 baris + sisa dihitung, ukuran pakai koma', () => {
  const assets = [
    { name: 'app-arm64.apk', size: 26004000 },
    { name: 'engine.zip', size: 1150000 },
    { name: 'a.sha256', size: 90 },
    { name: 'b.sig', size: 2048 },
  ];
  const msg = formatReleasePost({ ...sampleRel, assets }, 'a/b');
  assert.match(msg, /📎 \*File:\*/);
  assert.match(msg, /• app-arm64\.apk \(24,8 MB\)/);
  assert.match(msg, /• a\.sha256 \(90 B\)/);
  assert.doesNotMatch(msg, /b\.sig/);
  assert.match(msg, /\+1 file lain di link/);
  assert.doesNotMatch(formatReleasePost({ ...sampleRel, assets: [] }, 'a/b'), /📎/);
});

test('formatReleasePost: pembuka ditentukan tag → retry ngirim teks identik', () => {
  const a = formatReleasePost(sampleRel, 'a/b');
  const b = formatReleasePost(sampleRel, 'a/b');
  assert.equal(a, b);
  assert.equal(formatUkuran(1024), '1 KB');
  assert.equal(formatUkuran(0), '0 B');
});

test('formatTestMessage: menyebut repo yang dipantau', () => {
  const msg = formatTestMessage('xykal/wa-release-bot');
  assert.match(msg, /xykal\/wa-release-bot/);
  assert.match(msg, /SETUP SUKSES/);
});

// --------------------------------------------------------------- bacaTarget
// Regresi penting: dulu field "Channel WA" nerima @username dan diproses pakai
// onWhatsApp() — itu buat nyari NOMOR HP, bukan channel, jadi selalu gagal.
// Sekarang username harus DITOLAK dengan pesan yang ngasih jalan keluar.
test('bacaTarget: link channel → kode undangan', () => {
  const t = bacaTarget('https://whatsapp.com/channel/0029VbAbCdEf1234567890xyZ');
  assert.equal(t.jenis, JENIS.INVITE);
  assert.equal(t.nilai, '0029VbAbCdEf1234567890xyZ');

  // tanpa protokol / pakai www / ada trailing slash → tetap kebaca
  assert.equal(bacaTarget('whatsapp.com/channel/0029Vaaaaabbbbb').jenis, JENIS.INVITE);
  assert.equal(bacaTarget('http://www.whatsapp.com/channel/0029Vaaaaabbbbb/').nilai, '0029Vaaaaabbbbb');
});

test('bacaTarget: JID channel & JID grup diterima apa adanya', () => {
  assert.deepEqual(bacaTarget('120363123456789012@newsletter'), {
    jenis: JENIS.JID,
    nilai: '120363123456789012@newsletter',
  });
  assert.deepEqual(bacaTarget('120363123456789012@g.us'), {
    jenis: JENIS.GRUP,
    nilai: '120363123456789012@g.us',
  });
});

test('bacaTarget: link undangan grup dikenali', () => {
  const t = bacaTarget('https://chat.whatsapp.com/AbCdEfGhIjKlMnOp');
  assert.equal(t.jenis, JENIS.LINK_GRUP);
  assert.equal(t.nilai, 'AbCdEfGhIjKlMnOp');
});

test('bacaTarget: kode undangan telanjang (tanpa link) dikenali', () => {
  const t = bacaTarget('0029VbAbCdEf1234567890xyZ');
  assert.equal(t.jenis, JENIS.INVITE);
});

test('bacaTarget: angka doang dikasih pesan yang nyuruh lengkapin akhiran', () => {
  const t = bacaTarget('120363123456789012');
  assert.equal(t.jenis, JENIS.SALAH);
  assert.match(t.pesan, /@newsletter/);
});

test('bacaTarget: username ditolak + ada jalan keluarnya', () => {
  for (const s of ['@nama_channel', 'nama_channel']) {
    const t = bacaTarget(s);
    assert.equal(t.jenis, JENIS.USERNAME, `harus kebaca username: ${s}`);
    assert.equal(t.nilai, '@nama_channel');
  }
  const pesan = pesanCaraIsiChannel('@nama_channel');
  assert.match(pesan, /LINK channel/);
  assert.match(pesan, /Bikin Channel/);
});

test('bacaTarget: kosong & sampah ditolak', () => {
  assert.equal(bacaTarget('').jenis, JENIS.SALAH);
  assert.equal(bacaTarget('   ').jenis, JENIS.SALAH);
  assert.equal(bacaTarget('ada spasi di sini').jenis, JENIS.SALAH);
  assert.equal(bacaTarget('!!!').jenis, JENIS.SALAH);
});

test('linkChannel: bikin link dari metadata channel', () => {
  assert.equal(
    linkChannel({ invite: '0029VbAbCd' }),
    'https://whatsapp.com/channel/0029VbAbCd'
  );
  assert.equal(linkChannel({}), null);
  assert.equal(linkChannel(null), null);
});

// ------------------------------------------------------------------- bridge
test('bridge: perintah lewat cmd.json ditangkap & file-nya dibersihkan', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'warbot-test-'));
  const received = [];

  const bridge = createBridge({
    dataDir: dir,
    wsPort: 0, // port acak / mati — file bridge harus tetap jalan
    log: () => {},
    onCommand: (cmd) => received.push(cmd),
  });

  bridge.send({ type: 'halo' });
  fs.writeFileSync(bridge.cmdFile, JSON.stringify({ type: 'ping', n: 1 }));

  // bridge polling tiap 250ms — kasih waktu beberapa siklus
  await new Promise((r) => setTimeout(r, 1200));
  bridge.close();

  assert.equal(received.length, 1, 'harus dapat tepat 1 perintah');
  assert.equal(received[0].type, 'ping');
  assert.equal(received[0].n, 1);
  assert.equal(fs.existsSync(bridge.cmdFile), false, 'cmd.json harus dihapus setelah dibaca');

  // event yang dikirim bridge harus tercatat di events.jsonl
  const lines = fs
    .readFileSync(bridge.eventsFile, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  assert.equal(lines[0].type, 'halo');

  fs.rmSync(dir, { recursive: true, force: true });
});

test('bridge: cmd.json rusak tidak bikin proses mati', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'warbot-test-'));
  const received = [];
  const bridge = createBridge({
    dataDir: dir,
    wsPort: 0,
    log: () => {},
    onCommand: (cmd) => received.push(cmd),
  });

  fs.writeFileSync(bridge.cmdFile, '{ ini bukan json');
  await new Promise((r) => setTimeout(r, 600));
  fs.writeFileSync(bridge.cmdFile, JSON.stringify({ type: 'masih-hidup' }));
  await new Promise((r) => setTimeout(r, 600));
  bridge.close();

  assert.equal(received.length, 1);
  assert.equal(received[0].type, 'masih-hidup');

  fs.rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------- nomor
test('normalisasiNomor: format Indonesia yang umum', () => {
  assert.equal(normalisasiNomor('0812-3456-7890'), '6281234567890');
  assert.equal(normalisasiNomor('+62 812 3456 7890'), '6281234567890');
  assert.equal(normalisasiNomor('812 3456 7890'), '6281234567890');
  assert.equal(normalisasiNomor('006281234567890'), '6281234567890');
  assert.equal(normalisasiNomor('14155552671'), '14155552671');
  assert.equal(normalisasiNomor('abc'), null);
  assert.equal(normalisasiNomor('123'), null);
  assert.equal(normalisasiNomor(''), null);
});

// ---------------------------------------------------------------- grup
test('rapikanJid: buang nomor device & samain c.us', () => {
  assert.equal(rapikanJid('628111:12@s.whatsapp.net'), '628111@s.whatsapp.net');
  assert.equal(rapikanJid('628111@c.us'), '628111@s.whatsapp.net');
  assert.equal(rapikanJid('999@lid'), '999@lid');
  assert.equal(rapikanJid('ngawur'), null);
});

test('identitas: gabung nomor HP + LID', () => {
  assert.deepEqual(
    identitas({ id: '999@lid', jid: '628111@s.whatsapp.net', lid: '999@lid' }).sort(),
    ['628111@s.whatsapp.net', '999@lid']
  );
  assert.deepEqual(identitas({ jid: '777@lid', phone_number: '628222@s.whatsapp.net' }).sort(),
    ['628222@s.whatsapp.net', '777@lid']);
});

test('identitasSama: chat sendiri cocok lewat LID atau PN walau JID berubah bentuk', () => {
  const akun = { id: '628111:4@s.whatsapp.net', lid: '999@lid' };
  assert.equal(identitasSama('999@lid', akun), true);
  assert.equal(identitasSama('628111@s.whatsapp.net', akun), true);
  assert.equal(identitasSama('888@lid', akun), false);
});

test('cariYangKeluar: yang hilang dari daftar = keluar; diri sendiri nggak dihitung', () => {
  const lama = [['628111@s.whatsapp.net', '1@lid'], ['628222@s.whatsapp.net'], ['628999@s.whatsapp.net']];
  // 628111 sekarang cuma kelihatan pakai LID-nya → tetap dianggap masih ada
  const sekarang = [{ id: '1@lid' }];
  const keluar = cariYangKeluar(lama, sekarang, ['628999:3@s.whatsapp.net']);
  assert.deepEqual(keluar, [['628222@s.whatsapp.net']]);
});

test('putuskan: yang di daftar hitam ditolak, sisanya di-approve', () => {
  const hitam = new Set(['628222@s.whatsapp.net', '5@lid']);
  assert.equal(putuskan({ jid: '628222@s.whatsapp.net' }, hitam), 'reject');
  assert.equal(putuskan({ jid: '5@lid', phone_number: '628333@s.whatsapp.net' }, hitam), 'reject');
  // dulu keluar pakai nomor, sekarang minta join kelihatan LID + nomor → tetap ketangkep
  assert.equal(putuskan({ jid: '8@lid', phone_number: '628222@s.whatsapp.net' }, hitam), 'reject');
  assert.equal(putuskan({ jid: '628444@s.whatsapp.net' }, hitam), 'approve');
});

test('daftarHitamManual: koma/spasi/baris + format lokal', () => {
  assert.deepEqual(
    daftarHitamManual('0812-3456-7890,\n+62811000111 ; 55@lid', normalisasiNomor).sort(),
    ['55@lid', '62811000111@s.whatsapp.net', '6281234567890@s.whatsapp.net']
  );
});

test('catatAnggota + namaOrang', () => {
  const c = catatAnggota([{ id: '1@lid', jid: '628111@s.whatsapp.net' }, { id: '2@lid' }]);
  assert.equal(c.length, 2);
  assert.equal(namaOrang(c[0]), '628111');
  assert.equal(namaOrang(c[1]), '2');
});

test('bridge: 2 perintah beruntun nggak ada yang hilang & event basi dibuang', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'warbot-test-'));
  // sisa event dari sesi lama (mis. QR basi)
  fs.writeFileSync(path.join(dir, 'events.jsonl'), JSON.stringify({ type: 'qr', qr: 'BASI' }) + '\n');
  const received = [];
  const bridge = createBridge({ dataDir: dir, wsPort: 0, log: () => {}, onCommand: (c) => received.push(c) });
  assert.equal(fs.readFileSync(bridge.eventsFile, 'utf8'), '', 'events.jsonl harus dikosongin waktu start');

  // app nambahin 2 perintah dalam waktu kurang dari 1 detik
  fs.appendFileSync(bridge.cmdFile, JSON.stringify({ type: 'configure' }) + '\n');
  fs.appendFileSync(bridge.cmdFile, JSON.stringify({ type: 'setup', cara: 'pairing' }) + '\n');
  await new Promise((r) => setTimeout(r, 1300));
  bridge.close();

  assert.deepEqual(received.map((c) => c.type), ['configure', 'setup']);
  fs.rmSync(dir, { recursive: true, force: true });
});

// ------------------------------------------------------ daftar hitam per orang
test('daftar hitam: dikelompokin per orang & bisa dibuka blokirnya pakai nomor', () => {
  const hitam = ['6281234@s.whatsapp.net', '999111@lid', '777000@lid'];
  const info = [{ ids: ['6281234@s.whatsapp.net', '999111@lid'], sejak: 1 }];
  const k = kelompokHitam(hitam, info);
  assert.equal(k.length, 2, '1 orang (2 identitas) + 1 entri lama');
  assert.equal(k[0].label, '+6281234');
  assert.equal(k[1].label, 'ID samaran …7000');

  const r = bukaBlokir(hitam, info, '081234', (x) => (x.replace(/\D/g, '').replace(/^0/, '62')) || null);
  assert.equal(r.dihapus.label, '+6281234');
  assert.deepEqual(r.hitam, ['777000@lid'], 'SEMUA identitas orang itu ikut kebuang');
  assert.equal(r.info.length, 0);

  const r2 = bukaBlokir(r.hitam, r.info, '777000@lid');
  assert.deepEqual(r2.hitam, []);
  assert.equal(bukaBlokir([], [], 'ngasal').dihapus, null);
  assert.equal(labelOrang(['1@lid']), 'ID samaran …1');
});

// ------------------------------------------------------ format pertanyaan
test('format: ajakan bales cuma muncul kalau diminta', () => {
  const rel = { tag: 'v1', name: 'v1', body: 'x', url: 'u', author: 'a', publishedAt: 0 };
  assert.ok(formatReleasePost(rel, 'o/r', { ajakBalas: true }).includes(AJAKAN_BALAS));
  assert.ok(!formatReleasePost(rel, 'o/r').includes(AJAKAN_BALAS));
  assert.ok(formatTestMessage('o/r', { ajakBalas: true }).includes(AJAKAN_BALAS));
  assert.ok(formatTesGrup('Grup A').includes('Grup A'));
});

test('perintah .rekam on memakai recorder yang diinjeksi ke aksi pesan', async () => {
  const dipanggil = [];
  const balasan = [];
  const ctx = { cfg: { jaga: { perintah: true } }, state: {} };
  const aksi = buatAksiPesan(ctx, {
    log() {},
    saveState() {},
    emitStatus() {},
    jawab: async (_sock, teks) => balasan.push(teks),
    adminDi: async () => false,
    papan: { perintah: 0 },
    media: { mintaStiker: async () => {}, kirimStory: async () => {} },
    rekam: {
      nyalakan: () => dipanggil.push('nyalakan'),
      matikan() {},
      kosongkan() {},
      kirimKe: async () => ({ ok: true, lokasi: 'Android/media/com.xykals.warelease/rekaman/rekaman-channel.json' }),
      ringkas: () => ({ aktif: false, jumlah: 0 }),
    },
  });

  await aksi.tanganiPerintah({}, { key: {} }, '.rekam on');
  assert.deepEqual(dipanggil, ['nyalakan']);
  assert.equal(balasan.some((teks) => teks.includes('Fitur rekam channel nggak kepasang')), false);
  assert.equal(balasan.some((teks) => teks.includes('Rekam channel NYALA')), true);

  await aksi.tanganiPerintah({}, { key: {} }, '.rekam kirim');
  assert.equal(balasan.some((teks) => teks.includes('Android/media/com.xykals.warelease/rekaman/rekaman-channel.json')), true);
});

test('perintah Brat dan welcome tetap dikendalikan dari chat pribadi', async () => {
  const stiker = [];
  const balasan = [];
  let simpan = 0;
  const ctx = { cfg: { jaga: { perintah: true }, grup: { aktif: true, target: 'https://chat.whatsapp.com/x' } }, state: {} };
  const aksi = buatAksiPesan(ctx, {
    log() {},
    saveState() { simpan += 1; },
    emitStatus() {},
    jawab: async (_sock, teks) => balasan.push(teks),
    adminDi: async () => false,
    papan: { perintah: 0 },
    media: { buatBrat: async (_sock, teks) => stiker.push(teks), mintaStiker: async () => {}, kirimStory: async () => {} },
  });

  await aksi.tanganiPerintah({}, { key: {} }, '.brat halo dunia');
  assert.deepEqual(stiker, ['halo dunia']);
  await aksi.tanganiPerintah({}, { key: {} }, '.welcome on');
  assert.equal(ctx.state.welcomeAktif, true);
  await aksi.tanganiPerintah({}, { key: {} }, '.welcome off');
  assert.equal(ctx.state.welcomeAktif, false);
  assert.equal(simpan, 2);
  assert.ok(balasan.some((teks) => teks.includes('hanya di grup yang dipantau')));
});

test('sendPertanyaan: channel → questionMessage, grup → teks biasa', async () => {
  // Baileys butuh WebCrypto global; Node 18 belum punya (di app ada polyfill-nya).
  if (!globalThis.crypto) globalThis.crypto = (await import('node:crypto')).webcrypto;
  const { sendPertanyaan } = await import('../src/wa.mjs');
  const kirim = [];
  const sock = {
    relayMessage: async (jid, msg) => kirim.push(['relay', jid, msg]),
    sendMessage: async (jid, isi) => kirim.push(['send', jid, isi]),
  };
  await sendPertanyaan(sock, '123@newsletter', 'halo');
  await sendPertanyaan(sock, '456@g.us', 'halo');
  assert.equal(kirim[0][0], 'relay');
  assert.equal(kirim[0][2].questionMessage.message.extendedTextMessage.text, 'halo\n\n— SukiBot');
  assert.deepEqual(kirim[1], ['send', '456@g.us', { text: 'halo\n\n— SukiBot' }]);
});

test('daftar hitam manual: nomor pakai spasi nggak pecah', () => {
  const hasil = daftarHitamManual('0812 3456 7890, +62 813-1111-2222\n6281399998888 6281377776666', normalisasiNomor);
  assert.deepEqual(hasil.sort(), [
    '6281234567890@s.whatsapp.net',
    '6281311112222@s.whatsapp.net',
    '6281377776666@s.whatsapp.net',
    '6281399998888@s.whatsapp.net',
  ]);
});

// ------------------------------------------------------------ lagu mood
import { jadwalBerikut, jamLokal, formatKataLagu, rapikanMp3, headerMp3 } from '../src/lagu.mjs';

test('jadwalBerikut: selalu di jam aktif & nggak mepet', () => {
  const tz = 7 * 60; // WIB
  let kini = Date.UTC(2026, 8, 27, 3, 0); // 10:00 WIB
  for (let i = 0; i < 200; i++) {
    const t = jadwalBerikut(kini, { perHari: 3, jamMulai: 9, jamSelesai: 22, tzMenit: tz });
    const j = jamLokal(t, tz);
    assert.ok(j >= 9 && j < 22, `jam ${j} di luar 9-22`);
    assert.ok(t - kini >= 45 * 60_000, 'jarak minimal 45 menit');
    kini = t;
  }
});

test('jadwalBerikut: jam selesai <= mulai → balik ke bawaan', () => {
  const t = jadwalBerikut(Date.UTC(2026, 0, 1, 0, 0), { perHari: 2, jamMulai: 20, jamSelesai: 5 }, () => 0.5);
  const j = jamLokal(t, 0);
  assert.ok(j >= 9 && j < 22);
});

// frame MP3 palsu: MPEG-1 Layer III, 128 kbps, 44.1 kHz → 417 byte, 1152 sampel
function frameMp3() {
  const f = Buffer.alloc(417);
  f[0] = 0xff; f[1] = 0xfb; f[2] = 0x90; f[3] = 0x64;
  return f;
}

test('headerMp3: baca frame 128k/44.1k', () => {
  const h = headerMp3(frameMp3(), 0);
  assert.deepEqual(h, { panjang: 417, sampel: 1152, sr: 44100 });
  assert.equal(headerMp3(Buffer.from([0xff, 0x00, 0, 0]), 0), null);
});

test('rapikanMp3: buang sampah depan/belakang, potong sesuai durasi', () => {
  const frames = Buffer.concat(Array.from({ length: 2000 }, frameMp3)); // ±52 dtk
  const kotor = Buffer.concat([Buffer.from([1, 2, 0xff, 0xfb, 9]), frames, Buffer.alloc(100, 7)]);
  const { data, detik } = rapikanMp3(kotor);
  assert.equal(data[0], 0xff);
  assert.equal(data.length, 2000 * 417);
  assert.equal(detik, 52);
  const pendek = rapikanMp3(kotor, 30);
  assert.equal(pendek.detik, 30);
  assert.throws(() => rapikanMp3(Buffer.alloc(5000)), /bukan data MP3/);
});

test('formatKataLagu: kata-kata + judul tebal', () => {
  const t = formatKataLagu({ kata: 'Kangen itu berat.', judul: 'Siapa Di Hatimu', artis: 'Rahmat Ekamatra' });
  assert.match(t, /^Kangen itu berat\./);
  assert.match(t, /🎧 \*Siapa Di Hatimu\* — Rahmat Ekamatra/);
  assert.doesNotMatch(t, /lagi rame/);
  assert.match(formatKataLagu({ kata: 'x', judul: 'J', artis: 'A', jenis: 'trend' }), /\*J\* — A\n_lagi rame diputer/);
  assert.doesNotMatch(formatKataLagu({ kata: 'x', judul: 'J', artis: 'A', jenis: 'lawas' }), /lagi rame/);
});

// ------------------------------------------------------------ hosting
import { bacaSpek, cocokPlatform } from '../src/pasang-modul.mjs';
import { cariFileUtama, bacaEnv } from '../src/hosting.mjs';
import { bacaTar, jalurAman } from '../src/tar.mjs';

test('bacaSpek: registry, alias, github, lokal', () => {
  assert.deepEqual(bacaSpek('a', '^1.2.0'), { jenis: 'registry', nama: 'a', rentang: '^1.2.0' });
  assert.deepEqual(bacaSpek('a', 'latest'), { jenis: 'registry', nama: 'a', rentang: '*' });
  assert.deepEqual(bacaSpek('x', 'npm:@s/p@^2'), { jenis: 'registry', nama: '@s/p', rentang: '^2' });
  assert.equal(bacaSpek('b', 'github:WhiskeySockets/libsignal-node').jenis, 'github');
  assert.equal(bacaSpek('b', 'WhiskeySockets/Baileys#master').ref, 'master');
  assert.equal(bacaSpek('b', 'git+https://github.com/u/r.git#v1').repo, 'r');
  assert.equal(bacaSpek('c', 'file:../lokal').jenis, 'lokal');
  assert.equal(bacaSpek('d', '1.x || >=2.5.0').jenis, 'registry');
});

test('cocokPlatform: os/cpu ala npm', () => {
  assert.equal(cocokPlatform({}, 'android', 'arm'), true);
  assert.equal(cocokPlatform({ os: ['win32'] }, 'android', 'arm'), false);
  assert.equal(cocokPlatform({ os: ['!win32'] }, 'android', 'arm'), true);
  assert.equal(cocokPlatform({ cpu: ['x64'] }, 'android', 'arm'), false);
});

test('bacaEnv: kutip, komentar, export', () => {
  assert.deepEqual(bacaEnv('A=1\n# x\nexport B="dua # bukan komen" # komen\nC=tiga # komen\n'), {
    A: '1', B: 'dua # bukan komen', C: 'tiga',
  });
});

test('cariFileUtama: script start > main > index.js', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'wrh-'));
  fs.mkdirSync(path.join(d, 'src'));
  fs.writeFileSync(path.join(d, 'src', 'main.js'), '');
  fs.writeFileSync(path.join(d, 'index.js'), '');
  fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ scripts: { start: 'node --no-warnings src/main.js' } }));
  assert.equal(path.relative(d, cariFileUtama(d).file), path.join('src', 'main.js'));
  fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ main: 'hilang.js' }));
  assert.equal(path.relative(d, cariFileUtama(d).file), 'index.js');
  fs.rmSync(d, { recursive: true, force: true });
});

test('tar: jalurAman nolak ../ & buang folder depan', () => {
  assert.equal(jalurAman('package/lib/a.js'), 'lib/a.js');
  assert.equal(jalurAman('package/../../etc/passwd'), null);
  assert.equal(jalurAman('package'), null);
});

test('tar: bacaTar baca file ustar sederhana', () => {
  const isi = Buffer.from('halo');
  const h = Buffer.alloc(512);
  h.write('package/a.txt', 0);
  h.write('0000644\0', 100);
  h.write(isi.length.toString(8).padStart(11, '0') + '\0', 124);
  h[156] = '0'.charCodeAt(0);
  const data = Buffer.concat([h, isi, Buffer.alloc(512 - isi.length), Buffer.alloc(1024)]);
  const e = bacaTar(data);
  assert.equal(e.length, 1);
  assert.equal(e[0].nama, 'package/a.txt');
  assert.equal(e[0].isi.toString(), 'halo');
});

// ---- voice note (opus.mjs) ----
import { pcmKeOgg, halamanOgg, keMono48k } from '../src/opus.mjs';

test('halamanOgg: header OggS + CRC keisi', () => {
  const h = halamanOgg([Buffer.from('halo')], 0, 1, 0, 2);
  assert.equal(h.subarray(0, 4).toString('latin1'), 'OggS');
  assert.equal(h[5], 2);
  assert.notEqual(h.readUInt32LE(22), 0);
});

test('keMono48k: 44.1k stereo → 48k mono, panjang pas', () => {
  const L = new Float32Array(44100).fill(0.5);
  const pcm = keMono48k([L, L], 44100);
  assert.equal(pcm.length, 48000);
  assert.ok(Math.abs(pcm[100] - 16384) < 2);
});

test('pcmKeOgg: 1 dtk → Ogg Opus valid (OpusHead + OpusTags + halaman akhir)', async () => {
  const pcm = new Int16Array(48000);
  for (let i = 0; i < pcm.length; i++) pcm[i] = Math.round(8000 * Math.sin(i / 48000 * 2 * Math.PI * 440));
  const ogg = await pcmKeOgg(pcm);
  assert.equal(ogg.subarray(0, 4).toString('latin1'), 'OggS');
  assert.ok(ogg.includes(Buffer.from('OpusHead')));
  assert.ok(ogg.includes(Buffer.from('OpusTags')));
  const akhir = ogg.lastIndexOf(Buffer.from('OggS'));
  assert.equal(ogg[akhir + 5], 4); // flag end-of-stream
  assert.equal(Number(ogg.readBigInt64LE(akhir + 6)), 48000 + 312);
});

import { jelaskanGalat } from '../src/lagu.mjs';
test('jelaskanGalat: "fetch failed" dibuka sampai kode aslinya', () => {
  const e = new TypeError('fetch failed', { cause: Object.assign(new Error('connect ENETUNREACH 2606:4700::1:443'), { code: 'ENETUNREACH' }) });
  const t = jelaskanGalat(e);
  assert.match(t, /fetch failed/);
  assert.match(t, /ENETUNREACH/);
});

// ------------------------------------------------------- github: ETag + timeout
function fakeFetch({ status = 200, body = null, etag = '', tangkap = null, tolak = null } = {}) {
  return async (url, init) => {
    if (tangkap) tangkap({ url, init });
    if (tolak) throw tolak;
    return {
      status,
      ok: status >= 200 && status < 300,
      headers: { get: (k) => (k.toLowerCase() === 'etag' ? etag : null) },
      json: async () => body,
    };
  };
}
const relJson = { tag_name: 'v1.2.3', name: 'Rilis', body: 'isi', html_url: 'https://x/y', author: { login: 'kall' }, published_at: '2026-09-29T00:00:00Z' };

test('github: header conditional + versi API ikut dikirim, ETag balik ke pemanggil', async () => {
  let dilihat;
  const rel = await fetchLatestRelease('a/b', { etag: 'W/"lama"', token: 'tok', fetchImpl: fakeFetch({ body: relJson, etag: 'W/"baru"', tangkap: (x) => { dilihat = x; } }) });
  assert.equal(dilihat.init.headers['If-None-Match'], 'W/"lama"');
  assert.equal(dilihat.init.headers['X-GitHub-Api-Version'], '2022-11-28');
  assert.equal(dilihat.init.headers.Authorization, 'Bearer tok');
  assert.ok(dilihat.init.signal, 'harus ada AbortSignal (timeout)');
  assert.equal(rel.tag, 'v1.2.3');
  assert.equal(rel.etag, 'W/"baru"');
  assert.equal(rel.notModified, false);
});

test('github: 304 -> notModified tanpa baca body', async () => {
  const rel = await fetchLatestRelease('a/b', { etag: 'W/"x"', fetchImpl: fakeFetch({ status: 304, body: null }) });
  assert.deepEqual(rel, { notModified: true, etag: 'W/"x"' });
});

test('github: timeout dilaporkan sebagai pesan yang jelas', async () => {
  const err = Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
  await assert.rejects(
    fetchLatestRelease('a/b', { timeoutMs: 1234, fetchImpl: fakeFetch({ tolak: err }) }),
    /nggak jawab dalam 1 dtk/,
  );
});

test('github: prerelease mode pakai daftar releases, ambil yang pertama', async () => {
  let dilihat;
  const rel = await fetchLatestRelease('a/b', { includePrereleases: true, fetchImpl: fakeFetch({ body: [{ ...relJson, prerelease: true }], tangkap: (x) => { dilihat = x; } }) });
  assert.match(dilihat.url, /\/releases\?per_page=1$/);
  assert.equal(rel.isPrerelease, true);
});

// ------------------------------------------------------------- rilis: keputusan
test('rilis: tagKeSemver menerima v-prefix, menolak tag bebas', () => {
  assert.equal(tagKeSemver('v1.6.7'), '1.6.7');
  assert.equal(tagKeSemver('2024.09.1'), '2024.9.1');
  assert.equal(tagKeSemver('nightly-2024'), null);
});

test('rilis: 304 -> tidur, first run -> baseline / post sesuai setting', () => {
  assert.equal(putuskanRilis({ state: {}, rel: { notModified: true } }).aksi, 'tidur');
  assert.equal(putuskanRilis({ state: {}, rel: { tag: 'v1.0.0' } }).aksi, 'baseline');
  assert.equal(putuskanRilis({ state: {}, rel: { tag: 'v1.0.0' }, postOnFirstRun: true }).aksi, 'post');
});

test('rilis: tag sama -> tidur, lebih baru -> post, lebih lama -> rollback', () => {
  const state = { lastTag: 'v1.5.0' };
  assert.equal(putuskanRilis({ state, rel: { tag: 'v1.5.0' } }).aksi, 'tidur');
  assert.equal(putuskanRilis({ state, rel: { tag: 'v1.5.1' } }).aksi, 'post');
  assert.equal(putuskanRilis({ state, rel: { tag: 'v2.0.0-rc.1' } }).aksi, 'post');
  assert.equal(putuskanRilis({ state, rel: { tag: 'v1.4.9' } }).aksi, 'rollback');
});

test('rilis: tag non-semver tetap diposting kalau beda', () => {
  assert.equal(putuskanRilis({ state: { lastTag: 'build-41' }, rel: { tag: 'build-42' } }).aksi, 'post');
  assert.equal(putuskanRilis({ state: { lastTag: 'v1.0.0' }, rel: { tag: 'latest' } }).aksi, 'post');
});

test('rilis: gagal MAKS_PERCOBAAN kali -> dilewati, kecuali dipicu manual', () => {
  const state = { lastTag: 'v1.0.0', pending: { tag: 'v1.1.0', percobaan: MAKS_PERCOBAAN } };
  assert.equal(putuskanRilis({ state, rel: { tag: 'v1.1.0' } }).aksi, 'lewati-gagal');
  assert.equal(putuskanRilis({ state, rel: { tag: 'v1.1.0' }, manual: true }).aksi, 'post');
  assert.equal(putuskanRilis({ state, rel: { tag: 'v1.2.0' } }).aksi, 'post', 'tag lain mulai dari nol');
});

test('rilis: pendingBerikut menghitung percobaan per tag, manual mulai ulang', () => {
  const p1 = pendingBerikut(null, 'v1.1.0');
  assert.equal(p1.percobaan, 1);
  const p2 = pendingBerikut(p1, 'v1.1.0');
  assert.equal(p2.percobaan, 2);
  assert.equal(p2.mulai, p1.mulai);
  assert.equal(pendingBerikut(p2, 'v1.2.0').percobaan, 1);
  assert.equal(pendingBerikut(p2, 'v1.1.0', { manual: true }).percobaan, 1);
});

test('rilis: errorAmbigu kenal timeout/408, bukan error biasa', () => {
  assert.equal(errorAmbigu(new Error('Timed Out')), true);
  assert.equal(errorAmbigu({ output: { statusCode: 408 }, message: 'x' }), true);
  assert.equal(errorAmbigu(new Error('not-authorized')), false);
});

// ------------------------------------------------------- wa: kirim tanpa dobel
function sockPalsu({ relayError = null } = {}) {
  const dikirim = [];
  return {
    dikirim,
    relayMessage: async (jid) => { if (relayError) throw relayError; dikirim.push(['pertanyaan', jid]); },
    sendMessage: async (jid) => { dikirim.push(['teks', jid]); },
  };
}

test('kirimKeChannel: default teks; pertanyaan cuma kalau diminta DAN target channel', async () => {
  const s0 = sockPalsu();
  assert.equal(await kirimKeChannel(s0, '1@newsletter', 'hai'), 'teks', 'default harus teks (format Pertanyaan belum terbukti)');
  assert.deepEqual(s0.dikirim, [['teks', '1@newsletter']]);
  const s1 = sockPalsu();
  assert.equal(await kirimKeChannel(s1, '1@newsletter', 'hai', { format: 'pertanyaan' }), 'pertanyaan');
  const s2 = sockPalsu();
  assert.equal(await kirimKeChannel(s2, '1@g.us', 'hai', { format: 'pertanyaan' }), 'teks');
  assert.equal(pakaiPertanyaan('1@newsletter'), false);
  assert.equal(pakaiPertanyaan('1@newsletter', 'pertanyaan'), true);
  assert.equal(pakaiPertanyaan('1@g.us', 'pertanyaan'), false);
});

test('sendPertanyaan: payload questionMessage + messageSecret 32 byte (tebakan, ditandai eksperimental)', async () => {
  let terkirim = null;
  const sock = { relayMessage: async (jid, pesan) => { terkirim = { jid, pesan }; } };
  await sendPertanyaan(sock, '1@newsletter', 'halo');
  assert.equal(terkirim.jid, '1@newsletter');
  assert.equal(terkirim.pesan.questionMessage.message.extendedTextMessage.text, 'halo\n\n— SukiBot');
  assert.equal(terkirim.pesan.messageContextInfo.messageSecret.length, 32);
});

test('kirimKeChannel: error jelas -> jatuh ke teks; error ambigu -> TIDAK kirim ulang', async () => {
  const s1 = sockPalsu({ relayError: new Error('not-acceptable') });
  assert.equal(await kirimKeChannel(s1, '1@newsletter', 'hai', { format: 'pertanyaan' }), 'teks');
  assert.deepEqual(s1.dikirim, [['teks', '1@newsletter']]);
  const s2 = sockPalsu({ relayError: new Error('Timed Out') });
  await assert.rejects(kirimKeChannel(s2, '1@newsletter', 'hai', { format: 'pertanyaan' }), /Timed Out/);
  assert.deepEqual(s2.dikirim, [], 'pesan mungkin sudah masuk, jangan dobel');
});

// ------------------------------------------------------------ format: markdown
test('mdKeWa: heading, bold, link, list, coret, komentar HTML', () => {
  const md = '## Apa yang baru\n\n- **Fix** login [#12](https://x/12)\n* ~~lama~~\n<!-- ignore -->\n[https://a.b](https://a.b)';
  const wa = mdKeWa(md);
  assert.match(wa, /^\*Apa yang baru\*/);
  assert.match(wa, /• \*Fix\* login #12 \(https:\/\/x\/12\)/);
  assert.match(wa, /• ~lama~/);
  assert.doesNotMatch(wa, /ignore/);
  assert.match(wa, /^https:\/\/a\.b$/m);
});

test('mdKeWa: blok kode dibiarkan utuh', () => {
  const md = 'x\n```\n## bukan heading\n**bukan bold**\n```';
  assert.equal(mdKeWa(md), md);
});

test('potongAman: tidak membelah emoji dan lebih suka batas baris', () => {
  const s = 'baris satu\nbaris dua 😀😀';
  const p = potongAman(s, s.length - 1);
  assert.doesNotMatch(p, /[\uD800-\uDBFF]$/);
  assert.equal(potongAman('a'.repeat(10) + '\n' + 'b'.repeat(10), 15), 'a'.repeat(10));
  assert.equal(potongAman('pendek', 100), 'pendek');
});

test('brand: string resmi dipakai di tanda tangan pesan', () => {
  assert.equal(BRAND, 'XyVerse Technology Global');
  assert.match(formatReleasePost(sampleRel, 'a/b'), /wa-release-bot \(XyVerse Technology Global\)/);
  assert.match(formatTestMessage('a/b'), /XyVerse Technology Global/);
  assert.match(TANDA_TANGAN, /XyVerse Technology Global$/);
});

test('formatTanggal: Indonesia tanpa ICU, zona ikut proses', () => {
  const t = new Date(2026, 8, 29, 10, 5); // 29 Sep 2026 = Selasa
  const s = formatTanggal(t);
  assert.match(s, /^Selasa, 29 September 2026 10\.05 (WIB|WITA|WIT|UTC[+-]\d\d(:\d\d)?)$/);
  assert.equal(formatTanggal(t, { jam: false }), 'Selasa, 29 September 2026');
  assert.equal(formatTanggal('bukan tanggal'), '');
  assert.match(formatReleasePost({ tag: 'v1', name: 'x', body: '', url: 'u', publishedAt: t.toISOString() }, 'a/b'), /Selasa, 29 September 2026/);
});

test('jidSendiri: buang suffix device, tolak yang bukan nomor', () => {
  assert.equal(jidSendiri({ user: { id: '6281234567890:12@s.whatsapp.net' } }), '6281234567890@s.whatsapp.net');
  assert.equal(jidSendiri({ user: { id: '6281234567890@s.whatsapp.net' } }), '6281234567890@s.whatsapp.net');
  assert.equal(jidSendiri({ user: { id: '' } }), null);
  assert.equal(jidSendiri({}), null);
});

test('laporKeDiri: kirim ke JID sendiri, tidak pernah melempar', async () => {
  const terkirim = [];
  const sock = { user: { id: '628111:3@s.whatsapp.net' }, sendMessage: async (jid, isi) => { terkirim.push([jid, isi.text]); } };
  assert.equal(await laporKeDiri(sock, 'halo', () => {}), true);
  assert.deepEqual(terkirim, [['628111@s.whatsapp.net', 'halo\n\n— SukiBot']]);

  const catatan = [];
  const rusak = { user: { id: '628111@s.whatsapp.net' }, sendMessage: async () => { throw new Error('putus'); } };
  assert.equal(await laporKeDiri(rusak, 'halo', (m) => catatan.push(m)), false);
  assert.match(catatan.join('\n'), /putus/);
  assert.equal(await laporKeDiri({}, 'halo', (m) => catatan.push(m)), false);
});

test('formatLaporGagal: sebut tag, repo, jumlah percobaan, error, cara ulang', () => {
  const app = formatLaporGagal({ tag: 'v2.0.0', repo: 'octo/demo', percobaan: 3, maks: 3, error: 'Timeout kirim' });
  assert.match(app, /v2\.0\.0/);
  assert.match(app, /octo\/demo/);
  assert.match(app, /3x berturut-turut/);
  assert.match(app, /Timeout kirim/);
  assert.match(app, /Cek sekarang/);
  assert.match(app, /wa-release-bot — XyVerse Technology Global/);
  const cli = formatLaporGagal({ tag: 'v2.0.0', repo: 'octo/demo', percobaan: 3, maks: 3, error: 'x'.repeat(1000), cli: true });
  assert.match(cli, /npm run once -- --ulang/);
  assert.ok(cli.length < 700, 'error panjang dipotong');
});

// ------------------------------------------------ rekam.mjs (perekam channel)
test('rekam: node <message><plaintext> -> jenis + JSON ringkas; string panjang dipotong', () => {
  const bytes = proto.Message.encode(proto.Message.fromObject({
    messageContextInfo: { messageSecret: new Uint8Array(32) },
    questionMessage: { message: { extendedTextMessage: { text: 'z'.repeat(500) } } },
  })).finish();
  const hasil = {
    tag: 'iq', attrs: {}, content: [
      { tag: 'messages', attrs: {}, content: [
        { tag: 'message', attrs: { server_id: '7', type: 'text' }, content: [{ tag: 'plaintext', attrs: {}, content: bytes }] },
        { tag: 'message', attrs: { server_id: '8' }, content: [{ tag: 'reactions', attrs: {}, content: [] }] },
      ] },
    ],
  };
  const entri = kumpulkanNodeMessage(hasil).map(susunEntri);
  assert.equal(entri.length, 2);
  assert.equal(entri[0].jenis, 'questionMessage>extendedTextMessage');
  assert.equal(entri[0].attrs.server_id, '7');
  assert.match(entri[0].pesan.questionMessage.message.extendedTextMessage.text, /…\[\+300\]$/);
  // Byte mentah ikut: yang penting justru field yang nggak dikenal proto ini.
  assert.equal(entri[0].byte, bytes.length);
  assert.deepEqual(Buffer.from(entri[0].b64, 'base64'), Buffer.from(bytes));
  assert.equal(entri[0].pesan.messageContextInfo.messageSecret, '[bytes 32]');
  assert.deepEqual(entri[1].tanpaPlaintext, ['reactions']);
  assert.equal(jenisPesan({ conversation: 'x' }), 'conversation');
  assert.equal(jenisPesan({}), '(kosong)');
});

// ----------------------------------------------------------------------------
//  repo.mjs — multi repo: parsing daftar + state per repo + migrasi state lama
// ----------------------------------------------------------------------------
import { daftarRepo, repoTidakValid, teksRepo, stateRepo, sinkronState, ringkasTag, pendingAktif } from '../src/repo.mjs';
import { pecahEntri, channelRepo, teksEntri } from '../src/repo.mjs';

test('channel per repo: "owner/a|link" dipecah, channelRepo, teksEntri mempertahankan, teksRepo tidak', () => {
  const nilai = 'octo/demo|https://whatsapp.com/channel/0029Va, octo/kedua, https://github.com/octo/ketiga|120363@newsletter';
  assert.deepEqual(pecahEntri(nilai), [
    { repo: 'octo/demo', channel: 'https://whatsapp.com/channel/0029Va' },
    { repo: 'octo/kedua', channel: '' },
    { repo: 'octo/ketiga', channel: '120363@newsletter' },
  ]);
  assert.deepEqual(daftarRepo(nilai), ['octo/demo', 'octo/kedua', 'octo/ketiga']);
  assert.equal(channelRepo(nilai, 'octo/demo'), 'https://whatsapp.com/channel/0029Va');
  assert.equal(channelRepo(nilai, 'octo/kedua'), '');
  assert.equal(channelRepo(nilai, 'tidak/ada'), '');
  assert.equal(teksEntri(nilai + ', salah format|link'), 'octo/demo|https://whatsapp.com/channel/0029Va, octo/kedua, octo/ketiga|120363@newsletter');
  assert.equal(teksRepo(nilai), 'octo/demo, octo/kedua, octo/ketiga');
  assert.equal(teksEntri(''), '');
});

test('daftarRepo: koma/baris baru/URL github, unik, urutan dijaga, entri salah dipisah', () => {
  assert.deepEqual(daftarRepo('octo/demo'), ['octo/demo']);
  assert.deepEqual(daftarRepo(' https://github.com/octo/demo.git/ ,octo/kedua\nocto/demo'), ['octo/demo', 'octo/kedua']);
  assert.deepEqual(daftarRepo(['a/b', 'c/d']), ['a/b', 'c/d']);
  assert.deepEqual(daftarRepo(''), []);
  assert.deepEqual(daftarRepo(null), []);
  assert.deepEqual(repoTidakValid('octo/demo, bukan-repo, a/b/c'), ['bukan-repo', 'a/b/c']);
  assert.equal(teksRepo('octo/demo;octo/kedua salah'), 'octo/demo, octo/kedua');
});

test('sinkronState: field era satu repo pindah ke repo pertama sekali, repo hilang dibuang, reset kosongkan', () => {
  const state = { lastTag: 'v1.0.0', rilisEtag: '"e1"', pending: { tag: 'v1.1.0', percobaan: 2 }, postCount: 3 };
  assert.equal(sinkronState(state, ['a/x', 'b/y']), true);
  assert.deepEqual(state.repos['a/x'], { lastTag: 'v1.0.0', rilisEtag: '"e1"', pending: { tag: 'v1.1.0', percobaan: 2 } });
  assert.equal(state.lastTag, null);
  assert.equal(state.pending, null);
  assert.equal(state.postCount, 3, 'hitungan post lintas repo tidak disentuh');
  assert.equal(sinkronState(state, ['a/x', 'b/y']), false, 'panggilan kedua tidak mengubah apa-apa');

  stateRepo(state, 'b/y').lastTag = 'v2.0.0';
  assert.equal(sinkronState(state, ['b/y']), true);
  assert.equal(state.repos['a/x'], undefined, 'a/x dihapus dari setelan -> baseline-nya dibuang');
  assert.equal(state.repos['b/y'].lastTag, 'v2.0.0');

  assert.equal(sinkronState(state, ['b/y'], { reset: true }), true);
  assert.deepEqual(state.repos, {}, 'includePrereleases berubah -> semua dari nol');
  const tanpaRepo = { lastTag: 'v1' };
  sinkronState(tanpaRepo, []);
  assert.equal(tanpaRepo.lastTag, 'v1', 'belum ada repo (config kosong): warisan dibiarkan, tidak hilang');
});

test('ringkasTag + pendingAktif: satu repo tampil tag saja, banyak repo diringkas per nama', () => {
  const state = { repos: { 'a/x': { lastTag: 'v1.2.0', pending: null }, 'b/y': { lastTag: null, pending: { tag: 'v0.2.0', percobaan: 1 } } } };
  assert.equal(ringkasTag(state, ['a/x']), 'v1.2.0');
  assert.equal(ringkasTag(state, ['a/x', 'b/y']), 'x v1.2.0');
  state.repos['b/y'].lastTag = 'v0.1.0';
  assert.equal(ringkasTag(state, ['a/x', 'b/y']), 'x v1.2.0 · y v0.1.0');
  assert.equal(ringkasTag({}, ['a/x']), null);
  assert.deepEqual(pendingAktif(state, ['a/x', 'b/y']), { repo: 'b/y', tag: 'v0.2.0', percobaan: 1 });
  assert.equal(pendingAktif(state, ['a/x']), null);
});
