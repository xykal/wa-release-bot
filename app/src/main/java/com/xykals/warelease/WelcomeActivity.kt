package com.xykals.warelease

import android.os.Bundle
import android.view.View
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity

/**
 * Layar sambutan: 3 halaman singkat (apa ini, cara pakai, sebelum mulai).
 * Muncul sekali pas app pertama dibuka; bisa dibuka lagi dari Setelan → Tentang.
 */
class WelcomeActivity : AppCompatActivity() {

    private lateinit var halaman: List<View>
    private lateinit var tvTitik: TextView
    private lateinit var btnLanjut: TextView
    private lateinit var btnLewati: TextView
    private var posisi = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_sambutan)
        halaman = listOf(findViewById(R.id.hal1), findViewById(R.id.hal2), findViewById(R.id.hal3))
        tvTitik = findViewById(R.id.tvTitik)
        btnLanjut = findViewById(R.id.btnLanjut)
        btnLewati = findViewById(R.id.btnLewati)
        val banner = Banner(findViewById(R.id.tvBanner))

        pasangTombol(R.id.btnLanjut, "Sambutan: lanjut", { banner.tampil(it) }) {
            if (posisi < halaman.lastIndex) tampil(posisi + 1) else selesai()
        }
        pasangTombol(R.id.btnLewati, "Sambutan: lewati/kembali", { banner.tampil(it) }) {
            if (posisi == 0) selesai() else tampil(posisi - 1)
        }
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (posisi > 0) tampil(posisi - 1) else selesai()
            }
        })
        tampil(savedInstanceState?.getInt("posisi") ?: 0)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        outState.putInt("posisi", posisi)
    }

    private fun tampil(i: Int) {
        posisi = i.coerceIn(0, halaman.lastIndex)
        halaman.forEachIndexed { k, v ->
            if (k == posisi) {
                v.alpha = 0f
                v.visibility = View.VISIBLE
                v.animate().alpha(1f).setDuration(220).start()
            } else {
                v.visibility = View.GONE
            }
        }
        tvTitik.text = halaman.indices.joinToString("  ") { if (it == posisi) "●" else "○" }
        btnLanjut.text = if (posisi == halaman.lastIndex) "Mulai pakai" else "Lanjut"
        btnLewati.text = if (posisi == 0) "Lewati" else "Kembali"
        findViewById<ScrollView>(R.id.svUtama).scrollTo(0, 0)
    }

    private fun selesai() {
        SettingsStore(this).sambutanSelesai = true
        LogRecorder.tulis("Sambutan", "selesai")
        finish()
    }
}
