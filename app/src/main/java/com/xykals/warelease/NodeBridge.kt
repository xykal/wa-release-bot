package com.xykals.warelease

/**
 * Jembatan ke native: menjalankan Node.js (nodejs-mobile) di thread khusus.
 * Native-nya (native-lib.cpp) memanggil node::Start() dari libnode.so.
 */
object NodeBridge {

    private var thread: Thread? = null

    val isAlive: Boolean
        get() = thread?.isAlive == true

    @Synchronized
    fun start(scriptPath: String, env: Map<String, String>) {
        if (isAlive) return
        val t = Thread({
            try {
                startNode(scriptPath, env, true)
            } catch (t: Throwable) {
                android.util.Log.e("NodeBridge", "Node thread crash", t)
                BotBus.publish { engineError = "Node thread crash: ${t.message}" }
            }
        }, "wa-bot-node")
        t.start()
        thread = t
    }

    private external fun startNode(
        scriptPath: String,
        env: Map<String, String>,
        redirectLogcat: Boolean
    ): Int
}
