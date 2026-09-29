// ============================================================================
//  Cloudflare Worker "wa-release-bot-lagu" — pembantu kecil buat "lagu mood".
//
//  Pembagian kerja Cloudflare x HP:
//    Worker (ini) : pilih lagu (50% daftar lawas, 50% yang lagi trend di
//                   Indonesia — chart harian Spotify ID via kworb.net, disaring
//                   AI biar cuma lagu Indo/Melayu), cari di SoundCloud, ambil link
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
//           secret `GROQ_API_KEY`. Daftar lagu + daftar ayat disuntik waktu
//           deploy (scripts-dev/deploy_worker_lagu.py baca lagu/daftar.txt &
//           lagu/ayat.json). Teks ayat = terjemahan Kemenag, dicek kata per
//           kata ke equran.id — AI NGGAK PERNAH nulis ayat sendiri, cuma milih
//           nomornya; teksnya ditempel apa adanya dari daftar.
// ============================================================================

const DAFTAR = __DAFTAR__;
const AYAT = __AYAT__;
const PELUANG_TREND = 0.5;
const PELUANG_AYAT = 0.35;
const PANJANG = 60;
// Batas request, dua lapis. Dulu cuma satu angka global (80) yang dibagi semua
// pemasang APK: 80 request dari satu skrip = fitur mati buat semua orang.
//
// Lapis 1, burst (Rate Limiting binding, jendela 60 detik, per lokasi CF):
//   PEMBATAS_PERANGKAT 2/menit per X-Pemasang, PEMBATAS_IP 6/menit per IP.
//   Ini yang benar-benar menahan skrip yang menembak cepat. Binding dipasang
//   oleh scripts-dev/deploy_worker_lagu.py; kalau tidak ada, lapis ini dilewati.
// Lapis 2, harian (KV): per pemasang, per IP, global. KV itu eventually
//   consistent dan hasil get() di-cache 60 detik per lokasi, jadi counter ini
//   BISA bocor 2-3x kalau request datang rapat -- makanya lapis 1 wajib ada.
//   Angkanya pagar kasar buat penyalahgunaan pelan dan kuota AI, bukan akuntansi.
//   per pemasang : app kirim X-Pemasang (id acak per instalasi); app sendiri
//                  maksimal 8 lagu/hari, jadi 12 sudah longgar.
//   per IP       : buat yang nggak kirim id / ganti-ganti id.
//   global       : pagar terakhir kuota AI + KV (free tier 1000 write/hari,
//                  tiap request yang lolos ~5 write).
const BATAS_PER_PEMASANG = 12;
const BATAS_PER_IP = 20;
const BATAS_HARIAN = 180;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';

