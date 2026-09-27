package com.xykals.warelease

import android.content.Context
import android.os.Build
import android.os.Process
import android.util.Log
import java.io.File
import java.io.PrintWriter
import java.io.StringWriter
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Perekam log buat debugging.
 *
 * Semua tulisan masuk ke:
 *
 *     Android/media/<nama-paket>/log/
 *
 * Folder itu dipilih karena bisa dibuka dari HP (file manager / komputer lewat
 * kabel) TANPA root dan TANPA izin apa-apa. `getExternalMediaDirs()` memang
 * ngarah ke situ dan itu folder milik app sendiri, jadi Android nggak minta
 * izin penyimpanan. Bandingin sama folder lama (`filesDir`) yang ada di dalam
 * /data/data/... — itu nggak bisa dibuka siapa-siapa selain app-nya sendiri,
 * jadi percuma buat debugging.
 *
 * Isi foldernya:
 *   - app.log    : aktivitas app (tombol ditekan, service nyala/mati, error)
 *   - mesin.log  : log dari engine bot (Node.js)
 *   - logcat.log : log mentah Android — termasuk output Node & stack trace
 *   - crash.log  : kalau app pernah mati sendiri, penyebabnya ada di sini
 *
 * Catatan soal crash: penangkap crash dipasang dari [App.onCreate] sebelum
 * activity apa pun jalan, supaya crash paling awal pun kecatat.
 */
object LogRecorder {

    private const val TAG = "LogRecorder"
    private const val BATAS_BYTE = 2L * 1024 * 1024 // 2 MB per file, lalu di-rotate

    @Volatile
    private var folder: File? = null

    @Volatile
    private var siap = false

    private val kunci = Any()

    @Volatile
    // Ditulis lengkap `java.lang.Process`: di file ini `android.os.Process`
    // sudah di-import (buat killProcess/myPid), jadi kalau cuma nulis
    // `Process`, yang kebaca android.os.Process dan tipe-nya nggak cocok.
    private var prosesLogcat: java.lang.Process? = null

    /** Folder log. null kalau penyimpanan eksternal nggak kebaca. */
    val dir: File?
        get() = folder

    /**
     * Siapkan folder log + pasang penangkap crash. Aman dipanggil berkali-kali.
     * @return folder log, atau null kalau nggak ada yang bisa dipakai.
     */
    fun init(ctx: Context): File? {
        folder?.let { return it }

        synchronized(kunci) {
            folder?.let { return it }

            val kandidat = cariFolder(ctx)
            if (kandidat == null) {
                Log.w(TAG, "Nggak ada folder yang bisa dipakai buat log.")
                return null
            }

            kandidat.mkdirs()
            if (!kandidat.isDirectory || !kandidat.canWrite()) {
                Log.w(TAG, "Folder log nggak bisa ditulis: $kandidat")
                return null
            }

            folder = kandidat
            siap = true

            tulisBerkas("BACA-INI.txt", penjelasan(kandidat), sekaliSaja = true)
            // ABI yang BENERAN dipakai dicatat terpisah dari daftar ABI yang
            // didukung HP: kalau APK-nya isinya arm64 padahal HP-nya 32-bit,
            // yang ini yang bikin langsung ketahuan.
            //
            // Sumbernya `nativeLibraryDir` — itu API publik dan isinya path
            // folder .so yang dipilih sistem, jadi segmen terakhirnya nama
            // ABI-nya (…/lib/arm atau …/lib/arm64).
            //
            // Catatan: `ApplicationInfo.primaryCpuAbi` kelihatan lebih pas,
            // tapi itu @hide — pernah gue pakai dan compile-nya gagal
            // ("Unresolved reference: primaryCpuAbi").
            val abiDipakai = try {
                ctx.applicationInfo?.nativeLibraryDir?.substringAfterLast('/') ?: "(belum ditentukan)"
            } catch (_: Throwable) {
                "(nggak kebaca)"
            }
            val bit64 = try {
                android.os.Process.is64Bit()
            } catch (_: Throwable) {
                false
            }
            tulis(
                "── app jalan ── ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE}) " +
                        "• ${Build.MANUFACTURER} ${Build.MODEL} • Android ${Build.VERSION.RELEASE} " +
                        "(API ${Build.VERSION.SDK_INT}) • ABI dipakai: $abiDipakai " +
                        "(proses 64-bit: $bit64) • HP dukung: ${Build.SUPPORTED_ABIS.joinToString()}"
            )
            mulaiRekamLogcat()
            return kandidat
        }
    }

    /** Pasang penangkap crash. Dipanggil sekali dari [App.onCreate]. */
    fun pasangPenangkapCrash() {
        val sebelumnya = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { t, e ->
            try {
                catatCrash(t, e)
            } catch (_: Throwable) {
                // jangan sampai penangkap crash malah bikin masalah baru
            }
            if (sebelumnya != null) {
                sebelumnya.uncaughtException(t, e)
            } else {
                Process.killProcess(Process.myPid())
            }
        }
    }

    // ----------------------------- nulis -----------------------------

    /** Satu baris ke app.log. */
    fun tulis(pesan: String) = tulisKe("app.log", pesan)

    /** Satu baris ke app.log, dengan penanda asal. */
    fun tulis(tag: String, pesan: String) = tulisKe("app.log", "[$tag] $pesan")

    /** Error + stack trace ke app.log. */
    fun galat(tag: String, pesan: String, e: Throwable? = null) {
        val teks = if (e == null) pesan else pesan + "\n" + jejak(e)
        tulisKe("app.log", "[$tag] ⛔ $teks")
        Log.e(TAG, "$tag: $pesan", e)
    }

