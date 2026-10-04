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
| push ke `main` | build engine → APK release arm64-v8a **dan** armeabi-v7a (HP uji 32-bit) → upload artifact |
| pull request | build engine → APK arm64-v8a saja (cuma buat cek compile, cepat) |
| push tag `v*` | semua di atas **+ GitHub Release** dengan APK & `sha256` |
| `workflow_dispatch` | build manual, bisa pilih `release` / `debug` **dan ABI-nya** |
| push tag `v*` | **tiga APK sekaligus** (arm64, armeabi-v7a, universal) → GitHub Release |

Dua job:

**`engine`** — jalan di **Node 18.20.4**, versi yang persis sama dengan Node di
dalam nodejs-mobile. Urutannya: `npm ci` → `eslint` → `node --test` → `esbuild`
→ `node dist/bundle.cjs --selftest`. Kalau engine nggak sehat, APK nggak
pernah dibuild.

**`apk`** — JDK 17 (temurin) → Android SDK 35 + NDK 26.1.10909125 + CMake 3.22.1
→ bundle dari artifact → `cacache` nodejs-mobile (di-cache) → keystore
dari secrets (kalau ada) → `:app:testDebugUnitTest` → `:app:lintDebug` →
`assembleRelease` → rename + `sha256sum` → **verifikasi isi APK** → upload.

Job `apk`-nya pakai **matrix**: tiap set ABI jadi satu job sendiri, jalan
paralel. Jadi menerbitkan tiga APK nggak bikin CI-nya tiga kali lebih lama.
Grup `concurrency`-nya memuat ABI, supaya ketiga job itu nggak saling
membatalkan.

Verifikasi isi APK-nya cek tiga hal, dan ketiganya penting:
1. `bundle.cjs` + `libnode.so` + `libnodebridge.so` benar-benar ada — tanpa itu
   APK bisa "berhasil" dibuild tapi kosong dari engine, dan baru ketahuan
   setelah di-install ke HP.
2. **Tiap ABI yang diminta** ada di `lib/<abi>/libnode.so`. Kalau minta dua ABI
   tapi cuma satu yang kepackage, APK-nya tetap "berhasil" — dan HP yang satunya
   cuma dapat crash. Jadi dicek per-ABI, bukan asal ada salah satu.
3. **Dex hasil R8 masih memuat nama yang dipanggil lewat string.** R8 me-rename
   class jadi `a`, `b`, `c`; kalau yang ke-rename itu `NodeBridge` (dipanggil
   JNI), worker WorkManager, atau komponen manifest, aplikasinya crash **di HP**
   — bukan di CI. Jadi `classes*.dex`-nya dibaca, dicari deskriptor class-nya.
   Tanpa langkah ini, `minifyEnabled true` itu taruhan.

**`release`** — cuma jalan kalau ref-nya tag `v*`. Pakai
`softprops/action-gh-release@v2`, `generate_release_notes: true`, dan
menandai prerelease otomatis kalau tag-nya mengandung `-rc` atau `-beta`.

### Secrets (opsional)

| Secret | Fungsi |
|---|---|
| `KEYSTORE_BASE64` | keystore dalam base64 → APK di-sign dengan kunci tetap |
| `KEYSTORE_PASSWORD` | password store |
| `KEY_ALIAS` | alias key |
| `KEY_PASSWORD` | password key |

Build release juga menyalakan **R8** (`minifyEnabled` + `shrinkResources`).
Aturan keep-nya ada di `app/proguard-rules.pro`, sengaja pendek karena
aplikasi ini nggak pakai reflection. Efeknya ke ukuran terbatas — yang
mendominiasi APK ini `libnode.so`, bukan `classes.dex`.

Tanpa keempatnya, APK di-sign pakai debug key **bawaan runner** — tetap bisa
di-install dan workflow tetap hijau, tapi runner itu bersih tiap kali, jadi
kuncinya di-generate ulang tiap build. Akibatnya tiap APK punya sidik jari
berbeda dan **nggak bisa dipasang nimpa APK sebelumnya** (`App not installed`).

Jadi walau cuma buat dipakai sendiri, patok keystore-nya sekali. Bikin + pasang:

```bash
keytool -genkeypair -v -keystore my-release.jks -alias warelease \
  -keyalg RSA -keysize 4096 -validity 10000 -storetype PKCS12 \
  -storepass GANTI_INI -keypass GANTI_INI -dname "CN=Nama Lo, O=nama-lo, C=ID"

base64 -w0 my-release.jks     # → tempel ke secret KEYSTORE_BASE64
```

Cara ngecek dua APK di-sign kunci yang sama, tanpa install Android SDK:

```bash
python3 scripts-dev/apk_signer.py apk-lama.apk apk-baru.apk
```

---

## 2. `code-quality.yml` — analisis statis & test

Cepat (< 5 menit) supaya bisa jadi gerbang review tiap PR.

**Job `lockfile`** — jalan pertama. Repo memakai **npm workspaces** (root
`package.json` → `bot-js` + `cli`), jadi cuma ada satu `package-lock.json` di
root. Kalau lockfile belum ada / tidak sinkron, job ini membuatnya dengan
`npm install --package-lock-only` dan meng-commit ke `main` (identitas `xykal`
lewat `GITHUB_TOKEN`). Di PR dari fork hanya melaporkan.

**Job `js`** — matrix Node **18.20.4** (runtime asli di APK), **20**, **22**.
Langkahnya: `npm ci --ignore-scripts` di root → ESLint (`-w bot-js`) →
`node --check` semua `.mjs` di `bot-js/src` **dan** `cli/src` → `node --test`
→ `esbuild` → jalankan bundle hasilnya (`--selftest`) → `node cli/src/bot.mjs
--version` → `node --test cli/test/cli.test.mjs` (proses CLI sungguhan dengan GitHub palsu
lewat `--import`: `--dry-run`, `--once` baseline/tidur/304, config hilang; WA
tidak pernah disentuh).
Node 18 ada di matrix **khususnya** karena itu runtime yang dipakai di HP.

**Job `android-statis`** — tanpa Gradle: urutan `System.loadLibrary` di
`NodeBridge.kt`, validasi XML semua resource + manifest, wajib ada
`res/values/brand.xml` dan `bot-js/src/config/brand.mjs`, dan **menolak**
literal brand di layout (`android:text="BUILT IN|Powered by|XyVerse Tech"`).
Ini yang menjaga aturan "satu sumber string brand". Job yang sama memastikan
nama string Indonesia/Inggris identik, seluruh fitur tambahan default mati, dan
`BootReceiver` privat hanya menerima dua broadcast sistem standar. Job juga
menolak literal `workers.dev` di `app/` dan mengecek hostname `SUMBER_BAWAAN`
(`bot-js/src/lagu.mjs`) resolve — bug v1.6.0-1.6.7 memakai subdomain yang tidak ada.

**Job `audit`** — `npm audit --omit=dev --audit-level=high` di root (mencakup
kedua workspace). Cuma dependency produksi yang bisa menggagalkan. Plus grep
pola token (`ghp_`, `github_pat_`, `re_`, `tskey-auth-`, `os_v2_app_`, `gsk_`,
`vcp_`, `sk-`) di seluruh isi repo.

**Job `scripts`** — ShellCheck untuk semua `*.sh`, `actionlint` (diunduh dengan
**checksum SHA-256** yang dipin, bukan skrip `curl | bash`) untuk file workflow,
validasi YAML, dan cek bit `+x` di `gradlew`, `scripts/*.sh`, `cli/setup-termux.sh`.

Semua `uses:` di keempat workflow dipin ke **SHA penuh** dengan komentar versi;
Dependabot (`github-actions`) yang menaikkannya.

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
| `npm` | `/` | satu lockfile root (workspaces `bot-js` + `cli`); `@whiskeysockets/baileys` dikunci dari major otomatis |
| `gradle` | `/` | semua update major dikunci otomatis (AGP, Kotlin, Gradle wrapper, okhttp saling terikat) |

**Alasan penguncian:** engine di APK harus tetap Node 18-compatible, dan
naikkan Baileys / AGP harus dilakukan sadar sambil menjalankan
`npm run build && node dist/bundle.cjs --selftest` **di Node 18** —
bukan lewat PR otomatis yang hijau di Node 22 tapi mati di HP.

---

## Menjalankan CI di lokal

