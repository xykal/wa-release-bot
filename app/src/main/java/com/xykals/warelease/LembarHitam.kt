package com.xykals.warelease

import android.app.Activity
import android.app.Dialog
import android.util.TypedValue
import android.view.Gravity
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.ContextCompat

/**
 * Lembar daftar hitam penjaga grup: tiap orang yang dicatat bot ada tombol
 * "Buka blokir". Datanya datang dari engine (BotUi.daftarHitam), jadi lembar
 * ini digambar ulang tiap engine ngirim daftar baru selama masih tampil.
 */
internal class LembarHitam(
    private val a: Activity,
    private val banner: (String) -> Unit,
    private val kirim: (Map<String, Any>) -> Unit
) {
    private var dialog: Dialog? = null

    val sedangTampil: Boolean
        get() = dialog?.isShowing == true

    fun tampilkan(ui: BotUi) {
        try {
            dialog?.dismiss()
        } catch (_: Throwable) {
        }
        val tgl = java.text.SimpleDateFormat("d MMM yyyy", java.util.Locale("id", "ID"))
        val isi = LinearLayout(a).apply { orientation = LinearLayout.VERTICAL }

        fun teks(s: String, warna: Int, ukuran: Float) = TextView(a).apply {
            text = s
            setTextColor(ContextCompat.getColor(a, warna))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, ukuran)
        }

        if (ui.daftarHitam.isEmpty()) {
            isi.addView(teks(a.getString(R.string.k_nggak_ada_yang_diblokir_otomatis), R.color.wr_teks2, 14f))
        }
        ui.daftarHitam.forEachIndexed { i, o ->
            val baris = LinearLayout(a).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setBackgroundResource(R.drawable.bg_ubin)
                setPadding(a.dp(12), a.dp(10), a.dp(10), a.dp(10))
            }
            val kiri = LinearLayout(a).apply { orientation = LinearLayout.VERTICAL }
            // Baris 1: nama WA kalau kebaca, kalau nggak ya nomor penuhnya.
            // Nomor TIDAK lagi disamarkan/dipotong (kall 2026-10-04).
            val judulBaris = if (o.nama != null) "${i + 1}. ${o.nama}" else "${i + 1}. ${o.label}"
            kiri.addView(teks(judulBaris, R.color.wr_teks, 15f).apply { setTypeface(typeface, android.graphics.Typeface.BOLD) })
            if (o.nama != null) kiri.addView(teks(o.label, R.color.wr_teks2, 13f))
            kiri.addView(
                teks(
                    o.sejak?.let { a.getString(R.string.k_keluar_dikeluarin, tgl.format(java.util.Date(it))) } ?: a.getString(R.string.k_dicatat_bot),
                    R.color.wr_teks2, 12f
                )
            )
            baris.addView(kiri, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            val tombol = TextView(a, null, 0, R.style.TombolGaris).apply {
                text = a.getString(R.string.k_buka_blokir)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
                setPadding(a.dp(12), 0, a.dp(12), 0)
                setOnClickListener {
                    LogRecorder.tulis("Hitam", "buka blokir ${o.label}")
                    text = a.getString(R.string.k_membuka)
                    isEnabled = false
                    alpha = 0.55f
                    kirim(mapOf("type" to "hapus-hitam", "kunci" to o.kunci))
                    banner(a.getString(R.string.k_bisa_join_lagi_di_approve, o.label))
                }
            }
            baris.addView(tombol, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, a.dp(40)))
            val lp = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
            if (i > 0) lp.topMargin = a.dp(8)
            isi.addView(baris, lp)
        }
        if (ui.daftarHitamManual.isNotEmpty()) {
            val daftarManual = ui.daftarHitamManual.joinToString(", ")
            val t = teks(
                a.getString(R.string.k_diblokir_manual_kolom_selalu_tolak, daftarManual),
                R.color.wr_teks2, 12f
            )
            val lp = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
            lp.topMargin = a.dp(12)
            isi.addView(t, lp)
        }

        dialog = a.lembar(
            a.getString(R.string.k_daftar_hitam, ui.daftarHitam.size),
            a.getString(R.string.k_orang_yang_pernah_keluar_dikeluarin),
            isi,
            Tombol(a.getString(R.string.k_tutup), Gaya.LEMBUT)
        )
    }
}
