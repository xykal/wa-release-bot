// Nomor HP → format yang dipakai WhatsApp (kode negara + nomor, angka doang).
// Nggak import apa-apa → bisa dites tanpa Baileys.
//
//   "0812-3456-7890"     → "6281234567890"   (0 di depan = Indonesia)
//   "+62 812 3456 7890"  → "6281234567890"
//   "812 3456 7890"      → "6281234567890"   (lupa 0 & kode negara)
//   "abc"                → null
export function normalisasiNomor(input) {
  let n = String(input ?? '').replace(/[^\d]/g, '');
  if (!n) return null;
  if (n.startsWith('00')) n = n.slice(2); // format internasional 0062...
  if (n.startsWith('0')) n = '62' + n.slice(1);
  else if (n.startsWith('8') && n.length >= 9 && n.length <= 12) n = '62' + n;
  if (n.length < 8 || n.length > 15) return null;
  return n;
}
