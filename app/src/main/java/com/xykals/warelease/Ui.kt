package com.xykals.warelease

import android.app.Activity
import android.app.Dialog
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.FileProvider

/**
 * Komponen UI yang dipakai bareng semua layar (dulu nempel di MainActivity).
 *
 * Nggak pakai komponen Material sama sekali: tombol = TextView yang bisa
 * diklik, saklar = baris yang di-`isSelected`, dialog = [lembar] buatan
 * sendiri, notifikasi kecil = [Banner] (pengganti Toast).
 */
enum class Gaya { UTAMA, GARIS, LEMBUT, BAHAYA }

class Tombol(
    val teks: String,
    val gaya: Gaya,
    val tutup: Boolean = true,
    val aksi: (() -> Unit)? = null
)

fun Context.dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

/** Dialog buatan sendiri (res/layout/lembar.xml). */
fun Activity.lembar(judul: String, pesan: String, isi: View?, vararg tombol: Tombol): Dialog {
    val d = Dialog(this, R.style.Lembar)
    val akar = LayoutInflater.from(this).inflate(R.layout.lembar, null)
    akar.findViewById<TextView>(R.id.lbJudul).text = judul
    val tvPesan = akar.findViewById<TextView>(R.id.lbPesan)
    if (pesan.isBlank()) tvPesan.visibility = View.GONE else tvPesan.text = pesan
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

/** Pengganti Toast: kotak kecil di bawah layar yang ilang sendiri. */
class Banner(private val tv: TextView) {
    private val handler = Handler(Looper.getMainLooper())
    private val sembunyi = Runnable {
        tv.animate().alpha(0f).setDuration(200).withEndAction { tv.visibility = View.GONE }.start()
    }

    init {
        tv.setOnClickListener { handler.removeCallbacks(sembunyi); sembunyi.run() }
    }

    fun tampil(pesan: String, lamaMs: Long = 3800L) {
        handler.removeCallbacks(sembunyi)
        tv.text = pesan
        if (tv.visibility != View.VISIBLE) {
            tv.alpha = 0f
            tv.translationY = tv.context.dp(12).toFloat()
            tv.visibility = View.VISIBLE
        }
        tv.animate().alpha(1f).translationY(0f).setDuration(180).start()
        handler.postDelayed(sembunyi, lamaMs)
    }
}

/** Semua tombol lewat sini: dicatat ke log, dan kalau meledak app nggak mati. */
fun Activity.pasangTombol(id: Int, nama: String, gagal: (String) -> Unit, aksi: () -> Unit) {
    findViewById<View>(id).setOnClickListener {
        LogRecorder.tulis("Tombol", "tekan: $nama")
        try {
            aksi()
        } catch (e: Throwable) {
            LogRecorder.galat("Tombol", "\"$nama\" gagal", e)
            gagal("\"$nama\" gagal: ${e.message}")
        }
    }
}

/** Baris saklar: tap = bolak-balik isSelected. */
fun Activity.saklar(id: Int): View {
    val v = findViewById<View>(id)
    v.setOnClickListener { v.isSelected = !v.isSelected }
    return v
}

fun Context.salin(teks: String) {
    try {
        (getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager)
            .setPrimaryClip(ClipData.newPlainText("wa-release-bot", teks))
    } catch (_: Throwable) {
    }
}

fun Activity.bukaLink(url: String) {
    try {
        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
    } catch (_: Throwable) {
        salin(url)
    }
}

/**
 * Jalankan aksi setelah service siap (dicek terus maksimal ~10 detik).
 * `action` WAJIB parameter terakhir biar `denganService(...) { ... }` bisa dipakai.
 */
fun Activity.denganService(pesan: (String) -> Unit, cobaKe: Int = 0, action: () -> Unit) {
    if (BotService.instance != null) {
        action()
        return
    }
    if (cobaKe == 0) {
        try {
            LogRecorder.tulis("Service", "belum nyala — dinyalakan dulu")
            BotService.start(this)
        } catch (e: Throwable) {
            LogRecorder.galat("Service", "gagal start service", e)
            pesan("Gagal nyalain service: ${e.message}")
            return
        }
    }
    if (cobaKe >= 14) {
        LogRecorder.tulis("Service", "nyerah nunggu service siap (>10 detik)")
        pesan("Service-nya lama nggak siap. Coba lagi, atau cek log.")
        return
    }
    val jeda = if (cobaKe < 4) 400L else 1000L
    Handler(Looper.getMainLooper()).postDelayed({
        if (!isFinishing && !isDestroyed) denganService(pesan, cobaKe + 1, action)
    }, jeda)
}

/** Kirim perintah ke engine lewat service. */
fun kirimCmd(cmd: Map<String, Any>, pesan: (String) -> Unit) {
    val svc = BotService.instance
    if (svc == null) {
        LogRecorder.tulis("Cmd", "dibuang, service belum siap: ${cmd["type"]}")
        pesan("Service belum siap — coba lagi sebentar.")
        return
    }
    // token GitHub jangan ikut ke-log
    LogRecorder.tulis("Cmd", "kirim: ${cmd.filterKeys { it != "token" }}")
    svc.setUiTerlihat(true)
    svc.sendCmd(cmd)
}

/** Bagikan semua file log (Android/media/<paket>/log). */
fun Activity.kirimSemuaLog(pesan: (String) -> Unit) {
    val d = LogRecorder.dir
    if (d == null) {
        pesan("Folder log nggak kebaca.")
        return
    }
    val berkas = d.listFiles(java.io.FileFilter { f -> f.isFile && f.name.contains(".log") })
        ?.sortedBy { it.name } ?: emptyList()
    if (berkas.isEmpty()) {
        pesan("Belum ada file log.")
        return
    }
    val uris = ArrayList<Uri>()
    for (f in berkas) {
        try {
            uris.add(FileProvider.getUriForFile(this, "$packageName.fileprovider", f))
        } catch (e: Throwable) {
            LogRecorder.galat("Log", "file ${f.name} nggak bisa dibagikan", e)
        }
    }
    if (uris.isEmpty()) {
        pesan("Nggak bisa nyiapin file log buat dikirim.")
        return
    }
    val kirim = Intent(Intent.ACTION_SEND_MULTIPLE).apply {
        type = "text/plain"
        putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris)
        putExtra(Intent.EXTRA_SUBJECT, "Log WA Release Bot")
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        val cd = ClipData.newUri(contentResolver, "log", uris[0])
        for (u in uris.drop(1)) cd.addItem(ClipData.Item(u))
        clipData = cd
    }
    LogRecorder.tulis("Log", "bagikan ${berkas.size} file log")
    startActivity(Intent.createChooser(kirim, "Kirim log ke..."))
}

/** "6283116632566" → "0831-1663-2566" (gaya nomor Indonesia). */
fun rapikanNomor(n: String?): String {
    val d = n?.filter { it.isDigit() }.orEmpty()
    if (d.isEmpty()) return ""
    val lokal = if (d.startsWith("62")) "0" + d.substring(2) else d
    if (!lokal.startsWith("0") || lokal.length < 9) return "+$d"
    return lokal.chunked(4).joinToString("-")
}

object Mode {
    fun nama(m: String?): String = when (m) {
        "adaptif" -> "Adaptif"
        "pintar" -> "Pintar"
        "realtime" -> "Realtime"
        else -> "Berkala"
    }
}
