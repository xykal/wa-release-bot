# PROGRESS

Start: 2026-09-26 (commit pertama repo)

Catatan: 2026-09-26 sampai 2026-09-28 — tidak ada log di file ini (PROGRESS.md baru dibuat
2026-09-29). Aktivitas hari-hari itu hanya terlihat dari `git log`, tidak direkonstruksi di sini.

## 2026-09-29 — hari kerja ke-1

Done:
- Audit penuh repo: `docs/AUDIT-2026-09-29.md` (0 CRIT, 3 HIGH, 10 MED, 6 LOW).
- Root cause CI `Code quality` merah: SC2086 di step "Ringkasan" `render-v4/v5/v6.yml`. Fix dikutip.
- `PROGRESS.md` dan `IDEAS.md` dibuat.

- kall: "gas semua". Dikerjakan hari yang sama, satu commit besar (lihat CHANGELOG `[Unreleased]`):
  H2 npm workspaces + CLI port; H3 hapus `konten-tiktok/` dan 3 workflow render;
  M1-M2 pin SHA + checksum actionlint; M3 ETag/timeout; M4-M5 `rilis.mjs` + pending anti dobel;
  M6 Worker batas per perangkat/IP (kode saja); M7 network_security_config; M8 brand tunggal;
  L1/L2/L4 dokumen, `formatTanggal` tanpa ICU, file standar (PRD, ROADMAP, CoC, CODEOWNERS, FUNDING).
- Unit test bertambah ~21 (github mock fetch, rilis, kirimKeChannel, mdKeWa, potongAman, brand, tanggal).
- kall: "gas aja" (ronde 2). Deploy Worker lagu pakai token Cloudflare kall: ketemu URL default
  salah subdomain (NXDOMAIN) -> fitur lagu mati sejak v1.6.0, diperbaiki + cek DNS di CI. Batas
  harian KV terbukti bocor saat burst (13 request, counter cuma 7) -> tambah lapis Rate Limiting
  binding; proving test `scripts-dev/cek-batas-worker.sh` lolos. Tes integrasi CLI (5 skenario).
  History `konten-tiktok` dihapus (filter-branch, force-push; tag v1.6.7 ke bawah tidak berubah).

- kall: "boleh juga" + minta semua update lewat PR dulu. Branch `feat/lapor-gagal-jatah-lagu`:
  lapor ke chat diri sendiri saat percobaan ke-3 gagal (app + CLI), jatah lagu harian tampil di
  app, `/lagu/batas` tanpa token burst kecuali `?uji=1` (Worker di-deploy ulang, proving test lolos).
- kall: "boleh semua" (notifikasi Android 3x gagal, M10 pecah modul, M9 i18n disetujui) + minta
  kata-kata channel lebih bagus, fix post "Pertanyaan", caption lagu lebih gacor, lagu lebih banyak.
  Dikerjakan di PR #10 (commit lanjutan): post rilis ditulis ulang + lampiran file, caption lagu,
  5 gaya caption baru, ayat 20 → 42 (equran.id), lagu 48 → 148, perekam channel `npm run rekam`.
  "Pertanyaan": format aslinya tidak diketahui (bukan bug kode yang bisa dibuktikan dari sini) →
  default dibalik ke teks, pertanyaan opt-in eksperimental, butuh rekaman dari HP kall.

Blocked:
- Tes di HP asli (APK v1.7.0) dan CLI di Termux: belum ada; kall memutuskan rilis dulu ("merge").
- Format "Pertanyaan": butuh `rekaman-channel.json` dari kall (post Pertanyaan manual di HP).

Next:
- Disetujui, belum dikerjakan: notifikasi Android saat 3x gagal (S), M10 pecah
  `bot.mjs`/`cli.mjs`/`MainActivity.kt` (M), M9 i18n `values-en` (M). PR terpisah setelah #10.
- kall: "merge". PR #10 di-merge ke main (`8ff5ba3`). Bump 1.6.7 → 1.7.0 (gradle versionCode 24,
  3 package.json + lockfile, CHANGELOG [1.7.0]) lewat PR `chore/rilis-1.7.0`, lalu tag `v1.7.0`
  → job `release` build-apk.yml bikin GitHub Release otomatis. Belum ada tes di HP asli.
- Konten: repo `wa-release-bot-konten` Eps 2 (render di Actions) v1 → v4: aset asli app, stiker +
  SFX meme (unduh saat render, sha256, tidak di-commit), hook spam jam 02.00 (judol disamarkan),
  2 scene teknis (stack + siklus 15 menit), subtitle gaya CapCut. Durasi 2:30, menunggu review kall.
