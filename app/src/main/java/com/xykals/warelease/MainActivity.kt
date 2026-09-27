package com.xykals.warelease

import android.Manifest
import android.app.Dialog
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.widget.CheckBox
import android.widget.ImageView
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import com.google.android.material.button.MaterialButton
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.textfield.TextInputEditText
import com.xykals.warelease.util.Durasi
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {

    private val handler = Handler(Looper.getMainLooper())
    private lateinit var settings: SettingsStore

    // input setting
    private lateinit var etRepo: TextInputEditText
    private lateinit var etChannel: TextInputEditText
    private lateinit var etToken: TextInputEditText
    private lateinit var etInterval: TextInputEditText
    private lateinit var cbPrerelease: CheckBox
    private lateinit var cbPostFirst: CheckBox
    private lateinit var cbTestMsg: CheckBox
    private lateinit var cbBoot: CheckBox

    // tampilan
    private lateinit var tvStatus: TextView
    private lateinit var tvError: TextView
    private lateinit var tvLog: TextView
    private lateinit var svLog: ScrollView
    private lateinit var tvFolderLog: TextView

    // QR
    private var qrDialogRef: Dialog? = null
    private var qrImage: ImageView? = null
    private var qrTerakhir: String? = null
    private var qrBitmap: Bitmap? = null
    private var qrSedangDibuat = false
    private var qrDiabaikan = false
    private var sedangTutupPaksa = false

    /**
     * Gambar QR itu 640x640 = 400 ribu piksel. Kalau digambar di thread utama
     * (main thread), layarnya beku beberapa detik — dan Android nganggap
     * aplikasinya nggak merespons → "aplikasi terhenti". Jadi digambar di
     * thread belakang, hasilnya baru dipasang ke layar.
     */
    private val qrScope = CoroutineScope(Dispatchers.Default + SupervisorJob())

    // Tipenya ditulis eksplisit: `handler.post {}` mengembalikan Boolean,
    // sedangkan BotBus.subscribe() minta (BotUi) -> Unit.
    private val busListener: (BotUi) -> Unit = { ui -> handler.post { renderUi(ui) } }

    private val notifPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        LogRecorder.init(this)
        LogRecorder.tulis("Activity", "MainActivity dibuka")

        setContentView(R.layout.activity_main)
        settings = SettingsStore(this)
        wireViews()
        loadSettingsToViews()

        if (Build.VERSION.SDK_INT >= 33) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED
            ) {
                notifPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }

    override fun onResume() {
        super.onResume()
        BotBus.subscribe(busListener)
    }

    override fun onPause() {
        BotBus.unsubscribe(busListener)
        super.onPause()
    }

    override fun onDestroy() {
        qrScope.cancel()
        tutupDialogQr()
        super.onDestroy()
    }

    // ----------------------------- tombol -----------------------------

    /**
     * Semua tombol lewat sini: dicatat ke log, dan kalau meledak nggak bikin
     * aplikasi mati — cuma muncul toast + jejaknya masuk log.
     */
    private fun pasang(id: Int, nama: String, aksi: () -> Unit) {
        findViewById<MaterialButton>(id).setOnClickListener {
            LogRecorder.tulis("Tombol", "tekan: $nama")
            try {
                aksi()
            } catch (e: Throwable) {
                LogRecorder.galat("Tombol", "\"$nama\" gagal", e)
                toast("\"$nama\" gagal: ${e.message}")
            }
        }
    }

    private fun wireViews() {
        etRepo = findViewById(R.id.etRepo)
        etChannel = findViewById(R.id.etChannel)
        etToken = findViewById(R.id.etToken)
        etInterval = findViewById(R.id.etInterval)
        cbPrerelease = findViewById(R.id.cbPrerelease)
        cbPostFirst = findViewById(R.id.cbPostFirst)
        cbTestMsg = findViewById(R.id.cbTestMsg)
        cbBoot = findViewById(R.id.cbBoot)
        tvStatus = findViewById(R.id.tvStatus)
        tvError = findViewById(R.id.tvError)
        tvLog = findViewById(R.id.tvLog)
        svLog = findViewById(R.id.svLog)
        tvFolderLog = findViewById(R.id.tvFolderLog)

        tvFolderLog.text = LogRecorder.dir?.absolutePath ?: "(folder log nggak kebaca)"

        pasang(R.id.btnSave, "Simpan Setting") { onSave() }
        pasang(R.id.btnStart, "Mulai") { withService { sendCmd(mapOf("type" to "start")) } }
        pasang(R.id.btnStop, "Jeda") { withService { sendCmd(mapOf("type" to "stop")) } }
        pasang(R.id.btnCheck, "Cek Sekarang") { withService { sendCmd(mapOf("type" to "check")) } }
        pasang(R.id.btnSetup, "Setup (Scan QR)") { withService { sendCmd(mapOf("type" to "setup")) } }
        pasang(R.id.btnTest, "Test") { withService { sendCmd(mapOf("type" to "test")) } }
        pasang(R.id.btnBikinChannel, "Bikin Channel") {
            withService { sendCmd(mapOf("type" to "bikin-channel")) }
        }
        pasang(R.id.btnBukaLog, "Buka folder log") { bukaFolderLog() }
        pasang(R.id.btnKirimLog, "Kirim log") { kirimLog() }
        pasang(R.id.btnKill, "Matikan Service") {
            MaterialAlertDialogBuilder(this)
                .setTitle("Matikan service bot?")
                .setMessage(
                    "Proses Node & semua jadwal mati sampai service dinyalakan lagi " +
                            "(tombol Mulai, atau boot HP kalau opsi boot aktif)."
                )
                .setPositiveButton("Matikan") { _, _ -> BotService.stop(this) }
                .setNegativeButton("Batal", null)
                .show()
        }
    }

    private fun loadSettingsToViews() {
        etRepo.setText(settings.repo)
        etChannel.setText(settings.channel)
        etToken.setText(settings.token)
        etInterval.setText(settings.intervalMinutes.toString())
        cbPrerelease.isChecked = settings.includePrereleases
        cbPostFirst.isChecked = settings.postOnFirstRun
        cbTestMsg.isChecked = settings.testMessageOnSetup
        cbBoot.isChecked = settings.autoStartOnBoot
    }

    private fun onSave() {
        settings.repo = etRepo.text.toString()
        settings.channel = etChannel.text.toString()
        settings.token = etToken.text.toString()
        settings.intervalMinutes = etInterval.text.toString().toIntOrNull() ?: 15
        settings.includePrereleases = cbPrerelease.isChecked
        settings.postOnFirstRun = cbPostFirst.isChecked
        settings.testMessageOnSetup = cbTestMsg.isChecked
        settings.autoStartOnBoot = cbBoot.isChecked

        if (settings.repo.isBlank()) {
            toast("Repo GitHub wajib diisi dulu (contoh: xykal/wa-release-bot).")
            return
        }
        withService {
            sendCmd(
                mapOf(
                    "type" to "configure",
                    "repo" to settings.repo,
                    "channel" to settings.channel,
                    "token" to settings.token,
                    "intervalMinutes" to settings.intervalMinutes,
                    "includePrereleases" to settings.includePrereleases,
                    "postOnFirstRun" to settings.postOnFirstRun,
                    "testMessageOnSetup" to settings.testMessageOnSetup
                )
            )
        }
        if (settings.channel.isBlank()) {
            toast("Disimpan. Channel masih kosong — tekan \"Bikin Channel\" atau tempel link channel-nya.")
        } else {
            toast("Setting disimpan.")
        }
    }

    /**
     * Jalankan aksi setelah service siap.
     *
     * Dulu ini cuma nunggu 4 detik lalu kirim perintahnya. Kalau HP-nya lambat
     * (atau bundle.cjs-nya lagi di-extract), service-nya belum kelar `onCreate`
     * → perintahnya masuk ke service yang belum punya instance → hilang tanpa
     * pesan apa-apa. Sekarang dicek terus sampai siap, maksimal ~10 detik.
     */
    private fun withService(action: () -> Unit, cobaKe: Int = 0) {
        if (BotService.instance != null) {
            action()
            return
        }

        if (cobaKe == 0) {
            try {
                LogRecorder.tulis("Service", "belum nyala — dinyalakan dulu")
                BotService.start(this)
            } catch (e: Throwable) {
                LogRecorder.galat("Service", "gagal start service", e)
                toast("Gagal start service: ${e.message}")
                return
            }
        }

        if (cobaKe >= 14) {
            LogRecorder.tulis("Service", "nyerah nunggu service siap (>10 detik)")
            toast("Service-nya lama nggak siap-siap. Coba lagi, atau cek log.")
            return
        }

        val jeda = if (cobaKe < 4) 400L else 1000L
        handler.postDelayed({ withService(action, cobaKe + 1) }, jeda)
    }

    private fun sendCmd(cmd: Map<String, Any>) {
        val svc = BotService.instance
        if (svc == null) {
            LogRecorder.tulis("Cmd", "dibuang, service belum siap: $cmd")
            toast("Service belum siap — coba lagi sebentar.")
            return
        }
        LogRecorder.tulis("Cmd", "kirim: $cmd")
        svc.sendCmd(cmd)
    }

    // ----------------------------- folder log -----------------------------

    private fun bukaFolderLog() {
        val d = LogRecorder.dir
        if (d == null) {
            toast("Folder log nggak kebaca di HP ini. Lihat logcat lewat adb.")
            return
        }
        // Coba buka pakai file manager. Nggak semua file manager ngerti tipe
        // "resource/folder", jadi kalau gagal → kasih path-nya (udah disalin).
        try {
            startActivity(
                Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(Uri.parse("file://${d.absolutePath}"), "resource/folder")
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
            )
            return
        } catch (e: Throwable) {
            LogRecorder.tulis("Log", "nggak ada file manager yang bisa buka folder: ${e.message}")
        }

        salin(d.absolutePath)
        MaterialAlertDialogBuilder(this)
            .setTitle("Folder log")
            .setMessage(
                "File manager di HP ini nggak bisa dibuka langsung dari sini. " +
                        "Path-nya udah disalin ke clipboard — tempel di file manager:\n\n${d.absolutePath}" +
                        "\n\nAtau pakai tombol \"Kirim log\" di bawah."
            )
            .setPositiveButton("Oke", null)
            .show()
    }

    private fun kirimLog() {
        val d = LogRecorder.dir
        if (d == null) {
            toast("Folder log nggak kebaca.")
            return
        }
        val berkas = d.listFiles { f -> f.isFile && f.name.contains(".log") }
            ?.sortedBy { it.name } ?: emptyList()
        if (berkas.isEmpty()) {
            toast("Belum ada file log.")
            return
        }

        val uris = ArrayList<Uri>()
        for (f in berkas) {
            try {
                uris.add(FileProvider.getUriForFile(this, "$packageName.fileprovider", f))
            } catch (e: Throwable) {
                LogRecorder.galat("Log", "file ${f.name} nggak bisa dibagikan", e)
            }
        }
        if (uris.isEmpty()) {
            toast("Nggak bisa nyiapin file log buat dikirim.")
            return
        }

        val kirim = Intent(Intent.ACTION_SEND_MULTIPLE).apply {
            type = "text/plain"
            putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris)
            putExtra(Intent.EXTRA_SUBJECT, "Log WA Release Bot")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            val cd = ClipData.newUri(contentResolver, "log", uris[0])
            for (u in uris.drop(1)) cd.addItem(ClipData.Item(u))
            clipData = cd
        }
        LogRecorder.tulis("Log", "bagikan ${berkas.size} file log")
        startActivity(Intent.createChooser(kirim, "Kirim log ke..."))
    }

    private fun salin(teks: String) {
        try {
            (getSystemService(CLIPBOARD_SERVICE) as ClipboardManager)
                .setPrimaryClip(ClipData.newPlainText("path", teks))
        } catch (_: Throwable) {
        }
    }

    // ----------------------------- render -----------------------------

    private fun renderUi(ui: BotUi) {
        if (isFinishing || isDestroyed) return

        tvStatus.text = buildString {
            append("Service : ").append(if (ui.serviceRunning) "aktif" else "mati")
            append("\nEngine  : ").append(
                when {
                    ui.busy -> "sedang cek..."
                    ui.engineRunning -> "jalan (bangun-tidur otomatis)"
                    ui.serviceRunning -> "jeda"
                    else -> "— (service mati)"
                }
            )
            append("\nWA      : ").append(
                when {
                    ui.waConnected -> "terhubung"
                    ui.waLinked -> "sesi tersimpan (siap)"
                    else -> "belum ditautkan — tekan Setup"
                }
            )
            append("\nChannel : ").append(
                when {
                    ui.channel == null -> "belum diisi"
                    ui.channelNama != null -> "${ui.channelNama} (${ui.channel})"
                    else -> ui.channel
                }
            )
            append("\nTerakhir: ").append(
                if (ui.lastTag == null) "belum ada" else "${ui.lastTag} (postingan ke-${ui.postCount})"
            )
            val next = ui.nextCheckAt
            if (next != null) {
                append("\nNext    : ").append("dalam ${Durasi.human(next - System.currentTimeMillis())}")
            }
        }

        val err = ui.engineError
        if (err != null) {
            tvError.visibility = TextView.VISIBLE
            tvError.text = "Error: $err"
        } else {
            tvError.visibility = TextView.GONE
        }

        if (ui.log.isNotEmpty()) {
            tvLog.text = ui.log.takeLast(40).joinToString("\n")
            // tvLog ada di dalam ScrollView (id: svLog) → scroll wadahnya.
            svLog.post { svLog.fullScroll(View.FOCUS_DOWN) }
        }

        // Channel yang baru dibikin bot: masukin ke field + simpan.
        // Cuma dipakai kalau isinya beda, jadi nggak nimpa yang lagi diketik.
        val baru = ui.channelBaru
        if (!baru.isNullOrBlank() && baru != settings.channel) {
            settings.channel = baru
            etChannel.setText(baru)
            LogRecorder.tulis("Channel", "field diisi otomatis: $baru")
        }

        tanganiQr(ui.qr)
    }

    // ----------------------------- QR -----------------------------

    private fun tanganiQr(qr: String?) {
        if (qr.isNullOrBlank()) {
            tutupDialogQr()
            return
        }
        if (qr != qrTerakhir) {
            qrDiabaikan = false // QR baru → boleh tampil lagi
            qrTerakhir = qr
        }
        if (qr == qrTerakhir && qrBitmap != null) {
            tampilkanDialogQr(qrBitmap!!)
            return
        }
        if (qrSedangDibuat) return

        qrSedangDibuat = true
        LogRecorder.tulis("Qr", "menggambar QR (${qr.length} karakter) di thread belakang")
        qrScope.launch {
            val bmp = QrBitmap.fromText(qr)
            handler.post {
                qrSedangDibuat = false
                if (isFinishing || isDestroyed) return@post
                if (bmp == null) {
                    LogRecorder.galat("Qr", "QR gagal digambar", null)
                    toast("QR-nya gagal digambar — lihat log.")
                    return@post
                }
                qrBitmap = bmp
                tampilkanDialogQr(bmp)
            }
        }
    }

    /** Cuma boleh dipanggil dari thread utama. */
    private fun tampilkanDialogQr(bmp: Bitmap) {
        if (isFinishing || isDestroyed || qrDiabaikan) return

        val ada = qrDialogRef
        if (ada != null && ada.isShowing) {
            // QR-nya udah ke-expire & diganti yang baru → cukup ganti gambarnya.
            qrImage?.setImageBitmap(bmp)
            return
        }

        val pad = (20 * resources.displayMetrics.density).toInt()
        val iv = ImageView(this).apply {
            setImageBitmap(bmp)
            setPadding(pad, pad, pad, pad)
            contentDescription = "Kode QR WhatsApp"
        }
        qrImage = iv

        val wrapper = ScrollView(this).apply { addView(iv) }
        val dialog = MaterialAlertDialogBuilder(this)
            .setTitle("Scan QR pakai WhatsApp")
            .setMessage(
                "Buka WhatsApp → Setelan → Perangkat Tertaut → Tautkan perangkat, " +
                        "lalu arahkan ke QR ini.\n\n" +
                        "QR-nya ganti tiap ±20 detik. Kalau muncul QR baru, gambar di sini " +
                        "langsung berubah — nggak perlu nutup dialog."
            )
            .setView(wrapper)
            .setNegativeButton("Tutup", null)
            .create()

        dialog.setOnDismissListener {
            if (!sedangTutupPaksa) {
                qrDiabaikan = true
                LogRecorder.tulis("Qr", "dialog ditutup user")
            }
        }
        dialog.show()
        qrDialogRef = dialog
        LogRecorder.tulis("Qr", "QR tampil — menunggu discan")
    }

    private fun tutupDialogQr() {
        val d = qrDialogRef ?: return
        sedangTutupPaksa = true
        try {
            if (d.isShowing) d.dismiss()
        } catch (e: Throwable) {
            LogRecorder.tulis("Qr", "gagal nutup dialog: ${e.message}")
        } finally {
            sedangTutupPaksa = false
        }
        qrDialogRef = null
        qrImage = null
        qrTerakhir = null
        qrBitmap = null
    }

    private fun toast(msg: String) {
        Toast.makeText(this, msg, Toast.LENGTH_LONG).show()
    }
}
