package com.xykals.warelease

import android.animation.ValueAnimator
import android.content.Intent
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.view.GestureDetector
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.animation.DecelerateInterpolator
import android.view.animation.OvershootInterpolator
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import kotlin.math.abs

/**
 * Layar sambutan: 4 halaman, ilustrasi 3D (dibikin AI, bukan emoji), elemen
 * yang melayang dengan paralaks, transisi mantul, titik indikator yang
 * memanjang, tombol yang "bernapas". Bisa digeser (swipe) atau pencet Lanjut.
 */
class OnboardingActivity : AppCompatActivity() {

    private data class Halaman(val gambar: Int, val judul: String, val isi: String)

    private val halaman = listOf(
        Halaman(
            R.drawable.ilus_rilis,
            "Rilis baru, langsung ke channel",
            "Tiap ada rilis baru di GitHub, bot ngabarin channel WhatsApp lo otomatis. Lo tinggal fokus ngoding."
        ),
        Halaman(
            R.drawable.ilus_grup,
            "Grup aman tanpa ribet",
            "Yang minta join di-approve otomatis. Yang dulu cabut atau dikick? Ditolak sama bot, lo nggak usah jagain."
        ),
        Halaman(
            R.drawable.ilus_lagu,
            "Lagu lama, pas lagi mood",
            "Sesekali bot ngirim potongan lagu jadul plus kata-kata kece ke channel. Nggak spam — cuma pas lagi mood."
        ),
        Halaman(
            R.drawable.ilus_hosting,
            "HP lo jadi hosting bot",
            "Punya project bot sendiri? Upload ZIP-nya, app ini yang jalanin. Log, input, restart — semua dari HP."
        ),
    )

    private var posisi = 0
    private var sibuk = false

    private lateinit var melayang: Melayang
    private lateinit var ivIlus: ImageView
    private lateinit var tvJudul: TextView
    private lateinit var tvIsi: TextView
    private lateinit var btnLanjut: TextView
    private lateinit var btnLewati: TextView
    private lateinit var wadahTitik: LinearLayout
    private lateinit var cahaya: View
    private var ayunIlus: ValueAnimator? = null
    private var napas: ValueAnimator? = null

    private fun dp(v: Float) = v * resources.displayMetrics.density
    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()
    private fun warna(id: Int) = ContextCompat.getColor(this, id)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        LogRecorder.init(this)
        LogRecorder.tulis("Activity", "Sambutan dibuka")

        val akar = FrameLayout(this).apply { setBackgroundColor(warna(R.color.wr_latar)) }

        // cahaya lembut di belakang ilustrasi
        cahaya = View(this).apply {
            background = GradientDrawable().apply {
                gradientType = GradientDrawable.RADIAL_GRADIENT
                gradientRadius = dp(220f)
                colors = intArrayOf(0x3300A884, 0x0000A884)
            }
        }
        akar.addView(cahaya, FrameLayout.LayoutParams(dp(440), dp(440), Gravity.CENTER_HORIZONTAL).apply {
            topMargin = dp(40)
        })

        melayang = Melayang(this)
        melayang.isi(
            listOf(
                Melayang.Elemen(R.drawable.melayang_bulan, 0.84f, 0.10f, 58, 0.9f),
                Melayang.Elemen(R.drawable.melayang_nada, 0.12f, 0.16f, 44, 0.7f),
                Melayang.Elemen(R.drawable.melayang_chat, 0.88f, 0.50f, 50, 0.6f),
                Melayang.Elemen(R.drawable.melayang_bintang, 0.18f, 0.47f, 30, 0.45f),
                Melayang.Elemen(R.drawable.melayang_perisai, 0.10f, 0.70f, 40, 0.5f),
                Melayang.Elemen(R.drawable.melayang_kode, 0.86f, 0.74f, 42, 0.35f),
                Melayang.Elemen(R.drawable.melayang_bintang, 0.60f, 0.06f, 20, 0.3f),
            )
        )
        akar.addView(melayang, FrameLayout.LayoutParams(-1, -1))

