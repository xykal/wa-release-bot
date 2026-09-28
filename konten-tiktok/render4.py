#!/usr/bin/env python3
"""Versi 4 — lebih detail (cara kerja: Node.js di dalam APK bukan Termux, perangkat tertaut,
rilis GitHub → channel, pipa lagu Cloudflare + HP, hosting ZIP), meme & sound lebih banyak,
stiker kotak tegak tajam, transisi geser mulus, 60 fps, CTA join saluran WA + follow.
Pakai: python3 render4.py  |  python3 render4.py --cek 3 20"""
import math, os, sys, random, subprocess, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import render as R
import render2 as R2
import render3 as R3
from render import (W, H, font, F_BLACK, F_SEMI, F_REG, BG, KARTU, KARTU2, GARIS, HIJAU, HIJAU_T, HIJAU_TUA, TEKS, TEKS2,
                    MERAH, clamp, e_out, e_io, e_back, prog, mix, teks, status_bar, header_wa, header_app, ikon_perisai,
                    ikon_cek, ikon_x, denyut, gambar_bulan, jari, LW, LH, PX, PY, PW, PH, BZ, SW, SH)

ROOT = os.path.dirname(os.path.abspath(__file__))
FPS = 60
R.FPS = FPS; R2.FPS = FPS
w = R2.w

# ---------- font portabel: pakai konten-tiktok/fonts/ kalau ada ----------
# (path absolut /home/user/assets-xyverse/... cuma ada di workspace lokal,
#  di GitHub Actions nggak ada — makanya font dibundel di repo.)
_FD = os.path.join(ROOT, 'fonts')
if os.path.isdir(_FD):
    _FB = os.path.join(_FD, 'font_logo_judul_hero__archivo-expanded-black.ttf')
    _FS = os.path.join(_FD, 'font_subjudul_tombol__archivo-semibold.ttf')
    _FR = os.path.join(_FD, 'font_body_footer__archivo-regular.ttf')
    if os.path.exists(_FB) and os.path.exists(_FS) and os.path.exists(_FR):
        R.F_BLACK = R2.F_BLACK = R3.F_BLACK = _FB
        R.F_SEMI = R2.F_SEMI = R3.F_SEMI = _FS
        R.F_REG = R2.F_REG = R3.F_REG = _FR
        F_BLACK, F_SEMI, F_REG = _FB, _FS, _FR
# logo: fallback ke konten-tiktok/assets/ (dibuat oleh workflow Actions)
if not os.path.exists(R.LOGO):
    _logo = os.path.join(ROOT, 'assets', 'xyverse_logo.webp')
    if os.path.exists(_logo):
        R.LOGO = _logo

def cari(vo): return next(s for s in R3.SCENES if s['vo'] == vo)
TEKS_BARU = {
    '10': ('Bukan Termux! *Node.js di dalam APK*', 'Terus, jalannya pake apa? Termux? Bukan! Mesin Node.js-nya udah aku tanem langsung di dalem aplikasi. Jadi tinggal install APK, buka, beres. Bot-nya jalan di latar belakang, tetep nyala walau layar HP mati.'),
    '11': ('WA kamu *tetep bisa dipake*', 'Koneksinya lewat fitur perangkat tertaut, kayak WhatsApp Web. Jadi WA di HP kamu tetep bisa dipake kayak biasa.'),
    '12': ('Rilis GitHub? *Auto ke channel*', 'Fitur utamanya? Bot ngecek GitHub tiap beberapa menit. Ada rilis APK baru? Langsung diposting otomatis ke channel WhatsApp kamu.'),
    '13': ('Lagunya: *Cloudflare + HP*', 'Lagunya dari mana? Ada server kecil di Cloudflare yang milihin lagu yang lagi trending, plus captionnya. HP tinggal download potongan semenit, diubah jadi voice note, dikirim, terus filenya langsung dihapus. Memori tetep lega!'),
    '14': ('Hosting bot *dari file ZIP*', 'Punya bot sendiri? Upload aja file ZIP-nya. Ada node_modules atau nggak, bebas, nanti aplikasinya yang masangin. Kalau bot kamu error, yang mati cuma bot itu, aplikasinya tetep aman.'),
    '15': ('Mau APK-nya? *Join saluran WA*', 'Menurut kamu, fitur apa lagi yang wajib aku tambahin? Tulis di komen! Mau APK-nya, sama tools berguna lainnya? Join saluran WhatsApp aku, link-nya ada di bio. Terus follow juga, biar nggak ketinggalan update!'),
}
URUT = ['00a', '00b', '02', '10', '03', '11', '12', '04', '05', '13', '06', '07', '08', '14', '15']
SCENES = []
for v in URUT:
    if v in TEKS_BARU: SCENES.append(dict(vo=v, judul=TEKS_BARU[v][0], teks=TEKS_BARU[v][1]))
    else:
        s = dict(cari(v)); s.pop('kata', None); s.pop('pot', None); SCENES.append(s)
IDX = {s['vo']: i for i, s in enumerate(SCENES)}
def I(v): return IDX[v]

