#!/usr/bin/env python3
"""Render konten TikTok "WA Release Bot" — 1080x1920, 30 fps, VO + subtitle karaoke.

Pakai:  python3 render.py            (render penuh, 2 proses paralel)
        python3 render.py --cek 12.5 (simpan satu frame di detik 12.5 ke cek.png)
Template-nya sengaja konsisten (warna, font, posisi judul/HP/subtitle) biar
video berikutnya tinggal ganti isi SCENES.
"""
import math, os, sys, wave, subprocess, random
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.dirname(os.path.abspath(__file__))
W, H, FPS = 1080, 1920, 30
FONT = '/home/user/assets-xyverse/x/05_font_open_source/'
F_BLACK = FONT + 'font_logo_judul_hero__archivo-expanded-black.ttf'
F_SEMI = FONT + 'font_subjudul_tombol__archivo-semibold.ttf'
F_REG = FONT + 'font_body_footer__archivo-regular.ttf'
LOGO = '/home/user/wa-release-bot/app/src/main/res/drawable-nodpi/xyverse_logo.webp'

BG = (11, 20, 26); KARTU = (17, 27, 33); KARTU2 = (32, 44, 51); GARIS = (42, 57, 66)
HIJAU = (0, 168, 132); HIJAU_T = (37, 211, 102); HIJAU_TUA = (0, 92, 75)
TEKS = (233, 237, 239); TEKS2 = (134, 150, 160); MERAH = (241, 92, 109); KUNING = (255, 196, 0)

_fc = {}
def font(path, size):
    k = (path, int(size))
    if k not in _fc: _fc[k] = ImageFont.truetype(path, int(size))
    return _fc[k]

# ---------- easing ----------
def clamp(x, a=0.0, b=1.0): return a if x < a else b if x > b else x
def e_out(x): x = clamp(x); return 1 - (1 - x) ** 3
def e_io(x): x = clamp(x); return 4 * x ** 3 if x < .5 else 1 - (-2 * x + 2) ** 3 / 2
def e_back(x, s=1.7):
    x = clamp(x) - 1; return x * x * ((s + 1) * x + s) + 1
def prog(t, a, dur): return clamp((t - a) / dur)
def mix(c1, c2, u): return tuple(int(c1[i] + (c2[i] - c1[i]) * u) for i in range(3))

# ---------- naskah ----------
SCENES = [
    dict(vo='01', judul='Grup WA sering kemasukan *akun aneh?*',
         teks='Grup WhatsApp kamu sering kemasukan akun aneh? Aku bikin bot yang jagain grup, otomatis.'),
    dict(vo='02', judul='Aku bikin *bot WA* sendiri',
         teks='Namanya WA Release Bot. Jalan langsung dari HP Android. Nggak perlu server, nggak perlu laptop.'),
    dict(vo='03', judul='Nyambung pakai *kode pairing*',
         teks='Cara nyambunginnya gampang. Cukup masukin kode pairing, kayak nambah perangkat WhatsApp biasa.'),
    dict(vo='04', judul='Auto *tolak* yang pernah keluar',
         teks='Permintaan gabung ke grup dicek berkala. Yang dulu udah keluar, atau pernah di-kick, langsung ditolak otomatis. Grup kamu tetap aman, tanpa harus dipantau terus.'),
    dict(vo='05', judul='Channel *nggak sepi* lagi',
         teks='Terus, channel kamu nggak bakal sepi. Tiap hari bot ngirim potongan lagu, lengkap sama caption yang pas.'),
    dict(vo='06', judul='Caption-nya *kena banget*',
         teks='Kadang kata-kata galau, kadang ayat, kadang pantun gaul kayak gini. Ditelpon berdering, ternyata lagi gaya miring.'),
    dict(vo='07', judul='Ringan & *hemat baterai*',
         teks='Hemat baterai, ada perekam log kalau ada masalah, dan tampilannya gelap, hijau, ala WhatsApp.'),
    dict(vo='08', judul='Fitur apa lagi? *Tulis di komen*',
         teks='Menurut kamu, fitur apa lagi yang harus aku tambahin? Tulis di komen, ya. Follow biar nggak ketinggalan update berikutnya.'),
]
JEDA_AWAL, JEDA_AKHIR, OUTRO = 0.12, 0.30, 2.0

def baca_wav(p):
    w = wave.open(p); a = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768
    return a, w.getframerate()

def waktu_kata(a, sr, teks):
    """Perkiraan waktu tiap kata: karakter dipetakan ke waktu bicara (jeda diskip)."""
    fr = sr // 100
    r = np.sqrt(np.convolve(a ** 2, np.ones(fr) / fr, 'same')[::fr])
    bicara = r >= 0.012
    idx = np.nonzero(bicara)[0]
    t_bicara = [k / 100 for k in range(idx[0], idx[-1] + 1) if bicara[k] or _jeda_pendek(bicara, k)]
    kata = teks.split()
    bobot = [len(k.strip('.,?!')) + 1.5 for k in kata]
    tot = sum(bobot); hasil = []; acc = 0
    n = len(t_bicara)
    for k, b in zip(kata, bobot):
        i0 = int(acc / tot * (n - 1)); acc += b; i1 = int(acc / tot * (n - 1))
        hasil.append((k, t_bicara[i0], t_bicara[i1] + 0.01))
    return hasil

def _jeda_pendek(bicara, k, maks=11):
    # jeda < 110 ms dihitung bagian dari bicara
    l = k
    while l > 0 and not bicara[l]: l -= 1
    r = k
    while r < len(bicara) - 1 and not bicara[r]: r += 1
    return (r - l) <= maks

def bangun_timeline():
    t = 0.0
    for s in SCENES:
        a, sr = baca_wav(os.path.join(ROOT, 'wav', s['vo'] + '.wav'))
        s['audio'] = a; s['sr'] = sr
        s['dur_vo'] = len(a) / sr
        s['mulai'] = t
        s['vo_mulai'] = t + JEDA_AWAL
        s['dur'] = JEDA_AWAL + s['dur_vo'] + JEDA_AKHIR
        s['kata'] = [(k, s['vo_mulai'] + a0, s['vo_mulai'] + a1) for k, a0, a1 in waktu_kata(a, sr, s['teks'])]
        t += s['dur']
    SCENES[-1]['dur'] += OUTRO
    return t + OUTRO

# ---------- bentuk morph (sama kayak splash app) ----------
def bentuk_morph():
    from shapely.geometry import box, Point, Polygon
    from shapely.ops import unary_union
    N = 240
    def rr(l, t, r, b, rad):
        return unary_union([box(l + rad, t, r - rad, b), box(l, t + rad, r, b - rad)] +
                           [Point(x, y).buffer(rad, 48) for x, y in [(l + rad, t + rad), (r - rad, t + rad), (l + rad, b - rad), (r - rad, b - rad)]])
    def samp(g):
        if g.geom_type == 'MultiPolygon': g = max(g.geoms, key=lambda x: x.length)
        ring = g.exterior; L = ring.length
        pts = np.array([ring.interpolate(L * k / N).coords[0] for k in range(N)]) / 100 - 1
        x, y = pts[:, 0], pts[:, 1]
        if np.sum(x * np.roll(y, -1) - np.roll(x, -1) * y) < 0: pts = pts[::-1]
        k = np.argmin(np.abs(np.arctan2(pts[:, 1], pts[:, 0]) + math.pi / 2)); return np.roll(pts, -k, axis=0)
    C = lambda x, y, r: Point(x, y).buffer(r, 48)
    S = [samp(unary_union([rr(40, 62, 160, 162, 30), rr(96, 34, 104, 66, 4), C(100, 30, 11), rr(26, 96, 44, 128, 7), rr(156, 96, 174, 128, 7)])),
         samp(unary_union([rr(28, 44, 172, 142, 34), Polygon([(52, 128), (40, 172), (98, 136)])])),
         samp(unary_union([C(68, 146, 23), C(142, 128, 23), rr(81, 50, 91, 148, 3), rr(155, 32, 165, 130, 3), Polygon([(81, 50), (165, 32), (165, 58), (81, 76)])]))]
    xy = []
    for i in range(8):
        d = i * 2 * math.pi / 8 - math.pi / 2
        for r, gs in [(66, -.3), (86, -.17), (86, .17), (66, .3)]: xy.append((100 + r * math.cos(d + gs), 100 + r * math.sin(d + gs)))
    S.append(samp(Polygon(xy)))
    return S
