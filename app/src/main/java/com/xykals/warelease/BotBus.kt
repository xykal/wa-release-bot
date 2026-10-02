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
/** Satu orang di daftar hitam. nama = pushname WA kalau engine kebaca (boleh null). */
data class OrangHitam(val kunci: String, val label: String, val sejak: Long?, val nama: String? = null)

/** Satu baris konsol bot custom. jenis: out | err | sys | in */
data class BarisKonsol(val jenis: String, val teks: String)

data class HostingUi(
    val status: String = "kosong", // kosong | siap | install | jalan | mati | error
    val pesan: String = "",
    val nama: String? = null,
    val versi: String? = null,
    val file: String? = null,
    val node: String? = null,
    val ada: Boolean = false,
    val punyaModul: Boolean = false,
    val autoRestart: Boolean = true,
    val mulaiPada: Long? = null,
    val sha256: String? = null,
    val setuju: Boolean = false,
)

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
    // Pesan singkat dari engine buat ditampilkan sebagai banner di layar utama
    // (mis. hasil tombol "Kirim menu ke chat"). `bannerSeq` naik tiap pesan baru
    // supaya banner yang sama nggak muncul dua kali waktu state dipublikasikan ulang.
    var bannerPesan: String? = null,
    var bannerSeq: Int = 0,
    // Pairing code 8 huruf (format ABCD-1234) — ditampilkan di lembar khusus.
    var pairingCode: String? = null,
    // Cara nautin yang lagi jalan: "pairing" / "qr" (null = nggak lagi nautin).
    // Cuma tampilan cara ini yang boleh nongol — QR & kode nggak boleh barengan.
    var setupMode: String? = null,
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
    // lagu mood
    var laguAktif: Boolean = false,
    var laguCount: Int = 0,
    var laguJudul: String? = null,
    // "n/12": lagu yang sudah diminta perangkat ini hari ini / jatah harian Worker
    var laguJatah: String? = null,
    var nextLaguAt: Long? = null,
    // pertanyaan mood (ngejoks — postingan "Pertanyaan" di channel)
    var lawakAktif: Boolean = false,
    var lawakCount: Int = 0,
    var lawakTanya: String? = null,
    var nextTanyaAt: Long? = null,
    // bot WA umum (M14/M15): moderasi grup, perintah pribadi, stiker, story
    var jagaAktif: Boolean = false,
    var moderasiAktif: Boolean = false,
    var moderasiHapus: Int = 0,
    var moderasiPeringatan: Int = 0,
    var moderasiKick: Int = 0,
    var perintahJalan: Int = 0,
    var stikerDibuat: Int = 0,
    var storyDikirim: Int = 0,
    var perangkat: String? = null,
    // pesan berkala ke grup (daftar hitam / teks sendiri)
    var berkalaAktif: Boolean = false,
    var berkalaJam: Int = 0,
    var berkalaCount: Int = 0,
    var berkalaTerakhir: String? = null,
    var nextBerkalaAt: Long? = null,
    var rekamChannelAktif: Boolean = false,
    var rekamChannelJumlah: Int = 0,
    var rekamChannelTerakhir: String? = null,
    // hosting bot custom
    var hosting: HostingUi = HostingUi(),
    var hostingLog: List<BarisKonsol> = emptyList(),
    var hostingLogSeq: Int = 0,
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
        val next = synchronized(stateLock) { ui.copy().apply(block).also { ui = it } }

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
