// ============================================================================
//  Unit test engine bot — jalan di Node biasa (nggak butuh HP / WhatsApp).
//  Jalankan:  npm test
// ============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { parseRepo } from '../src/github.mjs';
import { bacaTarget, JENIS, pesanCaraIsiChannel, linkChannel } from '../src/channel.mjs';
import { formatReleasePost, formatTestMessage, formatTesGrup, AJAKAN_BALAS } from '../src/format.mjs';
import { kelompokHitam, bukaBlokir, labelOrang } from '../src/grup.mjs';
import { createBridge } from '../src/bridge.mjs';
import { normalisasiNomor } from '../src/nomor.mjs';
import {
  rapikanJid, identitas, cariYangKeluar, catatAnggota, putuskan, daftarHitamManual, namaOrang,
} from '../src/grup.mjs';

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
  assert.match(msg, /\*RELEASE BARU DETEKSI!\*/);
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
  assert.match(msg, /tidak ada deskripsi/);
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

// ------------------------------------------------------ kirim + ack
async function siapBaileys() {
  // Baileys butuh WebCrypto global; Node 18 belum punya (di app ada polyfill-nya).
  if (!globalThis.crypto) globalThis.crypto = (await import('node:crypto')).webcrypto;
  return import('../src/kirim.mjs');
}

function sockPalsu({ ackAttrs = {}, tanpaAck = false } = {}) {
  const { EventEmitter } = require_('node:events');
  const ws = new EventEmitter();
  const kirim = [];
  const balasAck = (id, to) => {
    if (tanpaAck) return;
    setTimeout(() => ws.emit(`TAG:${id}`, { tag: 'ack', attrs: { id, class: 'message', from: to, ...ackAttrs } }), 5);
  };
  return {
    ws,
    kirim,
    user: { id: '6281111111111:1@s.whatsapp.net' },
    sendNode: async (node) => { kirim.push(['node', node]); balasAck(node.attrs.id, node.attrs.to); },
    sendMessage: async (jid, isi, opsi) => {
      kirim.push(['send', jid, isi, opsi]);
      balasAck(opsi.messageId, jid);
      return { key: { id: opsi.messageId }, message: { conversation: isi.text } };
    },
  };
}
import { createRequire as bikinRequire } from 'node:module';
const require_ = bikinRequire(import.meta.url);

test('kirimPertanyaan: stanza channel pakai <meta questiontype> + isQuestion, serverId dari ack', async () => {
  const { kirimPertanyaan } = await siapBaileys();
  const { proto } = await import('@whiskeysockets/baileys');
  const sock = sockPalsu({ ackAttrs: { server_id: '321' } });
  const h = await kirimPertanyaan(sock, '123@newsletter', 'halo');
  assert.equal(h.ok, true);
  assert.equal(h.serverId, '321');
  const node = sock.kirim[0][1];
  assert.equal(node.tag, 'message');
  assert.equal(node.attrs.to, '123@newsletter');
  assert.deepEqual(node.content[0], { tag: 'meta', attrs: { questiontype: 'question' }, content: undefined });
  assert.equal(node.content[1].tag, 'plaintext');
  const msg = proto.Message.decode(node.content[1].content);
  assert.equal(msg.questionMessage.message.extendedTextMessage.text, 'halo');
  assert.equal(msg.questionMessage.message.extendedTextMessage.contextInfo.isQuestion, true);
});

test('kirimTeks: ack error → dilempar dengan kode WA; tanpa ack → ok null', async () => {
  const { kirimTeks, pernahKirim } = await siapBaileys();
  const gagal = sockPalsu({ ackAttrs: { error: '479' } });
  await assert.rejects(() => kirimTeks(gagal, '1@g.us', 'x'), /479/);
  const diam = sockPalsu({ tanpaAck: true });
  const { tungguAck } = await siapBaileys();
  assert.equal(await tungguAck(diam, 'abc', 30), null);
  const ok = sockPalsu();
  const h = await kirimTeks(ok, '1@g.us', 'halo');
  assert.equal(h.ok, true);
  assert.ok(pernahKirim(h.id), 'pesan disimpan buat retry');
  assert.equal(ok.kirim[0][3].messageId, h.id);
});

test('ambilRespons: baca question_responses', async () => {
  const { ambilRespons } = await siapBaileys();
  const { proto } = await import('@whiskeysockets/baileys');
  const bytes = proto.Message.encode(proto.Message.fromObject({ extendedTextMessage: { text: 'mantap bang' } })).finish();
  const sock = {
    query: async (node) => {
      assert.equal(node.content[0].attrs.server_id, '99');
      return {
        tag: 'iq', attrs: {}, content: [{
          tag: 'question_responses', attrs: { server_id: '99' }, content: [{
            tag: 'question_response', attrs: {}, content: [
              { tag: 'message', attrs: { id: 'a', t: '1700000000' }, content: [{ tag: 'plaintext', attrs: {}, content: bytes }] },
              { tag: 'sender', attrs: { lid: '5@lid', notify_name: 'Budi' } },
              { tag: 'flags', attrs: {}, content: [{ tag: 'replied', attrs: {} }] },
            ],
          }],
        }],
      };
    },
  };
  const r = await ambilRespons(sock, '1@newsletter', 99);
  assert.deepEqual(r, [{ nama: 'Budi', teks: 'mantap bang', t: 1700000000000, dibalas: true }]);
});