MORPH = None

# ---------- aset statis ----------
PX, PY, PW, PH = 290, 480, 500, 960          # bingkai HP di frame
BZ = 16                                       # tebal bezel
SW, SH = PW - 2 * BZ, PH - 2 * BZ             # layar (468 x 928)
K = 2                                         # layar digambar 2x lalu dikecilin (anti-alias)

def buat_statis():
    st = {}
    bg = Image.new('RGB', (W, H), BG)
    # glow hijau lembut di belakang HP
    g = Image.new('L', (W, H), 0); gd = ImageDraw.Draw(g)
    gd.ellipse([PX - 260, PY + 80, PX + PW + 260, PY + PH - 60], fill=90)
    g = g.filter(ImageFilter.GaussianBlur(170))
    bg = Image.composite(Image.new('RGB', (W, H), (0, 70, 52)), bg, g)
    # grid titik tipis
    d = ImageDraw.Draw(bg)
    for y in range(40, H, 54):
        for x in range(27, W, 54):
            d.ellipse([x - 1.6, y - 1.6, x + 1.6, y + 1.6], fill=(24, 36, 43))
    # vignette
    v = Image.new('L', (W, H), 0); vd = ImageDraw.Draw(v)
    vd.rectangle([0, 0, W, H], fill=255); vd.ellipse([-260, -160, W + 260, H + 160], fill=0)
    v = v.filter(ImageFilter.GaussianBlur(220))
    bg = Image.composite(Image.new('RGB', (W, H), (4, 8, 11)), bg, v)
    st['bg'] = bg
    # bingkai HP (2x lalu kecilin)
    ph = Image.new('RGBA', (PW * 2 + 80, PH * 2 + 80), (0, 0, 0, 0)); pd = ImageDraw.Draw(ph)
    sh = Image.new('L', ph.size, 0); ImageDraw.Draw(sh).rounded_rectangle([60, 80, PW * 2 + 20, PH * 2 + 60], 110, fill=160)
    sh = sh.filter(ImageFilter.GaussianBlur(30))
    ph.paste((0, 0, 0, 255), (0, 0), sh)
    pd.rounded_rectangle([40, 40, 40 + PW * 2, 40 + PH * 2], 104, fill=(28, 38, 44))
    pd.rounded_rectangle([44, 44, 36 + PW * 2, 36 + PH * 2], 100, fill=(8, 12, 15))
    pd.rounded_rectangle([40 + BZ * 2, 40 + BZ * 2, 40 + PW * 2 - BZ * 2, 40 + PH * 2 - BZ * 2], 76, fill=(0, 0, 0, 0))
    st['hp'] = ph.resize((PW + 40, PH + 40), Image.LANCZOS)
    m = Image.new('L', (SW * 2, SH * 2), 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, SW * 2 - 1, SH * 2 - 1], 76, fill=255)
    st['mask_layar'] = m.resize((SW, SH), Image.LANCZOS)
    lg = Image.open(LOGO).convert('RGBA'); st['logo'] = lg
    return st
ST = None

def logo_ukuran(h):
    lg = ST['logo']; return lg.resize((int(lg.width * h / lg.height), int(h)), Image.LANCZOS)

# ---------- helper gambar layar (koordinat 2x: 936 x 1856) ----------
LW, LH = SW * K, SH * K

def teks(d, xy, s, f, fill, anchor='la'):
    d.text(xy, s, font=f, fill=fill, anchor=anchor)

def status_bar(d):
    teks(d, (64, 44), '09:41', font(F_SEMI, 30), TEKS)
    # pulau kamera
    d.rounded_rectangle([LW / 2 - 90, 26, LW / 2 + 90, 74], 24, fill=(0, 0, 0))
    x = LW - 70
    d.rounded_rectangle([x - 44, 40, x, 62], 6, outline=TEKS, width=3); d.rectangle([x - 40, 44, x - 14, 58], fill=TEKS)
    for i in range(4): d.rectangle([x - 110 + i * 12, 60 - i * 6, x - 102 + i * 12, 62], fill=TEKS)

def header_wa(d, judul, sub, warna_avatar=HIJAU, ikon=None):
    d.rectangle([0, 0, LW, 230], fill=(31, 44, 52))
    status_bar(d)
    d.polygon([(52, 160), (74, 138), (74, 182)], fill=TEKS)
    d.ellipse([100, 118, 184, 202], fill=warna_avatar)
    if ikon: ikon(d, 142, 160, 30)
    teks(d, (206, 124), judul, font(F_SEMI, 36), TEKS)
    teks(d, (206, 170), sub, font(F_REG, 26), TEKS2)

def header_app(d, judul='WA Release Bot'):
    d.rectangle([0, 0, LW, 220], fill=BG)
    status_bar(d)
    gambar_bulan(d, 90, 160, 34)
    teks(d, (142, 136), judul, font(F_BLACK, 38), TEKS)
    d.rounded_rectangle([LW - 150, 132, LW - 56, 186], 27, fill=HIJAU_TUA)
    teks(d, (LW - 103, 159), 'ON', font(F_SEMI, 26), HIJAU_T, 'mm')

def gambar_bulan(d, cx, cy, r, warna=HIJAU_T, lat=BG):
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=warna)
    d.ellipse([cx - r + r * .55, cy - r - r * .2, cx + r + r * .55, cy + r - r * .2], fill=lat)

def ikon_perisai(d, cx, cy, s, warna=(255, 255, 255), cek=True, lat=None):
    pts = [(cx, cy - s), (cx + s * .85, cy - s * .62), (cx + s * .78, cy + s * .2), (cx, cy + s), (cx - s * .78, cy + s * .2), (cx - s * .85, cy - s * .62)]
    d.polygon(pts, fill=warna)
    if cek:
        c = lat or HIJAU
        d.line([(cx - s * .38, cy + s * .02), (cx - s * .08, cy + s * .32), (cx + s * .42, cy - s * .3)], fill=c, width=int(s * .2), joint='curve')

def ikon_cek(d, cx, cy, s, warna, u=1.0, w=None):
    a = (cx - s * .5, cy + s * .02); b = (cx - s * .14, cy + s * .38); c = (cx + s * .55, cy - s * .36)
    w = w or int(s * .22)
    if u <= .4:
        v = u / .4; d.line([a, (a[0] + (b[0] - a[0]) * v, a[1] + (b[1] - a[1]) * v)], fill=warna, width=w)
    else:
        v = (u - .4) / .6; d.line([a, b, (b[0] + (c[0] - b[0]) * v, b[1] + (c[1] - b[1]) * v)], fill=warna, width=w, joint='curve')

def ikon_x(d, cx, cy, s, warna, w=None):
    w = w or int(s * .22)
    d.line([(cx - s * .4, cy - s * .4), (cx + s * .4, cy + s * .4)], fill=warna, width=w)
    d.line([(cx + s * .4, cy - s * .4), (cx - s * .4, cy + s * .4)], fill=warna, width=w)

