package com.xykals.warelease

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Watchdog (WorkManager, tiap >= 15 menit):
 *  1. Kalau service mati (dibunuh Android / HP restart) → nyalakan lagi.
 *  2. Kalau engine lalai cek (timer drift) → suruh cek sekarang.
 */
class BotWatchdogWorker(
    ctx: Context,
    params: WorkerParameters
) : CoroutineWorker(ctx, params) {

    override suspend fun doWork(): Result = withContext(Dispatchers.Main) {
        val settings = SettingsStore(applicationContext)

        if (!BotService.isRunning) {
            try {
                Log.i("Watchdog", "Service mati → start ulang")
                BotService.start(applicationContext)
            } catch (e: Exception) {
                // FGS dibatasi Android di kondisi tertentu — coba lagi periode berikutnya
                Log.w("Watchdog", "Gagal start FGS: ${e.message}")
            }
            return@withContext Result.success()
        }

        val st = BotBus.ui
        val intervalMin = settings.intervalMinutes.coerceAtLeast(15)
        val staleMs = (intervalMin * 2L + 5) * 60_000L
        val last = st.lastCheckAt

        if (!st.engineRunning || last == null || System.currentTimeMillis() - last > staleMs) {
            Log.i("Watchdog", "Engine perlu cek → kirim cmd check")
            BotService.instance?.sendCmd(mapOf("type" to "check"))
        }

        Result.success()
    }
}
