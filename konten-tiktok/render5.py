#!/usr/bin/env python3
"""Versi 5 — v4 + scene baru 'si Kall ngapain wok' (kenalin developer),
kartu detail varian APK (ukuran rilis beneran), chip interval/token,
komentar + balasan Kall di CTA, SFX/meme/stiker ekstra.
Implementasi: patch di atas render4 (tanpa ubah file v4).
Pakai: python3 render5.py  |  python3 render5.py --cek 130 145"""
import math, os, sys, subprocess
import render4 as R4
import render as R
import render2 as R2
import render3 as R3
from render import (W, H, font, F_BLACK, F_SEMI, F_REG, BG, KARTU, KARTU2, GARIS, HIJAU, HIJAU_T, HIJAU_TUA,
                    TEKS, TEKS2, MERAH, clamp, e_out, e_io, e_back, prog, mix, teks, status_bar, header_wa,
                    header_app, ikon_perisai, ikon_cek, ikon_x, denyut, gambar_bulan, jari, LW, LH, PX, PY,
                    PW, PH, BZ, SW, SH)

ROOT = os.path.dirname(os.path.abspath(__file__))
w = R2.w

JUDUL16 = 'Si Kall *ngapain wok?*'
TEKS16 = ('Eh bentar, kata komen kemarin, si Kall ngapain wok? Nih aku kenalin. '
          'Kall itu yang bikin aplikasi ini. Kerjaannya begadang ngoding, '
          'biar lu bisa rebahan. Gokil kan? Coba sapa dia di komen!')

# ---------- urutan + naskah (scene 16 disisip sebelum CTA) ----------
TEKS_BARU5 = dict(R4.TEKS_BARU)
TEKS_BARU5['16'] = (JUDUL16, TEKS16)
URUT5 = [v for v in R4.URUT if v != '15'] + ['16', '15']
SCENES5 = []
for v in URUT5:
    if v in TEKS_BARU5:
        SCENES5.append(dict(vo=v, judul=TEKS_BARU5[v][0], teks=TEKS_BARU5[v][1]))
    else:
        s = dict(R4.cari(v)); s.pop('kata', None); s.pop('pot', None); SCENES5.append(s)
IDX5 = {s['vo']: i for i, s in enumerate(SCENES5)}
def I5(v): return IDX5[v]

# ---------- cue baru v5 (format vo, dikonversi ke index) ----------
SFX5_VO = [
    ('16', 'bentar,', 'wait-wait-wait-what-the-hell-legend-sound', .35, 0, 'awal', 1.8),
    ('16', 'wok?', 'anjayhaha', .45, 0, 'akhir', 1.8),
    ('16', 'begadang', 'emergency-meeting', .22, 0, 'awal', 1.0),
    ('16', 'Gokil', 'mantappu', .5, 0, 'akhir', 2.2),
    ('06', 'gini.', 'tapi-boong-hahaha', .4, 0, 'akhir', 2.0),
    ('02', 'Enteng', 'yeay', .3, 0, 'awal', 1.2),
    ('15', 'komen!', 'notification-spam', .22, 0, 'awal', 1.4),
    ('08', 'gelap', 'pop_7e9Is8L', .4, 0, 'awal'),
    ('05', 'caption', 'female-giggle', .22, 0, 'awal', 1.2),
]
STIKER5_VO = [
    ('16', 'Gokil', 'GOKIL SIH', (37, 211, 102), 540, 820),
    ('16', 'rebahan.', 'TIM REBAHAN', (255, 214, 0), 540, 1330),
    ('10', 'APK,', '3 VARIAN!', (255, 214, 0), 540, 1330),
    ('12', 'menit.', 'TIAP 15 MNT', (37, 211, 102), 540, 1330),
]
MEME5_VO = [
    ('16', 'begadang', 5, 845, 800, 280),     # KUKURUYUK — begadang sampe pagi
    ('16', 'rebahan.', 2, 240, 1180, 280),    # tapi gak gini juga kali
    ('06', 'gini.', 16, 845, 1150, 290),      # TAPI BOONG (Tom) + sfx tapi-boong
]
ZOOM5_VO = [('16', 'wok?', 'akhir', .02)]

SFX5 = []
for _c in list(R4.SFX) + SFX5_VO:
    _v, _k, _f, _g, _s, _j = _c[:6]
    SFX5.append((I5(_v), _k, _f, _g, _s, _j) + tuple(_c[6:]))