    /** Log dari engine bot. */
    fun mesin(pesan: String) = tulisKe("mesin.log", pesan)

    private fun catatCrash(t: Thread, e: Throwable) {
        val kepala = StringBuilder()
        kepala.append("========== APP MATI SENDIRI ==========\n")
        kepala.append("waktu     : ${stempel()}\n")
        kepala.append("versi app : ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})\n")
        kepala.append("HP        : ${Build.MANUFACTURER} ${Build.MODEL}\n")
        kepala.append("Android   : ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})\n")
        kepala.append("ABI       : ${Build.SUPPORTED_ABIS.joinToString()}\n")
        kepala.append("thread    : ${t.name}\n")
        kepala.append("service   : ${BotService.isRunning}\n")
        kepala.append("engine    : ${BotBus.ui.engineRunning} • WA linked: ${BotBus.ui.waLinked}\n")
        kepala.append("--------------------------------------\n")
        kepala.append(jejak(e))
        kepala.append("======================================\n")
        tulisKe("crash.log", kepala.toString())
        Log.e(TAG, "app crash — detail ditulis ke crash.log", e)
    }

    // ----------------------------- logcat -----------------------------

    /**
     * Rekam logcat ke file.
     *
     * Kenapa perlu: output mentah Node.js (stdout/stderr) cuma nyampe ke
     * logcat — nggak lewat jalur event app. Termasuk kalau libnode-nya sendiri
     * yang ngamuk, pesannya ada di sini. Sejak Android 4.1 app cuma bisa baca
     * log miliknya sendiri, jadi ini aman dan nggak perlu izin.
     */
    fun mulaiRekamLogcat() {
        synchronized(kunci) {
            if (prosesLogcat != null) return
            try {
                val p = ProcessBuilder("logcat", "-v", "time")
                    .redirectErrorStream(true)
                    .start()
                prosesLogcat = p
                Thread({
                    try {
                        p.inputStream.bufferedReader().useLines { baris ->
                            for (b in baris) tulisKe("logcat.log", b)
                        }
                    } catch (_: Throwable) {
                        // proses logcat mati / dibunuh sistem — bukan hal fatal
                    }
                }, "wr-logcat").apply {
                    isDaemon = true
                    start()
                }
            } catch (e: Throwable) {
                prosesLogcat = null
                tulis("[LogRecorder] perekam logcat nggak bisa jalan: ${e.message} (log tetap jalan)")
            }
        }
    }

    // ----------------------------- util -----------------------------

    private fun cariFolder(ctx: Context): File? {
        // 1. Android/media/<paket> — bisa dibuka user, nggak perlu izin.
        val media = try {
            ctx.getExternalMediaDirs()?.firstOrNull { it != null }
        } catch (_: Throwable) {
            null
        }
        if (media != null) {
            val f = File(media, "log")
            f.mkdirs()
            if (f.canWrite()) return f
        }

        // 2. Android/data/<paket>/files/log — ada, tapi di Android 11+ nggak
        //    kelihatan dari file manager. Cuma dipakai kalau nomor 1 gagal.
        val ext = ctx.getExternalFilesDir(null)
        if (ext != null) {
            val f = File(ext, "log")
            f.mkdirs()
            if (f.canWrite()) return f
        }

        // 3. Terakhir: di dalam app sendiri (cuma kebaca lewat adb/root).
        val f = File(ctx.filesDir, "log")
        f.mkdirs()
        return if (f.canWrite()) f else null
    }

    private fun tulisKe(nama: String, isi: String) {
        val dasar = folder ?: return
        synchronized(kunci) {
            try {
                val f = File(dasar, nama)
                if (f.length() > BATAS_BYTE) rotate(f)
                f.appendText(isi.trimEnd('\n') + "\n")
            } catch (_: Throwable) {
                // disk penuh / file lagi dipakai — jangan sampai bikin app mati
            }
        }
    }

    private fun tulisBerkas(nama: String, isi: String, sekaliSaja: Boolean) {
        val dasar = folder ?: return
        synchronized(kunci) {
            try {
                val f = File(dasar, nama)
                if (sekaliSaja && f.exists()) return
                f.writeText(isi)
            } catch (_: Throwable) {
            }
        }
    }

    private fun rotate(f: File) {
        try {
            val lama = File(f.parentFile, f.name + ".1")
            if (lama.exists()) lama.delete()
            f.renameTo(lama)
        } catch (_: Throwable) {
        }
    }

    private fun stempel(): String =
        SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS", Locale.US).format(Date())

    private fun jejak(e: Throwable): String {
        val sw = StringWriter()
        PrintWriter(sw).use { e.printStackTrace(it) }
        return sw.toString()
    }

    private fun penjelasan(dasar: File): String = """
        Folder log WA Release Bot
        =========================
        Lokasi: ${dasar.absolutePath}

        Isinya:
          app.log     aktivitas app — tombol yang ditekan, service nyala/mati, error
          mesin.log   log dari engine bot (Node.js) — cek release, posting, QR
          logcat.log  log mentah Android, termasuk output Node & stack trace crash
          crash.log   ADA ISINYA = app pernah mati sendiri. Bagian atasnya nulis
                      versi app, HP apa, dan penyebabnya (stack trace)

        Tiap file maksimal 2 MB. Kalau penuh, yang lama dipindah jadi .1
        (jadi paling banyak 2 file per nama).

        Mau laporin masalah? Kirim crash.log + app.log + mesin.log.
        Yang paling ngebantu: crash.log. Kalau kosong, berarti app-nya nggak
        pernah crash — masalahnya di logika, bukan di aplikasi.

        Hapus folder ini kapan aja juga nggak masalah — bakal dibikin ulang.
    """.trimIndent() + "\n"
}
