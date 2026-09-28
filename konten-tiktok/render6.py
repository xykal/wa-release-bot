#!/usr/bin/env python3
"""Versi 6 — v5 + perbaikan:
- render LANGSUNG 720p60 satu pass (tanpa file 1080 perantara)
- cue SFX/stiker/meme di-stagger (offset per cue, tidak ada tabrakan)
- stiker meme TANPA border putih (bayangan saja)
- scene Kall di-redesign (gaya WA, layar penuh, nyatu dgn scene utama)
- mockup HP digedein 1.08x + judul dinaikin
Pakai: python3 render6.py  |  python3 render6.py --cek 130 145"""
import math, os, random, sys, subprocess
from PIL import Image, ImageDraw, ImageFilter
import render as R
import render2 as R2
import render3 as R3
import render4 as R4
import render5 as R5
from render import (W, H, font, F_BLACK, F_SEMI, F_REG, BG, KARTU, KARTU2, GARIS, HIJAU, HIJAU_T, HIJAU_TUA,
                    TEKS, TEKS2, MERAH, clamp, e_out, e_io, e_back, prog, mix, teks, status_bar, header_wa,
                    header_app, ikon_perisai, ikon_cek, ikon_x, denyut, gambar_bulan, jari, LW, LH, PX, PY,
                    PW, PH, BZ, SW, SH)

ROOT = os.path.dirname(os.path.abspath(__file__))
w = R2.w
SCENES6 = R5.SCENES5
# layering pro: tawa manusia asli (bukan 'hihi' TTS) pas punchline 'wok?'
SFX6 = []
for _c in R5.SFX5:
    if _c[0] == R5.I5('16') and _c[1] == 'wok?':
        SFX6.append((R5.I5('16'), 'wok?', 'cute-girl-laughing-sound-effect', .5, .1, 'akhir', 2.0))
    else:
        SFX6.append(_c)
ZOOM6 = R5.ZOOM5

# ---------- stagger stiker (detik, +telat/-maju) + GOKIL pindah ke 'kan?' ----------
_SD = {'STOP!': .20, 'ENTENG!': -.25, 'BUKAN TERMUX!': .30, 'TETEP NYALA': -.25,
       'NYAMBUNG!': -.25, 'DADAH~': .30, 'AUTO DIHAPUS': .30, 'WKWKWK': -.25,
       'CAKEP!': -.25, 'APP AMAN': -.25, 'GOKIL SIH': .15}
STIKER6 = []
for _si, _ka, _tx, _c, _x, _y, _sd in R5.STIKER5:
    if _tx == 'GOKIL SIH':
        _ka = 'kan?'
    STIKER6.append((_si, _ka, _tx, _c, _x, _y, _SD.get(_tx, 0)))

# ---------- stagger meme (7th field = offset detik) ----------
_MO = {('00a', 'grup'): .40, ('00b', 'bersih!'): -.45, ('02', 'Enteng'): -.30,
       ('10', 'Termux?'): -.30, ('12', 'otomatis'): -.30, ('04', 'ditolak.'): -.30,
       ('06', 'galau,'): -.30, ('07', 'Hihihi...'): .40, ('16', 'begadang'): -.30,
       ('15', 'Join'): -.30, ('15', 'follow'): -.30}
R4.MEME[:] = [tuple(m) + (_MO.get((m[0], m[1]), 0),) for m in R4.MEME]

# ---------- meme TANPA border putih ----------
_meme6 = {}
def meme_img6(no, ukuran):
    k = (no, ukuran)
    if k in _meme6:
        return _meme6[k]
    src = Image.open(os.path.join(ROOT, 'stiker', f's{no}.webp')).convert('RGBA')
    src.thumbnail((ukuran, ukuran), Image.LANCZOS)
    pad = 18
    out = Image.new('RGBA', (src.width + pad * 2, src.height + pad * 2), (0, 0, 0, 0))
    big = Image.new('L', out.size, 0); big.paste(src.getchannel('A'), (pad, pad))
    border = big.filter(ImageFilter.MaxFilter(15))
    sh = border.filter(ImageFilter.GaussianBlur(9)).point(lambda v: int(v * .65))
    out.paste((0, 0, 0, 255), (6, 9), sh.crop((0, 0, out.width - 6, out.height - 9)))
    out.alpha_composite(src, (pad, pad))
    _meme6[k] = out
    return out