def ikon_hati(d, cx, cy, s, warna):
    d.ellipse([cx - s, cy - s * .7, cx, cy + s * .3], fill=warna); d.ellipse([cx, cy - s * .7, cx + s, cy + s * .3], fill=warna)
    d.polygon([(cx - s * .96, cy - s * .05), (cx + s * .96, cy - s * .05), (cx, cy + s)], fill=warna)

def denyut(d, cx, cy, r0, t, warna, periode=1.2, jumlah=2, lebar=6):
    for i in range(jumlah):
        u = ((t / periode) + i / jumlah) % 1
        r = r0 + u * r0 * .9; a = 1 - u
        d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=mix(BG, warna, a * .9), width=lebar)

def bungkus(s, f, maks):
    kata = s.split(); baris = []; cur = ''
    for k in kata:
        c = (cur + ' ' + k).strip()
        if f.getlength(c) <= maks: cur = c
        else: baris.append(cur); cur = k
    if cur: baris.append(cur)
    return baris

def jari(d, x, y, t_tap, t):
    """Indikator sentuhan: lingkaran putih + riak."""
    u = t - t_tap
    if -0.35 < u < 0.7:
        a = clamp(1 - abs(u) / 0.35) if u < 0 else clamp(1 - u / 0.7)
        r = 34 - 8 * clamp(1 - abs(u) / .12)
        d.ellipse([x - r, y - r, x + r, y + r], fill=mix((60, 70, 76), (255, 255, 255), a * .85))
        if u > 0:
            rr = 34 + u * 140
            d.ellipse([x - rr, y - rr, x + rr, y + rr], outline=mix(BG, (255, 255, 255), clamp(1 - u / .7) * .6), width=5)

# ---------- scene layar ----------
def layar_1(im, d, t, D):
    header_wa(d, 'Komunitas Kita', 'Permintaan bergabung', (52, 72, 82), lambda d, x, y, s: ikon_perisai(d, x, y, s, TEKS, False))
    nama = [('User8472910', 'baru bikin akun'), ('+62 812-0000-xxxx', 'tanpa foto'), ('Akun Tanpa Nama', 'ingin bergabung'),
            ('Akun Baru 2026', 'ingin bergabung'), ('Tamu 0192', 'tanpa foto'), ('xX_b0t_Xx', 'ingin bergabung')]
    y0 = 270
    for i, (n, s) in enumerate(nama):
        u = e_back(prog(t, 0.05 + i * 0.28, 0.45))
        if u <= 0: continue
        y = y0 + i * 188; x = (1 - u) * LW
        tolak = prog(t, 3.1 + i * 0.16, 0.25)
        d.rounded_rectangle([40 + x, y, LW - 40 + x, y + 164], 34, fill=mix(KARTU2, (60, 28, 34), tolak * .6))
        d.ellipse([72 + x, y + 36, 164 + x, y + 128], fill=(70, 82, 90))
        teks(d, (118 + x, y + 82), '?', font(F_BLACK, 50), TEKS2, 'mm')
        d.ellipse([140 + x, y + 30, 172 + x, y + 62], fill=MERAH); teks(d, (156 + x, y + 46), '!', font(F_BLACK, 24), (255, 255, 255), 'mm')
        teks(d, (196 + x, y + 44), n, font(F_SEMI, 36), TEKS)
        teks(d, (196 + x, y + 96), s, font(F_REG, 27), MERAH if 'baru' in s else TEKS2)
        if tolak > 0:
            sc = e_back(tolak, 2.5)
            cx, cy = LW - 120 + x, y + 82
            d.rounded_rectangle([cx - 90 * sc, cy - 32 * sc, cx + 90 * sc, cy + 32 * sc], 32 * sc, fill=MERAH)
            if sc > .5: teks(d, (cx, cy), 'Ditolak', font(F_SEMI, int(28 * sc)), (255, 255, 255), 'mm')
    # perisai "dijaga bot"
    u = prog(t, 2.45, 0.5)
    if u > 0:
        cx, cy = LW / 2, LH - 250
        sc = e_back(u, 2.2)
        denyut(d, cx, cy, 110 * sc, t, HIJAU_T, 1.0, 2, 8)
        d.ellipse([cx - 110 * sc, cy - 110 * sc, cx + 110 * sc, cy + 110 * sc], fill=HIJAU)
        ikon_perisai(d, cx, cy, 62 * sc, (255, 255, 255), True, HIJAU)
        if u > .5:
            d.rounded_rectangle([cx - 190, cy + 128, cx + 190, cy + 196], 34, fill=HIJAU_TUA)
            teks(d, (cx, cy + 162), 'DIJAGA BOT', font(F_BLACK, 34), HIJAU_T, 'mm')

def layar_splash(im, d, t, D, label=True):
    global MORPH
    if MORPH is None: MORPH = bentuk_morph()
    d.rectangle([0, 0, LW, LH], fill=BG)
    status_bar(d)
    diam, ubah = .42, .56; seg = diam + ubah
    ke = int(t // seg) % 4; lok = t % seg; lagi = lok >= diam
    u = e_back((lok - diam) / ubah, 1.3) if lagi else 0
    sud = t / .9; R = np.array([[math.cos(sud), -math.sin(sud)], [math.sin(sud), math.cos(sud)]]); g = MORPH[3] @ R.T
    a = g if ke == 3 else MORPH[ke]; b = g if (ke + 1) % 4 == 3 else MORPH[(ke + 1) % 4]
    cur = a + (b - a) * u
    cx, cy = LW / 2, LH * .40
    for r in range(300, 0, -12):
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=mix(BG, (10, 90, 60), (1 - r / 300) ** 1.8 * .8))
    s = 190 * (1 + .025 * math.sin(t / .26))
    d.polygon([(cx + x * s, cy + y * s) for x, y in cur], fill=HIJAU_T)
    al = 1 if not lagi else clamp(1 - (lok - diam) / (ubah * .35))
    if al > 0:
        col = mix(HIJAU_T, BG, al); P = lambda v, c: c + (v / 100 - 1) * s; sk = s / 100
        if ke == 0:
            kk = .15 if (t % 2.4) < .11 else 1
            for x in (76, 124): d.ellipse([P(x, cx) - 11 * sk, P(108, cy) - 11 * sk * kk, P(x, cx) + 11 * sk, P(108, cy) + 11 * sk * kk], fill=col)
            d.rounded_rectangle([P(82, cx), P(132, cy), P(118, cx), P(141, cy)], radius=5 * sk, fill=col)
        if ke == 1:
            for i in range(3):
                j = max(0, math.sin(t / .14 - i * .9)) * 7
                d.ellipse([P(70 + i * 30, cx) - 9 * sk, P(92 - j, cy) - 9 * sk, P(70 + i * 30, cx) + 9 * sk, P(92 - j, cy) + 9 * sk], fill=col)
        if ke == 3:
            d.ellipse([cx - 24 * sk, cy - 24 * sk, cx + 24 * sk, cy + 24 * sk], fill=col)
    teks(d, (cx, LH * .64), 'WA Release Bot', font(F_BLACK, 52), TEKS, 'mm')
    if label:
        lab = ['Bot penjaga siap', 'Ngobrol di grup', 'Lagu buat channel', 'Semua jalan otomatis']
        tampil = (ke + 1) % 4 if lagi else ke
        q = (lok - diam) if lagi else lok + ubah
        sc = 1 if q > .37 else (1 - .14 * (q / .11) ** 2 if q < .11 else .86 + .14 * e_back((q - .11) / .26, 2.2))
        if t < .1: sc = 1
        f = font(F_SEMI, 36 * sc); tw = f.getlength(lab[tampil])
        bw = max(340 * sc, tw + 80 * sc); bh = 84 * sc; by = LH * .70
        d.polygon([(cx - 16 * sc, by + 2), (cx, by - 16 * sc), (cx + 16 * sc, by + 2)], fill=HIJAU_TUA)
        d.rounded_rectangle([cx - bw / 2, by, cx + bw / 2, by + bh], bh / 2, fill=HIJAU_TUA)
        teks(d, (cx, by + bh / 2), lab[tampil], f, TEKS, 'mm')
    teks(d, (cx, LH - 150), 'BUILT IN', font(F_REG, 22), TEKS2, 'mm')
    lg = logo_ukuran(52); im.alpha_composite(lg, (int(cx - lg.width / 2), LH - 120))

