#!/usr/bin/env python3
"""
Generator layout XML (res/layout/activity_*.xml).

Kenapa pakai generator: layout-nya banyak kartu & baris saklar yang bentuknya
sama persis. Nulis manual = gampang typo / lupa satu atribut. Jalankan:

    python3 scripts-dev/gen_layout.py

Hasilnya boleh diedit langsung juga, tapi kalau generator dijalanin ulang,
editan manual ketimpa.
"""
import os
from xml.sax.saxutils import escape

ROOT = os.path.join(os.path.dirname(__file__), '..', 'app', 'src', 'main', 'res', 'layout')
NS = 'xmlns:android="http://schemas.android.com/apk/res/android"'


def a(s):
    """escape teks buat atribut XML (termasuk kutip & apostrof Android)."""
    return escape(s, {'"': '&quot;'}).replace("'", "\\'")


def ind(block, n):
    pad = ' ' * n
    return '\n'.join(pad + l if l.strip() else l for l in block.split('\n'))


# ----------------------------------------------------------------- komponen
def kartu(judul, ikon, ket, isi, id_=None):
    idattr = f' android:id="@+id/{id_}"' if id_ else ''
    ket_xml = f'\n    <TextView style="@style/KetKartu" android:text="{a(ket)}" />' if ket else ''
    return f'''<LinearLayout style="@style/Kartu"{idattr}>
    <TextView
        style="@style/JudulKartu"
        android:drawableStart="@drawable/{ikon}"
        android:text="{a(judul)}" />{ket_xml}
{ind(isi, 4)}
</LinearLayout>'''


def label(t):
    return f'<TextView style="@style/Label" android:text="{a(t)}" />'


def isian(id_, hint, tipe='text', baris=1):
    extra = ''
    if baris > 1:
        extra = f'''
    android:singleLine="false"
    android:minLines="{baris}"
    android:gravity="top|start"'''
        tipe = 'textMultiLine'
    return f'''<EditText
    android:id="@+id/{id_}"
    style="@style/Isian"
    android:hint="{a(hint)}"
    android:importantForAutofill="no"
    android:inputType="{tipe}"{extra} />'''


def saklar(id_, judul, ket):
    return f'''<LinearLayout android:id="@+id/{id_}" style="@style/BarisSaklar">
    <LinearLayout
        android:layout_width="0dp"
        android:layout_height="wrap_content"
        android:layout_weight="1"
        android:orientation="vertical">
        <TextView
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:text="{a(judul)}"
            android:textColor="@color/wr_teks"
            android:textSize="15sp" />
        <TextView
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:layout_marginTop="2dp"
            android:text="{a(ket)}"
            android:textColor="@color/wr_teks2"
            android:textSize="12sp" />
    </LinearLayout>
    <ImageView style="@style/Saklar" />
</LinearLayout>'''


def pilihan(id_, judul, ket, lencana):
    """Baris pilihan mode (kayak radio): isSelected → garis hijau + titik."""
    return f'''<LinearLayout
    android:id="@+id/{id_}"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_marginTop="8dp"
    android:background="@drawable/bg_pilihan"
    android:clickable="true"
    android:focusable="true"
    android:gravity="center_vertical"
    android:orientation="horizontal"
    android:padding="14dp">
    <ImageView
        android:layout_width="22dp"
        android:layout_height="22dp"
        android:duplicateParentState="true"
        android:importantForAccessibility="no"
        android:src="@drawable/sel_radio" />
    <LinearLayout
        android:layout_width="0dp"
        android:layout_height="wrap_content"
        android:layout_marginStart="12dp"
        android:layout_weight="1"
        android:orientation="vertical">
        <LinearLayout
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:gravity="center_vertical"
            android:orientation="horizontal">
            <TextView
                android:layout_width="0dp"
                android:layout_height="wrap_content"
                android:layout_weight="1"
                android:text="{a(judul)}"
                android:textColor="@color/wr_teks"
                android:textSize="15sp"
                android:textStyle="bold" />
            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:background="@drawable/bg_lencana"
                android:paddingStart="8dp"
                android:paddingTop="2dp"
                android:paddingEnd="8dp"
                android:paddingBottom="2dp"
                android:text="{a(lencana)}"
                android:textColor="@color/wr_hijau"
                android:textSize="11sp" />
        </LinearLayout>
        <TextView
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:layout_marginTop="3dp"
            android:lineSpacingExtra="2dp"
            android:text="{a(ket)}"
            android:textColor="@color/wr_teks2"
            android:textSize="12.5sp" />
    </LinearLayout>
</LinearLayout>'''


