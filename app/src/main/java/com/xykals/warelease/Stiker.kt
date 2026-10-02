package com.xykals.warelease

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.os.Build
import java.io.ByteArrayOutputStream
import java.util.Locale
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
internal fun teksBratTerbatas(teks: String): String? {
    val mentah = teks.trim().replace(Regex("\\s+"), " ").lowercase(Locale.ROOT)
    if (mentah.isBlank()) return null
    val akhir = mentah.offsetByCodePoints(0, minOf(48, mentah.codePointCount(0, mentah.length)))
    return mentah.substring(0, akhir)
}

internal object Stiker {

    const val SISI_MAKS = 512
    private const val BATAS_BYTE = 700_000 // ~700 KB: masih diterima WA, jarang kena tolak

    class Hasil(val data: ByteArray, val lebar: Int, val tinggi: Int) {
        val kb: Int get() = (data.size + 1023) / 1024
    }

    /** Render kartu teks hijau gaya Brat secara lokal; tak perlu unduh font/aset. */
    fun brat(teks: String): Hasil? {
        val isi = teksBratTerbatas(teks) ?: return null
        val bmp = Bitmap.createBitmap(SISI_MAKS, SISI_MAKS, Bitmap.Config.ARGB_8888)
        return try {
            val canvas = Canvas(bmp)
            canvas.drawColor(Color.rgb(138, 206, 0))
            val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.BLACK
                textAlign = Paint.Align.CENTER
                typeface = Typeface.create("sans-serif-condensed", Typeface.BOLD)
                textSize = 72f
                setShadowLayer(1.5f, 0f, 0f, 0x55000000)
            }
            val kata = isi.split(' ')
            while (kata.any { paint.measureText(it) > 432f } && paint.textSize > 14f) {
                paint.textSize -= 4f
            }
            val baris = mutableListOf<String>()
            var aktif = ""
            for (bagian in kata) {
                val calon = if (aktif.isEmpty()) bagian else "$aktif $bagian"
                if (aktif.isNotEmpty() && paint.measureText(calon) > 432f) {
                    baris += aktif
                    aktif = bagian
                } else aktif = calon
            }
            if (aktif.isNotEmpty()) baris += aktif
            val metrik = paint.fontMetrics
            val jarak = (metrik.descent - metrik.ascent) * 0.88f
            val tinggi = jarak * baris.size
            var y = (SISI_MAKS - tinggi) / 2f - metrik.ascent
            baris.forEach { barisTeks ->
                canvas.drawText(barisTeks, SISI_MAKS / 2f, y, paint)
                y += jarak
            }
            Hasil(encode(bmp, 90), SISI_MAKS, SISI_MAKS)
        } catch (e: Throwable) {
            LogRecorder.galat("Brat", "render stiker gagal", e)
            null
        } finally {
            if (!bmp.isRecycled) bmp.recycle()
        }
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
        bmp.compress(formatWebp(), mutu, out)
        return out.toByteArray()
    }

    /**
     * WEBP_LOSSY baru ada di API 30. Di Android 8/9 (HP kelas bawah, masih
     * banyak) konstanta itu bikin NoSuchFieldError — dan itu ketangkep sebagai
     * "gambar nggak kebaca", padahal HP-nya sehat. Jadi pilih berdasarkan versi:
     * WEBP lama di bawah 30 (mutu < 100 = lossy juga), WEBP_LOSSY di atasnya.
     */
    @Suppress("DEPRECATION")
    private fun formatWebp(): Bitmap.CompressFormat =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Bitmap.CompressFormat.WEBP_LOSSY
        } else {
            Bitmap.CompressFormat.WEBP
        }
}
