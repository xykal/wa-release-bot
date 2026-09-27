// ============================================================================
//  Jaring pengaman error "nyasar".
//
//  PENTING buat Android: engine ini jalan DI DALAM proses app (nodejs-mobile).
//  Kalau ada promise yang ditolak tanpa `.catch` (unhandledRejection) atau
//  error yang nggak ketangkep, Node 18 bawaannya MATIIN PROSES — dan yang ikut
//  mati bukan cuma engine, tapi SELURUH APP (force close). Service lalu
//  dinyalain ulang Android, engine nyambung WA lagi, error lagi, mati lagi…
//  HP jadi lemot dan app lain ikut ditutup sistem karena RAM kesedot terus.
//
//  Sumber yang udah ketemu: Baileys 6.7.24 punya beberapa handler async tanpa
//  catch (`CB:success` → upload pre-key, `CB:ib,,dirty` → ambil semua grup).
//  Kalau socket ditutup pas handler itu masih jalan → "Connection Closed"
//  ditolak tanpa ada yang nangkep.
//
//  Di sini error kayak gitu cuma DICATAT, engine jalan terus. Kalau errornya
//  banjir (> batas dalam 1 menit), `onBanjir` dipanggil sekali buat jeda bot.
// ============================================================================

export function createPengaman({ log = () => {}, onBanjir = () => {}, batas = 30, jendelaMs = 60_000, now = Date.now } = {}) {
  let waktu = [];
  const terakhirLapor = new Map();
  let sudahBanjir = false;

  function tangani(jenis, err) {
    const t = now();
    const pesan = String(err?.message || err || 'error tanpa pesan').slice(0, 300);
    // "Connection Closed" dari Baileys pas socket sengaja ditutup itu biasa.
    const biasa = /Connection Closed|Connection Terminated|Timed Out/i.test(pesan);

    waktu.push(t);
    waktu = waktu.filter((x) => t - x < jendelaMs);

    // Pesan yang sama cukup dicatat sekali per 30 dtk biar log nggak banjir.
    const kunci = jenis + ':' + pesan;
    if (t - (terakhirLapor.get(kunci) || 0) > 30_000) {
      terakhirLapor.set(kunci, t);
      if (terakhirLapor.size > 50) terakhirLapor.delete(terakhirLapor.keys().next().value);
      log(biasa
        ? `ℹ️ (${jenis}) ${pesan} — diabaikan, socket udah ditutup.`
        : `⚠️ Error di belakang (${jenis}): ${pesan} — engine tetap jalan.`);
      if (!biasa && err?.stack) {
        try { console.error(err.stack); } catch { /* ignore */ }
      }
    }

    if (!sudahBanjir && waktu.length > batas) {
      sudahBanjir = true;
      log(`🛑 ${waktu.length} error dalam ${Math.round(jendelaMs / 1000)} dtk — bot dijeda biar HP nggak berat. Cek log, lalu tekan Mulai.`);
      try { onBanjir(); } catch { /* ignore */ }
    }
  }

  return {
    tangani,
    /** Pasang ke `process`. Balikin fungsi buat nyopot. */
    pasang(proc = process) {
      const a = (e) => tangani('promise', e);
      const b = (e) => tangani('exception', e);
      proc.on('unhandledRejection', a);
      proc.on('uncaughtException', b);
      return () => { proc.off('unhandledRejection', a); proc.off('uncaughtException', b); };
    },
    /** Dipanggil pas bot di-Mulai lagi. */
    reset() { waktu = []; sudahBanjir = false; },
    get jumlah() { return waktu.length; },
  };
}
