#!/usr/bin/env bash
# Tangkapan layar app ASLI dari emulator Android (dipanggil workflow screenshot-app.yml,
# di dalam android-emulator-runner). Butuh adb tersambung ke satu emulator.
#
#   APK=app/build/outputs/apk/debug/app-debug.apk OUT=tangkapan-app bash scripts-dev/screenshot_emulator.sh
#
# Alur: pasang APK -> isi SharedPreferences contoh (repo, channel, grup, lagu) lewat
# adb root / run-as supaya form tidak kosong -> buka MainActivity -> tiap bagian digulir sampai
# terlihat (posisi dari uiautomator dump, bukan koordinat hafalan) -> screencap PNG.
# WhatsApp tidak tersambung di emulator, jadi status yang tampil = "belum tertaut" (jujur).
set -euo pipefail

APK="${APK:-app/build/outputs/apk/debug/app-debug.apk}"
OUT="${OUT:-tangkapan-app}"
# release: com.xykals.warelease; debug: applicationIdSuffix .debug (app/build.gradle)
PKG="${PKG:-com.xykals.warelease.debug}"
ACT="com.xykals.warelease.MainActivity"
mkdir -p "$OUT"

adb wait-for-device
adb shell settings put global window_animation_scale 0
adb shell settings put global transition_animation_scale 0
adb shell settings put global animator_duration_scale 0
adb install -r -g "$APK"

# Pertama kali dibuka app menampilkan layar sambutan (pref sambutanV2 belum ada):
# tangkap itu dulu, baru tulis pref supaya pembukaan berikutnya langsung ke beranda.
adb shell am start -W -n "$PKG/$ACT" >/dev/null
sleep 5
mkdir -p "$OUT"
adb exec-out screencap -p > "$OUT/sambutan.png"
adb shell am force-stop "$PKG"

# Prefs contoh: kunci + tipe persis SettingsStore.kt (salah tipe = ClassCastException saat app baca).
PREFS_LOKAL="$(mktemp)"
cat > "$PREFS_LOKAL" <<'XML'
<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <boolean name="sambutanV2" value="true" />
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

# Varian release tidak debuggable, jadi run-as ditolak ("package not debuggable",
# run 36622065619). Image google_apis mengizinkan `adb root`: salin sebagai root,
# lalu samakan pemilik + konteks SELinux (kategori per app) dengan folder app-nya,
# kalau tidak app tidak bisa menimpa file itu saat menyimpan. Build debug (tanpa
# root) tetap didukung lewat run-as.
DIR_APP="/data/data/$PKG"
if adb root 2>/dev/null | grep -qi "cannot run as root"; then
  adb shell run-as "$PKG" mkdir -p shared_prefs
  adb shell run-as "$PKG" sh -c "'cat > shared_prefs/wa_release_bot.xml'" < "$PREFS_LOKAL"
  adb shell run-as "$PKG" chmod 660 shared_prefs/wa_release_bot.xml
else
  adb wait-for-device
  sleep 2
  PEMILIK="$(adb shell stat -c '%u:%g' "$DIR_APP" | tr -d '\r')"
  KONTEKS="$(adb shell ls -Zd "$DIR_APP" | awk '{print $1}' | tr -d '\r')"
  adb shell mkdir -p "$DIR_APP/shared_prefs"
  adb push "$PREFS_LOKAL" "$DIR_APP/shared_prefs/wa_release_bot.xml" >/dev/null
  adb shell "chown -R $PEMILIK $DIR_APP/shared_prefs && chmod 771 $DIR_APP/shared_prefs \
    && chmod 660 $DIR_APP/shared_prefs/wa_release_bot.xml && chcon -R $KONTEKS $DIR_APP/shared_prefs"
  echo "prefs ditulis sebagai root (pemilik $PEMILIK, konteks $KONTEKS)"
fi
rm -f "$PREFS_LOKAL"

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
echo "  sambutan.png"
tangkap beranda
# etChannel ada di layout lama maupun baru (etRepo diganti tombol Kelola repo);
# offset lebih besar supaya judul kartu "Rilis GitHub -> Channel" ikut terlihat
gulir_ke etChannel pengaturan 620
# offset = jarak anchor dari atas layar setelah digeser; dipilih supaya judul kartu
# di atas anchor ikut masuk (run 36621355435: judul terpotong dengan offset 200)
gulir_ke etGrup grup 330
gulir_ke etLaguPerHari lagu 560
gulir_ke btnHosting hosting 500
gulir_ke tvLog log 400
gulir_ke tvTentang tentang 320
ls -la "$OUT"