def tombol(id_, teks, gaya='TombolLembut', ikon=None, atas=12):
    ik = f'\n    android:drawableStart="@drawable/{ikon}"' if ikon else ''
    return f'''<TextView
    android:id="@+id/{id_}"
    style="@style/{gaya}"{ik}
    android:layout_marginTop="{atas}dp"
    android:text="{a(teks)}" />'''


def dua(kiri, kanan, atas=12):
    """Dua tombol sebelahan: (id, teks, gaya, ikon)."""
    def satu(t, pertama):
        id_, teks, gaya, ikon = t
        ms = '' if pertama else '\n    android:layout_marginStart="10dp"'
        ik = f'\n    android:drawableStart="@drawable/{ikon}"' if ikon else ''
        return f'''<TextView
    android:id="@+id/{id_}"
    android:layout_width="0dp"
    android:layout_weight="1"{ms}
    style="@style/{gaya}"{ik}
    android:text="{a(teks)}" />'''
    return f'''<LinearLayout
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_marginTop="{atas}dp"
    android:orientation="horizontal">
{ind(satu(kiri, True), 4)}
{ind(satu(kanan, False), 4)}
</LinearLayout>'''


def teks(id_, gaya='KetKartu', atas=10, extra=''):
    return f'''<TextView
    android:id="@+id/{id_}"
    style="@style/{gaya}"
    android:layout_marginTop="{atas}dp"{extra} />'''


def banner_xml(bawah):
    return f'''<TextView
    android:id="@+id/tvBanner"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_gravity="bottom"
    android:layout_marginStart="16dp"
    android:layout_marginEnd="16dp"
    android:layout_marginBottom="{bawah}dp"
    android:background="@drawable/bg_banner"
    android:elevation="8dp"
    android:padding="14dp"
    android:textColor="@color/wr_teks"
    android:textSize="14sp"
    android:visibility="gone" />'''


def halaman(komentar, isi, bawah_xml='', pad_bawah=24, banner_bawah=24):
    return f'''<?xml version="1.0" encoding="utf-8"?>
<!--
  {komentar}
  DIBIKIN GENERATOR: scripts-dev/gen_layout.py — edit di sana, lalu jalankan ulang.
  Semua komponen digambar sendiri (res/values/themes.xml + res/drawable/bg_*):
  nggak ada MaterialButton / CardView / Switch bawaan.
-->
<FrameLayout {NS}
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:background="@color/wr_latar">

    <ScrollView
        android:id="@+id/svUtama"
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        android:clipToPadding="false"
        android:fillViewport="true"
        android:paddingBottom="{pad_bawah}dp">

        <LinearLayout
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:orientation="vertical"
            android:paddingStart="16dp"
            android:paddingTop="16dp"
            android:paddingEnd="16dp">

{ind(isi, 12)}

            <View
                android:layout_width="match_parent"
                android:layout_height="24dp" />
        </LinearLayout>
    </ScrollView>

{ind(banner_xml(banner_bawah), 4)}
{ind(bawah_xml, 4) if bawah_xml else ''}
</FrameLayout>
'''


