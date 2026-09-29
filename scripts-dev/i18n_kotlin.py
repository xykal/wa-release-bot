#!/usr/bin/env python3
"""Pindahkan literal string UI di Kotlin ke strings.xml (id + en).

Peta: scripts-dev/i18n_peta_kotlin.json = { "<literal Kotlin persis>": "<English>" }.
Literal ditulis persis seperti di sumber (termasuk $x / ${expr} dan \\n). Template
diubah ke argumen posisi: "Terakhir: $it" -> <string>Terakhir: %1$s</string> dan
pemanggilannya jadi getString(R.string.k_terakhir, it). Di kelas non-Activity
pemanggilannya a.getString(...) (semua kelas layar utama memegang `a: Activity`).

Rantai literal yang disambung `+` (tanpa ekspresi di antaranya) digabung dulu
jadi satu literal supaya jadi satu entri resource. Literal yang tidak ada di
peta tidak disentuh dan dilaporkan dengan --sisa.

Pakai:  python3 scripts-dev/i18n_kotlin.py            # tulis
        python3 scripts-dev/i18n_kotlin.py --sisa     # laporkan literal yang belum dipetakan
"""
import json
import re
import sys
from pathlib import Path

AKAR = Path(__file__).resolve().parents[1]
DIR_KT = AKAR / "app/src/main/java/com/xykals/warelease"
PETA = AKAR / "scripts-dev/i18n_peta_kotlin.json"
PETA_MANUAL = AKAR / "scripts-dev/i18n_peta_manual.json"  # {nama: {"id": ..., "en": ...}}
VALUES = AKAR / "app/src/main/res/values/strings.xml"
VALUES_EN = AKAR / "app/src/main/res/values-en/strings.xml"
# file -> awalan pemanggilan getString
BERKAS = {
    "MainActivity.kt": "getString",
    "PanelStatus.kt": "a.getString",
    "DialogTautan.kt": "a.getString",
    "LembarHitam.kt": "a.getString",
    "AksiSistem.kt": "a.getString",
    "SplashUtama.kt": "a.getString",
    # Tahap 2: layar lain. Activity/Service = Context, jadi getString langsung.
    "OnboardingActivity.kt": "getString",
    "RepoActivity.kt": "getString",
    "HostingActivity.kt": "getString",
    "BotService.kt": "getString",
}
LIT = r'"(?:[^"\\\n]|\\.)*"'
RANTAI = re.compile(rf'({LIT})(?:[ \t]*\+[ \t]*\n?[ \t]*({LIT}))')
TEMPLATE = re.compile(r"\$\{((?:[^{}]|\{[^{}]*\})*)\}|\$([A-Za-z_]\w*)")


def gabung_rantai(src: str) -> str:
    # "a" + "b" -> "ab"; diulang sampai tidak ada lagi. Rantai yang di
    # tengahnya ada ekspresi non-literal tidak digabung (bukan literal murni).
    while True:
        baru = RANTAI.sub(lambda m: m.group(1)[:-1] + m.group(2)[1:], src)
        if baru == src:
            return src
        src = baru


def slug(teks: str) -> str:
    t = re.sub(r"\$\{[^}]*\}|\$\w+", " ", teks.lower())
    t = re.sub(r"\\.", " ", t)
    t = re.sub(r"[^a-z0-9]+", "_", t).strip("_")
    kata = [k for k in t.split("_") if k][:5]
    return "k_" + "_".join(kata) if kata else "k_teks"


def escape_xml(t: str) -> str:
    t = t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    t = t.replace("'", "\\'")
    return "\\" + t if t[:1] in "@?" else t


def ke_resource(teks: str, args: list[str]) -> str:
    """Isi literal Kotlin -> isi <string>. Urutan arg mengikuti `args`."""
    def ganti(m: re.Match) -> str:
        ekspr = m.group(1) if m.group(1) is not None else m.group(2)
        return f"%{args.index(ekspr) + 1}$s"
    t = TEMPLATE.sub(ganti, teks)
    if args:
        t = re.sub(r"%(?!\d+\$s)", "%%", t)
    t = t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    t = t.replace("'", "\\'")
    if t[:1] in "@?":
        t = "\\" + t
    return t  # \n dan \" dari Kotlin sudah bentuk escape yang sama di Android


