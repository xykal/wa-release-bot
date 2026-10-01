# Panduan fitur WhatsApp (bot umum)

Pelengkap [PANDUAN-APP.md](PANDUAN-APP.md): halaman ini isinya fitur yang jalan di
sisi WhatsApp — moderasi grup, perintah pribadi di chat sendiri, stiker, story,
dan pesan berkala. Kartu-kartunya ada di tab **Fitur** app.

## Daftar isi

- [Bot WA umum (moderasi + perintah di chat sendiri)](#bot-wa-umum-moderasi--perintah-di-chat-sendiri)
- [Pesan berkala ke grup](#pesan-berkala-ke-grup)
- [Batre & koneksi](#batre--koneksi)

## Bot WA umum (moderasi + perintah di chat sendiri)

Kartu **Bot WA umum** di tab Fitur punya dua saklar. Dua-duanya bikin WhatsApp
**tetap tersambung** selama engine jalan — beda dari fitur lain yang cuma
nyambung sebentar tiap jadwal. Karena itu saklarnya terpisah: moderasi
bawaannya **mati**, perintah pribadi **nyala**.

**Perintah pribadi** (cuma jalan di **chat diri sendiri** — bukan di grup):
kirim `.menu` buat lihat daftarnya. Yang ada sekarang:

| Perintah | Gunanya |
|---|---|
| `.menu` / `.bantu` | daftar perintah |
| `.ping` | cek bot hidup |
| `.status` | repo, rilis terakhir, penjaga grup, hitungan moderasi |
| `.stiker` | kirim/rebalas **foto** dengan keterangan `.stiker` → jadi stiker WA |
| `.story` | kirim/rebalas **foto/video** dengan keterangan `.story` → status/story HD |
| `.storygrup` | sama, tapi penontonnya ditambah anggota grup yang dipantau |
| `.grup` | info grup yang dipantau: nama, jumlah anggota, daftar hitam |
| `.bersih` | kosongkan hitungan moderasi hari ini |

Stiker diproses di HP: WhatsApp cuma nerima stiker **WebP**, sementara mesin Node
di dalam app nggak punya encoder WebP. Jadi fotonya dititipkan lewat berkas di
folder data app, dikecilkan ke 512 px dan dikompres di `Stiker.kt`, baru balik
jadi stiker. Foto besar/format aneh otomatis diturunkan mutunya; kalau tetap
nggak kebaca, bot balas pesan gagal (nggak diem-dieman). Karena butuh Android,
`.stiker` di CLI dijawab: pakai app buat fitur ini. Foto sebagai **dokumen**
(di atas 6 MB) juga ditolak dengan pesan — kirim sebagai foto biasa saja.

**Story/status** dikirim apa adanya (tanpa re-encode), jadi kualitasnya tetap
seperti di HP. Penontonnya: nomor yang lo isi di kolom **Nomor penonton story**
(ditambah anggota grup kalau pakai `.storygrup`).

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
- **Pesan** — dibiarkan kosong: yang dikirim **daftar hitam grup** (nomor yang
  nggak boleh masuk lagi + sejak kapan, plus nomor yang lo daftarin sendiri di
  kartu Penjaga grup). Kalau diisi: teks lo yang dikirim (misal aturan grup).
- **Kirim sekarang** — ngirim sekali tanpa nunggu jadwal, buat ngecek tampilannya.

Contoh isi daftar hitam:

```
Daftar hitam Alumni SMK (2 orang):
1. +62 812-3456-7890 (sejak 30/9)
2. +62 811-222-333 (sejak 28/9)

Diperbarui 1/10/2026, 19.05.42. Orang di daftar ini nggak bisa masuk
lagi lewat link grup. Admin grup bisa minta buka blokir.
```

Kalau daftar hitamnya kosong, pesannya bukan daftar hampa tapi keterangan
"masih kosong" — biar jelas, bukan kayak bot yang error.

## Batre & koneksi

Dua hal di halaman ini harganya beda, dan bedanya penting:

- **Perintah pribadi + moderasi grup** (kartu Bot WA umum) bikin WhatsApp
  **tersambung terus** selama engine jalan.
- **Pesan berkala** cuma nyambung **saat mengirim**, lalu langsung putus. Kalau
  kirimannya gagal (misal WA putus), dia nyoba lagi 10 menit kemudian — bukan
  nunggu 12 jam.

Fitur lain (rilis, penjaga grup, lagu) tetap nyambung sebentar tiap jadwal, jadi
nggak terpengaruh dua di atas. Mau batre lebih awet? Matikan saklar moderasi
waktu grup lagi sepi, dan biarkan pesan berkala yang jaga ketertiban grup.
