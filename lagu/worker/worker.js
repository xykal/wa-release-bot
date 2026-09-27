// ============================================================================
//  Cloudflare Worker "wa-release-bot-lagu" — pembantu kecil buat "lagu mood".
//
//  Pembagian kerja Cloudflare x HP:
//    Worker (ini) : pilih lagu dari daftar, cari di SoundCloud, ambil link
//                   stream-nya, bikin kata-kata pakai AI (key Groq disimpen di
//                   sini sebagai secret, NGGAK ada di APK), tentuin mulai potong
//    HP           : download CUMA potongan ~60 dtk (HTTP Range, ±1 MB), kirim
//                   ke channel, terus file-nya langsung dihapus
//
//  Endpoint:
//    GET /lagu/berikut  → { artis, judul, kata, url, mulai, detik, durasi, ... }
//    GET /              → info singkat
//
//  Binding: KV `LAGU` (cache client_id, riwayat, batas harian),
//           secret `GROQ_API_KEY`. Daftar lagu disuntik waktu deploy
//           (scripts-dev/deploy_worker_lagu.py baca lagu/daftar.txt).
// ============================================================================

const DAFTAR = __DAFTAR__;
const PANJANG = 60;
const BATAS_HARIAN = 80;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';

const SUDUT = [
  'kangen seseorang yang udah jauh', 'cinta pertama zaman sekolah', 'patah hati yang udah ikhlas',
  'perjalanan pulang sambil dengerin radio', 'hujan dan kenangan', 'orang tua yang dulu sering muter lagu ini',
  'persahabatan lama', 'janji yang nggak jadi ditepati', 'bersyukur pernah ngerasain', 'nongkrong sambil gitaran',
];
const CADANGAN = [
  'Ada lagu yang nggak pernah benar-benar selesai diputar — cuma pindah dari telinga ke ingatan.',
  'Lagu lama tuh kayak surat dari diri kita yang dulu. Dibaca pelan-pelan aja.',
  'Nggak semua yang lewat harus dilupain. Sebagian cukup diputer ulang.',
  'Buat yang lagi kangen tapi gengsi bilang: nih, biar lagunya aja yang ngomong.',
];

const json = (o, status = 200) => new Response(JSON.stringify(o), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});
const acak = (a) => a[Math.floor(Math.random() * a.length)];
const kataKunci = (s) => new Set((String(s).toLowerCase().match(/[a-z0-9]+/g) || []).filter((w) => w.length > 2));
const kunciLagu = (l) => `${l.artis}-${l.judul}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');

// ------------------------------------------------------------ SoundCloud
async function ambilClientId(env, paksa = false) {
  if (!paksa) {
    const c = await env.LAGU.get('sc_client_id');
    if (c) return c;
  }
  const html = await (await fetch('https://soundcloud.com/', { headers: { 'User-Agent': UA } })).text();
  const skrip = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]).reverse();
  for (const u of skrip) {
    const js = await (await fetch(u, { headers: { 'User-Agent': UA } })).text();
    const m = /client_id\s*:\s*"([0-9a-zA-Z]{32})"/.exec(js);
    if (m) {
      await env.LAGU.put('sc_client_id', m[1], { expirationTtl: 6 * 3600 });
      return m[1];
    }
  }
  throw new Error('client_id SoundCloud nggak ketemu');
}

async function sc(env, path) {
  for (let i = 0; i < 2; i++) {
    const cid = await ambilClientId(env, i > 0);
    const sep = path.includes('?') ? '&' : '?';
    const res = await fetch(`https://api-v2.soundcloud.com${path}${sep}client_id=${cid}`, { headers: { 'User-Agent': UA } });
    if (res.status === 401 || res.status === 403) continue; // client_id basi → ambil baru
    if (!res.ok) throw new Error(`SoundCloud HTTP ${res.status}`);
    return { data: await res.json(), cid };
  }
  throw new Error('SoundCloud nolak client_id');
}

const TERLARANG = /\b(cover|covered|karaoke|remix|slowed|reverb|8d|instrumental|minus ?one|live|tiktok|speed ?up|nightcore|unplugged|acoustic|akustik|original song by|versi)\b/i;

/** Pilih track yang paling mirip lagu aslinya (bukan cover / cuplikan 30 dtk). */
function pilihTrack(koleksi, lagu) {
  const butuhJudul = kataKunci(lagu.judul);
  const butuhArtis = kataKunci(lagu.artis);
  let terbaik = null;
  let skorTerbaik = -1;
  for (const t of koleksi || []) {
    const dur = (t.duration || 0) / 1000;
    if (dur < 120 || dur > 540) continue;
    if (t.policy === 'SNIP' || t.policy === 'BLOCK') continue;
    const prog = (t.media?.transcodings || []).find((x) => x.format?.protocol === 'progressive' && !x.snipped &&
      String(x.format?.mime_type).includes('mpeg'));
    if (!prog) continue;
    const teks = `${t.title} ${t.user?.username || ''} ${t.publisher_metadata?.artist || ''}`;
    if (TERLARANG.test(t.title || '')) continue;
    const k = kataKunci(teks);
    const cocokJudul = [...butuhJudul].filter((w) => k.has(w)).length;
    if (butuhJudul.size && cocokJudul < Math.max(1, Math.ceil(butuhJudul.size / 2))) continue;
    const cocokArtis = [...butuhArtis].filter((w) => k.has(w)).length;
    const skor = cocokJudul * 2 + cocokArtis * 3 + Math.min(3, Math.log10((t.playback_count || 1) + 1));
    if (skor > skorTerbaik) { skorTerbaik = skor; terbaik = { t, prog }; }
  }
  return terbaik;
}

