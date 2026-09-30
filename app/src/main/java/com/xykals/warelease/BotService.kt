package com.xykals.warelease

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.Network
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
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
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
        // Channel terpisah (IMPORTANCE_HIGH) buat kegagalan kirim: notifikasi
        // service-nya sengaja senyap, tapi "3x gagal" harus kelihatan.
        private const val CHANNEL_GAGAL_ID = "wa_release_bot_gagal"
        private const val NOTIF_GAGAL_ID = 43

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
        startForeground(NOTIF_ID, buildNotif(getString(R.string.k_service_aktif_bot_siap)))

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
        BotBus.publish {
            serviceRunning = true
            // sisa tampilan setup dari service sebelumnya nggak berlaku lagi
            qr = null
            pairingCode = null
            setupState = null
            setupTahap = null
        }

        // Kalau setting sudah valid → langsung jalanin engine-nya
        if (bundleOk && settings.hasValidSettings()) {
            sendCmd(mapOf("type" to "start"))
        }
        // Minta engine ngirim status terbaru (kalau engine-nya ternyata masih
        // jalan dari sebelumnya, event lama udah dibuang — jadi perlu disegerin).
        if (bundleOk) {
            scope.launch {
                delay(1_500L)
                sendCmd(mapOf("type" to "status"))
            }
        }

        scheduleWatchdog()
        pantauJaringan()
    }

    // ----------------------------- jaringan -----------------------------

    private var jaringanCb: ConnectivityManager.NetworkCallback? = null

    /**
     * HP nyala tanpa internet → cek pertama engine gagal. Daripada nunggu
     * jadwal berikutnya (bisa 15 menit), begitu internet nyambung langsung
     * suruh cek. Callback ini dari sistem — nggak ada polling, gratis batre.
     */
    private fun pantauJaringan() {
        try {
            val cm = getSystemService(ConnectivityManager::class.java) ?: return
            var sudahAdaJaringan = cm.activeNetwork != null
            val cb = object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) {
                    if (sudahAdaJaringan) {
                        // callback pertama pas daftar — jaringannya emang udah ada
                        sudahAdaJaringan = false
                        return
                    }
                    val st = BotBus.ui
                    val last = st.lastCheckAt ?: 0L
                    if (st.engineRunning && System.currentTimeMillis() - last > 2 * 60_000L) {
                        LogRecorder.tulis("Jaringan", "internet nyambung lagi → suruh engine cek")
                        scope.launch {
                            delay(5_000) // kasih waktu DNS dll siap
                            sendCmd(mapOf("type" to "check"))
                        }
                    }
                }

                override fun onLost(network: Network) {
                    sudahAdaJaringan = false
                }
            }
            cm.registerDefaultNetworkCallback(cb)
            jaringanCb = cb
        } catch (e: Throwable) {
            LogRecorder.galat("Jaringan", "nggak bisa pantau jaringan", e)
        }
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
        // Mesin Node nggak bisa dimatiin tanpa matiin seluruh app (batasan
        // nodejs-mobile), jadi dia disuruh BERHENTI dulu: jadwal cek rilis &
        // grup dimatiin, koneksi WA ditutup. Lewat file (WS keburu ditutup).
        try {
            fileBridge?.send(org.json.JSONObject().put("type", "stop"))
        } catch (_: Throwable) {
        }
        BotBus.publish {
            serviceRunning = false
            engineRunning = false
            busy = false
            waConnected = false
            nextCheckAt = null
            nextGrupAt = null
            qr = null
            pairingCode = null
            setupTahap = null
        }
        try {
            jaringanCb?.let { getSystemService(ConnectivityManager::class.java)?.unregisterNetworkCallback(it) }
        } catch (_: Throwable) {
        }
        ws?.close()
        scope.cancel()
        super.onDestroy()
    }

    // ----------------------------- node & bridge -----------------------------

    /**
     * Salin engine (bundle.cjs) dari dalam APK ke folder data.
     *
     * ⚠️ Dulu cuma disalin kalau file-nya BELUM ADA. Akibatnya: habis update
     * APK, engine yang jalan tetap engine LAMA dari instalasi pertama — fitur
     * & perbaikan di bundle baru nggak pernah kepakai. Sekarang ditandai pakai
     * versionCode + waktu update APK; beda sedikit aja → salin ulang.
     */
    private fun ensureBundle(): Boolean {
        val dest = File(dataDir, "bundle.cjs")
        val stampFile = File(dataDir, "bundle.stamp")
        val stamp = try {
            val info = packageManager.getPackageInfo(packageName, 0)
            "${BuildConfig.VERSION_CODE}:${info.lastUpdateTime}"
        } catch (_: Exception) {
            "${BuildConfig.VERSION_CODE}"
        }
        return try {
            val lama = if (stampFile.exists()) stampFile.readText().trim() else ""
            if (!dest.exists() || dest.length() == 0L || lama != stamp) {
                val tmp = File(dataDir, "bundle.cjs.tmp")
                assets.open("node/bundle.cjs").use { ins ->
                    tmp.outputStream().use { ins.copyTo(it) }
                }
                if (dest.exists()) dest.delete()
                if (!tmp.renameTo(dest)) tmp.copyTo(dest, overwrite = true)
                stampFile.writeText(stamp)
                appendLog(
                    "Engine (bundle.cjs) disalin dari APK — ${dest.length() / 1024} KB, versi app ${BuildConfig.VERSION_NAME}."
                )
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

    /** Dipanggil MainActivity: app kebuka → polling cepat, di belakang → santai. */
    fun setUiTerlihat(terlihat: Boolean) {
        fileBridge?.uiTerlihat = terlihat
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
                grupAktif = e.optBoolean("grupAktif")
                grupNama = e.optString("grupNama", "").orNull()
                grupDisetujui = e.optInt("grupDisetujui", 0)
                grupDitolak = e.optInt("grupDitolak", 0)
                grupHitam = e.optInt("grupHitam", 0)
                grupLastCekAt = e.optLong("grupLastCekAt", 0L).takeIf { it > 0 }
                nextGrupAt = e.optLong("nextGrupAt", 0L).takeIf { it > 0 }
                laguAktif = e.optBoolean("laguAktif")
                laguCount = e.optInt("laguCount", 0)
                laguJudul = e.optString("laguJudul", "").orNull()
                laguJatah = e.optString("laguJatah", "").orNull()
                nextLaguAt = e.optLong("nextLaguAt", 0L).takeIf { it > 0 }
                // bot WA umum (M14/M15)
                jagaAktif = e.optBoolean("jagaAktif")
                moderasiAktif = e.optBoolean("moderasiAktif")
                moderasiHapus = e.optInt("moderasiHapus", 0)
                moderasiPeringatan = e.optInt("moderasiPeringatan", 0)
                moderasiKick = e.optInt("moderasiKick", 0)
                perintahJalan = e.optInt("perintahJalan", 0)
                stikerDibuat = e.optInt("stikerDibuat", 0)
                storyDikirim = e.optInt("storyDikirim", 0)
                perangkat = e.optString("perangkat", "").orNull()
            }

            "hosting_status" -> BotBus.publish {
                hosting = HostingUi(
                    status = e.optString("status", "kosong"),
                    pesan = e.optString("pesan", ""),
                    nama = e.optString("nama", "").orNull(),
                    versi = e.optString("versi", "").orNull(),
                    file = e.optString("file", "").orNull(),
                    node = e.optString("node", "").orNull(),
                    ada = e.optBoolean("ada"),
                    punyaModul = e.optBoolean("punyaModul"),
                    autoRestart = e.optBoolean("autoRestart", true),
                    mulaiPada = e.optLong("mulaiPada", 0L).takeIf { it > 0 }
                )
            }

            "hosting_log" -> {
                val arr = e.optJSONArray("baris")
                val baru = (0 until (arr?.length() ?: 0)).mapNotNull { i ->
                    val o = arr?.optJSONObject(i) ?: return@mapNotNull null
                    BarisKonsol(o.optString("j", "out"), o.optString("b", ""))
                }
                val penuh = e.optBoolean("penuh")
                BotBus.publish {
                    hostingLog = (if (penuh) baru else hostingLog + baru).takeLast(400)
                    hostingLogSeq += 1
                }
            }

            "lagu_terkirim" -> updateNotif("Lagu terkirim ke channel: " + e.optString("judul"))

            "qr" -> BotBus.publish { qr = e.optString("qr", "").orNull() }

            "daftar_hitam" -> {
                val oto = e.optJSONArray("otomatis")
                val man = e.optJSONArray("manual")
                val daftar = (0 until (oto?.length() ?: 0)).mapNotNull { i ->
                    val o = oto?.optJSONObject(i) ?: return@mapNotNull null
                    OrangHitam(
                        o.optString("kunci"),
                        o.optString("label", o.optString("kunci")),
                        o.optLong("sejak", 0L).takeIf { it > 0 }
                    )
                }
                val manual = (0 until (man?.length() ?: 0)).map { man!!.optString(it) }
                BotBus.publish {
                    daftarHitam = daftar
                    daftarHitamManual = manual
                    daftarHitamSeq += 1
                }
            }

            // Engine minta foto dikonversi jadi stiker WebP (lihat Stiker.kt).
            // Dikerjakan di thread lain supaya pembacaan event nggak nyangkut.
            // Engine minta foto dikonversi jadi stiker WebP (lihat Stiker.kt).
            // Fotonya dititipkan sebagai berkas di dataDir — jembatannya sama,
            // app dan mesin Node jalan di satu sandbox — karena bridge WS
            // batasnya 1 MB dan foto WhatsApp gampang lewat batas itu.
            // Dikerjakan di thread lain supaya pembacaan event nggak nyangkut.
            "minta_stiker" -> {
                val id = e.optString("id")
                val masuk = e.optString("file")
                if (id.isNotEmpty() && masuk.isNotEmpty()) {
                    scope.launch { buatStiker(id, masuk) }
                }
            }

            "pairing_code" -> BotBus.publish { pairingCode = e.optString("code", "").orNull() }

            "setup_start" -> BotBus.publish {
                setupState = "starting"
                setupTahap = null
                setupMode = e.optString("mode", "").orNull()
            }

            "setup_tahap" -> BotBus.publish { setupTahap = e.optString("msg", "").orNull() }
            "setup_done" -> {
                BotBus.publish {
                    setupState = "done"
                    setupTahap = null
                    setupMode = null
                    waLinked = true
                    qr = null
                    pairingCode = null
                }
                updateNotif(getString(R.string.k_whatsapp_tertaut_bot_siap))
            }

            "setup_error" -> BotBus.publish {
                setupState = "error"
                setupTahap = null
                setupMode = null
                qr = null
                pairingCode = null
            }

            "posted" -> {
                val tag = e.optString("tag")
                updateNotif(getString(R.string.k_release_udah_diposting_ke_channel, tag))
                cancelNotifGagal()
            }

            // Percobaan terakhir kirim release gagal (engine sudah lapor ke chat
            // diri sendiri kalau socket-nya ada). Di sini: notifikasi yang nyaring.
            "gagal_kirim" -> {
                val tag = e.optString("tag")
                val repo = e.optString("repo")
                val ke = e.optInt("percobaan", 0)
                val maks = e.optInt("maks", 3)
                val err = e.optString("error").take(200)
                notifGagal(
                    getString(R.string.k_gagal_kirim, tag, repo),
                    getString(R.string.k_dari_percobaan_gagal_bot_berhenti, ke, maks, err)
                )
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
    /**
     * Foto (berkas di dataDir, dari engine) -> stiker WebP (berkas juga).
     * Nama berkas dari engine selalu `stiker/...`; di sini cuma nama filenya
     * yang dipakai dan digabung ulang ke folder stiker, jadi path aneh dari
     * luar nggak bisa nyasar ke berkas lain.
     */
    private fun buatStiker(id: String, berkasMasuk: String) {
        val dir = File(dataDir, "stiker").apply { mkdirs() }
        val masuk = File(dir, File(berkasMasuk).name)
        val hasil = try {
            if (masuk.isFile) Stiker.dariByte(masuk.readBytes()) else null
        } catch (e: Throwable) {
            LogRecorder.galat("Stiker", "baca foto gagal", e)
            null
        } finally {
            masuk.delete()
        }
        if (hasil == null) {
            appendLog("Stiker gagal: gambarnya nggak kebaca.")
            sendCmd(mapOf("type" to "stiker-jadi", "id" to id, "gagal" to "decode"))
            return
        }
        val keluar = File(dir, "keluar-$id.webp")
        try {
            keluar.writeBytes(hasil.data)
            sendCmd(
                mapOf(
                    "type" to "stiker-jadi",
                    "id" to id,
                    "file" to "stiker/${keluar.name}",
                    "kb" to hasil.kb
                )
            )
        } catch (e: Throwable) {
            LogRecorder.galat("Stiker", "tulis stiker gagal", e)
            sendCmd(mapOf("type" to "stiker-jadi", "id" to id, "gagal" to "tulis"))
        }
    }

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
            getString(R.string.k_layanan_bot),
            NotificationManager.IMPORTANCE_LOW
        )
        ch.description = getString(R.string.k_status_bot_wa_release_bot)
        nm.createNotificationChannel(ch)
        val gagal = NotificationChannel(
            CHANNEL_GAGAL_ID,
            getString(R.string.k_gagal_kirim_release),
            NotificationManager.IMPORTANCE_HIGH
        )
        gagal.description = getString(R.string.k_muncul_kalau_release_gagal_dikirim)
        nm.createNotificationChannel(gagal)
    }

    private fun notifGagal(judul: String, isi: String) {
        try {
            val buka = PendingIntent.getActivity(
                this, 0, Intent(this, MainActivity::class.java),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            val n = Notification.Builder(this, CHANNEL_GAGAL_ID)
                .setSmallIcon(R.drawable.ic_notif)
                .setContentTitle(judul)
                .setContentText(isi)
                .setStyle(Notification.BigTextStyle().bigText(isi))
                .setContentIntent(buka)
                .setAutoCancel(true)
                .build()
            getSystemService(NotificationManager::class.java).notify(NOTIF_GAGAL_ID, n)
        } catch (_: Exception) {
            // Izin POST_NOTIFICATIONS ditolak: log di kartu Log tetap ada.
        }
    }

    private fun cancelNotifGagal() {
        try {
            getSystemService(NotificationManager::class.java).cancel(NOTIF_GAGAL_ID)
        } catch (_: Exception) {
        }
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
