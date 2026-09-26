package com.xykals.warelease.util

/**
 * Format durasi buat ditampilkan di UI ("dalam 2m 30d", "3 detik").
 *
 * Dipisah dari MainActivity supaya bisa di-unit-test tanpa Android runtime
 * (lihat app/src/test/java/com/xykals/warelease/DurasiTest.kt).
 */
object Durasi {

    private const val DETIK = 1000L
    private const val MENIT = 60L * DETIK
    private const val JAM = 60L * MENIT

    /**
     * Ubah durasi milidetik jadi teks Indonesia yang enak dibaca.
     *
     * - < 1 menit   → "45 detik"
     * - < 1 jam     → "2m 30d"
     * - >= 1 jam    → "3j 15m"
     * - negatif     → "sebentar lagi"
     */
    fun human(ms: Long): String {
        if (ms <= 0) return "sebentar lagi"

        val totalDetik = ms / DETIK
        val menit = totalDetik / 60
        val sisaDetik = totalDetik % 60

        return when {
            totalDetik < 60 -> "$totalDetik detik"
            ms < JAM -> "${menit}m ${sisaDetik}d"
            else -> {
                val jam = ms / JAM
                "${jam}j ${menit % 60}m"
            }
        }
    }
}
