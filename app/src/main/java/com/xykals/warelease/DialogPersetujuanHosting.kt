package com.xykals.warelease

import android.app.Activity
import android.app.Dialog
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Peringatan sebelum kode bot pihak ketiga jalan. Kodenya berbagi sandbox dengan
 * app ini, jadi bisa membaca sesi WA dan token GitHub. Penegakannya ada di mesin
 * (hosting-setuju.mjs menolak jalan tanpa persetujuan untuk sidik ZIP ini);
 * dialog ini cuma pintu masuk persetujuannya.
 */
object DialogPersetujuanHosting {

    fun tampilkan(act: Activity, sha256: String?, onSetuju: () -> Unit) {
        val d = Dialog(act, R.style.Lembar)
        val v = act.layoutInflater.inflate(R.layout.lembar, null)
        val sidik = sha256?.let { SidikZip.tampilan(it) } ?: act.getString(R.string.k_hosting_sidik_lama)
        v.findViewById<TextView>(R.id.lbJudul).text = act.getString(R.string.k_hosting_setuju_judul)
        v.findViewById<TextView>(R.id.lbPesan).text = act.getString(R.string.k_hosting_setuju_pesan, sidik)
        v.findViewById<View>(R.id.lbIsi).visibility = View.GONE

        val kerapatan = act.resources.displayMetrics.density
        val tinggi = (50 * kerapatan).toInt()
        val wadah = v.findViewById<LinearLayout>(R.id.lbTombol)
        val ya = TextView(act, null, 0, R.style.TombolBahaya).apply {
            text = act.getString(R.string.k_hosting_setuju_ya)
            setOnClickListener { onSetuju(); d.dismiss() }
        }
        val batal = TextView(act, null, 0, R.style.TombolLembut).apply {
            text = act.getString(R.string.k_batal)
            setOnClickListener { d.dismiss() }
        }
        wadah.addView(ya, LinearLayout.LayoutParams(-1, tinggi))
        wadah.addView(batal, LinearLayout.LayoutParams(-1, tinggi).apply { topMargin = (8 * kerapatan).toInt() })
        Denyut.pasangSemua(v)
        d.setContentView(v)
        d.window?.setLayout((act.resources.displayMetrics.widthPixels * 0.92).toInt(), -2)
        d.show()
    }
}
