# Changelog

Semua perubahan penting proyek ini. Format mengikuti
[Keep a Changelog](https://keepachangelog.com/id/1.1.0/) dan
[Semantic Versioning](https://semver.org/lang/id/).

## [Unreleased]

### Keamanan (CI)
- `bersihkan.yml` kini punya profil **full wipe**: tiap kali build `main` selesai
  (`workflow_run`), semua run Actions yang selesai — beserta log dan artifact-nya —
  dan semua cache di atas ±1 jam dihapus; yang tersisa hanya run sapuan itu sendiri.
  Artefak resmi tetap aman di draft release (bukan artifact Actions). Sapuan harian
  membersihkan sisa jejak (termasuk run sapuan kemarin).

### Diubah
- Gaya semua pesan WA dirapikan dan diseragamkan: kepala `*SUKIBOT*` (dengan emoji tulang di pesan aslinya) selalu di baris
  pertama (postingan rilis, pesan tes, lapor gagal, peringatan/kick moderasi, sambutan,
  daftar hitam berkala, `.menu`), diikuti judul, isi, lalu footer tanda tangan.
- Postingan rilis: seksi **Changelog (apa yang baru)** berlabel jelas + link rilis lengkap,
  dan seksi **Download** berisi link unduh langsung masing-masing file
  (`browser_download_url` GitHub), maksimal 5 file dengan sisanya diringkas.
- Format **Pertanyaan** channel diperbaiki: tidak lagi dibungkus `questionMessage`
  (tidak pernah tampil benar di HP). Sekarang pesan teks ditandai `contextInfo.isQuestion`
  + `messageSecret` — di HP yang sudah kenal formatnya muncul sebagai Pertanyaan asli, di
  yang belum TETAP tampil sebagai teks biasa, tidak pernah kosong.
- Daftar hitam tidak lagi ada yang disamarkan: nomor dan LID ditulis utuh, dan
  penyebutan "ID samaran …1234" dihapus. Pushname WA yang kebaca (dicatat dari anggota
  grup dan pesan masuk, disimpan di `g.namaPeta`) kini tampil di depan nomornya:
  "Nama (+62812…)" — di lembar app maupun pesan berkala.
- Moderasi grup: kiriman berisi link luar/promosi/kata terlarang langsung dihapus,
  lalu pelakunya menerima tepat 1 peringatan yang me-mention orangnya; strike terakhir =
  dikeluarkan. Unsur jualan sengaja tidak dijadikan bawaan (terlalu agresif) — polanya
  bisa ditambah sendiri lewat kolom **Kata terlarang** di app (contoh pola jualan sudah
  tertera di placeholder-nya).

### Diperbaiki
- Splash: pivot animasi "pop" gelembung chat dulu di tepi atas (`pivotY = 0`), jadi tiap
  logo ganti bentuk gelembungnya tampak mengempis/tenggelam ke bawah. Pivot kini di tengah,
  pop-nya memantul di tempat.

## [1.0.0] — 2026-10-03

Rilis publik pertama. Build bernomor 1.0.0–1.8.0 sebelumnya adalah build internal;
nomor publik dimulai kembali dari 1.0.0 dengan `versionCode` 1010000 agar update
dari build internal tetap diterima Android.

### Keamanan
- Hosting custom tidak lagi mewarisi seluruh environment engine. Worker hanya menerima
  allowlist runtime + `.env` project; namespace internal `WR_*`, token bridge, token GitHub,
  dan environment app lain tidak diteruskan. Setiap ZIP disalin ke storage privat sambil
  dihitung SHA-256 (maksimal 100 MB), lalu arsip yang sama membutuhkan persetujuan
  risiko eksplisit sebelum dipasang. Worker thread tetap bukan sandbox filesystem.
- `BootReceiver` sekarang `exported=false` dan hanya menerima `BOOT_COMPLETED` serta
  `MY_PACKAGE_REPLACED`; action QUICKBOOT nonstandar yang dapat dipalsukan app lain dihapus.
- WS bridge `127.0.0.1:18790` sekarang wajib token acak per proses (header `X-WR-Token`).
  Sebelumnya app lain di HP bisa connect tanpa izin lalu mengubah setting, memutus WA,
  memicu kirim pesan, dan menerima event QR/pairing code. Handshake ber-`Origin` (dari
  halaman web) ditolak; tanpa token WS tidak dinyalakan dan app tetap jalan lewat file bridge.

### Ditambah
- `docs/CHECKLIST-PRELAUNCH.md`: gerbang uji 24–48 jam untuk arm64 dan armeabi-v7a,
  termasuk pairing, multi-repo, retry, anti-duplikat, layar mati, reboot, privasi log,
  dan validasi fitur eksperimental.
- Pengujian bawaan hemat, allowlist environment hosting, SHA-256 ZIP, sinkronisasi nama
  string id/en, serta kontrak BootReceiver privat.
- Tab Log sekarang punya saklar rekam logcat Android, tombol salin untuk log yang terlihat,
  dan unduh ZIP berisi `app.log`, `mesin.log`, `logcat.log`, `crash.log` serta rotasinya.
  Log app/engine tetap direkam otomatis; ekspor memakai pemilih dokumen Android, tanpa izin
  penyimpanan.
- Saklar **Selalu kirim daftar hitam** di kartu Pesan berkala: kalau nyala, yang dikirim cuma
  daftar hitam grup dan kolom pesan diabaikan (permintaan kall). Logikanya `pilihIsi()` di
  `bot-js/src/berkala.mjs` (murni, ada ujinya); `.berkala` di chat nunjukin mode yang sedang
  dipakai.
- Perintah baru `.berkala`: lihat dulu isi pesan berkala (daftar hitam / teks sendiri) di chat
  sendiri tanpa mengirim ke grup, plus `.berkala kirim` buat kirim sekarang lewat koneksi mode
  jaga yang sudah terbuka (nggak bikin koneksi kedua ke sesi WA yang sama).
- **Rekam postingan channel bisa langsung dari chat** (`.rekam on|off|kirim|kosong`).
  Perekam lama (CLI `npm run rekam`, untuk nangkep format **Pertanyaan** channel) butuh
  komputer/Termux; sekarang jalan dari chat sendiri tanpa alat tambahan. Bedanya juga:
  jalur chat menyimpan **byte proto mentah** (base64) karena proto 6.7.24 cuma tahu
  pembungkusnya (`Message.questionMessage` = FutureProofMessage) dan field isi yang belum
  dikenal dibuang saat decode. `bot-js/src/rekam-mentah.mjs` (murni, 7 uji) menyeleksi stanza
  `CB:notification` bertipe newsletter; hook nempel di `sock.ws` mode jaga
  (`mesin/rekam-channel.mjs`), berkasnya `rekaman-channel.json` di folder data app (paling
  banyak 10 postingan / 8 MB) dan dikirim ke chat sendiri sebagai dokumen lewat `.rekam kirim`.
  Jalur CLI (`bot-js/src/rekam.mjs`) ikut menyimpan byte mentah untuk postingan di bawah 256 KB.
- Audience Status dipisah jadi fungsi murni `bot-js/src/story.mjs` + 5 uji: `.story` mengirim
  byte media asli ke nomor di kolom Story. `.storygrup` sekarang fail-closed; `statusJidList`
  cuma menyaring penonton, bukan mention grup native. Menunggu implementasi dan CI terpisah
  sebelum fitur itu diaktifkan.
- `.brat <teks>` merender stiker WebP hijau secara lokal di Android (Canvas) dan mengirimkannya
  kembali lewat private self-chat; batas 48 code point dan input dinormalisasi sebelum melintasi bridge.
- `.welcome on/off` menyimpan opt-in untuk sambutan anggota baru, dibatasi ke grup pantauan yang
  JID-nya cocok dengan target aktif. Default mati; menu perintah kini dikelompokkan.
- Semua kiriman teks informasi memakai footer `— SukiBot` sekali saja, termasuk jawaban Pertanyaan
  channel dan laporan ke chat sendiri; caption dokumen rekaman ikut membawa tagline.
- **Screenshot app otomatis**: workflow `screenshot-app.yml` membangun APK release x86_64,
  menjalankannya di emulator Android 14 (GitHub Actions) dan menangkap tiap layar
  (`scripts-dev/screenshot_emulator.sh`); hasilnya dibingkai `scripts-dev/bingkai_screenshot.py`
  dan dipakai galeri situs (tangkapan asli, bukan ilustrasi; sisi WhatsApp tetap ilustrasi).
- **Layar Repo** di app: daftar repo yang dipantau (tambah/hapus, ganti channel) dengan
  channel WA khusus per repo; kartu depan cuma menampilkan ringkasan + tombol **Kelola repo**.
  Format simpanan tetap satu string `owner/a|link-channel, owner/b` sehingga engine dan CLI
  (`github.repo`) membaca hal yang sama tanpa migrasi; tanpa `|` repo memakai channel utama.
- **Situs**: landing page + halaman unduh (`web/`, statis, dua bahasa id/en, tanpa CDN)
  di Cloudflare Workers Static Assets, domain <https://wabot.projectkal.my.id>
  (workers.dev diarahkan ke sana). Sebelum launching halaman unduh menampilkan
  hitung mundur; setelahnya kartu APK terisi otomatis dari `releases/latest`.
  Deploy: `scripts-dev/deploy_web.py` (tanpa wrangler) + workflow `deploy-web.yml`.
- **App dua bahasa (Indonesia/Inggris)**: 75 literal layout `activity_main.xml` dan 210 literal
  Kotlin (layar utama, dialog tautan, daftar hitam, aksi sistem, splash, Onboarding, Repo,
  Hosting, notifikasi `BotService`) dipindah ke `res/values/strings.xml` (`u_*`, `k_*`) dengan
  padanan `values-en`; Android memilih bahasa dari setelan sistem. Pesan bot di WhatsApp dan
  isi log tetap Indonesia. Alat pemindah: `scripts-dev/i18n_layout.py` + `i18n_peta.json`,
  `scripts-dev/i18n_kotlin.py` + `i18n_peta_kotlin.json`/`i18n_peta_manual.json`.
  Workflow Screenshot app mengunci bahasa emulator (input `bahasa`: `id-ID` bawaan atau
  `en-US`); runner GitHub aslinya en-US sehingga tangkapan situs bisa berubah bahasa.
  Galeri situs versi English memakai tangkapan en-US (`web/img/hp-*-en.webp`, ditukar
  `app.js` lewat `data-src-en`; `bingkai_screenshot.py --akhiran en`); README memuat
  sandingan id/en (`docs/img/i18n-app.webp`).
- `docs/PITCH.md`: satu halaman pitch (masalah, solusi, untuk siapa, batasan yang jujur).
- Uji engine kedua (`test/engine.test.mjs`): dua repo sekaligus (satu prerelease dengan
  `includePrereleases`), ETag 304 pada cek kedua, release baru terdeteksi dan berhenti di
  "Channel WA masih kosong" tanpa menyentuh WhatsApp; `lastTag` tidak berubah sampai terkirim.
- **Bar navigasi bawah** (`NavBawah.kt`): item navbar digambar sendiri (tanpa MaterialButton)
  dengan gaya `NavItem`/`NavIkon`/`NavTeks`, drawable `bg_nav_item`/`bg_nav_aktif`, ikon
  `ic_beranda`/`ic_fitur`, dan 5 string `u_nav_*` dua bahasa. Tab terakhir tersimpan di
  `savedInstanceState`, jadi putar layar tidak balik ke Beranda.
- Bukti otomatis di workflow Screenshot app: tiap tab dibuka lewat bar navigasi, lalu
  dipastikan item `navLog` `selected="true"` dan bar Simpan hilang di tab Log
  (`scripts-dev/screenshot_emulator.sh`).
- **Splash baru (M12)**: latar bergerak `PartikelView.kt` (cahaya hijau berdenyut, cincin
  melebar, bintang berkedip, bintang jatuh), logo masuk dengan mantul halus, dan brand di
  bawah dengan huruf yang merenggang pelan. Semua digambar di Canvas, tanpa library baru.
- **Voice over "XyVerse Technology Global"** (`res/raw/vo_xyverse.ogg`, `SuaraSplash.kt`):
  bunyi sekali pas pertama buka setelah pasang, lalu diam sendiri; mode senyap dihormati
  (kalau HP silent, suaranya dilewati dan masih kebagian lain kali). Saklarnya ada di tab
  Pengaturan, kartu **Tampilan & suara**.
- Bukti splash di workflow Screenshot app: jepretan detik pertama (`splash.png`) plus assert
  overlay `splash` + blok brand ada di dump UI.
- **Cek perangkat (M13)**: kartu di tab Pengaturan membaca RAM, arsitektur, versi Android,
  sisa penyimpanan, optimasi batre, dan izin notifikasi (`Perangkat.kt`), lalu menampilkan
  peringatan kalau di bawah spek ideal (RAM 2 GB, Android 8, penyimpanan 300 MB) — tanpa
  memblokir. Tombol **Ke log** menulis hasilnya ke log supaya gampang dilaporkan, dan
  perangkat pas-pasan otomatis memakai partikel splash yang lebih hemat.
- **Bot WA umum (M14)**: dua hal yang bikin WhatsApp harus tetap tersambung, jadi saklarnya
  sendiri-sendiri di kartu **Bot WA umum** (tab Fitur) dengan catatan batre yang jujur.
  (1) *Perintah pribadi* — tulis `.menu .ping .status .stiker .story .storygrup .grup .bersih`
  di **chat sendiri**; perintah di grup sengaja tidak dilayani (kall: "command/comen di chat
  sendiri aja"). (2) *Moderasi grup* — kiriman berisi link Telegram, domain phishing, atau kata
  judi/pinjol/promo dihapus, pelakunya diberi peringatan, dan strike terakhir dikeluarkan
  (`batasStrike`, bawaan 2); admin dan bot sendiri tidak pernah disentuh. Logika keputusannya
  murni di `bot-js/src/pesan.mjs` (diuji unit), bagian WhatsApp-nya di
  `bot-js/src/mesin/jaga-pesan.mjs`.
- **Pesan berkala ke grup (M16)**: kartu di tab Fitur buat mengirim pesan berulang ke grup yang
  dipantau — bawaan **daftar hitam grup** (nomor + sejak kapan + nomor yang admin daftarkan
  sendiri), atau teks sendiri kalau kolom pesannya diisi (mis. aturan grup). Jaraknya diatur
  dalam jam (1-168). Tiap kirim = sekali sambung WhatsApp lalu tutup, jadi batre tetap aman
  (beda dari mode jaga pesan yang nyambung terus). Isi pesannya disusun `bot-js/src/berkala.mjs`
  (murni, 7 unit test), pengirimnya `bot-js/src/mesin/pesan-berkala.mjs`. Tombol **Kirim sekarang**
  di app mengirim tanpa nunggu jadwal.
- **Foto jadi stiker (M14)**: kirim/rebalas foto dengan keterangan `.stiker`. WhatsApp cuma
  nerima stiker WebP, dan Node di dalam APK tidak punya encoder WebP — jadi gambar dititipkan
  ke app lewat berkas di `dataDir` (app dan mesin Node satu sandbox; bridge WS batasnya 1 MB,
  foto WhatsApp gampang lewat batas itu): event `minta_stiker` → `Stiker.kt` mengecilkan ke
  512 px + kompres WebP bertahap sampai muat → cmd `stiker-jadi` → stiker dikirim ke chat
  sendiri. Berkas sementaranya dihapus di dua sisi, dan sisa dari sesi sebelumnya dibuang
  waktu engine nyala. Di CLI perintahnya dijawab jujur: konversi WebP butuh app Android.
- **Status media (M15)**: foto/video dengan keterangan `.story` dikirim ke `status@broadcast`
  tanpa re-encode app-side; WhatsApp tetap bisa mengubah kualitas saat upload. Audience memakai
  nomor yang dipilih di kartu Bot WA umum. `.storygrup` fail-closed karena `statusJidList` hanya
  audience, bukan native group mention.
- **Spek HP dipakai engine**: perintah `perangkat` dari app dicatat engine dan tampil di kartu
  status; jadi kalau HP pas-pasan, engine tahu tanpa harus nebak. Bukti: unit test
  `bot-js/test/pesan.test.mjs` (11 kasus: link Telegram, domain izin/terlarang, kata judi/promo,
  admin dilewatkan, menu, hukuman strike), cek setting + perintah di `bot-js/test/engine.test.mjs`,
  dan langkah `uji bot-umum` di `screenshot_emulator.sh` (kartu + saklar + menu + nilai yang
  masih tersimpan setelah app dibuka ulang).
- **Draft release internal** (job `release-internal` di `build-apk.yml` +
  `scripts-dev/rilis_internal.py`): tiap build `main` otomatis ditaruh di draft release
  bertag `internal-<versi>` (aset lama diganti, draft internal versi lain dihapus). Draft
  hanya bisa dilihat dan diunduh pemilik repo, umurnya tidak habis seperti artifact, dan
  `releases/latest` tidak menghitungnya.
  Pencariannya lewat daftar release, bukan `/releases/tags/<tag>`: endpoint itu menjawab
  404 untuk release draft, jadi run kedua akan mengira draft-nya belum ada dan gagal
  bikin tag yang sudah dipakai.
- **Workflow `bersihkan.yml` + `scripts-dev/bersihkan_actions.py`**: nyapu riwayat run
  (log ikut hilang), artifact, dan cache yang menua. Jalan tiap hari 03.00 WIB dan tiap
  kali build `main` selesai; ada mode `--kering` buat lihat dulu tanpa menghapus.
  Selain umur, total cache dibatasi (`BATAS_CACHE_MB`, bawaan 1500 MB): kelebihannya
  dibuang dari yang paling lama dipakai, jadi penyimpanan tidak naik terus.

### Diubah
- Instalasi baru kembali ke mode inti hemat: **Perintah pribadi** dan logcat detail sekarang
  default mati, sama seperti moderasi, lagu, penjaga grup, dan pesan berkala. Migrasi satu
  kali juga mematikan dua nilai default lama pada build internal; pengguna dapat opt-in lagi.
  Log app/engine tetap direkam. Onboarding hanya menonjolkan
  release dan penjaga grup; tab Fitur menjelaskan bahwa tambahan bersifat opt-in dan beberapa
  masih eksperimental.
- PRD, roadmap, pitch, README, panduan, arsitektur, dan dokumen keamanan disinkronkan dengan
  status multi-repo serta batas Node 18 EOL, 16 KB, self-chat, lagu, dan hosting.
- Workflow **Screenshot app** ikut jalan kalau `scripts-dev/uji-fitur.sh` atau `ui-uji.sh` berubah.
  Sebelumnya daftar pemicunya cuma dua berkas lain, jadi perubahan skrip uji UI nggak keuji
  sama sekali di PR.
- Perintah `.story` dan `.storygrup` dijelaskan ulang di menu dan docs: story itu urusan
  pribadi, dan `.storygrup` sekarang turun jadi `.story` kalau Penjaga grup mati (sebelumnya
  tetap menembak anggota grup yang tersimpan di state, padahal penjaganya nggak jalan).
- Ringkasan status engine menambah `rekamChannelAktif` dan `rekamChannelJumlah`; daftar
  perintah di `.menu` ikut menyebut `.rekam`.
- App: tombol **Simpan** di layar utama tidak lagi nongol terus — muncul cuma kalau ada yang
  diubah (saklar dipencet, kotak isian diketik, tabel repo diubah) dan sembunyi lagi setelah
  setting terkirim ke engine. Di tab Log tetap nggak ada tombol itu.
- **Keamanan Actions**: bukan repo privat, jadi yang dikunci adalah siapa yang bisa menjalankan
  workflow. `default_workflow_permissions` jadi **read** (token Actions nggak bisa nulis
  sembarangan), `can_approve_pull_request_reviews` dimatikan, PR dari fork wajib **disetujui
  manual** (`first_time_contributors` -> `all_external_contributors`), semua action wajib dipin
  ke commit SHA (`sha_pinning_required`), dan `main` dilindungi: wajib lewat PR, tanpa force
  push. Job `bersihkan` juga menolak dipicu run dari fork (`workflow_run` adalah celah klasik).
  Resepnya ditulis di `docs/CI.md` dan `SECURITY.md`.
- App: `MainActivity.kt` (1285 baris) dipecah per tanggung jawab: `FormPengaturan`, `PanelStatus`,
  `DialogTautan`, `LembarHitam`, `AksiSistem`, `SplashUtama`, `Lembar` (komponen dialog).
  Pemindahan mekanis, perilaku dan tampilan sama.
- Engine `bot-js/src/bot.mjs` (1162 baris) dipecah jadi `bot.mjs` (entry, scheduler) +
  `src/mesin/{rilis,lagu-mood,penjaga-grup,tautan,perintah}.mjs`; keadaan bersama lewat satu
  objek `ctx`. Perilaku tidak berubah. Uji ujung-ke-ujung baru `test/engine.test.mjs`
  menjalankan engine dengan GitHub palsu (`WR_GITHUB_API`, khusus tes) di Node 18/20/22.
- Release v1.7.0 dan v1.8.0 jadi **draft** (tidak publik) sampai launching 1.0.0.
- Dokumen (README, docs/, CHANGELOG, template PR) tanpa emoji; anchor README dislug ulang;
  CI menolak emoji di dokumen dan `web/` (`scripts-dev/bersihkan_emoji.py --cek`).
- Web responsif diverifikasi di 14 ukuran layar (320 px sampai ultrawide, portrait dan
  landscape) lewat `scripts-dev/tangkap_web.py`; job CI `tangkapan` gagal kalau ada
  overflow horizontal. `scripts-dev/bingkai_screenshot.py` memasang tangkapan layar HP
  asli ke bingkai mockup web.
- **Layar utama jadi lima tab** (Beranda, Repo, Fitur, Log, Pengaturan) dengan bar navigasi
  bawah; isi kartu tidak berubah, cuma wadahnya dipisah. Bar Simpan disembunyikan di tab Log
  (di situ tidak ada kolom isian) dan banner naik di atas bar simpan + bar navigasi.
- Retention artifact dipendekkan (APK 1 hari, engine/lint 2 hari, R8 mapping 3 hari,
  tangkapan web/screenshot 2 hari) supaya jejak Actions tidak menumpuk walau penyapu
  belum jalan.
- Log cuma digulir otomatis kalau tab Log memang sedang kelihatan; begitu tab dibuka, isinya
  langsung di baris paling baru (`PanelStatus.lompatKeBawah`).
- Tombol yang kolom isiannya ada di tab lain (mis. **Kirim satu lagu sekarang** waktu channel
  masih kosong) sekarang memindahkan layar ke tab Repo dulu, bukan menyuruh isi kolom yang
  tidak kelihatan.

### Diperbaiki
- **Code 440 berulang saat Mode jaga pesan aktif**: log kall membuktikan menu sukses terkirim dan pesan berkala berisi 20 nomor, tapi socket WA beberapa kali putus lalu nyambung ulang. Penyebabnya, tugas singkat (cek grup/kirim berkala) login dengan sesi yang sama walau socket mode jaga masih hidup; WhatsApp menutup salah satu koneksi. Sekarang tugas singkat meminjam socket jaga (dan tidak menutupnya), menunggu socket pulih saat reconnect, dan hanya membuka koneksi sendiri kalau mode jaga mati. Ada uji untuk peminjaman dan fallback.
- Draft release internal pernah gagal diperbarui karena artifact APK-nya sudah kehapus
  sebelum job `release-internal` mengambilnya (sapuan Actions jalan sambil build). Sekarang
  `scripts-dev/bersihkan_actions.py` **tidak pernah** menghapus artifact milik `SIMPAN_RUN`
  run termuda, job draftnya mencoba unduh dua kali, dan kalau benar-benar kosong pesan
  gagalnya menyebut sebabnya (bukan `ls: cannot access 'dist/'`). Job draft juga bisa
  dipanggil manual lewat `workflow_dispatch` di `main` supaya draft basi bisa disegarkan
  tanpa nunggu push baru.
- Skrip uji UI bisa menggulir DUA arah: `gulir_ke` dulu cuma menggulir ke bawah dan pola sed-nya
  cuma menerima koordinat positif, jadi elemen yang sudah kelewat di atas layar dianggap "nggak
  ada" lalu uji terus menggulir menjauh (ketahuan di job emulator: "tombol kirim menu tidak
  ketemu" padahal tombolnya cuma kelewat). Sekarang koordinat negatif dibaca sebagai "di atas
  layar" dan isinya digulir balik ke atas.
- Skrip uji UI (`scripts-dev/ui-uji.sh`) nahan emulator yang gagal sesaat: `uiautomator dump`
  kadang nggak jadi nulis berkasnya (emulator baru boot / lagi sibuk) dan dulu itu mematikan
  seluruh uji dengan pesan `cat: /sdcard/ui.xml: No such file or directory` yang nggak nyebut
  sebabnya. Sekarang dump dicoba 3x dulu dan pesannya jelas kalau benar-benar nggak jadi.
- Tombol **Kirim menu ke chat** nggak lagi diam waktu mode jaga mati: jalur utamanya tetap
  socket mode jaga, tapi kalau nggak ada, bot buka koneksi sekali pakai, kirim menu, lalu tutup
  (pola yang sama dengan pesan berkala). Hasilnya dikirim balik ke app sebagai banner
  (berhasil atau alasannya) — dulu app langsung ngeklaim "menu dikirim" sementara kegagalannya
  cuma nulis di tab Log.
- Perintah di chat sendiri yang datang waktu saklar **Perintah pribadi** mati nggak lagi diem:
  bot balas sekali (jeda 10 menit) buat nunjukin di mana saklarnya.
- `jawab()` di `mesin/jaga-pesan.mjs` sekarang ngembalikan status kirim dan nge-log kalau JID
  akun sendiri nggak kebaca — dulu gagal kirim tanpa jejak sama sekali.
- **Pesan daftar hitam kelihatan rusak** (laporan kall): nomor yang didaftarkan admin
  ditampilkan mentah apa adanya, jadi barisnya campur (`0812-3456-7890`, `+62 813 1111 2222`),
  ada baris sampah (`abc`), satu orang bisa muncul dua kali (versi otomatis + versi manual),
  dan hitungannya bilang "6 orang" padahal isinya 3. Sekarang semua masukan lewat normalisasi
  nomor di `bot-js/src/berkala.mjs` (`susunDaftarHitam`, murni), duplikat digabung, baris bukan
  nomor dibuang, urutan rapi (nomor kecil dulu, ID samaran belakang), daftar di atas 30 orang
  diringkas dengan hitungan tetap jujur, dan `state.berkala.terakhir` mencatat jumlah orang
  sebenarnya.
- Waktu di pesan bot nggak lagi bergantung ICU: dulu `toLocaleString('id-ID')` dipakai buat
  pesan berkala, `.ping`, dan status `.rekam` — di HP (nodejs-mobile ber-ICU kecil) itu jatuh
  ke format Amerika ("10/1/2026, 7:00:00 PM"). Sekarang lewat `bot-js/src/waktu.mjs` (murni):
  "1 Okt 2026, 19.06 WIB".
- **Balasan perintah dipercepat**: moderasi grup dan perintah pribadi dipisah jadi dua jalur di
  `mesin/jaga-pesan.mjs`. Dulu perintah ngantre di belakang kerjaan moderasi (tarik metadata,
  hapus pesan, tendang) yang bisa makan detik-detik waktu grup rame; sekarang perintah dijawab
  langsung sementara moderasi tetap urut di antreannya sendiri. Ditambah: versi protokol WA
  (`fetchLatestBaileysVersion`) di-cache 6 jam, jadi kiriman yang bikin koneksi baru nggak
  buang satu round-trip HTTP di depan tiap kirim.
- CI: draft release internal sempat **menumpuk**. `GET /releases/tags/<tag>` memang sudah tidak
  dipakai lagi, tapi ternyata `tag_name` sebuah draft juga bukan pegangan stabil: begitu ada draft
  lain yang memakai tag itu, GitHub membalasnya sebagai `untagged-<hash>`, jadi pencarian meleset
  dan tiap build `main` bikin draft baru (ketahuan 2026-09-30: dua draft `Build internal 1.8.0`,
  yang lama masih menyimpan APK basi). Sekarang draft dicocokkan lewat **nama**
  (`Build internal <versi>`) juga, dan pembersihan duplikat memakai `id`, bukan tag. Bukti:
  dry-run `scripts-dev/rilis_internal.py --kering` di repo ini menyebut "pakai draft
  internal-1.8.0 yang ada (4 aset lama dibuang)" — bukan "bikin draft baru"; lalu build `main`
  berikutnya mengganti aset di draft yang sama dan jumlah draft internal tetap satu.
- App: kotak isian di layar Repo dan konsol Hosting tidak bisa disentuh. EditText yang dibuat
  dari kode lewat konstruktor `defStyleAttr = 0` kehilangan `focusableInTouchMode` bawaan
  `Widget.EditText`; sekarang lewat `isianBaru()` yang mengisi ulang atribut fokus. Bukti:
  langkah "uji ketik" di `screenshot_emulator.sh`.
- App: layar tidak lagi melompat ke kotak log tiap ada baris log baru. `ScrollView.fullScroll()`
  memindahkan fokus sehingga halaman ikut tergulir dan keyboard tertutup; diganti `ikutKeBawah()`
  yang menggulir isi kotak log saja, dan hanya kalau sebelumnya sudah di ujung bawah.
- CI: job `Lockfile root` nggak lagi gagal kalau `main` menolak push langsung (main sekarang wajib PR); pesannya berubah jadi arahan bikin PR.
- CI Build APK: push ke `main` kini membangun arm64-v8a dan armeabi-v7a (artifact terpisah);
  PR tetap arm64 saja. HP uji 32-bit sebelumnya cuma bisa pakai build manual atau tag.
- `scripts-dev/deploy_web.py`: kalau custom domain sudah terpasang, berhenti di GET
  `workers/domains` sehingga token deploy cukup izin *Workers Scripts: Edit*; resep token
  scoped untuk secret `CF_API_TOKEN` ada di `docs/CI.md`.
- Situs: `<title>`, meta description dan `og:description` ikut bahasa yang dipilih
  (`judul_*`/`deskripsi_*` di `teks.js`, halaman dikenali dari `<body data-halaman>`);
  HTML statis tetap Indonesia untuk crawler tanpa JS.
- Dokumen: bagian jembatan JNI dan polyfill WebCrypto dipindah dari `docs/ARCHITECTURE.md`
  ke `docs/JNI.md` supaya tiap berkas tetap di bawah ~250 baris.

## [1.8.0] — 2026-09-29

### Ditambah
- **Multi repo**: kolom "Repo GitHub" (app) dan `github.repo` (CLI) menerima
  lebih dari satu repo dipisah koma/baris baru (URL `https://github.com/...`
  juga dirapikan). Tiap repo dicek berurutan dengan ETag, baseline, dan
  hitungan gagal kirim sendiri (`state.repos[repo]`, modul `bot-js/src/repo.mjs`).
  State lama dipindah otomatis ke repo pertama; repo yang dihapus dari
  setelan dibuang dari state. Proving test: unit (`repo.mjs`) + integrasi CLI
  (dua repo, migrasi state lama, repo tidak valid).
- App: **notifikasi Android** (channel "Gagal kirim release", prioritas
  tinggi, tap membuka app) saat percobaan ke-3 kirim release gagal — termasuk
  kalau WA-nya sendiri gagal nyambung. Hilang otomatis begitu ada post sukses.
- CI: `versionName` + `versionCode` APK rilis diambil dari tag
  (`v1.8.0` → `1.8.0` / `10800`, rumus major*10000+minor*100+patch); build
  branch/PR memakai default gradle, tidak lagi memakai nama branch sebagai versi.

### Diubah
- Status app `lastTag` untuk banyak repo diringkas `nama v1 · nama2 v2`;
  log cek diberi awalan nama repo kalau repo lebih dari satu.

## [1.7.0] — 2026-09-29

Semua perubahan lewat CI (Build APK, Code quality, CodeQL, Security).
Catatan: release dan tag v1.1.1 sampai v1.6.7 dihapus 2026-09-29 atas permintaan
kall (disisakan v1.7.0 sebagai stable dan rilis terbaru); link compare versi
lama di bawah tidak berlaku lagi.

### Ditambah
- `bot-js/src/rilis.mjs`: keputusan rilis pakai **semver** (`putuskanRilis`).
  Tag lebih rendah dari baseline dianggap rollback, tidak diumumkan ulang.
- `bot-js/src/config/brand.mjs` + `app/src/main/res/values/brand.xml`: satu
  sumber string brand. CI menolak literal brand di layout.
- CLI `--version` → `wa-release-bot 1.7.0 — XyVerse Technology Global`;
  `npm run once -- --ulang` untuk reset hitungan gagal kirim.
- `docs/PRD.md`, `docs/ROADMAP.md`, `docs/KONTEN-TIKTOK.md`, `CODE_OF_CONDUCT.md`,
  `.github/CODEOWNERS`, `.github/FUNDING.yml`, `PROGRESS.md`, `IDEAS.md`.
- Worker lagu: dua lapis batas, **burst** (Rate Limiting binding, 2/menit per
  perangkat via header `X-Pemasang`, 6/menit per IP) dan **harian** (KV: 12 per
  perangkat, 20 per IP, 180 global) menggantikan satu angka global 80. Endpoint
  `GET /lagu/batas` buat melihat sisa jatah. Sudah di-deploy 2026-09-29; proving
  test `scripts-dev/cek-batas-worker.sh` lolos.
- CLI: `WA_RELEASE_BOT_DIR` (lokasi config/state/sesi) dan tes integrasi
  `cli/test/cli.test.mjs` (proses CLI sungguhan, GitHub palsu, tanpa WA).
- Laporan ke **chat diri sendiri** kalau percobaan terakhir (ke-3) kirim rilis
  gagal: tag, repo, error terakhir, cara mengulang. App dan CLI (`laporKeDiri`,
  `formatLaporGagal`).
- Kartu lagu di app menampilkan **jatah hari ini dari server** (`laguJatah`,
  dari `GET /lagu/batas`, diperbarui tiap habis kirim lagu). `/lagu/batas` tidak
  memakai token burst kecuali `?uji=1` (proving test).
- Post rilis ke channel ditulis ulang: judul `<repo> <tag> udah rilis!`, kalimat
  pembuka (dipilih dari tag, jadi retry teksnya identik), bagian *Apa yang baru*,
  daftar **file lampiran** (maks 3 + ukuran, `formatUkuran`), footer lebih
  manusiawi. `github.mjs` sekarang membawa `assets` (nama + ukuran).
- Caption lagu: judul bold, artis biasa, plus keterangan `lagi rame diputer` untuk
  lagu dari chart trend (`jenis: 'trend'` dari Worker).
- Worker lagu: 5 gaya caption baru (`motivasi`, `ngatain`, `nyindir`, `tanya`,
  `sok-bijak`), prompt dibikin lebih natural (kalimat pendek, anti gaya AI),
  cadangan ditambah. `lagu/ayat.json` 20 → 42 ayat, teks terjemahan Kemenag
  diambil dari API equran.id (bukan ditulis dari ingatan). `lagu/daftar.txt`
  48 → 148 lagu (pop/rock 2000-an, indie 2015-2023, jiwang Malaysia).
- `bot-js/src/rekam.mjs` + CLI `npm run rekam [-- --jumlah N --tunggu detik]`:
  perekam pesan channel (riwayat + live) ke `rekaman-channel.json`, protobuf
  di-decode, string dipotong, media dibuang. Dipakai untuk menangkap bentuk asli
  post "Pertanyaan" dari HP.

### Diperbaiki
- Post "Pertanyaan" channel tidak bisa dipastikan tampil: WA tidak membuka
  formatnya dan Baileys 6.7.24 tidak mendukungnya. Sekarang **default `teks`**
  (app: saklar mati; CLI: `"format": "teks"`), `pertanyaan` jadi opt-in
  bertanda eksperimental. Payload tebakan ditambah `messageContextInfo.messageSecret`
  (pola poll/komentar) — BELUM TERVERIFIKASI, hanya bisa dites di HP.
- **Fitur lagu mati sejak v1.6.0**: URL Worker default menunjuk subdomain yang
  tidak pernah ada (`*.akuntiktok76y.workers.dev`, NXDOMAIN). Subdomain akun
  yang benar `dikanjut`. URL sekarang hanya ada di `bot-js/src/lagu.mjs`;
  `SettingsStore.kt` tidak menulisnya lagi dan CI menolak literal `workers.dev`
  di `app/` serta mengecek hostname-nya resolve.

### Diubah
- **npm workspaces**: satu `npm install` di root untuk `bot-js` + `cli`. CLI
  sekarang meng-import modul `bot-js/src` langsung — tidak ada lagi salinan
  `wa.mjs`/`github.mjs`/`format.mjs` yang ketinggalan di `cli/src`.
- `github.mjs`: timeout 20 detik, header `X-GitHub-Api-Version`, `If-None-Match`
  (304 = tidak ada perubahan, tidak makan rate limit).
- Posting release: catatan `pending` ditulis sebelum kirim, maksimal 3
  percobaan, error ambigu tidak dikirim ulang lewat jalur cadangan (anti dobel).
- Semua GitHub Actions dipin ke SHA penuh; actionlint diunduh dengan checksum;
  `code-quality.yml` punya job lockfile, `npm audit`, dan pemeriksaan brand.
- Android: `usesCleartextTraffic` diganti `network_security_config.xml`
  (cleartext hanya ke 127.0.0.1).
- Ganti `configure` repo / prerelease di app: `lastTag`, ETag, dan pending di-reset.
- Footer app: "BUILT IN" → "POWERED BY" + logo dengan contentDescription brand.

### Dihapus
- `konten-tiktok/` (39 MB aset pihak ketiga tanpa lisensi tercatat) dan tiga
  workflow render video, **termasuk dari history git** (commit setelah v1.6.7
  ditulis ulang, tag lama tidak berubah). Panduannya dipindah ke
  `docs/KONTEN-TIKTOK.md`.

## [1.6.7] — 2026-09-28

### Splash dipoles
- Tulisan di splash sekarang di dalam **gelembung chat** (warna bubble WA,
  ada ekornya nunjuk ke animasi) yang "pop" tiap ganti bentuk. Tulisannya
  ganti pas morph mulai — nggak telat satu bentuk lagi.
- Lebih mulus & tajam: keliling bentuk 360 titik (sebelumnya 200), waktu
  animasi pakai jam vsync (`drawingTime`) biar gerak rata di 60/30 fps, dan
  nggak ada alokasi memori tiap frame.
- "BUILT IN XyVerse" di kartu Tentang dipindah jadi footer paling bawah
  halaman; di splash ditaruh lebih mepet bawah.

## [1.6.6] — 2026-09-28

### Splash animasi morph + "Built in XyVerse"
- Splash baru: satu siluet hijau yang terus morph — bot (kedip) → gelembung
  chat (titik-titik ngetik) → not lagu → gear muter → balik ke bot. Digambar
  pakai Canvas (`MorphView.kt`), tanpa library / file animasi.
- Lamanya ngikutin loading: ditutup begitu UI udah kegambar dan (kalau
  service nyala) status engine udah nyampe. Minimal 1,6 dtk, maksimal 4,5 dtk.
  Cuma muncul pas app dibuka dari nol, nggak pas layar diputar.
- Kartu **Tentang** baru di paling bawah: versi, fungsi, lisensi singkat,
  tombol buka repo, dan logo "BUILT IN XyVerse Tech".
- Logo XyVerse (brand kit resmi, versi putih transparan) ikut di splash.

## [1.6.5] — 2026-09-27

### "Kirim lagu gagal: fetch failed"
- Engine sekarang milih IPv4 duluan + otomatis pindah jalur kalau satu
  jalur mati (`ipv4first` + `autoSelectFamily`). Node 18 defaultnya nyoba
  IPv6 dulu kalau ada; di data seluler yang IPv6-nya ngadat, fetch ke
  Cloudflare / SoundCloud gagal, padahal GitHub (cuma IPv4) aman.
- Fetch lagu diulang sampai 3x kalau jaringan putus (error HTTP nggak diulang).
- Pesan error nggak cuma "fetch failed" lagi: kelihatan tahapnya (minta ke
  Cloudflare / download potongan) plus kode aslinya (ENETUNREACH, ENOTFOUND, …).

### Worker lagu (backend — nggak perlu update app)
- Lagu sekarang 50% dari daftar lawas, 50% yang lagi trend di Indonesia
  (chart harian Spotify ID via kworb.net, disaring AI biar cuma lagu
  Indo/Melayu/daerah — pop galau, dangdut, viral, dll). Di-cache sehari.
- Kata-kata nggak cuma motivasi: gayanya dirotasi (curhat, surat, puitis,
  lucu-miris, nostalgia). ±35% ditemenin ayat Al-Qur'an yang nyambung —
  teksnya dari `lagu/ayat.json` (terjemahan Kemenag, dicek ke equran.id),
  AI cuma milih nomornya dan dilarang bercanda di caption yang ada ayatnya.
- Gaya baru **gaul berima** (pantun kilat, bobot dobel): 60% dari bank
  buatan tangan `lagu/gaul.txt`, 40% bikinan AI yang wajib lolos cek rima
  (akhiran 3 huruf sama, katanya beda) — kalau nggak lolos, balik ke bank.
- Model Groq diganti: `llama-3.3-70b-versatile` udah nggak ada di Groq →
  `gpt-oss-120b` (reasoning medium), cadangan `qwen3.8-27b`.
- Pencarian SoundCloud nolak versi edit/DJ/lirik/prod, dan ngutamain upload resmi.

## [1.6.4] — 2026-09-27

### Lagu di saluran dikirim sebagai voice note
- Lagu udah kekirim, tapi di saluran tampil "tidak didukung": saluran WA
  nggak nerima file audio MP3, cuma **voice note** (Ogg Opus).
- Potongan MP3 sekarang diubah jadi voice note langsung di HP — decoder
  mpg123 + encoder libopus versi WASM, tanpa ffmpeg. 60 dtk ≈ 480 KB, mono
  48 kHz 64 kbps.
- Selftest bundle ikut ngecek encoder-nya, jadi kalau WASM-nya nggak kebawa ke
  APK, CI langsung merah.

## [1.6.3] — 2026-09-27

### Lagu akhirnya bisa kekirim
- Biang kerok FC v1.6.1 ketemu berkat jaring pengaman v1.6.2:
  `ENOENT … open '/tmp/audio…'`. Baileys nulis file sementara ke
  `os.tmpdir()`, dan di nodejs-mobile itu tetep `/tmp` (nggak ada di Android)
  walaupun env `TMPDIR` udah diset. Sekarang `os.tmpdir()` langsung diganti
  ke folder data app, dan sisa file sementara dibersihin tiap engine nyala.

## [1.6.2] — 2026-09-27

### Force close pas kirim lagu (dan pas tes grup)
- Penyebab: ada error dari dalam Baileys yang lepas di belakang layar
  (biasanya habis socket WA ditutup). Node 18 nganggep itu fatal → Node
  `exit()` → karena Node jalan di dalam proses app, mutex yang lagi dipakai
  thread Android ikut ancur → `FORTIFY: pthread_mutex_lock called on a
  destroyed mutex` → app FC.
- Sekarang engine punya jaring pengaman: `uncaughtException`,
  `unhandledRejection`, dan `process.exit()` ditangkep, dicatat, engine tetap
  jalan. Isinya juga disimpen ke file, jadi kalau tetep mati, alasannya
  muncul di log begitu engine nyala lagi (" Catatan error sebelumnya").
- Habis ngirim audio lagu, socket dikasih jeda 3 dtk sebelum ditutup.

### Kartu "Tautkan WhatsApp"
- Udah tertaut → isian nomor, "Tautkan pakai kode", dan "Pakai QR"
  disembunyiin; yang tersisa status + "Lepas WA".
- QR & pairing code nggak bakal nongol barengan lagi: yang tampil cuma cara
  yang lagi dipilih.
- Tarik layar dari atas ke bawah buat nyegerin status (tanpa nautin ulang).

## [1.6.1] — 2026-09-27

### Lagu mood: Cloudflare x HP (GitHub Actions dicabut)
- Workflow `lagu-mood.yml` + `lagu/siapkan.py` dihapus. Nyedot lagu dari
  Actions di repo publik itu riskan buat akun GitHub, dan YouTube juga udah
  ngeblok IP server GitHub.
- Sekarang Cloudflare Worker yang milih lagu, nyari di SoundCloud, & bikin
  kata-kata (key AI disimpen sebagai secret Worker, nggak ada di APK/repo).
- HP cuma download potongan ~60 dtk pakai HTTP Range (±1 MB, bukan lagu full),
  dirapiin per frame MP3 tanpa ffmpeg, dikirim, terus **file-nya langsung
  dihapus dari HP**. Sisa file dari pengiriman yang kepotong ikut dibersihin
  tiap engine nyala.

## [1.6.0] — 2026-09-27

Dibangun di atas kode v1.5.0 (= v1.3.0 yang stabil). Fitur 1.4.x yang bikin
force close NGGAK dibalikin.

### Baru
- **Sambutan baru**: 4 halaman dengan ilustrasi 3D (dibikin AI, bukan emoji),
  elemen yang melayang + paralaks, transisi mantul, indikator kapsul, tombol
  yang "bernapas". Bisa digeser.
- **Denyut di semua tombol**: pas dipencet mengecil + getar halus, pas dilepas
  mantul balik + lingkaran cahaya dari titik sentuh. Kartu di layar utama
  muncul satu-satu.
- **Lagu mood**: sesekali ngirim potongan lagu lama (~60 dtk, bagian reff) +
  kata-kata dari AI ke channel. Jadwal diacak (rata-rata N kali/hari, cuma di
  jam aktif). Yang nyiapin lagunya GitHub Actions (yt-dlp + ffmpeg + Groq) →
  disimpen di Cloudflare Worker/KV → HP tinggal ngirim. Daftar lagu:
  `lagu/daftar.txt`.
- **Hosting bot custom**: upload ZIP project Node.js, app yang jalanin di
  worker thread (process.exit / crash di bot itu nggak matiin app). Pasang
  modul dari npm langsung di HP kalau node_modules nggak ikut, baca `.env`,
  konsol berwarna, kirim input (stdin), restart otomatis kalau crash, lanjut
  jalan lagi habis HP restart. Sesi WA bot lama tetap kepakai waktu ganti ZIP.

### Catatan
- Node di app tetap Node 18 (nodejs-mobile). Versi Node cuma bisa naik lewat
  update APK — Android nggak ngizinin app download lalu ngejalanin binary baru.

## [1.5.0] — 2026-09-27

### Balik ke kode v1.3.0

v1.4.0–v1.4.3 bikin app force close terus di HP user
(`FORTIFY: pthread_mutex_lock called on a destroyed mutex` → SIGABRT, beberapa
detik setelah mesin Node nyala) dan HP jadi lemot. Tiga kali coba benerin nggak
ngilangin crash-nya, dan penyebab pastinya belum ketemu. Jadi app & engine
**dibalikin persis ke kode v1.3.0** — versi terakhir yang kebukti jalan di HP
user. Nomor versinya naik (1.5.0) cuma biar bisa dipasang di atas 1.4.x tanpa
uninstall; sesi WA & setelan tetap kepakai.

Yang **ilang** (ikut v1.4.x): halaman Setelan terpisah, layar sambutan,
halaman Tentang, perintah `!info` / `!rules` / `!menu`, script bot, Lihat
respons, pesan tes grup versi baru, tambalan grup LID.

Yang **tetap**: lisensi pemakaian pribadi (LICENSE, THIRD_PARTY_LICENSES.md).

## [1.4.3] — 2026-09-27

### Diperbaiki

- **Force close `FORTIFY: pthread_mutex_lock called on a destroyed mutex`
  (SIGABRT).** Itu tandanya ada yang manggil `exit()` di dalam proses app:
  mesin Node (jalan di proses yang sama) keluar, library-library-nya
  dibongkar, lalu thread lain (UI, coroutine, perekam log) nyentuh kunci yang
  udah dihancurin → app mati. Sekarang di Android:
  - jaring error dipasang paling awal, sebelum apa pun jalan (dulu baru
    kepasang setelah bridge siap);
  - `process.exit()` diblok — cuma dicatat di Log, engine tetap idup;
  - engine yang gagal mulai nggak lagi `exit(1)`, cuma nulis alasannya di Log.
  Udah dites di Node 18.20.4: error nyasar, promise ditolak, dan
  `process.exit(3)` dari script — proses tetap jalan.

## [1.4.2] — 2026-09-27

### Dibalikin

- **Pilihan mode aktivitas dihapus** (Adaptif / Pintar / Realtime). Bot balik
  kayak sebelum v1.4.0: nyambung tiap interval cek grup, lalu tidur lagi.
  Log dari HP user nunjukin app di v1.4.0 nyala-mati puluhan kali tanpa
  dibuka — salah satu pemicunya pendengar notifikasi mode Pintar yang bikin
  Android terus ngebangunin app. Pendengar notifikasinya (dan izin *Akses
  notifikasi*) ikut dihapus.

## [1.4.1] — 2026-09-27

### Diperbaiki

- **App force close + HP jadi lemot / app lain ketutup.** Engine Node jalan
  di dalam proses app. Baileys 6.7.24 punya beberapa handler async tanpa
  `catch` (upload pre-key pas login, ambil semua grup pas ada notif "dirty").
  Kalau socket ditutup pas handler itu masih jalan, error-nya nggak ketangkep →
  Node 18 matiin proses → **seluruh app ikut mati**, lalu Android nyalain
  ulang service → nyambung WA lagi → mati lagi. Muter terus, makan CPU & RAM.
  Sekarang error nyasar cuma dicatat di Log; kalau banjir (>30/menit) bot
  dijeda sendiri, bukan crash.
- **Tombol bikin app beku.** Tiap tombol nulis ke app.log di thread utama,
  rebutan kunci sama perekam logcat yang nulis per baris ke penyimpanan.
  Sekarang semua log ditulis thread belakang per rombongan; thread utama
  nggak pernah nyentuh disk.
- **Mode Pintar kebanyakan bangun.** Di grup rame, notif WA dateng tiap
  beberapa detik → bot login ulang tiap ±20 dtk. Sekarang paling cepat
  2 menit sekali, dan nggak dibangunin kalau socket masih kebuka.
- Kartu Log cuma digambar ulang kalau isinya berubah.
- `bot.log` internal (numpuk terus, nggak pernah dipotong, isinya dobel sama
  `mesin.log`) udah nggak ditulis dan dihapus.

## [1.4.0] — 2026-09-27

### Lisensi berubah

- Mulai rilis ini **bukan MIT lagi**: lisensi **pemakaian pribadi**
  (source-available). Boleh pakai sendiri, baca, ubah buat diri sendiri; nggak
  boleh jual / sebar ulang / rebrand / pakai bisnis tanpa izin. Lihat
  [LICENSE](LICENSE). v1.3.0 ke bawah tetap MIT.
- Baru: [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) — termasuk catatan
  soal libsignal (GPL-3.0) yang ikut dibundel Baileys.

### Baru

- **Tampilan baru.** Dashboard (status, banner WA tertaut, ubin info, aksi
  cepat, log) + halaman **Setelan** terpisah (auto-simpan pas ditinggal) +
  halaman **Tentang** (versi, lisensi, pihak ketiga, privasi) + **layar sambutan**
  3 halaman pas pertama buka.
- **Banner "WA SUDAH TERTAUT"** gede di dashboard, lengkap nomornya. Kartu
  Tautkan cuma muncul kalau belum tertaut.
- **Mode aktivitas** (Setelan): **Berkala** (default), **Adaptif** (grup sepi →
  jeda makin panjang), **Pintar** (dibangunin notifikasi WhatsApp, butuh izin
  Akses notifikasi, cadangan tiap 30 menit), **Realtime** (selalu nyambung).
- **Perintah di grup:** `!info` (admin: anggota, permintaan, disetujui/ditolak,
  daftar hitam dengan nomor disamarkan), `!rules`, `!menu`, `!ping`. Bisa juga
  dari chat "Pesan ke diri sendiri". Bisa dimatiin.
- **Script bot (plugin).** Upload file `.js` dari Setelan → Script bot buat
  nambah perintah sendiri. Dokumentasi: [docs/PLUGIN.md](docs/PLUGIN.md).
- **Lihat respons** (dashboard): baca balasan follower buat Pertanyaan channel
  terakhir.
- **Pesan tes grup** sekarang: * Bot penjaga grup aktif* + fitur + aturan
  singkat + link aturan (default `https://rules.xyc.my.id/`, bisa diganti).

### Diperbaiki

- **Pesan ke grup "terkirim" tapi nggak nongol.** Dua penyebab yang ketemu:
  (1) bot dulu langsung putus habis kirim, padahal HP anggota kadang minta
  kirim ulang — sekarang socket ditahan ±25 detik dan bot bisa ngirim ulang
  pesannya (`getMessage`); (2) grup yang pakai **LID** (ID samaran) — Baileys
  6.7.24 pakai identitas yang salah buat kunci pengirim, jadi HP anggota nggak
  bisa buka pesannya. Ditambal pas build (tambalan yang sama dengan Baileys 7).
  Kalau masih gagal, sekarang **kelihatan**: tiap kirim nunggu konfirmasi server
  dan kode error-nya ditulis di Log (dulu dianggap sukses).
- **Pertanyaan channel nyampe sebagai teks biasa.** Pesannya sekarang dirakit
  lengkap (`isQuestion` + node `<meta questiontype>`), jadi tampil sebagai
  Pertanyaan dengan tombol respons (cara yang sama dipakai elaina-baileys;
  belum dites di semua channel). Kalau server nolak (channel belum kebagian
  fitur ini), otomatis kirim teks biasa + alasan di Log.
- Satu koneksi WA dipakai bareng buat cek grup, kirim channel, dan perintah —
  nggak nyambung-putus berkali-kali dalam satu putaran.

## [1.3.0] — 2026-09-27

Rilis ini juga ngebawa perbaikan tombol dari 1.2.2 (yang nggak sempat dirilis
sendiri) — lihat bagian 1.2.2 di bawah.

### Baru

- **Pesan ke channel dikirim sebagai "Pertanyaan".** Fitur saluran WA yang
  follower-nya bisa **bales** pesan (balasannya cuma sampai ke admin, nggak
  keliatan follower lain). Pesan rilis & pesan tes ditutup ajakan *"Ada
  pertanyaan / nemu bug? Bales aja pesan ini"*. Bisa dimatiin di kartu Rilis
  (*Kirim sebagai Pertanyaan*) — balik ke pesan teks biasa. Kalau kirim versi
  Pertanyaan gagal, otomatis dikirim sebagai teks biasa. Buat grup tetap teks
  biasa. CLI: `"whatsapp": { "format": "pertanyaan" | "teks" }`.
- **Tes kirim ke grup.** Tombol *Tes kirim* di kartu Penjaga grup: bot kirim
  pesan singkat ke grup target — buat mastiin link grup & akunnya bener.
- **Buka blokir dari daftar hitam.** Tombol *Daftar hitam* sekarang buka daftar
  beneran (bukan cuma nulis di Log): tiap orang ada tanggal keluarnya + tombol
  **Buka blokir**. Habis dibuka, kalau orang itu minta join lagi bakal
  di-approve. Satu orang yang kecatat pakai nomor + ID samaran (LID) dibuka
  sekaligus.

### Diperbaiki

- Kolom *Selalu tolak nomor ini*: nomor yang ditulis pakai spasi
  (`0812 3456 7890`) dulu pecah jadi potongan yang nggak valid → nggak pernah
  ketolak. Sekarang pemisahnya koma / titik koma / baris baru.

## [1.2.2] — 2026-09-27

### Diperbaiki

- **Tombol nggak ngasih tau apa-apa waktu service dimatiin / bot dijeda.**
  Habis *Matikan service*, layar tetap bilang "JALAN" dan tombolnya tetap
  "Jeda" — soalnya status engine nggak pernah di-reset waktu service berhenti.
  Sekarang:
  - Pencet Mulai / Jeda / Matikan → tombolnya langsung jadi *Menyalakan…* /
    *Menjeda…* / *Mematikan…* (nggak bisa dipencet dobel) sampai beneran
    kejadian, terus muncul notif singkat di atas (*✓ Bot jalan*, *⏸ Bot
    dijeda*, *⏻ Service mati*). Kalau 15 detik nggak ada respon, dikasih tau.
  - Service mati → status jadi **MATI**, tombol utama jadi **Nyalakan**,
    tombol Matikan jadi abu-abu *Service udah mati*.
  - Waktu service dimatiin, engine Node juga disuruh berhenti (jadwal cek rilis
    & grup dimatiin, setup yang lagi jalan dibatalin). Dulu engine-nya diam-diam
    tetap jalan di belakang.

## [1.2.1] — 2026-09-27

### Diperbaiki

- **Dialog QR sama pairing code nongol barengan.** Dua penyebab:
  1. `events.jsonl` (jalur event engine → app) nggak pernah dikosongin, dan app
     bacanya dari AWAL tiap service nyala. Jadi QR / kode basi dari setup yang
     kepotong (mis. app di-swipe) "diputar ulang" dan nongol bareng yang baru.
     Sekarang file itu dikosongin tiap start (di app & engine).
  2. Minta setup lagi pas setup lama masih jalan dulu ditolak ("Setup lagi
     jalan") — QR lama tetap nempel. Sekarang setup lama **dibatalin** dan
     diganti; tampilan QR/kode yang lama langsung ditutup. Waktu mode kode, QR
     nggak pernah ditampilin.
- **WA di HP muter "Sedang masuk…" lama banget habis scan QR / masukin kode.**
  Begitu tersambung, bot langsung kirim test message lalu **mutus koneksi** —
  padahal HP masih nunggu perangkat baru ini nyelesaiin login (upload pre-key,
  balas notifikasi sinkron riwayat). Koneksi diputus = HP nunggu terus, lalu
  bisa gagal nautin. Sekarang habis nautin baru, koneksi ditahan sampai WA
  selesai ngirim antrean notifikasinya + jeda (±15–30 dtk, maks 60 dtk). Status
  di app: *"Diterima WhatsApp! Nyelesaiin tautan… jangan tutup app"*.
- Nyambung ulang habis 515 sekarang pakai sesi yang ada di memori, bukan baca
  ulang dari file (nyimpen sesi jalan di belakang dan kadang belum kelar → socket
  kedua dapat sesi setengah jadi).
- Perintah app → engine lewat `cmd.json` nggak hilang lagi kalau dikirim 2x
  beruntun (dulu file-nya ditimpa; sekarang satu perintah per baris).
- QR/kode yang kelamaan nggak dipakai sekarang pesannya jelas ("kadaluarsa,
  minta kode baru"), bukan `code 408`. Waktu buat ngetik pairing code juga
  dipanjangin.

## [1.2.0] — 2026-09-27

### Diperbaiki

- **Setup "gagal" dengan `code 515` padahal QR-nya udah kescan.** Tepat setelah
  QR discan (atau pairing code dimasukin), WhatsApp SELALU mutus koneksi dengan
  kode 515 (*restart required*) dan nyuruh nyambung ulang — itu bagian normal
  dari proses nautin. Engine dulu nganggap semua koneksi putus = gagal, jadi
  setup selalu berakhir ` Setup gagal: Koneksi WA tutup (code 515)`.
  Sekarang 515 dijawab dengan nyambung ulang pakai sesi yang baru disimpan.
  Putus karena jaringan (408/428/503) juga dicoba ulang sampai 3x.
- **Habis update APK, engine yang jalan tetap engine LAMA.** `bundle.cjs` cuma
  disalin dari APK kalau file-nya belum ada — jadi perbaikan di engine nggak
  pernah kepakai sampai app di-uninstall. Sekarang ditandai pakai versionCode +
  waktu update APK; beda → disalin ulang.
- Sisa pairing yang nggak selesai (kode diminta, tapi nggak pernah dimasukin)
  dibuang otomatis sebelum nautin lagi — kalau nggak, WA nolak login berikutnya.

### Baru

- **Tautkan pakai pairing code.** Isi nomor WA → muncul kode 8 huruf → ketik di
  WhatsApp (*Perangkat tertaut → Tautkan dengan nomor telepon saja*). Nggak
  perlu HP kedua buat scan QR — cocok karena bot-nya biasanya di HP yang sama
  dengan WA-nya. QR tetap ada sebagai pilihan kedua. CLI: `npm run setup -- --pair 08xxxx`.
- **Penjaga grup.** Buat grup yang pakai *Setujui anggota baru*: permintaan join
  di-approve otomatis, **kecuali** orang yang dulu udah keluar / dikeluarin —
  mereka ditolak. Jalan berkala (default tiap 5 menit): nyambung → cek →
  putus, jadi tetap hemat batre.
  - "Siapa yang keluar" dihitung dari selisih daftar anggota antar-cek.
    Yang di-approve bot langsung dicatat, jadi keluar sebelum cek berikutnya
    pun tetap ketahuan.
  - Satu orang dicatat pakai nomor HP **dan** LID-nya (ID samaran WA), biar
    nggak lolos cuma karena WA nampilin ID yang beda.
  - Yang keluar sebelum fitur ini nyala nggak ketahuan → ada kolom
    "selalu tolak nomor ini".
  - Yang dimasukin lagi manual sama admin otomatis keluar dari daftar hitam.
  - Pengaman: kalau daftar anggota dari WA tiba-tiba anjlok >50%, putaran itu
    nggak nyatet siapa pun (biar glitch nggak bikin separuh grup ke-blacklist).
- **Lepas WA** — logout perangkat dari app.
- Tombol **Izinkan jalan di latar** (pengecualian optimasi batre) dan **Buka
  izin Autostart** (Xiaomi/Oppo/Vivo/Huawei/Samsung).
- Nyala otomatis juga habis **app di-update** (`MY_PACKAGE_REPLACED`) dan di ROM
  yang pakai `QUICKBOOT_POWERON`. Opsi nyala-otomatis sekarang default **nyala**.
- Begitu internet nyambung lagi, bot langsung cek (nggak nunggu jadwal).

### Tampilan

- UI baru, gelap ala WhatsApp, **tanpa komponen Material bawaan**: tombol,
  kartu, input, saklar, dialog, dan notifikasi kecil digambar sendiri.
- Logo **bulan sabit** yang lama balik lagi (sabitnya sekarang path beneran,
  bukan lingkaran yang ditimpa warna latar), plus versi themed icon.

### Hemat batre

- Ping WebSocket lokal tiap 15 dtk dihapus (koneksi ke 127.0.0.1 nggak butuh).
- Polling file event: 300 ms cuma pas app kebuka, 3 dtk pas di belakang.
- Polling `cmd.json` di engine: 250 ms → 1 dtk (perintah normalnya lewat WS).
- Baileys nggak narik riwayat chat sama sekali (`shouldSyncHistoryMessage: false`).
- Perekam logcat bisa dimatiin (kartu Batre).

## [1.1.4] — 2026-09-27

### Diperbaiki (yang ini fatal)

- **Mesin Node nggak pernah nyala di HP.** `NodeBridge` nggak pernah memanggil
  `System.loadLibrary()`. Punya `libnode.so` dan `libnodebridge.so` di dalam
  APK itu **tidak cukup** — Android baru menautkan sebuah `.so` kalau ada yang
  memintanya lewat `loadLibrary()`. Akibatnya tiap panggilan native melempar:

      java.lang.UnsatisfiedLinkError: No implementation found for int
      com.xykals.warelease.NodeBridge.startNode(...)
      - is the library loaded, e.g. System.loadLibrary?

  Jadi aplikasinya jalan, tombolnya bisa ditekan, tapi **bot-nya nggak pernah
  hidup** — QR nggak muncul, setup nggak jalan, posting nggak jalan. Kata
  "is the library loaded" di pesan itu memang jawabannya, cuma nggak ada yang
  sadar karena build-nya hijau dan isi APK-nya "benar".

  Ini juga menjelaskan kenapa semua verifikasi sebelumnya lolos: yang diperiksa
  itu file APK-nya (isi, tanda tangan, ukuran), bukan perilakunya di HP.
  Build sukses, `.so`-nya ikut ke-package, simbolnya benar — yang kurang cuma
  satu baris kode.

  Sekarang `System.loadLibrary("node")` lalu `("nodebridge")` dipanggil di
  thread Node (bukan thread utama: `libnode.so` 45 MB, memuatnya ratusan
  milidetik). Urutannya penting — `libnodebridge.so` punya `DT_NEEDED` ke
  `libnode.so`.

### Supaya nggak kejadian lagi

- CI build: `readelf --dyn-syms` memastikan `libnodebridge.so` benar-benar
  mengekspor `Java_com_xykals_warelease_NodeBridge_startNode` — untuk **tiap**
  ABI yang dipackage, langsung dari `.so` di dalam APK.
- CI lint: memastikan `System.loadLibrary("node")` dan `("nodebridge")` masih
  ada di `NodeBridge.kt`, **dan urutannya benar**.
- Dua-duanya statis dan murah, dan dua-duanya bakal menangkap persis bug ini.

### Diubah

- Log startup sekarang mencatat **ABI yang benar-benar dipakai** Android
  (`primaryCpuAbi`), bukan cuma daftar ABI yang didukung HP. Kalau suatu saat
  APK-nya nggak cocok sama HP-nya, ini yang bikin langsung ketahuan.
- Kalau library native gagal dimuat, pesan errornya nyebut ABI HP-nya dan
  nyaranin APK mana yang harus dipasang.
- `FileBridge` membuang `cmd.json` sisa sesi sebelumnya waktu service dinyalakan.
  Tanpa ini, perintah yang nggak pernah sempat diproses (mis. karena mesin Node
  mati waktu perintahnya dikirim) disimpan di file dan baru dieksekusi
  belakangan — jadi bot ngelakuin hal yang udah nggak relevan.

## [1.1.3] — 2026-09-27

### Diperbaiki

- **App terhenti waktu tombol ditekan (paling sering kelihatan di Setup).**
  `BotService` baca setting lewat `private val settings = SettingsStore(this)`
  di badan class. Field itu jalan di **constructor**, sedangkan Android baru
  memasang Context-nya setelah constructor selesai
  (`newService()` → `attach(ctx)` → `onCreate()`). Jadi di titik itu `this`
  masih Context kosong → `getSharedPreferences()` melempar NullPointerException
  di thread utama → **seluruh proses app mati**.
  Sekarang `settings` `lateinit` dan diisi di `onCreate()`.
  Ini bug lama, bukan bawaan v1.1.2 — baru ketahuan sekarang karena belum
  pernah dites di HP sungguhan.
- **Layar beku waktu dialog QR muncul.** Gambar QR 640×640 digambar dengan
  400 ribu panggilan `Bitmap.setPixel()` **di thread utama** — dan digambar
  ulang tiap kali ada event masuk (walau isi QR-nya sama). Sekarang: gambar
  QR disusun dulu di array, dikirim ke bitmap lewat satu panggilan
  `setPixels()`, diproses di thread belakang, dan hasinya di-cache per isi QR.
- `QrBitmap` cuma nangkep `Exception`; kalau yang kelempar `OutOfMemoryError`
  (itu `Error`, bukan `Exception`) aplikasinya tetap mati. Sekarang `Throwable`.
- Semua tombol dibungkus try/catch: kalau ada yang meledak, muncul toast + jejak
  di log — app-nya nggak ikut mati.
- Tombol yang ditekan waktu service belum siap nggak lagi diam-diam nggak
  ngapa-ngapain (`withService` cuma nunggu 4 detik lalu kirim; kalau service-nya
  belum kelar, perintahnya hilang tanpa pesan). Sekarang ditunggu sampai
  instance-nya benar-benar ada, maksimal ~10 detik, lalu dikasih tahu kalau gagal.

### Ditambahkan

- **Perekam log**, tersimpan di `Android/media/<nama-paket>/log/`:
  `app.log` (aktivitas app), `mesin.log` (engine Node), `logcat.log` (log
  mentah Android, termasuk output Node), dan `crash.log` (penyebab app mati).
  Folder itu bisa dibuka tanpa root dan tanpa izin penyimpanan — beda dengan
  `/data/data/...` yang nggak bisa diakses siapa-siapa.
- **Penangkap crash** yang dipasang dari `App.onCreate()`, jadi crash paling
  awal pun kecatat lengkap dengan versi app, tipe HP, dan stack trace.
- Tombol **Buka Folder Log** dan **Kirim Log** (bagi file log lewat
  WA/email/Drive pakai FileProvider — cuma folder log yang bisa dibagikan).
- **Cari channel dari link.** Field "Channel WA" sekarang nerima
  `https://whatsapp.com/channel/...`, JID `<angka>@newsletter`, JID grup
  `<angka>@g.us`, dan link undangan grup `chat.whatsapp.com/...`.
- **Tombol Bikin Channel** — bot bikin channel baru dari akun lo, nyimpen
  JID-nya ke setting, lalu kirim test message. Buat yang belum punya channel.
- Channel boleh dikosongin pas nyimpen setting. Sebelumnya wajib diisi — dan
  itu bikin muter: nggak bisa nyimpen setting → engine nggak nyala → tombol
  Bikin Channel nggak bisa dipakai → nggak punya channel.
- Perintah `cek-channel` (`bikin-channel` juga) di engine + pemakaian grup WA
  sebagai target posting.

### Diubah

- **Emoji di UI diganti ikon vektor.** Emoji (   dst) dirender beda-beda
  tiap HP, ukurannya nggak bisa diatur, dan ada yang muncul kotak kosong.
  Sekarang semua ikon gambar vektor yang warnanya ngikut tema (jadi ikut
  mode terang/gelap).
- **Ikon app digambar ulang**: balon obrolan + panah naik. Yang lama (bulan
  sabit kuning + bintang) kelihatan kayak emoji . Sekalian ditambah layer
  `monochrome` biar ikut "themed icon" Android 13+.

### Perubahan perilaku (penting)

- **Username channel (`@nama_channel`) sekarang ditolak** dengan pesan yang
  jelas. Dulu "didukung", tapi kodenya manggil `onWhatsApp()`
  — fungsi itu buat nyari **nomor HP**, bukan channel, jadi selalu gagal.
  API WhatsApp yang dipakai engine ini juga nggak nyediain pencarian channel
  lewat username. Yang benar: pakai **link** channel, atau tombol Bikin Channel.
  Ini berlaku juga di CLI (`cli/src/wa.mjs`).

## [1.1.2] — 2026-09-27

### Ditambahkan

- **Tiga APK di setiap Release**, bukan satu:
  `arm64-v8a` (HP 64-bit), `armeabi-v7a` (HP 32-bit), dan `universal`
  (buat yang nggak mau mikir). Ketiganya dibuild **paralel** lewat matrix,
  jadi nggak nambah waktu CI.
- **Verifikasi dex setelah R8** di CI. R8 me-rename class jadi nama pendek;
  kalau ada nama yang masih dipanggil lewat string (JNI, WorkManager,
  komponen manifest) ikut ke-rename, aplikasinya crash di HP — bukan di CI.
  Jadi nama-nama itu sekarang diperiksa langsung di dalam `classes.dex`.
- Artifact `r8-mapping-*` berisi `mapping.txt`, buat menerjemahkan stack trace
  dari HP (yang namanya sudah di-obfuscate) balik ke nama class asli.

### Ukuran APK

- **R8 diaktifkan** untuk build release: `minifyEnabled` + `shrinkResources`.
  Kode dan resource yang nggak kepakai dibuang, sisanya di-rename jadi pendek.
- Efeknya terbatas dan itu wajar: yang bikin APK ini besar adalah `libnode.so`
  (±49 MB mentah), bukan kode Kotlin. R8 memangkas `classes.dex`, dan itu
  bagian yang jauh lebih kecil.
- Karena `libnode.so` inilah APK-nya dipisah per-arsitektur: satu HP cuma butuh
  satu, jadi mengirim keduanya sekaligus cuma bikin unduhan dua kali lebih
  besar dari yang perlu.

### Keamanan

- Aturan keep R8 ditulis eksplisit di `app/proguard-rules.pro` (4 titik:
  JNI, WorkManager, komponen manifest, anotasi). Sengaja pendek — aplikasi ini
  nggak pakai reflection dan nggak ada `addJavascriptInterface`, karena
  bridge ke Node lewat file (`events.jsonl` / `cmd.json`), bukan lewat nama
  class.

## [1.1.1] — 2026-09-26

Versi ini soal **tanda tangan APK** dan **dukungan HP 32-bit**.

### Ditambahkan

- **Dukungan `armeabi-v7a`** (HP Android 32-bit). Sebelumnya cuma `arm64-v8a`.

  Aturan ABI-nya sekarang:

  | Build dari | ABI yang dipackage |
  |---|---|
  | **tag `v*`** (yang masuk GitHub Release) | `arm64-v8a` **+** `armeabi-v7a` — satu APK, jalan di HP 64-bit maupun 32-bit |
  | push / pull request | `arm64-v8a` saja (paling cepat & kecil) |
  | *Actions → Build APK → Run workflow* | bisa pilih: `arm64-v8a`, `armeabi-v7a`, atau dua-duanya |

  Jadi APK yang di-attach ke Release selalu yang universal — nggak ada lagi
  kejadian "release-nya cuma arm64, HP 32-bit nggak bisa pasang".
- `scripts-dev/apk_signer.py` — baca sertifikat penandatangan APK langsung dari
  APK Signing Block (v2/v3), tanpa perlu install Android SDK. Gunanya buat
  menjawab "APK ini bisa nimpa yang lama atau nggak".
- `-Pabis=...` untuk build lokal, dan `ABIS=...` untuk script yang mengunduh
  `libnode.so`.

### Diperbaiki

- **Komentar ABI di `app/build.gradle` salah** — ditulis "nodejs-mobile cuma
  menyediakan prebuilt arm64-v8a + x86_64". Faktanya `armeabi-v7a` juga ada,
  dan itu yang bikin HP 32-bit nggak bisa didukung.
- **Cache key `nodejs-mobile` nggak memuat daftar ABI-nya.** Build `armeabi-v7a`
  bakal kena cache `arm64-v8a`, jadi `libnode.so` versi v7a nggak pernah
  keunduh dan build-nya berhenti di CMake. Sekarang cache key-nya per-set-ABI.
- **Verifikasi isi APK cuma cek "ada `libnode.so`".** Kalau minta dua ABI tapi
  cuma satu yang kepackage, APK-nya tetap lolos dan HP yang satunya cuma dapat
  crash. Sekarang dicek per-ABI.

### Keamanan

- **APK sekarang di-sign dengan kunci yang tetap.** Sebelumnya di-sign pakai
  debug key bawaan runner CI, dan runner itu bersih tiap kali — jadi kuncinya
  di-generate ulang tiap build. Akibatnya tiap APK punya sidik jari berbeda dan
  **nggak bisa dipasang nimpa APK sebelumnya** (`App not installed`), sehingga
  tiap update menghapus sesi WhatsApp. Sudah diverifikasi: 3 build dari commit
  dan event berbeda menghasilkan sidik jari yang sama.

## [1.1.0] — 2026-09-26

Versi ini fokusnya **bikin proyeknya benar-benar bisa di-build dan aman**.
Sebelum ini, APK-nya nggak akan pernah jadi: ada 6 bug kompilasi + 1 kerentanan
kritikal di dependency.

### Keamanan

- **Naikkan Baileys `6.17.16` → `6.7.24`** — menutup
  [CVE-2026-48063 / GHSA-qvv5-jq5g-4cgg](https://github.com/WhiskeySockets/Baileys/security/advisories/GHSA-qvv5-jq5g-4cgg)
  (**critical, CVSS 9.3**): message upsert / history-sync spoofing + app-state
  corruption dari payload `protocolMessage` yang dibuat jahat. Versi lama juga
  sudah ditandai deprecated oleh maintainer-nya.
- Tambah override dependency transitive: `file-type@^21.3.1` (infinite loop di
  ASF parser) dan `uuid@^11.1.1` (missing buffer bounds check).
- Tambah `gitleaks` + pemeriksaan pola token di CI supaya nggak ada secret
  yang ke-commit.
- Tambah `dependency-review` di PR: blokir dependency baru yang high/critical
  atau berlisensi copyleft kuat.

### Perbaikan (semuanya bikin build gagal — ini yang paling penting)

- **`app/build.gradle`: dependency `androidx.appcompat` hilang.**
  `MainActivity` extends `AppCompatActivity`, tapi `androidx.appcompat:appcompat`
  nggak ada di daftar dependency → `Unresolved reference: AppCompatActivity`.
- **`app/src/main/res/layout/activity_main.xml`:** ada `&` mentah di
  `android:text` (baris 262). XML gagal di-parse → `mergeDebugResources` FAILED.
  Diganti `&amp;`.
- **`BotBus.kt`: API `publish {}` nggak bisa dipakai dari mana pun.**
  `publish(block: BotUi.() -> BotUi)` dipanggil dengan lambda yang isinya
  assignment (`BotBus.publish { serviceRunning = true }`) — hasilnya `Unit`,
  bukan `BotUi`; dan field `BotUi` semuanya `val` jadi nggak bisa di-assign.
  Sekarang field-nya `var` + `publish(block: BotUi.() -> Unit)` yang bekerja di
  atas `copy()` (thread-safe). Memperbaiki ~30 error kompilasi di
  `BotService.kt`, `NodeBridge.kt`, `MainActivity.kt`.
- **`QrBitmap.kt`: import zxing salah paket** — `com.google.zxing.QRCodeWriter`
  → `com.google.zxing.qrcode.QRCodeWriter`.
- **`MainActivity.kt`: `tvLog.scrollHeight`** — `TextView` nggak punya properti
  itu. Log sekarang di-scroll lewat `ScrollView` pembungkusnya
  (id baru `svLog`) pakai `fullScroll(View.FOCUS_DOWN)`.
- **`MainActivity.kt`: `ScrollView(this).apply { content = iv }`** — `ScrollView`
  nggak punya properti `content`. Diganti `addView(iv)`.
- **`MainActivity.kt`: tipe `busListener` nggak eksplisit** — `handler.post {}`
  mengembalikan `Boolean`, jadi lambda-nya bertipe `(BotUi) -> Boolean` dan
  nggak cocok dengan `subscribe(l: (BotUi) -> Unit)`. Tipe sekarang ditulis
  eksplisit.
- **`CMakeLists.txt`: path header Node salah.** CMake menebak
  `app/src/main/libnode/include`, sedangkan README & CI menaruh header di
  `app/libnode/include` → `FATAL_ERROR`. Sekarang path di-supply dari
  `app/build.gradle` lewat `-DLIBNODE_ROOT=…` dan `-DJNI_LIBS_DIR=…`, plus
  pesan error yang nyuruh jalanin script yang bener.
- **`build-apk.yml`: tanda tangan release rusak.** Langkah keystore menulis
  string literal `RELEASE_KEYSTORE_PASSWORD=***` dan `RELEASE_KEY_PASSWORD=***`
  ke `$GITHUB_ENV` — jadi password-nya beneran `***` dan signing selalu gagal.
  Sekarang nilainya diambil dari `secrets`.
- **`build-apk.yml`: `gradle/gradle-build-action@v3`** sudah di-deprecate dan
  nggak punya input `ndk` / `cmake`. Diganti `gradle/actions/setup-gradle@v4`
  + `android-actions/setup-android@v3` dengan daftar package eksplisit.
- **`bot.mjs`: TDZ `bridge`.** `createBridge()` memanggil `log()` yang
  mengakses `bridge` — kalau WebSocket gagal start, error-nya jadi
  `ReferenceError: Cannot access 'bridge' before initialization`.
  Sekarang `bridge` di-`let` + dicek null.

### Ditambahkan

- **Polyfill WebCrypto (`bot-js/polyfills/webcrypto.cjs` + `cli/src/webcrypto.mjs`).**
  Baileys 6.7.x memakai `globalThis.crypto.subtle`, yang **baru ada di Node 19+**.
  nodejs-mobile (runtime di dalam APK) mentok di **Node 18.20.4**, jadi tanpa
  polyfill ini bundle mati saat di-require. Di-inject sebagai esbuild `banner`.
- **`--dry-run` + `qrcode-terminal` di CLI.** Baileys menghapus opsi
  `printQRInTerminal` sejak 6.6, jadi QR setup di Termux sudah nggak muncul.
  Sekarang QR di-render sendiri.
- **Unit test**: 4 test Kotlin (`DurasiTest`) + 9 test Node (`node --test`)
  untuk `parseRepo`, `formatReleasePost`, dan `file bridge`.
- **`util/Durasi.kt`** — `fmtDurasi` dipindah keluar dari `MainActivity` biar
  bisa diuji tanpa Android runtime.
- **`scripts/fetch-nodejs-mobile.sh`** dan **`scripts/build-local.sh`** —
  satu perintah buat build lengkap dari nol, dipakai baik oleh developer
  maupun CI (jadi nggak mungkin lagi beda langkah).
- **4 workflow CI**: `build-apk`, `code-quality`, `codeql`, `security`
  (+ Dependabot). Lihat [docs/CI.md](docs/CI.md).
- **Release otomatis**: push tag `v*` → APK + `sha256` nempel di GitHub Release.
- `versionCode` / `versionName` bisa di-override dari CI
  (`-PversionName=… -PversionCode=…`).
- `.editorconfig`, `.gitleaks.toml`, `SECURITY.md`, `docs/ARCHITECTURE.md`,
  `docs/CI.md`, `docs/SECURITY-AUDIT.md`.

### Diubah

- **Repo digabung jadi satu.** Dulu ada dua folder terpisah
  (`wa-release-bot-app` dan `wa-release-bot`). Sekarang:
  Android di root, engine di `bot-js/`, CLI di `cli/`.
- Debug build dapat `applicationIdSuffix .debug` supaya bisa dipasang
  berdampingan dengan versi release.
- `packagingOptions` → `packaging` (API AGP baru), buang resource META-INF
  yang nggak perlu.
- `ndkVersion` dan `buildToolsVersion` dipatok di `build.gradle` supaya build
  lokal dan CI pakai toolchain yang sama.
- Lint diatur supaya tetap menghasilkan laporan SARIF tapi **nggak** ngeblok build.

### Catatan kompatibilitas

- `engines: node >= 18` di `bot-js/package.json`, tapi Baileys 6.7.24 minta
  `>= 20`. Itu cuma deklarasi — bundle-nya sudah diverifikasi jalan di
  **Node 18.20.4** (bikin QR asli dari server WA). `.npmrc` menyetel
  `engine-strict=false`.
- `libnode.so` dari nodejs-mobile masih **align 4 KB**, jadi belum memenuhi
  syarat halaman 16 KB Android 15+. Ini batasan upstream — lihat
  [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#-batasan-yang-diketahui).

## Internal 1.0.0 — 2026-09-24

Versi awal internal: aplikasi Android (Kotlin + nodejs-mobile + Baileys) dan versi CLI Termux.

[Unreleased]: ../../compare/v1.0.0...HEAD
[1.8.0]: ../../compare/v1.7.0...v1.8.0
[1.7.0]: ../../compare/v1.6.7...v1.7.0
[1.6.7]: ../../compare/v1.6.6...v1.6.7
[1.6.6]: ../../compare/v1.6.5...v1.6.6
[1.6.5]: ../../compare/v1.6.4...v1.6.5
[1.6.4]: ../../compare/v1.6.3...v1.6.4
[1.6.3]: ../../compare/v1.6.2...v1.6.3
[1.6.2]: ../../compare/v1.6.1...v1.6.2
[1.6.1]: ../../compare/v1.6.0...v1.6.1
[1.6.0]: ../../compare/v1.5.0...v1.6.0
[1.5.0]: ../../compare/v1.4.3...v1.5.0
[1.4.3]: ../../compare/v1.4.2...v1.4.3
[1.4.2]: ../../compare/v1.4.1...v1.4.2
[1.4.1]: ../../compare/v1.4.0...v1.4.1
[1.4.0]: ../../compare/v1.3.0...v1.4.0
[1.3.0]: ../../compare/v1.2.1...v1.3.0
[1.2.2]: ../../compare/v1.2.1...v1.2.2
[1.2.1]: ../../compare/v1.2.0...v1.2.1
[1.2.0]: ../../compare/v1.1.4...v1.2.0
[1.1.4]: ../../compare/v1.1.3...v1.1.4
[1.1.3]: ../../compare/v1.1.2...v1.1.3
[1.1.2]: ../../compare/v1.1.1...v1.1.2
[1.1.1]: ../../compare/v1.1.0...v1.1.1
[1.1.0]: ../../compare/v1.0.0...v1.1.0
[1.0.0]: ../../releases/tag/v1.0.0