# ---------- SFX: (vo, kata, file, gain, geser, jenis, maks, mulai_src) ----------
SFX = [
    ('00a', 'Stop,', 'record-scratch', .75, -.08, 'awal'),
    ('00a', 'Stop,', 'notification-spam', .30, -.85, 'awal', .85),
    ('00a', 'Ini', 'notification-spam', .26, 0, 'awal', 2.4),
    ('00a', 'grup', 'danger-alarm-sound-effect-meme', .18, 0, 'awal', 1.9),
    ('00a', 'jagain.', 'vine-boom', .6, .02, 'akhir'),
    ('00b', 'bersih!', 'sparkle-sound-effect', .40, -.15, 'awal', 1.6),
    ('00b', 'kan?', 'family-feud-good-answer', .30, 0, 'akhir'),
    ('02', 'server,', 'pop_7e9Is8L', .5, 0, 'awal'),
    ('02', 'laptop.', 'pop_7e9Is8L', .5, 0, 'awal'),
    ('02', 'kan?', 'rizz-sound-effect', .40, .05, 'akhir'),
    ('10', 'Termux?', 'discord-notification', .35, 0, 'awal'),
    ('10', 'Bukan!', 'fahhhhh', .55, 0, 'akhir'),
    ('10', 'beres.', 'family-feud-good-answer', .35, 0, 'akhir'),
    ('10', 'mati.', 'omgwow', .40, .05, 'akhir', 1.75),
    ('03', 'deh.', 'original-sheesh', .40, 0, 'akhir', 1.6),
    ('11', 'biasa.', 'discord-join', .40, 0, 'akhir'),
    ('12', 'GitHub', 'discord-notification', .35, 0, 'awal'),
    ('12', 'otomatis', 'anime-wow-sound-effect', .38, 0, 'awal', 1.6),
    ('04', 'kabur,', 'get-out-meme', .55, .02, 'akhir'),
    ('04', 'di-kick,', 'jokowi-saya-akan-lawan', .55, .05, 'akhir'),
    ('04', 'ditolak.', 'cartoon-bonk', .5, 0, 'awal'),
    ('04', 'Dadah!', 'tuturu_1', .40, 0, 'akhir'),
    ('05', 'nggak', 'awkward-cricket-sound-effect', .35, -1.3, 'awal', 1.25),
    ('05', 'hati.', 'ding-sound-effect_2', .25, 0, 'akhir', 1.4),
    ('13', 'dikirim,', 'discord-notification', .35, 0, 'awal'),
    ('13', 'dihapus.', 'windows-10-error-sound', .30, 0, 'akhir', 1.0),
    ('13', 'lega!', 'yeay', .35, 0, 'akhir'),
    ('06', 'galau,', 'sad-violin', .30, 0, 'awal', 1.6),
    ('06', 'adem,', 'ding-sound-effect_2', .22, 0, 'akhir', 1.2),
    ('07', 'Ditelpon', 'nokia-ringtone-1994', .13, -.1, 'awal', 2.2),
    ('07', 'miring.', 'rimshot', .55, .02, 'akhir'),
    ('07', 'Hihihi...', 'cute-girl-laughing-sound-effect', .30, .1, 'awal'),
    ('07', 'tahan.', 'wo-itu-gak-respect-banget-wok', .60, .15, 'akhir', 1.95),
    ('08', 'error,', 'windows-10-error-sound', .22, 0, 'awal', .8),
    ('08', 'Cakep!', 'anime-wow-sound-effect', .40, .05, 'akhir', 1.6),
    ('14', 'ZIP-nya.', 'pop_7e9Is8L', .5, 0, 'awal'),
    ('14', 'error,', 'emotional-damage-meme', .45, 0, 'akhir', 2.9),
    ('14', 'aman.', 'respek_1', .55, .02, 'akhir'),
    ('15', 'Join', 'discord-join', .40, 0, 'awal'),
    ('15', 'follow', 'kids-saying-yay-sound-effect_3', .22, 0, 'awal', 1.5),
]
# teks stiker (kotak, tegak)
STIKER = [('00a', 'Stop,', 'STOP!', (241, 92, 109), 540, 820),
          ('02', 'kan?', 'ENTENG!', (37, 211, 102), 250, 760),
          ('10', 'Bukan!', 'BUKAN TERMUX!', (241, 92, 109), 540, 820),
          ('10', 'mati.', 'TETEP NYALA', (37, 211, 102), 540, 1330),
          ('03', 'deh.', 'NYAMBUNG!', (37, 211, 102), 820, 760),
          ('04', 'Dadah!', 'DADAH~', (241, 92, 109), 260, 720),
          ('13', 'dihapus.', 'AUTO DIHAPUS', (255, 214, 0), 540, 1330),
          ('07', 'miring.', 'WKWKWK', (255, 214, 0), 420, 620),
          ('08', 'Cakep!', 'CAKEP!', (37, 211, 102), 820, 720),
          ('14', 'aman.', 'APP AMAN', (37, 211, 102), 820, 760)]
# meme: vo, kata, nomor stiker, x, y, ukuran
MEME = [('00a', 'grup', 21, 225, 1090, 320), ('00a', 'jagain.', 28, 850, 1180, 310),
        ('00b', 'bersih!', 12, 845, 1150, 320),
        ('02', 'Enteng', 29, 835, 790, 290),
        ('10', 'Termux?', 17, 845, 760, 280), ('10', 'beres.', 22, 230, 1200, 290),
        ('03', 'gampang', 7, 845, 800, 280),
        ('11', 'biasa.', 26, 240, 1180, 280),
        ('12', 'otomatis', 6, 845, 1180, 290),
        ('04', 'kabur,', 11, 845, 800, 290), ('04', 'di-kick,', 9, 235, 1120, 310), ('04', 'ditolak.', 27, 845, 1180, 280),
        ('05', 'hati.', 8, 840, 1180, 300),
        ('13', 'Cloudflare', 4, 845, 700, 260), ('13', 'lega!', 10, 240, 1150, 280),
        ('06', 'galau,', 30, 845, 820, 280),
        ('07', 'Hihihi...', 23, 855, 800, 290), ('07', 'tahan.', 25, 235, 1150, 290),
        ('08', 'perekam', 3, 850, 1180, 260),
        ('14', 'error,', 1, 235, 800, 290), ('14', 'sendiri?', 14, 845, 800, 260),
        ('15', 'Join', 13, 240, 1000, 290), ('15', 'follow', 15, 845, 1000, 290)]
