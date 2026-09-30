package com.xykals.warelease

import android.app.Activity
import android.app.Dialog
import android.content.Context
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

/**
 * Komponen dialog buatan sendiri (res/layout/lembar.xml) yang dipakai layar
 * utama. Nggak pakai Material/AlertDialog supaya tampilannya konsisten dengan
 * tombol dan kartu yang juga dibuat manual. Dipisah dari MainActivity supaya
 * dialog QR, pairing code, dan daftar hitam bisa tinggal di file sendiri.
 */
internal enum class Gaya { UTAMA, GARIS, LEMBUT, BAHAYA }

internal class Tombol(
    val teks: String,
    val gaya: Gaya,
    val tutup: Boolean = true,
    val aksi: (() -> Unit)? = null
)

internal fun Context.dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

/**
 * EditText yang dibuat dari kode. Konstruktor 4 argumen dengan defStyleAttr = 0
 * melewati tema editTextStyle, jadi focusableInTouchMode/clickable bawaan
 * Widget.EditText hilang dan kotaknya nggak bereaksi disentuh (layar Repo dan
 * konsol Hosting di HP kall, 2026-09-30). Isi ulang atributnya di sini.
 */
internal fun Context.isianBaru(): EditText = EditText(this, null, 0, R.style.Isian).apply {
    isFocusable = true
    isFocusableInTouchMode = true
    isClickable = true
    isLongClickable = true
    isCursorVisible = true
}

/**
 * Gulir kotak log ke bawah tanpa memindahkan fokus. ScrollView.fullScroll()
 * memanggil requestFocus(), sehingga ScrollView induk ikut menggulir ke kotak log
 * dan keyboard tertutup tiap log bertambah. Panggil dengan hasil
 * `!canScrollVertically(1)` yang diambil SEBELUM teks diganti: cuma menggulir kalau
 * pengguna memang sedang di ujung bawah, yang lagi baca log lama nggak ditarik.
 */
internal fun ScrollView.ikutKeBawah(sebelumnyaDiBawah: Boolean) {
    if (!sebelumnyaDiBawah) return
    post { scrollTo(0, getChildAt(0)?.height ?: 0) } // ScrollView.scrollTo sudah membatasi ke rentang
}

/** Tampilkan lembar; tombol ditumpuk vertikal, yang `tutup = true` menutup dialog setelah aksinya. */
internal fun Activity.lembar(judul: String, pesan: String, isi: View?, vararg tombol: Tombol): Dialog {
    val d = Dialog(this, R.style.Lembar)
    val akar = LayoutInflater.from(this).inflate(R.layout.lembar, null)
    akar.findViewById<TextView>(R.id.lbJudul).text = judul
    akar.findViewById<TextView>(R.id.lbPesan).text = pesan
    val wadahIsi = akar.findViewById<FrameLayout>(R.id.lbIsi)
    if (isi != null) wadahIsi.addView(isi) else wadahIsi.visibility = View.GONE

    val wadahTombol = akar.findViewById<LinearLayout>(R.id.lbTombol)
    tombol.forEachIndexed { i, t ->
        val gayaRes = when (t.gaya) {
            Gaya.UTAMA -> R.style.TombolUtama
            Gaya.GARIS -> R.style.TombolGaris
            Gaya.LEMBUT -> R.style.TombolLembut
            Gaya.BAHAYA -> R.style.TombolBahaya
        }
        val v = TextView(this, null, 0, gayaRes).apply {
            text = t.teks
            setOnClickListener {
                try {
                    t.aksi?.invoke()
                } catch (e: Throwable) {
                    LogRecorder.galat("Lembar", "tombol \"${t.teks}\" gagal", e)
                }
                if (t.tutup) d.dismiss()
            }
        }
        val lp = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(50))
        if (i > 0) lp.topMargin = dp(8)
        wadahTombol.addView(v, lp)
    }

    d.setContentView(akar)
    d.window?.setLayout(
        (resources.displayMetrics.widthPixels * 0.92).toInt(),
        ViewGroup.LayoutParams.WRAP_CONTENT
    )
    d.show()
    return d
}
