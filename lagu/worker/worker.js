// Cloudflare Worker "wa-release-bot-lagu" — cuma NYIMPEN & NGASIH.
//   GET /antrian     → daftar potongan lagu yang siap dikirim (JSON)
//   GET /klip/<id>   → file audio-nya (audio/mp4)
//   POST /terpakai/<id> → HP lapor "udah gue kirim" → workflow ngisi yang baru
// Yang ngisi KV-nya workflow GitHub Actions `lagu-mood.yml` (lewat API
// Cloudflare), jadi Worker ini nggak butuh rahasia apa-apa & read-only.
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const pakai = /^\/terpakai\/([A-Za-z0-9_-]{4,64})$/.exec(url.pathname);
    if (pakai && req.method === 'POST') {
      // cuma dicatat kalau klip-nya memang ada (biar nggak bisa diisi sampah)
      const ada = await env.LAGU.get('klip:' + pakai[1], 'stream');
      if (!ada) return new Response('nggak ada', { status: 404 });
      await ada.cancel();
      await env.LAGU.put('pakai:' + pakai[1], '1', { expirationTtl: 30 * 86400 });
      return new Response('ok');
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('method', { status: 405 });

    if (url.pathname === '/antrian') {
      const isi = (await env.LAGU.get('antrian')) || '{"lagu":[]}';
      return new Response(isi, {
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      });
    }

    const m = /^\/klip\/([A-Za-z0-9_-]{4,64})$/.exec(url.pathname);
    if (m) {
      const buf = await env.LAGU.get('klip:' + m[1], 'arrayBuffer');
      if (!buf) return new Response('nggak ada', { status: 404 });
      return new Response(buf, {
        headers: { 'content-type': 'audio/mp4', 'cache-control': 'public, max-age=86400' },
      });
    }

    return new Response('wa-release-bot · lagu mood\n', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
  },
};
