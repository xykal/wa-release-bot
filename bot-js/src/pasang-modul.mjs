// ============================================================================
//  "npm install" mini — buat project bot yang di-upload TANPA node_modules.
//
//  Di HP nggak ada npm, jadi ini ngerjain versi sederhananya sendiri:
//    1. baca dependencies di package.json
//    2. tanya registry npm versi mana yang cocok (semver)
//    3. download tarball (.tgz), bongkar ke node_modules
//    4. ulangi buat dependensi dari dependensi (hoisting ala npm: sebisa
//       mungkin di node_modules paling atas, kalau bentrok versi → nested)
//
//  Batasan (jujur aja):
//    - script install/postinstall NGGAK dijalanin (nggak ada shell & compiler)
//    - paket native (node-gyp / .node) → ke-install tapi hampir pasti gagal
//      dipakai; dikasih peringatan
//    - dependensi dari GitHub didukung, tapi kalau repo-nya perlu di-build
//      dulu (TypeScript dsb.) ya nggak jalan
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import semver from 'semver';
import { bongkarTgz } from './tar.mjs';

const REGISTRY = 'https://registry.npmjs.org';
const UA = 'wa-release-bot-hosting (android)';

/** Pecah spesifikasi versi dari package.json jadi sumber yang jelas. */
export function bacaSpek(nama, spek) {
  let s = String(spek ?? '').trim();
  if (!s || s === 'latest' || s === '*' || s === 'x') return { jenis: 'registry', nama, rentang: '*' };
  if (s.startsWith('npm:')) {
    // alias: "npm:@scope/paket@^1.2.3"
    const isi = s.slice(4);
    const at = isi.lastIndexOf('@');
    if (at > 0) return { jenis: 'registry', nama: isi.slice(0, at), rentang: isi.slice(at + 1) || '*' };
    return { jenis: 'registry', nama: isi, rentang: '*' };
  }
  if (/^(file|link|workspace|portal):/.test(s)) return { jenis: 'lokal', nama, spek: s };
  if (/^https?:\/\/.+\.(tgz|tar\.gz)(\?.*)?$/.test(s)) return { jenis: 'url', nama, url: s };
  // github:user/repo#ref, user/repo#ref, git+https://github.com/user/repo.git#ref
  let m = /^(?:github:)?([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:#(.+))?$/.exec(s);
  if (!m) m = /^git(?:\+https?|\+ssh)?:\/\/(?:git@)?github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:#(.+))?$/.exec(s);
  if (m && !semver.validRange(s)) {
    return { jenis: 'github', nama, pemilik: m[1], repo: m[2], ref: m[3] || 'HEAD' };
  }
  if (s.startsWith('git')) return { jenis: 'lokal', nama, spek: s }; // git lain: nggak didukung
  if (s.startsWith('v') && semver.valid(s)) s = s.slice(1);
  return { jenis: 'registry', nama, rentang: s };
}

async function ambil(url, { json = false, coba = 3, timeoutMs = 60_000 } = {}) {
  let galat;
  for (let i = 0; i < coba; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': UA,
          Accept: json ? 'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8' : '*/*',
        },
        signal: ctrl.signal,
      });
      if (res.status === 404) throw Object.assign(new Error('nggak ada (404)'), { permanen: true });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return json ? await res.json() : Buffer.from(await res.arrayBuffer());
    } catch (e) {
      galat = e;
      if (e.permanen) break;
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    } finally {
      clearTimeout(t);
    }
  }
  throw galat;
}

// Peer dependency yang isinya alat developer (linter, compiler). Bot nggak
// butuh ini buat jalan, dan ukurannya bisa ratusan MB — jadi nggak ikut dipasang.
const ALAT_DEV = /^(typescript|eslint|prettier|@types\/.*|@typescript-eslint\/.*|@typescript\/.*|ts-node|tsx)$/;

/** Cek field `os` / `cpu` paket (format npm: ["linux", "!win32"]). */
export function cocokPlatform(pj, platform = process.platform, arch = process.arch) {
  const cek = (daftar, nilai) => {
    if (!Array.isArray(daftar) || !daftar.length) return true;
    const tolak = daftar.filter((d) => String(d).startsWith('!')).map((d) => d.slice(1));
    const boleh = daftar.filter((d) => !String(d).startsWith('!'));
    if (tolak.includes(nilai)) return false;
    return boleh.length === 0 || boleh.includes(nilai);
  };
  return cek(pj?.os, platform) && cek(pj?.cpu, arch);
}

function bacaJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

/**
 * Install semua dependencies project ke `<dir>/node_modules`.
 * @param {string} dir folder project (ada package.json)
 * @param {{log?:(s:string)=>void, progres?:(p:{selesai:number,total:number,nama:string})=>void, batal?:{aktif:boolean}}} opsi
 */
export async function pasangModul(dir, { log = () => { }, progres = () => { }, batal = { aktif: false } } = {}) {
  const pkg = bacaJson(path.join(dir, 'package.json'));
  if (!pkg) throw new Error('package.json nggak ada / rusak.');
  const nm = path.join(dir, 'node_modules');
  fs.mkdirSync(nm, { recursive: true });

  const metaCache = new Map();
  async function meta(nama) {
    if (!metaCache.has(nama)) {
      const url = `${REGISTRY}/${nama.startsWith('@') ? '@' + encodeURIComponent(nama.slice(1)) : encodeURIComponent(nama)}`;
      metaCache.set(nama, ambil(url, { json: true }));
    }
    return metaCache.get(nama);
  }

  // Apa yang udah kepasang, per lokasi folder node_modules → nama → versi
  const terpasang = new Map(); // key: path lengkap folder paket, value: versi
  const peringatan = [];
  let selesai = 0;
  let total = 0;
  let gagal = 0;

  // Antrian: { nama, spek, dariDir (folder paket yang butuh), opsional }
  const antrian = [];
  const tambah = (deps, dariDir, opsional = false) => {
    for (const [nama, spek] of Object.entries(deps || {})) {
      antrian.push({ nama, spek, dariDir, opsional });
      total++;
    }
  };
  tambah(pkg.dependencies, dir);
  tambah(pkg.optionalDependencies, dir, true);

  /** Cari paket yang bakal ketemu sama require() dari `dariDir` (jalan naik ke atas). */
  function cariTerlihat(nama, dariDir) {
    const akar = path.resolve(dir);
    let d = path.resolve(dariDir);
    for (;;) {
      const kandidat = path.join(d, 'node_modules', nama);
      if (terpasang.has(kandidat)) return { lokasi: kandidat, versi: terpasang.get(kandidat) };
      if (d === akar || !d.startsWith(akar)) return null;
      d = path.dirname(d);
    }
  }

  async function pasangSatu(tugas) {
    const spek = bacaSpek(tugas.nama, tugas.spek);
    if (spek.jenis === 'lokal') {
      peringatan.push(`${tugas.nama}: "${tugas.spek}" nggak bisa di-install di HP — dilewatin.`);
      return;
    }

    let versi;
    let urlTar;
    let data = null;
    if (spek.jenis === 'registry') {
      const m = await meta(spek.nama);
      const semua = Object.keys(m.versions || {});
      const tags = m['dist-tags'] || {};
      if (tags[spek.rentang]) versi = tags[spek.rentang];
      else if (spek.rentang === '*' && tags.latest) versi = tags.latest;
      else {
        const rentang = semver.validRange(spek.rentang, { loose: true }) || spek.rentang;
        // Utamakan versi `latest` kalau masuk rentang (sama kayak npm)
        if (tags.latest && semver.satisfies(tags.latest, rentang, { loose: true })) versi = tags.latest;
        else versi = semver.maxSatisfying(semua.filter((v) => !semver.prerelease(v)), rentang, { loose: true }) ||
          semver.maxSatisfying(semua, rentang, { loose: true, includePrerelease: true });
      }
      if (!versi || !m.versions[versi]) throw new Error(`nggak ada versi yang cocok sama "${tugas.spek}"`);
      data = m.versions[versi];
      urlTar = data.dist?.tarball;
      if (!cocokPlatform(data)) {
        // Paket khusus OS/CPU lain (mis. @esbuild/win32-x64) — npm juga ngelewatin ini.
        if (!tugas.opsional) peringatan.push(`${tugas.nama}@${versi}: khusus ${[data.os, data.cpu].flat().filter(Boolean).join('/')} — dilewatin.`);
        return;
      }
    } else if (spek.jenis === 'github') {
      urlTar = `https://codeload.github.com/${spek.pemilik}/${spek.repo}/tar.gz/${spek.ref}`;
      versi = `github:${spek.pemilik}/${spek.repo}#${spek.ref}`;
    } else {
      urlTar = spek.url;
      versi = spek.url;
    }

    // Udah kelihatan dari posisi ini & cocok? → nggak usah pasang lagi
    const ada = cariTerlihat(tugas.nama, tugas.dariDir);
    if (ada && (ada.versi === versi ||
      (spek.jenis === 'registry' && semver.valid(ada.versi) &&
        semver.satisfies(ada.versi, semver.validRange(spek.rentang, { loose: true }) || '*', { loose: true })))) {
      return;
    }

    // Taruh paling atas kalau belum ada yang namanya sama di sana; kalau
    // udah ada (versi lain) → nested di bawah paket yang butuh.
    const atas = path.join(nm, tugas.nama);
    const lokasi = !terpasang.has(atas) ? atas : path.join(tugas.dariDir, 'node_modules', tugas.nama);
    if (terpasang.has(lokasi)) return; // udah diklaim versi lain di posisi yang sama
    terpasang.set(lokasi, versi);

    const tgz = await ambil(urlTar, { timeoutMs: 120_000 });
    fs.rmSync(lokasi, { recursive: true, force: true });
    bongkarTgz(tgz, lokasi, { buangDepan: 1 });

    const pj = bacaJson(path.join(lokasi, 'package.json')) || data || {};
    if (pj.gypfile || fs.existsSync(path.join(lokasi, 'binding.gyp')) ||
      /node-gyp|prebuild-install|node-pre-gyp|cmake-js/.test(
        [pj.scripts?.install, pj.scripts?.preinstall, pj.scripts?.postinstall].filter(Boolean).join(' '))) {
      peringatan.push(`${tugas.nama}@${pj.version || versi}: paket native — kemungkinan besar nggak jalan di HP.`);
    }
    if (spek.jenis === 'github' && pj.scripts?.prepare) {
      peringatan.push(`${tugas.nama}: dari GitHub & punya script "prepare" (butuh build) — bisa jadi nggak jalan.`);
    }

    tambah(pj.dependencies, lokasi);
    tambah(pj.optionalDependencies, lokasi, true);
    // peerDependencies wajib (bukan opsional) ikut dipasang, kayak npm 7+
    const peerOps = pj.peerDependenciesMeta || {};
    const peerWajib = Object.fromEntries(Object.entries(pj.peerDependencies || {})
      .filter(([n]) => !peerOps[n]?.optional && !ALAT_DEV.test(n)));
    tambah(peerWajib, dir);
  }

  const PARALEL = 6;
  const jalan = new Set();
  const mulai = Date.now();
  log(`📦 Pasang modul buat "${pkg.name || 'project'}" — ${Object.keys(pkg.dependencies || {}).length} dependensi langsung.`);

  // Diproses per gelombang biar dependensi langsung dapet posisi paling atas duluan.
  while (antrian.length || jalan.size) {
    if (batal.aktif) throw new Error('dibatalin');
    while (antrian.length && jalan.size < PARALEL) {
      const tugas = antrian.shift();
      const p = pasangSatu(tugas)
        .catch((e) => {
          if (tugas.opsional) peringatan.push(`${tugas.nama} (opsional) gagal: ${e.message}`);
          else { gagal++; log(`❌ ${tugas.nama}@${tugas.spek}: ${e.message}`); }
        })
        .finally(() => {
          jalan.delete(p);
          selesai++;
          progres({ selesai, total, nama: tugas.nama });
        });
      jalan.add(p);
    }
    if (jalan.size) await Promise.race(jalan);
  }

  for (const w of peringatan) log('⚠️ ' + w);
  const detik = Math.round((Date.now() - mulai) / 1000);
  log(`${gagal ? '⚠️' : '✅'} Selesai: ${terpasang.size} paket kepasang dalam ${detik} dtk` + (gagal ? `, ${gagal} gagal.` : '.'));
  return { jumlah: terpasang.size, gagal, peringatan };
}
