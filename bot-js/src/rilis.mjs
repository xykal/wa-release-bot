// Keputusan "hasil cek GitHub ini diapakan?" — dipisah dari bot.mjs supaya bisa
// diuji tanpa WhatsApp, tanpa jaringan, tanpa file.
import semver from 'semver';

export const MAKS_PERCOBAAN = 3;

/** '1.6.7' dari 'v1.6.7' / ' =V1.6.7 '; null kalau bukan semver. */
export function tagKeSemver(tag) {
  return semver.valid(semver.clean(String(tag || ''), { loose: true }), { loose: true });
}

/**
 * Keputusan untuk satu hasil cek.
 *
 * @param {{
 *   state: { lastTag?: string|null, pending?: { tag: string, percobaan: number }|null },
 *   rel: { notModified?: boolean, tag?: string },
 *   postOnFirstRun?: boolean,
 *   manual?: boolean,           // dipicu tombol "Cek sekarang" -> hitungan gagal di-reset
 * }} p
 * @returns {{ aksi: 'tidur'|'baseline'|'post'|'rollback'|'lewati-gagal', alasan: string }}
 */
export function putuskanRilis({ state, rel, postOnFirstRun = false, manual = false }) {
  if (rel.notModified) return { aksi: 'tidur', alasan: 'GitHub bilang belum berubah (304, 0 byte)' };

  const terakhir = state.lastTag || null;
  if (!terakhir) {
    return postOnFirstRun
      ? { aksi: 'post', alasan: 'first run + postOnFirstRun' }
      : { aksi: 'baseline', alasan: 'first run, tag dicatat sebagai baseline' };
  }
  if (terakhir === rel.tag) return { aksi: 'tidur', alasan: `masih ${terakhir}` };

  const a = tagKeSemver(rel.tag);
  const b = tagKeSemver(terakhir);
  if (a && b && semver.lte(a, b)) {
    // /releases/latest balik ke tag lama = release terbaru dihapus/di-unpublish.
    // Ini bukan "release baru"; diumumkan malah bikin follower bingung.
    return { aksi: 'rollback', alasan: `${rel.tag} tidak lebih baru dari ${terakhir}` };
  }

  const p = state.pending;
  if (p && p.tag === rel.tag && p.percobaan >= MAKS_PERCOBAAN && !manual) {
    return { aksi: 'lewati-gagal', alasan: `kirim ${rel.tag} sudah gagal ${p.percobaan}x` };
  }
  return { aksi: 'post', alasan: `${terakhir} -> ${rel.tag}` };
}

/** Catatan "mau kirim tag ini" yang disimpan SEBELUM kirim (write-ahead). */
export function pendingBerikut(pending, tag, { manual = false } = {}) {
  const lanjut = pending && pending.tag === tag && !manual;
  return {
    tag,
    percobaan: (lanjut ? pending.percobaan : 0) + 1,
    mulai: lanjut ? pending.mulai : new Date().toISOString(),
  };
}

/**
 * Error kirim yang AMBIGU: pesannya mungkin sudah masuk (mis. ack timeout).
 * Untuk error begini jangan langsung kirim ulang lewat jalur lain — itu
 * sumber posting dobel.
 */
export function errorAmbigu(e) {
  const kode = e?.output?.statusCode;
  if (kode === 408) return true;
  return /timed?\s?out|timeout/i.test(String(e?.message || ''));
}