```bash
# yang sama dengan job `engine`
npm ci --ignore-scripts && npm run lint && npm test && npm run build   # root (npm workspaces)
node dist/bundle.cjs --selftest     # jalankan di Node 18 kalau ada

# yang sama dengan job `scripts`
find . -name '*.sh' -not -path './node_modules/*' -exec shellcheck {} +
actionlint

# yang sama dengan job `apk`
bash scripts/build-local.sh

# build buat HP 32-bit, atau dua-duanya sekaligus
ABIS=armeabi-v7a bash scripts/build-local.sh
ABIS="arm64-v8a armeabi-v7a" bash scripts/build-local.sh
```

## 6. `deploy-web.yml` — landing page

Trigger: PR/push yang menyentuh `web/**`, `scripts-dev/deploy_web.py`, atau workflow-nya;
plus `workflow_dispatch`.

| Job | Isi | Bukti |
|---|---|---|
| `cek` | `node --check` semua JS + `worker.js`; HTML: referensi lokal ada, semua `data-i18n` punya teks id+en, brand tepat, tidak ada `style=`/handler inline (CSP `style-src 'self'`), tidak ada URL selain github.com / api.github.com / tiktok.com; `deploy_web.py --cek` (manifest hash) | gagal = merah |
| `tangkapan` | `scripts-dev/tangkap_web.py`: Chromium headless render `/`, `/unduh/`, `/unduh/?t=<lewat>`, `/?bahasa=en` pada 14 ukuran layar (320 px sampai ultrawide 2560, portrait + landscape); gagal kalau `scrollWidth` > viewport atau ada elemen keluar layar | artifact `web-tangkapan` (PNG, 2 hari) |
| `deploy` (bukan PR) | `python3 scripts-dev/deploy_web.py` kalau secret `CF_API_TOKEN` ada; kalau kosong: `::notice` lalu lewat | curl: header CSP ada + `/unduh/` punya `#tirai` |

Deploy manual dari mesin sendiri:

```bash
pip install blake3
CF_API_TOKEN=... python3 scripts-dev/deploy_web.py
```

Token Cloudflare yang dipakai (manual maupun secret `CF_API_TOKEN` di GitHub) cukup
*custom token* dengan izin **Account → Workers Scripts: Edit** untuk akun yang memegang
Worker; domain `wabot.projectkal.my.id` sudah terpasang, jadi skrip berhenti di GET
`workers/domains`. Hanya pemasangan domain pertama kali (akun/zone baru) yang butuh
tambahan **Zone → Zone: Read** dan **Workers Routes: Edit** pada zone-nya. Token akun
yang izinnya luas jangan dijadikan secret; bikin token terpisah di dashboard
(My Profile → API Tokens → Create Token → Custom), lalu simpan sebagai secret repo
`CF_API_TOKEN`. Job `deploy` otomatis aktif begitu secret ada.

Kenapa tanpa wrangler: aturan repo "tanpa dependensi runtime tambahan"; skrip memanggil
API yang sama (`assets-upload-session` → `assets/upload` → `PUT scripts/<nama>`), hash aset
memakai rumus wrangler (BLAKE3 dari base64 isi + ekstensi) supaya file yang tidak berubah
tidak diunggah ulang.

## 7. `bersihkan.yml` — hapus jejak Actions

Tiap push bikin lima workflow jalan. Log, artifact, dan cache-nya menumpuk terus:
cukup beberapa hari sampai beberapa GB. Workflow ini yang nyapu, dan APK-nya tidak
ikut hilang karena bukan artifact (lihat bagian berikutnya).

