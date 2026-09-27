package com.xykals.warelease

import android.graphics.Bitmap
import android.graphics.Color
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter

/**
 * Render string QR (dari Baileys) jadi Bitmap buat ditampilkan di dialog.
 *
 * Dua hal yang sengaja dihindari di sini, dan dua-duanya pernah bikin masalah:
 *
 *  1. `Bitmap.setPixel()` dipanggil 400 ribu kali (640x640) — tiap panggilan
 *     itu nyebrang ke native, jadi lambat. Kalau dijalanin di thread utama,
 *     layarnya beku dan Android nge-cap aplikasinya nggak merespons
 *     ("aplikasi terhenti"). Sekarang: susun dulu di array Int, baru kirim
 *     sekali lewat `setPixels()`.
 *
 *  2. `catch (e: Exception)` aja nggak cukup — kalau yang kelempar
 *     OutOfMemoryError (bitmap 640x640 itu gede), Error bukan Exception,
 *     jadi lolos dan aplikasinya mati. Sekarang nangkep Throwable.
 *
 * Fungsi ini tetap kerja berat (~20-50 ms), jadi panggilnya TETAP dari
 * thread belakang. Lihat MainActivity.tanganiQr().
 */
object QrBitmap {

    private const val HITAM = Color.BLACK
    private const val PUTIH = Color.WHITE

    fun fromText(text: String, size: Int = 640): Bitmap? {
        if (text.isBlank()) return null
        return try {
            val matrix = QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, size, size)
            val w = matrix.width
            val h = matrix.height
            val piksel = IntArray(w * h)
            for (y in 0 until h) {
                val baris = y * w
                for (x in 0 until w) {
                    piksel[baris + x] = if (matrix.get(x, y)) HITAM else PUTIH
                }
            }
            // ARGB_8888 (bukan RGB_565): QR harus kontras & tajam biar kebaca
            // kamera WhatsApp. beda 1 MB-an, nggak kerasa.
            Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888).apply {
                setPixels(piksel, 0, w, 0, 0, w, h)
            }
        } catch (e: Throwable) {
            LogRecorder.galat("QrBitmap", "gagal render QR", e)
            null
        }
    }
}
