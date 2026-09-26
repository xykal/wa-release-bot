package com.xykals.warelease

import android.Manifest
import android.app.Dialog
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.widget.CheckBox
import android.widget.ImageView
import android.widget.ScrollView
import android.view.View
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.google.android.material.button.MaterialButton
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.textfield.TextInputEditText
import com.xykals.warelease.util.Durasi
import java.text.SimpleDateFormat
import java.util.Locale

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

    private var qrDialogRef: Dialog? = null
    private var qrImage: ImageView? = null

    // Tipenya ditulis eksplisit: `handler.post {}` mengembalikan Boolean,
    // sedangkan BotBus.subscribe() minta (BotUi) -> Unit.
    private val busListener: (BotUi) -> Unit = { ui -> handler.post { renderUi(ui) } }

    private val notifPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
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

        findViewById<MaterialButton>(R.id.btnSave).setOnClickListener { onSave() }
        findViewById<MaterialButton>(R.id.btnStart).setOnClickListener {
            withService { BotService.start(this) }
        }
        findViewById<MaterialButton>(R.id.btnStop).setOnClickListener {
            withService { sendCmd(mapOf("type" to "stop")) }
        }
        findViewById<MaterialButton>(R.id.btnCheck).setOnClickListener {
            withService { sendCmd(mapOf("type" to "check")) }
        }
        findViewById<MaterialButton>(R.id.btnSetup).setOnClickListener {
            withService { sendCmd(mapOf("type" to "setup")) }
        }
        findViewById<MaterialButton>(R.id.btnTest).setOnClickListener {
            withService { sendCmd(mapOf("type" to "test")) }
        }
        findViewById<MaterialButton>(R.id.btnKill).setOnClickListener {
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

        if (!settings.hasValidSettings()) {
            toast("Repo & channel WA wajib diisi dulu.")
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
        toast("Setting disimpan ✅")
    }

    /** Jalankan aksi; kalau service belum nyala, nyalakan dulu lalu tunggu init Node. */
    private fun withService(action: () -> Unit) {
        if (!BotService.isRunning) {
            try {
                BotService.start(this)
            } catch (e: Exception) {
                toast("Gagal start service: ${e.message}")
                return
            }
            handler.postDelayed(action, 4000)
        } else {
            action()
        }
    }

    private fun sendCmd(cmd: Map<String, Any>) {
        BotService.instance?.sendCmd(cmd)
    }

    // ----------------------------- render -----------------------------

    private fun renderUi(ui: BotUi) {
        val sb = StringBuilder()
        sb.append("Service : ").append(if (ui.serviceRunning) "✅ aktif" else "❌ mati")
        sb.append("\nEngine  : ").append(
            when {
                ui.busy -> "⏳ sedang cek..."
                ui.engineRunning -> "▶️ jalan (bangun-tidur otomatis)"
                ui.serviceRunning -> "⏸️ jeda"
                else -> "— (service mati)"
            }
        )
        sb.append("\nWA      : ").append(
            when {
                ui.waConnected -> "🟢 terhubung (sementara)"
                ui.waLinked -> "🔗 session tersimpan (siap)"
                else -> "⚪ belum linked — tekan Setup"
            }
        )
        sb.append("\nTerakhir: ").append(
            if (ui.lastTag == null) "belum ada" else "${ui.lastTag} (postingan ke-${ui.postCount})"
        )
        val next = ui.nextCheckAt
        if (next != null) {
            val d = next - System.currentTimeMillis()
            sb.append("\nNext    : ").append("dalam ${Durasi.human(d)}")
        }
        tvStatus.text = sb.toString()

        val err = ui.engineError
        if (err != null) {
            tvError.visibility = TextView.VISIBLE
            tvError.text = "⚠️ $err"
        } else {
            tvError.visibility = TextView.GONE
        }

        if (ui.log.isNotEmpty()) {
            tvLog.text = ui.log.takeLast(40).joinToString("\n")
            // tvLog ada di dalam ScrollView (id: svLog) → scroll wadahnya.
            svLog.post { svLog.fullScroll(View.FOCUS_DOWN) }
        }

        val qr = ui.qr
        if (qr != null) showQrDialog(qr) else hideQrDialog()
    }

    private fun showQrDialog(qr: String) {
        val existing = qrDialogRef
        if (existing != null && existing.isShowing) {
            val bmp = QrBitmap.fromText(qr)
            if (bmp != null) qrImage?.setImageBitmap(bmp)
            return
        }
        val bmp = QrBitmap.fromText(qr) ?: return
        val iv = ImageView(this).apply {
            setImageBitmap(bmp)
            val pad = (24 * resources.displayMetrics.density).toInt()
            setPadding(pad, pad, pad, pad)
        }
        qrImage = iv
        val wrapper = ScrollView(this).apply { addView(iv) }
        val dialog = MaterialAlertDialogBuilder(this)
            .setTitle("Scan QR dengan WhatsApp")
            .setMessage(
                "Buka WA → ☰ → Linked Devices (Perangkat Tertaut) → Link a Device.\n\n" +
                        "QR ke-expire tiap ±20 detik — kalau ada QR baru, otomatis refresh di sini."
            )
            .setView(wrapper)
            .setCancelable(false)
            .create()
        dialog.show()
        qrDialogRef = dialog
    }

    private fun hideQrDialog() {
        qrDialogRef?.let {
            if (it.isShowing) {
                try {
                    it.dismiss()
                } catch (_: Exception) {
                }
            }
        }
        qrDialogRef = null
        qrImage = null
    }

    private fun toast(msg: String) {
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
    }
}
