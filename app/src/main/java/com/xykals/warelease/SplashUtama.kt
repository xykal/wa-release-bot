package com.xykals.warelease

import android.app.Activity
import android.os.Handler
import android.view.View
import android.view.ViewGroup
import android.widget.ScrollView
import android.widget.TextView

/**
 * Splash layar utama: animasi morph (MorphView) nutupin layar sampai app
 * beneran siap — UI udah kegambar dan, kalau service nyala, status engine
 * udah nyampe. Minimal 1,6 dtk biar animasinya sempat kelihatan, maksimal
 * 4,5 dtk supaya nggak kerasa nge-hang.
 */
internal class SplashUtama(
    private val a: Activity,
    private val handler: Handler,
    private val uiSiap: () -> Boolean
) {
    private var mulaiPada = 0L
    private val label = arrayOf(
        R.string.u_bot_penjaga_siap, R.string.k_ngobrol_di_grup, R.string.k_lagu_buat_channel, R.string.k_semua_jalan_otomatis
    )

    private val cek = object : Runnable {
        override fun run() {
            val lama = System.currentTimeMillis() - mulaiPada
            val service = BotService.instance
            val siap = uiSiap() && (service == null || BotBus.ui.serviceRunning)
            if ((lama >= 1600 && siap) || lama >= 4500) tutup() else handler.postDelayed(this, 100)
        }
    }

    fun mulai() {
        val splash = a.findViewById<View>(R.id.splash)
        val tvLabel = a.findViewById<TextView>(R.id.tvSplashLabel)
        splash.visibility = View.VISIBLE
        splash.alpha = 1f
        mulaiPada = System.currentTimeMillis()
        LogRecorder.tulis("Activity", "splash tampil")
        val gelembung = a.findViewById<View>(R.id.gelembungSplash)
        gelembung.pivotY = 0f
        a.findViewById<MorphView>(R.id.morph).onGantiBentuk = { i ->
            // gelembung "pop" kayak chat baru masuk, tulisannya ganti di tengah pop
            gelembung.animate().cancel()
            gelembung.pivotX = gelembung.width / 2f
            gelembung.animate().scaleX(0.86f).scaleY(0.86f).alpha(0.4f).setDuration(110)
                .setInterpolator(android.view.animation.AccelerateInterpolator())
                .withEndAction {
                    tvLabel.text = a.getString(label[i % label.size])
                    gelembung.animate().scaleX(1f).scaleY(1f).alpha(1f).setDuration(260)
                        .setInterpolator(android.view.animation.OvershootInterpolator(2.2f)).start()
                }.start()
        }
        handler.postDelayed(cek, 100)
    }

    private fun tutup() {
        val splash = a.findViewById<View>(R.id.splash)
        if (splash.visibility != View.VISIBLE) return
        LogRecorder.tulis("Activity", "splash selesai (${System.currentTimeMillis() - mulaiPada} ms)")
        splash.animate().alpha(0f).scaleX(1.06f).scaleY(1.06f).setDuration(320).withEndAction {
            splash.visibility = View.GONE
            a.findViewById<MorphView>(R.id.morph).onGantiBentuk = null
        }.start()
        (a.findViewById<ScrollView>(R.id.svUtama).getChildAt(0) as? ViewGroup)?.let { Denyut.munculBerurutan(it) }
    }

    fun hancurkan() {
        handler.removeCallbacks(cek)
    }
}
