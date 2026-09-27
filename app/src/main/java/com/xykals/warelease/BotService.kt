package com.xykals.warelease

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.content.ContextCompat
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.TimeUnit

/**
 * Foreground service: pemegang "rumah" bot.
 *  - menyalakan proses Node (NodeBridge)
 *  - membaca event dari engine (FileBridge + WsClient)
 *  - meneruskan perintah dari UI ke engine
 *  - menjaga notifikasi status
 */
class BotService : Service() {

    companion object {
        private const val CHANNEL_ID = "wa_release_bot_service"
        private const val NOTIF_ID = 42

        @Volatile
        var isRunning = false
            private set

        var instance: BotService? = null
            private set

        fun start(ctx: Context) {
            val i = Intent(ctx, BotService::class.java)
            if (Build.VERSION.SDK_INT >= 26) ContextCompat.startForegroundService(ctx, i)
            else ctx.startService(i)
        }

        fun stop(ctx: Context) {
            ctx.stopService(Intent(ctx, BotService::class.java))
        }
    }

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    /**
     * ⚠️ JANGAN dipindah jadi `private val settings = SettingsStore(this)`.
     *
     * Service dibikin Android begini urutannya:
     *     new BotService()   ← constructor + semua `val` di bawah ini jalan
     *     service.attach(ctx)     ← baru DI SINI Context-nya dipasang
     *     service.onCreate()
     *
     * Jadi di dalam constructor, `this` itu Context yang masih kosong — isinya
     * null. `SettingsStore(this)` manggil getSharedPreferences() dan langsung
     * NullPointerException. Crash-nya kejadian di thread utama waktu service
     * dibikin, jadi SELURUH app mati: "aplikasi terhenti".
     *
     * Itu sebabnya field ini `lateinit` dan diisi di onCreate().
     */
    private lateinit var settings: SettingsStore

    private lateinit var dataDir: File
    private var fileBridge: FileBridge? = null
    private var ws: WsClient? = null
    private val logBuffer = ArrayDeque<String>()

