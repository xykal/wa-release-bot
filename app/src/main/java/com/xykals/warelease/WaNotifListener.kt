package com.xykals.warelease

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/**
 * Mode "Pintar": app ikut "ngintip" notifikasi WhatsApp di HP ini.
 *
 * Idenya: bot nggak perlu nyambung ke WA tiap 5 menit cuma buat nanya "ada
 * yang minta join?". WhatsApp di HP ini udah nerima notifikasinya duluan
 * (lewat push Google, gratis batre). Begitu notif dari grup yang dijaga
 * nongol, bot dibangunin → nyambung ±25 dtk → proses → tidur lagi.
 *
 * Yang dibaca CUMA judul notif (nama grup/chat) buat dicocokin sama nama grup
 * yang dijaga. Isi pesan nggak disimpen, nggak dikirim ke mana-mana.
 *
 * Batasan (jujur aja):
 *  - Grup yang di-mute / notifnya dimatiin → nggak ada notif → nggak kebangun.
 *    Makanya tetap ada cek cadangan tiap 30 menit.
 *  - Harus diizinin manual: Setelan → Akses notifikasi → WA Release Bot.
 */
class WaNotifListener : NotificationListenerService() {

    private var terakhir = 0L

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        sbn ?: return
        if (sbn.packageName != "com.whatsapp" && sbn.packageName != "com.whatsapp.w4b") return
        val n = sbn.notification ?: return
        // Notif ringkasan ("5 pesan dari 2 chat") nggak ada info grupnya.
        if (n.flags and Notification.FLAG_GROUP_SUMMARY != 0) return

        val svc = BotService.instance ?: return
        val judul = n.extras?.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
        val teks = n.extras?.getCharSequence(Notification.EXTRA_CONVERSATION_TITLE)?.toString().orEmpty()
        val grup = BotBus.ui.grupNama?.trim().orEmpty()

        // Nama grup udah diketahui → cuma bangun kalau notifnya dari grup itu.
        // Belum diketahui (belum pernah cek) → bangun aja, nanti ketahuan.
        val cocok = grup.isBlank() ||
                judul.contains(grup, ignoreCase = true) ||
                teks.contains(grup, ignoreCase = true)
        if (!cocok) return

        val now = System.currentTimeMillis()
        if (now - terakhir < 15_000L) return
        terakhir = now
        svc.bangun("notif WhatsApp${if (grup.isNotBlank()) " dari \"$grup\"" else ""}")
    }
}
