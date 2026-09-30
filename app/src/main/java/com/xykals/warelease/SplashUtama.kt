package com.xykals.warelease

import android.app.Activity
import android.os.Handler
import android.view.View
import android.view.animation.AccelerateInterpolator
import android.view.animation.DecelerateInterpolator
import android.view.animation.OvershootInterpolator
import android.widget.TextView

/**
 * Splash layar utama: nutupin layar sampai app beneran siap — UI udah kegambar
 * dan, kalau service nyala, status engine udah nyampe. Minimal 1,6 dtk biar
 * animasinya sempat kelihatan, maksimal 4,5 dtk supaya nggak kerasa nge-hang.
 *
 * Adegannya (dari belakang ke depan):
 * 1. [PartikelView] — cahaya hijau berdenyut, cincin melebar, bintang berkedip,
 *    bintang jatuh.
 * 2. [MorphView] — logo yang ganti-ganti bentuk, masuk dengan mantul halus.
 * 3. Gelembung chat yang "pop" tiap ganti bentuk.
 * 4. Brand XyVerse Technology Global yang hurufnya merenggang pelan.
 *
 * Voice over (sekali setelah pasang, kalau saklarnya nyala dan HP nggak
 * senyap) ada di [SuaraSplash].
 */
internal class SplashUtama(
    private val a: Activity,
    private val handler: Handler,
    private val settings: SettingsStore,
    private val uiSiap: () -> Boolean,
    // Animasi kartu masuk; yang dikasih MainActivity = kartu tab yang lagi kebuka.
    private val animasiMasuk: () -> Unit
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
        val d = a.resources.displayMetrics.density

        // 1. latar partikel
        a.findViewById<PartikelView>(R.id.partikel).mulai()

        // 2. logo: masuk dari kecil + mantul, bukan nongol gitu aja
        val morph = a.findViewById<MorphView>(R.id.morph)
        morph.animate().cancel()
        morph.scaleX = 0.68f
        morph.scaleY = 0.68f
        morph.rotation = -8f
        morph.alpha = 0f
        morph.animate()
            .scaleX(1f).scaleY(1f).rotation(0f).alpha(1f)
            .setDuration(760)
            .setInterpolator(OvershootInterpolator(1.7f))
            .start()

        // 3. gelembung chat: ikut naik dari bawah, lalu "pop" tiap ganti bentuk
        val gelembung = a.findViewById<View>(R.id.gelembungSplash)
        gelembung.pivotY = 0f
        gelembung.alpha = 0f
        gelembung.translationY = 18f * d
        gelembung.animate().alpha(1f).translationY(0f)
            .setStartDelay(380).setDuration(420)
            .setInterpolator(DecelerateInterpolator(2f)).start()
        morph.onGantiBentuk = { i ->
            gelembung.animate().cancel()
            gelembung.pivotX = gelembung.width / 2f
            gelembung.animate().scaleX(0.86f).scaleY(0.86f).alpha(0.4f).setDuration(110)
                .setInterpolator(AccelerateInterpolator())
                .withEndAction {
                    tvLabel.text = a.getString(label[i % label.size])
                    gelembung.animate().scaleX(1f).scaleY(1f).alpha(1f).setDuration(260)
                        .setInterpolator(OvershootInterpolator(2.2f)).start()
                }.start()
        }

        // 4. brand di bawah: muncul pelan, hurufnya merenggang (letterSpacing turun)
        val wadahBrand = a.findViewById<View>(R.id.wadahBrandSplash)
        val tvBrand = a.findViewById<TextView>(R.id.tvBrandSplash)
        wadahBrand.alpha = 0f
        wadahBrand.animate().alpha(1f).setStartDelay(520).setDuration(520).start()
        val renggang = android.animation.ValueAnimator.ofFloat(0.52f, 0.22f).apply {
            duration = 1400
            startDelay = 520
            interpolator = DecelerateInterpolator(1.6f)
            addUpdateListener { tvBrand.letterSpacing = it.animatedValue as Float }
            start()
        }
        tvBrand.tag = renggang

        // 5. voice over: sekali setelah pasang (lihat SuaraSplash)
        handler.postDelayed({ SuaraSplash.putar(a, settings) }, 320)

        handler.postDelayed(cek, 100)
    }

    private fun tutup() {
        val splash = a.findViewById<View>(R.id.splash)
        if (splash.visibility != View.VISIBLE) return
        LogRecorder.tulis("Activity", "splash selesai (${System.currentTimeMillis() - mulaiPada} ms)")
        a.findViewById<PartikelView>(R.id.partikel).berhenti()
        splash.animate().alpha(0f).scaleX(1.06f).scaleY(1.06f).setDuration(320).withEndAction {
            splash.visibility = View.GONE
            a.findViewById<MorphView>(R.id.morph).onGantiBentuk = null
        }.start()
        animasiMasuk()
    }

    fun hancurkan() {
        handler.removeCallbacks(cek)
        a.findViewById<PartikelView>(R.id.partikel)?.berhenti()
        (a.findViewById<TextView>(R.id.tvBrandSplash)?.tag as? android.animation.ValueAnimator)?.cancel()
        SuaraSplash.hentikan()
    }
}