def bar_atas(judul, sub_id=None):
    sub = ''
    if sub_id:
        sub = f'''
        <TextView
            android:id="@+id/{sub_id}"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:textColor="@color/wr_teks2"
            android:textSize="12sp" />'''
    return f'''<LinearLayout
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:gravity="center_vertical"
    android:orientation="horizontal">
    <ImageView
        android:id="@+id/btnKembali"
        android:layout_width="44dp"
        android:layout_height="44dp"
        android:background="@drawable/bg_tombol_lembut"
        android:clickable="true"
        android:contentDescription="Kembali"
        android:focusable="true"
        android:padding="10dp"
        android:src="@drawable/ic_kembali"
        app_tint_placeholder />
    <LinearLayout
        android:layout_width="0dp"
        android:layout_height="wrap_content"
        android:layout_marginStart="14dp"
        android:layout_weight="1"
        android:orientation="vertical">
        <TextView
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:text="{a(judul)}"
            android:textColor="@color/wr_teks"
            android:textSize="21sp"
            android:textStyle="bold" />{sub}
    </LinearLayout>
</LinearLayout>'''.replace('\n        app_tint_placeholder', '\n        android:tint="@color/wr_teks"')


# ----------------------------------------------------------------- dashboard
def dashboard():
    header = '''<LinearLayout
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:gravity="center_vertical"
    android:orientation="horizontal">

    <FrameLayout
        android:layout_width="52dp"
        android:layout_height="52dp"
        android:background="@drawable/bg_logo">
        <ImageView
            android:layout_width="40dp"
            android:layout_height="40dp"
            android:layout_gravity="center"
            android:contentDescription="@string/app_name"
            android:src="@drawable/ic_logo" />
    </FrameLayout>

    <LinearLayout
        android:layout_width="0dp"
        android:layout_height="wrap_content"
        android:layout_marginStart="14dp"
        android:layout_weight="1"
        android:orientation="vertical">
        <TextView
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:text="@string/app_name"
            android:textColor="@color/wr_teks"
            android:textSize="20sp"
            android:textStyle="bold" />
        <LinearLayout
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:layout_marginTop="3dp"
            android:gravity="center_vertical"
            android:orientation="horizontal">
            <TextView
                android:id="@+id/tvPill"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:paddingStart="10dp"
                android:paddingTop="3dp"
                android:paddingEnd="10dp"
                android:paddingBottom="3dp"
                android:text="MATI"
                android:textColor="@color/wr_teks"
                android:textSize="11sp"
                android:textStyle="bold" />
            <TextView
                android:id="@+id/tvVersi"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:layout_marginStart="8dp"
                android:textColor="@color/wr_teks2"
                android:textSize="12sp" />
        </LinearLayout>
    </LinearLayout>

    <ImageView
        android:id="@+id/btnSetelan"
        android:layout_width="46dp"
        android:layout_height="46dp"
        android:background="@drawable/bg_tombol_lembut"
        android:clickable="true"
        android:contentDescription="Setelan"
        android:focusable="true"
        android:padding="11dp"
        android:src="@drawable/ic_setelan"
        android:tint="@color/wr_teks" />
</LinearLayout>'''

    tertaut = '''<LinearLayout
    android:id="@+id/kartuTertaut"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_marginTop="18dp"
    android:background="@drawable/bg_tertaut"
    android:gravity="center_vertical"
    android:orientation="horizontal"
    android:padding="16dp"
    android:visibility="gone">
    <ImageView
        android:layout_width="40dp"
        android:layout_height="40dp"
        android:background="@drawable/bg_bulat_hijau"
        android:importantForAccessibility="no"
        android:padding="8dp"
        android:src="@drawable/ic_centang"
        android:tint="#FF06201A" />
    <LinearLayout
        android:layout_width="0dp"
        android:layout_height="wrap_content"
        android:layout_marginStart="14dp"
        android:layout_weight="1"
        android:orientation="vertical">
        <TextView
            android:id="@+id/tvTertautJudul"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:text="WA SUDAH TERTAUT"
            android:textColor="@color/wr_hijau_terang"
            android:textSize="15sp"
            android:textStyle="bold"
            android:letterSpacing="0.03" />
        <TextView
            android:id="@+id/tvTertautKet"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:layout_marginTop="2dp"
            android:textColor="@color/wr_teks2"
            android:textSize="12.5sp" />
    </LinearLayout>
    <TextView
        android:id="@+id/btnLepas"
        android:layout_width="wrap_content"
        android:layout_height="38dp"
        android:layout_marginStart="8dp"
        style="@style/TombolLembut"
        android:paddingStart="14dp"
        android:paddingEnd="14dp"
        android:textSize="13sp"
        android:text="Lepas" />
</LinearLayout>'''

    tautkan = kartu('Tautkan WhatsApp', 'ic_tautan',
        'Cukup sekali. Paling gampang pakai kode: isi nomor WA lo, nanti muncul 8 huruf yang diketik di WhatsApp — nggak perlu HP kedua.',
        '\n'.join([
            teks('tvWaStatus', 'KetKartu', 10, '\n    android:textColor="@color/wr_hijau"\n    android:textStyle="bold"'),
            label('Nomor WA (buat pairing code)'),
            isian('etPhone', 'contoh: 0812 3456 7890', 'phone'),
            tombol('btnPairing', 'Tautkan pakai kode', 'TombolUtama', 'ic_kunci'),
            tombol('btnQr', 'Pakai QR (scan dari HP lain)', 'TombolGaris', 'ic_qr'),
        ]), id_='kartuTautkan')

    def ubin(id_, lbl, ms):
        m = '\n    android:layout_marginStart="10dp"' if ms else ''
        return f'''<LinearLayout style="@style/Ubin"{m}>
    <TextView style="@style/UbinLabel" android:text="{a(lbl)}" />
    <TextView android:id="@+id/{id_}" style="@style/UbinIsi" android:text="—" />
</LinearLayout>'''

    def baris_ubin(k, n, atas):
        return f'''<LinearLayout
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_marginTop="{atas}dp"
    android:orientation="horizontal">
{ind(ubin(*k, False), 4)}
{ind(ubin(*n, True), 4)}
</LinearLayout>'''

    status = '\n'.join([
        baris_ubin(('tvUbinWa', 'WhatsApp'), ('tvUbinMode', 'Mode'), 14),
        baris_ubin(('tvUbinRilis', 'Rilis terakhir'), ('tvUbinGrup', 'Penjaga grup'), 10),
        '''<TextView
    android:id="@+id/tvNext"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_marginTop="10dp"
    android:gravity="center"
    android:textColor="@color/wr_teks2"
    android:textSize="13sp" />''',
        '''<TextView
    android:id="@+id/tvError"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_marginTop="10dp"
    android:background="@drawable/bg_tombol_bahaya"
    android:padding="12dp"
    android:textColor="@color/wr_merah"
    android:textSize="13sp"
    android:visibility="gone" />''',
        dua(('btnMulai', 'Mulai', 'TombolUtama', 'ic_play'), ('btnCheck', 'Cek sekarang', 'TombolGaris', 'ic_cek'), 12),
    ])

    aksi = kartu('Aksi cepat', 'ic_kontrol', None, '\n'.join([
        teks('tvGrupStat', 'KetKartu', 10,
             '\n    android:background="@drawable/bg_ubin"\n    android:padding="12dp"\n    android:textColor="@color/wr_teks"'),
        dua(('btnTest', 'Tes channel', 'TombolGaris', 'ic_kirim'), ('btnRespons', 'Lihat respons', 'TombolGaris', 'ic_chat'), 12),
        dua(('btnTesGrup', 'Tes grup', 'TombolLembut', 'ic_grup'), ('btnLihatHitam', 'Daftar hitam', 'TombolLembut', 'ic_daftar'), 10),
    ]))

    log = kartu('Log', 'ic_log', 'Catatan kerja bot. Kalau ada yang aneh, tekan Kirim log.', '\n'.join([
        '''<ScrollView
    android:id="@+id/svLog"
    android:layout_width="match_parent"
    android:layout_height="240dp"
    android:layout_marginTop="12dp"
    android:background="@drawable/bg_log"
    android:padding="12dp">
    <TextView
        android:id="@+id/tvLog"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:fontFamily="monospace"
        android:text="(belum ada log)"
        android:textColor="#B8C4CA"
        android:textIsSelectable="true"
        android:textSize="11.5sp" />
</ScrollView>''',
        dua(('btnKirimLog', 'Kirim log', 'TombolLembut', 'ic_bagi'), ('btnKill', 'Matikan', 'TombolBahaya', 'ic_power'), 12),
    ]))

    return halaman('Dashboard (MainActivity): status, tautan WA, aksi cepat, log.',
                   '\n\n'.join([header, tertaut, tautkan, status, aksi, log]))