def gambar_meme6(im, si, lt):
    for m in R4.MEME:
        vo, kata, no, x, y, uk = m[:6]
        off = m[6] if len(m) > 6 else 0
        if R4.I(vo) != si:
            continue
        t0 = R2.wk(si, kata, 'awal') - .05 + off
        u = lt - t0
        if u < 0 or u > 2.0:
            continue
        masuk = e_back(clamp(u / .32), 2.6)
        keluar = clamp((2.0 - u) / .22)
        sc = masuk * (.6 + .4 * keluar) if keluar < 1 else masuk
        al = keluar
        if sc < .03:
            continue
        img = meme_img6(no, uk)
        img2 = img.resize((max(1, int(img.width * sc)), max(1, int(img.height * sc))), Image.BILINEAR)
        if al < 1:
            img2.putalpha(img2.getchannel('A').point(lambda v: int(v * al)))
        im.alpha_composite(img2, (int(x - img2.width / 2), int(y - img2.height / 2)))

# ---------- scene Kall v6: gaya WA, penuh, nyatu ----------
def layar_kall6(im, d, t, D):
    t_komen, t_wok, t_kenal, t_ini, t_ajak = (w('komen'), w('wok?'), w('kenalin.'), w('ini.'), w('komen!'))
    header_app(d, 'Kenalin, si Kall')
    # komentar 1 (masuk)
    u = e_out(prog(t, t_komen - .3, .4))
    if u > 0:
        yy = 300 + (1 - u) * 60
        d.rounded_rectangle([60, yy, LW - 60, yy + 130], 32, fill=KARTU2)
        d.ellipse([90, yy + 30, 160, yy + 100], fill=(233, 120, 90))
        teks(d, (190, yy + 28), '@bocah_ngopi', font(F_SEMI, 26), (147, 197, 253))
        teks(d, (190, yy + 66), 'sikall ngapain wok', font(F_REG, 31), TEKS)
    # komentar 2 (masuk)
    u = e_out(prog(t, t_wok - .1, .4))
    if u > 0:
        yy = 450 + (1 - u) * 60
        d.rounded_rectangle([60, yy, LW - 60, yy + 130], 32, fill=KARTU2)
        d.ellipse([90, yy + 30, 160, yy + 100], fill=(110, 150, 230))
        teks(d, (190, yy + 28), '@cihuyyy', font(F_SEMI, 26), (147, 197, 253))
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
            d.ellipse([110, yy + 378, 134, yy + 402], fill=HIJAU_T)
            teks(d, (150, yy + 376), 'online — lagi ngoding', font(F_SEMI, 27), HIJAU_T)
    # balasan Kall (keluar, kanan, ijo)
    u = e_out(prog(t, t_ini - .1, .4))
    if u > 0:
        yy = 1060 + (1 - u) * 60
        d.rounded_rectangle([220, yy, LW - 60, yy + 120], 32, fill=HIJAU_TUA)
        teks(d, (LW - 100, yy + 24), 'sikall', font(F_SEMI, 26), HIJAU_T, 'rm')
        teks(d, (LW - 100, yy + 60), 'gas, lagi dibikin!', font(F_REG, 31), TEKS, 'rm')
    # ajakan bawah
    g = prog(t, t_ajak - .2, .35)
    if g > 0:
        d.rounded_rectangle([60, 1330, LW - 60, 1440], 55, fill=mix(KARTU, HIJAU_TUA, g))
        if g > .6:
            teks(d, (LW / 2, 1385), 'sapa dia di komen!', font(F_SEMI, 33), HIJAU_T, 'mm')

LAYAR6 = list(R5.LAYAR5)
LAYAR6[R5.I5('16')] = layar_kall6
assert len(LAYAR6) == len(SCENES6) == 16

# ---------- frame v6: HP 1.08x + judul naik + offset stiker ----------
JUDUL_Y = 150
HP_SKALA = 1.08
HP_CX, HP_CY = 540, 940

