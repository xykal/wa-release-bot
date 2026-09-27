# 🦴 wa-release-bot

Bot WhatsApp yang **nggak nyala 24 jam**. Dia tidur.

Bangun tiap 15 menit → cek GitHub → ada release baru? Posting info ke **channel WA**. Nggak ada? **Mati**. Prosesnya cuma hidup ±1–3 detik tiap cek, jadi baterainya nyaris nggak ikut boros.

## Flow-nya

```
 HP nyala (Termux hidup)
        │
        ▼
 cron/jadwal bangunin bot tiap 15 menit
        │
        ▼
 node check GitHub (1 request API, ~1 detik)
        │
   ┌────┴──────────┐
   ▼               ▼
 NGGAK ADA         ADA!
   │               │
   ▼               ▼
 proses MATI   nyambung WA (2-5 detik)
 (0% CPU,      → post info release ke channel
  0% baterai)  → WA dilepas → proses MATI
```

> WA session tersimpan di file (`wa-session/`), jadi **QR cuma discan 1x seumur hidup**. Setelah itu bot connect otomatis tanpa scan.

## Kebutuhan

- HP **Android**
- [Termux](https://f-droid.org/packages/com.termux/) — **wajib dari F-Droid** (versi Play Store udah basi)
- 1 **channel WhatsApp** yang lo **pemilik/admin-nya** (bot posting pake nomor lo sebagai linked device)
  — atau cukup 1 **grup WA** kalau males bikin channel
- Repo GitHub yang mau dipantau

## Instalasi di HP

```bash
# 1. Install dependensi
pkg update -y
pkg install -y nodejs git unzip cronie

# 2. Kirim folder project ke HP (misal: download wa-release-bot.zip ke HP,
#    terus "Save to Download"), lalu:
termux-setup-storage
cp ~/storage/downloads/wa-release-bot.zip ~/
cd ~ && unzip wa-release-bot.zip
cd wa-release-bot
npm install
```

> Cara lain: push project ini ke repo GitHub lo sendiri, terus `git clone <url>` di HP.

## Konfigurasi

```bash
cp config.example.json config.json
nano config.json
```

| Field | Isi |
|---|---|
| `github.repo` | `owner/nama-repo`, contoh: `vercel/next.js` |
| `github.token` | Opsional. Isikan kalau repo **private** atau sering kena rate limit (buat di [github.com/settings/tokens](https://github.com/settings/tokens), scope `public_repo` udah cukup) |
| `github.includePrereleases` | `true` kalau mau hitung beta/prerelease juga |
| `whatsapp.channel` | **Link** channel (`https://whatsapp.com/channel/0029...`), atau JID `<angka>@newsletter`, atau grup `<angka>@g.us` |
| `bot.checkIntervalMinutes` | Tiap berapa menit bot bangun (default 15) |
| `bot.postOnFirstRun` | `true` kalau mau langsung posting release yang sedang ada saat pertama jalan |

**Cara dapetin link channel:** buka channel-nya di WA → tap nama channel → **⋯** → **Bagikan** → salin link-nya. Bentuknya `https://whatsapp.com/channel/0029...` — tempel apa adanya.

**Yang nggak bisa: username (`@nama_channel`).** Dulu didokumentasikan bisa, dan itu salah — kodenya nyari pakai `onWhatsApp()`, padahal fungsi itu buat nyari **nomor HP**, bukan channel. Engine-nya juga nggak punya API buat nyari channel dari username.

**Belum punya channel?** Bikin lewat app Android (tombol **Bikin Channel**), atau bikin manual di WA: tab **Saluran/Updates** → ikon **+** → *Buat saluran*. Lo otomatis jadi pemiliknya, jadi bot boleh posting ke situ.

## Setup (sekali seumur hidup)

```bash
npm run setup
```

Bot bakal:
1. Nampilin **QR code** di terminal → scan pakai WA lo (WA → ☰ → *Linked Devices* → *Link a Device*)
2. Nemuin channel lo (dari link/JID di config)
3. Ngekirim **test message** ke channel
4. Ngecatat baseline release

Kalau test message muncul di channel → **selesai, semua beres.** 🎉

Udah pernah setup tapi mau tes lagi:

```bash
npm run test
```

## Bikin bot jadi auto (bangun-tidur)

### Opsi A: cron (rekomendasi — proses benar-benar mati di antara cek)

```bash
crontab -e
```

Tambahin baris ini (tiap 15 menit):

```
*/15 * * * * cd ~/wa-release-bot && node src/bot.mjs --once >> bot.log 2>&1
```

Simpan, terus start cron:

```bash
cron
```

Liat aktivitas bot:

```bash
tail -f bot.log
```

### Opsi B: mode loop (b males atur cron)

```bash
npm run loop
```

Prosesnya nyala terus, tapi **WA tetap cuma nyambung pas mau posting**. Kalau mau lebih hemat, pakai opsi A.

### Mode lain

```bash
npm run dry-run   # cek GitHub + tampilkan pesan yang bakal dikirim (nggak ngirim apa-apa)
npm run once      # cek sekali doang (sama yang dipake cron)
```

## Biar HP-nya nggak "neror" (biar bot nggak dibunuh Android)

1. **Charge HP-nya terus** (pasang di charger, layar boleh mati). Bot butuh HP hidup.
2. Matikan battery optimization buat Termux:
   *Settings → Apps → Termux → Battery → Unrestricted* (jeda beda tiap HP).
3. Biar cron auto-start pas HP boot:
   - Install app **Termux:Boot** (dari F-Droid, pasang juga **Termux:API**)
   - Di Termux: `echo "cron" > ~/boot-script.sh`
4. (Opsional, buat mode loop) `termux-wake-lock` biar CPU nggak Doze.

## Logika "bot tidur" — kenapa ini hemat

- Mode `--once`: proses Node **nggak ada** di antara jadwal. HP lo nggak "njalani" apa-apa selain cron yang ngebangunin tiap 15 menit.
- Cek GitHub = 1 request HTTP, ~1 detik, langsung mati.
- Koneksi WhatsApp (WebSocket + session) **cuma** ada 2–5 detik pas posting rilis.
- Rate limit GitHub tanpa token: 60 request/jam → interval 15 menit (4x/jam) aman banget.

## Troubleshooting

| Gejala | Solusi |
|---|---|
| `Sesi WA belum ada` | Belum pernah `npm run setup`. Jalankan di terminal (bukan via cron), scan QR. |
| `Sesi WA ke-logout` | Session-nya kebuang (misal HP di-reset / WA di-logout semua perangkat). `npm run setup` lagi. |
| `Username channel (...) nggak bisa dipakai` | Memang nggak didukung — pakai link channel-nya. Lihat tabel di atas |
| Bot diam aja / nggak posting | Cek log. Pesan error sekarang nyebutin target yang dicari |
| `GitHub rate limit` | Isi `github.token` di config, atau tambah interval. |
| Bot nggak pernah bangun | Cek `crontab -l` (barisnya ada?), `cron` udah jalan?, Termux nggak dibunuh (lihat tips di atas). Liat `tail -f bot.log`. |
| QR nggak muncul di terminal | Pastikan jalanin di terminal interaktif (`npm run setup`), bukan dari cron. |

## Keamanan

- Folder `wa-session/` = **jiwa session WA lo**. Jangan pernah di-share / di-commit ke git.
- Bot posting pake nomor WA lo sendiri (sebagai linked device) — jadi pastikan channel-nya emang lo admin-nya.
- `config.json` bisa mengandung token → jangan di-commit juga (udah ada di `.gitignore`).

## Struktur

```
wa-release-bot/
├── package.json
├── config.example.json   # salin → config.json
├── src/
│   ├── bot.mjs           # otak: mode setup/test/once/loop/dry-run
│   ├── github.mjs        # cek release terbaru
│   ├── wa.mjs            # connect WA (Baileys), post, disconnect
│   └── format.mjs        # format pesan WA
├── state.json            # (otomatis) tag terakhir + JID channel
└── wa-session/           # (otomatis) credentials WA — JANGAN di-share
```