def layar_3(im, d, t, D):
    header_app(d)
    y = 280
    d.rounded_rectangle([40, y, LW - 40, y + 900], 40, fill=KARTU)
    tertaut = prog(t, 3.35, .35)
    teks(d, (84, y + 60), 'Tautkan WhatsApp', font(F_BLACK, 40), TEKS)
    teks(d, (84, y + 120), 'Masukkan nomor, lalu ketik kode', font(F_REG, 28), TEKS2)
    teks(d, (84, y + 158), 'di WA > Perangkat tertaut', font(F_REG, 28), TEKS2)
    # nomor diketik
    nomor = '62 812 3456 7890'; n = int(clamp((t - .15) / .8) * len(nomor))
    d.rounded_rectangle([84, y + 220, LW - 84, y + 320], 26, fill=KARTU2)
    teks(d, (120, y + 270), nomor[:n] + ('|' if (t * 2) % 1 < .5 and n < len(nomor) else ''), font(F_SEMI, 36), TEKS, 'lm')
    # tombol
    tk = prog(t, 1.05, .2)
    bs = 1 - .06 * math.sin(math.pi * tk)
    bx0, bx1, by0, by1 = 84, LW - 84, y + 350, y + 450; cxb, cyb = (bx0 + bx1) / 2, (by0 + by1) / 2
    d.rounded_rectangle([cxb - (bx1 - bx0) / 2 * bs, cyb - 50 * bs, cxb + (bx1 - bx0) / 2 * bs, cyb + 50 * bs], 50, fill=HIJAU)
    teks(d, (cxb, cyb), 'Minta kode pairing', font(F_SEMI, 34), (255, 255, 255), 'mm')
    # kode
    kode = 'K7Q2-9XMA'
    bw = 78; gap = 10; tot = 8 * bw + 7 * gap + 30; x0 = (LW - tot) / 2
    j = 0
    for i, ch in enumerate(kode):
        if ch == '-':
            teks(d, (x0 + 15, y + 570), '–', font(F_BLACK, 40), TEKS2, 'mm'); x0 += 30; continue
        u = e_back(prog(t, 1.35 + j * .13, .3), 2)
        warna = mix(KARTU2, HIJAU_TUA, tertaut)
        d.rounded_rectangle([x0, y + 510, x0 + bw, y + 630], 18, fill=warna, outline=mix(GARIS, HIJAU_T, u) if u > 0 else GARIS, width=3)
        if u > 0:
            teks(d, (x0 + bw / 2, y + 570), ch, font(F_BLACK, int(46 * max(u, .01))), TEKS, 'mm')
        x0 += bw + gap; j += 1
    # status
    cy = y + 760
    if tertaut > 0:
        sc = e_back(tertaut, 2)
        denyut(d, LW / 2 - 150, cy, 44, t - 3.35, HIJAU_T, 1.0, 2, 5)
        d.ellipse([LW / 2 - 150 - 44 * sc, cy - 44 * sc, LW / 2 - 150 + 44 * sc, cy + 44 * sc], fill=HIJAU)
        ikon_cek(d, LW / 2 - 150, cy, 44, (255, 255, 255), prog(t, 3.5, .35))
        teks(d, (LW / 2 - 84, cy), 'Tertaut!', font(F_BLACK, 44), HIJAU_T, 'lm')
    else:
        a = int((t * 3) % 3) + 1
        teks(d, (LW / 2, cy), 'Menunggu' + '.' * a, font(F_SEMI, 34), TEKS2, 'mm')
    jari(d, cxb + 150, cyb + 10, 1.05, t)

def layar_4(im, d, t, D):
    header_app(d)
    y = 250
    d.rounded_rectangle([40, y, LW - 40, y + 150], 36, fill=KARTU)
    # ikon refresh muter
    cx, cy = 118, y + 75; sud = t * 3
    d.arc([cx - 34, cy - 34, cx + 34, cy + 34], math.degrees(sud), math.degrees(sud) + 290, fill=HIJAU_T, width=8)
    teks(d, (180, y + 50), 'Penjaga grup', font(F_BLACK, 36), TEKS)
    teks(d, (180, y + 100), 'Cek permintaan berkala  •  hemat batre', font(F_REG, 26), TEKS2)
    orang = [('Rina Amelia', 'ok', ''), ('Dimas_07', 'no', 'pernah keluar'), ('Sari Putri', 'ok', ''),
             ('Bayu Pratama', 'no', 'pernah di-kick'), ('Andi Saputra', 'ok', '')]
    warna_av = [(233, 120, 90), (110, 150, 230), (200, 110, 190), (240, 180, 70), (90, 190, 170)]
    for i, (n, st, why) in enumerate(orang):
        u = e_out(prog(t, .1 + i * .12, .4))
        yy = y + 190 + i * 150 + (1 - u) * 60
        d.rounded_rectangle([40, yy, LW - 40, yy + 132], 30, fill=KARTU)
        d.ellipse([70, yy + 26, 150, yy + 106], fill=warna_av[i])
        teks(d, (110, yy + 66), n[0], font(F_BLACK, 38), (255, 255, 255), 'mm')
        teks(d, (176, yy + 36), n, font(F_SEMI, 34), TEKS)
        r = prog(t, 1.0 + i * 1.05, .3)
        if st == 'no' and r > 0:
            teks(d, (176, yy + 84), why, font(F_SEMI, 26), mix(TEKS2, MERAH, r))
        else:
            teks(d, (176, yy + 84), 'minta gabung', font(F_REG, 26), TEKS2)
        cxs, cys = LW - 118, yy + 66
        if r <= 0:
            a = (t * 2 + i * .3) % 1
            for k in range(3):
                d.ellipse([cxs - 40 + k * 30 - 7, cys - 7, cxs - 40 + k * 30 + 7, cys + 7], fill=mix(KARTU, TEKS2, .4 + .6 * (abs(math.sin((t * 3 - k * .4))))))
        else:
            sc = e_back(r, 2.4); c = HIJAU if st == 'ok' else MERAH
            d.rounded_rectangle([cxs - 70 * sc, cys - 34 * sc, cxs + 70 * sc, cys + 34 * sc], 34 * sc, fill=c)
            if st == 'ok': ikon_cek(d, cxs, cys, 34 * sc, (255, 255, 255), prog(t, 1.1 + i * 1.05, .3))
            else: ikon_x(d, cxs, cys, 30 * sc, (255, 255, 255))
            if r < 1 and st == 'no':
                d.rounded_rectangle([40, yy, LW - 40, yy + 132], 30, outline=mix(KARTU, MERAH, 1 - r), width=4)
    u = prog(t, 6.7, .4)
    if u > 0:
        sc = e_back(u, 2)
        cy = y + 190 + 5 * 150 + 90
        w = 400 * sc
        d.rounded_rectangle([LW / 2 - w / 2, cy - 50 * sc, LW / 2 + w / 2, cy + 50 * sc], 50 * sc, fill=HIJAU_TUA)
        if sc > .6:
            ikon_perisai(d, LW / 2 - 130, cy, 30, HIJAU_T, True, HIJAU_TUA)
            teks(d, (LW / 2 + 22, cy), 'Grup aman', font(F_BLACK, 36), HIJAU_T, 'mm')