def frame6(t, total):
    si = 0
    for i, s in enumerate(SCENES6):
        if t >= s['mulai']:
            si = i
    s = SCENES6[si]; lt = t - s['mulai']; R2.CUR[0] = si; R.SCENES = SCENES6
    im = R.ST['bg'].copy().convert('RGBA'); d = ImageDraw.Draw(im)
    for k in range(14):
        rnd = random.Random(k)
        x = rnd.random() * W + math.sin(t * .6 + k) * 30
        y = (rnd.random() * H - t * (18 + rnd.random() * 30)) % H
        r = 2 + rnd.random() * 4
        d.ellipse([x - r, y - r, x + r, y + r], fill=(30, 90, 70))
    lay = Image.new('RGBA', (LW, LH), BG + (255,)); ld = ImageDraw.Draw(lay)
    LAYAR6[si](lay, ld, lt, s['dur'])
    lay = lay.resize((SW, SH), Image.LANCZOS)
    u = e_out(prog(lt, 0, .35)) if si > 0 else 1
    dy = int((1 - u) * 70)
    fy = int(math.sin(t * 1.4) * 6)
    hp = R.ST['hp'].copy()
    kanvas = Image.new('RGBA', (SW, SH), BG + (255,)); kanvas.alpha_composite(lay, (0, dy))
    hp.paste(kanvas, (20 + BZ, 20 + BZ), R.ST['mask_layar'])
    if si > 0 and lt < .18:
        fl = Image.new('RGBA', (SW, SH), (255, 255, 255, int(120 * (1 - lt / .18))))
        area = hp.crop((20 + BZ, 20 + BZ, 20 + BZ + SW, 20 + BZ + SH))
        hp.paste(Image.alpha_composite(area, fl), (20 + BZ, 20 + BZ), R.ST['mask_layar'])
    miring = 0
    if LAYAR6[si] is R2.layar_telpon:
        t_mir = R2.wk(si, 'miring.')
        miring = 9 * e_back(prog(lt, t_mir, .45), 2.2) * (1 - e_io(prog(lt, s['dur'] - .5, .45)))
    if LAYAR6[si] is R2.layar_telpon and lt < R2.wk(si, 'ternyata'):
        miring = math.sin(lt * 45) * 1.2 * (1 if (lt % .8) < .5 else 0)
    if abs(miring) > .01:
        hp = hp.rotate(miring, resample=Image.BICUBIC, expand=True)
    hp = hp.resize((int(hp.width * HP_SKALA), int(hp.height * HP_SKALA)), Image.LANCZOS)
    im.alpha_composite(hp, (int(HP_CX - hp.width / 2), int(HP_CY - hp.height / 2 + fy)))
    if LAYAR6[si] is R2.layar_splash:
        R.pil_samping(im, lt, 'Tanpa server', 70, 1010, R2.wk(si, 'server,') - .05, True)
        R.pil_samping(im, lt, 'Tanpa laptop', W - 70, 1150, R2.wk(si, 'laptop.') - .05, False)
    if si == len(SCENES6) - 1:
        R.tombol_follow(im, lt, R2.wk(si, 'follow') - .1)
    R.chip_seri(im, t)
    im.alpha_composite(R.judul_frame(si, lt), (0, JUDUL_Y))
    for (ss, kata, tx, c, x, y, sd) in STIKER6:
        if ss == si:
            R4.stiker4(im, lt, tx, c, x, y,
                       R2.wk(ss, kata, 'akhir' if kata.endswith(('?', '!', '.')) else 'awal') + sd)
    R.subtitle(im, t, si)
    if si == len(SCENES6) - 1:
        R.outro(im, t, s['mulai'] + s['dur'] - R.OUTRO)
    for (ss, kata, jenis, geser) in ZOOM6:
        if ss != si:
            continue
        z = lt - (R2.wk(ss, kata, jenis) + geser)
        if 0 <= z < .35:
            f = 1 + .07 * (1 - z / .35) ** 2
            cw, ch = int(W / f), int(H / f)
            ox = (W - cw) // 2 + int(math.sin(z * 90) * 6 * (1 - z / .35)); oy = (H - ch) // 2
            im = im.crop((ox, oy, ox + cw, oy + ch)).resize((W, H), Image.BILINEAR)
    return im.convert('RGB')

# ---------- render langsung 720p60 (satu pass, tanpa 1080 perantara) ----------
def render_bagian6(a, b, total, out):
    R.ST = R.buat_statis(); R.SCENES = SCENES6
    p = subprocess.Popen([R.ffmpeg(), '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24',
                          '-s', '720x1280', '-r', str(R4.FPS), '-i', '-', '-c:v', 'libx264',
                          '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', out], stdin=subprocess.PIPE)
    for f in range(a, b):
        p.stdin.write(frame6(f / R4.FPS, total).resize((720, 1280), Image.LANCZOS).tobytes())
    p.stdin.close(); p.wait()

def pasang6():
    R5.pasang5()
    R2.SFX = SFX6
    R4.LAYAR4 = LAYAR6
    R2.LAYAR = LAYAR6
    R4.STIKER4 = STIKER6
    R2.STIKER = STIKER6
    R4.gambar_meme4 = gambar_meme6

def audit_tabrakan(batas=0.22):
    """Cek cue se-scene yang gap-nya < batas (kecuali kombo zoom+SFX). Return list."""
    def T(si, kata, jenis='awal', g=0.0):
        return SCENES6[si]['mulai'] + R2.wk(si, kata, jenis) + g
    cues = []
    for si, kata, nama, g, geser, jenis, *rest in SFX6:
        cues.append((T(si, kata, jenis, geser), SCENES6[si]['vo'], f'SFX {nama}'))
    for si, kata, tx, c, x, y, sd in STIKER6:
        j = 'akhir' if kata.endswith(('?', '!', '.')) else 'awal'
        cues.append((T(si, kata, j, sd), SCENES6[si]['vo'], f'STIKER {tx}'))
    for m in R4.MEME:
        vo, kata = m[0], m[1]
        off = m[6] if len(m) > 6 else 0
        cues.append((T(R5.I5(vo), kata, 'awal', -.05 + off), vo, f'MEME s{m[2]}'))
    for si, kata, j, gs in ZOOM6:
        cues.append((T(si, kata, j, gs), SCENES6[si]['vo'], 'ZOOM'))
    cues.sort()
    jelek = []
    for a, b in zip(cues, cues[1:]):
        if a[1] != b[1] or b[0] - a[0] >= batas:
            continue
        pair = sorted([a[2].split()[0], b[2].split()[0]])
        if pair == ['SFX', 'ZOOM']:
            continue  # kombo punch-in + boom memang disengaja
        if pair == ['SFX', 'SFX']:
            continue  # layering audio beda kata memang disengaja
        jelek.append((a, b))
    return jelek

if __name__ == '__main__':
    pasang6()
    hilang = [v for v in R5.URUT5 if not (os.path.exists(os.path.join(ROOT, 'wav2t', v + '.wav')) and
                                          os.path.exists(os.path.join(ROOT, 'wav2t', v + '.json')))]
    if hilang:
        print('TIMING HILANG:', hilang); sys.exit(2)
    total = R4.bangun_timeline4()
    for si, kata, *_ in SFX6 + STIKER6 + ZOOM6:
        assert any(kata.lower() in k[0].lower() for k in SCENES6[si]['kata']), (si, kata)
    for m in R4.MEME:
        assert any(m[1].lower() in k[0].lower() for k in SCENES6[R5.I5(m[0])]['kata']), (m[0], m[1])
    jelek = audit_tabrakan()
    assert not jelek, jelek
    print(f'audit cue bersih ({len(SCENES6)} scene)')
    nf = int(total * R4.FPS)
    if '--kata' in sys.argv:
        for i, s in enumerate(SCENES6):
            print(i, s['vo'], round(s['mulai'], 2), [(k, round(a - s['mulai'], 2)) for k, a, b in s['kata']][:4])
        print('total', round(total, 2), 'detik,', nf, 'frame'); sys.exit()
    if '--cek' in sys.argv:
        R.ST = R.buat_statis()
        for i, v in enumerate(sys.argv[sys.argv.index('--cek') + 1:]):
            frame6(float(v), total).save(os.path.join(ROOT, f'cek6_{i}.png'))
        sys.exit()
    if '--bagian' in sys.argv:
        i = sys.argv.index('--bagian')
        render_bagian6(int(sys.argv[i + 1]), int(sys.argv[i + 2]), total, sys.argv[i + 3]); sys.exit()
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
    for nama, au in [('tiktok-v6-wa-release-bot.mp4', 'audio_musik.wav'),
                     ('tiktok-v6-tanpa-musik.mp4', 'audio_vo.wav')]:
        subprocess.run([R.ffmpeg(), '-v', 'error', '-y', '-i', os.path.join(tmp, 'video.mp4'), '-i',
                        os.path.join(tmp, au), '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
                        '-ar', '44100', '-shortest', '-movflags', '+faststart',
                        os.path.join(ROOT, nama)], check=True)
    print('selesai')
