#!/usr/bin/env bash
# Tangkapan layar app ASLI dari emulator Android (dipanggil workflow screenshot-app.yml,
# di dalam android-emulator-runner). Butuh adb tersambung ke satu emulator.
#
#   APK=app/build/outputs/apk/debug/app-debug.apk OUT=tangkapan-app bash scripts-dev/screenshot_emulator.sh
#
# Alur: pasang APK -> isi SharedPreferences contoh (repo, channel, grup, lagu) lewat
# adb root / run-as supaya form tidak kosong -> buka MainActivity -> pindah tab lewat
# bar navigasi bawah (Beranda/Repo/Fitur/Log/Pengaturan), tiap bagian digulir sampai
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

# Bahasa emulator. Runner GitHub memakai en-US; sejak layar utama dua bahasa,
# tangkapan buat situs harus Indonesia (bawaan), Inggris kalau diminta lewat
# input workflow. Locale baru berlaku setelah runtime dimuat ulang (zygote),
# jadi tunggu package manager hidup lagi dan buka kunci layar.
BAHASA="${BAHASA:-id-ID}"
if [ "$(adb shell getprop persist.sys.locale | tr -d '\r')" != "$BAHASA" ]; then
  adb root >/dev/null 2>&1 || true
  adb wait-for-device
  adb shell "setprop persist.sys.locale $BAHASA; setprop ctl.restart zygote"
  sleep 10
  adb wait-for-device
  until adb shell pm path android >/dev/null 2>&1; do sleep 3; done
  sleep 15
  adb shell wm dismiss-keyguard >/dev/null 2>&1 || true
  adb shell input keyevent 82 >/dev/null 2>&1 || true
  echo "locale: $(adb shell getprop persist.sys.locale | tr -d '\r')"
fi

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

# --ez tahan_splash true: cuma buat CI, splash ditahan 6 dtk supaya jepretan dan
# cek dump UI keburu kejadian (di pemakaian normal splash nutup di 1,6 dtk).
adb shell am start -W -n "$PKG/$ACT" --ez tahan_splash true >/dev/null
sleep 1

source "$(dirname "$0")/ui-uji.sh"

echo "menangkap:"
echo "  sambutan.png"

# Splash epik (M12): di CI splash ditahan 20 dtk (--ez tahan_splash true di atas),
# jadi jepretan dua kali + dump UI keburu kejadian. Buktinya tiga lapis:
#   1. overlay splash + blok brand ada di dump UI,
#   2. dua jepretan berurutan beda isinya (partikelnya benar-benar bergerak),
#   3. jepretan disimpan buat mata manusia.
tangkap splash
sleep 2
tangkap splash-gerak
if cmp -s "$OUT/splash.png" "$OUT/splash-gerak.png"; then
  echo "uji splash: dua jepretan identik, animasi latar tidak jalan"; exit 1
fi
echo "uji splash: latar bergerak (dua jepretan berbeda) OK"
dump="$(dump_ui)"
if [[ "$dump" == *"id/splash"* && "$dump" == *"id/tvBrandSplash"* ]]; then
  echo "uji splash: overlay + brand kelihatan OK"
else
  echo "uji splash: overlay splash tidak ketemu di dump UI"; tangkap splash-gagal; exit 1
fi
# sisa masa tahan: tunggu splash nutup sendiri (20 dtk dari app dibuka)
sleep 16

tangkap beranda

# Sejak M11 layar dipecah jadi tab; tiap tab diketik lewat bar navigasi bawah.
ketuk_nav navRepo repo
# etChannel ada di tab Repo; offset lebih besar supaya judul kartu
# "Rilis GitHub -> Channel" ikut terlihat
gulir_ke etChannel repo-channel 860

ketuk_nav navFitur fitur
# offset = jarak anchor dari atas layar setelah digeser; dipilih supaya judul kartu
# di atas anchor ikut masuk (run 36621355435: judul terpotong dengan offset 200)
gulir_ke etGrup grup 600

# Uji kartu Fitur (M14/M15/M16) + tombol Simpan yang muncul kalau ada perubahan.
# Dipisah ke berkas sendiri supaya skrip ini tetap pendek; variabel yang
# dibutuhkan (PKG/ACT/OUT/X/H) diwariskan lewat environment.
PKG="$PKG" ACT="$ACT" OUT="$OUT" X="$X" H="$H" bash "$(dirname "$0")/uji-fitur.sh"

gulir_ke etLaguPerHari lagu 560
gulir_ke btnHosting hosting 500

ketuk_nav navLog log
gulir_ke btnKill log-bawah 520

# Bukti tab benar-benar jalan (M11): di tab Log, item navLog yang nyala dan
# bar Simpan hilang (di tab ini nggak ada kolom isian).
dump="$(dump_ui)"
# [[ ]] bukan "grep -q" di ujung pipeline: grep -q keluar begitu ketemu, dan dengan
# pipefail itu bisa kebaca gagal (SIGPIPE) walau sebenarnya cocok.
navlog="$(printf '%s\n' "$dump" | grep -F "id/navLog" || true)"
if [[ "$navlog" == *'selected="true"'* ]]; then
  echo "uji navbar: navLog selected OK"
else
  echo "uji navbar: item navLog tidak selected"; tangkap navbar-gagal; exit 1
fi
if [[ "$dump" == *"id/barSimpan"* ]]; then
  echo "uji navbar: bar Simpan masih kelihatan di tab Log"; tangkap navbar-gagal; exit 1
fi
echo "uji navbar: bar Simpan sembunyi di tab Log OK"

ketuk_nav navPengaturan pengaturan
gulir_ke tvTentang tentang 320

# Balik ke Beranda: mastiin tab bisa dipindah bolak-balik dan navbar-nya kedip
# di item yang benar (bukan cuma sekali jalan).
ketuk_nav navBeranda beranda-lagi

# Uji ketik layar Repo. Bug 2026-09-30 (HP kall): EditText yang dibuat dari kode dengan
# konstruktor defStyleAttr=0 kehilangan focusableInTouchMode, jadi kotaknya nggak bisa
# disentuh. Bukti perbaikan: ketuk kotak pertama, ketik, lalu pastikan teksnya benar-benar
# masuk menurut uiautomator dump. Teks tidak masuk = skrip gagal = workflow merah.
adb shell am start -W -n "$PKG/com.xykals.warelease.RepoActivity" >/dev/null
sleep 2
adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
kotak=$(adb shell cat /sdcard/ui.xml | tr '>' '\n' | grep -F 'class="android.widget.EditText"' | head -n 1 \
  | sed -n 's/.*bounds="\[\([0-9]*\),\([0-9]*\)\]\[\([0-9]*\),\([0-9]*\)\]".*/\1 \2 \3 \4/p' || true)
[ -n "$kotak" ] || { echo "uji ketik repo: kotak EditText tidak ditemukan"; tangkap repo-gagal; exit 1; }
set -- $kotak
adb shell input tap $(( ($1 + $3) / 2 )) $(( ($2 + $4) / 2 ))
sleep 1
adb shell input text 'xykal/wa-release-bot'
sleep 1
adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
if adb shell cat /sdcard/ui.xml | grep -qF 'text="xykal/wa-release-bot"'; then
  echo "uji ketik repo: OK"
else
  echo "uji ketik repo: GAGAL, teks tidak masuk ke kotak"; tangkap repo-gagal; exit 1
fi
tangkap repo-ketik
ls -la "$OUT"