def gelombang(d, x0, y0, w, h, t, p, warna_a, warna_b, n=34, seed=3):
    rnd = random.Random(seed)
    hs = [0.25 + 0.75 * abs(math.sin(i * 1.7 + rnd.random() * 3)) for i in range(n)]
    bw = w / n
    for i, hh in enumerate(hs):
        main = p > i / n
        amp = hh * (0.75 + 0.25 * math.sin(t * 9 + i)) if main and p < 1 else hh
        hy = max(8, h * amp)
        x = x0 + i * bw
        d.rounded_rectangle([x + bw * .22, y0 + h / 2 - hy / 2, x + bw * .78, y0 + h / 2 + hy / 2], bw * .28, fill=warna_a if main else warna_b)

def ikon_not(d, cx, cy, s, warna):
    d.ellipse([cx - s * .6, cy + s * .2, cx - s * .05, cy + s * .7], fill=warna)
    d.rectangle([cx - s * .14, cy - s * .7, cx - s * .04, cy + s * .45], fill=warna)
    d.polygon([(cx - s * .14, cy - s * .7), (cx + s * .5, cy - s * .45), (cx + s * .5, cy - s * .2), (cx - s * .04, cy - s * .42)], fill=warna)

def layar_5(im, d, t, D):
    header_wa(d, 'Lagu Harian', 'Saluran  •  2,4 rb pengikut', HIJAU, lambda d, x, y, s: ikon_not(d, x, y, s, (255, 255, 255)))
    d.rectangle([0, 230, LW, LH], fill=(11, 20, 26))
    teks(d, (LW / 2, 300), 'HARI INI', font(F_SEMI, 24), TEKS2, 'mm')
    u = e_back(prog(t, .35, .5), 1.4)
    if u > 0:
        y = 360 + (1 - u) * 120
        d.rounded_rectangle([60, y, LW - 60, y + 560], 40, fill=(32, 44, 51))
        # voice note
        cx, cy = 150, y + 110
        main = prog(t, 1.2, 4.2)
        d.ellipse([cx - 54, cy - 54, cx + 54, cy + 54], fill=HIJAU)
        if t < 1.2: d.polygon([(cx - 16, cy - 26), (cx - 16, cy + 26), (cx + 26, cy)], fill=(255, 255, 255))
        else: d.rectangle([cx - 20, cy - 24, cx - 6, cy + 24], fill=(255, 255, 255)); d.rectangle([cx + 6, cy - 24, cx + 20, cy + 24], fill=(255, 255, 255))
        gelombang(d, 230, cy - 45, LW - 360, 90, t, main, HIJAU_T, (84, 101, 111))
        detik = int(main * 60)
        teks(d, (230, cy + 70), f'0:{detik:02d} / 1:00', font(F_REG, 24), TEKS2)
        # caption
        cap = prog(t, 2.3, .6)
        if cap > 0:
            baris = ['Nadin Amizah — Bertaut', '', '"Nggak semua yang pergi itu', 'hilang. Ada yang tinggal', 'di lagu yang kamu puter', 'diam-diam."']
            for i, b in enumerate(baris):
                a = clamp(cap * 6 - i * .6)
                if a <= 0: continue
                f = font(F_SEMI, 32) if i == 0 else font(F_REG, 32)
                teks(d, (100, y + 230 + i * 50 + (1 - a) * 16), b, f, mix((32, 44, 51), HIJAU_T if i == 0 else TEKS, a))
        # reaksi
        r = prog(t, 4.3, .4)
        if r > 0:
            sc = e_back(r, 2.4)
            d.rounded_rectangle([90, y + 580, 90 + 250 * sc, y + 650], 35, fill=(32, 44, 51))
            if sc > .6:
                ikon_hati(d, 136, y + 610, 20, MERAH)
                n = int(40 + 88 * clamp((t - 4.3) / 1.5))
                teks(d, (176, y + 615), f'{n}  suka', font(F_SEMI, 28), TEKS, 'lm')

def layar_6(im, d, t, D):
    header_wa(d, 'Lagu Harian', 'Saluran  •  caption otomatis', HIJAU, lambda d, x, y, s: ikon_not(d, x, y, s, (255, 255, 255)))
    kartu = [('GALAU', (110, 150, 230), '"Aku baik-baik aja, cuma playlist-ku yang nggak."', ''),
             ('AYAT', (240, 180, 70), '"Maka, sesungguhnya beserta kesulitan ada kemudahan."', 'QS. Al-Insyirah: 5'),
             ('GAUL', HIJAU_T, '"Ditelpon berdering, ternyata lagi gaya miring."', '')]
    mulai = [.2, 1.45, 2.45]
    y = 280
    for i, (lab, c, isi, sumber) in enumerate(kartu):
        u = e_back(prog(t, mulai[i], .45), 1.6)
        if u <= 0: continue
        sorot = prog(t, 4.2, .4) if i == 2 else 0
        redup = prog(t, 4.2, .4) if i < 2 else 0
        yy = y + i * 380 + (1 - u) * 140
        fill = mix((32, 44, 51), (22, 32, 38), redup)
        d.rounded_rectangle([50, yy, LW - 50, yy + 340], 40, fill=fill, outline=mix(fill, c, sorot) if sorot else None, width=5)
        d.rounded_rectangle([90, yy + 40, 90 + font(F_BLACK, 26).getlength(lab) + 48, yy + 92], 26, fill=mix(fill, c, .25))
        teks(d, (114, yy + 66), lab, font(F_BLACK, 26), c, 'lm')
        f = font(F_SEMI, 36)
        for j, b in enumerate(bungkus(isi, f, LW - 190)):
            teks(d, (90, yy + 124 + j * 52), b, f, mix(TEKS, TEKS2, redup))
        if sumber: teks(d, (90, yy + 286), sumber, font(F_REG, 26), TEKS2)
    if t > 4.2:
        # kilau di kartu gaul
        yy = y + 2 * 380
        for k in range(5):
            a = (t * 1.3 + k * .2) % 1
            x = 120 + k * 150 + math.sin(t * 2 + k) * 20; yp = yy - 20 - a * 60
            r = 8 * (1 - a)
            d.ellipse([x - r, yp - r, x + r, yp + r], fill=mix(BG, HIJAU_T, 1 - a))

