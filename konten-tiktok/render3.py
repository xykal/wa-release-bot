#!/usr/bin/env python3
"""Versi 3: hook "stop scroll" (grup diserbu → freeze + STOP! → dijagain bot, auto bersih),
stiker meme (getstickerpack: Stiker Meme by IG @rullvierro_), subtitle gaya baru, tanpa label episode.
Pakai: python3 render3.py  |  python3 render3.py --cek 0.5 2 ..."""
import math, os, sys, random, subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import render as R
import render2 as R2
from render import (W, H, font, F_BLACK, F_SEMI, F_REG, BG, KARTU, KARTU2, HIJAU, HIJAU_T, HIJAU_TUA, TEKS, TEKS2, MERAH,
                    clamp, e_out, e_io, e_back, prog, mix, teks, header_wa, ikon_perisai, ikon_cek, denyut, LW, LH)

ROOT = os.path.dirname(os.path.abspath(__file__))

HOOK = [
    dict(vo='00a', judul='Grup kamu *diserbu* akun aneh', jeda=0.85,
         teks='Stop, stop! Jangan di-skip dulu. Ini grup WA kamu, kalau nggak ada yang jagain.'),
    dict(vo='00b', judul='Pakai bot? *Auto bersih!*',
         teks='Dan ini, kalau dijagain bot buatan aku. Auto bersih! Adem banget, kan?'),
]
SCENES = HOOK + [dict(s) for s in R2.SCENES[1:]]
for s in SCENES: s.pop('kata', None); s.pop('pot', None)

G = 1  # geser index scene lama (scene 0 lama diganti 2 scene hook)
SFX = [(0, 'Stop,', 'record-scratch', .75, -.08, 'awal'),
       (0, 'Stop,', 'notification-spam', .30, -.85, 'awal', .85),
       (0, 'Ini', 'notification-spam', .28, 0, 'awal', 2.4),
       (0, 'grup', 'danger-alarm-sound-effect-meme', .20, 0, 'awal', 1.9),
       (0, 'jagain.', 'vine-boom', .6, .02, 'akhir'),
       (1, 'bersih!', 'sparkle-sound-effect', .40, -.15, 'awal', 1.6),
       (1, 'kan?', 'family-feud-good-answer', .30, 0, 'akhir')]
for c in R2.SFX:
    if c[0] == 0: continue
    c = list(c); c[0] += G; SFX.append(tuple(c))
STIKER = [(0, 'Stop,', 'STOP!', (241, 92, 109), 540, 820, -8)]
for c in R2.STIKER:
    if c[0] == 0 or c[2] == 'HIHIHI': continue
    c = list(c); c[0] += G; STIKER.append(tuple(c))
ZOOM = [(0, 'Stop,', 'awal', -.05), (0, 'jagain.', 'akhir', .02), (1, 'bersih!', 'awal', 0)]
# stiker meme: scene, kata, file, x, y, ukuran, sudut
MEME = [(0, 'grup', 21, 225, 1090, 330, -9), (0, 'jagain.', 28, 850, 1180, 320, 8),
        (1, 'bersih!', 12, 845, 1150, 330, 8),
        (2, 'Enteng', 29, 835, 790, 300, 7),
        (4, 'di-kick,', 9, 235, 1120, 320, -8),
        (5, 'hati.', 8, 840, 1180, 310, 8),
        (6, 'galau,', 30, 845, 820, 290, 8),
        (7, 'Hihihi...', 23, 855, 800, 300, 9),
        (9, 'follow,', 15, 240, 1000, 300, -8)]

# ---------- layar hook ----------
SPAM = ['PROMO GRATIS ONGKIR!!!', 'P', 'klik link ini ya kak', 'join grup sebelah dong', 'P', 'follow ig aku kak',
        'halo kak salken', 'cek bio yaa', 'P', 'kak minta nomor', 'siapa yg mau kaya??', 'P', 'forward ke 10 grup!!',
        'yang baca ini wajib share', 'P', 'halooo', 'kenalan dong', 'P']
NAMA = ['+62 812-xxxx', 'Akun Baru', 'User8472910', 'Tamu 0192', 'xX_b0t_Xx', '+62 857-xxxx', 'Akun Tanpa Nama']
WARNA = [(233, 120, 90), (110, 150, 230), (200, 110, 190), (240, 180, 70), (90, 190, 170), (241, 92, 109)]

