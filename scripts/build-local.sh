#!/usr/bin/env bash
# ============================================================================
#  Build APK lengkap dari nol (sama persis dengan yang dilakukan CI).
#
#  Pakai:   bash scripts/build-local.sh [assembleDebug|assembleRelease]
#
#  Langkahnya:
#    1. bundle engine bot (esbuild → bot-js/dist/bundle.cjs)
#    2. copy bundle ke app/src/main/assets/node/
#    3. unduh libnode.so + header Node.js (kalau belum ada)
#    4. ./gradlew <task>
# ============================================================================
set -euo pipefail

TASK="${1:-assembleRelease}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

hr() { printf '\n\033[1;34m== %s ==\033[0m\n' "$1"; }

hr "1/4  Bundle engine bot (bot-js)"
if [ ! -d bot-js/node_modules ]; then
  (cd bot-js && npm ci --no-audit --no-fund)
fi
(cd bot-js && npm run build)

hr "2/4  Copy bundle.cjs → app/src/main/assets/node/"
mkdir -p app/src/main/assets/node
cp bot-js/dist/bundle.cjs app/src/main/assets/node/bundle.cjs
ls -la app/src/main/assets/node/

hr "3/4  nodejs-mobile (libnode.so + header)"
if [ -f app/src/main/jniLibs/arm64-v8a/libnode.so ] && [ -f app/libnode/include/node/node.h ]; then
  echo "ℹ️  sudah ada, dilewati. (hapus folder-nya kalau mau unduh ulang)"
else
  bash scripts/fetch-nodejs-mobile.sh
fi

hr "4/4  Gradle: $TASK"
./gradlew --no-daemon "$TASK"

hr "Selesai"
find app/build/outputs/apk -name '*.apk' -exec ls -la {} \; 2>/dev/null || true
