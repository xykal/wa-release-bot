#!/usr/bin/env bash
# ============================================================================
#  Unduh nodejs-mobile (libnode.so + header Node.js) ke tempat yang dipakai
#  build Android. Sekali jalan.
#
#  Dipakai oleh:
#    - developer lokal   : bash scripts/fetch-nodejs-mobile.sh
#    - GitHub Actions    : langkah "Download nodejs-mobile" di build-apk.yml
#
#  ABI yang didukung nodejs-mobile v18.20.4 (isinya cuma 3 ini):
#    arm64-v8a     → HP Android 64-bit (default, hampir semua HP sekarang)
#    armeabi-v7a   → HP Android 32-bit (HP lama, kira-kira sebelum 2016+)
#    x86_64        → emulator Android Studio (nggak dipakai di sini)
#
#  Pakai:
#    bash scripts/fetch-nodejs-mobile.sh                    # arm64-v8a saja
#    ABIS=armeabi-v7a bash scripts/fetch-nodejs-mobile.sh
#    ABIS="arm64-v8a armeabi-v7a" bash scripts/fetch-nodejs-mobile.sh
#
#  Hasilnya:
#    app/src/main/jniLibs/<abi>/libnode.so   ← Gradle otomatis mem-package ini
#    app/libnode/include/node/*.h            ← header untuk CMake (sama semua ABI)
# ============================================================================
set -euo pipefail

NODEJS_MOBILE_VERSION="${NODEJS_MOBILE_VERSION:-v18.20.4}"
ABIS="${ABIS:-arm64-v8a}"

# Terima pemisah spasi atau koma, biar gampang dikirim dari CI.
read -r -a ABI_LIST <<<"$(echo "$ABIS" | tr ',' ' ')"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ZIP_URL="https://github.com/nodejs-mobile/nodejs-mobile/releases/download/${NODEJS_MOBILE_VERSION}/nodejs-mobile-${NODEJS_MOBILE_VERSION}-android.zip"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "⬇️  nodejs-mobile ${NODEJS_MOBILE_VERSION}"
echo "    ${ZIP_URL}"
echo "    ABI: ${ABI_LIST[*]}"

curl -fsSL --retry 3 --retry-delay 2 -o "${TMP_DIR}/njsm.zip" "$ZIP_URL"
unzip -q "${TMP_DIR}/njsm.zip" -d "${TMP_DIR}/njsm"

# Header Node.js identik untuk semua ABI → cukup di-copy sekali.
rm -rf "${ROOT}/app/libnode/include"
mkdir -p "${ROOT}/app/libnode"
cp -r "${TMP_DIR}/njsm/include" "${ROOT}/app/libnode/include"

if [ ! -f "${ROOT}/app/libnode/include/node/node.h" ]; then
  echo "❌ include/node/node.h tidak ditemukan setelah copy — struktur zip berubah?" >&2
  exit 1
fi

TOTAL=0
for ABI in "${ABI_LIST[@]}"; do
  SRC_SO="${TMP_DIR}/njsm/bin/${ABI}/libnode.so"
  if [ ! -f "$SRC_SO" ]; then
    echo "❌ libnode.so tidak ada di dalam zip untuk ABI ${ABI}" >&2
    echo "   Yang tersedia: $(ls "${TMP_DIR}/njsm/bin" 2>/dev/null | tr '\n' ' ' || echo '(kosong)')" >&2
    exit 1
  fi

  DEST_DIR="${ROOT}/app/src/main/jniLibs/${ABI}"
  mkdir -p "$DEST_DIR"
  cp "$SRC_SO" "${DEST_DIR}/libnode.so"

  SIZE=$(stat -c %s "${DEST_DIR}/libnode.so" 2>/dev/null || stat -f %z "${DEST_DIR}/libnode.so")
  TOTAL=$((TOTAL + SIZE))
  echo "✅ libnode.so  → app/src/main/jniLibs/${ABI}/libnode.so ($((SIZE / 1048576)) MB)"
done

echo "✅ header      → app/libnode/include/node/ ($(ls "${ROOT}/app/libnode/include/node" | wc -l) file)"
echo "   Total libnode.so: $((TOTAL / 1048576)) MB"
echo "   Node version: $(grep -E 'define NODE_MAJOR|define NODE_MINOR|define NODE_PATCH' "${TMP_DIR}/njsm/include/node/node_version.h" | tr -d ' ' | tr '\n' ' ')"

if [ "${#ABI_LIST[@]}" -gt 1 ]; then
  echo
  echo "ℹ️  Lebih dari satu ABI siap. APK-nya bakal lebih besar karena semua"
  echo "   libnode.so ikut dipackage. Di HP, cuma yang cocok yang dipakai."
fi
