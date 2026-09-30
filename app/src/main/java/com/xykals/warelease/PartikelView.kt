package com.xykals.warelease

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.RadialGradient
import android.graphics.Shader
import android.util.AttributeSet
import android.view.View
import android.view.animation.LinearInterpolator
import kotlin.math.min
import kotlin.math.sin
import kotlin.random.Random

/**
 * Latar splash: cahaya hijau yang berdenyut, cincin yang melebar, bintang
 * berkedip, dan beberapa bintang jatuh. Semuanya digambar di Canvas (tanpa
 * animasi XML, tanpa library baru) supaya tetap enteng di HP 2 GB dan tidak
 * nambah dependensi.
 *
 * Animasi jalan cuma selama view-nya dipakai: [mulai] pas splash tampil,
 * [berhenti] pas splash ditutup. Kalau tidak dihentikan, animator-nya bakal
 * jalan terus walau view-nya nggak kelihatan.
 */
class PartikelView @JvmOverloads constructor(
    ctx: Context,
    attrs: AttributeSet? = null,
    defStyle: Int = 0
) : View(ctx, attrs, defStyle) {

    private class Bintang(
        val x: Float,
        val y: Float,
        val r: Float,
        val fase: Float,
        val laju: Float,
        val hijau: Boolean
    )

    private class Jatuh(val fase: Float, val laju: Float, val ekor: Float)

    private val acak = Random(13)
    private val bintang = ArrayList<Bintang>(56)
    private val jatuh = ArrayList<Jatuh>(3)

    private val catBintang = Paint(Paint.ANTI_ALIAS_FLAG)
    private val catGlow = Paint(Paint.ANTI_ALIAS_FLAG)
    private val catCincin = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val catJatuh = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        strokeCap = Paint.Cap.ROUND
        strokeWidth = 2f * resources.displayMetrics.density
    }

    private var t = 0f
    private val anim = ValueAnimator.ofFloat(0f, 1f).apply {
        duration = 5200
        repeatCount = ValueAnimator.INFINITE
        interpolator = LinearInterpolator()
        addUpdateListener {
            t = it.animatedValue as Float
            invalidate()
        }
    }

    /** Dipanggil pas splash kelihatan. */
    fun mulai() {
        if (!anim.isStarted) anim.start()
    }

    /** Dipanggil pas splash ditutup, biar baterai nggak dikuras animasi tak terlihat. */
    fun berhenti() {
        anim.cancel()
        t = 0f
    }

    /** 0 = bebas partikel, 1 = penuh. Dipakai pas splash muncul. */
    fun aturIntensitas(p: Float) {
        intensitas = p.coerceIn(0f, 1f)
        invalidate()
    }

    private var intensitas = 1f

    override fun onSizeChanged(w: Int, h: Int, wLama: Int, hLama: Int) {
        super.onSizeChanged(w, h, wLama, hLama)
        val d = resources.displayMetrics.density
        val pusat = h * 0.42f

        // cahaya hijau di belakang animasi morph
        catGlow.shader = RadialGradient(
            w / 2f, pusat, min(w, h) * 0.62f,
            intArrayOf(0x3325D366, 0x1A00A884, Color.TRANSPARENT),
            floatArrayOf(0f, 0.45f, 1f),
            Shader.TileMode.CLAMP
        )
        catCincin.strokeWidth = 1.6f * d

        // bintang: posisi acak tapi tetap (seed tetap) supaya nggak "melompat"
        bintang.clear()
        repeat(56) {
            bintang.add(
                Bintang(
                    x = acak.nextFloat() * w,
                    y = acak.nextFloat() * h,
                    r = (0.7f + acak.nextFloat() * 1.7f) * d,
                    fase = acak.nextFloat(),
                    laju = 0.4f + acak.nextFloat() * 1.1f,
                    hijau = acak.nextFloat() < 0.35f
                )
            )
        }
        jatuh.clear()
        repeat(3) { i ->
            jatuh.add(
                Jatuh(
                    fase = i * 0.37f + acak.nextFloat() * 0.1f,
                    laju = 0.5f + acak.nextFloat() * 0.35f,
                    ekor = (60f + acak.nextFloat() * 90f) * d
                )
            )
        }
    }

    override fun onDraw(canvas: Canvas) {
        val w = width.toFloat()
        val h = height.toFloat()
        if (w <= 0f || h <= 0f) return
        val duaPi = (2 * Math.PI).toFloat()
        val napas = 0.62f + 0.38f * sin(t * duaPi)

        // 1. cahaya yang berdenyut pelan
        catGlow.alpha = (150 * napas * intensitas).toInt().coerceIn(0, 255)
        canvas.drawRect(0f, 0f, w, h, catGlow)

        // 2. cincin melebar dari tengah (dua lapis, beda fase)
        val pusatX = w / 2f
        val pusatY = h * 0.42f
        val rMaks = min(w, h) * 0.62f
        for (i in 0..1) {
            val p = ((t * 1.35f) + i * 0.5f) % 1f
            catCincin.color = Color.WHITE
            catCincin.alpha = ((1f - p) * 46 * intensitas).toInt().coerceIn(0, 255)
            canvas.drawCircle(pusatX, pusatY, rMaks * (0.16f + p * 0.84f), catCincin)
        }

        // 3. bintang berkedip
        for (b in bintang) {
            val kedip = 0.22f + 0.78f * (0.5f + 0.5f * sin((t * b.laju + b.fase) * duaPi))
            catBintang.color = if (b.hijau) 0xFF25D366.toInt() else 0xFFE9EDEF.toInt()
            catBintang.alpha = (kedip * 235 * intensitas).toInt().coerceIn(0, 255)
            canvas.drawCircle(b.x, b.y, b.r * (0.75f + 0.5f * kedip), catBintang)
        }

        // 4. bintang jatuh (garis ekor yang memudar di ujungnya)
        for (j in jatuh) {
            val p = ((t * j.laju) + j.fase) % 1f
            val x = w * (0.08f + p * 0.9f)
            val y = h * (0.06f + p * 0.62f)
            val x0 = x - j.ekor
            val y0 = y - j.ekor * 0.55f
            catJatuh.shader = LinearGradient(
                x0, y0, x, y,
                Color.TRANSPARENT, 0xCCFFFFFF.toInt(),
                Shader.TileMode.CLAMP
            )
            catJatuh.alpha = (sin(p * Math.PI.toFloat()) * 220 * intensitas).toInt().coerceIn(0, 255)
            canvas.drawLine(x0, y0, x, y, catJatuh)
            // kepala bintangnya
            catBintang.color = Color.WHITE
            catBintang.alpha = (sin(p * Math.PI.toFloat()) * 230 * intensitas).toInt().coerceIn(0, 255)
            canvas.drawCircle(x, y, 1.8f * resources.displayMetrics.density, catBintang)
        }
    }
}