    override fun onCreate() {
        super.onCreate()
        // Di sinilah Context-nya udah benar-benar siap.
        settings = SettingsStore(this)
        LogRecorder.init(this)
        LogRecorder.tulis("Service", "BotService.onCreate — folder log: ${LogRecorder.dir?.absolutePath}")
        createNotifChannel()
        startForeground(NOTIF_ID, buildNotif("Service aktif — bot siap"))

        dataDir = File(filesDir, "wa_release_bot").apply { mkdirs() }

        val bundleOk = ensureBundle()
        writeConfig()

        fileBridge = FileBridge(dataDir, scope).also {
            it.onEvent = { handleEvent(it) }
            it.start()
        }

        if (bundleOk) {
            val env = mapOf(
                "WR_DATA_DIR" to dataDir.absolutePath,
                "WR_WS_PORT" to "18790",
                "NODE_ENV" to "production"
            )
            NodeBridge.start(File(dataDir, "bundle.cjs").absolutePath, env)
            ws = WsClient("ws://127.0.0.1:18790", scope).also { it.connect() }
            appendLog("Proses Node dinyalakan (bundle.cjs).")
        } else {
            LogRecorder.galat("Service", "bundle.cjs nggak ada di assets", null)
            BotBus.publish {
                engineError =
                    "bundle.cjs tidak ditemukan di assets. Build ulang APK lewat GitHub Actions, atau jalankan langkah 'Build Lokal' di README."
            }
        }

        isRunning = true
        instance = this
        BotBus.publish { serviceRunning = true }

        // Kalau setting sudah valid → langsung jalanin engine-nya
        if (bundleOk && settings.hasValidSettings()) {
            sendCmd(mapOf("type" to "start"))
        }

        scheduleWatchdog()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            "ACTION_CHECK" -> sendCmd(mapOf("type" to "check"))
        }
        return START_STICKY
    }

    // Dipanggil kalau Android membunuh service (RAM sempit / di-swipe).
    // Dicatat biar ketahuan kenapa bot-nya diam.
    override fun onTaskRemoved(rootIntent: Intent?) {
        LogRecorder.tulis("Service", "onTaskRemoved — app di-swipe dari daftar recent")
        super.onTaskRemoved(rootIntent)
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        LogRecorder.tulis("Service", "BotService.onDestroy — service dihentikan")
        isRunning = false
        instance = null
        BotBus.publish { serviceRunning = false }
        ws?.close()
        scope.cancel()
        super.onDestroy()
    }

    // ----------------------------- node & bridge -----------------------------

    private fun ensureBundle(): Boolean {
        val dest = File(dataDir, "bundle.cjs")
        return try {
            if (!dest.exists() || dest.length() == 0L) {
                assets.open("node/bundle.cjs").use { ins ->
                    dest.outputStream().use { ins.copyTo(it) }
                }
                appendLog("bundle.cjs di-extract dari assets (${dest.length() / 1024 / 1024} MB).")
            }
            true
        } catch (e: Exception) {
            Log.e("BotService", "bundle.cjs tidak ada di assets", e)
            false
        }
    }

    private fun writeConfig() {
        try {
            if (settings.hasValidSettings()) {
                File(dataDir, "config.json").writeText(settings.toConfigJson().toString(2))
            }
        } catch (_: Exception) {
        }
    }

    /** Kirim perintah ke engine (WS fast path, fallback file). */
    fun sendCmd(cmd: Map<String, Any>) {
        val json = JSONObject(cmd)
        if (ws?.send(json.toString()) != true) {
            fileBridge?.send(json)
        }
    }

    private fun handleEvent(e: JSONObject) {
        when (e.optString("type")) {
            "log" -> appendLog(e.optString("msg"))

            "status" -> BotBus.publish {
                engineRunning = e.optBoolean("running")
                busy = e.optBoolean("busy")
                waLinked = e.optBoolean("waLinked")
                waConnected = e.optBoolean("waConnected")
                lastTag = e.optString("lastTag", "").orNull()
                lastPostedAt = e.optString("lastPostedAt", "").orNull()
                postCount = e.optInt("postCount", 0)
                lastCheckAt = e.optLong("lastCheckAt", 0L).takeIf { it > 0 }
                nextCheckAt = e.optLong("nextCheckAt", 0L).takeIf { it > 0 }
                repo = e.optString("repo", "").orNull()
                channel = e.optString("channel", "").orNull()
                channelNama = e.optString("channelName", "").orNull()
            }

            "qr" -> BotBus.publish { qr = e.optString("qr", "").orNull() }

            "setup_start" -> BotBus.publish { setupState = "starting" }
            "setup_done" -> BotBus.publish {
                setupState = "done"
                qr = null
            }

            "setup_error" -> BotBus.publish {
                setupState = "error"
                qr = null
            }

            "posted" -> {
                val tag = e.optString("tag")
                updateNotif("Release $tag udah diposting ke channel")
            }

            // Bot selesai bikin channel baru: simpan JID-nya biar nggak perlu
            // disalin manual, lalu kabari UI lewat BotBus.
            "channel_dibuat" -> {
                val jid = e.optString("jid")
                val nama = e.optString("nama", "").orNull()
                val link = e.optString("link", "").orNull()
                if (jid.isNotBlank()) {
                    settings.channel = jid
                    appendLog("Channel baru disimpan ke setting: $jid")
                    if (link != null) appendLog("Link channel (buat dibagikan): $link")
                    BotBus.publish {
                        channel = jid
                        channelNama = nama
                        channelBaru = jid
                    }
                }
            }

            "channel_gagal" -> appendLog("Gagal bikin channel: " + e.optString("msg"))

            "cmd_error" -> appendLog("⚠️ " + e.optString("msg"))

            else -> Unit
        }
    }

    /**
     * Log dari engine (Node) masuk ke dua tempat:
     *  - buffer di memori → ditampilkan di kartu Log
     *  - folder Android/media/<paket>/log/mesin.log → bisa dibuka/dikirim user
     *
     * Yang lama (bot.log di dalam dataDir) tetap ditulis, tapi itu ada di
     * /data/data/... yang nggak bisa dibuka siapa-siapa tanpa root. Percuma
     * buat debugging di HP — itu sebabnya LogRecorder dipakai.
     */
    private fun appendLog(msg: String) {
        val line =
            "[" + SimpleDateFormat("HH:mm:ss", Locale.US).format(Date()) + "] $msg"
        synchronized(logBuffer) {
            logBuffer.addLast(line)
            while (logBuffer.size > 200) logBuffer.removeFirst()
            val copy = logBuffer.toList()
            BotBus.publish { log = copy }
        }
        LogRecorder.mesin(line)
        if (::dataDir.isInitialized) {
            try {
                File(dataDir, "bot.log").appendText(line + "\n")
            } catch (_: Exception) {
            }
        }
    }

    // ----------------------------- notifikasi & watchdog -----------------------------

    private fun createNotifChannel() {
        val nm = getSystemService(NotificationManager::class.java)
        val ch = NotificationChannel(
            CHANNEL_ID,
            "Layanan Bot",
            NotificationManager.IMPORTANCE_LOW
        )
        ch.description = "Status bot wa-release-bot (cek release GitHub)"
        nm.createNotificationChannel(ch)
    }

    private fun buildNotif(text: String): Notification =
        Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notif)
            .setContentTitle("WA Release Bot")
            .setContentText(text)
            .setOngoing(true)
            .build()

    private fun updateNotif(text: String) {
        try {
            getSystemService(NotificationManager::class.java).notify(NOTIF_ID, buildNotif(text))
        } catch (_: Exception) {
        }
    }

    private fun scheduleWatchdog() {
        val minutes = settings.intervalMinutes.coerceAtLeast(15).toLong()
        val request = PeriodicWorkRequestBuilder<BotWatchdogWorker>(minutes, TimeUnit.MINUTES).build()
        WorkManager.getInstance(this)
            .enqueueUniquePeriodicWork("bot-watchdog", ExistingPeriodicWorkPolicy.KEEP, request)
    }

    private fun String?.orNull(): String? = this?.ifEmpty { null }
}