def bubble_spam(d, i, y, alpha=1.0, sc=1.0):
    rnd = random.Random(i)
    txt = SPAM[i % len(SPAM)]; nm = NAMA[i % len(NAMA)]
    f = font(F_SEMI, 32); tw = max(f.getlength(txt), font(F_SEMI, 24).getlength(nm)) + 60
    x = 40 + rnd.random() * 40
    w = tw * sc; h = 118 * sc
    fill = mix(BG, (32, 44, 51), alpha)
    d.rounded_rectangle([x, y, x + w, y + h], 26 * sc, fill=fill)
    if sc > .6:
        teks(d, (x + 26, y + 18), nm, font(F_SEMI, 24), mix(BG, WARNA[i % len(WARNA)], alpha))
        teks(d, (x + 26, y + 56), txt, f, mix(BG, TEKS, alpha))

def layar_kacau(im, d, t, D):
    t_stop = R2.w('Stop,'); t_ini = R2.w('Ini')
    beku = t_stop <= t < t_ini
    te = t if t < t_stop else (t_stop if beku else t - (t_ini - t_stop))
    header_wa(d, 'Komunitas Kita', f'{1024 + int(te * 23)} anggota', (52, 72, 82), lambda d, x, y, s: ikon_perisai(d, x, y, s, TEKS, False))
    d.rectangle([0, 230, LW, LH], fill=(11, 20, 26))
    # chat banjir spam, makin cepet
    n = int(te * 9) + 12
    tinggi = 136
    for k in range(10):
        i = n - k
        if i < 0: break
        frac = (te * 9) % 1
        y = LH - 190 - k * tinggi - (1 - e_out(min(1, frac * 2))) * (-tinggi if k == 0 else 0)
        if y < 230: break
        sc = e_back(min(1, frac * 2.5), 2) if k == 0 else 1
        bubble_spam(d, i, y + (1 - sc) * 60, 1, sc)
    # banner notif merah
    cnt = 12 + int(te * 17)
    d.rounded_rectangle([30, 250, LW - 30, 350], 30, fill=(120, 30, 40))
    teks(d, (70, 300), f'{cnt} permintaan bergabung', font(F_BLACK, 32), (255, 255, 255), 'lm')
    d.ellipse([LW - 150, 270, LW - 60, 330], fill=MERAH); teks(d, (LW - 105, 300), '99+', font(F_BLACK, 26), (255, 255, 255), 'mm')
    # kedip merah
    if not beku and (te * 4) % 1 < .5:
        d.rectangle([0, 230, LW, 244], fill=MERAH)
    d.rounded_rectangle([30, LH - 60 - 70, LW - 30, LH - 40], 40, fill=(31, 44, 52))
    teks(d, (80, LH - 88), 'Ketik pesan', font(F_REG, 30), TEKS2, 'lm')
    if beku:
        # layar freeze: gelapin dikit + garis "pause"
        ov = Image.new('RGBA', (LW, LH), (0, 0, 0, 110)); im.alpha_composite(ov)
        d2 = ImageDraw.Draw(im)
        d2.rectangle([LW / 2 - 60, 900, LW / 2 - 20, 1040], fill=(255, 255, 255))
        d2.rectangle([LW / 2 + 20, 900, LW / 2 + 60, 1040], fill=(255, 255, 255))