# ----------------------------------------------------------------- setelan
def setelan():
    mode = kartu('Mode aktivitas', 'ic_mode',
        'Seberapa sering bot nyambung ke WhatsApp. Makin jarang = makin hemat batre, tapi perintah di grup dibalas lebih lambat.',
        '\n'.join([
            pilihan('rowModeBerkala', 'Berkala', 'Nyambung tiap interval cek grup (mis. 5 menit), ±25 detik, lalu tidur lagi. Paling bisa ditebak.', 'hemat'),
            pilihan('rowModeAdaptif', 'Adaptif', 'Kayak Berkala, tapi kalau grup sepi jedanya makin panjang (2×, 4×… sampai batas). Ada kegiatan → balik rapet.', 'lebih hemat'),
            pilihan('rowModePintar', 'Pintar', 'Tidur terus. Dibangunin pas WhatsApp di HP ini dapet notif dari grup yang dijaga. Cadangan: cek tiap 30 menit.', 'paling hemat'),
            pilihan('rowModeRealtime', 'Realtime', 'Selalu nyambung. Permintaan join & perintah langsung diproses detik itu juga. Paling boros batre.', 'boros'),
            teks('tvIzinNotif', 'KetKartu', 12,
                 '\n    android:background="@drawable/bg_ubin"\n    android:padding="12dp"\n    android:visibility="gone"'),
            tombol('btnIzinNotif', 'Izinkan akses notifikasi', 'TombolGaris', 'ic_notif', 10),
            label('Adaptif: jeda paling lama (menit)'),
            isian('etAdaptifMaks', '60', 'number'),
        ]))

    rilis = kartu('Rilis GitHub', 'ic_kirim',
        'Tiap ada rilis baru di repo, bot posting ke channel WA. Kosongin repo kalau cuma mau pakai penjaga grup.',
        '\n'.join([
            label('Repo GitHub'),
            isian('etRepo', 'pemilik/repo  atau  link github.com/...', 'textUri'),
            label('Token GitHub (opsional)'),
            isian('etToken', 'ghp_… (cuma perlu buat repo privat)', 'textPassword'),
            label('Cek rilis tiap (menit)'),
            isian('etInterval', '15', 'number'),
            saklar('rowPrerelease', 'Ikutkan pre-release', 'Versi beta / RC ikut diposting'),
            saklar('rowPostFirst', 'Posting rilis yang ada sekarang', 'Pas pertama jalan, langsung posting rilis terakhir'),
        ]))

    channel = kartu('Channel WhatsApp', 'ic_chat', None, '\n'.join([
        label('Channel WA'),
        isian('etChannel', 'link whatsapp.com/channel/…  atau  …@newsletter', 'textUri'),
        saklar('rowFormatTanya', 'Kirim sebagai Pertanyaan',
               'Follower bisa bales; balasannya cuma sampai ke lo, bisa dibaca lewat "Lihat respons". Matiin kalau channel-nya belum dapet fitur ini.'),
        saklar('rowTestMsg', 'Kirim pesan tes pas setup', 'Biar ketahuan channel-nya bener'),
        dua(('btnBikinChannel', 'Bikin channel', 'TombolLembut', 'ic_tambah'), ('btnCekChannel', 'Cek channel', 'TombolLembut', 'ic_cek'), 12),
    ]))

    grup = kartu('Penjaga grup', 'ic_perisai',
        'Buat grup yang pakai "Setujui anggota baru": yang minta join otomatis di-approve, KECUALI yang dulu udah keluar / dikeluarin. Akun WA lo harus admin di grup itu.',
        '\n'.join([
            saklar('rowGrupAktif', 'Nyalain penjaga grup', 'Approve / tolak permintaan join otomatis'),
            label('Link undangan grup'),
            isian('etGrup', 'https://chat.whatsapp.com/…', 'textUri'),
            label('Cek grup tiap (menit)'),
            isian('etGrupInterval', '5', 'number'),
            label('Selalu tolak nomor ini'),
            isian('etGrupHitam', '0812…, 0813… (pisah koma / baris)', baris=2),
            saklar('rowPerintah', 'Perintah di grup', '!rules & !menu buat semua, !info khusus admin'),
            saklar('rowSamarkan', 'Samarkan nomor di !info', 'Daftar hitam yang dikirim ke grup jadi +62812****7890'),
            label('Link aturan grup'),
            isian('etLinkRules', 'https://rules.xyc.my.id/', 'textUri'),
            label('Aturan singkat (1 baris = 1 poin, kosong = bawaan)'),
            isian('etRingkasRules', 'Keluar grup = permanen…', baris=3),
            dua(('btnCekGrup', 'Cek sekarang', 'TombolLembut', 'ic_cek'), ('btnResetHitam', 'Kosongin hitam', 'TombolLembut', 'ic_hapus'), 12),
        ]))

    script = kartu('Script bot', 'ic_script',
        'Tambah perintah sendiri pakai file JavaScript (.js). Berlaku di grup yang dijaga & chat "Pesan ke diri sendiri".',
        '\n'.join([
            '''<LinearLayout
    android:id="@+id/wadahScript"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_marginTop="12dp"
    android:orientation="vertical" />''',
            dua(('btnUploadScript', 'Upload .js', 'TombolGaris', 'ic_upload'), ('btnContohScript', 'Contoh', 'TombolLembut', 'ic_script'), 12),
        ]))

    batre = kartu('Batre & nyala otomatis', 'ic_batre',
        'Biar nggak dibunuh sistem (apalagi di Xiaomi), izinkan dua hal di bawah.',
        '\n'.join([
            saklar('rowBoot', 'Nyala otomatis pas HP nyala', 'Nggak perlu buka app habis restart'),
            saklar('rowLogcat', 'Rekam log detail (debug)', 'Matiin kalau udah lancar — sedikit lebih hemat'),
            tombol('btnBatre', 'Izinkan jalan di latar (batre)', 'TombolLembut', 'ic_batre'),
            tombol('btnAutostart', 'Buka izin Autostart (Xiaomi dll)', 'TombolLembut', 'ic_power', 10),
            teks('tvBatreStat'),
        ]))

    log = kartu('Log', 'ic_log', 'File log disimpen di folder ini (bisa dibuka file manager):', '\n'.join([
        teks('tvFolderLog', 'KetKartu', 8, '\n    android:fontFamily="monospace"\n    android:textSize="11sp"'),
        dua(('btnBukaLog', 'Buka folder', 'TombolLembut', 'ic_folder'), ('btnKirimLog', 'Kirim log', 'TombolLembut', 'ic_bagi'), 12),
    ]))

    tentang = kartu('Tentang', 'ic_info', None, '\n'.join([
        teks('tvTentangVersi', 'KetKartu', 6),
        dua(('btnTentang', 'Tentang & lisensi', 'TombolLembut', 'ic_info'), ('btnSambutan', 'Panduan awal', 'TombolLembut', 'ic_logo'), 12),
    ]))

    simpan = '''<FrameLayout
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_gravity="bottom"
    android:background="#F20B141A"
    android:paddingStart="16dp"
    android:paddingTop="12dp"
    android:paddingEnd="16dp"
    android:paddingBottom="16dp">
    <TextView
        android:id="@+id/btnSave"
        style="@style/TombolUtama"
        android:drawableStart="@drawable/ic_simpan"
        android:text="Simpan setelan" />
</FrameLayout>'''
    return halaman('Setelan (SettingsActivity).',
                   '\n\n'.join([bar_atas('Setelan', 'tvSetelanSub'), mode, rilis, channel, grup, script, batre, log, tentang]),
                   simpan, pad_bawah=96, banner_bawah=88)