// ------------------------------------------------------ helper pesan & mode
test('pesan: pisahPerintah, cariTeks, samarkan, artiError', async () => {
  const { pisahPerintah, cariTeks, samarkan, artiError, bacaAck } = await import('../src/pesan.mjs');
  assert.deepEqual(pisahPerintah('!INFO  grup a'), { perintah: '!info', argumen: ['grup', 'a'], sisa: 'grup a' });
  assert.equal(pisahPerintah('halo !info'), null);
  assert.equal(pisahPerintah('/menu').perintah, '!menu');
  assert.equal(cariTeks({ ephemeralMessage: { message: { extendedTextMessage: { text: '!rules', contextInfo: { quotedMessage: { conversation: 'lama' } } } } } }), '!rules');
  assert.equal(cariTeks({ imageMessage: { caption: 'cap' } }), 'cap');
  assert.equal(samarkan('+6281234567890'), '+62812****7890');
  assert.equal(samarkan('ID samaran …1'), 'ID samaran …1');
  assert.match(artiError('479'), /479 — /);
  assert.equal(bacaAck(null), null);
  assert.deepEqual(bacaAck({ attrs: { server_id: '7' } }), { ok: true, serverId: '7', t: null });
});

test('mode: jeda grup & faktor adaptif', async () => {
  const { jedaGrup, faktorBerikut, normalMode } = await import('../src/pesan.mjs');
  assert.equal(jedaGrup({ mode: 'berkala', dasarMenit: 5 }), 5 * 60_000);
  assert.equal(jedaGrup({ mode: 'pintar', dasarMenit: 5 }), 30 * 60_000);
  assert.equal(jedaGrup({ mode: 'adaptif', dasarMenit: 5, faktor: 4 }), 20 * 60_000);
  assert.equal(jedaGrup({ mode: 'adaptif', dasarMenit: 5, faktor: 64, maksMenit: 60 }), 60 * 60_000);
  let f = 1;
  for (let i = 0; i < 10; i++) f = faktorBerikut({ faktor: f, adaKegiatan: false, dasarMenit: 5, maksMenit: 60 });
  assert.equal(f, 12);
  assert.equal(faktorBerikut({ faktor: 8, adaKegiatan: true, dasarMenit: 5 }), 1);
  assert.equal(normalMode('ngasal'), 'berkala');
});

// ------------------------------------------------------ koneksi
test('koneksi: socket dipakai bareng, ditutup setelah sepi, eksklusif nutup dulu', async () => {
  const { createKoneksi } = await import('../src/koneksi.mjs');
  let dibuka = 0;
  let ditutup = 0;
  const status = [];
  const kon = createKoneksi({
    jedaTutupMs: 40,
    buka: async () => { dibuka++; return { sock: { n: dibuka, ev: { on() {} } }, close: () => { ditutup++; } }; },
    onBerubah: (v) => status.push(v),
  });
  const a = await kon.pakai(async (s) => s.n);
  const b = await kon.pakai(async (s) => s.n);
  assert.equal(a, 1);
  assert.equal(b, 1, 'socket kedua numpang yang pertama');
  assert.equal(kon.nyambung, true);
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(kon.nyambung, false);
  assert.equal(ditutup, 1);
  await kon.pakai(async () => {});
  await kon.eksklusif(async () => { assert.equal(kon.nyambung, false); });
  assert.equal(ditutup, 2);
  assert.deepEqual(status, [true, false, true, false]);
  kon.hentikan();
});

// ------------------------------------------------------ plugin
test('plugin: muat script, perintah & error dicatat', async () => {
  const { createPlugin } = await import('../src/plugin.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plg-'));
  fs.writeFileSync(path.join(dir, 'sapa.js'),
    "module.exports = { nama: 'Sapa', versi: '1', perintah: { halo: async (ctx) => ctx.balas('hai ' + ctx.pengirim.nama) } };");
  fs.writeFileSync(path.join(dir, 'rusak.js'), 'module.exports = {;');
  fs.writeFileSync(path.join(dir, 'bukan.txt'), 'x');
  const log = [];
  const pl = createPlugin({ dir, log: (m) => log.push(m) });
  const info = pl.muat();
  assert.equal(info.length, 2);
  assert.deepEqual(info.find((i) => i.nama === 'Sapa').perintah, ['!halo']);
  assert.ok(info.find((i) => i.file === 'rusak.js').error);
  assert.equal(pl.jumlah, 1);
  const c = pl.cari('!halo');
  let dibalas = '';
  assert.equal(await pl.jalankan(c.plugin, c.fn, { pengirim: { nama: 'Budi' }, balas: async (t) => { dibalas = t; } }, '!halo'), true);
  assert.equal(dibalas, 'hai Budi');
  // script diubah → muat ulang kebaca versi baru
  fs.writeFileSync(path.join(dir, 'sapa.js'), "module.exports = { nama: 'Sapa', perintah: { yo: async () => {} } };");
  pl.muat();
  assert.ok(pl.cari('!yo'));
  assert.equal(pl.cari('!halo'), null);
});

test('format grup: tes kirim ada link rules, info samarkan', async () => {
  const f = await import('../src/format.mjs');
  const t = f.formatTesGrup('XyCloud');
  assert.match(t, /BOT PENJAGA GRUP AKTIF/);
  assert.match(t, /https:\/\/rules\.xyc\.my\.id\//);
  assert.match(t, /!info/);
  assert.ok(!f.formatTesGrup('A', { linkRules: '' }).includes('Aturan lengkap'));
  const info = f.formatInfoGrup({ nama: 'G', anggota: 10, admin: 2, permintaan: 1, disetujui: 3, ditolak: 1,
    hitam: [{ label: '+62812****7890', sejak: Date.now() }], manual: 0, lastCekAt: Date.now(), mode: 'Berkala' });
  assert.match(info, /Anggota: \*10\*/);
  assert.match(info, /\+62812\*\*\*\*7890/);
  assert.match(f.formatMenu([{ perintah: '!halo', dari: 'Sapa' }]), /!halo/);
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