def layar_bersih(im, d, t, D):
    t_bersih = R2.w('bersih!')
    header_wa(d, 'Komunitas Kita', 'dijaga WA Release Bot', HIJAU, lambda d, x, y, s: ikon_perisai(d, x, y, s, (255, 255, 255), True, HIJAU))
    d.rectangle([0, 230, LW, LH], fill=(11, 20, 26))
    # spam dihapus satu-satu (poof) sebelum "bersih!"
    if t < t_bersih + .5:
        for k in range(8):
            y = LH - 190 - k * 136
            t0 = .15 + k * (max(.3, t_bersih - .2) / 8)
            u = prog(t, t0, .22)
            if u >= 1:
                continue
            sc = 1 - e_io(u)
            if sc > .05: bubble_spam(d, 40 - k, y + (1 - sc) * 50, 1, sc)
            if u > 0:
                for p in range(6):
                    a = p / 6 * 2 * math.pi; r = 40 + u * 120
                    d.ellipse([200 + math.cos(a) * r - 8, y + 60 + math.sin(a) * r - 8, 200 + math.cos(a) * r + 8, y + 60 + math.sin(a) * r + 8], fill=mix(BG, HIJAU_T, 1 - u))
    u = e_back(prog(t, t_bersih - .1, .5), 1.8)
    if u > 0:
        cx, cy = LW / 2, 720
        denyut(d, cx, cy, 150 * u, t, HIJAU_T, 1.0, 2, 8)
        d.ellipse([cx - 150 * u, cy - 150 * u, cx + 150 * u, cy + 150 * u], fill=HIJAU)
        ikon_perisai(d, cx, cy, 86 * u, (255, 255, 255), True, HIJAU)
        if u > .6:
            teks(d, (cx, 960), 'Grup bersih!', font(F_BLACK, 60), TEKS, 'mm')
            teks(d, (cx, 1030), f'{min(47, int((t - t_bersih) * 60))} akun aneh ditolak otomatis', font(F_SEMI, 32), HIJAU_T, 'mm')
        # pesan bot
        v = e_out(prog(t, t_bersih + .4, .4))
        if v > 0:
            y = 1150 + (1 - v) * 60
            d.rounded_rectangle([60, y, LW - 60, y + 190], 30, fill=HIJAU_TUA)
            teks(d, (96, y + 30), 'WA Release Bot', font(F_SEMI, 26), HIJAU_T)
            teks(d, (96, y + 76), 'Bot penjaga grup aktif.', font(F_SEMI, 34), TEKS)
            teks(d, (96, y + 124), 'Baca aturan dulu ya, kak!', font(F_REG, 30), TEKS)
        # kilau
        for k in range(10):
            rnd = random.Random(k)
            a = ((t - t_bersih) * .9 + rnd.random()) % 1
            x = 100 + rnd.random() * (LW - 200); y = 420 + rnd.random() * 700 - a * 80
            r = 14 * math.sin(a * math.pi)
            d.polygon([(x, y - r * 2), (x + r * .5, y - r * .5), (x + r * 2, y), (x + r * .5, y + r * .5), (x, y + r * 2), (x - r * .5, y + r * .5), (x - r * 2, y), (x - r * .5, y - r * .5)], fill=(255, 255, 255))

LAYAR = [layar_kacau, layar_bersih] + R2.LAYAR[1:]

# ---------- stiker meme ----------
_meme = {}
def meme_img(no, ukuran):
    k = (no, ukuran)
    if k in _meme: return _meme[k]
    src = Image.open(os.path.join(ROOT, 'stiker', f's{no}.webp')).convert('RGBA')
    src.thumbnail((ukuran, ukuran), Image.LANCZOS)
    # sudut membulat + border putih + bayangan
    m = Image.new('L', src.size, 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, src.width - 1, src.height - 1], 26, fill=255)
    a = Image.fromarray(np.minimum(np.array(src.getchannel('A')), np.array(m)))
    src.putalpha(a)
    pad = 26
    out = Image.new('RGBA', (src.width + pad * 2, src.height + pad * 2), (0, 0, 0, 0))
    big = Image.new('L', out.size, 0); big.paste(a, (pad, pad)); border = big.filter(ImageFilter.MaxFilter(21))
    sh = border.filter(ImageFilter.GaussianBlur(10)).point(lambda v: int(v * .55))
    out.paste((0, 0, 0, 255), (6, 10), sh.crop((0, 0, out.width - 6, out.height - 10)))
    out.paste((255, 255, 255, 255), (0, 0), border)
    out.alpha_composite(src, (pad, pad))
    _meme[k] = out
    return out

def gambar_meme(im, si, lt):
    for (ss, kata, no, x, y, uk, sd) in MEME:
        if ss != si: continue
        t0 = R2.wk(ss, kata, 'awal') - .05
        u = lt - t0
        if u < 0 or u > 2.0: continue
        masuk = e_back(clamp(u / .32), 2.6)
        keluar = clamp((2.0 - u) / .22)
        sc = masuk * (.6 + .4 * keluar) if keluar < 1 else masuk
        al = keluar
        if sc < .03: continue
        img = meme_img(no, uk)
        wob = math.sin(u * 10) * 4 * math.exp(-u * 1.5)
        img2 = img.resize((max(1, int(img.width * sc)), max(1, int(img.height * sc))), Image.BILINEAR).rotate(sd + wob, resample=Image.BICUBIC, expand=True)
        if al < 1: img2.putalpha(img2.getchannel('A').point(lambda v: int(v * al)))
        im.alpha_composite(img2, (int(x - img2.width / 2), int(y - img2.height / 2)))

# ---------- subtitle gaya baru ----------
def potong(kata):
    pot = []; cur = []
    for k in kata:
        cur.append(k)
        if k[0][-1] in '.,?!' or len(cur) >= 3 or len(' '.join(x[0] for x in cur)) >= 16:
            pot.append(cur); cur = []
    if cur: pot.append(cur)
    return pot