ZOOM = [('00a', 'Stop,', 'awal', -.05), ('00a', 'jagain.', 'akhir', .02), ('00b', 'bersih!', 'awal', 0),
        ('10', 'Bukan!', 'akhir', 0), ('04', 'kabur,', 'akhir', .02), ('14', 'error,', 'akhir', 0)]

# ---------- layar baru ----------
def blok(d, x0, y0, x1, y1, judul, sub, warna, u, ikon=None):
    if u <= 0: return
    sc = e_back(u, 1.8); cx = (x0 + x1) / 2; cy = (y0 + y1) / 2
    ww = (x1 - x0) * sc; hh = (y1 - y0) * sc
    d.rounded_rectangle([cx - ww / 2, cy - hh / 2, cx + ww / 2, cy + hh / 2], 26, fill=mix(KARTU, warna, .18), outline=warna, width=4)
    if sc > .7:
        if ikon: ikon(d, x0 + 70, cy, 34)
        tx = x0 + (130 if ikon else 40)
        teks(d, (tx, cy - 22), judul, font(F_BLACK, 34), TEKS, 'lm')
        teks(d, (tx, cy + 24), sub, font(F_REG, 26), TEKS2, 'lm')

def ik_gear(c):
    def f(d, x, y, s):
        for k in range(8):
            a = k * math.pi / 4
            d.line([(x, y), (x + math.cos(a) * s, y + math.sin(a) * s)], fill=c, width=int(s * .45))
        d.ellipse([x - s * .75, y - s * .75, x + s * .75, y + s * .75], fill=c); d.ellipse([x - s * .3, y - s * .3, x + s * .3, y + s * .3], fill=KARTU)
    return f
def ik_chat(c):
    def f(d, x, y, s):
        d.rounded_rectangle([x - s, y - s * .75, x + s, y + s * .55], s * .4, fill=c); d.polygon([(x - s * .5, y + s * .4), (x - s * .8, y + s), (x, y + s * .5)], fill=c)
    return f
def ik_bulan(c):
    def f(d, x, y, s): gambar_bulan(d, x, y, s * .9, c, mix(KARTU, c, .18))
    return f

def layar_host(im, d, t, D):
    t_ter, t_buk, t_node, t_apl, t_ins, t_buka, t_ber, t_lat, t_mati = (w('Termux?'), w('Bukan!', 'akhir'), w('Node.js-nya'), w('aplikasi.'),
                                                                        w('install'), w('buka,'), w('beres.'), w('latar'), w('mati.'))
    if t < t_node - .15:
        # terminal Termux (yang BUKAN dipake)
        d.rectangle([0, 0, LW, LH], fill=(0, 0, 0)); status_bar(d)
        d.rectangle([0, 100, LW, 180], fill=(28, 28, 28)); teks(d, (40, 140), 'Termux', font(F_SEMI, 34), (200, 200, 200), 'lm')
        baris = ['$ pkg install nodejs', '$ node bot.js', '...njalain manual, ribet!']
        for i, b in enumerate(baris):
            u = prog(t, .2 + i * .5, .3)
            if u > 0: teks(d, (40, 240 + i * 64), b[:int(len(b) * e_out(u))], font(F_REG, 30), (180, 220, 180))
        # stempel BUKAN pas kata 'Bukan!'
        u = prog(t, t_buk, .3)
        if u > 0:
            sc = e_back(u, 2)
            cx, cy = LW / 2, 700
            d.line([(cx - 200 * sc, cy - 130 * sc), (cx + 200 * sc, cy + 130 * sc)], fill=MERAH, width=int(24 * sc))
            d.line([(cx - 200 * sc, cy + 130 * sc), (cx + 200 * sc, cy - 130 * sc)], fill=MERAH, width=int(24 * sc))
    else:
        # Node.js DI DALEM APK: install → jalan di latar
        header_app(d, 'WA Release Bot')
        y = 280
        d.rounded_rectangle([40, y, LW - 40, y + 300], 40, fill=KARTU)
        teks(d, (84, y + 50), 'wa-release-bot-arm64.apk', font(F_SEMI, 34), TEKS)
        teks(d, (84, y + 100), '+-21 MB  ...Node.js 18 di dalemnya'.replace('+-', chr(177)), font(F_REG, 27), TEKS2)
        p = prog(t, w('install'), max(.5, w('buka,') - w('install')))
        d.rounded_rectangle([84, y + 170, LW - 84, y + 210], 20, fill=KARTU2)
        if p > 0: d.rounded_rectangle([84, y + 170, 84 + (LW - 168) * e_io(p), y + 210], 20, fill=HIJAU_T)
        ok = prog(t, w('beres.'), .3)
        if ok > 0:
            sc = e_back(ok, 2)
            ikon_cek(d, LW - 130, y + 110, 40 * sc, HIJAU_T, prog(t, w('beres.') + .1, .3))
        u = e_back(prog(t, w('buka,'), .4), 1.8)
        if u > 0:
            ix, iy, r = LW / 2, 810, 110 * u
            denyut(d, ix, iy, r, t, HIJAU_T, 1.2, 2, 6)
            d.ellipse([ix - r, iy - r, ix + r, iy + r], fill=HIJAU)
            ikon_perisai(d, ix, iy, 60 * u, (255, 255, 255), True, HIJAU)
        la = prog(t, w('latar'), .4)
        if la > 0:
            yy = 1010 + (1 - e_out(la)) * 80
            d.rounded_rectangle([60, yy, LW - 60, yy + 150], 36, fill=KARTU)
            gambar_bulan(d, 170, yy + 75, 44, HIJAU_T, KARTU)
            teks(d, (250, yy + 45), 'Jalan di latar belakang', font(F_SEMI, 34), TEKS)
            teks(d, (250, yy + 95), 'layar mati? tetep nyala', font(F_REG, 27), TEKS2)
        if t > w('mati.'):
            k = prog(t, w('mati.'), .3)
            d.rounded_rectangle([60, 1210, LW - 60, 1210 + 110], 55, fill=mix(KARTU, HIJAU_TUA, k))
            if k > .5: teks(d, (LW / 2, 1265), '0% ribet, tinggal install', font(F_SEMI, 32), HIJAU_T, 'mm')

