package com.xykals.warelease

/**
 * State bersama antara BotService (thread IO) dan MainActivity (thread main).
 *
 * Semua field-nya `var` supaya bisa dipakai pola:
 *
 *     BotBus.publish { serviceRunning = true }
 *     BotBus.publish { log = listOf("a", "b") }
 *
 * `publish()` bekerja di atas SALINAN state (`copy()`), baru dipublikasikan.
 * Jadi nggak ada dua thread yang nulis ke objek yang sama.
 */
data class BotUi(
    var serviceRunning: Boolean = false,
    var engineRunning: Boolean = false,
    var busy: Boolean = false,
    var waLinked: Boolean = false,
    var waConnected: Boolean = false,
    var lastTag: String? = null,
    var lastPostedAt: String? = null,
    var postCount: Int = 0,
    var lastCheckAt: Long? = null,
    var nextCheckAt: Long? = null,
    var repo: String? = null,
    var channel: String? = null,
    var channelNama: String? = null,
    // Diisi cuma waktu bot selesai bikin channel baru. MainActivity ngeliat ini
    // lalu ngisi field "Channel WA" sendiri — biar user nggak perlu nyalin JID.
    var channelBaru: String? = null,
    var qr: String? = null,
    var engineError: String? = null,
    var setupState: String? = null, // null | starting | done | error
    var log: List<String> = emptyList(),
)

object BotBus {

    private val listeners = mutableSetOf<(BotUi) -> Unit>()
    private val stateLock = Any()

    @Volatile
    var ui: BotUi = BotUi()
        private set

    /**
     * Ubah state lalu kabari semua listener.
     *
     * `block` menerima [BotUi] sebagai receiver (jadi bisa langsung
     * `serviceRunning = true`), dijalankan di atas salinan supaya pembaca
     * state nggak pernah melihat objek yang setengah jadi.
     */
    fun publish(block: BotUi.() -> Unit) {
        val next = synchronized(stateLock) { ui.copy().apply(block) }
        ui = next

        val snapshot = synchronized(listeners) { listeners.toList() }
        for (l in snapshot) {
            try {
                l(next)
            } catch (_: Exception) {
                // satu listener error jangan sampai ngeblok yang lain
            }
        }
    }

    /** Daftarkan listener. Langsung dipanggil sekali dengan state saat ini. */
    fun subscribe(l: (BotUi) -> Unit) {
        synchronized(listeners) { listeners.add(l) }
        l(ui)
    }

    fun unsubscribe(l: (BotUi) -> Unit) {
        synchronized(listeners) { listeners.remove(l) }
    }

    /** Reset ke kondisi awal — dipakai waktu service dimatikan. */
    fun reset() {
        publish {
            serviceRunning = false
            engineRunning = false
            busy = false
            waConnected = false
            nextCheckAt = null
            qr = null
            setupState = null
        }
    }
}
