package com.xykals.warelease

/**
 * State bersama antara BotService (thread IO) dan MainActivity (thread main).
 * Sangat sederhana: satu objek immutable + listener.
 */
data class BotUi(
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

object BotBus {
    private val listeners = mutableSetOf<(BotUi) -> Unit>()

    @Volatile
    var ui: BotUi = BotUi()
        private set

    fun publish(block: BotUi.() -> BotUi) {
        ui = ui.block()
        val snapshot = synchronized(listeners) { listeners.toList() }
        for (l in snapshot) {
            try {
                l(ui)
            } catch (_: Exception) {
            }
        }
    }

    fun subscribe(l: (BotUi) -> Unit) {
        synchronized(listeners) { listeners.add(l) }
        l(ui)
    }

    fun unsubscribe(l: (BotUi) -> Unit) {
        synchronized(listeners) { listeners.remove(l) }
    }
}