def layar_tertaut(im, d, t, D):
    t_per, t_web, t_biasa = w('perangkat'), w('WhatsApp'), w('biasa.')
    header_app(d, 'Perangkat tertaut')
    d.rounded_rectangle([60, 300, LW - 60, 830], 44, fill=KARTU)
    teks(d, (110, 360), 'HP kamu', font(F_BLACK, 38), TEKS)
    chat = [('Mama', 'udah makan?', 0), ('Grup Kelas', 'tugas dikumpul besok', .4), ('Doi', 'kangen nih', .8)]
    for i, (n, s, dt) in enumerate(chat):
        u = e_out(prog(t, .1 + dt, .4))
        if u <= 0: continue
        yy = 440 + i * 120
        d.ellipse([110, yy, 180, yy + 70], fill=[(233, 120, 90), (110, 150, 230), (200, 110, 190)][i])
        teks(d, (230, yy + 8), n, font(F_SEMI, 30), TEKS)
        teks(d, (230, yy + 44), s, font(F_REG, 27), TEKS2)
    u = e_out(prog(t, t_per, .5))
    if u > 0:
        x0, y0 = LW / 2, 830
        d.line([(x0, y0), (x0, y0 + 90 * u)], fill=HIJAU_T, width=8)
        py = y0 + ((t * 260) % 90) * u
        d.ellipse([x0 - 12, py - 12, x0 + 12, py + 12], fill=HIJAU_T)
    v = e_back(prog(t, t_web - .2, .45), 1.8)
    if v > 0:
        yy = 940 + (1 - v) * 100
        d.rounded_rectangle([60, yy, LW - 60, yy + 220], 44, fill=HIJAU_TUA)
        ikon_cek(d, 170, yy + 110, 44 * v, HIJAU_T, prog(t, t_web, .3))
        teks(d, (250, yy + 70), 'Bot nyambung', font(F_BLACK, 38), TEKS)
        teks(d, (250, yy + 125), 'kayak WhatsApp Web', font(F_REG, 28), HIJAU_T)
    o = prog(t, t_biasa - .3, .4)
    if o > 0:
        d.rounded_rectangle([60, 1220, LW - 60, 1330], 55, fill=mix(KARTU, HIJAU_TUA, o))
        if o > .5: teks(d, (LW / 2, 1275), 'WA tetep bisa dipake normal', font(F_SEMI, 32), HIJAU_T, 'mm')

def layar_rilis(im, d, t, D):
    t_git, t_rilis, t_oto = w('GitHub'), w('rilis'), w('otomatis')
    header_wa(d, 'Rilis Monitor', 'cek tiap +-15 menit'.replace('+-', chr(177)), HIJAU,
              lambda d, x, y, s: ikon_perisai(d, x, y, s, (255, 255, 255), True, HIJAU))
    d.rectangle([0, 230, LW, LH], fill=BG)
    u = e_back(prog(t, t_git - .2, .45), 1.6)
    if u > 0:
        y = 280 + (1 - u) * 100
        d.rounded_rectangle([40, y, LW - 40, y + 420], 40, fill=(22, 32, 40))
        teks(d, (80, y + 40), 'vercel / next.js', font(F_REG, 28), (147, 197, 253))
        teks(d, (80, y + 90), 'v15.1.0', font(F_BLACK, 52), TEKS)
        teks(d, (80, y + 170), '...hemat memori 40%', font(F_REG, 29), TEKS2)
        teks(d, (80, y + 220), '...perbaiki bug router', font(F_REG, 29), TEKS2)
        teks(d, (80, y + 300), '2 menit lalu', font(F_REG, 26), HIJAU_T)
    a = prog(t, t_rilis, .4)
    if a > 0:
        x0, y0 = LW / 2, 740
        d.line([(x0, y0), (x0, y0 + 130 * a)], fill=HIJAU_T, width=10)
        if a > .8:
            s = e_back((a - .8) / .2, 2)
            d.polygon([(x0 - 26 * s, y0 + 130 - 40 * s), (x0 + 26 * s, y0 + 130 - 40 * s), (x0, y0 + 140)], fill=HIJAU_T)
    c = e_back(prog(t, t_oto - .15, .45), 1.5)
    if c > 0:
        y = 920 + (1 - c) * 120
        d.rounded_rectangle([60, y, LW - 60, y + 380], 36, fill=HIJAU_TUA)
        teks(d, (100, y + 30), 'Info Rilis ...Saluran'.replace('...', ' ' + chr(8226) + ' '), font(F_SEMI, 28), HIJAU_T)
        teks(d, (100, y + 90), 'Rilis baru terdeteksi!', font(F_BLACK, 40), TEKS)
        teks(d, (100, y + 160), 'next.js v15.1.0', font(F_SEMI, 33), TEKS)
        teks(d, (100, y + 215), 'Changelog + link download', font(F_REG, 29), TEKS2)
        o2 = prog(t, t_oto + .3, .3)
        if o2 > 0:
            d.rounded_rectangle([100, y + 270, 420, y + 340], 35, fill=mix(HIJAU_TUA, HIJAU_T, o2))
            if o2 > .6: teks(d, (260, y + 305), 'AUTO-POST', font(F_BLACK, 30), (10, 25, 15), 'mm')

