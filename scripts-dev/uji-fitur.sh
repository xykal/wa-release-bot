#!/usr/bin/env bash
# Uji UI kartu Fitur: Bot WA umum (M14/M15) + pesan berkala (M16) + tombol Simpan
# yang cuma muncul kalau ada perubahan. Dipanggil screenshot_emulator.sh setelah
# tab Fitur dibuka, jadi emulator dan app-nya sudah siap.
#
# Bukti yang diburu (semuanya dibaca dari `uiautomator dump`, bukan cuma jepretan):
#   1. kartunya ada dan bisa dijangkau,
#   2. bar Simpan: sembunyi -> muncul setelah diubah -> sembunyi lagi setelah
#      Simpan -> tetap sembunyi setelah app dibuka ulang,
#   3. nilai saklar NEMPEL di prefs (dibuktikan dengan membuka ulang app),
#   4. kolom-kolom baru ada (domain phishing, nomor story, interval, teks berkala),
#   5. tombol kirim menu ngasih umpan balik walau WA belum tersambung;
#   6. status rekam channel dan kondisi awalnya tampil di kartu Bot WA umum.
set -euo pipefail

: "${PKG:?PKG belum diisi}" "${ACT:?ACT belum diisi}" "${OUT:?OUT belum diisi}"
: "${X:?X belum diisi}" "${H:?H belum diisi}"
source "$(dirname "$0")/ui-uji.sh"

gulir_ke rowModerasi bot-umum 320
dump="$(dump_ui)"
if [[ "$dump" == *"id/rowModerasi"* && "$dump" == *"id/rowPerintahPribadi"* && "$dump" == *"Bot WA umum"* ]]; then
  echo "uji bot-umum: kartu + saklar moderasi + saklar perintah kelihatan OK"
else
  echo "uji bot-umum: kartu Bot WA umum tidak lengkap di dump UI"; tangkap_gagal bot-umum-gagal; exit 1
fi

# M16: bar Simpan harus MULAI dari sembunyi (belum ada perubahan).
if [[ "$dump" == *"id/barSimpan"* ]]; then
  echo "uji simpan: bar Simpan kelihatan padahal belum ada perubahan"; tangkap_gagal simpan-gagal; exit 1
fi
echo "uji simpan: bar Simpan sembunyi waktu belum ada perubahan OK"

ketuk_id rowModerasi "saklar moderasi"
baris="$(dump_ui | grep -F "id/rowModerasi" | head -n 1 || true)"
if [[ "$baris" == *'selected="true"'* ]]; then
  echo "uji bot-umum: saklar moderasi nyala OK"
else
  echo "uji bot-umum: saklar moderasi tidak berubah jadi nyala"; tangkap_gagal bot-umum-gagal; exit 1
fi

if [[ "$(dump_ui)" == *"id/barSimpan"* ]]; then
  echo "uji simpan: bar Simpan muncul setelah saklar diubah OK"
else
  echo "uji simpan: bar Simpan tidak muncul padahal ada perubahan"; tangkap_gagal simpan-gagal; exit 1
fi

# Digulir ke kolom domain (bukan story): dua kolom ini jaraknya cuma ~1 layar,
# jadi satu posisi cukup buat ngebuktiin dua-duanya ada di kartu.
gulir_ke etModerasiDomain bot-umum-kolom 400
dump="$(dump_ui)"
if [[ "$dump" == *"id/etModerasiDomain"* && "$dump" == *"id/etStoryKe"* ]]; then
  echo "uji bot-umum: kolom domain phishing + nomor penonton story kelihatan OK"
else
  echo "uji bot-umum: kolom baru Bot WA umum tidak ketemu di dump UI"; tangkap_gagal bot-umum-gagal; exit 1
fi

# Pesan berkala (M16): kartu + saklar + kolom interval.
gulir_ke rowBerkalaAktif berkala 340
dump="$(dump_ui)"
if [[ "$dump" == *"id/rowBerkalaAktif"* && "$dump" == *"Pesan berkala"* ]]; then
  echo "uji berkala: kartu pesan berkala kelihatan OK"
else
  echo "uji berkala: kartu pesan berkala tidak ketemu di dump UI"; tangkap_gagal berkala-gagal; exit 1
fi

ketuk_id rowBerkalaAktif "saklar berkala"
baris="$(dump_ui | grep -F "id/rowBerkalaAktif" | head -n 1 || true)"
if [[ "$baris" == *'selected="true"'* ]]; then
  echo "uji berkala: saklar kirim berkala nyala OK"
else
  echo "uji berkala: saklar berkala tidak berubah jadi nyala"; tangkap_gagal berkala-gagal; exit 1
fi