STIKER5 = [(I5(v), k, tx, cl, x, y, 0) for v, k, tx, cl, x, y in list(R4.STIKER) + STIKER5_VO]
ZOOM5 = [(I5(v), k, j, s) for v, k, j, s in list(R4.ZOOM) + ZOOM5_VO]
R4.MEME.extend(MEME5_VO)  # MEME tetap basis vo; I() dipatch lewat R4.IDX

# ---------- layar baru: kenalin si Kall ----------
def layar_kall(im, d, t, D):
    t_komen, t_wok, t_kenal, t_rebahan, t_gokil, t_ajak = (w('komen'), w('wok?'), w('kenalin.'),
                                                           w('rebahan.'), w('Gokil'), w('komen!', ke=0))
    header_app(d, 'Kenalin, si Kall')
    # komentar 1
    u = e_out(prog(t, t_komen - .3, .4))
    if u > 0:
        yy = 300 + (1 - u) * 60
        d.rounded_rectangle([60, yy, LW - 60, yy + 130], 32, fill=(30, 30, 36))
        d.ellipse([90, yy + 30, 160, yy + 100], fill=(233, 120, 90))
        teks(d, (190, yy + 28), '@bocah_ngopi', font(F_SEMI, 26), TEKS2)
        teks(d, (190, yy + 66), 'sikall ngapain wok', font(F_REG, 31), TEKS)
    # komentar 2
    u = e_out(prog(t, t_wok - .1, .4))
    if u > 0:
        yy = 450 + (1 - u) * 60
        d.rounded_rectangle([60, yy, LW - 60, yy + 130], 32, fill=(30, 30, 36))
        d.ellipse([90, yy + 30, 160, yy + 100], fill=(110, 150, 230))
        teks(d, (190, yy + 28), '@cihuyyy', font(F_SEMI, 26), TEKS2)
        teks(d, (190, yy + 66), 'kall lagi bikin apa', font(F_REG, 31), TEKS)
    # kartu developer
    u = e_back(prog(t, t_kenal - .1, .45), 1.7)
    if u > 0:
        yy = 600 + (1 - u) * 80
        d.rounded_rectangle([60, yy, LW - 60, yy + 440], 40, fill=KARTU, outline=HIJAU_T, width=4)
        if u > .7:
            d.ellipse([100, yy + 40, 200, yy + 140], fill=HIJAU_T)
            teks(d, (150, yy + 90), 'K', font(F_BLACK, 56), (10, 25, 15), 'mm')
            teks(d, (230, yy + 48), 'sikall', font(F_BLACK, 38), TEKS)
            teks(d, (230, yy + 98), 'developer aplikasi ini', font(F_REG, 27), TEKS2)
            gambar_bulan(d, LW - 150, yy + 90, 40, (240, 180, 70), KARTU)
            for i, bar in enumerate(['$ begadang --ngoding', '$ bikin fitur baru', '$ upload rilis...']):
                uu = prog(t, t_kenal + .3 + i * .45, .3)
                if uu > 0:
                    teks(d, (110, yy + 200 + i * 62), bar[:int(len(bar) * e_out(uu))], font(F_REG, 28), (180, 220, 180))
    # balasan Kall
    u = e_out(prog(t, t_rebahan - .2, .4))
    if u > 0:
        yy = 1060 + (1 - u) * 60
        d.rounded_rectangle([140, yy, LW - 60, yy + 120], 32, fill=(22, 42, 32), outline=HIJAU_T, width=3)
        d.ellipse([170, yy + 28, 232, yy + 90], fill=HIJAU_T)
        teks(d, (201, yy + 59), 'K', font(F_BLACK, 36), (10, 25, 15), 'mm')
        teks(d, (258, yy + 24), 'sikall', font(F_SEMI, 26), HIJAU_T)
        teks(d, (258, yy + 60), 'gas, lagi dibikin!', font(F_REG, 31), TEKS)
    # ajakan bawah
    g = prog(t, t_ajak - .2, .35)
    if g > 0:
        d.rounded_rectangle([60, 1330, LW - 60, 1440], 55, fill=mix(KARTU, HIJAU_TUA, g))
        if g > .6:
            teks(d, (LW / 2, 1385), 'sapa dia di komen!', font(F_SEMI, 33), HIJAU_T, 'mm')