def layar_pipa(im, d, t, D):
    t_cf, t_dl, t_vn, t_hapus, t_lega = w('Cloudflare'), w('download'), w('voice'), w('dihapus.'), w('lega!')
    header_app(d, 'Pipa lagu otomatis')
    langkah = [('Server Cloudflare', 'milih lagu trending + caption', t_cf - .2, (240, 180, 70), ik_chat((240, 180, 70))),
               ('HP download 60 detik', 'cuma potongan, +-1 MB'.replace('+-', chr(177)), t_dl - .1, (110, 150, 230), ik_gear((110, 150, 230))),
               ('Jadi voice note', 'dikirim ke channel', t_vn - .1, HIJAU_T, ik_chat(HIJAU_T)),
               ('File langsung dihapus', 'memori tetep lega', t_hapus - .1, (200, 110, 190), ik_bulan((200, 110, 190)))]
    y = 300
    for i, (j, s, t0, c, ikon) in enumerate(langkah):
        r = prog(t, t0, .45)
        if r <= 0: continue
        yy = y + i * 250 + (1 - e_out(r)) * 80
        blok(d, 60, yy, LW - 60, yy + 200, j, s, c, r, ikon)
        if i < 3 and r > .8:
            v = prog(t, t0 + .4, .6)
            d.line([(LW / 2, yy + 200), (LW / 2, yy + 250)], fill=mix(KARTU, c, v), width=8)
            if 0 < v < 1:
                py = yy + 200 + 50 * v
                d.ellipse([LW / 2 - 14, py - 14, LW / 2 + 14, py + 14], fill=c)
    g = prog(t, t_lega - .2, .35)
    if g > 0:
        d.rounded_rectangle([60, 1340, LW - 60, 1450], 55, fill=mix(KARTU, HIJAU_TUA, g))
        if g > .6: teks(d, (LW / 2, 1395), 'memori HP tetep lega!', font(F_SEMI, 33), HIJAU_T, 'mm')

def layar_zip(im, d, t, D):
    t_up, t_mod, t_err, t_aman = w('Upload'), w('masangin.'), w('error,'), w('aman.')
    header_app(d, 'Hosting bot sendiri')
    u = e_back(prog(t, .1, .45), 1.7)
    if u > 0:
        y = 300 + (1 - u) * 80
        d.rounded_rectangle([60, y, LW - 60, y + 200], 36, fill=KARTU)
        d.rounded_rectangle([100, y + 50, 220, y + 150], 20, fill=(240, 180, 70))
        teks(d, (160, y + 100), 'ZIP', font(F_BLACK, 36), (30, 25, 10), 'mm')
        teks(d, (260, y + 60), 'bot-ku.zip', font(F_BLACK, 38), TEKS)
        teks(d, (260, y + 115), 'node_modules? bebas!', font(F_REG, 28), TEKS2)
    m = prog(t, t_up, max(.5, t_mod - t_up))
    if m > 0:
        d.rounded_rectangle([60, 560, LW - 60, 700], 36, fill=KARTU)
        teks(d, (100, 600), 'Memasang modul...', font(F_SEMI, 31), TEKS)
        d.rounded_rectangle([100, 650, LW - 100, 680], 15, fill=KARTU2)
        if m > .02: d.rounded_rectangle([100, 650, 100 + (LW - 200) * e_io(m), 680], 15, fill=HIJAU_T)
    e = prog(t, t_err - .1, .35)
    if e > 0:
        y = 760
        d.rounded_rectangle([60, y, LW - 60, y + 260], 36, fill=mix(KARTU, (60, 28, 34), e),
                            outline=mix(KARTU, MERAH, e), width=4)
        ikon_x(d, 170, y + 90, 40, MERAH)
        teks(d, (250, y + 55), 'bot kamu error', font(F_BLACK, 36), TEKS)
        teks(d, (250, y + 110), 'yang mati cuma bot ini', font(F_REG, 29), TEKS2)
        teks(d, (250, y + 155), 'app tetep jalan', font(F_REG, 29), TEKS2)
    a = prog(t, t_aman - .2, .4)
    if a > 0:
        sc = e_back(a, 2)
        d.rounded_rectangle([LW / 2 - 200 * sc, 1080, LW / 2 + 200 * sc, 1190], 55, fill=HIJAU_TUA)
        if sc > .6:
            ikon_perisai(d, LW / 2 - 120, 1135, 30, HIJAU_T, True, HIJAU_TUA)
            teks(d, (LW / 2 + 20, 1135), 'APP AMAN', font(F_BLACK, 36), HIJAU_T, 'mm')

def layar_cta(im, d, t, D):
    t_komen, t_join, t_bio, t_fol = w('komen!'), w('Join'), w('bio.'), w('follow')
    d.rectangle([0, 0, LW, LH], fill=(20, 20, 24)); status_bar(d)
    gambar_bulan(d, LW / 2, 320, 100, HIJAU_T, (20, 20, 24))
    teks(d, (LW / 2, 470), 'Fitur apa lagi nih?', font(F_BLACK, 44), TEKS, 'mm')
    kom = [('rizky.dev', 'notif shopee dong kak!', 0), ('nadiaa_', 'bisa buat 2 grup?', .5)]
    for i, (n, s, dt) in enumerate(kom):
        u = e_out(prog(t, t_komen - .5 + dt, .4))
        if u <= 0: continue
        yy = 560 + i * 150 + (1 - u) * 50
        d.rounded_rectangle([60, yy, LW - 60, yy + 130], 32, fill=(30, 30, 36))
        d.ellipse([90, yy + 30, 160, yy + 100], fill=[(233, 120, 90), (200, 110, 190)][i])
        teks(d, (190, yy + 28), n, font(F_SEMI, 27), TEKS2)
        teks(d, (190, yy + 68), s, font(F_REG, 31), TEKS)
    j = e_back(prog(t, t_join - .1, .45), 1.8)
    if j > 0:
        y = 900 + (1 - j) * 100
        denyut(d, LW / 2, y + 90, 100 * j, t, HIJAU_T, 1.1, 2, 6)
        d.rounded_rectangle([60, y, LW - 60, y + 180], 40, fill=HIJAU_T)
        teks(d, (LW / 2, y + 70), 'JOIN SALURAN WA', font(F_BLACK, 46), (10, 25, 15), 'mm')
        teks(d, (LW / 2, y + 130), 'APK + tools tiap minggu', font(F_SEMI, 30), (10, 40, 20), 'mm')
    b = prog(t, t_bio - .2, .35)
    if b > 0:
        teks(d, (LW / 2, 1130), 'link-nya ada di bio!', font(F_SEMI, 32), mix(BG, HIJAU_T, b), 'mm')
    f = prog(t, t_fol - .2, .4)
    if f > 0:
        sc = e_back(f, 2.2) * (1 + .04 * math.sin(max(0, t - t_fol) * 7))
        d.rounded_rectangle([LW / 2 - 190 * sc, 1190, LW / 2 + 190 * sc, 1300], 55, fill=(254, 44, 85))
        if sc > .6: teks(d, (LW / 2, 1245), '+ Follow', font(F_BLACK, 42), (255, 255, 255), 'mm')