async function cariDiSoundCloud(env, lagu) {
  const q = encodeURIComponent(`${lagu.artis} ${lagu.judul}`);
  const { data } = await sc(env, `/search/tracks?q=${q}&limit=20`);
  const pilih = pilihTrack(data.collection, lagu);
  if (!pilih) return null;
  const { t, prog } = pilih;
  const cid = await ambilClientId(env);
  const res = await fetch(`${prog.url}?client_id=${cid}&track_authorization=${t.track_authorization || ''}`,
    { headers: { 'User-Agent': UA } });
  if (!res.ok) return null;
  const { url } = await res.json();
  return { url, durasi: Math.round(t.duration / 1000), scJudul: t.title, scLink: t.permalink_url, preset: prog.preset };
}

// ------------------------------------------------------------ kata-kata
async function bikinKata(env, lagu) {
  if (!env.GROQ_API_KEY) return acak(CADANGAN);
  const prompt = `Tulis kata-kata pendek buat caption channel WhatsApp yang nemenin potongan lagu "${lagu.judul}" – ${lagu.artis}.
Aturan:
- Bahasa Indonesia santai tapi puitis, nuansa nostalgia / galau manis.
- 2 sampai 3 kalimat, maksimal 280 karakter.
- JANGAN mengutip lirik lagunya, JANGAN sebut judul/artis (udah ditulis terpisah).
- Tanpa hashtag, tanpa tanda kutip, maksimal 1 emoji.
- Jangan sebut waktu (malam/pagi/sore/senja) — jam kirimnya acak.
- Sudut pandang kali ini: ${acak(SUDUT)}.
Balas cuma teks caption-nya.`;
  for (const model of ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile', 'openai/gpt-oss-20b']) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model, temperature: 0.95, max_completion_tokens: 1200,
          ...(model.startsWith('openai/') ? { reasoning_effort: 'low' } : {}),
          messages: [
            { role: 'system', content: 'Kamu penulis caption channel musik lawas yang jago bikin baper.' },
            { role: 'user', content: prompt },
          ],
        }),
      });
      if (!res.ok) continue;
      const j = await res.json();
      if (j.choices?.[0]?.finish_reason !== 'stop') continue; // kepotong → coba model lain
      const teks = String(j.choices?.[0]?.message?.content || '').trim().replace(/^["“”]+|["“”]+$/g, '').replace(/\u2011/g, '-');
      if (teks.length >= 60 && teks.length <= 400) return teks;
    } catch { /* model lain */ }
  }
  return acak(CADANGAN);
}

// ------------------------------------------------------------ utama
async function laguBerikut(env) {
  // batas harian biar endpoint publik ini nggak disalahgunain buat ngabisin kuota AI
  const hari = new Date().toISOString().slice(0, 10);
  const nHari = Number(await env.LAGU.get('hit:' + hari)) || 0;
  if (nHari >= BATAS_HARIAN) return json({ error: 'batas harian habis, besok lagi' }, 429);
  await env.LAGU.put('hit:' + hari, String(nHari + 1), { expirationTtl: 3 * 86400 });

  let riwayat = JSON.parse((await env.LAGU.get('riwayat')) || '[]');
  if (!Array.isArray(riwayat)) riwayat = [];
  const dipakai = new Set(riwayat.slice(-Math.max(0, DAFTAR.length - 5)));
  let calon = DAFTAR.filter((l) => !dipakai.has(kunciLagu(l)));
  if (!calon.length) calon = DAFTAR.slice();
  calon.sort(() => Math.random() - 0.5);

  const gagal = [];
  for (const lagu of calon.slice(0, 4)) {
    try {
      const s = await cariDiSoundCloud(env, lagu);
      if (!s) { gagal.push(`${lagu.judul}: nggak nemu`); continue; }
      const kata = await bikinKata(env, lagu);
      // mulai motong di ±35% lagu (biasanya udah masuk reff pertama)
      const mulai = Math.max(30, Math.min(Math.round(s.durasi * 0.35), s.durasi - PANJANG - 5));
      riwayat.push(kunciLagu(lagu));
      await env.LAGU.put('riwayat', JSON.stringify(riwayat.slice(-200)));
      return json({
        id: kunciLagu(lagu) + '-' + Date.now().toString(36),
        artis: lagu.artis, judul: lagu.judul, kata,
        url: s.url, mulai, detik: PANJANG, durasi: s.durasi, kbps: 128,
        mime: 'audio/mpeg', sumber: 'soundcloud', scJudul: s.scJudul, scLink: s.scLink,
      });
    } catch (e) {
      gagal.push(`${lagu.judul}: ${e.message}`);
    }
  }
  return json({ error: 'nggak dapet lagu', detail: gagal }, 502);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method !== 'GET') return new Response('method', { status: 405 });
    if (url.pathname === '/lagu/berikut') {
      try { return await laguBerikut(env); } catch (e) { return json({ error: e.message }, 500); }
    }
    return new Response(`wa-release-bot · lagu mood · ${DAFTAR.length} lagu di daftar\n`,
      { headers: { 'content-type': 'text/plain; charset=utf-8' } });
  },
};
