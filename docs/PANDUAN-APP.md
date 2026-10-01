# Panduan aplikasi Android

Pelengkap [README](../README.md#aplikasi-android--host-di-hp-sendiri): detail tiap kartu di app.
Instal dan langkah awal ada di README; halaman ini buat yang mau tahu lebih dalam.

## Daftar isi

- [Cara kerja (singkat)](#cara-kerja-singkat)
- [Navigasi bawah (tab)](#navigasi-bawah-tab)
- [Splash & suara pembuka](#splash--suara-pembuka)
- [Cek perangkat](#cek-perangkat)
- [Penjaga grup (auto-approve)](#penjaga-grup-auto-approve)
- [Bot WA umum, moderasi, dan pesan berkala](#bot-wa-umum-moderasi-dan-pesan-berkala)
- [Tombol Simpan muncul kalau ada perubahan](#tombol-simpan-muncul-kalau-ada-perubahan)
- [Batre](#batre)
- [Channel WA: dapetnya dari mana?](#channel-wa-dapetnya-dari-mana)
- [Lagu mood](#lagu-mood)
- [Hosting bot custom](#hosting-bot-custom)

## Cara kerja (singkat)

| Bagian | Teknologi |
|---|---|
| Shell app | Kotlin, UI custom (tanpa komponen Material), foreground service, WorkManager |
| "Otak" bot | **Node.js 18.20.4 sungguhan** di-embed via [nodejs-mobile](https://github.com/nodejs-mobile/nodejs-mobile) (`libnode.so` + jembatan JNI) |
| Klien WhatsApp | [Baileys 6.7.24](https://github.com/WhiskeySockets/Baileys) (linked device) |
| Bot ↔ App | File bridge (`events.jsonl` / `cmd.json`) + WebSocket `127.0.0.1` sebagai jalur cepat |
| Cek release | GitHub REST API `/releases/latest` |

Detail lengkap: [docs/ARCHITECTURE.md](ARCHITECTURE.md).

## Navigasi bawah (tab)

Layar utama dipecah jadi lima tab; pindahnya lewat bar navigasi bawah:

| Tab | Isi |
|---|---|
| Beranda | status WhatsApp/engine/rilis/penjaga grup, jadwal berikutnya, tombol Mulai dan Cek sekarang, kartu Tautkan WhatsApp |
| Repo | kartu Rilis GitHub → Channel: daftar repo, link channel, token, interval, saklar kirim, tes kirim, bikin channel |
| Fitur | Penjaga grup, Lagu mood, Hosting bot |
| Log | catatan kerja bot, folder log, tombol kirim log, matikan service |
| Pengaturan | Batre & nyala otomatis, Tentang |

- Tombol **Simpan setting** nempel di atas bar navigasi dan tetap menyimpan semua tab
  sekaligus; di tab Log tombol itu disembunyikan karena di situ tidak ada kolom isian.
- Tab yang terakhir dibuka diingat waktu layar diputar (putar HP), tidak balik ke Beranda.
- Tab Log dimulai dari baris paling baru tiap dibuka, tapi baris baru yang masuk tidak
  menarik layar selama kamu sedang mengerjakan hal lain.

## Cek perangkat

Tab **Pengaturan** → kartu **Cek perangkat** menampilkan RAM total dan sisa, arsitektur
(arm64-v8a / armeabi-v7a), versi Android, penyimpanan bebas, status optimasi batre, dan izin
notifikasi. Kalau ada yang di bawah spek ideal, muncul daftar peringatan — bukan larangan:
bot tetap bisa dijalankan.

- RAM di bawah 2 GB: Android lebih gampang menghentikan bot saat layar mati; splash otomatis
  memakai partikel yang lebih hemat.
- Android di bawah 8 (API 26): APK resmi memang tidak mendukung, tapi peringatannya tetap
  dikasih supaya jelas.
- Tombol **Ke log** menulis semua baris cek ke `log/` — pakai itu kalau lapor masalah.

## Splash & suara pembuka

Waktu app dibuka, splash menampilkan logo yang berganti bentuk di atas latar bergerak
(cahaya, cincin, bintang, bintang jatuh) selama 1,6-4,5 detik, lalu layar utama muncul.

Voice over **"XyVerse Technology Global"** (`res/raw/vo_xyverse.ogg`) bunyi:

- **sekali** pas pertama membuka app setelah pasang, lalu diam sendiri;
- kalau HP-nya sedang mode senyap, suaranya dilewati dan tetap kebagian pas HP sudah
  tidak senyap (bendera "sudah pernah bunyi" baru dipasang kalau suaranya benar-benar jalan);
- mau dengar lagi? Tab **Pengaturan** → kartu **Tampilan & suara** → nyalakan **Suara
  pembuka**; matikan kalau tidak mau ada suara lagi.

Suaranya tidak dipotong waktu splash ditutup (durasi 2,6 detik), jadi kalimatnya utuh.

## Penjaga grup (auto-approve)

Buat grup yang nyalain **Setujui anggota baru** (Info grup → Setelan grup):

- yang minta join → **di-approve otomatis**
- yang dulu **udah keluar / dikeluarin** lalu minta join lagi → **ditolak otomatis**

Syarat: akun WA yang ditautkan harus **admin** di grup itu. Isi **link undangan
grup** di kartu **Penjaga grup**, nyalain saklarnya, simpan.

Cara kerjanya berkala (default tiap 5 menit, bisa diubah): nyambung → cek
anggota + permintaan → approve/tolak → putus. Jadi approve-nya bisa telat
sampai 5 menit, tapi batre aman. "Siapa yang keluar" dihitung dari daftar
anggota yang berubah antar-cek, jadi:

- orang yang keluar **sebelum** fitur ini nyala nggak ketahuan → ketik nomornya
  di kolom **Selalu tolak nomor ini**
- orang yang dimasukin lagi manual sama admin otomatis dihapus dari daftar hitam
- **Daftar hitam** buka daftar orang yang diblokir; tiap orang ada tombol
  **Buka blokir** biar bisa join lagi. **Kosongin** buat reset semuanya
- **Tes kirim** (di kartu Penjaga grup) kirim pesan singkat ke grup buat ngecek

## Bot WA umum, moderasi, dan pesan berkala

Fitur yang jalan di sisi WhatsApp (perintah pribadi, moderasi grup, stiker,
story, pesan berkala ke grup) dipindah ke dokumen sendiri supaya halaman ini
tetap fokus ke kartu-kartu di app: [PANDUAN-BOT-WA.md](PANDUAN-BOT-WA.md).

## Tombol Simpan muncul kalau ada perubahan

Tombol **Simpan setting** nggak nongol terus: dia muncul begitu ada yang lo ubah
(saklar dipencet, kotak diketik, daftar repo diubah) dan sembunyi lagi setelah
setting terkirim ke engine. Di tab Log tombol itu nggak ada sama sekali — di
sana nggak ada yang bisa disimpan. Jadi kalau lo ngerasa "kok nggak ada tombol
Simpan", artinya nggak ada perubahan yang belum disimpan.

## Batre

Bot ini **tidur** hampir sepanjang waktu. Yang nyala terus cuma proses kecil +
notifikasi (itu syarat Android biar nggak dibunuh). Tiap jadwal: cek GitHub
(1 request) dan/atau nyambung WA beberapa detik, lalu tidur lagi. WA **nggak**
nyambung terus-terusan, dan riwayat chat nggak pernah ditarik.

Yang paling berpengaruh ke batre: interval. Cek rilis tiap 15 menit + grup tiap
5 menit itu ringan; interval 1–2 menit bakal kerasa.

Pengecualian: kalau **Bot WA umum** nyala (moderasi atau perintah pribadi),
WhatsApp memang tersambung terus selama engine jalan — itu harga dari fitur ini,
dan di kartunya sudah ditulis. Mau hemat? Matikan moderasi kalau grupnya lagi
sepi, atau matikan **Perintah pribadi** kalau perintah chat jarang dipakai:
fitur lain (rilis, penjaga grup, lagu) tetap jalan normal tanpa itu.

## Channel WA: dapetnya dari mana?

**Channel** itu fitur WhatsApp yang isinya cuma siaran satu arah — cuma lo yang
 bisa nge-post, yang lain cuma bisa baca. Jadi cocok banget buat kabarin rilis.
 Ini **bukan** grup dan bukan status.

Ada tiga cara, dari yang paling gampang:

**1. Biarin bot yang bikin (paling gampang).**
Tekan **Bikin Channel** di app. Bot bikin channel baru di akun lo, nulis JID-nya
ke kolom setting, kirim test message, dan nampilin link channel-nya di Log.
Karena lo yang bikin, lo otomatis pemiliknya — jadi bot boleh nge-post ke situ.
Ini butuh WA-nya udah ditautkan dulu (langkah 3 di atas lewat **Setup**).

**2. Pake channel yang udah lo punya.**
Buka channel-nya di WA → tap nama channel → **⋯** → **Bagikan** → salin link-nya.
Bentuknya `https://whatsapp.com/channel/0029...` — tempel apa adanya di kolom
**Channel WA**. Bot yang ngurusin sisanya.

**3. Pake grup WA.**
Kalau males bikin channel: bikin grup (boleh grup isi lo sendiri), lalu tempel
JID grup (`120363...@g.us`) atau link undangan grup-nya
(`https://chat.whatsapp.com/...`). Bot nge-post ke grup itu.

> **Yang NGGAK bisa: username channel (`@nama_channel`).**
> Dulu kolom ini nerima username, dan itu selalu gagal — kodenya nyari pakai
> `onWhatsApp()`, padahal fungsi itu buat nyari **nomor HP**, bukan channel.
> API WhatsApp yang dipakai engine ini juga nggak nyediain pencarian channel
> lewat username. Sekarang username ditolak dengan pesan yang nyaranin pakai
> link. Ini bukan salah lo kalau bingung — pesan errornya yang dulu menyesatkan.

> **Syarat:** lo harus **pemilik/admin** channel-nya, karena bot nge-post pakai
> nomor WA lo sendiri (sebagai perangkat tertaut). Channel orang lain → pesannya
> nggak akan terkirim.

| Tombol | Fungsi |
|---|---|
| **Simpan setting** (bar bawah) | Simpan konfigurasi + kirim ke engine |
| **Mulai / Jeda** | Nyalain engine / istirahatin (proses tetap hidup, 0% aktivitas) |
| **Cek sekarang** | Paksa cek GitHub (+ grup kalau nyala) sekarang |
| **Tautkan pakai kode** | Nautin WA pakai pairing code 8 huruf |
| **Pakai QR** | Nautin WA pakai QR (scan dari HP lain) |
| **Lepas WA** | Logout perangkat bot dari WA |
| **Bikin channel** | Bikin channel WA baru dari akun lo + isi kolom Channel otomatis |
| **Kirim sebagai Pertanyaan** | EKSPERIMENTAL, default mati. Fitur "Pertanyaan" channel WA (follower bisa bales, cuma lo yang baca) belum ada protokol terbukanya dan Baileys belum dukung — yang dikirim bot masih tebakan. Mati = teks biasa yang pasti tampil. Mau bantu ngetes? lihat `cli/README.md` bagian "Rekam pesan channel" |
| **Tes kirim ke channel** | Kirim pesan tes ke channel (formatnya sama kayak pesan rilis) |
| **Cek sekarang** (grup) | Jalanin penjaga grup sekarang |
| **Tes kirim** (grup) | Kirim pesan tes ke grup target |
| **Daftar hitam** | Lihat orang yang bakal ditolak + **Buka blokir** satu-satu |
| **Kosongin** | Reset daftar hitam otomatis |
| **Izinkan jalan di latar** | Minta dikecualikan dari optimasi batre |
| **Buka izin Autostart** | Buka menu Autostart (Xiaomi dll) |
| **Buka folder / Kirim log** | Buka / bagikan file log |
| **Matikan service** | Matikan semuanya sampai dinyalakan lagi |

**Biar HP nggak "neror":**
- Charge HP-nya terus (layar boleh mati)
- *Settings → Apps → WA Release Bot → Battery → Unrestricted*
- Biarkan notifikasi bot tetap — itu jangkar foreground service-nya

---

## Lagu mood

Sesekali bot ngirim **potongan ~60 detik** lagu lama (slow rock / jiwang 80-90an,
pop lawas Indonesia) plus kata-kata ke channel. Jadwalnya diacak kayak orang lagi
mood: rata-rata N kali sehari, cuma di jam aktif yang lo atur.

Pembagiannya **Cloudflare x HP** — tanpa GitHub Actions:

```
HP (pas "mood")  ──GET /lagu/berikut──▶  Cloudflare Worker (gratis)
                                           pilih lagu: 50% daftar lawas,
                                           50% lagi trend di Indonesia (chart
                                           harian Spotify ID, disaring AI)
                                           cari di SoundCloud → link stream
                                           kata-kata dari AI (key Groq di Worker):
                                           gaya gaul berima (lagu/gaul.txt) /
                                           curhat / surat / puitis / lucu-miris /
                                           nostalgia / motivasi / ngatain /
                                           nyindir / tanya / sok-bijak,
                                           ±35% ditemenin ayat Al-Qur'an
                                           (lagu/ayat.json, 42 ayat, teks
                                           terjemahan Kemenag via equran.id)
HP  ◀── { judul, artis, kata, url, mulai } ──┘
HP: download CUMA potongan ~60 dtk (HTTP Range, ±1 MB) → rapiin frame MP3
    → ubah jadi VOICE NOTE (Ogg Opus, WASM, tanpa ffmpeg)
    → kirim kata-kata + voice note ke channel → file-nya langsung DIHAPUS
```

**Semua yang di Cloudflare bisa di-update tanpa update app** (milih lagu,
kata-kata, ayat) — cukup deploy ulang Worker. Update app cuma perlu kalau yang
berubah bagian HP (download / ubah ke voice note / kirim).

Kata-kata gaul berima (pantun kilat kayak *"Ditelpon berdering, ternyata lagi
gaya miring"*) kebanyakan diambil dari [`lagu/gaul.txt`](../lagu/gaul.txt) — AI
masih suka ngasal kalau disuruh bikin rima Indonesia. Mau nambah? Tulis aja
satu baris satu di file itu, terus deploy ulang Worker.

Soal ayat: AI **nggak pernah nulis ayat sendiri**. Dia cuma milih nomor dari
[`lagu/ayat.json`](../lagu/ayat.json), teksnya ditempel apa adanya. Isi file itu =
terjemahan Kemenag, dicek kata per kata ke [equran.id](https://equran.id).

Kenapa voice note? Saluran WA cuma nerima voice note — file audio MP3 biasa
tampil **"tidak didukung"** di saluran.

Daftar lagunya di [`lagu/daftar.txt`](../lagu/daftar.txt). Habis ngubah, deploy ulang
Worker-nya: `python3 scripts-dev/deploy_worker_lagu.py` (butuh env `CF_API_TOKEN`,
`CF_ACCOUNT_ID`, `CF_KV_LAGU`, opsional `GROQ_API_KEY`). Kode Worker:
[`lagu/worker/worker.js`](../lagu/worker/worker.js).

> **Catatan.** Lagunya punya orang. Yang dikirim cuma potongan, tapi channel publik
> tetap bisa kena laporan hak cipta — pakai secukupnya.

## Hosting bot custom

Punya project bot Node.js sendiri? Buka **Hosting bot** di app → upload ZIP.

- ZIP isinya `package.json` + file utama (`scripts.start`, `main`, atau `index.js`).
- `node_modules` boleh ikut atau nggak. Kalau nggak ada, app masang sendiri dari
  npm (modul JS murni aja — paket native kayak `sharp` nggak jalan di HP).
- `.env` ikut dibaca. Path relatif (`./session`) jalan, karena folder kerjanya
  folder project.
- Bot jalan di **worker thread** terpisah: `process.exit()` atau crash di bot
  itu nggak matiin app. Ada restart otomatis, konsol, dan kolom input (stdin)
  buat bot yang nanya nomor WA.
- Ganti ZIP → file lama yang nggak ada di ZIP baru (sesi WA, `.env`,
  `node_modules`) tetap dipertahankan.
- Node-nya **Node 18** bawaan app. Versinya cuma bisa naik lewat update APK.
