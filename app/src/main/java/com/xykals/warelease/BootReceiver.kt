package com.xykals.warelease

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/** Mulai service secara otomatis saat HP boot (kalau user mengaktifkan opsinya). */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        val settings = SettingsStore(ctx)
        if (!settings.autoStartOnBoot) return
        if (!settings.hasValidSettings()) return
        try {
            Log.i("BootReceiver", "BOOT_COMPLETED → start BotService")
            BotService.start(ctx)
        } catch (e: Exception) {
            // Beberapa ROM membatasi FGS saat boot — user tinggal buka app & tekan Mulai
            Log.w("BootReceiver", "Gagal start saat boot: ${e.message}")
        }
    }
}