// Gaya caption dirotasi biar nggak monoton "motivasi" terus.
const GAYA = [
  { id: 'curhat', arah: 'kayak caption story/TikTok yang relate banget: jujur, nyesek, kadang nyelekit. Pakai "aku/kamu" atau "gue/lo", bebas.' },
  { id: 'surat', arah: 'kayak potongan surat/pesan buat seseorang yang nggak pernah kekirim. Buka dengan sapaan ke "kamu".' },
  { id: 'puitis', arah: 'puitis tapi tetap gampang dicerna, pakai satu perumpamaan yang segar (bukan klise hujan/senja).' },
  { id: 'lucu-miris', arah: 'lucu tapi miris — self-roasting soal galau/cinta, bikin senyum kecut. Jangan garing.' },
  // Kata-kata gaul berima ala tongkrongan — dibikin terpisah (bikinGaul),
  // bobot dobel karena paling disukai.
  { id: 'gaul', dobel: true },
  { id: 'nostalgia', arah: 'nostalgia: kenangan kecil yang spesifik (bukan umum), bikin orang inget masa itu.', lawas: true },
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

const TERLARANG = /\b(cover|covered|karaoke|remix|slowed|reverb|8d|instrumental|minus ?one|live|tiktok|speed ?up|sped ?up|nightcore|unplugged|acoustic|akustik|original song by|versi|edit|prod|mashup|jedag|jedug|dj|breakbeat|lirik|lyrics?|reupload)\b/i;

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
    const resmi = /official|resmi/i.test(t.title || '') || t.user?.verified || Boolean(t.publisher_metadata?.artist) ? 2 : 0;
    const skor = cocokJudul * 2 + cocokArtis * 3 + resmi + Math.min(3, Math.log10((t.playback_count || 1) + 1));
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

// ------------------------------------------------------------ Groq
async function groq(env, { system, user, json: mintaJson = false, suhu = 0.9, model: daftarModel, mikir = 'medium' }) {
  if (!env.GROQ_API_KEY) return null;
  for (const model of daftarModel || ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-20b']) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model, temperature: suhu, max_completion_tokens: 2000,
          ...(model.startsWith('openai/') ? { reasoning_effort: mikir } : {}),
          ...(model.startsWith('qwen/') ? { reasoning_effort: 'none' } : {}),
          ...(mintaJson ? { response_format: { type: 'json_object' } } : {}),
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        }),
      });
      if (!res.ok) continue;
      const j = await res.json();
      if (j.choices?.[0]?.finish_reason !== 'stop') continue; // kepotong → model lain
      const teks = String(j.choices?.[0]?.message?.content || '').trim();
      if (!teks) continue;
      if (!mintaJson) return teks;
      const m = /\{[\s\S]*\}/.exec(teks);
      if (m) return JSON.parse(m[0]);
    } catch { /* model lain */ }
  }
  return null;
}

const rapikan = (t) => String(t || '').trim().replace(/^["“”]+|["“”]+$/g, '').replace(/\u2011/g, '-');

// ------------------------------------------------------------ trend Indonesia
/** "Artis - Judul (w/ X)" dari chart harian Spotify Indonesia (kworb.net). */
async function chartSpotifyId() {
  const html = await (await fetch('https://kworb.net/spotify/country/id_daily.html', { headers: { 'User-Agent': UA } })).text();
  const baris = [...html.matchAll(/<td class="text mp"><div>([\s\S]*?)<\/div><\/td>/g)].map((m) => m[1]
    .replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').trim());
  const hasil = [];
  for (const b of baris.slice(0, 200)) {
    const k = b.indexOf(' - ');
    if (k < 1) continue;
    hasil.push({ artis: b.slice(0, k).trim(), judul: b.slice(k + 3).replace(/\s*\((w\/|feat\.?|with)[^)]*\)\s*$/i, '').trim() });
  }
  return hasil;
}

/** Lagu trend yang berbahasa Indonesia/Melayu/daerah — di-cache sehari. */
async function daftarTrend(env) {
  const hari = new Date().toISOString().slice(0, 10);
  const c = await env.LAGU.get('trend:' + hari);
  if (c) return JSON.parse(c);
  let hasil = [];
  try {
    const chart = await chartSpotifyId();
    if (chart.length) {
      const j = await groq(env, {
        system: 'Kamu kurator musik Indonesia. Jawab HANYA JSON.',
        user: `Ini chart lagu yang lagi rame di Indonesia hari ini:\n${chart.map((l, i) => `${i + 1}. ${l.artis} - ${l.judul}`).join('\n')}\n\n` +
          'Pilih nomor lagu yang dinyanyikan terutama dalam bahasa Indonesia, Melayu, atau bahasa daerah (pop Indo, galau/sad, dangdut, koplo, viral TikTok, lagu Malaysia — semua boleh). ' +
          'Buang lagu berbahasa Inggris, Korea, Jepang, Spanyol, dll. Kalau ragu, buang.\n' +
          'Format: {"indo":[nomor,...]}',
        json: true, suhu: 0, mikir: 'low', model: ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b'],
      });
      const no = new Set((j?.indo || []).map(Number));
      hasil = chart.filter((_, i) => no.has(i + 1)).map((l) => ({ ...l, trend: true }));
    }
  } catch { /* pakai cadangan */ }
  if (hasil.length >= 10) {
    await env.LAGU.put('trend:' + hari, JSON.stringify(hasil), { expirationTtl: 2 * 86400 });
    await env.LAGU.put('trend:terakhir', JSON.stringify(hasil));
    return hasil;
  }
  return JSON.parse((await env.LAGU.get('trend:terakhir')) || '[]');
}

