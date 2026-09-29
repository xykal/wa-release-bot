# Ikut ngoding

## Setup

```bash
git clone https://github.com/xykal/wa-release-bot.git
cd wa-release-bot

# engine bot + CLI (npm workspaces, satu package-lock.json di root)
npm ci --ignore-scripts
npm run lint && npm test && npm run build
node cli/src/bot.mjs --version

# Android — butuh JDK 17, Android SDK 35, NDK 26.1.10909125, CMake 3.22.1
bash scripts/build-local.sh assembleDebug
```

## Alur perubahan

Semua perubahan lewat **branch + pull request** ke `main`, termasuk dari pemilik repo
(permintaan kall, 2026-09-29): CI (Code quality, Build APK, Security, CodeQL) jalan di
PR, kall me-review dan merge dari HP kapan sempat. Satu PR per ronde kerja; kalau PR
sebelumnya belum di-merge, commit berikutnya ditumpuk ke branch yang sama supaya cuma
ada satu tombol merge.

## Aturan penting

### 1. Engine harus tetap jalan di Node 18

Runtime di dalam APK adalah **Node 18.20.4** (nodejs-mobile). Node 18 **belum**
punya `globalThis.crypto`, jadi:

- Jangan hapus banner polyfill di `bot-js/build.mjs`
- Jangan pakai API Node 19+ (`structuredClone` boleh — itu Node 17)
- Selalu uji bundle-nya di Node 18 sebelum PR:

  ```bash
  cd bot-js && npm run build
  node dist/bundle.cjs --selftest     # ← harus pakai Node 18
  ```

CI sudah mengetes di Node 18.20.4 / 20 / 22 sekaligus (job `js` di
`code-quality.yml`).

### 2. Jangan pakai top-level await

Output bundle-nya **CJS**, dan esbuild nolak TLA:

```
✘ [ERROR] Top-level await is currently not supported with the "cjs" output format
```

Bungkus dalam fungsi async dan panggil dari `main()` — lihat
`bot-js/src/bot.mjs`.

### 3. Jangan pernah commit secret

Token, keystore, `config.json`, `state.json`, folder `wa-session/` — semua sudah
di-gitignore, tapi gitleaks juga jalan di CI. Kalau kepentok, rotate token-nya
dulu sebelum ngapus dari git.

### 4. Tulis pesan log dalam bahasa Indonesia

Semua output log & pesan error proyek ini pakai bahasa Indonesia santai
(`😴 Nggak ada update...`). Ikuti gaya itu biar konsisten.

## Alur PR

1. Branch dari `main`
2. Commit kecil-kecil dengan pesan jelas
3. Jalankan checklist di template PR
4. Tunggu CI hijau — `build-apk`, `code-quality`, `CodeQL`, `Security`

## Rilis

```bash
# naikkan versionName/versionCode di app/build.gradle + catat di CHANGELOG.md
git tag v1.1.1 && git push origin v1.1.1
```

Workflow `build-apk.yml` akan build APK dan otomatis bikin GitHub Release
dengan APK + `sha256` terlampir.
