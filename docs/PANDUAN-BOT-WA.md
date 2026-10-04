# Panduan fitur WhatsApp (bot umum)

Pelengkap [PANDUAN-APP.md](PANDUAN-APP.md): halaman ini isinya fitur yang jalan di
sisi WhatsApp — moderasi grup, perintah pribadi di chat sendiri, stiker, story,
dan pesan berkala. Kartu-kartunya ada di tab **Fitur** app.

## Daftar isi

- [Bot WA umum (moderasi + perintah di chat sendiri)](#bot-wa-umum-moderasi--perintah-di-chat-sendiri)
- [Pesan berkala ke grup](#pesan-berkala-ke-grup)
- [Pesan perpisahan (yang keluar grup)](#pesan-perpisahan-yang-keluar-grup)
- [Batre & koneksi](#batre--koneksi)

## Bot WA umum (moderasi + perintah di chat sendiri)

Bagian ini berstatus **eksperimental** dan bukan janji stabil jalur release.
Kartu **Bot WA umum** di tab Fitur punya dua saklar. Dua-duanya bikin WhatsApp
**tetap tersambung** selama engine jalan — beda dari fitur inti yang cuma
nyambung sebentar saat mengirim. Moderasi dan perintah pribadi sama-sama
**mati pada instalasi baru** dan harus dinyalakan secara sadar.

**Perintah pribadi** (cuma jalan di **chat diri sendiri** — bukan di grup):
kirim `.menu` buat lihat daftarnya. Yang ada sekarang:

| Perintah | Gunanya |
|---|---|
| `.menu` / `.bantu` | daftar perintah |
| `.ping` | cek bot hidup |
| `.status` | repo, rilis terakhir, penjaga grup, hitungan moderasi |
| `.brat <teks>` | render stiker teks gaya Brat lokal di Android, lalu kirim ke chat sendiri |
| `.stiker` | kirim/rebalas **foto** dengan keterangan `.stiker` → jadi stiker WA |
| `.story` | kirim/rebalas **foto/video** dengan keterangan `.story` → unggah byte media asli (WhatsApp tetap dapat mengubah kualitas) |
| `.storygrup` | nonaktif sementara; native mention grup di Status belum didukung runtime terpasang |
| `.welcome on/off` | opt-in sambutan anggota baru, hanya untuk grup yang dipantau |
| `.rekam` | rekam postingan channel: `on`, `off`, `kirim`, `kosong` |
| `.grup` | info grup yang dipantau: nama, jumlah anggota, daftar hitam |
| `.bersih` | kosongkan hitungan moderasi hari ini |

Stiker diproses di HP: WhatsApp cuma nerima stiker **WebP**, sementara mesin Node
di dalam app nggak punya encoder WebP. Jadi fotonya dititipkan lewat berkas di
folder data app, dikecilkan ke 512 px dan dikompres di `Stiker.kt`, baru balik
jadi stiker. Foto besar/format aneh otomatis diturunkan mutunya; kalau tetap
nggak kebaca, bot balas pesan gagal (nggak diem-dieman). Karena butuh Android,
`.stiker` di CLI dijawab: pakai app buat fitur ini. Foto sebagai **dokumen**
(di atas 6 MB) juga ditolak dengan pesan — kirim sebagai foto biasa saja.

**Story/status** dikirim tanpa re-encode app-side; engine memberikan byte media
asli ke WhatsApp, tetapi itu **tidak menjamin** WhatsApp mempertahankan kualitas
HD setelah upload.

**Penonton `.story`** tetap nomor yang diisi di kolom **Nomor penonton story**.
`.storygrup` sengaja fail-closed: pada Baileys yang dipin sekarang,
`statusJidList` hanya menentukan audience, bukan mention grup native. Engine
menolak perintah itu alih-alih mengirim audience list sambil mengaku men-tag grup.
Aktifkan lagi hanya setelah implementasi native mention lolos audit kompatibilitas,
CI, dan uji nyata di WhatsApp.

**Postingan Pertanyaan channel.** Bot mengirim postingan Pertanyaan pakai tandaresmi `isQuestion` di contextInfo pesan teks biasa; di HP yang belum kenal
formatnya, postingan TETAP tampil sebagai teks biasa (nggak pernah kosong).
Saklarnya ada di pengaturan ("Kirim sebagai Pertanyaan", default mati).

**Rekam postingan channel.** Fitur WhatsApp lain yang belum punya bentuk kabel
di Baileys 6.7.24 tetap belum bisa dikirim bot.
Nyalakan **Perintah pribadi**, lalu `.rekam on` dan publikasikan postingan baru.
Byte mentah postingan (base64) otomatis disimpan ke
`Android/media/com.xykals.warelease/rekaman/rekaman-channel.json`; salinan internal
app tetap dipakai sebagai sumber utama. `.rekam kirim` menampilkan lokasi file,
tidak mengirim dokumen lewat WA, supaya file nggak mentok di pesan “menunggu”.
File ini bisa dibuka dari file manager dan diunggah ke developer tanpa diedit.
`.rekam kosong` menghapus salinan internal dan ekspor Android. Data mentah bisa
terbaca lewat file manager, jadi unggah file itu hanya kalau kall memang mau
membagikan postingan channel tersebut.

**Moderasi grup** (nyalain saklarnya, grup harus sama dengan **Penjaga grup**):

- link Telegram, domain yang lo daftarin di **Domain phishing**, dan link di luar
  daftar izin (`chat.whatsapp.com`, `wa.me`, `whatsapp.com`) → **dihapus**
- kata judi/pinjol/promo (`slot`, `gacor`, `pinjol`, `promo`, …) → **dihapus**;
  tambah kata sendiri di **Kata tambahan**
- pelakunya **diperingatkan**; di pelanggaran ke-`batas strike` (bawaan 2) baru
  **dikeluarkan** dari grup
- **admin grup dan bot sendiri nggak pernah disentuh** — termasuk lo sebagai admin
- **Izinkan link biasa**: kalau dinyalain, link selain domain terlarang dibiarkan

Biar hapus pesan jalan, akun yang ditautkan **wajib admin** di grup itu. Kalau
bukan, bot tetap kirim peringatan tapi lognya nulis gagal hapus (sekali, nggak
spam log). Tombol **Kirim menu ke chat** ngirim daftar perintah ke chat diri
sendiri tanpa ngetik; **Kosongin hitungan** nol-in statistik moderasi.

## Pesan berkala ke grup

Kartu **Pesan berkala ke grup** ngirim pesan berulang ke grup yang sama dengan
**Penjaga grup** — jadi saklarnya butuh Penjaga grup nyala dulu.

- **Kirim berkala** — saklar utama.
- **Setiap berapa jam** — 1 sampai 168 (seminggu). Bawaannya 12 jam.
- **Selalu kirim daftar hitam** — kalau nyala, yang dikirim **cuma daftar hitam grup**;
  kolom pesan di bawahnya diabaikan (jadi draf teks bisa disimpan tanpa takut kepakai).
- **Pesan** — dibiarkan kosong: yang dikirim **daftar hitam grup** (nomor yang
  nggak boleh masuk lagi + sejak kapan, plus nomor yang lo daftarin sendiri di
  kartu Penjaga grup). Kalau diisi dan saklar di atas mati: teks lo yang dikirim
  (misal aturan grup).
- **Kirim sekarang** — ngirim sekali tanpa nunggu jadwal, buat ngecek tampilannya.
- Dari chat sendiri: `.berkala` buat **lihat dulu** isi pesannya tanpa kirim ke grup, dan
  `.berkala kirim` buat kirim sekarang (nebeng koneksi mode jaga, jadi nggak buka koneksi
  kedua).

Nomor yang lo daftarin sendiri boleh ditulis bebas (`0812-3456-7890`, `+62 813 …`,
`813999888777`) — semuanya dinormalkan ke `+62…`, duplikat sama daftar otomatis digabung jadi
satu baris, dan baris yang bukan nomor dibuang. Urutannya dari nomor kecil ke besar, ID
LID di belakang dan ditulis UTUH polos (format `ID 100987654`), nggak disamarkan; kalau nama WA-nya kebaca bot,
namanya ditulis di depan nomornya. Kalau lebih dari 30 orang, sisanya diringkas jadi
"…dan N orang lainnya" (hitungannya tetap jumlah orang sebenarnya).

Contoh isi daftar hitam (pesan aslinya berisi emoji tulang di kepala SukiBot
dan tanda larangan di judul — sengaja tidak ditulis di dokumen ini):

```
*SUKIBOT*
─────────────────

*Daftar hitam Alumni SMK*

*2 orang* yang nggak boleh masuk lagi:

1. Budi Santoso (+6281234567890) — sejak 30/9
2. +62811222333 — didaftarkan admin

_Diperbarui 1 Okt 2026, 19.05 WIB._
_Admin grup bisa minta buka blokir lewat app._
```

Kalau daftar hitamnya kosong, pesannya bukan daftar hampa tapi keterangan
"masih kosong" — biar jelas, bukan kayak bot yang error.

## Lagu mood & pertanyaan mood

Dua fitur pengisi channel yang jalan terpisah dari rilis, sama-sama pakai jadwal
acak (berapa kali sehari, jam efektifnya aturannya sama kayak lagu).

- **Lagu mood** — potongan lagu (voice note ~60 detik) + kata-kata. Pilihan lagunya ±75%
  yang lagi viral di TikTok/FYP Indonesia (chart harian Spotify ID disaring AI + benih
  TikTok yang dikurasi di Worker), sisanya lagu lawas dari `lagu/daftar.txt`.
- **Pertanyaan mood (ngejoks)** — satu pertanyaan absurd "plenger" tiap jadwal, dikirim
  sebagai postingan **Pertanyaan** di channel, jadi follower bisa jawab dan jawabannya
  cuma kebaca admin. Isinya dari bank lokal di HP (`bot-js/src/lawak.mjs`) — anti cringe,
  anti garing, dan nggak manggil AI sama sekali. Saklar + jumlah per hari ada di kartu
  "Pertanyaan mood · ngejoks"; jam efektif bawaannya 10–21.

Keduanya butuh kolom **Channel WA** terisi, dan tombol "Kirim sekarang" di masing-masing
kartu buat ngetes tanpa nunggu jadwal.

## Pesan perpisahan (yang keluar grup)

Kalau saklarnya nyala, bot ngirim satu pesan ke grup tiap ada anggota yang
keluar — mau keluar sendiri atau dikeluarin admin, sama aja (bot deteksinya
waktu cek rutin tiap N menit, jadi maksimal selambat itu).

- **Responsnya**: kalau saklar **Bot WA umum** (moderasi/perintah pribadi)
  nyala, salam dikirim LANGSUNG begitu ada yang keluar (detik, lewat event
  WhatsApp), dan yang bersangkutan masuk daftar hitam di saat itu juga. Kalau
  mode itu mati, salam dikirim pas cek rutin Penjaga grup (boleh turunin
  intervalnya sampai 1 menit). Dua jalur itu dijamin nggak dobel — tanda
  "sudah disalam" dibagi antar keduanya.
- **Kirim pesan perpisahan** — saklarnya di kartu Penjaga grup, jadi butuh
  Penjaga grup nyala dulu.
- **Judul pesan** — kolom tersendiri di atas kolom teks; pengepala pesannya
  jadi JUDULMU sendiri (kosongin = PERPISAHAN).
- **Nama bot** — kolom "Nama bot di pesan" di kartu atas (setup): mengganti
  merek di kepala dan tanda tangan SEMUA pesan bot (kosongin = SukiBot).
- **Teksnya kustom** — kolom di bawahnya. Placeholder yang didukung:
  - `{tag}` = mention orangnya (kalau lo lupa nulis, bot nyisipin otomatis,
    jadi orangnya PASTI ke-tag),
  - `{nama}` = nama WA-nya kalau kebaca, kalau nggak ya tetap mention,
  - `{grup}` = nama grup.
  Kosongin kolomnya = pakai teks bawaan ("udah keluar dari … hati-hati ya").
- Kalau sekali putaran banyak yang keluar: maksimal 3 pesan satu-satu, sisanya
  digabung satu pesan (tapi semua tetap ke-mention) biar grup nggak banjir.

## Kalau tombol/perintah nggak ada balasan

Urutan cek (dari yang paling sering):

1. **Engine jalan?** Kalau dijeda, nggak ada yang dengerin pesan. Tab Beranda → Mulai.
2. **WA ditautkan?** Kalau belum, tekan **Tautkan WA** di app.
3. **Perintah di chat sendiri** (`.menu`, `.berkala`, …) butuh saklar **Perintah pribadi**
   nyala (kartu Bot WA umum). Jika Moderasi juga mati, tidak ada socket yang mendengar
   pesan sehingga app memang tidak dapat membalas. Jika Moderasi masih menjaga socket,
   bot dapat mengingatkan sekali bahwa saklar perintah pribadi mati.
4. **Tombol "Kirim menu ke chat"** nggak butuh saklar itu: bot nyambung sekali pakai, kirim,
   terus putus. Hasilnya muncul sebagai banner di layar (berhasil / alasannya kenapa gagal),
   bukan cuma di tab Log.

## Kecepatan balasan

- Perintah di chat sendiri (`.menu`, `.rekam`, `.berkala`, …) dijawab di **jalur cepat**:
  moderasi grup yang berat (tarik metadata, hapus pesan, tendang orang) jalan di antrean
  sendiri, jadi perintah nggak nunggu di belakangnya.
- Kiriman yang bikin **koneksi baru** (rilis, lagu, pertanyaan, pesan berkala) sebelumnya selalu minta
  versi protokol WA terbaru tiap nyambung; sekarang hasilnya di-cache 6 jam, jadi satu
  round-trip lebih cepat tiap kirim.
- Yang tetap kerasa lambat: apa pun yang naikin media (stiker, `.rekam kirim`, story) — itu
  nunggu unduh/unggah, bukan masalah jalur perintahnya.

## Batre & koneksi

Dua hal di halaman ini harganya beda, dan bedanya penting:

- **Perintah pribadi + moderasi grup** (kartu Bot WA umum) bikin WhatsApp
  **tersambung terus** selama engine jalan.
- **Pesan berkala** cuma nyambung **saat mengirim**, lalu langsung putus. Kalau
  kirimannya gagal (misal WA putus), dia nyoba lagi 10 menit kemudian — bukan
  nunggu 12 jam.

Fitur lain (rilis, penjaga grup, lagu, pertanyaan) tetap nyambung sebentar tiap jadwal, jadi
nggak terpengaruh dua di atas. Mau batre lebih awet? Matikan saklar moderasi
waktu grup lagi sepi, dan biarkan pesan berkala yang jaga ketertiban grup.