Dua profil (permintaan kall 2026-10-04: "setelah build release draft, hapus jejak
actions, artifacts, cache"):

1. **`workflow_run` — tiap kali `build-apk.yml` selesai di `main`: FULL WIPE.**
   Semua run selesai dihapus (log + artifact-nya ikut), semua cache yang lebih tua
   dari ±1 jam dibuang. Yang tersisa cuma run sapuan itu sendiri — jadi setelah
   tiap build, jejak Actions praktis kosong. Run yang masih berjalan memang tidak
   bisa dihapus API; cache ≤1 jam sengaja tidak disentuh supaya workflow lain yang
   belum selesai (security/code-quality) tidak rusak — sisanya disapu sapuan harian.
2. **Harian 20.00 UTC (03.00 WIB): profil lembut.** Riwayat > 2 hari dibuang,
   artifact > 1 hari, cache > 2 hari — termasuk run sapuan kemarin, jadi jejak
   tidak pernah lebih tua dari sehari.

Manual (`workflow_dispatch`) tetap ada dan umurnya bisa diisi sendiri.

Siapa yang bisa menjalankannya: repo ini personal dan pemiliknya satu-satunya
kolaborator (cek 2026-10-04: cuma `xykal`, admin), jadi `workflow_dispatch`,
push, dan `workflow_run` hanya bisa dipicu pemilik repo — atau siapa pun yang
memegang PAT-nya. Anggota publik tidak bisa menjalankan Actions di repo ini.

| Yang dibersihkan | Bawaan | Env |
|---|---|---|
| riwayat run (log + artifact-nya ikut hilang) | lebih tua dari 2 hari (full wipe: 0) | `HARI_RUN` (run termuda `SIMPAN_RUN` selalu disimpan: harian 15, full wipe 1) |
| artifact | lebih tua dari 1 hari (full wipe: 0, atau sudah `expired`) | `HARI_ARTIFACT` (artifact milik `SIMPAN_RUN` run termuda **selalu** disimpan) |
| cache (Gradle, npm, nodejs-mobile) | tidak dipakai lebih dari 2 hari (full wipe: ±1 jam) | `HARI_CACHE` |
| cache, kalau totalnya masih di atas batas | 1500 MB (full wipe: 400 MB) | `BATAS_CACHE_MB` (yang paling lama dipakai dibuang dulu) |

Jebakan yang sudah kena (2026-10-01): sapuan yang dijalankan **sambil build jalan**
menghapus artifact APK run yang sedang berjalan, jadi job `release-internal` mendapati
artifact kosong dan draft internalnya gagal diperbarui ("ls: cannot access 'dist/'").
Sekarang ada dua penjaga: (1) sapuan tidak pernah menghapus artifact milik `SIMPAN_RUN`
run termuda, dan (2) job draft mencoba unduh dua kali lalu gagal dengan pesan yang
menyebut sebabnya. **Kalau tetap mau agresif, jangan pakai `HARI_ARTIFACT=0` selagi
build jalan** — full wipe aman justru karena dia jalan LEWAT `workflow_run`, artinya
build-nya sudah selesai duluan (dan APK-nya sudah mendarat di draft release).

Logikanya di `scripts-dev/bersihkan_actions.py`; bisa dites dari lokal tanpa menghapus
apa pun:

```bash
GITHUB_TOKEN=... GITHUB_REPOSITORY=xykal/wa-release-bot \
  python3 scripts-dev/bersihkan_actions.py --kering    # cuma lapor
```

Retention artifact di workflow lain juga dipendekkan (APK 1 hari, engine/lint 2 hari,
R8 mapping 3 hari), jadi walau penyapu belum jalan, sampahnya tetap kecil.

## 8. Draft release internal — APK buat HP uji

Job `release-internal` di `build-apk.yml` (jalan saat push ke `main`, dan bisa
dipanggil manual: `workflow_dispatch` di branch `main` — berguna kalau draft-nya
ketinggalan gara-gara build terakhir gagal) menaruh APK
arm64-v8a + armeabi-v7a di **draft release** bertag `internal-<versi>`:

- draft = cuma pemilik repo yang bisa lihat dan unduh tautannya; `releases/latest`
  tidak menghitung draft, jadi tidak ada APK yang beredar sebelum launching;
- umurnya tidak habis sendiri (beda dari artifact yang mati dalam 1-2 hari);
- isinya diganti tiap build (`scripts-dev/rilis_internal.py`), dan draft `internal-*`
  versi lain dihapus otomatis, jadi jejaknya tetap satu.

Dua jebakan GitHub yang sudah kena dan sudah ditambal di skrip itu:

1. `GET /releases/tags/<tag>` menjawab **404 untuk release draft**, jadi pencarian
   lewat endpoint itu bikin skrip mengira draft belum ada.
2. `tag_name` sebuah draft **bukan pegangan yang stabil**: begitu ada draft lain
   yang memakai tag itu, GitHub membalasnya sebagai `untagged-<hash>`. Pencarian
   berbasis tag jadi meleset dan tiap build bikin draft baru (kejadian 2026-09-30:
   dua draft `Build internal 1.8.0`, yang lama masih menyimpan APK basi).

Karena itu draft dicocokkan lewat **nama** (`Build internal <versi>`) juga, dan
`bersihkan_internal_lain()` mengenali draft dari tag **atau** nama — yang dipakai
sekarang dilewatkan berdasarkan `id`, bukan tag.

Cara ambil APK-nya: buka `https://github.com/xykal/wa-release-bot/releases` (selagi
login), pilih **Build internal <versi>**, unduh APK yang sesuai. Bisa juga lewat API:

```bash
# catatan dua hal: (1) /releases/tags/<tag> menjawab 404 untuk release DRAFT,
# (2) tag_name draft bisa jadi "untagged-<hash>" — jadi draft dikenali dari nama.
curl -sL -H "Authorization: Bearer $TOK" \
  "https://api.github.com/repos/xykal/wa-release-bot/releases?per_page=10" | \
  python3 -c "
import json,sys
for r in json.load(sys.stdin):
    if r.get('draft') and str(r.get('name','')).startswith('Build internal'):
        print(r['name'], '| tag_name:', r['tag_name'], '| id:', r['id'])
        for a in r['assets']: print('  ', a['name'], a['size'], a['browser_download_url'])
"
```

Hari launching, draft `internal-*` (beserta tag `internal-*`) dihapus bareng draft
v1.7.0/v1.8.0 sebelum tag `v1.0.0` dipush.

## 9. Siapa yang bisa menjalankan workflow (repo tetap publik)

Repo publik = kode boleh dibaca siapa aja. Yang dikunci di sisi Actions (semuanya
diatur lewat API, jadi nggak gantung setelan di UI):

```bash
# 1. izin default token Actions: read-only
curl -X PUT -H "Authorization: Bearer $TOK" \
  https://api.github.com/repos/xykal/wa-release-bot/actions/permissions/workflow \
  -d '{"default_workflow_permissions":"read","can_approve_pull_request_reviews":false}'

# 2. PR dari fork wajib disetujui manual sebelum ada workflow yang jalan
curl -X PUT -H "Authorization: Bearer $TOK" \
  https://api.github.com/repos/xykal/wa-release-bot/actions/permissions/fork-pr-contributor-approval \
  -d '{"approval_policy":"all_external_contributors"}'

# 3. semua action wajib dipin ke commit SHA
curl -X PUT -H "Authorization: Bearer $TOK" \
  https://api.github.com/repos/xykal/wa-release-bot/actions/permissions \
  -d '{"enabled":true,"allowed_actions":"all","sha_pinning_required":true}'

# 4. main wajib lewat PR, tanpa force push
curl -X PUT -H "Authorization: Bearer $TOK" \
  https://api.github.com/repos/xykal/wa-release-bot/branches/main/protection \
  -d '{"required_status_checks":null,"enforce_admins":false,
       "required_pull_request_reviews":{"required_approving_review_count":0},
       "restrictions":null,"allow_force_pushes":false,"allow_deletions":false}'
```

Plus penjaga di workflow: job `bersihkan` (yang dipicu `workflow_run` dan pegang token
repo) menolak run yang datang dari fork:

```yaml
if: github.event_name != 'workflow_run' ||
    github.event.workflow_run.head_repository.full_name == github.repository
```

```bash
# cek setelannya sudah seperti di atas
curl -s -H "Authorization: Bearer $TOK" \
  "https://api.github.com/repos/xykal/wa-release-bot/actions/permissions" ; echo
curl -s -H "Authorization: Bearer $TOK" \
  "https://api.github.com/repos/xykal/wa-release-bot/actions/permissions/fork-pr-contributor-approval" ; echo
```

Batas jujurnya: **log run tetap publik** (karena repo publik). Yang bisa dilakukan cuma
menghapus jejaknya secepat mungkin (bagian 7 (`bersihkan.yml`)) dan memastikan nggak
ada secret yang muncul di log. `workflow_dispatch` sendiri sudah otomatis cuma bisa
dipicu kolaborator dengan izin tulis.