// ------------------------------------------------------------ kata-kata gaul
// Bank buatan tangan (lagu/gaul.txt). AI masih suka ngasal kalau disuruh
// bikin rima Indonesia, jadi bank ini sumber utama; AI cuma selingan dan
// hasilnya wajib lolos cek rima.
const BANK_GAUL = __GAUL__; // dari lagu/gaul.txt (disuntik waktu deploy)
const PELUANG_BANK_GAUL = 0.6;

const kataAkhir = (t) => (String(t).toLowerCase().match(/[a-z]+/g) || []).pop() || '';
/** Rima beneran: punchline berakhiran 3 huruf yang sama dgn bagian sebelumnya, katanya beda. */
export function rimaKena(teks) {
  const bagian = String(teks).split(/[,.\n;/]|\s[-–—]\s/).map((x) => x.trim()).filter(Boolean);
  if (bagian.length < 2) return false;
  // punchline (bagian terakhir) harus berima sama salah satu bagian sebelumnya
  const b = kataAkhir(bagian[bagian.length - 1]);
  if (b.length < 3) return false;
  return bagian.slice(0, -1).map(kataAkhir).some((a) => a.length >= 3 && a !== b && a.slice(-3) === b.slice(-3));
}

async function bikinGaul(env, konteks) {
  const dariBank = async () => {
    let dipakai = [];
    try { dipakai = JSON.parse((await env.LAGU.get('gaul_terpakai')) || '[]'); } catch { /* kosong */ }
    const sisa = BANK_GAUL.filter((x) => !dipakai.includes(x));
    const pilih = acak(sisa.length ? sisa : BANK_GAUL);
    await env.LAGU.put('gaul_terpakai', JSON.stringify([...dipakai, pilih].slice(-Math.min(30, BANK_GAUL.length - 1))));
    return pilih;
  };
  if (BANK_GAUL.length && Math.random() < PELUANG_BANK_GAUL) return dariBank();
  const j = await groq(env, {
    system: 'Kamu anak tongkrongan yang jago bikin pantun receh & kata-kata gaul berima. Jawab HANYA JSON.',
    user: `${konteks}
Bikin kata-kata gaul berima buat caption channel musik.
Ciri yang dimau:
- Pendek, 1 baris: pengantar ngasal, koma, lalu punchline. Kayak pantun kilat.
- RIMA: kata terakhir sebelum koma & kata terakhir kalimat bunyinya sama tapi KATANYA BEDA (berdering/miring, jagung/bingung, sebelah/salah). Ngulang kata yang sama = GAGAL.
- Ada twist yang bikin nyengir, nyerempet galau/cinta/ghosting sesuai suasana lagunya.
- Bahasa tongkrongan (boleh selip Jawa/Betawi/Sunda). Jangan puitis, jangan kaku.
Contoh bagus (JANGAN dipakai ulang):
- Ditelpon berdering, ternyata lagi gaya miring.
- Burung dara makan jagung, dia yang pergi, aku yang bingung.
- Beli pulsa di konter sebelah, udah ngalah, tetep aja salah.
Bikin 8 kandidat, pilih yang rimanya paling kena & paling lucu.
Jangan sebut judul/artis, jangan kutip lirik, tanpa hashtag, tanpa emoji.
Format: {"kandidat":["..."],"terbaik":nomor_mulai_1}`,
    json: true, suhu: 1,
  });
  const kandidat = (Array.isArray(j?.kandidat) ? j.kandidat : []).map(rapikan).filter((x) => x.length >= 15 && x.length <= 160);
  const pilihanAi = kandidat[Number(j?.terbaik) - 1];
  const kena = kandidat.filter(rimaKena);
  if (pilihanAi && rimaKena(pilihanAi)) return pilihanAi;
  if (kena.length) return kena[0];
  return BANK_GAUL.length ? dariBank() : null;
}

