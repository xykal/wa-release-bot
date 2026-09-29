/* Landing page WA Release Bot: bahasa, animasi muncul, hitung mundur launching,
   dan tombol unduh yang ngambil rilis publik terbaru dari GitHub.
   Tanpa dependensi, tanpa inline script (CSP script-src 'self'). */
'use strict';

(function () {
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const param = new URLSearchParams(location.search);

  // ------------------------------- bahasa --------------------------------
  let bahasa = 'id';
  try { bahasa = param.get('bahasa') || localStorage.getItem('bahasa') || 'id'; } catch (_) { /* penyimpanan diblokir */ }
  if (!TEKS[bahasa]) bahasa = 'id';

  function terapkanBahasa() {
    const t = TEKS[bahasa];
    document.documentElement.lang = bahasa;
    $$('[data-i18n]').forEach((el) => {
      const k = el.getAttribute('data-i18n');
      if (t[k] != null) el.textContent = t[k];
    });
    $$('[data-brand]').forEach((el) => { el.textContent = BRAND; });
    const tombol = $('#tombolBahasa');
    if (tombol) {
      tombol.textContent = bahasa === 'id' ? 'EN' : 'ID';
      tombol.setAttribute('aria-label', bahasa === 'id' ? 'Switch to English' : 'Ganti ke Bahasa Indonesia');
    }
    // tombol unduh: "<Unduh> arm64" -> teks anak pertama sudah diganti lewat data-i18n
    tulisWaktuLokal();
  }
  const tombolBahasa = $('#tombolBahasa');
  if (tombolBahasa) {
    tombolBahasa.addEventListener('click', () => {
      bahasa = bahasa === 'id' ? 'en' : 'id';
      try { localStorage.setItem('bahasa', bahasa); } catch (_) { /* abaikan */ }
      terapkanBahasa();
    });
  }

  // ---------------------------- animasi muncul ----------------------------
  const kurangGerak = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const target = $$('.muncul');
  if (kurangGerak || !('IntersectionObserver' in window)) {
    target.forEach((el) => el.classList.add('tampil'));
  } else {
    const io = new IntersectionObserver((entri) => {
      entri.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('tampil'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.1 });
    target.forEach((el) => io.observe(el));
  }

  // -------------------------- hitung mundur launching ----------------------
  const launch = new Date(LAUNCH_ISO).getTime();
  // ?t=2026-10-09T12:00:01Z -> simulasi waktu (buat QA tampilan setelah launching)
  const geser = param.get('t') ? new Date(param.get('t')).getTime() - Date.now() : 0;
  const kini = () => Date.now() + geser;
  const tirai = $('#tirai');

  function tulisWaktuLokal() {
    const el = $('#waktuLokal');
    if (!el) return;
    try {
      el.textContent = new Date(launch).toLocaleString(bahasa === 'id' ? 'id-ID' : 'en-GB', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
      });
    } catch (_) { el.textContent = new Date(launch).toString(); }
  }

  const dua = (n) => String(n).padStart(2, '0');
  function tikHitung() {
    const sisa = Math.max(0, launch - kini());
    const d = Math.floor(sisa / 86400000);
    const h = Math.floor((sisa % 86400000) / 3600000);
    const m = Math.floor((sisa % 3600000) / 60000);
    const s = Math.floor((sisa % 60000) / 1000);
    $('#hHari').textContent = dua(d);
    $('#hJam').textContent = dua(h);
    $('#hMenit').textContent = dua(m);
    $('#hDetik').textContent = dua(s);
    return sisa;
  }

  // ------------------------- rilis publik dari GitHub ----------------------
  const ABI = { arm64: 'wa-release-bot-arm64-release.apk', 'armeabi-v7a': 'wa-release-bot-armeabi-v7a-release.apk', universal: 'wa-release-bot-universal-release.apk' };
  const mb = (n) => (n / 1048576).toFixed(1) + ' MB';

  function isiKartu(rilis) {
    const aset = {};
    (rilis.assets || []).forEach((a) => { aset[a.name] = a; });
    let ada = 0;
    $$('#daftarApk .apk').forEach((kartu) => {
      const nama = ABI[kartu.getAttribute('data-abi')];
      const apk = aset[nama];
      const sha = aset[nama + '.sha256'];
      const tombol = $('[data-unduh]', kartu);
      if (apk) {
        ada += 1;
        tombol.href = apk.browser_download_url;
        tombol.removeAttribute('aria-disabled');
        $('[data-ukuran]', kartu).textContent = mb(apk.size);
      }
      if (sha) $('[data-sha]', kartu).href = sha.browser_download_url;
    });
    const meta = $('#unduhMeta');
    if (meta) {
      meta.hidden = false;
      $('#metaVersi').textContent = rilis.tag_name || '-';
      try {
        $('#metaTanggal').textContent = new Date(rilis.published_at).toLocaleDateString(bahasa === 'id' ? 'id-ID' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
      } catch (_) { $('#metaTanggal').textContent = rilis.published_at || '-'; }
    }
    return ada > 0;
  }

  async function ambilRilis() {
    // /releases/latest = rilis publik terbaru (draft dan prerelease tidak dihitung).
    const r = await fetch('https://api.github.com/repos/' + REPO + '/releases/latest', { headers: { Accept: 'application/vnd.github+json' } });
    if (r.status === 404) return null; // belum ada rilis publik
    if (!r.ok) throw new Error('GitHub ' + r.status);
    return r.json();
  }

  function bukaUnduhan() {
    document.body.classList.remove('terkunci');
    if (tirai) tirai.hidden = true;
  }

  async function cekRilis() {
    try {
      const rilis = await ambilRilis();
      if (rilis && isiKartu(rilis)) { bukaUnduhan(); return true; }
    } catch (_) {
      const gagal = $('#unduhGagal');
      if (gagal && (!tirai || tirai.hidden)) gagal.hidden = false; // hanya kalau modal tidak menutupi
    }
    return false;
  }

  function jalankanHalamanUnduh() {
    if (!tirai) return;
    const sisa = tikHitung();
    if (sisa > 0) {
      document.body.classList.add('terkunci');
      tirai.hidden = false;
      const timer = setInterval(() => {
        if (tikHitung() <= 0) { clearInterval(timer); setelahWaktu(); }
      }, 1000);
    } else {
      document.body.classList.add('terkunci');
      tirai.hidden = false;
      setelahWaktu();
    }
  }

  async function setelahWaktu() {
    // Waktu launching lewat: buka begitu rilis publiknya ada; kalau belum, cek tiap menit.
    if (await cekRilis()) return;
    $('#hitung').hidden = true;
    $('#modalTunggu').hidden = false;
    const ulang = setInterval(async () => { if (await cekRilis()) clearInterval(ulang); }, 60000);
  }

  terapkanBahasa();
  jalankanHalamanUnduh();
})();