LAYAR4 = [R3.layar_kacau, R3.layar_bersih, R2.LAYAR[1], layar_host, R2.LAYAR[2],
          layar_tertaut, layar_rilis, R2.LAYAR[3], R2.LAYAR[4], layar_pipa,
          R2.LAYAR[5], R2.LAYAR[6], R2.LAYAR[7], layar_zip, layar_cta]

# ---------- konversi cue (nama-vo -> index) ----------
SFX4 = []
for _c in SFX:
    _v, _k, _f, _g, _s, _j = _c[:6]
    SFX4.append((I(_v), _k, _f, _g, _s, _j) + tuple(_c[6:]))
STIKER4 = [(I(v), k, tx, cl, x, y, 0) for v, k, tx, cl, x, y in STIKER]
ZOOM4 = [(I(v), k, j, s) for v, k, j, s in ZOOM]

# ---------- stiker teks KOTAK TEGAK TAJAM (tanpa radius, tanpa miring) ----------
_st4 = {}
def stiker4(im, t, teks_, warna, x, y, t0):
    u = prog(t, t0, .3)
    if u <= 0 or t > t0 + 1.8: return
    hilang = clamp((t0 + 1.8 - t) / .25)
    sc = e_back(u, 3.0) * hilang
    if sc <= .02: return
    k = (teks_, warna)
    if k not in _st4:
        f = font(F_BLACK, 70); tw = f.getlength(teks_)
        img = Image.new('RGBA', (int(tw + 90), 150), (0, 0, 0, 0)); dd = ImageDraw.Draw(img)
        dd.rectangle([8, 12, img.width - 8, 138], fill=(255, 255, 255))
        dd.rectangle([18, 22, img.width - 18, 128], fill=warna)
        dd.text((img.width / 2, 75), teks_, font=f, fill=(15, 15, 15), anchor='mm')
        _st4[k] = img
    img = _st4[k]
    img2 = img.resize((max(1, int(img.width * sc)), max(1, int(img.height * sc))), Image.BILINEAR)
    im.alpha_composite(img2, (int(x - img2.width / 2), int(y - img2.height / 2)))

# ---------- meme KOTAK TEGAK TAJAM ----------
_meme4 = {}
def meme_img4(no, ukuran):
    k = (no, ukuran)
    if k in _meme4: return _meme4[k]
    src = Image.open(os.path.join(ROOT, 'stiker', f's{no}.webp')).convert('RGBA')
    src.thumbnail((ukuran, ukuran), Image.LANCZOS)
    pad = 18
    out = Image.new('RGBA', (src.width + pad * 2, src.height + pad * 2), (0, 0, 0, 0))
    big = Image.new('L', out.size, 0); big.paste(src.getchannel('A'), (pad, pad))
    border = big.filter(ImageFilter.MaxFilter(15))
    sh = border.filter(ImageFilter.GaussianBlur(9)).point(lambda v: int(v * .55))
    out.paste((0, 0, 0, 255), (6, 9), sh.crop((0, 0, out.width - 6, out.height - 9)))
    out.paste((255, 255, 255, 255), (0, 0), border)
    out.alpha_composite(src, (pad, pad))
    _meme4[k] = out
    return out

def gambar_meme4(im, si, lt):
    for (vo, kata, no, x, y, uk) in MEME:
        if I(vo) != si: continue
        t0 = R2.wk(si, kata, 'awal') - .05
        u = lt - t0
        if u < 0 or u > 2.0: continue
        masuk = e_back(clamp(u / .32), 2.6)
        keluar = clamp((2.0 - u) / .22)
        sc = masuk * (.6 + .4 * keluar) if keluar < 1 else masuk
        al = keluar
        if sc < .03: continue
        img = meme_img4(no, uk)
        img2 = img.resize((max(1, int(img.width * sc)), max(1, int(img.height * sc))), Image.BILINEAR)
        if al < 1: img2.putalpha(img2.getchannel('A').point(lambda v: int(v * al)))
        im.alpha_composite(img2, (int(x - img2.width / 2), int(y - img2.height / 2)))

# ---------- subtitle gaya v3 + meme v4 ----------
_merah4 = []
def kedip4(im, t, si):
    s = SCENES[si]
    if si != 0: return
    lt = t - s['mulai']
    t_stop = R2.wk(0, 'Stop,'); t_ini = R2.wk(0, 'Ini')
    if t_stop <= lt < t_ini: return
    if not _merah4:
        g = Image.new('L', (W, H), 255); ImageDraw.Draw(g).rounded_rectangle([40, 40, W - 40, H - 40], 160, fill=0)
        g = g.filter(ImageFilter.GaussianBlur(70))
        m = Image.new('RGBA', (W, H), (241, 40, 60, 0)); m.putalpha(g); _merah4.append(m)
    a = (.25 + .30 * abs(math.sin(lt * 7))) * .8
    m = _merah4[0].copy(); m.putalpha(_merah4[0].getchannel('A').point(lambda v: int(v * a)))
    im.alpha_composite(m)