_merah = []
def kedip_merah(im, t, si):
    s = SCENES[si]
    if si != 0: return
    lt = t - s['mulai']
    t_stop = R2.wk(0, 'Stop,'); t_ini = R2.wk(0, 'Ini')
    if t_stop <= lt < t_ini: return
    if not _merah:
        g = Image.new('L', (W, H), 255); ImageDraw.Draw(g).rounded_rectangle([40, 40, W - 40, H - 40], 160, fill=0)
        g = g.filter(ImageFilter.GaussianBlur(70))
        m = Image.new('RGBA', (W, H), (241, 40, 60, 0)); m.putalpha(g); _merah.append(m)
    a = (.25 + .30 * abs(math.sin(lt * 7))) * .8
    m = _merah[0].copy(); m.putalpha(_merah[0].getchannel('A').point(lambda v: int(v * a)))
    im.alpha_composite(m)

def subtitle(im, t, si):
    s = SCENES[si]
    kedip_merah(im, t, si)
    gambar_meme(im, si, t - s['mulai'])
    if 'pot' not in s: s['pot'] = potong(s['kata'])
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

# ---------- sambungin ke render2 ----------
def bangun_timeline():
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

def pasang():
    R2.SCENES = SCENES; R2.LAYAR = LAYAR; R2.SFX = SFX; R2.STIKER = STIKER; R2.ZOOM = ZOOM
    R2.bangun_timeline = bangun_timeline
    R.chip_seri = lambda im, t: None
    R.subtitle = subtitle
    R.SCENES = SCENES
    # judul naik dikit karena chip episode dihapus
    asli = R2.frame
    return asli

if __name__ == '__main__':
    pasang()
    # siapin suara hook (jeda dirapetin) kalau belum
    if not os.path.exists(os.path.join(ROOT, 'wav2t', '00b.wav')):
        import imageio_ffmpeg
        FF = imageio_ffmpeg.get_ffmpeg_exe()
        for v in ('00a', '00b'):
            subprocess.run([FF, '-v', 'error', '-y', '-i', os.path.join(ROOT, 'vo2', v + '.mp3'), '-ac', '1', '-ar', '44100', os.path.join(ROOT, 'wav2', v + '.wav')], check=True)
        simpan = R2.SCENES; R2.SCENES = HOOK; R2.siapkan_vo(); R2.SCENES = SCENES
    total = bangun_timeline(); nf = int(total * R.FPS)
    if '--kata' in sys.argv:
        for i, s in enumerate(SCENES[:2]): print(i, [(k, round(a - s['mulai'], 2)) for k, a, b in s['kata']])
        print('total', total); sys.exit()
    if '--cek' in sys.argv:
        R.ST = R.buat_statis()
        for i, v in enumerate(sys.argv[sys.argv.index('--cek') + 1:]): R2.frame(float(v), total).save(os.path.join(ROOT, f'cek_{i}.png'))
        sys.exit()
    if '--bagian' in sys.argv:
        i = sys.argv.index('--bagian'); R2.render_bagian(int(sys.argv[i + 1]), int(sys.argv[i + 2]), total, sys.argv[i + 3]); sys.exit()
    tmp = os.path.join(ROOT, 'tmp'); os.makedirs(tmp, exist_ok=True)
    print('durasi', round(total, 2), 'detik,', nf, 'frame')
    R2.buat_audio(total, os.path.join(tmp, 'audio_musik.wav'), os.path.join(tmp, 'audio_vo.wav'))
    tengah = nf // 2
    ps = [subprocess.Popen([sys.executable, __file__, '--bagian', str(a), str(b), os.path.join(tmp, f'b{k}.mp4')]) for k, (a, b) in enumerate([(0, tengah), (tengah, nf)])]
    for p in ps: p.wait()
    with open(os.path.join(tmp, 'daftar.txt'), 'w') as f: f.write("file 'b0.mp4'\nfile 'b1.mp4'\n")
    subprocess.run([R.ffmpeg(), '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', os.path.join(tmp, 'daftar.txt'), '-c', 'copy', os.path.join(tmp, 'video.mp4')], check=True)
    for nama, au in [('tiktok-v3-wa-release-bot.mp4', 'audio_musik.wav'), ('tiktok-v3-tanpa-musik.mp4', 'audio_vo.wav')]:
        subprocess.run([R.ffmpeg(), '-v', 'error', '-y', '-i', os.path.join(tmp, 'video.mp4'), '-i', os.path.join(tmp, au), '-c:v', 'copy',
                        '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-shortest', '-movflags', '+faststart', os.path.join(ROOT, nama)], check=True)
    print('selesai')