# ---------- bungkus layar host: koreksi ukuran + kartu varian APK ----------
def layar_host5(im, d, t, D):
    R4.layar_host(im, d, t, D)
    if t < w('Node.js-nya') - .15:
        return
    # (a) koreksi: arm64 beneran ±19 MB (rilis v1.6.7 = 19.2 MB), bukan ±21
    d.rectangle([80, 360, 700, 420], fill=KARTU)
    teks(d, (84, 380), chr(177) + '19 MB  ' + chr(8226) + ' Node.js 18 di dalemnya', font(F_REG, 27), TEKS2)
    # (b) tiga varian APK dari halaman rilis
    varian = [('arm64 ' + chr(8226) + ' 19 MB', w('install'), True),
              ('32-bit ' + chr(8226) + ' 19 MB', w('buka,'), False),
              ('universal ' + chr(8226) + ' 35 MB', w('beres.'), False)]
    for i, (label, t0, utama) in enumerate(varian):
        u = prog(t, t0, .35)
        if u <= 0:
            continue
        sc = e_back(u, 2)
        x0, x1 = 63 + i * 278, 323 + i * 278
        cx = (x0 + x1) / 2
        ww = (x1 - x0) * sc
        d.rounded_rectangle([cx - ww / 2, 600, cx + ww / 2, 690], 45,
                            fill=HIJAU_TUA if utama else KARTU2)
        if sc > .7:
            teks(d, (cx, 645), label, font(F_SEMI, 26), HIJAU_T if utama else TEKS, 'mm')

# ---------- bungkus layar rilis: chip interval + token ----------
def layar_rilis5(im, d, t, D):
    R4.layar_rilis(im, d, t, D)
    t_oto = w('otomatis')
    chips = [('interval bisa diatur', t_oto + .3), ('token = anti rate-limit', t_oto + .6)]
    for i, (label, t0) in enumerate(chips):
        u = prog(t, t0, .35)
        if u <= 0:
            continue
        sc = e_back(u, 2)
        x0, x1 = (60, 440) if i == 0 else (456, 876)
        cx = (x0 + x1) / 2
        ww = (x1 - x0) * sc
        d.rounded_rectangle([cx - ww / 2, 1330, cx + ww / 2, 1415], 42, fill=KARTU2)
        if sc > .7:
            teks(d, (cx, 1372), label, font(F_SEMI, 27), TEKS, 'mm')

# ---------- CTA v5: komentar dipadetin + balasan Kall ----------
def layar_cta5(im, d, t, D):
    t_komen, t_join, t_bio, t_fol = w('komen!'), w('Join'), w('bio.'), w('follow')
    d.rectangle([0, 0, LW, LH], fill=(20, 20, 24)); status_bar(d)
    gambar_bulan(d, LW / 2, 300, 90, HIJAU_T, (20, 20, 24))
    teks(d, (LW / 2, 440), 'Fitur apa lagi nih?', font(F_BLACK, 44), TEKS, 'mm')
    kom = [('rizky.dev', 'notif shopee dong kak!', 0), ('nadiaa_', 'bisa buat 2 grup?', .5)]
    for i, (n, s, dt) in enumerate(kom):
        u = e_out(prog(t, t_komen - .5 + dt, .4))
        if u <= 0:
            continue
        yy = 520 + i * 130 + (1 - u) * 50
        d.rounded_rectangle([60, yy, LW - 60, yy + 112], 30, fill=(30, 30, 36))
        d.ellipse([88, yy + 26, 152, yy + 90], fill=[(233, 120, 90), (200, 110, 190)][i])
        teks(d, (180, yy + 22), n, font(F_SEMI, 26), TEKS2)
        teks(d, (180, yy + 58), s, font(F_REG, 30), TEKS)
    u = e_out(prog(t, t_komen + .6, .4))
    if u > 0:
        yy = 780 + (1 - u) * 50
        d.rounded_rectangle([140, yy, LW - 60, yy + 104], 30, fill=(22, 42, 32), outline=HIJAU_T, width=3)
        d.ellipse([168, yy + 24, 224, yy + 80], fill=HIJAU_T)
        teks(d, (196, yy + 52), 'K', font(F_BLACK, 34), (10, 25, 15), 'mm')
        teks(d, (250, yy + 18), 'sikall', font(F_SEMI, 26), HIJAU_T)
        teks(d, (250, yy + 54), 'siap, lagi dibikin!', font(F_REG, 30), TEKS)
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
        if sc > .6:
            teks(d, (LW / 2, 1245), '+ Follow', font(F_BLACK, 42), (255, 255, 255), 'mm')