def entri_lama(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    return dict(re.findall(r'<string name="([^"]+)">(.*?)</string>', path.read_text(encoding="utf-8"), re.S))


def tulis(path: Path, tambahan: dict[str, str], komentar: str) -> None:
    gabung = entri_lama(path)
    gabung.setdefault("app_name", "WA Release Bot")
    gabung.update(tambahan)
    baris = ['<?xml version="1.0" encoding="utf-8"?>', f"<!-- {komentar} -->", "<resources>"]
    baris += [f'    <string name="{n}">{v}</string>' for n, v in gabung.items()]
    baris.append("</resources>")
    path.write_text("\n".join(baris) + "\n", encoding="utf-8")


def main() -> int:
    sisa_saja = "--sisa" in sys.argv
    peta = json.loads(PETA.read_text(encoding="utf-8"))
    lama = entri_lama(VALUES)
    lama_en = entri_lama(VALUES_EN)
    nama_dipakai = set(lama)
    # Teks yang sama persis dengan entri yang sudah ada dipakai ulang, bukan dibikin
    # kembar: u_* (layout) cukup cocok teks Indonesianya; k_* harus cocok juga
    # Inggrisnya supaya terjemahan yang beda konteks tidak ketimpa.
    nama_dari_isi = {v: n for n, v in lama.items() if n.startswith("u_")}
    nama_dari_isi_k = {(v, lama_en.get(n)): n for n, v in lama.items() if n.startswith("k_")}
    nama_dari_teks: dict[str, str] = {}
    baru_id: dict[str, str] = {}
    baru_en: dict[str, str] = {}
    sisa: list[str] = []

    for berkas, awalan in BERKAS.items():
        path = DIR_KT / berkas
        src = gabung_rantai(path.read_text(encoding="utf-8"))

        def ganti(m: re.Match) -> str:
            lit = m.group(0)
            teks = lit[1:-1]
            # Argumen ke-2 pasang(R.id.x, "nama") cuma buat log, biarkan Indonesia.
            if re.search(r"pasang\(R\.id\.\w+,\s*$", m.string[max(0, m.start() - 60):m.start()]):
                return lit
            # Literal di dalam komentar (// ... atau baris KDoc) bukan kode.
            awal_baris = m.string[m.string.rfind("\n", 0, m.start()) + 1:m.start()]
            if "//" in awal_baris or awal_baris.lstrip().startswith("*"):
                return lit
            if teks not in peta:
                if len(teks) > 1 and re.search(r"[A-Za-z]{3,}", teks) and "LogRecorder" not in m.string[max(0, m.start() - 40):m.start()]:
                    sisa.append(f"{berkas}: {lit[:90]}")
                return lit
            args: list[str] = []
            for t in TEMPLATE.finditer(teks):
                e = t.group(1) if t.group(1) is not None else t.group(2)
                if e not in args:
                    args.append(e)
            nama = nama_dari_teks.get(teks)
            if nama is None and not args and ke_resource(teks, []) in nama_dari_isi:
                nama = nama_dari_isi[ke_resource(teks, [])]
                nama_dari_teks[teks] = nama
            kunci_k = (ke_resource(teks, args), ke_resource(peta[teks], args))
            if nama is None and kunci_k in nama_dari_isi_k:
                nama = nama_dari_isi_k[kunci_k]
                nama_dari_teks[teks] = nama
            if nama is None:
                nama = slug(teks)
                dasar, n = nama, 2
                while nama in nama_dipakai:
                    nama = f"{dasar}_{n}"
                    n += 1
                nama_dipakai.add(nama)
                nama_dari_teks[teks] = nama
                baru_id[nama] = ke_resource(teks, args)
                baru_en[nama] = ke_resource(peta[teks], args)
            if args:
                return f"{awalan}(R.string.{nama}, {', '.join(args)})"
            return f"{awalan}(R.string.{nama})"

        hasil = re.sub(LIT, ganti, src)
        if not sisa_saja and hasil != path.read_text(encoding="utf-8"):
            path.write_text(hasil, encoding="utf-8")

    if sisa_saja:
        print(f"belum dipetakan: {len(sisa)}")
        for s in sisa:
            print("  " + s)
        return 0
    # Entri yang ditulis tangan di Kotlin (enum Aksi, status hosting, label splash):
    # literalnya sudah tidak ada di sumber, jadi teksnya disimpan di peta manual.
    # Isinya sudah bentuk resource (boleh memuat %1$s), jadi cuma di-escape.
    manual = json.loads(PETA_MANUAL.read_text(encoding="utf-8"))
    for nama, isi in manual.items():
        baru_id[nama] = escape_xml(isi["id"])
        baru_en[nama] = escape_xml(isi["en"])
    if baru_id:
        tulis(VALUES, baru_id, "Bahasa bawaan (Indonesia). u_* dari layout (i18n_layout.py), k_* dari Kotlin (i18n_kotlin.py).")
        tulis(VALUES_EN, baru_en, "English. u_* from layout (i18n_layout.py), k_* from Kotlin (i18n_kotlin.py); do not edit by hand.")
    print(f"dipindah: {len(baru_id)} string baru")
    return 0


if __name__ == "__main__":
    sys.exit(main())