def subtitle4(im, t, si):
    s = SCENES[si]
    kedip4(im, t, si)
    gambar_meme4(im, si, t - s['mulai'])
    if 'pot' not in s: s['pot'] = R3.potong(s['kata'])
    aktif = None; ia = 0
    for i, p in enumerate(s['pot']):
        if p[0][1] - .04 <= t <= p[-1][2] + .22: aktif = p; ia = i
    if aktif is None: return
    f = font(F_BLACK, 66); sp = 34
    kata = [k[0].upper() for k in aktif]
    lebar = [f.getlength(k) for k in kata]
    tot = sum(lebar) + sp * (len(kata) - 1)
    lay = Image.new('RGBA', (int(tot + 120), 190), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    x = 60; cy = 95
    for (k, a0, a1), kk, lw in zip(aktif, kata, lebar):
        if t < a0 - .04:
            x += lw + sp; continue
        u = clamp((t - a0 + .04) / .16)
        sc = .6 + .4 * e_back(u, 3)
        ff = font(F_BLACK, max(8, int(66 * sc)))
        cx = x + lw / 2
        aktif_kata = a0 - .04 <= t < a1 + .06
        if aktif_kata:
            pw, ph = lw * sc + 28, 92 * sc
            d.rounded_rectangle([cx - pw / 2 + 5, cy - ph / 2 + 7, cx + pw / 2 + 5, cy + ph / 2 + 7], 22, fill=(0, 0, 0, 170))
            d.rounded_rectangle([cx - pw / 2, cy - ph / 2, cx + pw / 2, cy + ph / 2], 22, fill=(37, 211, 102))
            d.text((cx, cy + 2), kk, font=ff, fill=(10, 20, 15), anchor='mm')
        else:
            d.text((cx + 4, cy + 7), kk, font=ff, fill=(0, 0, 0, 200), anchor='mm', stroke_width=10, stroke_fill=(0, 0, 0, 200))
            d.text((cx, cy), kk, font=ff, fill=(255, 255, 255), anchor='mm', stroke_width=9, stroke_fill=(0, 0, 0))
        x += lw + sp
    sud = [-2.5, 2, -1.5, 2.5, -2, 1.5][ia % 6]
    lay = lay.rotate(sud, resample=Image.BICUBIC, expand=True)
    skala = min(1, 1000 / lay.width)
    if skala < 1: lay = lay.resize((int(lay.width * skala), int(lay.height * skala)), Image.LANCZOS)
    im.alpha_composite(lay, (int(W / 2 - lay.width / 2), int(1560 - lay.height / 2)))

# ---------- timeline + frame + audio (60 fps) ----------
def bangun_timeline4():
    t = 0.0
    for s in SCENES:
        a, sr = R.baca_wav(os.path.join(ROOT, 'wav2t', s['vo'] + '.wav'))
        s['audio'] = a; s['sr'] = sr; s['dur_vo'] = len(a) / sr
        j = s.get('jeda', R.JEDA_AWAL)
        s['mulai'] = t; s['vo_mulai'] = t + j
        ekstra = .9 if s['vo'] == '07' else 0
        s['dur'] = j + s['dur_vo'] + R.JEDA_AKHIR + ekstra
        s['kata'] = [(k, s['vo_mulai'] + a0, s['vo_mulai'] + a1) for k, a0, a1 in R2.waktu_kata(a, sr, s['teks'], s['vo'])]
        t += s['dur']
    SCENES[-1]['dur'] += R.OUTRO
    return t + R.OUTRO

def frame4(t, total):
    si = 0
    for i, s in enumerate(SCENES):
        if t >= s['mulai']: si = i
    s = SCENES[si]; lt = t - s['mulai']; R2.CUR[0] = si; R.SCENES = SCENES
    im = R.ST['bg'].copy().convert('RGBA'); d = ImageDraw.Draw(im)
    for k in range(14):
        rnd = random.Random(k)
        x = rnd.random() * W + math.sin(t * .6 + k) * 30; y = (rnd.random() * H - t * (18 + rnd.random() * 30)) % H; r = 2 + rnd.random() * 4
        d.ellipse([x - r, y - r, x + r, y + r], fill=(30, 90, 70))
    lay = Image.new('RGBA', (LW, LH), BG + (255,)); ld = ImageDraw.Draw(lay)
    LAYAR4[si](lay, ld, lt, s['dur'])
    lay = lay.resize((SW, SH), Image.LANCZOS)
    u = e_out(prog(lt, 0, .35)) if si > 0 else 1
    dy = int((1 - u) * 70)
    fy = int(math.sin(t * 1.4) * 6)
    hp = R.ST['hp'].copy()
    kanvas = Image.new('RGBA', (SW, SH), BG + (255,)); kanvas.alpha_composite(lay, (0, dy))
    hp.paste(kanvas, (20 + BZ, 20 + BZ), R.ST['mask_layar'])
    if si > 0 and lt < .18:
        fl = Image.new('RGBA', (SW, SH), (255, 255, 255, int(120 * (1 - lt / .18))))
        area = hp.crop((20 + BZ, 20 + BZ, 20 + BZ + SW, 20 + BZ + SH)); hp.paste(Image.alpha_composite(area, fl), (20 + BZ, 20 + BZ), R.ST['mask_layar'])
    miring = 0
    if LAYAR4[si] is R2.layar_telpon:
        t_mir = R2.wk(si, 'miring.')
        miring = 9 * e_back(prog(lt, t_mir, .45), 2.2) * (1 - e_io(prog(lt, s['dur'] - .5, .45)))
    if LAYAR4[si] is R2.layar_telpon and lt < R2.wk(si, 'ternyata'):
        miring = math.sin(lt * 45) * 1.2 * (1 if (lt % .8) < .5 else 0)
    if abs(miring) > .01:
        hp = hp.rotate(miring, resample=Image.BICUBIC, expand=True)
        im.alpha_composite(hp, (int(PX - 20 - (hp.width - PW - 40) / 2), int(PY - 20 + fy - (hp.height - PH - 40) / 2)))
    else:
        im.alpha_composite(hp, (PX - 20, PY - 20 + fy))
    if LAYAR4[si] is R2.layar_splash:
        R.pil_samping(im, lt, 'Tanpa server', 70, 1010, R2.wk(si, 'server,') - .05, True)
        R.pil_samping(im, lt, 'Tanpa laptop', W - 70, 1150, R2.wk(si, 'laptop.') - .05, False)
    if si == len(SCENES) - 1:
        R.tombol_follow(im, lt, R2.wk(si, 'follow') - .1)
    R.chip_seri(im, t)
    im.alpha_composite(R.judul_frame(si, lt), (0, 262))
    for (ss, kata, tx, c, x, y, sd) in STIKER4:
        if ss == si: stiker4(im, lt, tx, c, x, y, R2.wk(ss, kata, 'akhir' if kata.endswith(('?', '!', '.')) else 'awal'))
    R.subtitle(im, t, si)
    if si == len(SCENES) - 1:
        R.outro(im, t, s['mulai'] + s['dur'] - R.OUTRO)
    for (ss, kata, jenis, geser) in ZOOM4:
        if ss != si: continue
        z = lt - (R2.wk(ss, kata, jenis) + geser)
        if 0 <= z < .35:
            f = 1 + .07 * (1 - z / .35) ** 2
            cw, ch = int(W / f), int(H / f)
            ox = (W - cw) // 2 + int(math.sin(z * 90) * 6 * (1 - z / .35)); oy = (H - ch) // 2
            im = im.crop((ox, oy, ox + cw, oy + ch)).resize((W, H), Image.BILINEAR)
    return im.convert('RGB')

def render_bagian4(a, b, total, out):
    R.ST = R.buat_statis(); R.SCENES = SCENES
    p = subprocess.Popen([R.ffmpeg(), '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS),
                          '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', out], stdin=subprocess.PIPE)
    for f in range(a, b): p.stdin.write(frame4(f / FPS, total).tobytes())
    p.stdin.close(); p.wait()

def pasang4():
    R2.SCENES = SCENES; R2.LAYAR = LAYAR4; R2.SFX = SFX4; R2.ZOOM = ZOOM4; R2.STIKER = STIKER4
    R.chip_seri = lambda im, t: None
    R.subtitle = subtitle4
    R.SCENES = SCENES

if __name__ == '__main__':
    pasang4()
    hilang = [v for v in URUT if not (os.path.exists(os.path.join(ROOT, 'wav2t', v + '.wav')) and os.path.exists(os.path.join(ROOT, 'wav2t', v + '.json')))]
    if hilang:
        print('TIMING HILANG:', hilang, '-- butuh wav2t/*.wav + *.json (disalin dari sesi lama, jangan transkrip ulang)'); sys.exit(2)
    total = bangun_timeline4(); nf = int(total * FPS)
    if '--kata' in sys.argv:
        for i, s in enumerate(SCENES): print(i, s['vo'], round(s['mulai'], 2), [(k, round(a - s['mulai'], 2)) for k, a, b in s['kata']][:5])
        print('total', round(total, 2), 'detik,', nf, 'frame'); sys.exit()
    if '--cek' in sys.argv:
        R.ST = R.buat_statis()
        for i, v in enumerate(sys.argv[sys.argv.index('--cek') + 1:]): frame4(float(v), total).save(os.path.join(ROOT, f'cek4_{i}.png'))
        sys.exit()
    if '--bagian' in sys.argv:
        i = sys.argv.index('--bagian'); render_bagian4(int(sys.argv[i + 1]), int(sys.argv[i + 2]), total, sys.argv[i + 3]); sys.exit()
    tmp = os.path.join(ROOT, 'tmp'); os.makedirs(tmp, exist_ok=True)
    print('durasi', round(total, 2), 'detik,', nf, 'frame')
    R2.buat_audio(total, os.path.join(tmp, 'audio_musik.wav'), os.path.join(tmp, 'audio_vo.wav'))
    b = [(0, nf // 4), (nf // 4, nf // 2), (nf // 2, 3 * nf // 4), (3 * nf // 4, nf)]
    ps = [subprocess.Popen([sys.executable, __file__, '--bagian', str(a), str(z), os.path.join(tmp, f'b{k}.mp4')]) for k, (a, z) in enumerate(b)]
    for p in ps: p.wait()
    with open(os.path.join(tmp, 'daftar.txt'), 'w') as f: f.write(''.join(f"file 'b{k}.mp4'\n" for k in range(4)))
    subprocess.run([R.ffmpeg(), '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', os.path.join(tmp, 'daftar.txt'), '-c', 'copy', os.path.join(tmp, 'video.mp4')], check=True)
    for nama, au in [('tiktok-v4-wa-release-bot.mp4', 'audio_musik.wav'), ('tiktok-v4-tanpa-musik.mp4', 'audio_vo.wav')]:
        subprocess.run([R.ffmpeg(), '-v', 'error', '-y', '-i', os.path.join(tmp, 'video.mp4'), '-i', os.path.join(tmp, au), '-c:v', 'copy',
                        '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-shortest', '-movflags', '+faststart', os.path.join(ROOT, nama)], check=True)
    print('selesai')
