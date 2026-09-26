package com.xykals.warelease

/**
 * State bersama antara BotService (thread IO) dan MainActivity (thread main).
 *
 * Desain: satu objek mutable di balik lock + snapshot immutable untuk UI.
 * Call-site:  BotBus.publish { engineRunning = true }
 */
data class BotUiSnapshot(
    val serviceRunning: Boolean = false,
    val engineRunning: Boolean = false,
    val busy: Boolean = false,
    val waLinked: Boolean = false,
    val waConnected: Boolean = false,
    val lastTag: String? = null,
    val lastPostedAt: String? = null,
    val postCount: Int = 0,
    val lastCheckAt: Long? = null,
    val nextCheckAt: Long? = null,
    val repo: String? = null,
    val channel: String? = null,
    val qr: String? = null,
    val engineError: String? = null,
    val setupState: String? = null, // null | starting | done | error
    val log: List<String> = emptyList()
)

class BotUiMutable {
    var serviceRunning = false
    var engineRunning = false
    var busy = false
    var waLinked = false
    var waConnected = false
    var lastTag: String? = null
    var lastPostedAt: String? = null
    var postCount = 0
    var lastCheckAt: Long? = null
    var nextCheckAt: Long? = null
    var repo: String? = null
    var channel: String? = null
    var qr: String? = null
    var engineError: String? = null
    var setupState: String? = null
    var log: List<String> = emptyList()

    fun snapshot() = BotUiSnapshot(
        serviceRunning, engineRunning, busy, waLinked, waConnected,
        lastTag, lastPostedAt, postCount, lastCheckAt, nextCheckAt,
        repo, channel, qr, engineError, setupState, log
    )
}

object BotBus {
    private val m = BotUiMutable()
    private val listeners = mutableSetOf<(BotUiSnapshot) -> Unit>()

    /** Snapshot immutable — aman dibaca dari thread mana pun. */
    val snapshot: BotUiSnapshot
        get() = synchronized(m) { m.snapshot() }

    /** Mutasi state + notifikasi listener dengan snapshot terbaru. */
    fun publish(block: BotUiMutable.() -> Unit) {
        val snap = synchronized(m) {
            m.block()
            m.snapshot()
        }
        val copy = synchronized(listeners) { listeners.toList() }
        for (l in copy) {
            try {
                l(snap)
            } catch (_: Exception) {
            }
        }
    }

    fun subscribe(l: (BotUiSnapshot) -> Unit) {
        synchronized(listeners) { listeners.add(l) }
        l(snapshot)
    }

    fun unsubscribe(l: (BotUiSnapshot) -> Unit) {
        synchronized(listeners) { listeners.remove(l) }
    }
}
