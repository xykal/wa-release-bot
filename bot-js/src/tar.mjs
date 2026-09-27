// ============================================================================
//  Pembongkar .tgz mini (buat tarball npm / GitHub). Sengaja ditulis sendiri:
//  paket `tar` dari npm gede dan narik banyak dependensi. Yang didukung cuma
//  yang dipakai tarball paket: file biasa, folder, header PAX & GNU longname.
//  Symlink / hardlink / device dilewatin.
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

function teks(buf, mulai, panjang) {
  const potong = buf.subarray(mulai, mulai + panjang);
  const nol = potong.indexOf(0);
  return potong.subarray(0, nol === -1 ? potong.length : nol).toString('utf8');
}

function oktal(buf, mulai, panjang) {
  // Ukuran > 8 GB pakai format base-256 — nggak mungkin buat paket npm.
  const s = teks(buf, mulai, panjang).trim();
  return s ? parseInt(s, 8) : 0;
}

function bacaPax(isi) {
  const hasil = {};
  let i = 0;
  const s = isi.toString('utf8');
  while (i < s.length) {
    const spasi = s.indexOf(' ', i);
    if (spasi === -1) break;
    const n = parseInt(s.slice(i, spasi), 10);
    if (!n) break;
    const rekaman = s.slice(spasi + 1, i + n - 1);
    const sm = rekaman.indexOf('=');
    if (sm > 0) hasil[rekaman.slice(0, sm)] = rekaman.slice(sm + 1);
    i += n;
  }
  return hasil;
}

/**
 * Pecah isi tar (sudah di-gunzip) jadi daftar entri.
 * @returns {{nama:string, jenis:'file'|'folder', isi?:Buffer}[]}
 */
export function bacaTar(buf) {
  const entri = [];
  let off = 0;
  let namaPanjang = null;
  let pax = null;
  while (off + 512 <= buf.length) {
    const h = buf.subarray(off, off + 512);
    if (h.every((b) => b === 0)) break; // blok kosong = akhir arsip
    let nama = teks(h, 0, 100);
    const prefix = teks(h, 345, 155);
    if (prefix) nama = prefix + '/' + nama;
    const ukuran = oktal(h, 124, 12);
    const tipe = String.fromCharCode(h[156] || 48);
    const isi = buf.subarray(off + 512, off + 512 + ukuran);
    off += 512 + Math.ceil(ukuran / 512) * 512;

    if (tipe === 'L') { namaPanjang = teks(isi, 0, isi.length); continue; }
    if (tipe === 'x') { pax = bacaPax(isi); continue; }
    if (tipe === 'g') continue; // header global — abaikan

    if (pax?.path) nama = pax.path;
    if (namaPanjang) nama = namaPanjang;
    pax = null;
    namaPanjang = null;

    if (tipe === '0' || tipe === '\0' || tipe === '7') entri.push({ nama, jenis: 'file', isi });
    else if (tipe === '5') entri.push({ nama, jenis: 'folder' });
    // tipe lain (symlink '2', hardlink '1', dll.) sengaja dilewatin
  }
  return entri;
}

/** Path aman: buang komponen pertama (package/ atau repo-sha/), tolak "..". */
export function jalurAman(nama, buangDepan = 1) {
  const bagian = String(nama).replace(/\\/g, '/').split('/').filter((b) => b && b !== '.');
  if (bagian.some((b) => b === '..')) return null;
  const sisa = bagian.slice(buangDepan);
  return sisa.length ? sisa.join('/') : null;
}

/** Bongkar buffer .tgz ke folder tujuan. @returns jumlah file */
export function bongkarTgz(tgz, tujuan, { buangDepan = 1 } = {}) {
  const tar = zlib.gunzipSync(tgz);
  const entri = bacaTar(tar);
  let n = 0;
  const akar = path.resolve(tujuan);
  fs.mkdirSync(akar, { recursive: true });
  for (const e of entri) {
    const rel = jalurAman(e.nama, buangDepan);
    if (!rel) continue;
    const target = path.join(akar, rel);
    if (!target.startsWith(akar + path.sep)) continue;
    if (e.jenis === 'folder') { fs.mkdirSync(target, { recursive: true }); continue; }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, e.isi);
    n++;
  }
  return n;
}
