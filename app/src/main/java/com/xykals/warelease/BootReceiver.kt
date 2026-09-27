package com.xykals.warelease

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Nyalain service otomatis:
 *  - HP selesai boot (BOOT_COMPLETED; beberapa ROM kirim QUICKBOOT_POWERON)
 *  - app barusan di-update (MY_PACKAGE_REPLACED) — biar habis update nggak
 *    perlu buka app lagi.
 *
 * Internet nggak perlu nyala pas boot: engine tinggal gagal cek sekali, lalu
 * BotService nyuruh cek ulang begitu jaringan nyambung.
 *
 * Catatan Xiaomi/MIUI/HyperOS: broadcast boot BARU sampai ke app kalau izin
 * "Mulai otomatis" (Autostart) dinyalakan manual. Tombolnya ada di app.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        val aksi = intent.action ?: return
        val dikenal = aksi == Intent.ACTION_BOOT_COMPLETED ||
                aksi == Intent.ACTION_MY_PACKAGE_REPLACED ||
                aksi == "android.intent.action.QUICKBOOT_POWERON" ||
                aksi == "com.htc.intent.action.QUICKBOOT_POWERON"
        if (!dikenal) return

        LogRecorder.init(ctx)
        val settings = SettingsStore(ctx)
        if (aksi != Intent.ACTION_MY_PACKAGE_REPLACED && !settings.autoStartOnBoot) {
            LogRecorder.tulis("Boot", "$aksi diterima, tapi opsi nyala-otomatis dimatiin")
            return
        }
        if (!settings.hasValidSettings() && !settings.hostingDipakai) {
            LogRecorder.tulis("Boot", "$aksi diterima, tapi setting belum lengkap")
            return
        }
        try {
            LogRecorder.tulis("Boot", "$aksi → nyalain BotService")
            BotService.start(ctx)
        } catch (e: Throwable) {
            // Beberapa ROM ngeblok foreground service saat boot — watchdog
            // WorkManager bakal nyoba lagi nanti.
            LogRecorder.galat("Boot", "gagal start service saat $aksi", e)
        }
    }
}
