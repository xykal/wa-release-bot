// Multi repo: satu bot boleh mantau beberapa repo GitHub sekaligus.
//
// Kenapa config-nya tetap SATU string `github.repo` ("owner/a, owner/b") dan
// bukan array baru: app lama, CLI lama, dan config.json yang sudah ada tetap
// jalan tanpa migrasi format; kolom "Repo GitHub" di app cukup diisi koma.
// State per repo disimpan di `state.repos[repo] = { lastTag, rilisEtag,
// pending }` supaya baseline dan hitungan gagal kirim tidak saling tertukar
// antar repo. Field lama (state.lastTag dst., era satu repo) dipindah sekali
// oleh sinkronState().

/** owner/nama — huruf, angka, titik, strip, garis bawah (aturan GitHub). */
export const POLA_REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/** 'https://github.com/owner/nama.git/' -> 'owner/nama'; selain itu cuma trim. */
export function rapikanRepo(teks) {
  return String(teks ?? '')
    .trim()
    .replace(/^(https?:\/\/)?(www\.)?github\.com\//i, '')
    .replace(/\/+$/, '')
    .replace(/\.git$/i, '');
}

/** Pecah "a/x, b/y\nc/z" (atau array) jadi daftar unik, urutan dijaga. Belum divalidasi. */
export function pecahRepo(nilai) {
  const mentah = Array.isArray(nilai) ? nilai : String(nilai ?? '').split(/[\s,;]+/);
  const hasil = [];
  for (const r of mentah) {
    const bersih = rapikanRepo(r);
    if (bersih && !hasil.includes(bersih)) hasil.push(bersih);
  }
  return hasil;
}

/** Daftar repo yang formatnya benar saja. */
export function daftarRepo(nilai) {
  return pecahRepo(nilai).filter((r) => POLA_REPO.test(r));
}

/** Entri yang formatnya salah — buat pesan error ke pemakai. */
export function repoTidakValid(nilai) {
  return pecahRepo(nilai).filter((r) => !POLA_REPO.test(r));
}

/** Bentuk simpan/tampil: "a/x, b/y". */
export function teksRepo(nilai) {
  return daftarRepo(nilai).join(', ');
}

const kosong = () => ({ lastTag: null, rilisEtag: null, pending: null });

/** Sub-state satu repo; dibuat kalau belum ada. */
export function stateRepo(state, repo) {
  if (!state.repos || typeof state.repos !== 'object') state.repos = {};
  if (!state.repos[repo]) state.repos[repo] = kosong();
  return state.repos[repo];
}

/**
 * Samakan state dengan daftar repo yang sekarang dipakai:
 *  - field lama (state.lastTag/rilisEtag/pending) dipindah ke repo PERTAMA
 *    sekali saja, lalu dikosongkan — baseline pemakai lama tidak hilang;
 *  - repo yang dihapus dari setelan ikut dibuang (baseline-nya tidak relevan
 *    dan kalau repo itu ditambah lagi nanti harus mulai dari nol);
 *  - reset=true mengosongkan semua (mis. includePrereleases berubah: tag
 *    stable dan prerelease tidak sebanding).
 * @returns {boolean} true kalau state berubah — pemanggil yang menyimpan.
 */
export function sinkronState(state, daftar, { reset = false } = {}) {
  let berubah = false;
  if (!state.repos || typeof state.repos !== 'object') {
    state.repos = {};
    berubah = true;
  }
  if (reset && Object.keys(state.repos).length) {
    state.repos = {};
    berubah = true;
  }
  const warisan = state.lastTag || state.rilisEtag || state.pending;
  if (warisan && daftar[0]) {
    if (!reset && !state.repos[daftar[0]]) {
      state.repos[daftar[0]] = {
        lastTag: state.lastTag || null,
        rilisEtag: state.rilisEtag || null,
        pending: state.pending || null,
      };
    }
    state.lastTag = null;
    state.rilisEtag = null;
    state.pending = null;
    berubah = true;
  }
  for (const k of Object.keys(state.repos)) {
    if (!daftar.includes(k)) {
      delete state.repos[k];
      berubah = true;
    }
  }
  return berubah;
}

/**
 * Ringkasan buat kartu status app: satu repo -> tag-nya saja (tampilan lama);
 * banyak repo -> "nama v1 · nama2 v2". null kalau belum ada baseline sama sekali.
 */
export function ringkasTag(state, daftar) {
  const ada = daftar
    .map((r) => [r, state.repos?.[r]?.lastTag])
    .filter(([, tag]) => tag);
  if (!ada.length) return null;
  if (daftar.length === 1) return ada[0][1];
  return ada.map(([r, tag]) => `${r.split('/')[1]} ${tag}`).join(' · ');
}

/** Pending pertama yang masih ada (buat status app). */
export function pendingAktif(state, daftar) {
  for (const r of daftar) {
    const p = state.repos?.[r]?.pending;
    if (p) return { repo: r, ...p };
  }
  return null;
}
