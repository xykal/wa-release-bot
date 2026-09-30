package com.xykals.warelease

import android.app.Activity
import android.app.ActivityManager
import android.content.Context
import android.os.Build
import android.os.Environment
import android.os.PowerManager
import android.os.StatFs
import androidx.core.content.ContextCompat
import java.util.Locale
import kotlin.math.roundToInt

/**
 * Cek perangkat: RAM, arsitektur, versi Android, sisa penyimpanan, optimasi
 * batre, izin notifikasi. Dipakai kartu **Cek perangkat** di tab Pengaturan.
 *
 * Perangkat di bawah spek minimum **tidak** diblokir — cuma dikasih peringatan,
 * karena bot tetap bisa jalan (cuma lebih gampang dibunuh Android atau lambat
 * pas bikin stiker). Beberapa peringatan juga bikin app nurunin sendiri
 * pemakaian beratnya (mis. partikel splash dikurangi), lihat [hemat].
 */
internal object Perangkat {

    /** Spek minimum yang dipakai buat kasih peringatan (bukan blokir). */
    const val RAM_MIN_MB = 2048
    const val SDK_MIN = 26
    const val PENYIMPANAN_MIN_MB = 300

    class Hasil(
        val baris: List<String>,
        val peringatan: List<String>,
        val ramMb: Int,
        val abi: String,
        val sdk: Int
    ) {
        val aman: Boolean get() = peringatan.isEmpty()

        /** HP pas-pasan: animasi & fitur berat diturunin sendiri. */
        val hemat: Boolean get() = ramMb in 1 until RAM_MIN_MB
    }

    fun periksa(a: Activity): Hasil {
        val ramMb = ramTotalMb(a)
        val abi = Build.SUPPORTED_ABIS.firstOrNull() ?: "?"
        val sdk = Build.VERSION.SDK_INT
        val sisaMb = sisaPenyimpananMb(a)
        val bebasBatre = bebasBatre(a)
        val notif = izinNotifikasi(a)

        val baris = listOf(
            "Android ${Build.VERSION.RELEASE} (API $sdk)",
            "Arsitektur: $abi",
            "RAM: ${ramMb} MB (total) — sisa ${ramKosongMb(a)} MB",
            "Penyimpanan bebas: $sisaMb MB",
            "Optimasi batre: ${if (bebasBatre) "dikecualikan" else "masih aktif"}",
            "Izin notifikasi: ${if (notif) "diberi" else "belum"}",
            "Prosesor: ${Build.HARDWARE} (${Build.SUPPORTED_ABIS.size} ABI)"
        )

        val peringatan = mutableListOf<String>()
        if (ramMb in 1 until RAM_MIN_MB) peringatan.add("RAM di bawah ${RAM_MIN_MB} MB: bot bisa dimatikan Android pas layar mati, dan fitur stiker/story bisa lambat.")
        if (sdk < SDK_MIN) peringatan.add("Android di bawah $SDK_MIN: sebagian izin batre/autostart nggak ada, bot gampang berhenti sendiri.")
        if (sisaMb in 1 until PENYIMPANAN_MIN_MB) peringatan.add("Penyimpanan bebas di bawah ${PENYIMPANAN_MIN_MB} MB: sesi WA dan log butuh ruang, sisakan lebih banyak.")
        if (!bebasBatre) peringatan.add("Optimasi batre masih aktif: tekan tombol izin batre di kartu Batre & nyala otomatis.")
        if (!notif) peringatan.add("Izin notifikasi belum diberi: kabar gagal kirim nggak bakal muncul.")
        if (abi !in listOf("arm64-v8a", "armeabi-v7a", "armeabi")) {
            peringatan.add("Arsitektur $abi bukan ARM: APK resmi cuma punya arm64-v8a dan armeabi-v7a.")
        }

        return Hasil(baris, peringatan, ramMb, abi, sdk)
    }

    /** Ringkasan sebaris buat dikirim ke engine (buat nyetel strategi moderasi). */
    fun ringkas(h: Hasil): String =
        "ram=${h.ramMb}MB abi=${h.abi} sdk=${h.sdk} hemat=${h.hemat}"

    // ------------------------------- pembacaan -------------------------------

    fun ramTotalMb(ctx: Context): Int {
        val mi = ActivityManager.MemoryInfo()
        (ctx.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager)?.getMemoryInfo(mi)
        val bytes = if (mi.totalMem > 0) mi.totalMem else 0L
        return (bytes / 1048576L).toInt()
    }

    private fun ramKosongMb(ctx: Context): Int {
        val mi = ActivityManager.MemoryInfo()
        (ctx.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager)?.getMemoryInfo(mi)
        return (mi.availMem / 1048576L).toInt()
    }

    private fun sisaPenyimpananMb(ctx: Context): Int {
        return try {
            val stat = StatFs(Environment.getDataDirectory().path)
            (stat.availableBytes / 1048576L).toInt()
        } catch (_: Throwable) {
            -1
        }
    }

    fun bebasBatre(ctx: Context): Boolean = try {
        (ctx.getSystemService(Context.POWER_SERVICE) as? PowerManager)
            ?.isIgnoringBatteryOptimizations(ctx.packageName) == true
    } catch (_: Throwable) {
        false
    }

    private fun izinNotifikasi(ctx: Context): Boolean =
        if (Build.VERSION.SDK_INT >= 33) {
            ContextCompat.checkSelfPermission(ctx, android.Manifest.permission.POST_NOTIFICATIONS) ==
                android.content.pm.PackageManager.PERMISSION_GRANTED
        } else {
            true
        }

    /** Teks kartu; kosong berarti belum pernah dicek. */
    fun teks(h: Hasil): String {
        val sb = StringBuilder()
        sb.append(h.baris.joinToString("\n"))
        if (h.peringatan.isEmpty()) {
            sb.append("\n\nSemua cek lolos. Bot siap jalan.")
        } else {
            sb.append("\n\nPeringatan (bot tetap bisa jalan):")
            h.peringatan.forEach { sb.append("\n- ").append(it) }
        }
        return sb.toString()
    }

    /** Dipakai nilai bawaan kalau info nggak kebaca (mis. -1 MB). */
    fun wajar(angka: Int): String = if (angka < 0) "?" else angka.toString()

    fun persen(bagian: Int, total: Int): String =
        if (total <= 0 || bagian < 0) "?"
        else String.format(Locale.US, "%d%%", (bagian * 100f / total).roundToInt())
}
