# CI & Analisis

Empat workflow + Dependabot. Semuanya jalan di runner gratis GitHub
(`ubuntu-latest`, 4 vCPU / 16 GB).

```
push / PR ──┬─→ build-apk.yml    ─→ APK artifact  (+ GitHub Release kalau tag)
            ├─→ code-quality.yml ─→ lint, test, audit, shellcheck
            ├─→ codeql.yml       ─→ SARIF ke tab Security
            └─→ security.yml     ─→ dependency-review, gitleaks, scorecard
```

---

## 1. `build-apk.yml` — build & rilis

| Trigger | Yang terjadi |
|---|---|
| push ke `main` | build engine → APK release → upload artifact (30 hari) |
| pull request | build engine → APK **debug** (cuma buat cek compile) |
| push tag `v*` | semua di atas **+ GitHub Release** dengan APK & `sha256` |
| `workflow_dispatch` | build manual, bisa pilih `release` / `debug` |

Dua job:

**`engine`** — jalan di **Node 18.20.4**, versi yang persis sama dengan Node di
dalam nodejs-mobile. Urutannya: `npm ci` → `eslint` → `node --test` → `esbuild`
→ `node dist/bundle.cjs --selftest`. Kalau engine nggak sehat, APK nggak
pernah dibuild.

**`apk`** — JDK 17 (temurin) → Android SDK 34 + NDK 26.1.10909125 + CMake 3.22.1
→ bundle dari artifact → `cacache` nodejs-mobile (57 MB, di-cache) → keystore
dari secrets (kalau ada) → `:app:testDebugUnitTest` → `:app:lintDebug` →
`assembleRelease` → rename + `sha256sum` → **verifikasi isi APK**
(`unzip -l | grep libnode.so|bundle.cjs|libnodebridge.so`) → upload.

Langkah verifikasi isi APK itu penting: tanpa itu, APK bisa "berhasil" dibuild
tapi kosong dari engine — dan baru ketahuan setelah di-install ke HP.

**`release`** — cuma jalan kalau ref-nya tag `v*`. Pakai
`softprops/action-gh-release@v2`, `generate_release_notes: true`, dan
menandai prerelease otomatis kalau tag-nya mengandung `-rc` atau `-beta`.

### Secrets (opsional)

| Secret | Fungsi |
|---|---|
| `KEYSTORE_BASE64` | keystore dalam base64 → APK di-sign resmi |
| `KEYSTORE_PASSWORD` | password store |
| `KEY_ALIAS` | alias key |
| `KEY_PASSWORD` | password key |

Tanpa keempatnya, APK di-sign debug key — tetap bisa di-install, dan workflow
tetap hijau.

---

## 2. `code-quality.yml` — analisis statis & test

Cepat (< 5 menit) supaya bisa jadi gerbang review tiap PR.

**Job `js`** — matrix **Node × direktori**:

| | bot-js | cli |
|---|---|---|
| Node 18.20.4 | ✅ (runtime asli di APK) | — |
| Node 20 | ✅ | ✅ |
| Node 22 | ✅ | ✅ |

Per direktori: `npm ci` → ESLint → `node --check` tiap file di `src/` →
`node --test` → `esbuild` → jalankan bundle hasilnya di Node versi itu.

Node 18 ada di matrix **khususnya** karena itu runtime yang dipakai di HP —
kalau ada yang pakai API Node 20+, ini yang nangkep lebih dulu.

**Job `audit`** — `npm audit --omit=dev --audit-level=high` untuk `bot-js` dan
`cli`. Cuma dependency produksi yang bisa menggagalkan; devDependency
dilaporkan saja (nggak ikut masuk APK). Plus grep pola token
(`ghp_`, `github_pat_`, `re_`, `tskey-auth-`, `os_v2_app_`, `gsk_`, `vcp_`, `sk-`)
di seluruh isi repo.

**Job `scripts`** — ShellCheck untuk semua `*.sh`, `actionlint` untuk file
workflow, validasi YAML, dan cek bit `+x` di `gradlew`, `scripts/*.sh`,
`cli/setup-termux.sh`.

---

## 3. `codeql.yml` — SAST

| Bahasa | Build mode |
|---|---|
| `javascript-typescript` | `none` (CodeQL nggak perlu build) |
| `java-kotlin` | `manual` |

Untuk Kotlin, CodeQL perlu build yang di-*trace*. `build-mode: manual` dipakai
(bukan `autobuild`) supaya bisa menyiapkan prasyarat dulu: bundle placeholder +
`scripts/fetch-nodejs-mobile.sh`, baru `./gradlew :app:assembleDebug -x lint -x test`.

Query set: `security-and-quality`. Upload SARIF dilewati untuk PR dari **fork**
(normanya nggak punya izin `security-events: write`) supaya job-nya nggak merah
palsu.

Jalan juga tiap Senin 03:17 UTC — query CodeQL di-update terus, jadi kode lama
bisa ketemu masalah baru.

---

## 4. `security.yml` — supply chain

**`dependency-review`** (PR saja) — `fail-on-severity: high`,
`deny-licenses: GPL-3.0, AGPL-3.0, SSPL-1.0`.

**`gitleaks`** — `fetch-depth: 0` (perlu sejarah penuh), komentar hasilnya di
PR. Konfigurasi di [`.gitleaks.toml`](../.gitleaks.toml): pakai ruleset bawaan
+ aturan khusus untuk token yang dipakai ekosistem proyek ini, plus allowlist
untuk nilai contoh di dokumentasi.

**`scorecard`** — OpenSSF Scorecard, hasilnya ke tab Security dan ke
[securityscorecards.dev](https://securityscorecards.dev). Jalan di push,
jadwal, dan manual (nggak di PR karena butuh `id-token: write`).

---

## 5. Dependabot

[`.github/dependabot.yml`](../.github/dependabot.yml), tiap Senin 03:00 WIB,
di-group biar cuma beberapa PR:

| Ekosistem | Direktori | Catatan |
|---|---|---|
| `github-actions` | `/` | semua action di-*group* jadi 1 PR |
| `npm` | `/bot-js` | `@whiskeysockets/baileys` dikunci dari major otomatis |
| `npm` | `/cli` | semua di-group |
| `gradle` | `/` | AGP & Kotlin dikunci dari major otomatis |

**Alasan penguncian:** engine di APK harus tetap Node 18-compatible, dan
naikkan Baileys / AGP harus dilakukan sadar sambil menjalankan
`npm run build && node dist/bundle.cjs --selftest` **di Node 18** —
bukan lewat PR otomatis yang hijau di Node 22 tapi mati di HP.

---

## Menjalankan CI di lokal

```bash
# yang sama dengan job `engine`
cd bot-js && npm ci && npm run lint && npm test && npm run build
node dist/bundle.cjs --selftest     # jalankan di Node 18 kalau ada

# yang sama dengan job `scripts`
find . -name '*.sh' -not -path './node_modules/*' -exec shellcheck {} +
actionlint

# yang sama dengan job `apk`
bash scripts/build-local.sh
```
