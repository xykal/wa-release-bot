# Checklist pre-launch 1.0.0

Dokumen ini adalah gerbang manual. CI membuktikan kode dapat dibangun dan diuji
dalam lingkungan otomatis; CI tidak membuktikan perilaku WhatsApp, vendor Android,
radio seluler, atau dekripsi end-to-end di HP asli.

Isi untuk setiap perangkat:

- Model HP:
- Android / ROM:
- ABI: arm64-v8a / armeabi-v7a
- Commit APK:
- Nama file APK:
- SHA-256 APK:
- Waktu mulai:
- Waktu selesai:
- Penguji:

Status yang diperbolehkan: `LULUS`, `GAGAL`, atau `TIDAK DIUJI`. Jangan memakai
`LULUS` tanpa catatan waktu atau bukti log.

## 1. Instalasi dan integritas

- [ ] SHA-256 APK sama dengan checksum dari release/draft kandidat.
- [ ] APK dapat dipasang pada perangkat bersih.
- [ ] Update dari build internal sebelumnya tidak ditolak karena versionCode.
- [ ] Onboarding menekankan release sebagai fitur inti.
- [ ] Semua fitur tambahan mati pada instalasi baru, termasuk Perintah pribadi.
- [ ] App membuka lima tab tanpa crash atau elemen keluar layar.

## 2. Pairing dan session

- [ ] Pairing code berhasil tanpa HP kedua.
- [ ] QR berhasil jika tersedia HP kedua.
- [ ] Status tertaut bertahan setelah app ditutup dan dibuka kembali.
- [ ] Status tertaut bertahan setelah HP reboot.
- [ ] Lepas WA menghapus linked device dan app dapat pairing ulang.

Catat nomor hanya dalam bentuk disamarkan. Jangan lampirkan session atau token.

## 3. Jalur inti release

Gunakan dua repo uji yang aman. Repo A memakai channel utama; repo B memakai
tujuan khusus.

- [ ] Baseline pertama tidak mengirim release lama saat `postOnFirstRun=false`.
- [ ] `postOnFirstRun=true` mengirim release saat ini tepat satu kali.
- [ ] Release baru Repo A sampai ke channel utama.
- [ ] Release baru Repo B sampai ke channel khusus.
- [ ] Catatan rilis panjang terpotong aman dan tautan tetap benar.
- [ ] Prerelease dilewati saat saklar mati.
- [ ] Prerelease dikirim saat saklar hidup.
- [ ] Tag rollback tidak diumumkan ulang.
- [ ] Restart app/HP tidak menyebabkan posting ganda.
- [ ] Cek tanpa perubahan menghasilkan 304/"tidak ada update" tanpa posting.

## 4. Gangguan jaringan dan retry

- [ ] Matikan jaringan saat cek GitHub; app tidak crash dan jadwal berikutnya ada.
- [ ] Matikan jaringan setelah release ditemukan tetapi sebelum WA tersambung.
- [ ] Pending state bertahan setelah proses/app dimatikan.
- [ ] Retry tidak menghasilkan dua posting untuk release yang sama.
- [ ] Setelah kegagalan terakhir, notifikasi Android muncul.
- [ ] Tombol Cek sekarang dapat mengulang setelah pengguna memperbaiki jaringan.
- [ ] Pergantian Wi-Fi ke data seluler tidak membuat scheduler berhenti.

## 5. Tidur, baterai, dan lifecycle

Jalankan sekurangnya 24 jam; target ideal 48 jam.

- [ ] Perintah pribadi dan Moderasi mati selama pengujian mode inti.
- [ ] Log tidak menunjukkan socket WhatsApp persisten saat tidak ada kiriman.
- [ ] Layar mati sekurangnya enam jam dan pengecekan tetap berjalan.
- [ ] App disapu dari recent apps dan service tetap sesuai setelan.
- [ ] HP reboot dan service kembali jika Autostart aktif.
- [ ] Jika Autostart mati, boot tidak memulai service.
- [ ] Tidak ada crash loop, ANR, atau pertumbuhan log/file sementara tanpa batas.
- [ ] Konsumsi baterai dicatat, bukan hanya dinilai secara visual.

Catat persentase baterai awal/akhir, status charging, dan waktu layar mati.

## 6. Fitur tambahan opt-in

Bagian ini tidak mengubah kelulusan core jika diberi `TIDAK DIUJI`, tetapi fitur
yang gagal harus tetap berlabel eksperimental dan tidak boleh diklaim stabil.

- [ ] Penjaga grup hanya memproses grup target.
- [ ] Pesan berkala hanya dikirim ke grup target.
- [ ] Moderasi tidak menyentuh admin dan bot sendiri.
- [ ] Perintah pribadi menyebabkan socket persisten hanya setelah dinyalakan.
- [ ] Mematikan Perintah pribadi dan Moderasi menutup mode jaga.
- [ ] `.brat`, `.stiker`, `.welcome`, `.story`, dan rekam channel diuji terpisah.
- [ ] `.storygrup` menolak dengan penjelasan; tidak mengaku memberi native mention.
- [ ] Format Pertanyaan tetap mati jika belum terbukti tampil benar.
- [ ] Lagu mood tetap mati kecuali penguji memiliki hak memakai audionya.

## 7. Hosting eksperimental

Gunakan project dummy tanpa secret.

- [ ] Memilih ZIP menampilkan SHA-256 sebelum ekstraksi/pemasangan.
- [ ] Batal pada dialog tidak memasang project.
- [ ] SHA-256 dialog sama dengan hasil `sha256sum` di komputer.
- [ ] Hanya ZIP tepercaya yang disetujui.
- [ ] Worker tidak menerima `WR_DATA_DIR`, token bridge, atau environment engine.
- [ ] `.env` project sendiri tetap diterima.
- [ ] Stop, restart, crash limit, dan hapus project bekerja.
- [ ] Penguji memahami worker tetap dapat membaca filesystem privat app karena
      worker thread bukan sandbox keamanan.

## 8. Log dan privasi

- [ ] Unduh semua log menghasilkan ZIP yang dapat dibuka.
- [ ] Log app, mesin, crash, dan logcat yang dipilih ada.
- [ ] Token GitHub dan kredensial session tidak muncul di log.
- [ ] Nomor/link yang muncul ditinjau dan disamarkan sebelum dibagikan.
- [ ] Folder rekaman channel hanya muncul setelah fitur sengaja dinyalakan.

## 9. Keputusan rilis

Isi setelah kedua perangkat selesai:

| Gerbang | arm64 | v7a | Catatan |
|---|---|---|---|
| Instalasi |  |  |  |
| Pairing/session |  |  |  |
| Release multi-repo |  |  |  |
| Retry/anti-duplikat |  |  |  |
| Reboot/layar mati |  |  |  |
| Log/privasi |  |  |  |
| 24–48 jam tanpa crash |  |  |  |

Keputusan akhir:

- [ ] `RILIS`: seluruh gerbang inti lulus dan seluruh CI hijau pada commit yang sama.
- [ ] `TUNDA`: ada kegagalan inti, bukti belum lengkap, atau APK yang diuji bukan
      berasal dari commit kandidat.

Persetujuan pemilik:

- Commit:
- Tanggal:
- Keputusan:
- Catatan:
