package com.xykals.warelease

import java.security.SecureRandom

/**
 * Token rahasia untuk WS bridge 127.0.0.1 (app <-> engine Node).
 *
 * Loopback di Android bisa dibuka app lain yang punya izin INTERNET, jadi tanpa
 * token siapa pun di HP bisa mengirim perintah ke engine (ubah setting, putus
 * WA, kirim pesan). Token dikirim ke engine lewat env WR_WS_TOKEN dan dibawa
 * WsClient sebagai header X-WR-Token.
 */
object BridgeToken {
    private val acak = SecureRandom()

    // Satu token per proses, bukan per BotService: nodejs-mobile cuma bisa start
    // sekali per proses, jadi kalau service dibuat ulang tanpa prosesnya mati,
    // engine masih memegang token yang pertama.
    val proses: String by lazy { baru() }

    fun baru(): String {
        val b = ByteArray(32)
        acak.nextBytes(b)
        return b.joinToString("") { "%02x".format(it) }
    }
}
