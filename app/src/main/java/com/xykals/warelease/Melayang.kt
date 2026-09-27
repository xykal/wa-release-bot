package com.xykals.warelease

import android.animation.ValueAnimator
import android.content.Context
import android.view.animation.LinearInterpolator
import android.widget.FrameLayout
import android.widget.ImageView
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

/**
 * Lapisan elemen 3D yang melayang pelan (bulan, not balok, bubble chat, dll.).
 * Tiap elemen punya "kedalaman": yang jauh lebih kecil, lebih pudar, geraknya
 * lebih lambat, dan paralaks-nya lebih dikit waktu halaman digeser.
 *
 * Satu ValueAnimator buat semuanya (bukan satu per elemen) — enteng di HP kentang.
 */
class Melayang(ctx: Context) : FrameLayout(ctx) {

    /** posisi relatif (0..1), ukuran dp, kedalaman 0.3 (jauh)..1 (dekat) */
    data class Elemen(val gambar: Int, val x: Float, val y: Float, val ukuranDp: Int, val dalam: Float)

    private class Aktif(val v: ImageView, val e: Elemen, val fase: Float, val periode: Float)

    private val daftar = mutableListOf<Aktif>()
    private var animator: ValueAnimator? = null
    private var paralaks = 0f
    private val dens = resources.displayMetrics.density

    init {
        isClickable = false
        isFocusable = false
    }

    fun isi(elemen: List<Elemen>) {
        removeAllViews()
        daftar.clear()
        elemen.forEachIndexed { i, e ->
            val v = ImageView(context).apply {
                setImageResource(e.gambar)
                alpha = 0f
                scaleType = ImageView.ScaleType.FIT_CENTER
            }
            val px = (e.ukuranDp * dens).toInt()
            addView(v, LayoutParams(px, px))
            daftar += Aktif(v, e, fase = i * 1.37f, periode = 5200f + (1f - e.dalam) * 4200f + i * 390f)
            // muncul pelan-pelan, berurutan
            v.animate().alpha(0.35f + 0.6f * e.dalam).setStartDelay(150L + i * 120L).setDuration(900).start()
        }
    }

    /** Geser semua elemen sesuai posisi halaman (-1..n). */
    fun setParalaks(nilai: Float) {
        paralaks = nilai
    }

    fun mulai() {
        if (animator != null) return
        animator = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 60_000
            repeatCount = ValueAnimator.INFINITE
            interpolator = LinearInterpolator()
            addUpdateListener { tick() }
            start()
        }
    }

    fun berhenti() {
        animator?.cancel()
        animator = null
    }

    private var paralaksHalus = 0f

    private fun tick() {
        if (width == 0) return
        val t = android.os.SystemClock.uptimeMillis().toFloat()
        paralaksHalus += (paralaks - paralaksHalus) * 0.08f
        for (a in daftar) {
            val e = a.e
            val w = a.v.layoutParams.width
            val sudut = (t / a.periode) * 2f * PI.toFloat() + a.fase
            val ayunY = sin(sudut) * 14f * dens * (0.5f + e.dalam)
            val ayunX = cos(sudut * 0.7f) * 8f * dens * e.dalam
            val geser = -paralaksHalus * 70f * dens * e.dalam
            a.v.translationX = e.x * width - w / 2f + ayunX + geser
            a.v.translationY = e.y * height - w / 2f + ayunY
            a.v.rotation = sin(sudut * 0.8f) * 10f
        }
    }

    override fun onDetachedFromWindow() {
        berhenti()
        super.onDetachedFromWindow()
    }
}