        val isi = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(24), dp(16), dp(24), dp(24))
        }

        btnLewati = TextView(this).apply {
            text = "Lewati"
            setTextColor(warna(R.color.wr_teks2))
            textSize = 14f
            setPadding(dp(14), dp(10), dp(14), dp(10))
            setOnClickListener { selesai() }
        }
        isi.addView(btnLewati, LinearLayout.LayoutParams(-2, -2).apply { gravity = Gravity.END })

        val lebarIlus = (resources.displayMetrics.widthPixels * 0.80f).toInt().coerceAtMost(dp(360))
        ivIlus = ImageView(this).apply { scaleType = ImageView.ScaleType.FIT_CENTER }
        isi.addView(ivIlus, LinearLayout.LayoutParams(lebarIlus, lebarIlus).apply { topMargin = dp(4) })

        isi.addView(View(this), LinearLayout.LayoutParams(1, 0, 1f))

        tvJudul = TextView(this).apply {
            setTextColor(warna(R.color.wr_teks))
            textSize = 25f
            typeface = Typeface.create("sans-serif", Typeface.BOLD)
            gravity = Gravity.CENTER
        }
        isi.addView(tvJudul, LinearLayout.LayoutParams(-1, -2))

        tvIsi = TextView(this).apply {
            setTextColor(warna(R.color.wr_teks2))
            textSize = 15f
            gravity = Gravity.CENTER
            setLineSpacing(dp(3f), 1f)
        }
        isi.addView(tvIsi, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(10) })

        wadahTitik = LinearLayout(this).apply { gravity = Gravity.CENTER }
        halaman.indices.forEach { _ ->
            wadahTitik.addView(View(this), LinearLayout.LayoutParams(dp(8), dp(8)).apply {
                marginStart = dp(4); marginEnd = dp(4)
            })
        }
        isi.addView(wadahTitik, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(26) })

        btnLanjut = TextView(this, null, 0, R.style.TombolUtama).apply {
            setOnClickListener { if (posisi < halaman.lastIndex) pindah(posisi + 1) else selesai() }
        }
        isi.addView(btnLanjut, LinearLayout.LayoutParams(-1, dp(54)).apply { topMargin = dp(26) })

        akar.addView(isi, FrameLayout.LayoutParams(-1, -1))
        setContentView(akar)

        // geser kiri/kanan
        val gestur = GestureDetector(this, object : GestureDetector.SimpleOnGestureListener() {
            override fun onDown(e: MotionEvent) = true
            override fun onFling(e1: MotionEvent?, e2: MotionEvent, vx: Float, vy: Float): Boolean {
                val dx = e2.x - (e1?.x ?: e2.x)
                if (abs(dx) < dp(50f) || abs(vx) < abs(vy)) return false
                if (dx < 0 && posisi < halaman.lastIndex) pindah(posisi + 1)
                else if (dx > 0 && posisi > 0) pindah(posisi - 1)
                return true
            }
        })
        isi.setOnTouchListener { _, e -> gestur.onTouchEvent(e); true }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (posisi > 0) pindah(posisi - 1) else finish()
            }
        })

        Denyut.pasang(btnLanjut, 0.95f)
        Denyut.pasang(btnLewati)
        tampilkan(0, masuk = true, arah = 1)
    }

    override fun onResume() {
        super.onResume()
        melayang.mulai()
        mulaiAyun()
        if (napas == null) napas = Denyut.napas(btnLanjut)
    }

    override fun onPause() {
        melayang.berhenti()
        ayunIlus?.cancel(); ayunIlus = null
        napas?.cancel(); napas = null
        super.onPause()
    }

    /** Ilustrasi naik-turun pelan kayak ngambang. */
    private fun mulaiAyun() {
        ayunIlus?.cancel()
        ayunIlus = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 2600
            repeatCount = ValueAnimator.INFINITE
            repeatMode = ValueAnimator.REVERSE
            interpolator = android.view.animation.AccelerateDecelerateInterpolator()
            addUpdateListener {
                if (!sibuk) ivIlus.translationY = -dp(9f) * (it.animatedValue as Float)
                cahaya.scaleX = 0.94f + 0.08f * (it.animatedValue as Float)
                cahaya.scaleY = cahaya.scaleX
            }
            start()
        }
    }

    private fun pindah(ke: Int) {
        if (sibuk || ke == posisi) return
        sibuk = true
        val arah = if (ke > posisi) 1 else -1
        val jauh = dp(70f) * arah
        ivIlus.animate().alpha(0f).translationX(-jauh).scaleX(0.86f).scaleY(0.86f).rotation(-6f * arah)
            .setDuration(200).setInterpolator(DecelerateInterpolator()).start()
        tvJudul.animate().alpha(0f).translationY(-dp(10f)).setDuration(160).start()
        tvIsi.animate().alpha(0f).translationY(-dp(10f)).setDuration(160).withEndAction {
            tampilkan(ke, masuk = false, arah = arah)
        }.start()
    }

    private fun tampilkan(i: Int, masuk: Boolean, arah: Int) {
        posisi = i
        val h = halaman[i]
        ivIlus.setImageResource(h.gambar)
        tvJudul.text = h.judul
        tvIsi.text = h.isi
        btnLanjut.text = if (i == halaman.lastIndex) "Mulai sekarang" else "Lanjut"
        btnLewati.animate().alpha(if (i == halaman.lastIndex) 0f else 1f).setDuration(200).start()
        btnLewati.isEnabled = i != halaman.lastIndex
        melayang.setParalaks(i.toFloat())

        // ilustrasi masuk dari arah geseran, mantul dikit
        ivIlus.alpha = 0f
        ivIlus.translationX = dp(70f) * arah
        ivIlus.scaleX = if (masuk) 0.7f else 0.86f
        ivIlus.scaleY = ivIlus.scaleX
        ivIlus.rotation = 6f * arah
        ivIlus.animate().alpha(1f).translationX(0f).scaleX(1f).scaleY(1f).rotation(0f)
            .setStartDelay(if (masuk) 150 else 0).setDuration(520)
            .setInterpolator(OvershootInterpolator(1.4f))
            .withEndAction { sibuk = false }.start()

        listOf(tvJudul, tvIsi).forEachIndexed { k, v ->
            v.alpha = 0f
            v.translationY = dp(18f)
            v.animate().alpha(1f).translationY(0f).setStartDelay(120L + k * 90L + if (masuk) 200 else 0)
                .setDuration(420).setInterpolator(DecelerateInterpolator(2f)).start()
        }
        aturTitik()
    }

    /** Titik aktif memanjang jadi kapsul hijau, yang lain balik jadi bulet abu. */
    private fun aturTitik() {
        for (k in 0 until wadahTitik.childCount) {
            val v = wadahTitik.getChildAt(k)
            val aktif = k == posisi
            v.background = GradientDrawable().apply {
                cornerRadius = dp(8f)
                setColor(if (aktif) warna(R.color.wr_hijau_terang) else 0xFF33434C.toInt())
            }
            val lp = v.layoutParams as ViewGroup.LayoutParams
            val dari = lp.width
            val ke = dp(if (aktif) 26 else 8)
            if (dari == ke) continue
            ValueAnimator.ofInt(dari, ke).apply {
                duration = 320
                interpolator = OvershootInterpolator(2f)
                addUpdateListener {
                    lp.width = it.animatedValue as Int
                    v.layoutParams = lp
                }
                start()
            }
        }
    }

    private fun selesai() {
        SettingsStore(this).sudahSambutan = true
        LogRecorder.tulis("Activity", "Sambutan selesai")
        startActivity(Intent(this, MainActivity::class.java))
        @Suppress("DEPRECATION")
        overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out)
        finish()
    }
}
