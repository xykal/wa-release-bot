// Audience Status WA (statusJidList) dipisahkan dari transport supaya
// perhitungannya bisa dites tanpa Baileys; audience bukan native group mention.

/** Daftar JID audience story: hanya nomor yang dipilih eksplisit di pengaturan. */
export function penontonStory({ storyKe = [] } = {}) {
  const mentah = Array.isArray(storyKe) ? storyKe : [storyKe];
  return [...new Set(mentah.map((j) => String(j ?? '').trim()).filter(Boolean))];
}

/** Keterangan yang dilaporkan ke pemilik untuk daftar audience yang dipakai. */
export function keteranganPenonton(total) {
  return `${total} nomor pribadi`;
}