// ------------------------------------------------------------ kata-kata
async function bikinKata(env, lagu, paksaGaya = null) {
  const konteks = `Lagunya: "${lagu.judul}" – ${lagu.artis}` + (lagu.trend ? ' (lagi trend/viral di Indonesia sekarang).' : ' (lagu lawas).');
  const aturanUmum = `- Bahasa Indonesia gaul yang natural (bukan baku, bukan kayak iklan).
- JANGAN mengutip lirik lagunya, JANGAN sebut judul/artis (udah ditulis terpisah).
- Kalau kamu beneran kenal lagunya, sesuaikan sama tema & suasananya. Kalau nggak yakin, jangan ngarang isi lagunya — main di perasaan umum aja.
- Hindari kata-kata motivator klise ("semangat ya", "kamu pasti bisa", "tetap kuat").
- JANGAN buka dengan kata "Kadang" atau "kamu, kadang" — bikin pembuka yang beda & nendang.
- Tanpa hashtag, tanpa tanda kutip di awal/akhir, maksimal 1 emoji.
- Jangan sebut waktu (malam/pagi/sore/senja) — jam kirimnya acak.`;
  const system = 'Kamu admin channel WhatsApp musik yang captionnya selalu kena di hati: relate, jujur, nggak lebay, nggak menggurui.';

  // Kadang-kadang ditemenin ayat. AI cuma MILIH nomor, teksnya dari daftar.
  if (AYAT.length && (paksaGaya === 'ayat' || (!paksaGaya && Math.random() < PELUANG_AYAT))) {
    const j = await groq(env, {
      system: system + ' Jawab HANYA JSON.',
      user: `${konteks}
Tulis caption yang nyambungin perasaan di lagu ini ke salah satu ayat di bawah (ayatnya bakal ditempel otomatis di bawah caption-mu, jadi JANGAN tulis/kutip ayatnya).
Aturan:
- 1 sampai 2 kalimat, maksimal 200 karakter, lembut dan nggak menggurui/ceramah.
- Karena ditemenin ayat Al-Qur'an: nadanya tenang & tulus. DILARANG bercanda, lebay, atau pakai perumpamaan konyol.
- Kalau suasana lagunya nggak cocok buat ayat mana pun (misal lagunya kocak/joget), jawab {"no": 0}.
${aturanUmum}
Pilihan ayat (pilih yang temanya paling nyambung):
${AYAT.map((a, i) => `${i + 1}. ${a.ref} — ${a.tema}`).join('\n')}
Format: {"no": nomor_ayat, "kata": "caption"}`,
      json: true, suhu: 0.8,
    });
    const a = AYAT[Number(j?.no) - 1];
    const kata = rapikan(j?.kata);
    if (a && kata.length >= 30 && kata.length <= 320) {
      return { gaya: 'ayat', kata: `${kata}\n\n_“${a.teks}”_\n— ${a.ref}` };
    }
  }

  const pilihan = GAYA.filter((g) => !g.lawas || !lagu.trend).flatMap((g) => (g.dobel ? [g, g] : [g]));
  const g = pilihan.find((x) => x.id === paksaGaya) || acak(pilihan);
  if (g.id === 'gaul') {
    const kata = await bikinGaul(env, konteks);
    if (kata) return { gaya: 'gaul', kata };
  }
  const teks = await groq(env, {
    system,
    user: `${konteks}
Tulis caption pendek buat nemenin potongan lagu ini di channel.
Gaya kali ini: ${g.arah}
Aturan:
- ${g.id === 'gaul' ? '1 sampai 2 baris pendek' : '2 sampai 3 kalimat'}, maksimal 280 karakter.
${aturanUmum}
Balas cuma teks caption-nya.`,
  });
  const kata = rapikan(teks);
  if (kata.length >= (g.id === 'gaul' ? 15 : 40) && kata.length <= 400) return { gaya: g.id, kata };
  return { gaya: 'cadangan', kata: acak(CADANGAN) };
}