def layar_7(im, d, t, D):
    header_app(d)
    y = 250
    d.rounded_rectangle([40, y, LW - 40, y + 190], 38, fill=KARTU)
    teks(d, (84, y + 60), 'Bot aktif', font(F_BLACK, 40), TEKS)
    teks(d, (84, y + 120), 'Jalan di latar belakang', font(F_REG, 28), TEKS2)
    on = e_io(prog(t, .1, .35))
    sx = LW - 200
    d.rounded_rectangle([sx, y + 64, sx + 120, y + 126], 31, fill=mix(KARTU2, HIJAU, on))
    kx = sx + 31 + on * 58
    d.ellipse([kx - 25, y + 70, kx + 25, y + 120], fill=(255, 255, 255))
    ubin = [('Hemat baterai', 'mode berkala, nggak boros', .15), ('Perekam log', 'Android/media/.../log', 1.35), ('Tema gelap', 'hijau ala WhatsApp', 3.2)]
    for i, (j, s, t0) in enumerate(ubin):
        u = e_back(prog(t, t0, .45), 1.8)
        if u <= 0: continue
        yy = y + 230 + i * 250
        sc = .85 + .15 * u
        cx = LW / 2
        w = (LW - 80) * sc; h = 220 * sc
        d.rounded_rectangle([cx - w / 2, yy, cx + w / 2, yy + h], 38, fill=KARTU)
        ix, iy = cx - w / 2 + 110, yy + h / 2
        d.ellipse([ix - 62, iy - 62, ix + 62, iy + 62], fill=HIJAU_TUA)
        if i == 0:
            isi = clamp((t - t0) / 1.5)
            d.rounded_rectangle([ix - 22, iy - 38, ix + 22, iy + 38], 8, outline=HIJAU_T, width=6)
            d.rectangle([ix - 8, iy - 46, ix + 8, iy - 38], fill=HIJAU_T)
            hh = 60 * (.3 + .7 * isi); d.rectangle([ix - 12, iy + 28 - hh, ix + 12, iy + 28], fill=HIJAU_T)
        elif i == 1:
            for k in range(4):
                o = ((t - t0) * 30) % 20
                yl = iy - 30 + k * 20 - o
                if iy - 38 < yl < iy + 34: d.rounded_rectangle([ix - 30, yl, ix + 30 - (k % 2) * 22, yl + 8], 4, fill=HIJAU_T)
        else:
            gambar_bulan(d, ix, iy, 34, HIJAU_T, HIJAU_TUA)
        teks(d, (ix + 100, iy - 26), j, font(F_BLACK, 36), TEKS, 'lm')
        teks(d, (ix + 100, iy + 26), s, font(F_REG, 26), TEKS2, 'lm')

def layar_8(im, d, t, D):
    # lembar komentar ala TikTok
    d.rectangle([0, 0, LW, LH], fill=(20, 20, 24))
    status_bar(d)
    gambar_bulan(d, LW / 2, 300, 110, HIJAU_T, (20, 20, 24))
    d.rounded_rectangle([0, 520, LW, LH], 44, fill=(30, 30, 36))
    teks(d, (LW / 2, 580), '1.284 komentar', font(F_SEMI, 28), TEKS, 'mm')
    kom = [('rizky.dev', 'bisa auto balas chat gak kak?', .4), ('nadiaa_', 'fitur jadwal pesan dong!', 1.1), ('bang.jago', 'bisa buat grup sekolah?', 1.8)]
    for i, (n, s, t0) in enumerate(kom):
        u = e_out(prog(t, t0, .4))
        if u <= 0: continue
        yy = 650 + i * 170 + (1 - u) * 40
        warna = [(233, 120, 90), (200, 110, 190), (90, 190, 170)][i]
        d.ellipse([60, yy, 140, yy + 80], fill=mix((30, 30, 36), warna, u))
        teks(d, (170, yy + 8), n, font(F_SEMI, 26), mix((30, 30, 36), TEKS2, u))
        teks(d, (170, yy + 46), s, font(F_REG, 32), mix((30, 30, 36), TEKS, u))
        ikon_hati(d, LW - 80, yy + 36, 16, mix((30, 30, 36), (120, 120, 130), u))
    # input ngetik
    d.rounded_rectangle([40, LH - 170, LW - 40, LH - 70], 50, fill=(48, 48, 56))
    ketik = 'tambahin fitur ... '
    n = int(clamp((t - 2.9) / 1.3) * len(ketik))
    s = ketik[:n] if n else 'Tambahkan komentar...'
    teks(d, (90, LH - 120), s + ('|' if n and (t * 2) % 1 < .5 else ''), font(F_REG, 32), TEKS if n else (130, 130, 140), 'lm')

LAYAR = [layar_1, layar_splash, layar_3, layar_4, layar_5, layar_6, layar_7, layar_8]

