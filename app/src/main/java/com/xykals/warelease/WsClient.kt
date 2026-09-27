package com.xykals.warelease

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.util.concurrent.TimeUnit

/**
 * Fast path (opsional): kirim perintah ke engine lewat WebSocket 127.0.0.1.
 * Kalau WS nggak bisa connect, otomatis fallback ke file bridge (FileBridge).
 */
class WsClient(
    private val url: String,
    private val scope: CoroutineScope
) {
    @Volatile
    var isOpen = false
        private set

    // Nggak pakai ping: ini koneksi 127.0.0.1 ke proses sendiri, nggak ada
    // router/NAT yang bisa mutus. Dulu ping tiap 15 dtk = bangunin CPU
    // 5.760x sehari buat hal yang nggak perlu.
    private val client = OkHttpClient.Builder()
        .connectTimeout(5, TimeUnit.SECONDS)
        .build()

    private var ws: WebSocket? = null

    fun connect() {
        val request = Request.Builder().url(url).build()
        scope.launch {
            while (isActive) {
                try {
                    ws = client.newWebSocket(request, object : WebSocketListener() {
                        override fun onOpen(webSocket: WebSocket, response: Response) {
                            isOpen = true
                        }

                        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                            isOpen = false
                        }

                        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                            isOpen = false
                        }
                    })
                    delay(15_000)
                } catch (_: Exception) {
                }
                if (isOpen) break
                delay(10_000)
            }
        }
    }

    /** @return true kalau perintah terkirim via WS (false = pakai file bridge) */
    fun send(cmd: String): Boolean =
        if (isOpen) {
            ws?.send(cmd)
            true
        } else {
            false
        }

    fun close() {
        isOpen = false
        try {
            ws?.close(1000, "bye")
        } catch (_: Exception) {
        }
        client.dispatcher.executorService.shutdown()
    }
}
