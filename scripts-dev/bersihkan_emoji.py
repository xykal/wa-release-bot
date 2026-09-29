#!/usr/bin/env python3
"""
Hapus emoji dari dokumen Markdown (README, docs/, CHANGELOG, template PR) dan perbaiki
tautan anchor (#...) yang tadinya mengandung slug emoji.

  python3 scripts-dev/bersihkan_emoji.py [--cek]   # --cek: hanya lapor, keluar 1 kalau ada

Yang dihapus: pictograph (U+1F000..U+1FAFF), simbol/dingbat U+2600..U+27BF kecuali tanda
centang/silang tipografis (U+2713, U+2718), panah/kotak geometris hanya kalau diberi
selector emoji (U+FE0F), plus U+FE0F dan ZWJ. Panah teks (->, →) dan diagram ASCII dibiarkan.
Pengganti bermakna: tabel "✅"/"❌" -> "ya"/"tidak"; callout "⚠️" -> "Catatan:".
Anchor: heading dislug ulang ala GitHub, tautan #-emoji lama dipetakan ke slug baru.
"""
import glob
import re
import sys
import unicodedata

FILES = sorted(set(glob.glob("*.md") + glob.glob("docs/*.md") + glob.glob(".github/*.md")))
PIKTO = re.compile("[\U0001F000-\U0001FAFF]")
SIMBOL = re.compile("[\u2600-\u27BF]")
PERTAHANKAN = {"\u2713", "\u2718"}  # ✓ ✘ tipografis
GEO_EMOJI = re.compile("[\u2190-\u21FF\u2300-\u23FF\u25A0-\u25FF\u2B00-\u2BFF]\uFE0F")
VS = re.compile("[\uFE0F\u200D]")


def bersih_teks(s: str) -> str:
    # blok kode ``` tidak boleh diubah strukturnya (indentasi komentar bash, diagram);
    # emoji tetap dihapus di mana pun.
    bagian = re.split(r"(^```.*?^```)", s, flags=re.M | re.S)
    hasil = []
    for i, b in enumerate(bagian):
        b = hapus_emoji(b)
        if i % 2 == 0:
            b = rapikan_teks(b)
        else:
            b = re.sub(r"# {2}(?=\S)", "# ", b)  # "# 📱 x" -> "# x" di pohon struktur
        hasil.append(b)
    return "".join(hasil)


def hapus_emoji(s: str) -> str:
    s = GEO_EMOJI.sub("", s)
    s = s.replace("| ❌ nggak |", "| tidak |").replace("| ✅ iya |", "| ya |")
    s = re.sub(r"\|\s*✅\s*([^|\n]*?)\s*(?=\|)", lambda m: "| ya " + m.group(1) + " " if m.group(1) else "| ya ", s)
    s = re.sub(r"\|\s*❌\s*([^|\n]*?)\s*(?=\|)", lambda m: "| tidak " + m.group(1) + " " if m.group(1) else "| tidak ", s)
    s = re.sub(r"> ⚠️?\s*(?=\*\*)", "> ", s)  # sudah ada teks tebal: cukup hapus ikonnya
    s = re.sub(r"> ⚠️?\s*", "> **Catatan.** ", s)
    s = re.sub(r"> 💡\s*", "> **Tips.** ", s)
    s = PIKTO.sub("", s)
    s = SIMBOL.sub(lambda m: m.group(0) if m.group(0) in PERTAHANKAN else "", s)
    s = VS.sub("", s)
    return re.sub(r"[ \t]+$", "", s, flags=re.M)  # spasi ekor sisa emoji


def rapikan_teks(s: str) -> str:
    s = re.sub(r"^(#{1,6})\s+", r"\1 ", s, flags=re.M)  # "##  Judul" -> "## Judul"
    s = re.sub(r"^(\s*[-*]) {2,}", r"\1 ", s, flags=re.M)  # "-  teks" sisa emoji di awal butir
    s = re.sub(r"\[ +([^\]\n]+)\]\(", r"[\1](", s)  # "[ Teks](" sisa emoji di label tautan
    return re.sub(r"^(#{1,6} [^\n]*?)[ \t]{2,}", r"\1 ", s, flags=re.M)  # spasi ganda di dalam judul


def slug_github(judul: str) -> str:
    t = re.sub(r"[*`_]", "", judul).strip().lower()
    t = "".join(c for c in t if c.isalnum() or c in " -" or unicodedata.category(c).startswith("M"))
    return t.replace(" ", "-")


def perbaiki_anchor(s: str, nama: str) -> tuple[str, list[str]]:
    slug = {}
    for m in re.finditer(r"^#{1,6} (.+)$", s, flags=re.M):
        sl = slug_github(m.group(1))
        slug.setdefault(sl, 0)
    hilang = []

    def ganti(m):
        lama = m.group(1)
        inti = re.sub(r"^(%EF%B8%8F)?-+", "", lama)
        inti = re.sub(r"^(%[0-9A-F]{2})+-*", "", inti)
        if inti in slug:
            return "(#" + inti + ")"
        kandidat = [k for k in slug if k.startswith(inti) or inti.startswith(k) and k]
        if len(kandidat) == 1:
            return "(#" + kandidat[0] + ")"
        hilang.append(f"{nama}: #{lama}")
        return m.group(0)

    return re.sub(r"\(#([^)\s]*[a-z][^)\s]*)\)", ganti, s), hilang  # (#8) = nomor PR, bukan anchor


def main():
    cek = "--cek" in sys.argv
    kotor, rusak = [], []
    for f in FILES:
        asli = open(f, encoding="utf-8").read()
        baru = bersih_teks(asli)
        baru, hilang = perbaiki_anchor(baru, f)
        rusak += hilang
        if baru != asli:
            kotor.append(f)
            if not cek:
                open(f, "w", encoding="utf-8").write(baru)
    if cek:
        sisa = [f for f in FILES if PIKTO.search(open(f, encoding="utf-8").read()) or VS.search(open(f, encoding="utf-8").read())]
        print("emoji tersisa di:", sisa or "-")
        print("anchor rusak:", rusak or "-")
        sys.exit(1 if sisa or rusak else 0)
    print("dibersihkan:", ", ".join(kotor) or "-")
    if rusak:
        print("anchor belum ketemu:\n  " + "\n  ".join(rusak))


if __name__ == "__main__":
    main()