# ---------- elemen frame ----------
def judul_img(s, u_list):
    """Judul 2 baris, kata *hijau*. u_list: progres pop tiap kata."""
    f = font(F_BLACK, 66)
    kata = []
    for w in s.split():
        hl = w.startswith('*') or w.endswith('*')
        kata.append((w.strip('*'), hl))
    # sorot berlaku dari * pembuka sampai * penutup
    hl = False; kk = []
    for w in s.split():
        buka = w.startswith('*'); tutup = w.endswith('*')
        if buka: hl = True
        kk.append((w.strip('*'), hl))
        if tutup: hl = False
    ukuran = 66
    while True:
        f = font(F_BLACK, ukuran); sp = f.getlength(' ')
        lebar_k = lambda w, h: f.getlength(w) + (28 if h else 0)
        maks = 940; baris = [[]]; lebar = 0
        for w, h in kk:
            lw = lebar_k(w, h)
            if baris[-1] and lebar + sp + lw > maks: baris.append([]); lebar = 0
            baris[-1].append((w, h)); lebar += (sp if lebar else 0) + lw
        if len(baris) <= 2 or ukuran <= 48: break
        ukuran -= 3
    im = Image.new('RGBA', (W, 260), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    idx = 0; lh = int(ukuran * 1.3); y0 = (260 - lh * len(baris)) / 2
    for bi, b in enumerate(baris):
        tot = sum(lebar_k(w, h) for w, h in b) + sp * (len(b) - 1)
        x = (W - tot) / 2
        for bj, (w, h) in enumerate(b):
            u = u_list[idx] if idx < len(u_list) else 1; idx += 1
            lw = lebar_k(w, h)
            lanjut = h and bj + 1 < len(b) and b[bj + 1][1]
            if u > 0:
                sc = e_back(u, 2.2); fs = max(4, int(ukuran * sc))
                ff = font(F_BLACK, fs)
                cx = x + lw / 2; cy = y0 + bi * lh + lh / 2 + (1 - e_out(u)) * 30
                al = int(255 * clamp(u * 2))
                if h:
                    tw = f.getlength(w) * sc
                    ext = (sp + 30) if lanjut else 12
                    d.rounded_rectangle([cx - tw / 2 - 12, cy - ukuran * .6 * sc, cx + tw / 2 + ext, cy + ukuran * .64 * sc], 16, fill=(0, 168, 132, al))
                d.text((cx, cy), w, font=ff, fill=(255, 255, 255, al), anchor='mm')
            x += lw + sp
    return im, idx

_judul_cache = {}
def judul_frame(si, lt):
    s = SCENES[si]['judul']
    n = len(s.split())
    awal = 3.0 if si == 0 else 0  # scene pertama: judul langsung keliatan (hook detik 0)
    us = [clamp(awal + (lt - .05 - i * .07) / .32) for i in range(n)]
    if all(u >= 1 for u in us):
        if si not in _judul_cache: _judul_cache[si] = judul_img(s, us)[0]
        return _judul_cache[si]
    return judul_img(s, us)[0]

def potongan_subtitle(kata):
    """Kelompokin kata jadi potongan ≤3 kata / ≤20 huruf, putus di tanda baca."""
    pot = []; cur = []
    for k in kata:
        cur.append(k)
        txt = ' '.join(x[0] for x in cur)
        if k[0][-1] in '.,?!' or len(cur) >= 3 or len(txt) >= 18:
            pot.append(cur); cur = []
    if cur: pot.append(cur)
    return pot

def subtitle(im, t, si):
    s = SCENES[si]
    if 'pot' not in s: s['pot'] = potongan_subtitle(s['kata'])
    aktif = None
    for p in s['pot']:
        if p[0][1] - .05 <= t <= p[-1][2] + .25: aktif = p
    if aktif is None: return
    u = e_back(prog(t, aktif[0][1] - .05, .18), 2.0)
    f = font(F_BLACK, int(60 * (.8 + .2 * u)))
    kata = [k[0] for k in aktif]; sp = f.getlength(' ')
    tot = sum(f.getlength(k) for k in kata) + sp * (len(kata) - 1)
    x = (W - tot) / 2; y = 1545
    d = ImageDraw.Draw(im)
    for k, a0, a1 in aktif:
        on = a0 <= t
        c = (255, 230, 70) if (a0 <= t < a1 + .08) else (255, 255, 255)
        d.text((x, y), k, font=f, fill=c if on else (255, 255, 255), anchor='lm', stroke_width=9, stroke_fill=(0, 0, 0))
        x += f.getlength(k) + sp

def chip_seri(im, t):
    d = ImageDraw.Draw(im)
    f = font(F_SEMI, 26); s = 'BIKIN APP SENDIRI  •  EPS 1'
    w = f.getlength(s) + 70
    x0 = (W - w) / 2; y0 = 198
    d.rounded_rectangle([x0, y0, x0 + w, y0 + 52], 26, fill=(17, 27, 33), outline=(42, 57, 66), width=2)
    r = 7 + 2 * math.sin(t * 5)
    d.ellipse([x0 + 26 - r, y0 + 26 - r, x0 + 26 + r, y0 + 26 + r], fill=HIJAU_T)
    d.text((x0 + 46, y0 + 26), s, font=f, fill=TEKS, anchor='lm')

def pil_samping(im, t, teks_, x, y, t0, kiri=True):
    u = prog(t, t0, .4)
    if u <= 0: return
    sc = e_back(u, 2.4)
    f = font(F_BLACK, int(34 * sc) or 1)
    s = teks_
    w = (f.getlength(s) + 110); h = 84 * sc
    d = ImageDraw.Draw(im)
    x0 = x - w if not kiri else x
    d.rounded_rectangle([x0, y - h / 2, x0 + w, y + h / 2], h / 2, fill=(255, 255, 255))
    cx = x0 + 46
    d.ellipse([cx - 24 * sc, y - 24 * sc, cx + 24 * sc, y + 24 * sc], fill=MERAH)
    ikon_x(d, cx, y, 26 * sc, (255, 255, 255), max(1, int(6 * sc)))
    d.text((x0 + 84, y), s, font=f, fill=(17, 27, 33), anchor='lm')

def tombol_follow(im, t, t0):
    u = prog(t, t0, .45)
    if u <= 0: return
    sc = e_back(u, 2.2) * (1 + .05 * math.sin((t - t0) * 7))
    d = ImageDraw.Draw(im)
    cx, cy = W / 2, 1440
    w, h = 380 * sc, 104 * sc
    denyut(d, cx, cy, 60 * sc, t, HIJAU_T, 1.1, 2, 6) if False else None
    d.rounded_rectangle([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], h / 2, fill=(254, 44, 85))
    d.text((cx, cy), '+ Follow', font=font(F_BLACK, int(44 * sc) or 1), fill=(255, 255, 255), anchor='mm')

def outro(im, t, t0):
    u = prog(t, t0, .5)
    if u <= 0: return
    ov = Image.new('RGBA', (W, H), BG + (int(255 * e_out(u)),))
    im.alpha_composite(ov)
    d = ImageDraw.Draw(im)
    v = e_back(prog(t, t0 + .2, .5), 1.8)
    if v > 0:
        gambar_bulan(d, W / 2, 760, 110 * v, HIJAU_T, BG)
        d.text((W / 2, 960), 'WA Release Bot', font=font(F_BLACK, int(70 * v) or 1), fill=TEKS, anchor='mm')
        d.text((W / 2, 1040), 'bot WhatsApp langsung dari HP', font=font(F_REG, 36), fill=mix(BG, TEKS2, clamp(v)), anchor='mm')
    w = prog(t, t0 + .5, .5)
    if w > 0:
        d.text((W / 2, 1230), 'BUILT IN', font=font(F_REG, 28), fill=mix(BG, TEKS2, w), anchor='mm')
        lg = logo_ukuran(64).copy()
        lg.putalpha(lg.getchannel('A').point(lambda a: int(a * w)))
        im.alpha_composite(lg, (int(W / 2 - lg.width / 2), 1270))

def frame(t, total):
    # cari scene
    si = 0
    for i, s in enumerate(SCENES):
        if t >= s['mulai']: si = i
    s = SCENES[si]; lt = t - s['mulai']
    im = ST['bg'].copy().convert('RGBA')
    d = ImageDraw.Draw(im)
    # partikel melayang
    for k in range(14):
        rnd = random.Random(k)
        x = rnd.random() * W + math.sin(t * .6 + k) * 30
        y = (rnd.random() * H - t * (18 + rnd.random() * 30)) % H
        r = 2 + rnd.random() * 4
        d.ellipse([x - r, y - r, x + r, y + r], fill=(30, 90, 70))
    # layar HP
    lay = Image.new('RGBA', (LW, LH), BG + (255,)); ld = ImageDraw.Draw(lay)
    LAYAR[si](lay, ld, lt, s['dur'])
    lay = lay.resize((SW, SH), Image.BILINEAR if False else Image.LANCZOS)
    # transisi masuk: layar naik + membesar dikit
    u = e_out(prog(lt, 0, .35)) if si > 0 else e_out(prog(lt, 0, .25))
    dy = int((1 - u) * 70)
    hp = ST['hp']
    # HP ngambang pelan
    fy = int(math.sin(t * 1.4) * 6)
    im.alpha_composite(hp, (PX - 20, PY - 20 + fy))
    kanvas = Image.new('RGBA', (SW, SH), BG + (255,))
    if si > 0 and u < 1:
        # bekas layar sebelumnya digeser ke atas
        kanvas.alpha_composite(lay, (0, 0))
        m = ST['mask_layar']
        a = Image.new('L', (SW, SH), int(255 * u))
        kanvas2 = Image.new('RGBA', (SW, SH), BG + (255,)); kanvas2.alpha_composite(lay, (0, dy))
        kanvas = kanvas2
    else:
        kanvas = lay
    im.paste(kanvas, (PX + BZ, PY + BZ + fy), ST['mask_layar'])
    # kilatan transisi
    if si > 0 and lt < .18:
        fl = Image.new('RGBA', (SW, SH), (255, 255, 255, int(120 * (1 - lt / .18))))
        m2 = ST['mask_layar'].point(lambda v: v)
        im.paste(Image.alpha_composite(im.crop((PX + BZ, PY + BZ + fy, PX + BZ + SW, PY + BZ + fy + SH)), fl), (PX + BZ, PY + BZ + fy), m2)
    # elemen samping
    if si == 1:
        pil_samping(im, lt, 'Tanpa server', 70, 1010, 3.95 - 0.1, True)
        pil_samping(im, lt, 'Tanpa laptop', W - 70, 1150, 5.1 - 0.1, False)
    if si == 7:
        tombol_follow(im, lt, 5.2)
    chip_seri(im, t)
    j = judul_frame(si, lt)
    im.alpha_composite(j, (0, 262))
    subtitle(im, t, si)
    if si == len(SCENES) - 1:
        outro(im, t, s['mulai'] + s['dur'] - OUTRO)
    return im.convert('RGB')

# ---------- audio ----------
def buat_audio(total, path_musik, path_vo):
    sr = 44100; n = int(total * sr) + sr
    vo = np.zeros(n, np.float32)
    for s in SCENES:
        a = s['audio']; i = int(s['vo_mulai'] * sr); vo[i:i + len(a)] += a
    sfx = np.zeros(n, np.float32)
    rng = np.random.default_rng(1)
    def whoosh(t0, dur=.38, g=.16):
        m = int(dur * sr); x = rng.standard_normal(m).astype(np.float32)
        # sapuan bandpass sederhana: selisih dua lowpass dengan cutoff berubah
        env = np.sin(np.linspace(0, math.pi, m)) ** 2
        y = np.zeros(m, np.float32); lp1 = lp2 = 0
        for k in range(m):
            f = 0.02 + 0.25 * (k / m)
            lp1 += f * (x[k] - lp1); lp2 += (f * .3) * (lp1 - lp2); y[k] = lp1 - lp2
        y = y / (np.abs(y).max() + 1e-6) * env * g
        i = int(t0 * sr); sfx[i:i + m] += y[:len(sfx[i:i + m])]
    def pop(t0, f0=900, g=.10):
        m = int(.09 * sr); tt = np.arange(m) / sr
        f = f0 * (1 - .35 * tt / .09)
        y = np.sin(2 * math.pi * np.cumsum(f) / sr) * np.exp(-tt * 45) * g
        i = int(t0 * sr); sfx[i:i + m] += y[:len(sfx[i:i + m])].astype(np.float32)
    for si, s in enumerate(SCENES):
        if si > 0: whoosh(s['mulai'] - .12)
    # pop di momen penting (detik lokal)
    pops = {0: [.05 + i * .28 for i in range(6)] + [2.45] + [3.1 + i * .16 for i in range(6)], 1: [3.85, 5.0],
            2: [1.05] + [1.35 + j * .13 for j in range(8)] + [3.35], 3: [1.0 + i * 1.05 for i in range(5)] + [6.7],
            4: [.35, 1.2, 4.3], 5: [.2, 1.45, 2.45, 4.2], 6: [.1, .15, 1.35, 3.2], 7: [.4, 1.1, 1.8, 5.2]}
    for si, lst in pops.items():
        for k, tl in enumerate(lst): pop(SCENES[si]['mulai'] + tl, 700 + (k % 4) * 120, .07)
    whoosh(SCENES[-1]['mulai'] + SCENES[-1]['dur'] - OUTRO, .6, .2)
    # musik latar sederhana 100 bpm (Am F C G), di-duck waktu ada suara
    bpm = 100; beat = 60 / bpm; tt = np.arange(n) / sr
    akor = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]
    mus = np.zeros(n, np.float32)
    bar = 4 * beat
    for bi in range(int(total / bar) + 2):
        t0 = bi * bar; i0 = int(t0 * sr); i1 = min(n, int((t0 + bar) * sr))
        if i0 >= n: break
        seg = tt[i0:i1] - t0
        env = np.minimum(1, seg / .4) * np.minimum(1, (bar - seg) / .3)
        for m in akor[bi % 4]:
            fq = 440 * 2 ** ((m - 69) / 12)
            mus[i0:i1] += (np.sin(2 * math.pi * fq * seg) * .5 + np.sin(2 * math.pi * fq * 2.003 * seg) * .12) * env * .05
        fb = 440 * 2 ** ((akor[bi % 4][0] - 12 - 69) / 12)
        mus[i0:i1] += np.sin(2 * math.pi * fb * seg) * env * .07
        # arpeggio pluck tiap 1/2 ketukan
        for k in range(8):
            ts = t0 + k * beat / 2; j0 = int(ts * sr); j1 = min(n, j0 + int(.35 * sr))
            if j0 >= n: break
            m = akor[bi % 4][[0, 1, 2, 1][k % 4]] + 12
            fq = 440 * 2 ** ((m - 69) / 12); s2 = np.arange(j1 - j0) / sr
            mus[j0:j1] += np.sin(2 * math.pi * fq * s2) * np.exp(-s2 * 9) * .035
    # kick + hat
    for k in range(int(total / beat) + 1):
        j0 = int(k * beat * sr); j1 = min(n, j0 + int(.25 * sr))
        if j0 >= n: break
        s2 = np.arange(j1 - j0) / sr
        f = 50 + 90 * np.exp(-s2 * 30)
        mus[j0:j1] += np.sin(2 * math.pi * np.cumsum(f) / sr) * np.exp(-s2 * 14) * .16
        h0 = int((k + .5) * beat * sr); h1 = min(n, h0 + int(.05 * sr))
        if h0 < n:
            hh = rng.standard_normal(h1 - h0).astype(np.float32); hh = np.diff(np.concatenate([[0], hh]))
            mus[h0:h1] += hh * np.exp(-np.arange(h1 - h0) / sr * 80) * .02
    # duck
    fr = 441; envvo = np.sqrt(np.convolve(vo ** 2, np.ones(fr * 10) / (fr * 10), 'same'))
    duck = 1 - .55 * np.clip(envvo / .05, 0, 1)
    duck = np.convolve(duck, np.ones(fr * 8) / (fr * 8), 'same')
    fade = np.minimum(1, tt / .5) * np.clip((total - tt) / 1.2, 0, 1)
    mus *= duck * fade
    vo_only = vo + sfx
    full = vo + sfx + mus * .85
    for p, x in [(path_musik, full), (path_vo, vo_only)]:
        x = x[:int(total * sr)]
        x = x / max(1e-6, np.abs(x).max()) * .93
        w = wave.open(p, 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes((x * 32767).astype(np.int16).tobytes()); w.close()

def ffmpeg():
    import imageio_ffmpeg; return imageio_ffmpeg.get_ffmpeg_exe()

def render_bagian(a, b, total, out):
    global ST
    ST = buat_statis()
    p = subprocess.Popen([ffmpeg(), '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS),
                          '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', out], stdin=subprocess.PIPE)
    for f in range(a, b):
        p.stdin.write(frame(f / FPS, total).tobytes())
    p.stdin.close(); p.wait()

if __name__ == '__main__':
    total = bangun_timeline()
    nf = int(total * FPS)
    if '--cek' in sys.argv:
        ST = buat_statis()
        for i, v in enumerate(sys.argv[sys.argv.index('--cek') + 1:]):
            frame(float(v), total).save(os.path.join(ROOT, f'cek_{i}.png'))
        sys.exit()
    if '--bagian' in sys.argv:
        i = sys.argv.index('--bagian'); a, b = int(sys.argv[i + 1]), int(sys.argv[i + 2])
        render_bagian(a, b, total, sys.argv[i + 3]); sys.exit()
    tmp = os.path.join(ROOT, 'tmp'); os.makedirs(tmp, exist_ok=True)
    print('durasi', round(total, 2), 'detik,', nf, 'frame')
    buat_audio(total, os.path.join(tmp, 'audio_musik.wav'), os.path.join(tmp, 'audio_vo.wav'))
    tengah = nf // 2
    ps = [subprocess.Popen([sys.executable, __file__, '--bagian', str(a), str(b), os.path.join(tmp, f'b{k}.mp4')])
          for k, (a, b) in enumerate([(0, tengah), (tengah, nf)])]
    for p in ps: p.wait()
    with open(os.path.join(tmp, 'daftar.txt'), 'w') as f:
        f.write(f"file 'b0.mp4'\nfile 'b1.mp4'\n")
    subprocess.run([ffmpeg(), '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', os.path.join(tmp, 'daftar.txt'), '-c', 'copy', os.path.join(tmp, 'video.mp4')], check=True)
    for nama, au in [('tiktok-wa-release-bot.mp4', 'audio_musik.wav'), ('tiktok-wa-release-bot-tanpa-musik.mp4', 'audio_vo.wav')]:
        subprocess.run([ffmpeg(), '-v', 'error', '-y', '-i', os.path.join(tmp, 'video.mp4'), '-i', os.path.join(tmp, au), '-c:v', 'copy',
                        '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-shortest', '-movflags', '+faststart', os.path.join(ROOT, nama)], check=True)
    print('selesai')
