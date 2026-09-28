#!/usr/bin/env python3
"""Versi 2 konten TikTok WA Release Bot: suara cewek lembut + gaul, SFX meme (myinstants),
stiker, zoom "vine boom", dan scene pantun "gaya miring" (HP-nya ikut miring).

Pakai:  python3 render2.py              render penuh
        python3 render2.py --cek 3 20.5  simpan frame cek
Pakai ulang gambar-gambar layar dari render.py (template sama)."""
import math, os, sys, wave, subprocess, random, re
import numpy as np
from PIL import Image, ImageDraw
import render as R
from render import (W, H, FPS, font, F_BLACK, F_SEMI, F_REG, BG, KARTU, KARTU2, GARIS, HIJAU, HIJAU_T, HIJAU_TUA,
                    TEKS, TEKS2, MERAH, clamp, e_out, e_io, e_back, prog, mix, teks, status_bar, header_wa, header_app,
                    ikon_not, ikon_hati, ikon_cek, ikon_x, denyut, bungkus, jari, gambar_bulan, ikon_perisai, LW, LH,
                    PX, PY, PW, PH, BZ, SW, SH)

ROOT = os.path.dirname(os.path.abspath(__file__))
TEMPO = 1.05

SCENES = [
    dict(vo='01', judul='Grup WA kemasukan *akun nggak jelas?*',
         teks='Eh, grup WA kamu suka kemasukan akun nggak jelas nggak sih? Tenang, aku bikinin bot yang jagain grup kamu. Otomatis!'),
    dict(vo='02', judul='Bot WA *langsung dari HP*',
         teks='Namanya WA Release Bot. Jalannya langsung dari HP Android. Nggak pake server, nggak pake laptop. Enteng banget, kan?'),
    dict(vo='03', judul='Nyambung pakai *kode pairing*',
         teks='Nyambunginnya gampang pol. Masukin nomor, dapet kode pairing, tempel di WhatsApp. Udah, nyambung deh.'),
    dict(vo='04', judul='Yang pernah keluar? *Auto tolak!*',
         teks='Nah, yang mau gabung ke grup dicek berkala. Yang dulu kabur, atau pernah di-kick, auto ditolak. Dadah! Grup kamu aman, nggak perlu dijagain terus.'),
    dict(vo='05', judul='Channel *nggak sepi* lagi',
         teks='Terus, channel kamu juga nggak bakal sepi. Tiap hari bot ngirim potongan lagu, lengkap sama caption yang pas di hati.'),
    dict(vo='06', judul='Caption-nya *macem-macem*',
         teks='Captionnya macem-macem. Ada yang galau, ada ayat yang adem, ada juga pantun gaul kayak gini.'),
    dict(vo='07', judul='Pantun hari ini: *gaya miring*',
         teks='Ditelpon berdering... ternyata, lagi gaya miring. Hihihi... aduh, maaf, maaf, nggak tahan.'),
    dict(vo='08', judul='Ringan & *hemat baterai*',
         teks='Baterai aman, ada perekam log kalo ada error, tampilannya gelap ijo kayak WhatsApp. Cakep!'),
    dict(vo='09', judul='Fitur apa lagi? *Tulis di komen*',
         teks='Menurut kamu, fitur apa lagi yang wajib aku tambahin? Tulis di komen, ya! Jangan lupa follow, biar nggak ketinggalan episode berikutnya.'),
]

# (scene, potongan kata, file sfx, gain, geser detik, jenis: 'awal'/'akhir' kata)
SFX = [
    (0, 'sih?', 'vine-boom', .55, .05, 'akhir'),
    (0, 'Otomatis!', 'family-feud-good-answer', .35, 0, 'akhir'),
    (1, 'server,', 'pop_7e9Is8L', .5, 0, 'awal'),
    (1, 'laptop.', 'pop_7e9Is8L', .5, 0, 'awal'),
    (1, 'kan?', 'rizz-sound-effect', .40, .05, 'akhir'),
    (2, 'deh.', 'family-feud-good-answer', .40, 0, 'akhir'),
    (3, 'ditolak.', 'cartoon-bonk', .5, 0, 'awal'),
    (3, 'Dadah!', 'tuturu_1', .40, 0, 'akhir'),
    (4, 'nggak', 'awkward-cricket-sound-effect', .35, -1.3, 'awal', 1.25),
    (4, 'hati.', 'ding-sound-effect_2', .25, 0, 'akhir', 1.4),
    (5, 'galau,', 'sad-violin', .30, 0, 'awal', 1.6),
    (5, 'adem,', 'ding-sound-effect_2', .22, 0, 'akhir', 1.2),
    (6, 'Ditelpon', 'nokia-ringtone-1994', .13, -.1, 'awal', 2.2),
    (6, 'miring.', 'rimshot', .55, .02, 'akhir'),
    (6, 'Hihihi...', 'cute-girl-laughing-sound-effect', .30, .1, 'awal'),
    (7, 'Cakep!', 'anime-wow-sound-effect', .40, .05, 'akhir', 1.6),
    (8, 'follow,', 'kids-saying-yay-sound-effect_3', .22, 0, 'awal', 1.5),
]
ZOOM = [(0, 'sih?', 'akhir', .05)]   # zoom tinju pas vine boom
STIKER = [  # scene, kata, teks, warna, x, y, sudut
    (0, 'sih?', 'SUS!', (255, 214, 0), 830, 700, 12),
    (1, 'kan?', 'ENTENG!', (37, 211, 102), 250, 760, -10),
    (2, 'deh.', 'NYAMBUNG!', (37, 211, 102), 820, 760, 9),
    (3, 'Dadah!', 'DADAH~', (241, 92, 109), 260, 720, -12),
    (6, 'miring.', 'WKWKWK', (255, 214, 0), 420, 620, -10),
    (6, 'Hihihi...', 'HIHIHI', (255, 140, 190), 830, 900, 12),
    (7, 'Cakep!', 'CAKEP!', (37, 211, 102), 820, 720, 10),
]

