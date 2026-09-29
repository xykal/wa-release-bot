#!/usr/bin/env bash
# Tangkapan layar app ASLI dari emulator Android (dipanggil workflow screenshot-app.yml,
# di dalam android-emulator-runner). Butuh adb tersambung ke satu emulator.
#
#   APK=app/build/outputs/apk/debug/app-debug.apk OUT=tangkapan-app bash scripts-dev/screenshot_emulator.sh
#
# Alur: pasang APK debug -> isi SharedPreferences contoh (repo, channel, grup, lagu) lewat
# run-as supaya form tidak kosong -> buka MainActivity -> tiap bagian digulir sampai
# terlihat (posisi dari uiautomator dump, bukan koordinat hafalan) -> screencap PNG.
# WhatsApp tidak tersambung di emulator, jadi status yang tampil = "belum tertaut" (jujur).
set -euo pipefail

APK="${APK:-app/build/outputs/apk/debug/app-debug.apk}"
OUT="${OUT:-tangkapan-app}"
PKG="com.xykals.warelease.debug"          # applicationIdSuffix .debug (app/build.gradle)
ACT="com.xykals.warelease.MainActivity"
mkdir -p "$OUT"

adb wait-for-device
adb shell settings put global window_animation_scale 0
adb shell settings put global transition_animation_scale 0
adb shell settings put global animator_duration_scale 0
adb install -r -g "$APK"

# Prefs contoh: kunci + tipe persis SettingsStore.kt (salah tipe = ClassCastException saat app baca).
adb shell run-as "$PKG" mkdir -p shared_prefs
adb shell run-as "$PKG" sh -c "'cat > shared_prefs/wa_release_bot.xml'" <<'XML'
<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <string name="repo">xykal/wa-release-bot</string>
    <string name="channel">https://whatsapp.com/channel/0029VaContohChannelKamu</string>
    <int name="interval" value="15" />
    <boolean name="grupAktif" value="true" />
    <string name="grupTarget">https://chat.whatsapp.com/ContohGrupAlumni</string>
    <int name="grupInterval" value="5" />
    <boolean name="laguAktif" value="true" />
    <int name="laguPerHari" value="2" />
    <int name="laguJamMulai" value="9" />
    <int name="laguJamSelesai" value="22" />
</map>
XML
adb shell run-as "$PKG" chmod 660 shared_prefs/wa_release_bot.xml

read -r W H < <(adb shell wm size | sed -n 's/.*: *\([0-9]*\)x\([0-9]*\).*/\1 \2/p' | tail -n 1)
echo "layar ${W}x${H}"
X=$((W / 2))

adb shell am start -W -n "$PKG/$ACT" >/dev/null
sleep 6

tangkap() { adb exec-out screencap -p > "$OUT/$1.png"; echo "  $1.png"; }

# posisi_atas <id> -> cetak koordinat atas elemen kalau terlihat, kosong kalau tidak
posisi_atas() {
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 || return 0
  # grep tanpa hasil = exit 1; dengan pipefail itu akan mematikan skrip (set -e),
  # padahal "belum kelihatan" adalah kondisi normal saat menggulir -> || true
  adb shell cat /sdcard/ui.xml | tr '>' '\n' | grep -F "resource-id=\"$PKG:id/$1\"" | head -n 1 \
    | sed -n 's/.*bounds="\[[0-9]*,\([0-9]*\)\]\[[0-9]*,[0-9]*\]".*/\1/p' || true
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

echo "menangkap:"
tangkap beranda
# etChannel ada di layout lama maupun baru (etRepo diganti tombol Kelola repo);
# offset lebih besar supaya judul kartu "Rilis GitHub -> Channel" ikut terlihat
gulir_ke etChannel pengaturan 620
gulir_ke etGrup grup
gulir_ke etLaguPerHari lagu
gulir_ke btnHosting hosting
gulir_ke tvLog log
gulir_ke tvTentang tentang
ls -la "$OUT"
