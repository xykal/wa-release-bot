package com.xykals.warelease

import android.app.Dialog
import android.graphics.Bitmap
import android.graphics.Typeface
import android.os.Handler
import android.util.TypedValue
import android.view.Gravity
import android.widget.ImageView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * Dua lembar proses nautin WhatsApp: pairing code dan QR. Keduanya dikendalikan
 * dari status engine (dipanggil tiap render), bukan dari klik user, makanya
 * ada aturan "ditutup user = jangan muncul lagi sampai nautin ulang"
 * (`kodeDiabaikan` / `qrDiabaikan`) dan bedanya dengan tutup paksa oleh app.
 */
internal class DialogTautan(
    private val a: AppCompatActivity,
    private val handler: Handler,
    private val nomor: () -> String,
    private val banner: (String) -> Unit,
    private val aksi: AksiSistem
) {
    // QR
    private var qrDialog: Dialog? = null
    private var qrImage: ImageView? = null
    private var qrTerakhir: String? = null
    private var qrBitmap: Bitmap? = null
    private var qrSedangDibuat = false
    private var qrDiabaikan = false

    // pairing code
    private var kodeDialog: Dialog? = null
    private var kodeTeks: TextView? = null
    private var kodeTerakhir: String? = null
    private var kodeDiabaikan = false

    private var sedangTutupPaksa = false

    /** QR digambar di thread belakang — 400 ribu piksel bikin layar beku kalau di main. */
    private val qrScope = CoroutineScope(Dispatchers.Default + SupervisorJob())

    /** User mulai nautin lagi: lembar yang lama ditutup dan boleh muncul lagi. */
    fun mulaiUlang() {
        kodeDiabaikan = false
        qrDiabaikan = false
        tutupKode()
        tutupQr()
    }

    fun tutupSemua() {
        tutupKode()
        tutupQr()
    }

    fun hancurkan() {
        qrScope.cancel()
        tutupSemua()
    }

    // ----------------------------- pairing code -----------------------------

    fun tanganiKode(kode: String?) {
        if (kode.isNullOrBlank()) {
            tutupKode()
            return
        }
        if (kode != kodeTerakhir) {
            kodeTerakhir = kode
            kodeDiabaikan = false
        }
        val ada = kodeDialog
        if (ada != null && ada.isShowing) {
            kodeTeks?.text = kode
            return
        }
        if (kodeDiabaikan) return

        val kotak = TextView(a).apply {
            text = kode
            gravity = Gravity.CENTER
            setTextColor(ContextCompat.getColor(a, R.color.wr_hijau_terang))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 34f)
            typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)
            letterSpacing = 0.12f
            setBackgroundResource(R.drawable.bg_kode)
            setPadding(a.dp(12), a.dp(20), a.dp(12), a.dp(20))
            setTextIsSelectable(true)
        }
        kodeTeks = kotak

        val d = a.lembar(
            "Masukin kode ini di WhatsApp",
            "1. Buka WhatsApp di HP yang nomornya ${nomor()}\n" +
                    "2. Titik tiga ⋮ → Perangkat tertaut → Tautkan perangkat\n" +
                    "3. Pilih \"Tautkan dengan nomor telepon saja\" (di bawah kamera)\n" +
                    "4. Ketik kode di bawah\n\n" +
                    "Biasanya WA juga ngirim notifikasi \"masukkan kode\" — tinggal tap itu.",
            kotak,
            Tombol("Salin kode", Gaya.UTAMA, tutup = false) {
                aksi.salin(kode.replace("-", ""))
                banner("Kode disalin.")
            },
            Tombol("Buka WhatsApp", Gaya.GARIS, tutup = false) { aksi.bukaWhatsApp() },
            Tombol("Tutup", Gaya.LEMBUT)
        )
        d.setOnDismissListener {
            if (!sedangTutupPaksa) {
                kodeDiabaikan = true
                LogRecorder.tulis("Kode", "lembar pairing code ditutup user")
            }
        }
        kodeDialog = d
        LogRecorder.tulis("Kode", "pairing code tampil")
    }

    private fun tutupKode() {
        val d = kodeDialog ?: return
        sedangTutupPaksa = true
        try {
            if (d.isShowing) d.dismiss()
        } catch (_: Throwable) {
        } finally {
            sedangTutupPaksa = false
        }
        kodeDialog = null
        kodeTeks = null
        kodeTerakhir = null
    }

    // ----------------------------- QR -----------------------------

    fun tanganiQr(qr: String?) {
        if (qr.isNullOrBlank()) {
            tutupQr()
            return
        }
        if (qr != qrTerakhir) {
            qrTerakhir = qr
            qrBitmap = null
        }
        val bmp = qrBitmap
        if (bmp != null) {
            tampilkanQr(bmp)
            return
        }
        if (qrSedangDibuat) return

        qrSedangDibuat = true
        val teks = qr
        qrScope.launch {
            val hasil = QrBitmap.fromText(teks)
            handler.post {
                qrSedangDibuat = false
                if (a.isFinishing || a.isDestroyed) return@post
                if (hasil == null) {
                    LogRecorder.galat("Qr", "QR gagal digambar", null)
                    banner("QR-nya gagal digambar — coba pakai kode aja.")
                    return@post
                }
                if (teks == qrTerakhir) {
                    qrBitmap = hasil
                    tampilkanQr(hasil)
                }
            }
        }
    }

    private fun tampilkanQr(bmp: Bitmap) {
        if (a.isFinishing || a.isDestroyed || qrDiabaikan) return
        // QR digambar di background — pas kelar, bisa aja user udah pindah ke kode.
        val u = BotBus.ui
        if (u.setupMode != "qr" || !u.pairingCode.isNullOrBlank()) return
        val ada = qrDialog
        if (ada != null && ada.isShowing) {
            qrImage?.setImageBitmap(bmp)
            return
        }
        val iv = ImageView(a).apply {
            setImageBitmap(bmp)
            adjustViewBounds = true
            setBackgroundResource(R.drawable.bg_qr)
            setPadding(a.dp(14), a.dp(14), a.dp(14), a.dp(14))
            contentDescription = "Kode QR WhatsApp"
        }
        qrImage = iv
        val d = a.lembar(
            "Scan pakai WhatsApp",
            "Dari HP LAIN yang ada WA-nya: ⋮ → Perangkat tertaut → Tautkan perangkat, " +
                    "lalu arahkan kamera ke sini. QR-nya ganti sendiri tiap ±20 detik.\n\n" +
                    "Bot-nya di HP yang sama dengan WA? Tutup ini, pakai \"Tautkan pakai kode\".",
            iv,
            Tombol("Tutup", Gaya.LEMBUT)
        )
        d.setOnDismissListener {
            if (!sedangTutupPaksa) {
                qrDiabaikan = true
                LogRecorder.tulis("Qr", "dialog QR ditutup user")
            }
        }
        qrDialog = d
        LogRecorder.tulis("Qr", "QR tampil — menunggu discan")
    }

    private fun tutupQr() {
        val d = qrDialog ?: return
        sedangTutupPaksa = true
        try {
            if (d.isShowing) d.dismiss()
        } catch (_: Throwable) {
        } finally {
            sedangTutupPaksa = false
        }
        qrDialog = null
        qrImage = null
        qrTerakhir = null
        qrBitmap = null
    }
}