# ----------------------------------------------------------------- tentang
def tentang():
    kepala = '''<LinearLayout
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_marginTop="18dp"
    android:gravity="center_horizontal"
    android:orientation="vertical">
    <FrameLayout
        android:layout_width="84dp"
        android:layout_height="84dp"
        android:background="@drawable/bg_logo">
        <ImageView
            android:layout_width="64dp"
            android:layout_height="64dp"
            android:layout_gravity="center"
            android:contentDescription="@string/app_name"
            android:src="@drawable/ic_logo" />
    </FrameLayout>
    <TextView
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:layout_marginTop="12dp"
        android:text="@string/app_name"
        android:textColor="@color/wr_teks"
        android:textSize="22sp"
        android:textStyle="bold" />
    <TextView
        android:id="@+id/tvVersiTentang"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:layout_marginTop="2dp"
        android:textColor="@color/wr_teks2"
        android:textSize="13sp" />
</LinearLayout>'''
    apa = kartu('Apa ini?', 'ic_logo',
        'Bot WhatsApp yang jalan di HP lo sendiri: ngabarin rilis GitHub ke channel, jagain grup (approve / tolak permintaan join), dan bisa ditambah perintah lewat script. Nggak ada server, nggak ada akun tambahan — semua di HP ini.',
        tombol('btnRepo', 'Buka repo di GitHub', 'TombolLembut', 'ic_tautan'))
    lisensi = kartu('Lisensi', 'ic_perisai', None, '\n'.join([
        teks('tvLisensi', 'KetKartu', 6, '\n    android:textColor="@color/wr_teks"'),
        tombol('btnLisensi', 'Baca lisensi lengkap', 'TombolLembut', 'ic_daftar'),
    ]))
    pihak3 = kartu('Pakai karya orang lain', 'ic_daftar',
        'App ini berdiri di atas proyek open source berikut. Makasih banyak!',
        teks('tvPihakKetiga', 'KetKartu', 10, '\n    android:fontFamily="monospace"\n    android:textSize="12sp"\n    android:textColor="@color/wr_teks"'))
    privasi = kartu('Privasi', 'ic_kunci', None,
        teks('tvPrivasi', 'KetKartu', 6))
    return halaman('Tentang (AboutActivity): versi, lisensi, pihak ketiga.',
                   '\n\n'.join([bar_atas('Tentang'), kepala, apa, lisensi, pihak3, privasi]))


