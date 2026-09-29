#!/usr/bin/env bash
# Proving test pembatas burst Worker lagu (lagu/worker/worker.js, binding
# PEMBATAS_PERANGKAT: 2 panggilan / 60 detik per X-Pemasang, per lokasi CF).
# Menembak GET /lagu/batas?uji=1 (murah: baca KV saja, tanpa Groq/SoundCloud) dengan
# X-Pemasang yang sama berturut-turut; salah satu dari MAKS request pertama
# HARUS dijawab "burst":"kena".
#
#   bash scripts-dev/cek-batas-worker.sh [URL_WORKER] [MAKS=10]
#
# Kenapa "salah satu dari 10", bukan "tepat yang ke-3": Rate Limiting API
# Cloudflare sengaja permisif dan eventually consistent (isolate mengecek nilai
# cache lokal yang disinkronkan asinkron), jadi beberapa request pertama lolos
# lebih banyak dari limit. Yang dijamin: tembakan beruntun berhenti dalam
# hitungan detik. Batas HARIAN (KV: 12/perangkat, 20/IP, 180 global) tidak diuji
# di sini; counter KV bisa bocor 2-3x kalau request rapat -- lapis burst inilah
# yang menahan itu.
set -euo pipefail
URL="${1:-https://wa-release-bot-lagu.dikanjut.workers.dev}"
MAKS="${2:-10}"
ID="cek-batas-$(date -u +%s)-$RANDOM"
for i in $(seq 1 "$MAKS"); do
  BODY="$(curl -s --max-time 30 -H "X-Pemasang: $ID" "$URL/lagu/batas?uji=1" || echo '{"error":"curl gagal"}')"
  printf '%2d/%d  %s\n' "$i" "$MAKS" "$(printf '%s' "$BODY" | cut -c1-100)"
  case "$BODY" in
    *'"burst":"kena"'*) echo "LOLOS: burst per perangkat kena di request ke-$i"; exit 0 ;;
    *'"burst":"tidak ada pembatas"'*) echo "GAGAL: binding PEMBATAS_PERANGKAT tidak terpasang (deploy ulang pakai scripts-dev/deploy_worker_lagu.py)"; exit 1 ;;
  esac
done
echo "GAGAL: $MAKS request beruntun tidak ada yang ditolak burst"
exit 1
