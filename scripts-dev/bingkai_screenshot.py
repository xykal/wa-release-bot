#!/usr/bin/env python3
"""
Pasang tangkapan layar HP asli ke bingkai HP yang sama dengan mockup web, keluaran
WebP transparan siap taruh di web/img/hp-<nama>.webp.

  python3 scripts-dev/bingkai_screenshot.py <dir_screenshot> [dir_keluar=web/img] [--akhiran en]

--akhiran en: keluaran hp-<nama>-en.webp (tangkapan UI Inggris dari workflow
Screenshot app dengan input bahasa=en-US); ukuran di index.html tidak disentuh
karena bingkainya sama.

Nama file sumber = nama layar: beranda, rilis, grup, lagu, kerja, stack, caption, lapor
(.png/.jpg). Resolusi bebas (1080x2400, 1080x2340, 720x1600, ...): diskalakan ke lebar
layar 400 px lalu dipotong ke tinggi 760 px supaya semua bingkai di web sama besar
(560x928, sama dengan ilustrasi lama). Potongan menyisakan bagian atas (status bar +
judul kartu); khusus layar sambutan bagian bawah yang disisakan karena teks dan
tombolnya di bawah.
Bingkai: rim tipis, bezel gelap, sudut 44/34 px, kamera punch-hole, bayangan lembut
(angka sama dengan render/render.py di repo konten supaya gaya di web tetap satu).

Sebelum kirim screenshot: tutup nomor HP / nama orang lain (sensor dari HP), karena
gambar ini publik. Script tidak menyensor otomatis.
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

SW = 400            # lebar isi layar
TEPI, ATAS, PAD = 10, 14, 70
RIM, BEZEL = (70, 78, 86, 255), (12, 16, 20, 255)
SH = 760            # tinggi isi layar (rasio 400:760 = bingkai 560x928)
LAYAR = ["sambutan", "beranda", "pengaturan", "grup", "lagu", "log", "hosting", "tentang",
         "rilis", "kerja", "stack", "caption", "lapor"]
POTONG_BAWAH = {"sambutan"}  # sisakan bagian bawah, bukan atas


def bingkai(sh: int) -> Image.Image:
    S = 4
    w, h = SW + 2 * TEPI, sh + 2 * ATAS
    big = Image.new("RGBA", ((w + 2 * PAD) * S, (h + 2 * PAD) * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    p = PAD * S
    tombol = (74, 82, 90, 255)
    d.rounded_rectangle((p - 3 * S, (PAD + 130) * S, p, (PAD + 172) * S), radius=2 * S, fill=tombol)  # volume
    d.rounded_rectangle((p - 3 * S, (PAD + 184) * S, p, (PAD + 226) * S), radius=2 * S, fill=tombol)
    d.rounded_rectangle((p + w * S, (PAD + 150) * S, p + (w + 3) * S, (PAD + 212) * S), radius=2 * S, fill=tombol)  # power
    d.rounded_rectangle((p, p, p + w * S, p + h * S), radius=44 * S, fill=RIM)
    d.rounded_rectangle((p + 2 * S, p + 2 * S, p + (w - 2) * S, p + (h - 2) * S), radius=42 * S, fill=BEZEL)
    kecil = big.reduce(S)
    bayang = Image.new("RGBA", kecil.size, (0, 0, 0, 0))
    ImageDraw.Draw(bayang).rounded_rectangle((PAD + 6, PAD + 26, PAD + w + 6, PAD + h + 26), radius=44, fill=(0, 0, 0, 170))
    bayang = bayang.filter(ImageFilter.GaussianBlur(26))
    bayang.alpha_composite(kecil)
    return bayang


def pasang(sumber: Path) -> Image.Image:
    im = Image.open(sumber).convert("RGB")
    sh = SH
    im = im.resize((SW, round(im.height * SW / im.width)), Image.LANCZOS)
    if im.height > sh:
        atas = im.height - sh if sumber.stem in POTONG_BAWAH else 0
        im = im.crop((0, atas, SW, atas + sh))
    elif im.height < sh:  # HP lebih lebar dari 9:17: tempel di tengah latar gelap
        latar = Image.new("RGB", (SW, sh), (11, 20, 26))
        latar.paste(im, (0, (sh - im.height) // 2))
        im = latar
    S = 4
    mask = Image.new("L", (SW * S, sh * S), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, SW * S - 1, sh * S - 1), radius=34 * S, fill=255)
    mask = mask.reduce(S)
    hp = bingkai(sh)
    x, y = TEPI + PAD, ATAS + PAD
    hp.paste(im, (x, y), mask)
    d = ImageDraw.Draw(hp)
    cx = x + SW / 2
    d.ellipse((cx - 7, y + 9, cx + 7, y + 23), fill=(4, 6, 8))  # kamera punch-hole
    return hp


def perbarui_ukuran(html: Path, nama: str, w: int, h: int):
    """Atribut width/height <img> harus sama dengan file supaya layout tidak lompat saat memuat."""
    if not html.exists():
        return
    import re
    s = html.read_text(encoding="utf-8")
    pola = re.compile(r'(<img[^>]*src="/img/hp-' + nama + r'\.webp"[^>]*?)width="\d+" height="\d+"')
    baru = pola.sub(lambda m: f'{m.group(1)}width="{w}" height="{h}"', s)
    if baru != s:
        html.write_text(baru, encoding="utf-8")


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    arg = sys.argv[1:]
    akhiran = ""
    if "--akhiran" in arg:
        i = arg.index("--akhiran")
        akhiran = "-" + arg[i + 1]
        del arg[i:i + 2]
    sumber = Path(arg[0])
    keluar = Path(arg[1]) if len(arg) > 1 else Path(__file__).resolve().parent.parent / "web" / "img"
    keluar.mkdir(parents=True, exist_ok=True)
    n = 0
    for nama in LAYAR:
        f = next((p for ext in (".png", ".jpg", ".jpeg", ".webp") for p in [sumber / f"{nama}{ext}"] if p.exists()), None)
        if not f:
            continue
        hp = pasang(f)
        tujuan = keluar / f"hp-{nama}{akhiran}.webp"
        hp.save(tujuan, "WEBP", quality=88, method=6)
        print(f"{tujuan}  {hp.width}x{hp.height}  {tujuan.stat().st_size // 1024} KB")
        if not akhiran:
            perbarui_ukuran(keluar.parent / "index.html", nama, hp.width, hp.height)
        n += 1
    if not n:
        sys.exit(f"tidak ada file {', '.join(LAYAR)} (.png/.jpg) di {sumber}")


if __name__ == "__main__":
    main()
