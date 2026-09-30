package com.xykals.warelease

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.graphics.drawable.GradientDrawable
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.animation.DecelerateInterpolator
import android.view.animation.OvershootInterpolator
import android.widget.EditText
import kotlin.math.hypot
import kotlin.math.max

/**
 * Efek "denyut" buat semua yang bisa dipencet:
 *  - pas ditekan: mengecil dikit + getar halus
 *  - pas dilepas: mantul balik (overshoot) + lingkaran cahaya nyebar dari
 *    titik yang dipencet
 *
 * Listener sentuhnya selalu balikin `false`, jadi onClick bawaan tetap jalan.
 */
object Denyut {

    /** Pasang ke semua view yang bisa diklik di dalam [akar] (rekursif). */
    fun pasangSemua(akar: View) {
        if (akar is EditText) return
        if (akar.isClickable && akar.hasOnClickListeners()) pasang(akar)
        if (akar is ViewGroup) for (i in 0 until akar.childCount) pasangSemua(akar.getChildAt(i))
    }

    @SuppressLint("ClickableViewAccessibility")
    fun pasang(v: View, skala: Float = 0.94f) {
        if (v.getTag(R.id.tag_denyut) == true) return
        v.setTag(R.id.tag_denyut, true)
        v.setOnTouchListener { view, e ->
            when (e.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    view.animate().scaleX(skala).scaleY(skala).setDuration(90)
                        .setInterpolator(DecelerateInterpolator()).start()
                    view.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY)
                }
                MotionEvent.ACTION_UP -> {
                    lepas(view)
                    if (view.isEnabled) riak(view, e.x, e.y)
                }
                MotionEvent.ACTION_CANCEL -> lepas(view)
            }
            false
        }
    }

    private fun lepas(view: View) {
        view.animate().scaleX(1f).scaleY(1f).setDuration(380)
            .setInterpolator(OvershootInterpolator(4f)).start()
    }

    /** Lingkaran cahaya yang membesar & memudar (digambar di overlay view). */
    fun riak(view: View, x: Float = view.width / 2f, y: Float = view.height / 2f) {
        val w = view.width
        val h = view.height
        if (w == 0 || h == 0) return
        val maks = hypot(max(x, w - x), max(y, h - y))
        val d = GradientDrawable().apply {
            shape = GradientDrawable.OVAL
            setColor(0x55FFFFFF)
        }
        view.overlay.add(d)
        ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 480
            interpolator = DecelerateInterpolator(1.6f)
            addUpdateListener {
                val f = it.animatedValue as Float
                val r = (maks * f).toInt()
                d.setBounds((x - r).toInt(), (y - r).toInt(), (x + r).toInt(), (y + r).toInt())
                d.alpha = ((1f - f) * 170).toInt()
            }
            addListener(object : AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: Animator) {
                    view.overlay.remove(d)
                }
            })
            start()
        }
    }

    /** Denyut pelan terus-menerus (buat tombol utama yang "ngajak" dipencet). */
    fun napas(v: View): ValueAnimator =
        ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 1600
            repeatCount = ValueAnimator.INFINITE
            repeatMode = ValueAnimator.REVERSE
            interpolator = android.view.animation.AccelerateDecelerateInterpolator()
            addUpdateListener {
                if (v.isPressed) return@addUpdateListener
                val s = 1f + 0.035f * (it.animatedValue as Float)
                v.scaleX = s
                v.scaleY = s
            }
            start()
        }

    /** Kartu-kartu muncul satu-satu dari bawah (dipanggil sekali pas layar dibuka). */
    fun munculBerurutan(wadah: ViewGroup, jeda: Long = 55L) {
        val geser = 28f * wadah.resources.displayMetrics.density
        var urut = 0
        for (i in 0 until wadah.childCount) {
            val c = wadah.getChildAt(i)
            // Anak yang disembunyiin (tab lain di layout utama) nggak usah
            // dianimasikan - kalau ikut, dia "muncul" di tab yang salah.
            if (c.visibility != View.VISIBLE) continue
            c.alpha = 0f
            c.translationY = geser
            c.animate().alpha(1f).translationY(0f)
                .setStartDelay(80L + urut * jeda).setDuration(420)
                .setInterpolator(DecelerateInterpolator(2f)).start()
            urut++
        }
    }
}
