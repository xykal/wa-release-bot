#!/data/data/com.termux/files/usr/bin/bash
# Jalankan di Termux:  bash setup-termux.sh
set -e
echo "📦 Install dependensi Termux..."
pkg update -y
pkg install -y nodejs git unzip cronie termux-api
echo ""
echo "✅ Selesai. Langkah berikutnya:"
echo "   cd <folder-project>"
echo "   npm install"
echo "   cp config.example.json config.json && nano config.json"
echo "   npm run setup"
