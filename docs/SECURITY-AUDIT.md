# Audit keamanan — 2026-09-26

Hasil pemeriksaan dependency dan kode saat menyiapkan repo untuk rilis publik.
Semua temuan **sudah diperbaiki** di v1.1.0 kecuali yang ditandai
*"diterima"* — itu batasan upstream yang nggak bisa dibereskan dari sisi kita.

---

## 1. Kerentanan kritikal di Baileys — DIPERBAIKI

**Severity: critical (CVSS 9.3)**

| | |
|---|---|
| Paket | `@whiskeysockets/baileys` |
| Versi rentan | `< 6.7.22` dan `>= 7.0.0-rc.1 < 7.0.0-rc12` |
| Versi di repo (sebelum) | `6.17.16` ← rentan |
| Advisory | [GHSA-qvv5-jq5g-4cgg](https://github.com/WhiskeySockets/Baileys/security/advisories/GHSA-qvv5-jq5g-4cgg) |
| CVE | CVE-2026-48063 |
| CWEs | CWE-290 (auth bypass via spoofing), CWE-345, CWE-346 |

### Dampak

Sesi Baileys mana pun bisa dikirimi payload `protocolMessage` yang dibuat jahat,
dan itu memicu event `messages.upsert` **palsu** dengan message key & payload
palsu — di aplikasi ini artinya: **siapa pun bisa memalsukan pesan**.

Lebih parah, exploit yang sama bisa:
- merusak **app state sync** dengan mengirim fake key shares, dan
- melakukan **history-sync spoofing** — menyuntik konteks "sebelumnya" yang
  nggak pernah ada.

### Perbaikan

Naik ke **`6.7.24`** (dist-tag `legacy`, rilis 2026-07-29). Dipilih ketimbang
`7.0.0-rc14` karena:

1. nodejs-mobile — runtime Node.js yang di-embed di APK — **mentok di Node 18.20.4**.
   Baileys 7 itu ESM-only dan jauh lebih agresif pakai API Node 20+.
2. `6.7.24` adalah versi di jalur `6.x` yang **sudah ditambal** dan API-nya
   identik dengan yang sudah dipakai kode ini (`makeWASocket`,
   `useMultiFileAuthState`, `fetchLatestBaileysVersion`, `Browsers`).

**Diverifikasi** (bukan cuma dibaca changelog):

```bash
cd bot-js && npm ci && npm run build
node dist/bundle.cjs --selftest        # → SELFTEST OK ✅
```

Plus uji koneksi WA nyata di **Node 18.20.4**: bundle berhasil load, ambil
versi WhatsApp Web dari server, bikin auth state, dan **menerima QR asli**
dari server WhatsApp (`QR RECEIVED len=237`).

---

## 2. Dependency transitive rentan — DIPERBAIKI

Ketiganya ikut terangkat lewat `overrides` di `bot-js/package.json`
dan `cli/package.json`:

| Paket | Advisory | Masalah | Perbaikan |
|---|---|---|---|
| `file-type` | [GHSA-5v7r-6r5c-r473](https://github.com/advisories/GHSA-5v7r-6r5c-r473) | infinite loop di parser ASF kalau sub-header berukuran nol (DoS) | `^21.3.1` |
| `uuid` | [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) | buffer bounds check kurang di v3/v5/v6 saat `buf` diisi | `^11.1.1` |
| `esbuild` (dev-only) | [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99) | dev server bisa diakses situs web mana pun | `^0.28.2` |

`esbuild` nggak ikut masuk APK (cuma dipakai saat bundling), tapi tetap
dinaikkan biar `npm audit` bersih dan nggak jadi alarm palsu yang bikin
alarm asli diabaikan.

---

## 3. Tanda tangan release rusak — DIPERBAIKI

`.github/workflows/build-apk.yml` menulis ini ke `$GITHUB_ENV`:

```yaml
echo "RELEASE_KEYSTORE_PASSWORD=***"
echo "RELEASE_KEY_PASSWORD=***"
```

Nilai `***` itu **literal**. Jadi kalau secrets keystore diisi, build-nya
malah gagal signing (password salah), atau lebih buruk: kelihatan "berhasil"
tapi keystore-nya nggak kepakai dengan benar. Sekarang nilainya diambil
dari `secrets.KEYSTORE_PASSWORD` / `secrets.KEY_PASSWORD`, dan file keystore
ditulis ke `$RUNNER_TEMP` (bukan working directory repo).

---

## 4. Risiko secret bocor ke repo — DIMITIGASI

RIwayat: `ini-buat-kerja.json` (kumpulan token lintas layanan) sempat ada di
folder kerja. Sekarang:

- `.gitignore` memblokir `secrets/`, `ini-buat-kerja.*`, `*.keystore`,
  `.env*`, `cli/config.json`, `cli/state.json`, `cli/wa-session/`.
- **gitleaks** jalan di tiap push & PR, plus aturan khusus untuk pola token
  yang dipakai ekosistem proyek ini (Resend, Grok/xAI, Cloudflare, Vercel,
  OneSignal, Tailscale, TwicPics).
- Job `audit` di `code-quality.yml` grep pola token umum
  (`ghp_`, `github_pat_`, `re_`, `tskey-auth-`, `os_v2_app_`, `gsk_`, `vcp_`, `sk-`)
  di seluruh isi repo.
- Token di CI dibaca dari **GitHub Secrets**, nggak pernah ditulis ke file.

> ⚠️ **Kalau token pernah masuk ke chat, file yang di-upload, atau repo publik —
> token itu harus dianggap sudah bocor.** Rotate semuanya. Lihat
> [SECURITY.md](../SECURITY.md#kalau-token-kamu-pernah-bocor).

---

## 5. Yang diterima apa adanya (batasan upstream)

### `libnode.so` belum align 16 KB

APK memuat `libnode.so` dari nodejs-mobile yang dibangun dengan alignment
4 KB. Android 15+ di perangkat berpaging 16 KB nggak akan bisa me-load-nya,
dan Google Play sejak Nov 2025 menolak APK yang nggak 16 KB-ready.

**Nggak bisa diperbaiki dari sisi repo ini** — perlu nodejs-mobile dibangun
ulang. Sampai itu terjadi, APK didistribusikan lewat GitHub Releases, bukan
Play Store.

### `engines: node >= 20` di Baileys

Deklarasi npm-nya bilang butuh Node 20+, sementara runtime di HP cuma Node 18.
Kita sudah buktikan lewat smoke test bahwa bundle-nya jalan (lihat bagian 1),
dan `.npmrc` menyetel `engine-strict=false` supaya `npm ci` nggak menolak.

Risikonya: kalau Baileys 6.7.x di masa depan memakai API Node 20+ di jalur
kode yang belum kita sentuh, itu baru ketahuan belakangan. Mitigasi:
`code-quality.yml` menjalankan unit test + build bundle di **Node 18.20.4
persis**, jadi regresi ketahuan di PR, bukan di HP pengguna.

### WebCrypto polyfill

Node 18 nggak punya `globalThis.crypto`. Polyfill kita pasang
`require('node:crypto').webcrypto` ke `globalThis`. Ini API yang sama, cuma
dipindah tempatnya — nggak ada implementasi crypto buatan sendiri.

### `usesCleartextTraffic="true"`

Di-set di `AndroidManifest.xml`. Dipakai buat WebSocket `127.0.0.1:18790`
antara app dan engine Node (jalur cepat perintah). Konsekuensinya, app juga
mengizinkan HTTP polos ke host lain. Engine sendiri cuma menghubungi
`api.github.com` (HTTPS) dan server WhatsApp (WSS/HTTPS).

Batasannya: WebSocket ke `localhost` **juga** sudah dikecualikan dari
kebijakan cleartext sejak Android 9, jadi sebenarnya `usesCleartextTraffic`
bisa dimatikan dan diganti `network_security_config` yang cuma mengizinkan
`127.0.0.1`. **Belum dikerjakan** — dicatat sebagai TODO.