// ------------------------------------------------------------ utama
/** Hash pendek buat kunci KV (IP tidak disimpan mentah). */
async function kunciAman(teks) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(teks)));
  return [...new Uint8Array(d)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Cek semua batas dulu TANPA menulis; baru kalau lolos semua, naikkan
 * counter-nya. Request yang ditolak tidak boleh menghabiskan kuota write KV.
 * @returns {Response|null} 429 kalau kena batas, null kalau boleh lanjut
 */
async function cekBatas(env, { ip, pemasang }) {
  // Lapis 1: burst. limit() menghitung sekali panggil, jadi dipanggil hanya
  // kalau kuncinya ada. Request yang ditolak di sini tidak menyentuh KV.
  const kenaBurst = async (pembatas, key) => Boolean(pembatas && key) && !(await pembatas.limit({ key })).success;
  if (await kenaBurst(env.PEMBATAS_PERANGKAT, pemasang)) return json({ error: 'terlalu cepat dari perangkat ini, tunggu semenit' }, 429);
  if (await kenaBurst(env.PEMBATAS_IP, ip)) return json({ error: 'terlalu cepat dari jaringan ini, tunggu semenit' }, 429);

  // Lapis 2: harian (KV).
  const hari = new Date().toISOString().slice(0, 10);
  const kunci = [['hit:' + hari, BATAS_HARIAN, 'batas harian habis, besok lagi']];
  if (pemasang) kunci.push([`pemasang:${hari}:${await kunciAman(pemasang)}`, BATAS_PER_PEMASANG, 'jatah lagu hari ini buat perangkat ini habis']);
  if (ip) kunci.push([`ip:${hari}:${await kunciAman(ip)}`, BATAS_PER_IP, 'terlalu sering dari jaringan ini, besok lagi']);
  const nilai = await Promise.all(kunci.map(([k]) => env.LAGU.get(k).then((v) => Number(v) || 0)));
  for (let i = 0; i < kunci.length; i++) {
    if (nilai[i] >= kunci[i][1]) return json({ error: kunci[i][2] }, 429);
  }
  await Promise.all(kunci.map(([k], i) => env.LAGU.put(k, String(nilai[i] + 1), { expirationTtl: 3 * 86400 })));
  return null;
}

/**
 * GET /lagu/batas -- lihat sisa jatah tanpa minta lagu. Tidak menulis KV;
 * satu panggilan limit() ikut terhitung di lapis burst (jatah pemanggil sendiri).
 * Dipakai scripts-dev/cek-batas-worker.sh supaya proving test tidak membakar
 * kuota Groq/SoundCloud, dan bisa dipakai app buat menampilkan sisa jatah.
 */
async function lihatBatas(env, { ip, pemasang, colo }, { uji = false } = {}) {
  const hari = new Date().toISOString().slice(0, 10);
  const baca = async (k) => Number(await env.LAGU.get(k)) || 0;
  // limit() tidak punya mode intip: sekali panggil = satu token. App memanggil
  // endpoint ini tiap habis kirim lagu, jadi token cuma dipakai kalau ?uji=1
  // (proving test scripts-dev/cek-batas-worker.sh).
  let burst = env.PEMBATAS_PERANGKAT ? 'aktif' : 'tidak ada pembatas';
  if (uji && env.PEMBATAS_PERANGKAT && pemasang) burst = (await env.PEMBATAS_PERANGKAT.limit({ key: pemasang })).success ? 'ok' : 'kena';
  return json({
    hari,
    colo: colo || null, // lapis burst dihitung per lokasi Cloudflare
    burst,
    pemasang: pemasang ? `${await baca(`pemasang:${hari}:${await kunciAman(pemasang)}`)}/${BATAS_PER_PEMASANG}` : null,
    ip: ip ? `${await baca(`ip:${hari}:${await kunciAman(ip)}`)}/${BATAS_PER_IP}` : null,
    global: `${await baca('hit:' + hari)}/${BATAS_HARIAN}`,
  });
}

async function laguBerikut(env, paksaGaya = null, siapa = {}) {
  const ditolak = await cekBatas(env, siapa);
  if (ditolak) return ditolak;

  let riwayat = JSON.parse((await env.LAGU.get('riwayat')) || '[]');
  if (!Array.isArray(riwayat)) riwayat = [];
  const saring = (daftar, simpan) => {
    const baruDipakai = new Set(riwayat.slice(-simpan));
    const baru = daftar.filter((l) => !baruDipakai.has(kunciLagu(l)));
    return (baru.length ? baru : daftar.slice()).sort(() => Math.random() - 0.5);
  };
  const lawas = saring(DAFTAR, Math.max(0, DAFTAR.length - 5));
  let trend = [];
  try { trend = saring(await daftarTrend(env), 60); } catch { /* lawas aja */ }
  // Selang-seling: mulai dari trend (50%) atau lawas, gantian kalau gagal nemu.
  const mulaiTrend = trend.length && Math.random() < PELUANG_TREND;
  const urutan = [];
  for (let i = 0; i < 3; i++) {
    const a = mulaiTrend ? trend : lawas;
    const b = mulaiTrend ? lawas : trend;
    if (a[i]) urutan.push(a[i]);
    if (b[i]) urutan.push(b[i]);
  }
  const calon = urutan;

  const gagal = [];
  for (const lagu of calon.slice(0, 5)) {
    try {
      const s = await cariDiSoundCloud(env, lagu);
      if (!s) { gagal.push(`${lagu.judul}: nggak nemu`); continue; }
      const { kata, gaya } = await bikinKata(env, lagu, paksaGaya);
      // mulai motong di ±35% lagu (biasanya udah masuk reff pertama)
      const mulai = Math.max(30, Math.min(Math.round(s.durasi * 0.35), s.durasi - PANJANG - 5));
      riwayat.push(kunciLagu(lagu));
      await env.LAGU.put('riwayat', JSON.stringify(riwayat.slice(-200)));
      return json({
        id: kunciLagu(lagu) + '-' + Date.now().toString(36),
        artis: lagu.artis, judul: lagu.judul, kata, gaya, jenis: lagu.trend ? 'trend' : 'lawas',
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
      const siapa = {
        ip: req.headers.get('cf-connecting-ip') || '',
        pemasang: (req.headers.get('x-pemasang') || '').slice(0, 64),
      };
      try { return await laguBerikut(env, url.searchParams.get('gaya'), siapa); } catch (e) { return json({ error: e.message }, 500); }
    }
    if (url.pathname === '/lagu/batas') {
      const siapa = { ip: req.headers.get('cf-connecting-ip') || '', pemasang: (req.headers.get('x-pemasang') || '').slice(0, 64), colo: req.cf?.colo };
      try { return await lihatBatas(env, siapa, { uji: url.searchParams.get('uji') === '1' }); } catch (e) { return json({ error: e.message }, 500); }
    }
    return new Response(`wa-release-bot · lagu mood · ${DAFTAR.length} lagu lawas + trend Indonesia harian · ${AYAT.length} ayat\n`,
      { headers: { 'content-type': 'text/plain; charset=utf-8' } });
  },
};