LAYAR5 = (R4.LAYAR4[:3] + [layar_host5] + R4.LAYAR4[4:6] + [layar_rilis5] +
          R4.LAYAR4[7:14] + [layar_kall, layar_cta5])
assert len(LAYAR5) == len(SCENES5) == 16, (len(LAYAR5), len(SCENES5))

def pasang5():
    R4.SCENES = SCENES5
    R4.LAYAR4 = LAYAR5
    R4.IDX = IDX5
    R4.STIKER4 = STIKER5
    R4.ZOOM4 = ZOOM5
    R2.SCENES = SCENES5; R2.LAYAR = LAYAR5; R2.SFX = SFX5; R2.ZOOM = ZOOM5; R2.STIKER = STIKER5
    R.chip_seri = lambda im, t: None
    R.subtitle = R4.subtitle4
    R.SCENES = SCENES5

if __name__ == '__main__':
    pasang5()
    hilang = [v for v in URUT5 if not (os.path.exists(os.path.join(ROOT, 'wav2t', v + '.wav')) and
                                       os.path.exists(os.path.join(ROOT, 'wav2t', v + '.json')))]
    if hilang:
        print('TIMING HILANG:', hilang); sys.exit(2)
    # validasi cue: semua kata harus ketemu (biar nggak KeyError di tengah render)
    total = R4.bangun_timeline4()
    for si, kata, *_ in SFX5 + STIKER5 + ZOOM5:
        assert any(kata.lower() in k[0].lower() for k in SCENES5[si]['kata']), (si, kata)
    for vo, kata, *_ in R4.MEME:
        assert any(kata.lower() in k[0].lower() for k in SCENES5[I5(vo)]['kata']), (vo, kata)
    nf = int(total * R4.FPS)
    if '--kata' in sys.argv:
        for i, s in enumerate(SCENES5):
            print(i, s['vo'], round(s['mulai'], 2), [(k, round(a - s['mulai'], 2)) for k, a, b in s['kata']][:4])
        print('total', round(total, 2), 'detik,', nf, 'frame'); sys.exit()
    if '--cek' in sys.argv:
        R.ST = R.buat_statis()
        for i, v in enumerate(sys.argv[sys.argv.index('--cek') + 1:]):
            R4.frame4(float(v), total).save(os.path.join(ROOT, f'cek5_{i}.png'))
        sys.exit()
    if '--bagian' in sys.argv:
        i = sys.argv.index('--bagian')
        R4.render_bagian4(int(sys.argv[i + 1]), int(sys.argv[i + 2]), total, sys.argv[i + 3]); sys.exit()
    tmp = os.path.join(ROOT, 'tmp'); os.makedirs(tmp, exist_ok=True)
    print('durasi', round(total, 2), 'detik,', nf, 'frame')
    R2.buat_audio(total, os.path.join(tmp, 'audio_musik.wav'), os.path.join(tmp, 'audio_vo.wav'))
    b = [(0, nf // 4), (nf // 4, nf // 2), (nf // 2, 3 * nf // 4), (3 * nf // 4, nf)]
    ps = [subprocess.Popen([sys.executable, __file__, '--bagian', str(a), str(z), os.path.join(tmp, f'b{k}.mp4')])
          for k, (a, z) in enumerate(b)]
    gagal = 0
    for k, p in enumerate(ps):
        rc = p.wait()
        if rc != 0:
            print(f'WORKER b{k} GAGAL (rc={rc})', file=sys.stderr); gagal += 1
    if gagal:
        sys.exit(3)
    with open(os.path.join(tmp, 'daftar.txt'), 'w') as f:
        f.write(''.join(f"file 'b{k}.mp4'\n" for k in range(4)))
    subprocess.run([R.ffmpeg(), '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i',
                    os.path.join(tmp, 'daftar.txt'), '-c', 'copy', os.path.join(tmp, 'video.mp4')], check=True)
    for nama, au in [('tiktok-v5-wa-release-bot.mp4', 'audio_musik.wav'),
                     ('tiktok-v5-tanpa-musik.mp4', 'audio_vo.wav')]:
        subprocess.run([R.ffmpeg(), '-v', 'error', '-y', '-i', os.path.join(tmp, 'video.mp4'), '-i',
                        os.path.join(tmp, au), '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
                        '-ar', '44100', '-shortest', '-movflags', '+faststart',
                        os.path.join(ROOT, nama)], check=True)
    print('selesai')