- kall: "gas aja semua" + minta multi repo; tanya "Pertanyaan" sudah fix? (belum — masih butuh
  `rekaman-channel.json`). PR `feat/multi-repo`: `repo.mjs` (daftar repo + state per repo + migrasi),
  bot.mjs/cli.mjs cek semua repo berurutan, notifikasi Android 3x gagal (BotService), versionCode
  dari tag di CI, tes unit + integrasi CLI baru. Belum: M10 pecah modul, M9 i18n, Eps 2 versi pendek.
- kall: "merge final semua, rilis versi terbaru, hapus release lama sisakan terbaru + stable"
  (dipilih: stable = v1.7.0; release + tag lama dihapus). PR #12 di-merge, bump 1.8.0 (versionCode
  default 10800 ikut rumus CI), tag `v1.8.0` -> release otomatis. Eps 2 potongan pendek 1:13 jadi.
- kall: minta layar Repo sendiri di app (PR terpisah), landing page + halaman unduh dengan popup
  hitung mundur launching (Jumat 2026-10-09 19.00 WIB, versi publik 1.0.0), release jadi draft
  supaya tidak bisa diunduh publik, hosting Cloudflare. Dikerjakan: v1.7.0/v1.8.0 -> draft,
  73 artifact Actions dihapus, `web/` (statis, id/en, CSP ketat, font Archivo subset) tayang di
  Workers Static Assets lewat `scripts-dev/deploy_web.py`, workflow `deploy-web.yml`, rencana
  launching di ROADMAP. kall: logo web harus logo asli app (bulan sabit) -> diganti; domain
  `wabot.projectkal.my.id` dipasang (workers/domains). Belum: layar Repo, M10, M9, PR launching 1.0.0.
- kall: "gas kejar waktu", web wajib responsif semua layar, README bersih tanpa emoji, cek stars,
  screenshot app asli di web. Dikerjakan: QA Chromium 14 layar (bug: HP hero/cara keluar layar di
  HP kecil dan 1024 px, modal terpotong di landscape, nav 320 px) -> diperbaiki + job CI `tangkapan`;
  emoji dihapus dari 11 dokumen + cek CI; `bingkai_screenshot.py` siap terima screenshot asli.
  Stars: API GitHub bilang 0 stargazer di wa-release-bot (XyDownloader dan AppPerms masing-masing 1).
- kall: "selesaikan semua trus merge". PR #14 (web) di-merge. Dikerjakan hari yang sama: PR #16
  layar Repo + channel per repo (engine, CLI, app, tes) di-merge; PR #17 README 580 -> 271 baris
  (detail ke docs/PANDUAN-APP, BUILD, TROUBLESHOOTING) di-merge; PR #15 screenshot emulator di
  Actions (3 kali gagal: grep+pipefail, layar sambutan, run-as di build release -> adb root) lalu
  galeri situs memakai tangkapan asli. Belum: PR launching 1.0.0 (draft), M10, M9, Eps 2 logo.
- kall: "gas" rencana H-1; video Eps 2 versi lengkap (sampai 10 menit) ditunda setelah launching;
  tanya kenapa M10/M9 tidak sebelum launching -> jawab: bisa, penundaan cuma soal risiko. M10 bagian
  engine dikerjakan: `bot.mjs` -> `src/mesin/*` + uji ujung-ke-ujung engine (GitHub palsu).
  Belum: pecah `MainActivity.kt`, M9 i18n, PR launching (draft).
- kall: "gas aja". `MainActivity.kt` 1285 -> 507 baris + 7 file kecil (form, panel status, dialog
  tautan, lembar hitam, aksi sistem, splash, komponen lembar). Verifikasi: compile CI + workflow
  Screenshot app di branch sebagai smoke test UI. Belum: M9 i18n, PR launching (draft).
- M9 i18n tahap 1: layar utama app dua bahasa (75 literal layout + 126 literal Kotlin ke
  `strings.xml` + `values-en`), dipindah oleh `scripts-dev/i18n_layout.py` dan `i18n_kotlin.py`
  supaya layar lain bisa menyusul. Belum: Onboarding/Repo/Hosting, PR launching (draft).
- kall: "gas semua dah". M9 i18n tahap 2: Onboarding, Repo, Hosting, notifikasi service
  (84 entri lagi, total 274) - seluruh UI app dua bahasa. Lalu gambar sandingan id/en di
  README dan galeri situs versi English dari screenshot en-US (tukar `src` per bahasa).

## 2026-09-30 — hari kerja ke-2

- Sisa 2026-09-29 malam: PR #24 PITCH, #25 uji engine dua repo, #26 `docs/JNI.md` + title/meta
  situs ikut bahasa, #27 `deploy_web.py` berhenti di GET domain (token CF cukup Workers Scripts:
  Edit). Deploy situs masih manual: token scoped belum dibuat kall.