# ----------------------------------------------------------------- sambutan
def sambutan():
    def hal(id_, ikon, judul, isi, tampil):
        vis = '' if tampil else '\n    android:visibility="gone"'
        warna = '' if ikon == 'ic_logo' else '\n            android:tint="@color/wr_hijau_terang"'
        return f'''<LinearLayout
    android:id="@+id/{id_}"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:gravity="center_horizontal"
    android:orientation="vertical"{vis}>
    <FrameLayout
        android:layout_width="96dp"
        android:layout_height="96dp"
        android:layout_marginTop="40dp"
        android:background="@drawable/bg_logo">
        <ImageView
            android:layout_width="60dp"
            android:layout_height="60dp"
            android:layout_gravity="center"
            android:importantForAccessibility="no"
            android:src="@drawable/{ikon}"{warna} />
    </FrameLayout>
    <TextView
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_marginTop="24dp"
        android:gravity="center"
        android:text="{a(judul)}"
        android:textColor="@color/wr_teks"
        android:textSize="24sp"
        android:textStyle="bold" />
    <TextView
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_marginTop="14dp"
        android:background="@drawable/bg_kartu"
        android:lineSpacingExtra="5dp"
        android:padding="18dp"
        android:text="{a(isi)}"
        android:textColor="@color/wr_teks2"
        android:textSize="14.5sp" />
</LinearLayout>'''

    isi = '\n\n'.join([
        hal('hal1', 'ic_logo', 'Halo! 👋',
            'WA Release Bot = asisten WhatsApp yang jalan di HP lo sendiri.\n\n'
            '🚀  Rilis baru di GitHub → otomatis diposting ke channel\n'
            '🛡️  Jagain grup: approve yang minta join, tolak yang dulu udah keluar\n'
            '⌨️  Perintah !info / !rules / !menu + script buatan sendiri\n'
            '🔋  Tidur hampir sepanjang waktu — hemat batre', True),
        hal('hal2', 'ic_tautan', 'Cara pakainya',
            '1.  Tautkan WhatsApp (sekali aja) — pakai kode 8 huruf, nggak perlu HP kedua\n\n'
            '2.  Buka Setelan (ikon gerigi): isi repo / channel / link grup, pilih mode\n\n'
            '3.  Tekan Mulai. Udah — bot kerja sendiri di belakang.\n\n'
            'Di Xiaomi & sejenisnya: izinkan Autostart + batre "Tanpa batasan" biar nggak dimatiin sistem.', False),
        hal('hal3', 'ic_perisai', 'Sebelum mulai',
            '•  Bot login sebagai "perangkat tertaut" di akun WA lo — sama kayak WhatsApp Web.\n\n'
            '•  Semua data (sesi WA, setelan, log) cuma ada di HP ini. Nggak ada server.\n\n'
            '•  Ini alat tidak resmi, bukan buatan WhatsApp. Pakai secukupnya, jangan buat spam.\n\n'
            '•  Boleh dipakai & dilihat kodenya buat pribadi. Dilarang dijual / disebar ulang / di-rebrand tanpa izin — detailnya di Tentang → Lisensi.', False),
    ])

    bawah = '''<LinearLayout
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_gravity="bottom"
    android:background="#F20B141A"
    android:gravity="center_vertical"
    android:orientation="vertical"
    android:paddingStart="16dp"
    android:paddingTop="12dp"
    android:paddingEnd="16dp"
    android:paddingBottom="16dp">
    <TextView
        android:id="@+id/tvTitik"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:gravity="center"
        android:letterSpacing="0.3"
        android:text="●  ○  ○"
        android:textColor="@color/wr_hijau"
        android:textSize="12sp" />
    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_marginTop="12dp"
        android:orientation="horizontal">
        <TextView
            android:id="@+id/btnLewati"
            android:layout_width="0dp"
            android:layout_weight="1"
            style="@style/TombolLembut"
            android:text="Lewati" />
        <TextView
            android:id="@+id/btnLanjut"
            android:layout_width="0dp"
            android:layout_weight="2"
            android:layout_marginStart="10dp"
            style="@style/TombolUtama"
            android:text="Lanjut" />
    </LinearLayout>
</LinearLayout>'''
    return halaman('Sambutan (WelcomeActivity): 3 halaman, muncul sekali pas pertama buka.',
                   isi, bawah, pad_bawah=130, banner_bawah=130)


def tulis(nama, isi):
    p = os.path.join(ROOT, nama)
    with open(p, 'w', encoding='utf-8') as f:
        f.write(isi)
    print('ditulis', os.path.relpath(p))


if __name__ == '__main__':
    tulis('activity_main.xml', dashboard())
    tulis('activity_setelan.xml', setelan())
    tulis('activity_tentang.xml', tentang())
    tulis('activity_sambutan.xml', sambutan())
