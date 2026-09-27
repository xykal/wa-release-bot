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
/** Satu orang di daftar hitam otomatis penjaga grup. */
data class OrangHitam(val kunci: String, val label: String, val sejak: Long?)

/** Satu script bot (plugin) yang kepasang. */
data class ScriptBot(
    val file: String,
    val nama: String,
    val versi: String,
    val deskripsi: String,
    val perintah: List<String>,
    val error: String?,
)

/** Satu respons follower buat Pertanyaan di channel. */
data class Respons(val nama: String, val teks: String, val t: Long?, val dibalas: Boolean)

/** Hasil "Lihat respons". */
data class HasilRespons(
    val ok: Boolean,
    val judul: String?,
    val pesan: String?,
    val items: List<Respons>,
)

data class BotUi(
    var serviceRunning: Boolean = false,
    var engineRunning: Boolean = false,
    var busy: Boolean = false,
    var waLinked: Boolean = false,
    var waConnected: Boolean = false,
    // Nomor WA yang tertaut (mis. "6283116632566") — buat banner "SUDAH TERTAUT".
    var waNomor: String? = null,
    var mode: String = "berkala",
    var pluginJumlah: Int = 0,
    var scriptBot: List<ScriptBot> = emptyList(),
    var scriptBotSeq: Int = 0,
    var respons: HasilRespons? = null,
    var responsSeq: Int = 0,
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
    // Pairing code 8 huruf (format ABCD-1234) — ditampilkan di lembar khusus.
    var pairingCode: String? = null,
    var grupAktif: Boolean = false,
    var grupNama: String? = null,
    var grupDisetujui: Int = 0,
    var grupDitolak: Int = 0,
    var grupHitam: Int = 0,
    // Daftar hitam lengkap (dikirim engine tiap diminta / berubah).
    // `daftarHitamSeq` naik tiap ada kiriman baru → UI tau harus refresh.
    var daftarHitam: List<OrangHitam> = emptyList(),
    var daftarHitamManual: List<String> = emptyList(),
    var daftarHitamSeq: Int = 0,
    var grupLastCekAt: Long? = null,
    var nextGrupAt: Long? = null,
    var engineError: String? = null,
    var setupState: String? = null, // null | starting | done | error
    // Tahapan setup buat ditampilkan (mis. "Diterima WhatsApp! Nyelesaiin tautan...")
    var setupTahap: String? = null,
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
            pairingCode = null
            setupState = null
        }
    }
}