- kall: HP-nya armeabi-v7a, artefak push/PR cuma arm64. Sebab: set ABI push/PR dibatasi arm64 demi
  waktu CI; v7a hanya dari tag/dispatch. PR #28: push `main` bangun arm64 + v7a; APK v7a dikirim
  lewat artefak run 36657756843.
- kall: launching dimajukan ke Minggu 2026-10-04 19.00 WIB (dari Jumat 2026-10-09). Diubah:
  `LAUNCH_ISO`, popup, `.ics`, ROADMAP (jadwal hari H), CHANGELOG 1.0.0 di branch launching.
  Belum: token CF scoped, uji APK v7a di HP kall, ulasan `values-en` penutur asli, remake Eps 2.
- kall uji APK v7a: kotak isian layar Repo tidak bisa disentuh (EditText dari kode kehilangan
  focusableInTouchMode) dan layar melompat ke log tiap ada baris baru (fullScroll menarik fokus)
  -> PR #30 + langkah uji ketik di workflow Screenshot app. Permintaan baru buat 1.0.0: bottom
  navbar + pecah layar, splash lebih epik + voice over "XyVerse Technology Global" (sekali
  setelah pasang, ada toggle), fitur bot WA umum (stiker dari foto, moderasi anti-phishing/promo
  kecuali admin, posting story HD + tag grup), peringatan spek HP. Launching diundur ke Minggu
  2026-10-11 19.00 WIB supaya semua masuk 1.0.0 (PR #31).

- M11 (permintaan kall: "mending pakai bottom navbar, bagi jadi beberapa screen"): layar utama
  dipecah lima tab lewat bar navigasi bawah - Beranda, Repo, Fitur, Log, Pengaturan. Baru:
  `NavBawah.kt`, gaya `NavItem`/`NavIkon`/`NavTeks`, drawable `bg_nav_item`/`bg_nav_aktif` dan
  `ic_beranda`/`ic_fitur`, color-state `nav_warna`, 5 string `u_nav_*` (id + en). Isi kartu
  tidak disentuh, cuma dipindah ke wadah tab (8 kartu, sama seperti sebelumnya). Ikutan:
  di tab Log bar Simpan disembunyiin, log cuma digulir otomatis kalau tab-nya kelihatan
  (`PanelStatus.lompatKeBawah`), tab terakhir disimpan di `savedInstanceState`, tombol yang
  butuh kolom di tab lain pindah tab dulu. Bukti CI: langkah "uji navbar" di
  `scripts-dev/screenshot_emulator.sh` - item navLog wajib `selected="true"` dan bar Simpan
  wajib hilang di tab Log, plus jepretan per tab lewat bar navigasi.

- M12 (permintaan kall: "splash screen bisa revisi lebih bagus, animasi super keren epic efek
  smooth" + "sebutin made XyVerse voice over yang serem"): splash baru dengan latar `PartikelView.kt`
  (cahaya hijau berdenyut, cincin melebar, 56 bintang berkedip, 3 bintang jatuh, semua digambar
  di Canvas - tanpa library baru), logo masuk mantul (scale 0,68 -> 1 + rotasi -8 derajat),
  gelembung chat naik dari bawah, dan brand di bawah dengan letterSpacing yang merenggang pelan.
  Voice over "XyVerse Technology Global" dari `res/raw/vo_xyverse.ogg` (2,6 dtk, dibuat dengan
  alat suara di sesi ini - lisensi TTS komersial masih perlu dicek kall): bunyi sekali setelah
  pasang, bendera `voSudahMain` dipasang hanya kalau suaranya benar-benar mulai, mode senyap
  dihormati, saklar di kartu baru "Tampilan & suara" (tab Pengaturan); nyalain saklarnya lagi
  mengosongkan bendera jadi bunyi sekali lagi. Bukti CI: jepretan `splash.png` di detik pertama
  plus assert overlay splash + blok brand di dump UI.

- kall: "setiap update selalu hapus jejak, hapus artifact, bersihkan cache - di actions 7 GB"
  + "di release aja, tapi draft (cuma gua yang bisa unduh dan lihat)". Dikerjakan:
  `scripts-dev/bersihkan_actions.py` + workflow `bersihkan.yml` (harian 03.00 WIB, tiap build
  main selesai, manual; mode `--kering`) buat riwayat run/artifact/cache; retention artifact
  dipendekkan (APK 1 hari, engine/lint 2, r8 3, web/screenshot 2); APK hasil build main
  dipindah dari artifact ke draft release `internal-<versi>` lewat `scripts-dev/rilis_internal.py`
  + job `release-internal` (aset diganti tiap build, draft internal lain dibuang). Dokumen:
  docs/CI.md bagian 7 dan 8.

- M13 (permintaan kall: "tambah fitur lebih banyak ... tapi tetep ada peringatan sesuai hp spek dll").
  Kartu Cek perangkat di tab Pengaturan (`Perangkat.kt`): RAM total/sisa, arsitektur, versi Android,
  penyimpanan bebas, optimasi batre, izin notifikasi, jumlah ABI; peringatan (bukan blokir) kalau
  RAM < 2 GB / Android < 8 / sisa < 300 MB / batre belum dikecualikan / notifikasi belum diizinkan /
  bukan ARM. Tombol "Ke log" nulis hasilnya ke log, dan HP pas-pasan (RAM < 2 GB) otomatis pakai
  partikel splash lebih hemat (PartikelView.aturKepadatan) + kirim ringkasan ke engine (cmd
  `perangkat`) buat nyetel strategi fitur berat.

- M14 + M15 (permintaan kall: "langsung lanjutin semua bre tumpuk di PR ntar tinggal sekalian
  merge semua beres"). Semua fitur bot WA umum dikerjakan di satu branch yang sama:
  - Logika keputusan moderasi dipisah ke `bot-js/src/pesan.mjs` (murni, tanpa jaringan): link
    Telegram, domain di luar daftar izin, kata judi/pinjol/promo, admin & bot sendiri dilewatkan,
    plus `hukumanModerasi()` (peringatan dulu, strike terakhir dikeluarkan). Diuji 11 kasus di
    `bot-js/test/pesan.test.mjs`.
  - `bot-js/src/mesin/jaga-pesan.mjs`: koneksi WA dibiarkan terbuka selama fitur nyala (beda
    dengan penjaga grup yang nyambung tiap beberapa menit), perintah chat pribadi dilayani di
    chat sendiri saja, moderasi grup cuma di grup yang dipantau dan cuma kalau bot admin
    (hapus pesan gagal dilaporkan sekali, bukan diam-diam). Kalau WA belum ditautkan, loop
    berhenti sendiri dengan pesan jelas — bukan nyoba terus.
  - Stiker: `app/src/main/java/com/xykals/warelease/Stiker.kt` (Bitmap -> WebP_LOSSY, sisi
    terpanjang 512 px, mutu diturunkan bertahap sampai < 700 KB). Engine kirim event
    `minta_stiker`, BotService balas cmd `stiker-jadi`.
  - App: kartu Bot WA umum (saklar moderasi, saklar perintah pribadi, izin link biasa, batas
    strike, kata tambahan, domain phishing, nomor penonton story, tombol kirim menu + kosongin
    hitungan) + baris statistik moderasi di kartu status; 24 string baru dua bahasa (316 total,
    jumlah sama di `values` dan `values-en`).
  - Bukti CI: langkah `uji bot-umum` di `screenshot_emulator.sh` (kartu + kolom story ada di dump
    UI, saklar berubah jadi nyala, tombol kirim menu ngasih umpan balik, dan nilainya masih
    tersimpan setelah app dimatikan + dibuka ulang), plus cek `configure`/`perangkat`/
    `bersih-moderasi` di `bot-js/test/engine.test.mjs`.

- Ketahuan satu cacat "tanpa jejak" yang sebelumnya dilaporkan aman: ternyata **dua** draft
  `Build internal 1.8.0` menumpuk. Sebabnya `tag_name` draft berubah jadi `untagged-<hash>` begitu
  draft lain memakai tag itu, jadi pencarian berbasis tag meleset dan tiap build bikin draft baru
  (draft lama masih nyimpen APK basi). Dibereskan: draft basi (399915190) dihapus, skrip dicocokkan
  lewat nama `Build internal <versi>`, pembersihan duplikat lewat `id`, dan resep/pelajaran itu
  ditulis di docs/CI.md. Klaim "VERIFIED" di laporan sebelumnya soal isi draft internal terlalu
  percaya pada pencarian tag — sekarang pembuktiannya lewat daftar release + hitungan draft.

- Permintaan kall (2026-10-01): hapus bukti di workspace (sudah: folder `bukti/` dibuang),
  tombol Simpan cuma muncul kalau ada perubahan, tambah fitur pesan berkala ke grup (mis. daftar
  hitam), dan kunci siapa yang bisa menjalankan Actions tanpa bikin repo privat.
  - Tombol Simpan: `FormPengaturan.pantauPerubahan()` mantau semua EditText + saklar;
    `NavBawah` nyembunyiin bar-nya sampai ada perubahan, dan `onSave()` yang sukses
    ngebersihin bendera. Dijaga dari salah tandai: pemantauan dipasang SETELAH `muat()`,
    jadi isian awal dari prefs bukan dianggap perubahan.
  - Pesan berkala: `bot-js/src/berkala.mjs` (murni: jatuh tempo + susun teks daftar hitam) +
    `bot-js/src/mesin/pesan-berkala.mjs` (sambung sekali per kirim, bukan socket nyala terus).
    Kartu baru di tab Fitur: saklar, interval jam, teks opsional, tombol Kirim sekarang.
    Validasi: berkala butuh Penjaga grup nyala (tanpa grup nggak ada tujuan kirim).
  - Actions: setelan repo diubah lewat API (bukan cuma dokumen) — izin default workflow jadi
    read-only, approve-PR lewat token dimatikan, PR fork wajib disetujui manual, action wajib
    dipin ke SHA, dan `main` wajib PR tanpa force push. Job `bersihkan` nolak `workflow_run`
    dari fork. Yang TIDAK bisa ditutup di repo publik: log run tetap bisa dibaca siapa aja —
    itu sebabnya tetap dibersihkan berkala dan nggak ada secret di dalamnya.
  - Skrip uji UI dirapikan: fungsi bantu adb pindah ke `scripts-dev/ui-uji.sh`, uji kartu Fitur
    pindah ke `scripts-dev/uji-fitur.sh` (skrip utama balik ke ~200 baris).
  - Hitungan string dipastikan: 328 nama di `values` dan `values-en`, jumlahnya sama (angka 307
    di catatan M14/M15 meleset; isi commit blok itu sebenarnya 316).
  - CHANGELOG: dua heading `Diperbaiki` dalam satu blok dan satu butir Lockfile yang ketempelan
    ekor butir situs (sisa merge lama) dibetulkan lewat PR #40; branch rilis disinkronkan lagi
    ke main (`94bd71a`), semua cek hijau termasuk APK dan CodeQL.

## 2026-10-01 — hari kerja ke-3

- Permintaan kall: rekam log internal langsung dari APK, unduh log, dan sediakan tombol salin.
  `LogRecorder` sudah merekam `app.log`/`mesin.log` otomatis dan `logcat.log` (opsional), tapi
  kontrolnya tersembunyi di Pengaturan; unduh ZIP dan salin dari tab Log belum ada.
  - PR menambahkan saklar rekam detail (logcat Android/Node), **Salin tampilan**, dan
    **Unduh semua log** lewat pemilih lokasi Android. Ekspor memasukkan app, mesin, logcat,
    crash, serta file rotasi ke ZIP tanpa izin penyimpanan.
  - README, panduan app, dan troubleshooting diperbarui. Uji emulator memastikan saklar berubah,
    tombol salin memberi feedback, dan tombol unduh membuka pemilih dokumen.
- Log uji kall dari HP (22:31–22:47): tombol Kirim menu berhasil (`Menu dikirim ke chat sendiri`) dan pesan berkala berhasil dikirim ke grup dengan daftar 20 nomor. Log juga menunjukkan socket jaga berulang kali tutup dengan code 440 / `Connection Closed`, lalu reconnect; ini belum aman untuk dipakai lama.
  - Akar yang cocok dengan urutan log: tugas WA singkat seperti cek grup/pesan berkala membuka socket login kedua memakai sesi yang sama sementara socket jaga masih hidup. Penjaga grup memang menjaga satu socket terus; antrian `pakaiWA` sebelumnya tidak mencakup koneksi persisten itu.
  - Perbaikan: `sambung()` kini meminjam socket mode jaga untuk tugas singkat dan tidak menutupnya; kalau mode jaga sedang reconnect, tugas menunggu sampai socket siap (batas 30 dtk). Loop jaga sendiri melewati jalur pinjam supaya tidak menunggu dirinya sendiri. Kalau mode jaga mati, pola koneksi sekali pakai tetap berlaku.
  - Empat uji baru memeriksa peminjaman socket (close tidak mematikan sesi persisten), menunggu socket saat reconnect, mode jaga mati, dan fallback ke koneksi sementara. Syntax check + 4/4 uji lokal lulus; bukti final menunggu CI Actions.
  - Bukan bukti bahwa error `Timed Out` / unhandled rejection dari Baileys semuanya hilang; perlu kall coba APK setelah CI hijau, terutama biarkan mode jaga + cek grup + pesan berkala jalan bersamaan.
- Pertanyaan kall: "rekaman channel tu kek mana?" dan "story HD tanpa kompres pastikan untuk
  pribadi di chat sendiri, bukan di grup". Dua-duanya dijawab di kode, bukan cuma diomongin.
- Story: penonton dipindah ke modul murni `bot-js/src/story.mjs` (+6 uji) supaya aturannya
  kelihatan dan nggak bisa "nyasar" lewat jalur lain:
  - `.story` = cuma nomor di kolom **Nomor penonton story** app.
  - `.storygrup` = nomor itu + anggota grup, dan HANYA kalau Penjaga grup nyala; kalau
    penjaganya mati perintahnya turun jadi `.story` (dulu tetap nembak anggota grup yang
    tersimpan di state walau penjaganya nggak jalan — itu yang bikin kesan "kok ke grup").
  - Bot selalu balas jumlah penontonnya secara terbuka: berapa pribadi, berapa dari grup.
  - Media tetap dikirim byte aslinya (tanpa re-encode). Diverifikasi di sumber Baileys
    6.7.24: `prepareWAMessageMedia` cuma bikin thumbnail kecil (`jpegThumbnail`) dan
    mengunggah `uploadData.media` apa adanya — jadi klaim HD tanpa kompres itu benar di sisi
    library; kompresi (kalau ada) cuma dari WhatsApp waktu dibuka.
- Rekam channel (buat fitur WA yang belum didukung Baileys, mis. Pertanyaan di channel).
  Catatan penting: perekamnya SUDAH ada sejak commit `e5fc229` — tapi cuma lewat CLI
  (`npm run rekam -- --tunggu 120`, didokumentasikan di `cli/README.md`), jadi kall harus
  buka komputer/Termux dulu. Itu sebabnya pertanyaannya "kek mana": alatnya ada, jalannya
  nggak kelihatan dari app. Sekarang dua-duanya ada, dan modul lama tetap utuh supaya CLI +
  uji unit-nya nggak rusak (rencananya sempat ketimpa; dicek ulang lewat git status sebelum commit):
  - Modul baru `bot-js/src/rekam-mentah.mjs` (murni, +7 uji): pilih stanza `CB:notification` bertipe
    newsletter yang benar-benar postingan (`<message>` + `<plaintext>`), simpan BYTE MENTAH
    base64. Sengaja byte mentah: proto 6.7.24 cuma tahu pembungkusnya
    (`Message.questionMessage` = FutureProofMessage), field isinya dibuang saat decode —
    hasil decode bakal kosong dan nggak ada gunanya.
  - `bot-js/src/mesin/rekam-channel.mjs`: hook `sock.ws.on('CB:notification')` di mode jaga
    (jalur yang sama dipakai Baileys buat notifikasi newsletter; kita cuma nebeng baca).
    File `rekaman-channel.json` di folder data app: maksimal 10 postingan / 8 MB.
  - Perintah baru `.rekam on | off | kirim | kosong` — `.rekam kirim` menaruh file JSON-nya
    ke chat sendiri (dokumen) supaya bisa diteruskan ke developer. Nggak ada pengiriman
    otomatis ke mana pun.
  - `susunEntri` di perekam CLI lama ikut menyimpan byte mentah (di bawah 256 KB) supaya
    hasil `npm run rekam` pun nggak kehilangan field yang belum dikenal.
  - Butuh **Perintah pribadi** nyala (koneksinya nebeng mode jaga) — ditulis di
    `docs/PANDUAN-BOT-WA.md`.
- Uji murni lokal: story 6/6, rekam 7/7, pesan 11/11, berkala 7/7. Engine & unit tetap
  CI-only (butuh `node_modules`; `unit.test.mjs` gugur lokal karena Baileys nggak ada).

- Laporan kall (2026-10-01): "menu/rekam mesti respon cepat" dan "pesan berkala daftar hitam
  nya rusak".
  - Yang rusak memang nyata dan ketemu dari mencetak isi pesannya sendiri: nomor manual
    ditampilkan mentah (`0812-3456-7890`, `+62 813 1111 2222`), ada baris sampah (`abc`), dan
    satu orang muncul dua kali sementara hitungannya "6 orang" padahal 3. Dirapikan di
    `bot-js/src/berkala.mjs` (`susunDaftarHitam` + normalisasi `nomor.mjs`): duplikat digabung,
    sampah dibuang, urutan nomor kecil dulu, daftar panjang diringkas, hitungan = jumlah orang.
  - Akar masalah kedua: format waktu pakai `toLocaleString('id-ID')`, dan Node di APK
    (nodejs-mobile) ber-ICU kecil → hasilnya format Amerika. Diganti `bot-js/src/waktu.mjs`
    (murni, tanpa ICU): "1 Okt 2026, 19.06 WIB".
  - Kecepatan: jalur perintah dan moderasi dipisah di `mesin/jaga-pesan.mjs` (perintah dijawab
    langsung, moderasi tetap urut di antreannya sendiri), dan versi protokol WA di-cache 6 jam
    (`versiWA()` di `wa.mjs`) supaya kiriman terjadwal nggak minta versi tiap nyambung.
  - Perintah baru `.berkala` (lihat) dan `.berkala kirim` (kirim lewat socket mode jaga) —
    dipakai buat cek tampilan pesan tanpa nunggu 12 jam, dan tanpa bikin koneksi kedua.
  - Uji murni: berkala 11/11, pesan 11/11, story 6/6, rekam-mentah 7/7.

- Laporan kall (2026-10-01, lanjutan): "udah kirim menu ke nomor sendiri, kok nggak ada balasan"
  dan "pesan berkala bisa nggak cuma daftar hitam".
  - Menu nggak ada balasan: tombol di app cuma jalan kalau mode jaga sedang nyala, dan
    kegagalannya cuma nulis satu baris di tab Log — app malah ngeklaim "menu dikirim". Sekarang
    tombolnya ada jalur cadangan (koneksi sekali pakai lewat `pakaiWA`, sama seperti pesan
    berkala), hasilnya balik ke app lewat bridge event `banner` dan tampil di layar. Selain itu
    `jawab()` nggak lagi diem kalau JID akun sendiri nggak kebaca, dan perintah yang datang
    waktu saklar "Perintah pribadi" mati dijawab sekali (jeda 10 menit) biar kasus "kok nggak
    ada balasan" nggak berulang.
  - Pesan berkala cuma daftar hitam: saklar baru **Selalu kirim daftar hitam** (`berkala.hitamSaja`),
    keputusan isi di `pilihIsi()` (murni, ada uji); teks di kolom pesan diabaikan kalau nyala,
    dan `.berkala` nunjukin mode yang aktif.
  - Kalau ternyata akarnya tetap "engine belum jalan" atau "WA belum ditautkan", teks banner-nya
    nyebut itu langsung (bukan "gagal" doang).
  - String app: 330 nama di `values` dan `values-en` (2 baru buat saklar, 1 teks lama diperbaiki
    isinya, bukan ditambah).
  - Ketahuan satu kesalahan sendiri di putaran ini: komentar baru berisi spasi zero-width
    (U+200B), ditolak `no-irregular-whitespace` di job Lint Node 22. Lokal nggak ketahuan karena
    eslint nggak dipasang; sekarang ada pemeriksa kecil buat spasi tak wajar sebelum commit.
  - Catatan proses: job emulator dulu cuma dipicu perubahan `screenshot-app.yml` dan
    `screenshot_emulator.sh`; `uji-fitur.sh` (isi ujinya sendiri) nggak masuk daftar. Sekarang
    keempatnya masuk, jadi klaim "uji UI hijau" nggak bisa lewat tanpa benar-benar jalan.
  - Job emulator nyala (predikat path sudah benar) tapi gagal di langkah pertama: `uiautomator
    dump` nggak jadi nulis `/sdcard/ui.xml` (sebelumnya kelihatan emulator sempat "device
    offline" waktu boot) dan skrip mati dengan `cat: ... No such file or directory`. Skrip uji
    UI sekarang nyoba 3x + pesan jelas; dijalankan lagi buat lihat hasil aslinya.
  - Job emulator kedua (5bc4fb7) maju jauh — semua uji Simpan, kartu Bot WA umum, berkala
    (termasuk baris baru "Selalu kirim daftar hitam" + persist) hijau — lalu gagal di uji tombol
    menu: "tombol kirim menu tidak ketemu". Setelah jepretan kegagalannya diperiksa: layarnya
    sudah di bawah kartu Lagu mood, artinya `gulir_ke` menggulir ke arah yang salah. Sebabnya
    pola sed `posisi_atas` cuma menerima angka positif, jadi elemen yang ada di ATAS layar
    (koordinat negatif) dianggap tidak ada → terus digulir ke bawah. Diperbaiki: regex menerima
    negatif dan `gulir_ke` sekarang dua arah (dites di lokal pakai contoh dump positif/negatif).

- Kejadian penting (2026-10-01): build `main` untuk rilis #44 **gagal** di job "Draft release
  internal" (`Found 0 artifact(s)` → `ls: cannot access 'dist/'`). Sebabnya bukan kodenya:
  sapuan jejak Actions yang saya jalanin (`HARI_ARTIFACT=0`) keburu menghapus artifact APK run
  yang masih berjalan, jadi draft-nya nggak bisa update. Konsekuensinya APK di draft internal
  masih build lama.
  - Penjaga baru: `bersihkan_actions.py` melewati artifact milik `SIMPAN_RUN` run termuda
    (diuji `--kering`), job draft mencoba unduh 2x + pesan gagal yang menyebut sebabnya, dan
    `release-internal` bisa dipanggil `workflow_dispatch` di `main` buat nyegarkan draft basi.
  - Dijalankan ulang lewat workflow_dispatch setelah perubahan ini, terus draft dicek asetnya.
- Laporan kall: perintah `.menu` dan `.rekam on` di chat sendiri tidak diproses; pertanyaan
  channel tidak masuk rekaman. Akar di source: dispatch membandingkan remote JID persis dengan
  JID PN sendiri, jadi alias LID bisa lolos tanpa diproses. Bukti runtime belum punya nilai JID
  masuk, jadi mismatch ini cocok dengan laporan tetapi belum dikonfirmasi dari HP.
  - PR #48 mencocokkan identitas PN/LID, membalas ke alias chat asal, dan mencatat saat perintah
    ber-prefix diterima. Perekam menulis alasan bila postingan newsletter dengan payload pesan
    tidak bisa disimpan; tes recorder mencakup `questionMessage`, mode aktif/mati, dan payload
    tanpa plaintext.
  - PR #48 lulus semua 18 check di Actions dan digabung sebagai `0ddb2cf`. Run verifikasi:
    `https://github.com/xykal/wa-release-bot/actions/runs/36893404950`.
  - Build `main` untuk merge commit lulus: `https://github.com/xykal/wa-release-bot/actions/runs/36894020207`.
    Draft internal `399924120` diperbarui 2026-10-01 16:47 UTC dengan APK arm64 + armeabi-v7a.
  - Masih perlu uji kall di HP. Bila pesan channel tetap tak tercatat, log baru membedakan payload
    yang dilewatkan dari event newsletter yang sama sekali tidak sampai ke hook.
- Log kall setelah merge #51 (02:47–03:02): mode jaga tersambung dan `.rekam on` sukses, tetapi
  tidak ada log tersimpan/dilewatkan setelah posting Pertanyaan. Source Baileys 6.7.24 juga
  menerima posting channel sebagai node `CB:message` langsung; recorder lama cuma memasang
  `CB:notification` dan parser hanya menerima bentuk bersarang. PR #52 menambah penangkapan
  kedua bentuk dengan uji regresi; 18/18 checks PR dan 19/19 checks main lulus. Log HP berikutnya
  membuktikan satu posting tersimpan, tetapi file yang dikirim lewat WA tampil sebagai "waiting
  for this message" di chat kall. Status log `dikirim` hanya menunjukkan Baileys menerima kiriman,
  bukan bukti HP berhasil mendekripsinya.
- Permintaan kall: simpan rekaman otomatis di `Android/media/<applicationId>/rekaman` agar tidak
  bergantung pada kirim dokumen ke chat sendiri. PR #53 (merge `7570f89`) menyalin atomik setiap
  perubahan dari salinan internal app ke `getExternalMediaDirs()/rekaman`; `.rekam kirim`
  menunjukkan path lokal. Tes engine/Kotlin dan 18/18 PR checks lulus; main lulus 19/19, draft APK
  arm64 + v7a diperbarui dan checksum cocok. Uji di HP setelah APK itu masih dibutuhkan.
- Laporan kall: balasan teks di chat sendiri menampilkan "Waiting for this message". PR #54
  merutekan self-chat ke PN kanonis, menguji `.menu` masuk via LID + tombol panel, mengunci path
  file stiker, dan menambah tes traversal/tempfile aman. CI PR 18/18 hijau, CodeQL tanpa alert baru;
  merge `d2307a8`, APK draft diperbarui. Kall memastikan screenshot sesudah update masih menunjukkan
  warning; jadi routing PN belum membuktikan/fikskan dekripsi, akar sesi/E2EE masih terbuka.
  JSON rekaman kall (2026-10-01 19:24:58Z) menunjukkan payload 24 byte, outer `type=text`, proto
  field 101 `questionMessage`; JID disamarkan di tes golden baru yang sedang disiapkan di branch.


## 2026-10-02 — hari kerja ke-4

Done:
- Konfirmasi 4/4 post-merge Actions PR #55 sukses (Code quality, CodeQL, Security, Build APK).
- Branch `feat/sukibot-brat-welcome`: `.brat` Android Canvas WebP, `.welcome` opt-in terbatas grup pantauan, tagline `SukiBot`, menu berkelompok; tambah tes regresi dan audit 2026-10-02.
- `.storygrup` sekarang fail-closed karena `statusJidList` bukan native group mention; docs dan roadmap dikoreksi.

Verified via GitHub Actions pada PR #56, commit `47e0e8bf5c8d90204173731fb19f11a20dd45e25`:
- Code quality: https://github.com/xykal/wa-release-bot/actions/runs/36995381626
- CodeQL: https://github.com/xykal/wa-release-bot/actions/runs/36995381595
- Security: https://github.com/xykal/wa-release-bot/actions/runs/36995381596
- Build APK (termasuk testDebugUnitTest): https://github.com/xykal/wa-release-bot/actions/runs/36995381657

Belum diverifikasi:
- Kualitas Status setelah upload WhatsApp dan self-chat “Waiting for this message” tetap perlu uji perangkat nyata.
- PR belum di-merge; APK/artifact PR sengaja dipertahankan untuk uji kall.

Next:
- Tunggu review/keputusan merge kall; jangan merge otomatis meski Actions hijau.
- Audit terpisah untuk port Node 22 dan kompatibilitas native Status group mention; runtime tetap v18.20.4.
