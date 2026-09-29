// Worker landing page: semua file dari web/ dilayani binding ASSETS (Workers
// Static Assets). Di sini cuma menambah header keamanan; tidak ada logika lain,
// jadi halaman tetap statis dan bisa di-host di mana saja kalau perlu pindah.
const HEADER = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; font-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self' https://api.github.com; frame-ancestors 'none'; base-uri 'self'; form-action 'none'",
};

// Domain kanonik; alamat workers.dev tetap hidup sebagai cadangan tapi diarahkan ke sini.
const HOST = 'wabot.projectkal.my.id';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname.endsWith('.workers.dev')) {
      url.hostname = HOST;
      return Response.redirect(url.toString(), 301);
    }
    const res = await env.ASSETS.fetch(request);
    const h = new Headers(res.headers);
    for (const [k, v] of Object.entries(HEADER)) h.set(k, v);
    if (res.status === 200 && /\.(woff2|webp|png|svg)$/.test(new URL(request.url).pathname)) {
      h.set('Cache-Control', 'public, max-age=604800, immutable');
    }
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
  },
};
