#!/usr/bin/env bash
# ============================================================================
#  Unduh nodejs-mobile (libnode.so + header Node.js) ke tempat yang dipakai
#  build Android. Sekali jalan, ±57 MB.
#
#  Dipakai oleh:
#    - developer lokal   : bash scripts/fetch-nodejs-mobile.sh
#    - GitHub Actions    : langkah "Download nodejs-mobile" di build-apk.yml
#
#  Hasilnya:
#    app/src/main/jniLibs/arm64-v8a/libnode.so   ← Gradle otomatis mem-package ini
#    app/libnode/include/node/*.h                ← header untuk CMake
# ============================================================================
set -euo pipefail

NODEJS_MOBILE_VERSION="${NODEJS_MOBILE_VERSION:-v18.20.4}"
ABI="${ABI:-arm64-v8a}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ZIP_URL="https://github.com/nodejs-mobile/nodejs-mobile/releases/download/${NODEJS_MOBILE_VERSION}/nodejs-mobile-${NODEJS_MOBILE_VERSION}-android.zip"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "⬇️  nodejs-mobile ${NODEJS_MOBILE_VERSION} (${ABI})"
echo "    ${ZIP_URL}"

curl -fsSL --retry 3 --retry-delay 2 -o "${TMP_DIR}/njsm.zip" "$ZIP_URL"
unzip -q "${TMP_DIR}/njsm.zip" -d "${TMP_DIR}/njsm"

SRC_SO="${TMP_DIR}/njsm/bin/${ABI}/libnode.so"
if [ ! -f "$SRC_SO" ]; then
  echo "❌ libnode.so tidak ada di dalam zip untuk ABI ${ABI}" >&2
  echo "   Isi bin/: $(ls "${TMP_DIR}/njsm/bin" 2>/dev/null || echo '(kosong)')" >&2
  exit 1
fi

mkdir -p "${ROOT}/app/src/main/jniLibs/${ABI}" "${ROOT}/app/libnode"
cp "$SRC_SO" "${ROOT}/app/src/main/jniLibs/${ABI}/libnode.so"
rm -rf "${ROOT}/app/libnode/include"
cp -r "${TMP_DIR}/njsm/include" "${ROOT}/app/libnode/include"

if [ ! -f "${ROOT}/app/libnode/include/node/node.h" ]; then
  echo "❌ include/node/node.h tidak ditemukan setelah copy — struktur zip berubah?" >&2
  exit 1
fi

echo "✅ libnode.so  → app/src/main/jniLibs/${ABI}/libnode.so ($(du -h "${ROOT}/app/src/main/jniLibs/${ABI}/libnode.so" | cut -f1))"
echo "✅ header      → app/libnode/include/node/ ($(ls "${ROOT}/app/libnode/include/node" | wc -l) file)"
echo "   Node version: $(cat "${TMP_DIR}/njsm/include/node/node_version.h" 2>/dev/null | grep -E 'define NODE_MAJOR|define NODE_MINOR|define NODE_PATCH' | tr -d ' ' | tr '\n' ' ')"
