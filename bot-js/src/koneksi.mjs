// ============================================================================
//  Pengatur koneksi WA — satu-satunya pintu buat pakai socket.
//
//  Dulu tiap tugas (posting, cek grup, tes) buka socket sendiri lalu langsung
//  ditutup begitu pesannya "terkirim". Masalahnya:
//    - Pesan grup sering butuh WA minta kirim ulang (retry receipt) ke HP
//      anggota yang belum punya kunci. Kalau socket udah ditutup, permintaan
//      itu nggak ada yang ngeladenin → anggota cuma liat "Menunggu pesan ini".
//    - Perintah di grup (!info dll) nggak pernah kebaca karena socket-nya
//      keburu mati.
//
//  Sekarang:
//    - Tugas yang datang pas socket masih kebuka → numpang socket yang sama
//      (hemat, nggak login ulang).
//    - Socket baru ditutup setelah sepi `jedaTutupMs` (default 25 dtk).
//    - Mode realtime (`setSelalu(true)`) → socket nggak pernah ditutup, kalau
//      putus disambung ulang otomatis (jeda makin lama kalau gagal terus).
//    - `eksklusif(fn)` buat setup / lepas WA: socket yang ada ditutup dulu,
//      fn bikin koneksinya sendiri.
//
//  File ini sengaja nggak import Baileys → bisa dites pakai socket palsu.
// ============================================================================

export function createKoneksi({
  buka,                         // async () => ({ sock, close })
  log = () => {},
  onBerubah = () => {},         // (nyambung: boolean) => void
  bolehSambungUlang = () => true,
  jedaTutupMs = 25_000,
  jedaUlangMs = [5_000, 15_000, 30_000, 60_000, 120_000, 300_000],
} = {}) {
  let antrian = Promise.resolve();
  let aktif = null;
  let timerTutup = null;
  let timerUlang = null;
  let selalu = false;
  let tahanSampai = 0;
  let sibuk = 0;
  let gagalBeruntun = 0;
  let mati = false;

  function antre(fn) {
    const giliran = antrian.then(fn, fn);
    antrian = giliran.catch(() => { /* error ditangani pemanggil */ });
    return giliran;
  }

  async function pastikan() {
    if (aktif) return aktif.sock;
    const r = await buka();
    aktif = r;
    gagalBeruntun = 0;
    const sockIni = r.sock;
    try {
      sockIni.ev.on('connection.update', (u) => {
        if (u?.connection !== 'close' || aktif?.sock !== sockIni) return;
        aktif = null;
        clearTimeout(timerTutup);
        onBerubah(false);
        const code = u.lastDisconnect?.error?.output?.statusCode;
        if (selalu && !mati) {
          log(`📴 Koneksi WA putus${code ? ` (code ${code})` : ''} — disambung ulang otomatis.`);
          jadwalUlang();
        }
      });
    } catch { /* socket palsu tanpa ev */ }
    onBerubah(true);
    return r.sock;
  }

  function tutupSekarang() {
    clearTimeout(timerTutup);
    if (!aktif) return;
    const a = aktif;
    aktif = null;
    try { a.close(); } catch { /* ignore */ }
    onBerubah(false);
  }

  function jadwalTutup() {
    clearTimeout(timerTutup);
    if (selalu || !aktif || sibuk > 0) return;
    const tunggu = Math.max(jedaTutupMs, tahanSampai - Date.now());
    timerTutup = setTimeout(() => {
      if (!selalu && sibuk === 0) tutupSekarang();
    }, tunggu);
    timerTutup.unref?.();
  }

  function jadwalUlang(paksaMs) {
    clearTimeout(timerUlang);
    if (!selalu || mati) return;
    const ms = paksaMs ?? jedaUlangMs[Math.min(gagalBeruntun, jedaUlangMs.length - 1)];
    timerUlang = setTimeout(() => {
      if (!selalu || aktif || mati) return;
      if (!bolehSambungUlang()) { log('ℹ️ Mode realtime: WA belum tertaut, nunggu ditautkan.'); return; }
      antre(pastikan).catch((e) => {
        gagalBeruntun++;
        log(`⚠️ Sambung ulang gagal: ${e.message}`);
        jadwalUlang();
      });
    }, ms);
    timerUlang.unref?.();
  }

  return {
    /** Jalanin fn(sock) pakai socket yang ada (atau buka baru). Antri satu-satu. */
    pakai(fn) {
      return antre(async () => {
        clearTimeout(timerTutup);
        sibuk++;
        try {
          const sock = await pastikan();
          return await fn(sock);
        } finally {
          sibuk--;
          jadwalTutup();
        }
      });
    },

    /** Tutup socket yang ada, lalu jalanin fn (yang bikin koneksi sendiri). */
    eksklusif(fn) {
      return antre(async () => {
        tutupSekarang();
        try {
          return await fn();
        } finally {
          if (selalu) jadwalUlang(1_500);
        }
      });
    },

    /** Minta socket tetap kebuka minimal `ms` lagi (mis. nunggu pesan masuk). */
    tahan(ms) {
      tahanSampai = Math.max(tahanSampai, Date.now() + ms);
      jadwalTutup();
    },

    /** Mode realtime: true = socket selalu nyala. */
    setSelalu(v) {
      const lama = selalu;
      selalu = Boolean(v);
      if (selalu && !lama) {
        clearTimeout(timerTutup);
        gagalBeruntun = 0;
        jadwalUlang(500);
      } else if (!selalu && lama) {
        clearTimeout(timerUlang);
        jadwalTutup();
      }
    },

    /** Matikan semuanya (engine jeda). */
    tutup() {
      selalu = false;
      clearTimeout(timerUlang);
      tutupSekarang();
    },

    hentikan() { mati = true; this.tutup(); },

    get nyambung() { return Boolean(aktif); },
    get socket() { return aktif?.sock || null; },
    get selalu() { return selalu; },
  };
}
