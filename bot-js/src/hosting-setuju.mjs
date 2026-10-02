// Gerbang persetujuan hosting. Kode bot hosting jalan di sandbox app yang sama
// dan bisa membaca sesi WA + setting (Node 18 belum punya permission model),
// jadi mesin menolak menjalankan project sebelum ada persetujuan untuk sidik
// jari ZIP yang sedang terpasang. ZIP baru = sidik baru = persetujuan lama gugur.
// Tiap ZIP baru, app (HostingActivity) menghapus persetujuan.json + sumber.json
// sebelum isi project diganti, lalu menulis sumber.json baru setelah selesai.
// Project dari sebelum fitur ini tidak punya sumber.json dan memakai sidik 'lama'.
import fs from 'node:fs';
import path from 'node:path';

export const SIDIK_LAMA = 'lama';

export function sidikDariSumber(teks) {
  try {
    const s = JSON.parse(teks);
    return typeof s?.sha256 === 'string' && /^[0-9a-f]{64}$/.test(s.sha256) ? s.sha256 : SIDIK_LAMA;
  } catch { return SIDIK_LAMA; }
}

export function buatPersetujuan(akar) {
  const fileSumber = path.join(akar, 'sumber.json');
  const fileSetuju = path.join(akar, 'persetujuan.json');

  function sidik() {
    try { return sidikDariSumber(fs.readFileSync(fileSumber, 'utf8')); } catch { return SIDIK_LAMA; }
  }

  function sudah() {
    try { return JSON.parse(fs.readFileSync(fileSetuju, 'utf8'))?.sha256 === sidik(); } catch { return false; }
  }

  /** @returns {boolean} true kalau dicatat, false kalau sidik tidak cocok. Error tulis dilempar ke pemanggil. */
  function catat(sha256) {
    const kini = sidik();
    if (typeof sha256 !== 'string' || sha256 !== kini) return false;
    fs.writeFileSync(fileSetuju, JSON.stringify({ sha256: kini, waktu: new Date().toISOString() }));
    return true;
  }

  function lupakan() {
    fs.rmSync(fileSumber, { force: true });
    fs.rmSync(fileSetuju, { force: true });
  }

  return { sidik, sudah, catat, lupakan };
}
