package com.xykals.warelease

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import java.io.ByteArrayOutputStream
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Foto → stiker WhatsApp.
 *
 * Kenapa di app, bukan di engine: stiker WA wajib WebP, dan Node di dalam APK
 * (nodejs-mobile) nggak punya encoder WebP — nambah paket WASM berarti nambah
 * berat APK. Android sendiri sudah bisa nulis WebP lewat [Bitmap.compress],
 * jadi gambar yang dikirim user lewat WA dilempar ke app (event `minta_stiker`),
 * dikonversi di sini, lalu hasilnya dikirim balik ke engine (cmd `stiker-jadi`).
 *
 * Aturan stiker WA: sisi terpanjang 512 px, latar transparan boleh, ukuran
 * aman di bawah 100 KB.
 */
internal object Stiker {

    const val SISI_MAKS = 512
    private const val BATAS_BYTE = 700_000 // ~700 KB: masih diterima WA, jarang kena tolak

    class Hasil(val data: ByteArray, val lebar: Int, val tinggi: Int) {
        val kb: Int get() = (data.size + 1023) / 1024
    }

    /** @return null kalau gambarnya nggak kebaca. */
    fun dariByte(mentah: ByteArray): Hasil? {
        val asli = BitmapFactory.decodeByteArray(mentah, 0, mentah.size)
        if (asli == null) {
            LogRecorder.tulis("Stiker", "gambar nggak bisa di-decode (${mentah.size} byte)")
            return null
        }
        return try {
            val kecil = kecilkan(asli)
            var mutu = 90
            var keluaran = encode(kecil, mutu)
            // Turunin mutu bertahap kalau masih kegedean; WA nolak stiker besar.
            while (keluaran.size > BATAS_BYTE && mutu > 40) {
                mutu -= 15
                keluaran = encode(kecil, mutu)
            }
            LogRecorder.tulis(
                "Stiker",
                "jadi ${kecil.width}x${kecil.height}, ${keluaran.size / 1024} KB, mutu $mutu"
            )
            Hasil(keluaran, kecil.width, kecil.height)
        } catch (e: Throwable) {
            LogRecorder.galat("Stiker", "konversi WebP gagal", e)
            null
        } finally {
            if (!asli.isRecycled) asli.recycle()
        }
    }

    /** Skala sisi terpanjang ke [SISI_MAKS]; gambar yang sudah kecil dibiarkan. */
    private fun kecilkan(asli: Bitmap): Bitmap {
        val sisi = max(asli.width, asli.height)
        if (sisi <= SISI_MAKS) return asli
        val faktor = SISI_MAKS.toFloat() / sisi
        val w = (asli.width * faktor).roundToInt().coerceAtLeast(1)
        val h = (asli.height * faktor).roundToInt().coerceAtLeast(1)
        return Bitmap.createScaledBitmap(asli, w, h, true)
    }

    private fun encode(bmp: Bitmap, mutu: Int): ByteArray {
        val out = ByteArrayOutputStream()
        // WEBP_LOSSY ada sejak API 14; kalau HP-nya aneh dan balikin false,
        // coba WEBP biasa (lossless) supaya tetap ada hasilnya.
        val ok = bmp.compress(Bitmap.CompressFormat.WEBP_LOSSY, mutu, out)
        if (!ok) bmp.compress(Bitmap.CompressFormat.WEBP, mutu, out)
        return out.toByteArray()
    }

    /** True kalau HP ini bisa nulis WebP (dipakai buat nolak lebih awal). */
    fun didukung(): Boolean = Build.VERSION.SDK_INT >= Build.VERSION_CODES.ICE_CREAM_SANDWICH
}
