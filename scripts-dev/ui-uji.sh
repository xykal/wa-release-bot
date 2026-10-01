# Fungsi bantu uji UI lewat adb (dipakai screenshot_emulator.sh dan uji-fitur.sh).
#
# Semua fungsi di sini mengandalkan variabel global yang sudah diisi pemanggil:
#   PKG  nama paket Android, ACT  activity utama, OUT  folder hasil jepretan,
#   X    titik tengah layar (horizontal), H  tinggi layar.
#
# Dipisah dari skrip utamanya supaya tiap berkas tetap di bawah ~250 baris.

tangkap() { adb exec-out screencap -p > "$OUT/$1.png"; echo "  $1.png"; }

# posisi_atas <id> -> cetak koordinat atas elemen kalau terlihat, kosong kalau tidak
posisi_atas() {
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 || return 0
  # grep tanpa hasil = exit 1; dengan pipefail itu akan mematikan skrip (set -e),
  # padahal "belum kelihatan" adalah kondisi normal saat menggulir -> || true
  adb shell cat /sdcard/ui.xml | tr '>' '\n' | grep -F "resource-id=\"$PKG:id/$1\"" | head -n 1 \
    | sed -n 's/.*bounds="\[[0-9]*,\([0-9]*\)\]\[[0-9]*,[0-9]*\]".*/\1/p' || true
}

# ketuk_id <id> <nama>: ketuk tengah elemen (gagal keras kalau elemennya nggak ada)
ketuk_id() {
  local kotak
  kotak="$(kotak_id "$1")"
  if [ -z "$kotak" ]; then
    echo "  elemen $1 ($2) tidak ketemu"; tangkap_gagal "gagal-$1"; exit 1
  fi
  set -- $kotak
  adb shell input tap $(( ($1 + $3) / 2 )) $(( ($2 + $4) / 2 ))
  sleep 0.7
}

# kotak_id <id> -> "x1 y1 x2 y2" elemen kalau kelihatan, kosong kalau tidak
kotak_id() {
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 || return 0
  adb shell cat /sdcard/ui.xml | tr '>' '\n' | grep -F "resource-id=\"$PKG:id/$1\"" | head -n 1 \
    | sed -n 's/.*bounds="\[\([0-9]*\),\([0-9]*\)\]\[\([0-9]*\),\([0-9]*\)\]".*/\1 \2 \3 \4/p' || true
}

# isi dump UI, satu node per baris (uiautomator menulisnya dalam satu baris panjang)
dump_ui() {
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 || true
  adb shell cat /sdcard/ui.xml | tr '>' '\n'
}

# ketuk_nav <id-nav> <nama-jepretan>: buka tab lewat bar navigasi bawah, lalu tangkap.
# Bukti M11: tiap layar dipisah tab, jadi jepretan per bagian HARUS lewat sini.
ketuk_nav() {
  local id="$1" nama="$2" kotak
  kotak="$(kotak_id "$id")"
  if [ -z "$kotak" ]; then echo "  nav $id tidak ketemu, dilewati"; return 0; fi
  set -- $kotak
  adb shell input tap $(( ($1 + $3) / 2 )) $(( ($2 + $4) / 2 ))
  sleep 0.9
  if [ -n "$nama" ]; then tangkap "$nama"; fi
}

# gulir_ke <id> <nama>: gulir sampai elemen ada, geser supaya ~200px dari atas, lalu tangkap
gulir_ke() {
  local id="$1" nama="$2" target="${3:-200}" atas="" i
  for i in $(seq 1 14); do
    atas="$(posisi_atas "$id")"
    if [ -n "$atas" ]; then break; fi
    adb shell input swipe "$X" $((H * 70 / 100)) "$X" $((H * 30 / 100)) 400
    sleep 0.8
  done
  if [ -z "$atas" ]; then echo "  $nama: elemen $id tidak ketemu, dilewati"; return 0; fi
  # geser elemen ke ~target px dari atas; dibatasi setengah layar supaya titik
  # akhir swipe tidak keluar layar
  local geser=$((atas - target))
  if [ "$geser" -gt $((H / 2)) ]; then geser=$((H / 2)); fi
  if [ "$geser" -gt 60 ]; then
    adb shell input swipe "$X" $((H * 60 / 100)) "$X" $((H * 60 / 100 - geser)) 500
    sleep 0.8
  fi
  tangkap "$nama"
}

# tangkap_gagal <nama>: jepretan terakhir waktu uji gagal (dipanggil sebelum exit)
tangkap_gagal() { tangkap "$1" 2>/dev/null || true; }