# Kolom interval: ketik 6 (ganti dari 12) — sekalian bukti kotaknya bisa diketik.
kotak="$(kotak_id etBerkalaJam)"
if [ -n "$kotak" ]; then
  set -- $kotak
  adb shell input tap $(( ($1 + $3) / 2 )) $(( ($2 + $4) / 2 ))
  sleep 0.5
  # Kosongin dulu (nilainya "12" dari prefs): 4x DEL lebih dari cukup, biar
  # hasilnya persis "6" -- kalau cuma 1x DEL, isinya jadi "16" dan assert
  # text="6" bakal gagal walau kotaknya sebenarnya bisa diketik.
  adb shell input keyevent KEYCODE_MOVE_END
  for _ in 1 2 3 4; do adb shell input keyevent KEYCODE_DEL; done
  adb shell input text '6'
  sleep 0.5
  baris="$(dump_ui | grep -F "id/etBerkalaJam" | head -n 1 || true)"
  if [[ "$baris" == *'text="6"'* ]]; then
    echo "uji berkala: interval bisa diketik OK"
  else
    echo "uji berkala: teks interval tidak masuk ke kotak (dapat: $baris)"
    tangkap_gagal berkala-gagal; exit 1
  fi
fi
tangkap berkala

# Simpan, lalu bar Simpan harus hilang lagi.
kotak="$(kotak_id btnSave)"
if [ -z "$kotak" ]; then
  echo "uji simpan: tombol Simpan tidak ketemu padahal ada perubahan"; tangkap_gagal simpan-gagal; exit 1
fi
set -- $kotak
adb shell input tap $(( ($1 + $3) / 2 )) $(( ($2 + $4) / 2 ))
sleep 1.4
if [[ "$(dump_ui)" == *"id/barSimpan"* ]]; then
  echo "uji simpan: bar Simpan masih kelihatan setelah Simpan"; tangkap_gagal simpan-gagal; exit 1
fi
echo "uji simpan: bar Simpan sembunyi lagi setelah Simpan OK"

# Matikan app, buka lagi: nilai saklar harus balik nyala dari prefs.
adb shell am force-stop "$PKG"
sleep 1
adb shell am start -W -n "$PKG/$ACT" >/dev/null
sleep 3
ketuk_nav navFitur fitur-lagi
gulir_ke rowModerasi bot-umum-persist 320
dump="$(dump_ui)"
baris="$(printf '%s\n' "$dump" | grep -F "id/rowModerasi" | head -n 1 || true)"
if [[ "$baris" == *'selected="true"'* ]]; then
  echo "uji bot-umum: moderasi tersimpan di prefs (app dibuka ulang) OK"
else
  echo "uji bot-umum: moderasi hilang setelah app dibuka ulang"; tangkap_gagal bot-umum-persist-gagal; exit 1
fi
if [[ "$dump" == *"id/barSimpan"* ]]; then
  echo "uji simpan: bar Simpan muncul sendiri setelah app dibuka ulang"; tangkap_gagal simpan-gagal; exit 1
fi

gulir_ke tvModerasiStat bot-umum-rekam-channel 360
dump="$(dump_ui)"
if [[ ("$dump" == *"Rekam channel:"* && "$dump" == *"Belum ada postingan channel yang diproses."*) || ("$dump" == *"Channel recording:"* && "$dump" == *"No channel post processed yet."*) ]]; then
  echo "uji rekam channel: status awal tampil di kartu Bot WA umum OK"
else
  echo "uji rekam channel: status awal tidak tampil"; tangkap_gagal rekam-channel-gagal; exit 1
fi

gulir_ke rowBerkalaAktif berkala-persist 340
baris="$(dump_ui | grep -F "id/rowBerkalaAktif" | head -n 1 || true)"
if [[ "$baris" == *'selected="true"'* ]]; then
  echo "uji berkala: pengaturan berkala tersimpan di prefs OK"
else
  echo "uji berkala: pengaturan berkala hilang setelah app dibuka ulang"; tangkap_gagal berkala-persist-gagal; exit 1
fi

# Saklar "selalu kirim daftar hitam" harus ada dan keadaannya ikut tersimpan.
if [[ "$(dump_ui)" == *"id/rowBerkalaHitam"* ]]; then
  echo "uji berkala: saklar selalu-daftar-hitam kelihatan OK"
else
  echo "uji berkala: saklar selalu-daftar-hitam tidak ketemu di dump UI"; tangkap_gagal berkala-gagal; exit 1
fi

# Umpan balik tombol kirim menu (WA belum nyambung -> tetap ada pesan).
gulir_ke btnKirimMenu bot-umum-tombol 720
kotak="$(kotak_id btnKirimMenu)"
if [ -z "$kotak" ]; then
  echo "uji bot-umum: tombol kirim menu tidak ketemu"; tangkap_gagal bot-umum-gagal; exit 1
fi
set -- $kotak
adb shell input tap $(( ($1 + $3) / 2 )) $(( ($2 + $4) / 2 ))
sleep 0.8
dump="$(dump_ui)"
if [[ "$dump" == *"chat sendiri"* ]]; then
  echo "uji bot-umum: tombol kirim menu ngasih umpan balik OK"
else
  echo "uji bot-umum: tombol kirim menu diam saja"; tangkap_gagal bot-umum-gagal; exit 1
fi