# ---------- siapkan suara: jeda dirapetin + dipercepat dikit ----------
def siapkan_vo():
    import imageio_ffmpeg
    FF = imageio_ffmpeg.get_ffmpeg_exe()
    os.makedirs(os.path.join(ROOT, 'wav2t'), exist_ok=True)
    for s in SCENES:
        a, sr = R.baca_wav(os.path.join(ROOT, 'wav2', s['vo'] + '.wav'))
        fr = sr // 100
        r = np.sqrt(np.convolve(a ** 2, np.ones(fr) / fr, 'same')[::fr])
        sil = r < 0.012
        maks = .45 if s['vo'] == '07' else .20
        keep = np.ones(len(a), bool)
        k = 0; n = len(sil)
        while k < n:
            if sil[k]:
                j = k
                while j < n and sil[j]: j += 1
                awal, akhir = k == 0, j >= n
                a0, a1 = k * fr, min(len(a), j * fr)
                if awal: keep[a0:max(a0, a1 - int(.06 * sr))] = False
                elif akhir: keep[a0 + int(.08 * sr):] = False
                elif (a1 - a0) > maks * sr:
                    h = int(maks / 2 * sr); keep[a0 + h:a1 - h] = False
                k = j
            else: k += 1
        b = a[keep]
        tmp = os.path.join(ROOT, 'wav2t', s['vo'] + '_r.wav')
        w = wave.open(tmp, 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes((np.clip(b, -1, 1) * 32767).astype(np.int16).tobytes()); w.close()
        subprocess.run([FF, '-v', 'error', '-y', '-i', tmp, '-af', f'atempo={TEMPO}', os.path.join(ROOT, 'wav2t', s['vo'] + '.wav')], check=True)
        os.remove(tmp)

_WH = None
def waktu_kata(a, sr, teks, vo=None):
    """Waktu tiap kata dari Whisper (word timestamps), dipasangin ke naskah pakai difflib.
    Hasil disimpen di wav2t/<vo>.json biar nggak transkrip ulang."""
    import json, difflib
    cache = os.path.join(ROOT, 'wav2t', f'{vo}.json')
    if os.path.exists(cache): wh = json.load(open(cache))
    else:
        global _WH
        from faster_whisper import WhisperModel
        if _WH is None: _WH = WhisperModel('base', device='cpu', compute_type='int8')
        segs, _ = _WH.transcribe(os.path.join(ROOT, 'wav2t', f'{vo}.wav'), language='id', word_timestamps=True, initial_prompt=teks)
        wh = [(w.word.strip(), w.start, w.end) for sg in segs for w in sg.words]
        json.dump(wh, open(cache, 'w'))
    norm = lambda x: re.sub(r'[^a-z0-9]', '', x.lower())
    kata = teks.split()
    A = [norm(k) for k in kata]; B = [norm(k[0]) for k in wh]
    t0 = [None] * len(kata); t1 = [None] * len(kata)
    for blk in difflib.SequenceMatcher(None, A, B, autojunk=False).get_opcodes():
        tag, i1, i2, j1, j2 = blk
        if tag == 'equal' or (tag == 'replace' and (i2 - i1) == (j2 - j1)):
            for k in range(i2 - i1): t0[i1 + k] = wh[j1 + k][1]; t1[i1 + k] = wh[j1 + k][2]
        elif tag == 'replace':
            s0, s1 = wh[j1][1], wh[j2 - 1][2]
            for k in range(i2 - i1):
                t0[i1 + k] = s0 + (s1 - s0) * k / (i2 - i1); t1[i1 + k] = s0 + (s1 - s0) * (k + 1) / (i2 - i1)
    # isi yang kosong pakai interpolasi tetangga
    for k in range(len(kata)):
        if t0[k] is None:
            prev = next((t1[m] for m in range(k - 1, -1, -1) if t1[m] is not None), 0)
            nxt = next((t0[m] for m in range(k + 1, len(kata)) if t0[m] is not None), len(a) / sr)
            t0[k] = prev; t1[k] = max(prev + .05, (prev + nxt) / 2 if nxt > prev else prev + .3)
    return [(kata[k], t0[k], t1[k]) for k in range(len(kata))]

def bangun_timeline():
    t = 0.0
    for s in SCENES:
        a, sr = R.baca_wav(os.path.join(ROOT, 'wav2t', s['vo'] + '.wav'))
        s['audio'] = a; s['sr'] = sr; s['dur_vo'] = len(a) / sr
        s['mulai'] = t; s['vo_mulai'] = t + R.JEDA_AWAL
        ekstra = .9 if s['vo'] == '07' else 0     # kasih napas abis ketawa
        s['dur'] = R.JEDA_AWAL + s['dur_vo'] + R.JEDA_AKHIR + ekstra
        s['kata'] = [(k, s['vo_mulai'] + a0, s['vo_mulai'] + a1) for k, a0, a1 in waktu_kata(a, sr, s['teks'], s['vo'])]
        t += s['dur']
    SCENES[-1]['dur'] += R.OUTRO
    return t + R.OUTRO

def wk(si, sub, jenis='awal', ke=0):
    """Waktu LOKAL (detik dari awal scene) kata yang mengandung `sub`."""
    s = SCENES[si]; hit = [k for k in s['kata'] if sub.lower() in k[0].lower()]
    if not hit: raise KeyError((si, sub))
    k = hit[min(ke, len(hit) - 1)]
    return (k[1] if jenis == 'awal' else k[2]) - s['mulai']

CUR = [0]
def w(sub, jenis='awal', ke=0): return wk(CUR[0], sub, jenis, ke)

# ---------- layar (versi 2, waktunya ngikut kata) ----------
def layar_1(im, d, t, D):
    header_wa(d, 'Komunitas Kita', 'Permintaan bergabung', (52, 72, 82), lambda d, x, y, s: ikon_perisai(d, x, y, s, TEKS, False))
    nama = [('User8472910', 'baru bikin akun'), ('+62 812-0000-xxxx', 'tanpa foto'), ('Akun Tanpa Nama', 'ingin bergabung'),
            ('Akun Baru 2026', 'baru bikin akun'), ('Tamu 0192', 'tanpa foto'), ('xX_b0t_Xx', 'ingin bergabung')]
    t_tolak = w('bot'); t_perisai = w('Tenang')
    for i, (n, s) in enumerate(nama):
        u = e_back(prog(t, i * 0.22, 0.4))
        if u <= 0: continue
        y = 270 + i * 188; x = (1 - u) * LW
        # getar dikit tanda "mencurigakan"
        x += math.sin(t * 40 + i) * 3 if t < t_tolak else 0
        tolak = prog(t, t_tolak + i * 0.14, 0.25)
        d.rounded_rectangle([40 + x, y, LW - 40 + x, y + 164], 34, fill=mix(KARTU2, (60, 28, 34), tolak * .6))
        d.ellipse([72 + x, y + 36, 164 + x, y + 128], fill=(70, 82, 90))
        teks(d, (118 + x, y + 82), '?', font(F_BLACK, 50), TEKS2, 'mm')
        d.ellipse([140 + x, y + 30, 172 + x, y + 62], fill=MERAH); teks(d, (156 + x, y + 46), '!', font(F_BLACK, 24), (255, 255, 255), 'mm')
        teks(d, (196 + x, y + 44), n, font(F_SEMI, 36), TEKS)
        teks(d, (196 + x, y + 96), s, font(F_REG, 27), MERAH if 'baru' in s else TEKS2)
        if tolak > 0:
            sc = e_back(tolak, 2.5); cx, cy = LW - 120 + x, y + 82
            d.rounded_rectangle([cx - 90 * sc, cy - 32 * sc, cx + 90 * sc, cy + 32 * sc], 32 * sc, fill=MERAH)
            if sc > .5: teks(d, (cx, cy), 'Ditolak', font(F_SEMI, int(28 * sc)), (255, 255, 255), 'mm')
    u = prog(t, t_perisai, 0.5)
    if u > 0:
        cx, cy = LW / 2, LH - 250; sc = e_back(u, 2.2)
        denyut(d, cx, cy, 110 * sc, t, HIJAU_T, 1.0, 2, 8)
        d.ellipse([cx - 110 * sc, cy - 110 * sc, cx + 110 * sc, cy + 110 * sc], fill=HIJAU)
        ikon_perisai(d, cx, cy, 62 * sc, (255, 255, 255), True, HIJAU)
        if u > .5:
            d.rounded_rectangle([cx - 190, cy + 128, cx + 190, cy + 196], 34, fill=HIJAU_TUA)
            teks(d, (cx, cy + 162), 'DIJAGA BOT', font(F_BLACK, 34), HIJAU_T, 'mm')

def layar_3(im, d, t, D):
    header_app(d)
    y = 280
    d.rounded_rectangle([40, y, LW - 40, y + 900], 40, fill=KARTU)
    t_nomor, t_tap, t_kode, t_tempel, t_ok = w('Masukin'), w('dapet'), w('pairing'), w('tempel'), w('nyambung', ke=1)
    tertaut = prog(t, t_ok, .35)
    teks(d, (84, y + 60), 'Tautkan WhatsApp', font(F_BLACK, 40), TEKS)
    teks(d, (84, y + 120), 'Masukkan nomor, lalu ketik kode', font(F_REG, 28), TEKS2)
    teks(d, (84, y + 158), 'di WA > Perangkat tertaut', font(F_REG, 28), TEKS2)
    nomor = '62 812 3456 7890'; n = int(clamp((t - t_nomor) / .7) * len(nomor))
    d.rounded_rectangle([84, y + 220, LW - 84, y + 320], 26, fill=KARTU2, outline=HIJAU if 0 < n < len(nomor) else None, width=3)
    teks(d, (120, y + 270), (nomor[:n] or 'Nomor WhatsApp') + ('|' if (t * 2) % 1 < .5 and n < len(nomor) else ''), font(F_SEMI, 36), TEKS if n else TEKS2, 'lm')
    tk = prog(t, t_tap, .2); bs = 1 - .06 * math.sin(math.pi * tk)
    bx0, bx1 = 84, LW - 84; cxb, cyb = (bx0 + bx1) / 2, y + 400
    d.rounded_rectangle([cxb - (bx1 - bx0) / 2 * bs, cyb - 50 * bs, cxb + (bx1 - bx0) / 2 * bs, cyb + 50 * bs], 50, fill=HIJAU)
    teks(d, (cxb, cyb), 'Minta kode pairing', font(F_SEMI, 34), (255, 255, 255), 'mm')
    kode = 'K7Q2-9XMA'; bw = 78; gap = 10; tot = 8 * bw + 7 * gap + 30; x0 = (LW - tot) / 2; j = 0
    for ch in kode:
        if ch == '-':
            teks(d, (x0 + 15, y + 570), '–', font(F_BLACK, 40), TEKS2, 'mm'); x0 += 30; continue
        u = e_back(prog(t, t_kode - .15 + j * .09, .3), 2)
        d.rounded_rectangle([x0, y + 510, x0 + bw, y + 630], 18, fill=mix(KARTU2, HIJAU_TUA, tertaut), outline=mix(GARIS, HIJAU_T, u) if u > 0 else GARIS, width=3)
        if u > 0: teks(d, (x0 + bw / 2, y + 570), ch, font(F_BLACK, int(46 * max(u, .01))), TEKS, 'mm')
        x0 += bw + gap; j += 1
    # tombol salin kode
    s = prog(t, t_tempel, .25)
    if s > 0 and tertaut <= 0:
        sc = e_back(s, 2)
        d.rounded_rectangle([LW / 2 - 130 * sc, y + 655, LW / 2 + 130 * sc, y + 715], 30, fill=KARTU2)
        if sc > .6: teks(d, (LW / 2, y + 685), 'Kode disalin ✓'.replace('✓', ''), font(F_SEMI, 28), HIJAU_T, 'mm')
    cy = y + 790
    if tertaut > 0:
        sc = e_back(tertaut, 2)
        denyut(d, LW / 2 - 150, cy, 44, t - t_ok, HIJAU_T, 1.0, 2, 5)
        d.ellipse([LW / 2 - 150 - 44 * sc, cy - 44 * sc, LW / 2 - 150 + 44 * sc, cy + 44 * sc], fill=HIJAU)
        ikon_cek(d, LW / 2 - 150, cy, 44, (255, 255, 255), prog(t, t_ok + .15, .35))
        teks(d, (LW / 2 - 84, cy), 'Tertaut!', font(F_BLACK, 44), HIJAU_T, 'lm')
    else:
        teks(d, (LW / 2, cy), 'Menunggu' + '.' * (int((t * 3) % 3) + 1), font(F_SEMI, 34), TEKS2, 'mm')
    jari(d, cxb + 150, cyb + 10, t_tap, t)

def layar_4(im, d, t, D):
    header_app(d)
    y = 250
    d.rounded_rectangle([40, y, LW - 40, y + 150], 36, fill=KARTU)
    cx, cy = 118, y + 75; sud = t * 3
    d.arc([cx - 34, cy - 34, cx + 34, cy + 34], math.degrees(sud), math.degrees(sud) + 290, fill=HIJAU_T, width=8)
    teks(d, (180, y + 50), 'Penjaga grup', font(F_BLACK, 36), TEKS)
    teks(d, (180, y + 100), 'Cek permintaan berkala  •  hemat batre', font(F_REG, 26), TEKS2)
    orang = [('Rina Amelia', 'ok', '', w('berkala')), ('Dimas_07', 'no', 'pernah keluar', w('kabur')),
             ('Sari Putri', 'ok', '', w('atau')), ('Bayu Pratama', 'no', 'pernah di-kick', w('di-kick')),
             ('Andi Saputra', 'ok', '', w('ditolak') + .25)]
    warna_av = [(233, 120, 90), (110, 150, 230), (200, 110, 190), (240, 180, 70), (90, 190, 170)]
    for i, (n, st, why, t0) in enumerate(orang):
        u = e_out(prog(t, .05 + i * .1, .4))
        yy = y + 190 + i * 150 + (1 - u) * 60
        d.rounded_rectangle([40, yy, LW - 40, yy + 132], 30, fill=KARTU)
        d.ellipse([70, yy + 26, 150, yy + 106], fill=warna_av[i])
        teks(d, (110, yy + 66), n[0], font(F_BLACK, 38), (255, 255, 255), 'mm')
        teks(d, (176, yy + 36), n, font(F_SEMI, 34), TEKS)
        r = prog(t, t0, .3)
        if st == 'no' and r > 0: teks(d, (176, yy + 84), why, font(F_SEMI, 26), mix(TEKS2, MERAH, r))
        else: teks(d, (176, yy + 84), 'minta gabung', font(F_REG, 26), TEKS2)
        cxs, cys = LW - 118, yy + 66
        if r <= 0:
            for k in range(3):
                d.ellipse([cxs - 40 + k * 30 - 7, cys - 7, cxs - 40 + k * 30 + 7, cys + 7], fill=mix(KARTU, TEKS2, .4 + .6 * abs(math.sin(t * 3 - k * .4))))
        else:
            sc = e_back(r, 2.4); c = HIJAU if st == 'ok' else MERAH
            # yang ditolak "kelempar" dikit
            d.rounded_rectangle([cxs - 70 * sc, cys - 34 * sc, cxs + 70 * sc, cys + 34 * sc], 34 * sc, fill=c)
            if st == 'ok': ikon_cek(d, cxs, cys, 34 * sc, (255, 255, 255), prog(t, t0 + .1, .3))
            else: ikon_x(d, cxs, cys, 30 * sc, (255, 255, 255))
            if r < 1 and st == 'no': d.rounded_rectangle([40, yy, LW - 40, yy + 132], 30, outline=mix(KARTU, MERAH, 1 - r), width=4)
    u = prog(t, w('aman'), .4)
    if u > 0:
        sc = e_back(u, 2); cy = y + 190 + 5 * 150 + 90; ww = 400 * sc
        d.rounded_rectangle([LW / 2 - ww / 2, cy - 50 * sc, LW / 2 + ww / 2, cy + 50 * sc], 50 * sc, fill=HIJAU_TUA)
        if sc > .6:
            ikon_perisai(d, LW / 2 - 130, cy, 30, HIJAU_T, True, HIJAU_TUA)
            teks(d, (LW / 2 + 22, cy), 'Grup aman', font(F_BLACK, 36), HIJAU_T, 'mm')

def layar_5(im, d, t, D):
    header_wa(d, 'Lagu Harian', 'Saluran  •  2,4 rb pengikut', HIJAU, lambda d, x, y, s: ikon_not(d, x, y, s, (255, 255, 255)))
    d.rectangle([0, 230, LW, LH], fill=BG)
    t_vn, t_cap, t_hati = w('Tiap'), w('caption'), w('hati', 'akhir')
    if t < t_vn:
        # sepi... (jangkrik)
        teks(d, (LW / 2, LH / 2 - 40), 'Belum ada pesan hari ini', font(F_SEMI, 32), TEKS2, 'mm')
        teks(d, (LW / 2, LH / 2 + 10), 'krik... krik...', font(F_REG, 28), (84, 101, 111), 'mm')
    teks(d, (LW / 2, 300), 'HARI INI', font(F_SEMI, 24), TEKS2, 'mm')
    u = e_back(prog(t, t_vn, .5), 1.4)
    if u > 0:
        y = 360 + (1 - u) * 120
        d.rounded_rectangle([60, y, LW - 60, y + 560], 40, fill=(32, 44, 51))
        cx, cy = 150, y + 110
        main = prog(t, t_vn + .5, 5)
        d.ellipse([cx - 54, cy - 54, cx + 54, cy + 54], fill=HIJAU)
        if t < t_vn + .5: d.polygon([(cx - 16, cy - 26), (cx - 16, cy + 26), (cx + 26, cy)], fill=(255, 255, 255))
        else: d.rectangle([cx - 20, cy - 24, cx - 6, cy + 24], fill=(255, 255, 255)); d.rectangle([cx + 6, cy - 24, cx + 20, cy + 24], fill=(255, 255, 255))
        R.gelombang(d, 230, cy - 45, LW - 360, 90, t, main, HIJAU_T, (84, 101, 111))
        teks(d, (230, cy + 70), f'0:{int(main * 60):02d} / 1:00', font(F_REG, 24), TEKS2)
        cap = prog(t, t_cap, .6)
        if cap > 0:
            baris = ['Nadin Amizah — Bertaut', '', '"Nggak semua yang pergi itu', 'hilang. Ada yang tinggal', 'di lagu yang kamu puter', 'diam-diam."']
            for i, b in enumerate(baris):
                a = clamp(cap * 6 - i * .6)
                if a <= 0: continue
                teks(d, (100, y + 230 + i * 50 + (1 - a) * 16), b, font(F_SEMI if i == 0 else F_REG, 32), mix((32, 44, 51), HIJAU_T if i == 0 else TEKS, a))
        r = prog(t, t_hati, .4)
        if r > 0:
            sc = e_back(r, 2.4)
            d.rounded_rectangle([90, y + 580, 90 + 250 * sc, y + 650], 35, fill=(32, 44, 51))
            if sc > .6:
                ikon_hati(d, 136, y + 610, 20 * (1 + .25 * math.sin(clamp(r) * math.pi)), MERAH)
                teks(d, (176, y + 615), f'{int(40 + 88 * clamp((t - t_hati) / 1.2))}  suka', font(F_SEMI, 28), TEKS, 'lm')

def layar_6(im, d, t, D):
    header_wa(d, 'Lagu Harian', 'Saluran  •  caption otomatis', HIJAU, lambda d, x, y, s: ikon_not(d, x, y, s, (255, 255, 255)))
    kartu = [('GALAU', (110, 150, 230), '"Aku baik-baik aja, cuma playlist-ku yang nggak."', '', w('galau')),
             ('AYAT', (240, 180, 70), '"Maka, sesungguhnya beserta kesulitan ada kemudahan."', 'QS. Al-Insyirah: 5', w('ayat')),
             ('GAUL', HIJAU_T, '"Ditelpon berdering, ternyata lagi gaya ..."', '', w('pantun'))]
    y = 280
    for i, (lab, c, isi, sumber, t0) in enumerate(kartu):
        u = e_back(prog(t, t0 - .1, .45), 1.6)
        if u <= 0: continue
        sorot = prog(t, w('gini'), .3) if i == 2 else 0
        redup = prog(t, w('gini'), .3) if i < 2 else 0
        yy = y + i * 380 + (1 - u) * 140
        fill = mix((32, 44, 51), (22, 32, 38), redup)
        d.rounded_rectangle([50, yy, LW - 50, yy + 340], 40, fill=fill, outline=mix(fill, c, sorot) if sorot else None, width=5)
        d.rounded_rectangle([90, yy + 40, 90 + font(F_BLACK, 26).getlength(lab) + 48, yy + 92], 26, fill=mix(fill, c, .25))
        teks(d, (114, yy + 66), lab, font(F_BLACK, 26), c, 'lm')
        f = font(F_SEMI, 36)
        for j, b in enumerate(bungkus(isi, f, LW - 190)): teks(d, (90, yy + 124 + j * 52), b, f, mix(TEKS, TEKS2, redup))
        if sumber: teks(d, (90, yy + 286), sumber, font(F_REG, 26), TEKS2)
        if i == 2 and sorot > 0:
            teks(d, (90, yy + 286), 'tap buat lanjut >>', font(F_SEMI, 26), mix(fill, HIJAU_T, .5 + .5 * math.sin(t * 8)))

def layar_telpon(im, d, t, D):
    t_tr, t_mir, t_hi = w('ternyata'), w('miring.'), w('Hihihi')
    if t < t_tr:
        # panggilan masuk
        d.rectangle([0, 0, LW, LH], fill=(18, 30, 36))
        for r in range(520, 0, -20): d.ellipse([LW / 2 - r, 560 - r, LW / 2 + r, 560 + r], fill=mix((18, 30, 36), (0, 70, 52), (1 - r / 520) * .7))
        status_bar(d)
        teks(d, (LW / 2, 260), 'Panggilan suara WhatsApp', font(F_REG, 30), TEKS2, 'mm')
        goyang = math.sin(t * 38) * 6 * (1 if (t % .8) < .5 else 0)
        denyut(d, LW / 2, 560, 130, t, HIJAU_T, .9, 3, 6)
        d.ellipse([LW / 2 - 130 + goyang, 430, LW / 2 + 130 + goyang, 690], fill=(233, 120, 150))
        teks(d, (LW / 2 + goyang, 560), 'D', font(F_BLACK, 120), (255, 255, 255), 'mm')
        teks(d, (LW / 2, 780), 'Doi', font(F_BLACK, 64), TEKS, 'mm')
        ikon_hati(d, LW / 2 + 90, 772, 18, MERAH)
        teks(d, (LW / 2, 850), 'Berdering' + '.' * (int(t * 3) % 3 + 1), font(F_SEMI, 32), TEKS2, 'mm')
        for x, c, l in [(LW / 2 - 200, MERAH, 'Tolak'), (LW / 2 + 200, HIJAU, 'Terima')]:
            by = LH - 330 + (math.sin(t * 10) * 8 if c == HIJAU else 0)
            d.ellipse([x - 70, by - 70, x + 70, by + 70], fill=c)
            teks(d, (x, by + 120), l, font(F_SEMI, 28), TEKS, 'mm')
    else:
        # "ternyata lagi gaya miring" → layar kamera selfie miring + kartu pantun
        d.rectangle([0, 0, LW, LH], fill=(22, 26, 30))
        status_bar(d)
        u = e_back(prog(t, t_tr, .45), 1.5)
        cx = LW / 2; cy = 700
        # siluet orang pose miring (gaya miring beneran)
        sud = -18 * e_back(prog(t, t_mir, .4), 2.2)
        sil = Image.new('RGBA', (600, 760), (0, 0, 0, 0)); sd = ImageDraw.Draw(sil)
        sd.ellipse([210, 60, 390, 250], fill=(233, 120, 150))
        sd.rounded_rectangle([140, 260, 460, 760], 120, fill=(0, 92, 75))
        # tangan peace
        sd.rounded_rectangle([410, 180, 450, 330], 20, fill=(233, 120, 150)); sd.rounded_rectangle([450, 190, 490, 330], 20, fill=(233, 120, 150))
        sd.ellipse([248, 130, 278, 160], fill=(30, 30, 30)); sd.ellipse([322, 130, 352, 160], fill=(30, 30, 30))
        sd.arc([260, 150, 340, 215], 20, 160, fill=(30, 30, 30), width=8)
        sil = sil.rotate(sud, resample=Image.BICUBIC, center=(300, 700))
        if u > 0:
            sil2 = sil.resize((int(600 * u) or 1, int(760 * u) or 1))
            im.alpha_composite(sil2, (int(cx - sil2.width / 2), int(cy + 380 - sil2.height)))
        # bingkai kamera
        d.rectangle([60, 250, LW - 60, 1110], outline=(255, 255, 255), width=3)
        for (x, y) in [(60, 250), (LW - 60, 250), (60, 1110), (LW - 60, 1110)]:
            d.ellipse([x - 8, y - 8, x + 8, y + 8], fill=(255, 255, 255))
        teks(d, (84, 290), 'REC', font(F_BLACK, 28), MERAH if (t * 2) % 1 < .6 else (22, 26, 30))
        # kartu pantun
        k = e_back(prog(t, t_tr + .1, .4), 1.4)
        if k > 0:
            yy = 1180 + (1 - k) * 200
            d.rounded_rectangle([50, yy, LW - 50, yy + 420], 40, fill=(32, 44, 51), outline=HIJAU_T, width=4)
            d.rounded_rectangle([90, yy + 36, 250, yy + 88], 26, fill=mix((32, 44, 51), HIJAU_T, .25))
            teks(d, (170, yy + 62), 'GAUL', font(F_BLACK, 26), HIJAU_T, 'mm')
            teks(d, (90, yy + 130), 'Ditelpon berdering,', font(F_BLACK, 44), TEKS)
            m = prog(t, t_mir - .35, .3)
            if m > 0: teks(d, (90, yy + 200), 'ternyata lagi', font(F_BLACK, 44), mix((32, 44, 51), TEKS, m))
            g = prog(t, t_mir - .05, .25)
            if g > 0:
                lay = Image.new('RGBA', (700, 110), (0, 0, 0, 0)); ld = ImageDraw.Draw(lay)
                ld.text((10, 55), 'gaya miring.', font=font(F_BLACK, int(60)), fill=HIJAU_T + (int(255 * g),), anchor='lm')
                lay = lay.rotate(-8 * e_back(g, 2), resample=Image.BICUBIC, expand=True)
                im.alpha_composite(lay, (80, int(yy + 250)))
        if t > t_hi:
            # emoji ketawa digambar (muka kuning)
            e = e_back(prog(t, t_hi, .35), 2.2)
            ex, ey = LW - 170, 380; r = 80 * e
            gy = math.sin(t * 25) * 6
            d.ellipse([ex - r, ey - r + gy, ex + r, ey + r + gy], fill=(255, 204, 51))
            if e > .5:
                d.arc([ex - 48, ey - 40 + gy, ex - 12, ey - 4 + gy], 200, 340, fill=(90, 50, 20), width=8)
                d.arc([ex + 12, ey - 40 + gy, ex + 48, ey - 4 + gy], 200, 340, fill=(90, 50, 20), width=8)
                d.chord([ex - 50, ey - 10 + gy, ex + 50, ey + 60 + gy], 0, 180, fill=(90, 50, 20))
                d.ellipse([ex - 78, ey - 14 + gy, ex - 50, ey + 30 + gy], fill=(90, 190, 255))
                d.ellipse([ex + 50, ey - 14 + gy, ex + 78, ey + 30 + gy], fill=(90, 190, 255))

def layar_7(im, d, t, D):
    header_app(d)
    y = 250
    d.rounded_rectangle([40, y, LW - 40, y + 190], 38, fill=KARTU)
    teks(d, (84, y + 60), 'Bot aktif', font(F_BLACK, 40), TEKS); teks(d, (84, y + 120), 'Jalan di latar belakang', font(F_REG, 28), TEKS2)
    on = e_io(prog(t, .05, .35)); sx = LW - 200
    d.rounded_rectangle([sx, y + 64, sx + 120, y + 126], 31, fill=mix(KARTU2, HIJAU, on))
    kx = sx + 31 + on * 58; d.ellipse([kx - 25, y + 70, kx + 25, y + 120], fill=(255, 255, 255))
    ubin = [('Hemat baterai', 'mode berkala, nggak boros', w('Baterai') - .1), ('Perekam log', 'Android/media/.../log', w('perekam') - .1),
            ('Tema gelap', 'hijau ala WhatsApp', w('tampilannya') - .1)]
    for i, (j, s, t0) in enumerate(ubin):
        u = e_back(prog(t, t0, .45), 1.8)
        if u <= 0: continue
        yy = y + 230 + i * 250; sc = .85 + .15 * u; cx = LW / 2; ww = (LW - 80) * sc; h = 220 * sc
        d.rounded_rectangle([cx - ww / 2, yy, cx + ww / 2, yy + h], 38, fill=KARTU)
        ix, iy = cx - ww / 2 + 110, yy + h / 2
        d.ellipse([ix - 62, iy - 62, ix + 62, iy + 62], fill=HIJAU_TUA)
        if i == 0:
            isi = clamp((t - t0) / 1.5)
            d.rounded_rectangle([ix - 22, iy - 38, ix + 22, iy + 38], 8, outline=HIJAU_T, width=6); d.rectangle([ix - 8, iy - 46, ix + 8, iy - 38], fill=HIJAU_T)
            hh = 60 * (.3 + .7 * isi); d.rectangle([ix - 12, iy + 28 - hh, ix + 12, iy + 28], fill=HIJAU_T)
        elif i == 1:
            for k in range(4):
                o = ((t - t0) * 30) % 20; yl = iy - 30 + k * 20 - o
                if iy - 38 < yl < iy + 34: d.rounded_rectangle([ix - 30, yl, ix + 30 - (k % 2) * 22, yl + 8], 4, fill=HIJAU_T)
        else: gambar_bulan(d, ix, iy, 34, HIJAU_T, HIJAU_TUA)
        teks(d, (ix + 100, iy - 26), j, font(F_BLACK, 36), TEKS, 'lm'); teks(d, (ix + 100, iy + 26), s, font(F_REG, 26), TEKS2, 'lm')

def layar_8(im, d, t, D):
    d.rectangle([0, 0, LW, LH], fill=(20, 20, 24)); status_bar(d)
    gambar_bulan(d, LW / 2, 300, 110, HIJAU_T, (20, 20, 24))
    d.rounded_rectangle([0, 520, LW, LH], 44, fill=(30, 30, 36))
    teks(d, (LW / 2, 580), '1.284 komentar', font(F_SEMI, 28), TEKS, 'mm')
    kom = [('rizky.dev', 'bisa auto balas chat gak kak?', .3), ('nadiaa_', 'fitur jadwal pesan dong!', .9), ('bang.jago', 'bisa buat grup sekolah?', 1.5)]
    for i, (n, s, t0) in enumerate(kom):
        u = e_out(prog(t, t0, .4))
        if u <= 0: continue
        yy = 650 + i * 170 + (1 - u) * 40; warna = [(233, 120, 90), (200, 110, 190), (90, 190, 170)][i]
        d.ellipse([60, yy, 140, yy + 80], fill=mix((30, 30, 36), warna, u))
        teks(d, (170, yy + 8), n, font(F_SEMI, 26), mix((30, 30, 36), TEKS2, u)); teks(d, (170, yy + 46), s, font(F_REG, 32), mix((30, 30, 36), TEKS, u))
        ikon_hati(d, LW - 80, yy + 36, 16, mix((30, 30, 36), (120, 120, 130), u))
    d.rounded_rectangle([40, LH - 170, LW - 40, LH - 70], 50, fill=(48, 48, 56))
    ketik = 'tambahin fitur ... '; t0 = w('Tulis')
    n = int(clamp((t - t0) / 1.2) * len(ketik)); s = ketik[:n] if n else 'Tambahkan komentar...'
    teks(d, (90, LH - 120), s + ('|' if n and (t * 2) % 1 < .5 else ''), font(F_REG, 32), TEKS if n else (130, 130, 140), 'lm')

def layar_splash(im, d, t, D): R.layar_splash(im, d, t, D)
LAYAR = [layar_1, layar_splash, layar_3, layar_4, layar_5, layar_6, layar_telpon, layar_7, layar_8]

# ---------- stiker ----------
_st_cache = {}
def stiker(im, t, teks_, warna, x, y, sudut, t0):
    u = prog(t, t0, .3)
    if u <= 0 or t > t0 + 1.8: return
    hilang = clamp((t0 + 1.8 - t) / .25)
    sc = e_back(u, 3.0) * hilang
    if sc <= .02: return
    k = (teks_, warna)
    if k not in _st_cache:
        f = font(F_BLACK, 70); tw = f.getlength(teks_)
        img = Image.new('RGBA', (int(tw + 90), 150), (0, 0, 0, 0)); dd = ImageDraw.Draw(img)
        dd.rounded_rectangle([8, 12, img.width - 8, 138], 34, fill=(255, 255, 255))
        dd.rounded_rectangle([18, 22, img.width - 18, 128], 26, fill=warna)
        dd.text((img.width / 2, 75), teks_, font=f, fill=(15, 15, 15), anchor='mm')
        _st_cache[k] = img
    img = _st_cache[k]
    gy = math.sin((t - t0) * 12) * 3
    img2 = img.resize((max(1, int(img.width * sc)), max(1, int(img.height * sc))), Image.BILINEAR).rotate(sudut + math.sin((t - t0) * 9) * 3, resample=Image.BICUBIC, expand=True)
    im.alpha_composite(img2, (int(x - img2.width / 2), int(y - img2.height / 2 + gy)))

def pil_samping(im, t, teks_, x, y, t0, kiri=True): R.pil_samping(im, t, teks_, x, y, t0, kiri)

# ---------- frame ----------
def frame(t, total):
    si = 0
    for i, s in enumerate(SCENES):
        if t >= s['mulai']: si = i
    s = SCENES[si]; lt = t - s['mulai']; CUR[0] = si; R.SCENES = SCENES
    im = R.ST['bg'].copy().convert('RGBA'); d = ImageDraw.Draw(im)
    for k in range(14):
        rnd = random.Random(k)
        x = rnd.random() * W + math.sin(t * .6 + k) * 30; y = (rnd.random() * H - t * (18 + rnd.random() * 30)) % H; r = 2 + rnd.random() * 4
        d.ellipse([x - r, y - r, x + r, y + r], fill=(30, 90, 70))
    lay = Image.new('RGBA', (LW, LH), BG + (255,)); ld = ImageDraw.Draw(lay)
    LAYAR[si](lay, ld, lt, s['dur'])
    lay = lay.resize((SW, SH), Image.LANCZOS)
    u = e_out(prog(lt, 0, .35)) if si > 0 else 1
    dy = int((1 - u) * 70)
    fy = int(math.sin(t * 1.4) * 6)
    # HP + layar digabung dulu biar bisa dimiringin (scene pantun)
    hp = R.ST['hp'].copy()
    kanvas = Image.new('RGBA', (SW, SH), BG + (255,)); kanvas.alpha_composite(lay, (0, dy))
    hp.paste(kanvas, (20 + BZ, 20 + BZ), R.ST['mask_layar'])
    if si > 0 and lt < .18:
        fl = Image.new('RGBA', (SW, SH), (255, 255, 255, int(120 * (1 - lt / .18))))
        area = hp.crop((20 + BZ, 20 + BZ, 20 + BZ + SW, 20 + BZ + SH)); hp.paste(Image.alpha_composite(area, fl), (20 + BZ, 20 + BZ), R.ST['mask_layar'])
    miring = 0
    if LAYAR[si] is layar_telpon:
        t_mir = wk(si, 'miring.')
        miring = 9 * e_back(prog(lt, t_mir, .45), 2.2) * (1 - e_io(prog(lt, s['dur'] - .5, .45)))
    if LAYAR[si] is layar_telpon and lt < wk(si, 'ternyata'):
        # HP geter pas ditelpon
        miring = math.sin(lt * 45) * 1.2 * (1 if (lt % .8) < .5 else 0)
    if abs(miring) > .01:
        hp = hp.rotate(miring, resample=Image.BICUBIC, expand=True)
        im.alpha_composite(hp, (int(PX - 20 - (hp.width - PW - 40) / 2), int(PY - 20 + fy - (hp.height - PH - 40) / 2)))
    else:
        im.alpha_composite(hp, (PX - 20, PY - 20 + fy))
    if LAYAR[si] is layar_splash:
        pil_samping(im, lt, 'Tanpa server', 70, 1010, wk(si, 'server,') - .05, True)
        pil_samping(im, lt, 'Tanpa laptop', W - 70, 1150, wk(si, 'laptop.') - .05, False)
    if si == len(SCENES) - 1:
        R.tombol_follow(im, lt, wk(si, 'follow,') - .1)
    R.chip_seri(im, t)
    im.alpha_composite(R.judul_frame(si, lt), (0, 262))
    for (ss, kata, tx, c, x, y, sd) in STIKER:
        if ss == si: stiker(im, lt, tx, c, x, y, sd, wk(ss, kata, 'akhir' if kata.endswith(('?', '!', '.')) else 'awal'))
    R.subtitle(im, t, si)
    if si == len(SCENES) - 1:
        R.outro(im, t, s['mulai'] + s['dur'] - R.OUTRO)
    # zoom tinju (vine boom)
    for (ss, kata, jenis, geser) in ZOOM:
        if ss != si: continue
        z = lt - (wk(ss, kata, jenis) + geser)
        if 0 <= z < .35:
            f = 1 + .07 * (1 - z / .35) ** 2
            cw, ch = int(W / f), int(H / f)
            ox = (W - cw) // 2 + int(math.sin(z * 90) * 6 * (1 - z / .35)); oy = (H - ch) // 2
            im = im.crop((ox, oy, ox + cw, oy + ch)).resize((W, H), Image.BILINEAR)
    return im.convert('RGB')

# ---------- audio ----------
def buat_audio(total, out_musik, out_vo):
    sr = 44100; n = int(total * sr) + sr
    vo = np.zeros(n, np.float32)
    for s in SCENES:
        a = s['audio']; i = int(s['vo_mulai'] * sr); vo[i:i + len(a)] += a
    sfx = np.zeros(n, np.float32)
    def taruh(nama, t0, gain, maks=None):
        a, _ = R.baca_wav(os.path.join(ROOT, 'sfxw', nama + '.wav'))
        # trim diam depan
        nz = np.nonzero(np.abs(a) > .02)[0]
        if len(nz): a = a[max(0, nz[0] - 200):]
        if maks: a = a[:int(maks * sr)].copy(); fo = min(len(a), int(.25 * sr)); a[-fo:] *= np.linspace(1, 0, fo)
        a = a / (np.sqrt(np.mean(a ** 2)) + 1e-6) * .12 * gain * 2
        i = int(t0 * sr); m = min(len(a), n - i)
        if m > 0: sfx[i:i + m] += a[:m]
    # whoosh transisi
    for si, s in enumerate(SCENES):
        if si > 0: taruh('fast-whoosh', s['mulai'] - .25, .35, .7)
    for cue in SFX:
        si, kata, nama, g, geser, jenis = cue[:6]; maks = cue[6] if len(cue) > 6 else None
        taruh(nama, SCENES[si]['mulai'] + wk(si, kata, jenis) + geser, g, maks)
    taruh('whoosh-sfx', SCENES[-1]['mulai'] + SCENES[-1]['dur'] - R.OUTRO, .4)
    # musik latar lembut dari render.py (dibikin ulang di sini biar ikut durasi)
    tmp_m = os.path.join(ROOT, 'tmp', '_m.wav'); tmp_v = os.path.join(ROOT, 'tmp', '_v.wav')
    R.SCENES = SCENES
    R.buat_audio(total, tmp_m, tmp_v)   # isi: vo + sfx lama + musik; kita ambil musiknya aja
    m_all, _ = R.baca_wav(tmp_m); v_all, _ = R.baca_wav(tmp_v)
    # skala sama (dinormalisasi di sana) → musik ≈ m_all - v_all*(skala)
    L = min(len(m_all), len(v_all), n)
    k = np.dot(m_all[:L], v_all[:L]) / (np.dot(v_all[:L], v_all[:L]) + 1e-9)
    mus = np.zeros(n, np.float32); mus[:L] = m_all[:L] - k * v_all[:L]
    # duck musik waktu ada suara & sfx
    fr = 441; env = np.sqrt(np.convolve((vo + sfx) ** 2, np.ones(fr * 10) / (fr * 10), 'same'))
    duck = 1 - .6 * np.clip(env / .05, 0, 1); duck = np.convolve(duck, np.ones(fr * 8) / (fr * 8), 'same')
    mus *= duck * .55
    vo_n = vo / (np.abs(vo).max() + 1e-6) * .9
    for p, x in [(out_musik, vo_n + sfx + mus), (out_vo, vo_n + sfx)]:
        x = x[:int(total * sr)]
        # limiter lembut
        x = np.tanh(x * 1.1) / np.tanh(1.1)
        x = x / max(1e-6, np.abs(x).max()) * .93
        ww = wave.open(p, 'wb'); ww.setnchannels(1); ww.setsampwidth(2); ww.setframerate(sr)
        ww.writeframes((x * 32767).astype(np.int16).tobytes()); ww.close()

def render_bagian(a, b, total, out):
    R.ST = R.buat_statis(); R.SCENES = SCENES
    p = subprocess.Popen([R.ffmpeg(), '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS),
                          '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', out], stdin=subprocess.PIPE)
    for f in range(a, b): p.stdin.write(frame(f / FPS, total).tobytes())
    p.stdin.close(); p.wait()

if __name__ == '__main__':
    if not os.path.exists(os.path.join(ROOT, 'wav2t', '09.wav')) or '--siapkan' in sys.argv: siapkan_vo()
    total = bangun_timeline(); R.SCENES = SCENES
    nf = int(total * FPS)
    if '--kata' in sys.argv:
        for i, s in enumerate(SCENES): print(i, round(s['mulai'], 2), [(k, round(a - s['mulai'], 2)) for k, a, b in s['kata']])
        sys.exit()
    if '--cek' in sys.argv:
        R.ST = R.buat_statis()
        for i, v in enumerate(sys.argv[sys.argv.index('--cek') + 1:]): frame(float(v), total).save(os.path.join(ROOT, f'cek_{i}.png'))
        sys.exit()
    if '--bagian' in sys.argv:
        i = sys.argv.index('--bagian'); render_bagian(int(sys.argv[i + 1]), int(sys.argv[i + 2]), total, sys.argv[i + 3]); sys.exit()
    tmp = os.path.join(ROOT, 'tmp'); os.makedirs(tmp, exist_ok=True)
    print('durasi', round(total, 2), 'detik,', nf, 'frame')
    buat_audio(total, os.path.join(tmp, 'audio_musik.wav'), os.path.join(tmp, 'audio_vo.wav'))
    tengah = nf // 2
    ps = [subprocess.Popen([sys.executable, __file__, '--bagian', str(a), str(b), os.path.join(tmp, f'b{k}.mp4')]) for k, (a, b) in enumerate([(0, tengah), (tengah, nf)])]
    for p in ps: p.wait()
    with open(os.path.join(tmp, 'daftar.txt'), 'w') as f: f.write("file 'b0.mp4'\nfile 'b1.mp4'\n")
    subprocess.run([R.ffmpeg(), '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', os.path.join(tmp, 'daftar.txt'), '-c', 'copy', os.path.join(tmp, 'video.mp4')], check=True)
    for nama, au in [('tiktok-v2-wa-release-bot.mp4', 'audio_musik.wav'), ('tiktok-v2-tanpa-musik.mp4', 'audio_vo.wav')]:
        subprocess.run([R.ffmpeg(), '-v', 'error', '-y', '-i', os.path.join(tmp, 'video.mp4'), '-i', os.path.join(tmp, au), '-c:v', 'copy',
                        '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-shortest', '-movflags', '+faststart', os.path.join(ROOT, nama)], check=True)
    print('selesai')
