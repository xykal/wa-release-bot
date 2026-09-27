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
                val kode = startNode(scriptPath, env, true)
                // Node cuma balik ke sini kalau event loop-nya berhenti
                // (mis. `process.exit()` di bundle, atau libnode-nya ngamuk).
                LogRecorder.galat("NodeBridge", "proses Node berhenti sendiri (exit $kode)", null)
                BotBus.publish {
                    engineError = "Engine Node berhenti (exit $kode). Lihat log, lalu tekan Mulai."
                }
            } catch (t: Throwable) {
                // Termasuk UnsatisfiedLinkError kalau libnode.so nggak bisa dimuat
                LogRecorder.galat("NodeBridge", "thread Node mati", t)
                BotBus.publish { engineError = "Engine Node gagal jalan: ${t.message}" }
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
