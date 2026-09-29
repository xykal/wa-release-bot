package com.xykals.warelease

import android.Manifest
import android.app.Dialog
import android.content.ClipData
import android.content.ClipboardManager
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.util.TypedValue
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import com.xykals.warelease.util.Durasi
import com.xykals.warelease.util.RepoDaftar
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * Layar utama.
 *
 * Nggak pakai komponen Material sama sekali: tombol = TextView yang bisa
 * diklik, saklar = baris yang di-`isSelected`, dialog = [lembar] buatan
 * sendiri, notifikasi kecil = [banner] (pengganti Toast).
 */
class MainActivity : AppCompatActivity() {

    private val handler = Handler(Looper.getMainLooper())
    private lateinit var settings: SettingsStore

    // input
    private lateinit var etPhone: EditText
    private lateinit var tvRepoRingkas: TextView
    /** Isi pref repo saat terakhir dikirim ke engine; dibandingkan di onResume sepulang dari RepoActivity. */
    private var repoTerkirim: String? = null
    private lateinit var etChannel: EditText
    private lateinit var etToken: EditText
    private lateinit var etInterval: EditText
    private lateinit var etGrup: EditText
    private lateinit var etGrupInterval: EditText
    private lateinit var etGrupHitam: EditText
    private lateinit var rowFormatTanya: View
    private lateinit var etLaguPerHari: EditText
    private lateinit var etLaguJamMulai: EditText
    private lateinit var etLaguJamSelesai: EditText
    private lateinit var rowLaguAktif: View
    private lateinit var tvLaguStat: TextView
    private lateinit var tvHostingStat: TextView

    // saklar (baris yang bisa di-tap)
    private lateinit var rowPrerelease: View
    private lateinit var rowPostFirst: View
    private lateinit var rowTestMsg: View
    private lateinit var rowGrupAktif: View
    private lateinit var rowBoot: View
    private lateinit var rowLogcat: View

    // tampilan
    private lateinit var tvPill: TextView
    private lateinit var tvUbinWa: TextView
    private lateinit var tvUbinEngine: TextView
    private lateinit var tvUbinRilis: TextView
    private lateinit var tvUbinGrup: TextView
    private lateinit var tvNext: TextView
    private lateinit var tvError: TextView
    private lateinit var tvWaStatus: TextView
    private var segarkan: SwipeRefreshLayout? = null
    private val selesaiSegar = Runnable { segarkan?.isRefreshing = false }
    private lateinit var tvGrupStat: TextView
    private lateinit var tvBatreStat: TextView
    private lateinit var tvLog: TextView
    private lateinit var svLog: ScrollView
    private lateinit var tvFolderLog: TextView
    private lateinit var tvBanner: TextView
    private lateinit var btnMulai: TextView

    private var engineJalan = false
    private var setupTerakhir: String? = null
    private var tahapTerakhir: String? = null

    // Daftar hitam: dialognya kebuka kalau user yang minta, dan di-refresh
    // tiap engine ngirim daftar baru (mis. habis buka blokir).
    private var mauLihatHitam = false
    private var hitamSeqTerakhir = -1
    private var dialogHitam: Dialog? = null
    private lateinit var btnKill: TextView

    // Aksi Mulai / Jeda / Matikan yang lagi ditunggu hasilnya. Selama belum
    // kejadian, tombolnya nunjukin "Menyalakan…" dst. dan nggak bisa dipencet
    // dobel — biar jelas bot-nya udah nyala/mati atau belum.
    private enum class Aksi(val teks: String) { NYALA("Menyalakan…"), JEDA("Menjeda…"), MATI("Mematikan…") }
    private var aksiTunggu: Aksi? = null
    private val aksiKelamaan = Runnable {
        val a = aksiTunggu ?: return@Runnable
        aksiTunggu = null
        LogRecorder.tulis("Tombol", "aksi $a nggak ada respon 15 dtk")
        banner(
            when (a) {
                Aksi.NYALA -> "Bot belum mau jalan. Cek setting (repo/channel) & kartu Log."
                Aksi.JEDA -> "Engine belum ngejawab perintah jeda. Coba lagi, atau Matikan service."
                Aksi.MATI -> "Service belum berhenti. Coba lagi."
            }
        )
        renderUi(BotBus.ui)
    }

    private fun tungguAksi(a: Aksi) {
        aksiTunggu = a
        handler.removeCallbacks(aksiKelamaan)
        handler.postDelayed(aksiKelamaan, 15_000L)
        renderUi(BotBus.ui)
    }

    private fun aksiBeres(pesan: String) {
        aksiTunggu = null
        handler.removeCallbacks(aksiKelamaan)
        banner(pesan)
    }

    // QR
    private var qrDialog: Dialog? = null
    private var qrImage: ImageView? = null
    private var qrTerakhir: String? = null
    private var qrBitmap: Bitmap? = null
    private var qrSedangDibuat = false
    private var qrDiabaikan = false

    // pairing code
    private var kodeDialog: Dialog? = null
    private var kodeTeks: TextView? = null
    private var kodeTerakhir: String? = null
    private var kodeDiabaikan = false

    private var sedangTutupPaksa = false

    /** QR digambar di thread belakang — 400 ribu piksel bikin layar beku kalau di main. */
    private val qrScope = CoroutineScope(Dispatchers.Default + SupervisorJob())

    private val busListener: (BotUi) -> Unit = { ui -> handler.post { renderUi(ui) } }

    private val notifPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    private val sembunyikanBanner = Runnable {
        tvBanner.animate().alpha(0f).setDuration(200).withEndAction {
            tvBanner.visibility = View.GONE
        }.start()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        LogRecorder.init(this)
        LogRecorder.tulis("Activity", "MainActivity dibuka")

        settings = SettingsStore(this)
        if (!settings.sudahSambutan) {
            startActivity(Intent(this, OnboardingActivity::class.java))
            finish()
            return
        }
        setContentView(R.layout.activity_main)
        wireViews()
        loadSettingsToViews()
        // pemanis: tiap tombol berdenyut pas dipencet, kartu muncul satu-satu
        Denyut.pasangSemua(window.decorView)
        if (savedInstanceState == null) {
            mulaiSplash()
        } else {
            (findViewById<ScrollView>(R.id.svUtama).getChildAt(0) as? ViewGroup)?.let { Denyut.munculBerurutan(it) }
        }

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
        BotService.instance?.setUiTerlihat(true)
        renderBatre()
        // Pulang dari layar Repo: daftar mungkin berubah; kirim ke engine lewat satu
        // jalur yang sama dengan tombol Simpan supaya tidak ada dua sumber kebenaran.
        val repoSekarang = settings.repo
        if (repoTerkirim != null && repoTerkirim != repoSekarang) {
            renderRepoRingkas()
            if (settings.hasValidSettings()) {
                withService { sendCmd(settings.toConfigureCmd()) }
                banner("Daftar repo diperbarui.")
            } else {
                banner("Daftar repo kosong — bot nggak mantau apa-apa sampai lo nambah repo.")
            }
        }
        repoTerkirim = repoSekarang
    }

    private fun renderRepoRingkas() {
        tvRepoRingkas.text = RepoDaftar.ringkas(settings.repo)
    }

    override fun onPause() {
        BotBus.unsubscribe(busListener)
        BotService.instance?.setUiTerlihat(false)
        super.onPause()
    }

    // ----------------------------- splash -----------------------------------
    // Animasi morph (MorphView) nutupin layar sampai app beneran siap:
    // UI udah kegambar + kalau service nyala, status engine udah nyampe.
    // Minimal 1,6 dtk biar animasinya sempat kelihatan, maksimal 4,5 dtk.
    private var splashMulai = 0L
    private var uiPernahTampil = false
    private val labelSplash = arrayOf("Bot penjaga siap", "Ngobrol di grup", "Lagu buat channel", "Semua jalan otomatis")

    private val cekSplash = object : Runnable {
        override fun run() {
            val lama = System.currentTimeMillis() - splashMulai
            val service = BotService.instance
            val siap = uiPernahTampil && (service == null || BotBus.ui.serviceRunning)
            if ((lama >= 1600 && siap) || lama >= 4500) tutupSplash() else handler.postDelayed(this, 100)
        }
    }

    private fun mulaiSplash() {
        val splash = findViewById<View>(R.id.splash)
        val label = findViewById<TextView>(R.id.tvSplashLabel)
        splash.visibility = View.VISIBLE
        splash.alpha = 1f
        splashMulai = System.currentTimeMillis()
        LogRecorder.tulis("Activity", "splash tampil")
        val gelembung = findViewById<View>(R.id.gelembungSplash)
        gelembung.pivotY = 0f
        findViewById<MorphView>(R.id.morph).onGantiBentuk = { i ->
            // gelembung "pop" kayak chat baru masuk, tulisannya ganti di tengah pop
            gelembung.animate().cancel()
            gelembung.pivotX = gelembung.width / 2f
            gelembung.animate().scaleX(0.86f).scaleY(0.86f).alpha(0.4f).setDuration(110)
                .setInterpolator(android.view.animation.AccelerateInterpolator())
                .withEndAction {
                    label.text = labelSplash[i % labelSplash.size]
                    gelembung.animate().scaleX(1f).scaleY(1f).alpha(1f).setDuration(260)
                        .setInterpolator(android.view.animation.OvershootInterpolator(2.2f)).start()
                }.start()
        }
        handler.postDelayed(cekSplash, 100)
    }

    private fun tutupSplash() {
        val splash = findViewById<View>(R.id.splash)
        if (splash.visibility != View.VISIBLE) return
        LogRecorder.tulis("Activity", "splash selesai (${System.currentTimeMillis() - splashMulai} ms)")
        splash.animate().alpha(0f).scaleX(1.06f).scaleY(1.06f).setDuration(320).withEndAction {
            splash.visibility = View.GONE
            findViewById<MorphView>(R.id.morph).onGantiBentuk = null
        }.start()
        (findViewById<ScrollView>(R.id.svUtama).getChildAt(0) as? ViewGroup)?.let { Denyut.munculBerurutan(it) }
    }

    override fun onDestroy() {
        handler.removeCallbacks(cekSplash)
        qrScope.cancel()
        tutupDialogQr()
        tutupDialogKode()
        super.onDestroy()
    }

    // ----------------------------- pasang view -----------------------------

    /** Semua tombol lewat sini: dicatat ke log, dan kalau meledak app nggak mati. */
    private fun pasang(id: Int, nama: String, aksi: () -> Unit) {
        findViewById<View>(id).setOnClickListener {
            LogRecorder.tulis("Tombol", "tekan: $nama")
            try {
                aksi()
            } catch (e: Throwable) {
                LogRecorder.galat("Tombol", "\"$nama\" gagal", e)
                banner("\"$nama\" gagal: ${e.message}")
            }
        }
    }

    private fun saklar(id: Int): View {
        val v = findViewById<View>(id)
        v.setOnClickListener { v.isSelected = !v.isSelected }
        return v
    }

    private fun wireViews() {
        etPhone = findViewById(R.id.etPhone)
        tvRepoRingkas = findViewById(R.id.tvRepoRingkas)
        pasang(R.id.btnKelolaRepo, "Kelola repo") { startActivity(Intent(this, RepoActivity::class.java)) }
        etChannel = findViewById(R.id.etChannel)
        etToken = findViewById(R.id.etToken)
        etInterval = findViewById(R.id.etInterval)
        etGrup = findViewById(R.id.etGrup)
        etGrupInterval = findViewById(R.id.etGrupInterval)
        etGrupHitam = findViewById(R.id.etGrupHitam)

        rowPrerelease = saklar(R.id.rowPrerelease)
        rowPostFirst = saklar(R.id.rowPostFirst)
        rowTestMsg = saklar(R.id.rowTestMsg)
        rowFormatTanya = saklar(R.id.rowFormatTanya)
        rowGrupAktif = saklar(R.id.rowGrupAktif)
        rowBoot = saklar(R.id.rowBoot)
        rowLogcat = saklar(R.id.rowLogcat)
        rowLaguAktif = saklar(R.id.rowLaguAktif)
        etLaguPerHari = findViewById(R.id.etLaguPerHari)
        etLaguJamMulai = findViewById(R.id.etLaguJamMulai)
        etLaguJamSelesai = findViewById(R.id.etLaguJamSelesai)
        tvLaguStat = findViewById(R.id.tvLaguStat)
        tvHostingStat = findViewById(R.id.tvHostingStat)

        tvPill = findViewById(R.id.tvPill)
        tvUbinWa = findViewById(R.id.tvUbinWa)
        tvUbinEngine = findViewById(R.id.tvUbinEngine)
        tvUbinRilis = findViewById(R.id.tvUbinRilis)
        tvUbinGrup = findViewById(R.id.tvUbinGrup)
        tvNext = findViewById(R.id.tvNext)
        tvError = findViewById(R.id.tvError)
        tvWaStatus = findViewById(R.id.tvWaStatus)
        segarkan = findViewById<SwipeRefreshLayout>(R.id.segarkan).apply {
            setColorSchemeColors(ContextCompat.getColor(this@MainActivity, R.color.wr_hijau))
            setProgressBackgroundColorSchemeColor(ContextCompat.getColor(this@MainActivity, R.color.wr_latar))
            setOnRefreshListener { segarkanStatus() }
        }
        tvGrupStat = findViewById(R.id.tvGrupStat)
        tvBatreStat = findViewById(R.id.tvBatreStat)
        tvLog = findViewById(R.id.tvLog)
        svLog = findViewById(R.id.svLog)
        tvFolderLog = findViewById(R.id.tvFolderLog)
        tvBanner = findViewById(R.id.tvBanner)
        btnMulai = findViewById(R.id.btnMulai)
        btnKill = findViewById(R.id.btnKill)

        findViewById<TextView>(R.id.tvVersi).text =
            "v${BuildConfig.VERSION_NAME} · rilis GitHub → WhatsApp"
        tvFolderLog.text = LogRecorder.dir?.absolutePath ?: "(folder log nggak kebaca)"
        findViewById<TextView>(R.id.tvTentang).text =
            "${getString(R.string.app_name)} v${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})\n" +
                    "Bot pribadi: rilis GitHub → saluran WA, penjaga grup, lagu mood, hosting bot.\n" +
                    "Lisensi: pemakaian pribadi — nggak boleh dijual / disebar ulang tanpa izin."
        pasang(R.id.btnRepo, "Buka repo") {
            try {
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://github.com/xykal/wa-release-bot")))
            } catch (_: Exception) {
                banner("Nggak ada browser buat buka link-nya.")
            }
        }
        tvBanner.setOnClickListener { handler.removeCallbacks(sembunyikanBanner); sembunyikanBanner.run() }

        pasang(R.id.btnSave, "Simpan") { onSave(diam = false) }
        pasang(R.id.btnMulai, "Mulai/Jeda") {
            if (aksiTunggu != null) return@pasang // lagi nunggu yang tadi
            if (engineJalan) {
                tungguAksi(Aksi.JEDA)
                withService { sendCmd(mapOf("type" to "stop")) }
            } else {
                if (!simpanDiamDiam()) return@pasang
                tungguAksi(Aksi.NYALA)
                withService { sendCmd(mapOf("type" to "start")) }
            }
        }
        pasang(R.id.btnCheck, "Cek sekarang") { withService { sendCmd(mapOf("type" to "check")) } }
        pasang(R.id.btnPairing, "Tautkan pakai kode") { mulaiTautkan("pairing") }
        pasang(R.id.btnQr, "Tautkan pakai QR") { mulaiTautkan("qr") }
        pasang(R.id.btnLepas, "Lepas WA") {
            lembar(
                "Lepas WhatsApp?",
                "Bot berhenti bisa posting / jaga grup sampai ditautkan lagi. " +
                        "Perangkatnya juga hilang dari daftar Perangkat tertaut di HP lo.",
                null,
                Tombol("Lepas", Gaya.BAHAYA) { withService { sendCmd(mapOf("type" to "lepas")) } },
                Tombol("Batal", Gaya.LEMBUT)
            )
        }
        pasang(R.id.btnTest, "Tes kirim channel") {
            if (!simpanDiamDiam()) return@pasang
            withService { sendCmd(mapOf("type" to "test")) }
            banner("Ngirim pesan tes ke channel… hasilnya ada di kartu Log.")
        }
        pasang(R.id.btnTesGrup, "Tes kirim grup") {
            ambilDariView()
            if (settings.grupTarget.isBlank()) {
                banner("Isi link undangan grup dulu.")
                etGrup.requestFocus()
                return@pasang
            }
            if (!simpanDiamDiam()) return@pasang
            withService { sendCmd(mapOf("type" to "tes-grup")) }
            banner("Ngirim pesan tes ke grup… hasilnya ada di kartu Log.")
        }
        pasang(R.id.btnBikinChannel, "Bikin channel") {
            lembar(
                "Bikin channel baru?",
                "Bot bikinin channel WhatsApp atas nama akun lo, terus langsung dipakai " +
                        "buat posting. Kalau lo udah punya channel, tempel aja link-nya di kolom Channel WA.",
                null,
                Tombol("Bikin", Gaya.UTAMA) {
                    if (simpanDiamDiam()) withService { sendCmd(mapOf("type" to "bikin-channel")) }
                },
                Tombol("Batal", Gaya.LEMBUT)
            )
        }
        pasang(R.id.btnCekGrup, "Cek grup") {
            if (!simpanDiamDiam()) return@pasang
            withService { sendCmd(mapOf("type" to "cek-grup")) }
        }
        pasang(R.id.btnLihatHitam, "Daftar hitam") {
            mauLihatHitam = true
            withService { sendCmd(mapOf("type" to "lihat-hitam")) }
            banner("Ngambil daftar hitam…")
        }
        pasang(R.id.btnResetHitam, "Kosongin daftar hitam") {
            lembar(
                "Kosongin daftar hitam?",
                "Semua orang yang dicatat bot karena pernah keluar bakal bisa di-approve lagi. " +
                        "Nomor yang lo ketik manual nggak ikut dihapus.",
                null,
                Tombol("Kosongin", Gaya.BAHAYA) { withService { sendCmd(mapOf("type" to "reset-hitam")) } },
                Tombol("Batal", Gaya.LEMBUT)
            )
        }
        pasang(R.id.btnLaguSekarang, "Kirim lagu sekarang") {
            ambilDariView()
            if (settings.channel.isBlank()) {
                banner("Isi Channel WA dulu — lagunya dikirim ke sana.")
                etChannel.requestFocus()
                return@pasang
            }
            if (!simpanDiamDiam()) return@pasang
            withService { sendCmd(mapOf("type" to "lagu-sekarang")) }
            banner("Ngambil lagu dari antrian & ngirim ke channel… hasilnya di kartu Log.")
        }
        pasang(R.id.btnHosting, "Buka hosting") {
            startActivity(Intent(this, HostingActivity::class.java))
        }
        pasang(R.id.btnBatre, "Izin batre") { mintaIzinBatre() }
        pasang(R.id.btnAutostart, "Autostart") { bukaAutostart() }
        pasang(R.id.btnBukaLog, "Buka folder log") { bukaFolderLog() }
        pasang(R.id.btnKirimLog, "Kirim log") { kirimLog() }
        pasang(R.id.btnKill, "Matikan service") {
            lembar(
                "Matikan service?",
                "Proses Node & semua jadwal berhenti sampai lo tekan Mulai lagi " +
                        "(atau HP restart, kalau nyala otomatis aktif).",
                null,
                Tombol("Matikan", Gaya.BAHAYA) {
                    tungguAksi(Aksi.MATI)
                    BotService.stop(this)
                },
                Tombol("Batal", Gaya.LEMBUT)
            )
        }
    }

    private fun loadSettingsToViews() {
        etPhone.setText(settings.phone)
        renderRepoRingkas()
        etChannel.setText(settings.channel)
        etToken.setText(settings.token)
        etInterval.setText(settings.intervalMinutes.toString())
        etGrup.setText(settings.grupTarget)
        etGrupInterval.setText(settings.grupInterval.toString())
        etGrupHitam.setText(settings.grupHitam)
        rowPrerelease.isSelected = settings.includePrereleases
        rowPostFirst.isSelected = settings.postOnFirstRun
        rowTestMsg.isSelected = settings.testMessageOnSetup
        rowFormatTanya.isSelected = settings.formatPertanyaan
        rowGrupAktif.isSelected = settings.grupAktif
        rowBoot.isSelected = settings.autoStartOnBoot
        rowLogcat.isSelected = settings.rekamLogcat
        rowLaguAktif.isSelected = settings.laguAktif
        etLaguPerHari.setText(settings.laguPerHari.toString())
        etLaguJamMulai.setText(settings.laguJamMulai.toString())
        etLaguJamSelesai.setText(settings.laguJamSelesai.toString())
    }

    // ----------------------------- simpan -----------------------------

    private fun ambilDariView() {
        settings.phone = etPhone.text.toString()
        settings.channel = etChannel.text.toString()
        settings.token = etToken.text.toString()
        settings.intervalMinutes = etInterval.text.toString().toIntOrNull() ?: 15
        settings.includePrereleases = rowPrerelease.isSelected
        settings.postOnFirstRun = rowPostFirst.isSelected
        settings.testMessageOnSetup = rowTestMsg.isSelected
        settings.formatPertanyaan = rowFormatTanya.isSelected
        settings.grupAktif = rowGrupAktif.isSelected
        settings.grupTarget = etGrup.text.toString()
        settings.grupInterval = etGrupInterval.text.toString().toIntOrNull() ?: 5
        settings.grupHitam = etGrupHitam.text.toString()
        settings.autoStartOnBoot = rowBoot.isSelected
        settings.laguAktif = rowLaguAktif.isSelected
        settings.laguPerHari = etLaguPerHari.text.toString().toIntOrNull() ?: 2
        settings.laguJamMulai = etLaguJamMulai.text.toString().toIntOrNull() ?: 9
        settings.laguJamSelesai = etLaguJamSelesai.text.toString().toIntOrNull() ?: 22

        val logcatLama = settings.rekamLogcat
        settings.rekamLogcat = rowLogcat.isSelected
        if (logcatLama != settings.rekamLogcat) {
            if (settings.rekamLogcat) LogRecorder.mulaiRekamLogcat() else LogRecorder.berhentiRekamLogcat()
        }
    }

    /** @return true kalau setting valid & udah dikirim ke engine. */
    private fun onSave(diam: Boolean): Boolean {
        ambilDariView()
        if (settings.grupAktif && settings.grupTarget.isBlank()) {
            banner("Penjaga grup dinyalain, tapi link grup-nya masih kosong.")
            return false
        }
        if (!settings.hasValidSettings()) {
            banner("Isi repo GitHub, nyalain penjaga grup, atau nyalain lagu mood — minimal salah satu.")
            return false
        }
        withService { sendCmd(settings.toConfigureCmd()) }
        repoTerkirim = settings.repo
        if (!diam) {
            banner(
                when {
                    settings.repo.isNotBlank() && settings.channel.isBlank() ->
                        "Disimpan. Channel masih kosong — tempel link channel atau tekan Bikin channel."
                    else -> "Setting disimpan."
                }
            )
        }
        return true
    }

    private fun simpanDiamDiam(): Boolean = onSave(diam = true)

    private fun mulaiTautkan(cara: String) {
        ambilDariView()
        if (cara == "pairing" && settings.phone.filter { it.isDigit() }.length < 8) {
            banner("Isi nomor WA lo dulu (yang mau dipakai bot), contoh 0812 3456 7890.")
            etPhone.requestFocus()
            return
        }
        // Setting ikut dikirim kalau udah valid; kalau belum, nautin tetap jalan.
        if (settings.hasValidSettings()) withService { sendCmd(settings.toConfigureCmd()) }
        kodeDiabaikan = false
        qrDiabaikan = false
        // Ganti cara nautin → tampilan cara yang lama langsung ditutup
        // (engine juga ngebatalin setup yang lama).
        tutupDialogKode()
        tutupDialogQr()
        withService {
            sendCmd(mapOf("type" to "setup", "cara" to cara, "phone" to settings.phone))
        }
        banner(if (cara == "pairing") "Minta kode ke WhatsApp…" else "Nyiapin QR…")
    }

    /**
     * Jalankan aksi setelah service siap (dicek terus maksimal ~10 detik).
     * `action` WAJIB parameter terakhir biar `withService { ... }` bisa dipakai.
     */
    private fun withService(cobaKe: Int = 0, action: () -> Unit) {
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
                banner("Gagal nyalain service: ${e.message}")
                return
            }
        }
        if (cobaKe >= 14) {
            LogRecorder.tulis("Service", "nyerah nunggu service siap (>10 detik)")
            banner("Service-nya lama nggak siap. Coba lagi, atau cek log.")
            return
        }
        val jeda = if (cobaKe < 4) 400L else 1000L
        handler.postDelayed({ withService(cobaKe + 1, action) }, jeda)
    }

    private fun sendCmd(cmd: Map<String, Any>) {
        val svc = BotService.instance
        if (svc == null) {
            LogRecorder.tulis("Cmd", "dibuang, service belum siap: ${cmd["type"]}")
            banner("Service belum siap — coba lagi sebentar.")
            return
        }
        // token GitHub jangan ikut ke-log
        LogRecorder.tulis("Cmd", "kirim: ${cmd.filterKeys { it != "token" }}")
        svc.setUiTerlihat(true)
        svc.sendCmd(cmd)
    }

    // ----------------------------- batre & autostart -----------------------------

    private fun bebasBatre(): Boolean = try {
        getSystemService(PowerManager::class.java)?.isIgnoringBatteryOptimizations(packageName) == true
    } catch (_: Throwable) {
        false
    }

    private fun renderBatre() {
        tvBatreStat.text = if (bebasBatre()) {
            "Pengoptimalan batre: dikecualikan. Android nggak bakal nidurin bot ini."
        } else {
            "Pengoptimalan batre: masih AKTIF. Bot bisa ditidurin / dimatiin sistem pas layar mati. Tekan tombol di atas."
        }
    }

    private fun mintaIzinBatre() {
        if (bebasBatre()) {
            banner("Udah dikecualikan dari pengoptimalan batre.")
            return
        }
        try {
            startActivity(
                Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
                    .setData(Uri.parse("package:$packageName"))
            )
        } catch (e: Throwable) {
            LogRecorder.tulis("Batre", "dialog izin batre nggak ada: ${e.message}")
            try {
                startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
                banner("Cari \"WA Release Bot\" → pilih \"Jangan optimalkan\" / \"Tanpa batasan\".")
            } catch (_: Throwable) {
                bukaInfoApp()
            }
        }
    }

    /**
     * Xiaomi/Oppo/Vivo/Huawei punya menu "Autostart" sendiri. Tanpa izin itu,
     * broadcast boot nggak pernah sampai → bot nggak nyala habis restart.
     */
    private fun bukaAutostart() {
        val kandidat = listOf(
            ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"),
            ComponentName("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity"),
            ComponentName("com.oplus.safecenter", "com.oplus.safecenter.permission.startup.StartupAppListActivity"),
            ComponentName("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"),
            ComponentName("com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"),
            ComponentName("com.samsung.android.lool", "com.samsung.android.sm.ui.battery.BatteryActivity")
        )
        for (c in kandidat) {
            try {
                startActivity(Intent().setComponent(c).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                LogRecorder.tulis("Autostart", "kebuka: ${c.packageName}")
                banner("Cari \"WA Release Bot\" lalu nyalain.")
                return
            } catch (_: Throwable) {
            }
        }
        bukaInfoApp()
        banner("Menu Autostart khusus nggak ketemu. Di Info aplikasi, cek bagian Batre / Mulai otomatis.")
    }

    private fun bukaInfoApp() {
        try {
            startActivity(
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).setData(Uri.parse("package:$packageName"))
            )
        } catch (_: Throwable) {
        }
    }

    // ----------------------------- folder log -----------------------------

    private fun bukaFolderLog() {
        val d = LogRecorder.dir
        if (d == null) {
            banner("Folder log nggak kebaca di HP ini.")
            return
        }
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
        lembar(
            "Folder log",
            "File manager di HP ini nggak bisa dibuka langsung. Path-nya udah disalin — " +
                    "tempel di file manager:\n\n${d.absolutePath}\n\nAtau pakai tombol Kirim log.",
            null,
            Tombol("Oke", Gaya.UTAMA)
        )
    }

    private fun kirimLog() {
        val d = LogRecorder.dir
        if (d == null) {
            banner("Folder log nggak kebaca.")
            return
        }
        val berkas = d.listFiles(java.io.FileFilter { f -> f.isFile && f.name.contains(".log") })
            ?.sortedBy { it.name } ?: emptyList()
        if (berkas.isEmpty()) {
            banner("Belum ada file log.")
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
            banner("Nggak bisa nyiapin file log buat dikirim.")
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
                .setPrimaryClip(ClipData.newPlainText("wa-release-bot", teks))
        } catch (_: Throwable) {
        }
    }

    // ----------------------------- render -----------------------------

    private fun renderUi(ui: BotUi) {
        uiPernahTampil = true
        if (isFinishing || isDestroyed) return
        if (ui.serviceRunning) BotService.instance?.setUiTerlihat(true)

        engineJalan = ui.engineRunning

        // Aksi yang ditunggu udah kejadian? → kasih tau, balikin tombol normal.
        when (aksiTunggu) {
            Aksi.NYALA -> if (ui.engineRunning) aksiBeres("✓ Bot jalan. Cek rilis sesuai jadwal.")
            Aksi.JEDA -> if (!ui.engineRunning) aksiBeres("⏸ Bot dijeda — jadwal berhenti, service tetap nyala.")
            Aksi.MATI -> if (!ui.serviceRunning) aksiBeres("⏻ Service mati. Bot berhenti total sampai lo tekan Nyalakan.")
            null -> {}
        }
        val tunggu = aksiTunggu

        val (teksPill, warnaPill) = when {
            tunggu != null -> tunggu.teks.uppercase() to R.color.wr_kuning
            ui.busy -> "CEK…" to R.color.wr_hijau
            ui.engineRunning -> "JALAN" to R.color.wr_hijau
            ui.serviceRunning -> "JEDA" to R.color.wr_kuning
            else -> "MATI" to R.color.wr_merah
        }
        tvPill.text = teksPill
        tvPill.setTextColor(ContextCompat.getColor(this, warnaPill))
        tvPill.background = GradientDrawable().apply {
            cornerRadius = dp(50).toFloat()
            setColor(ContextCompat.getColor(this@MainActivity, warnaPill) and 0x00FFFFFF or 0x26000000)
        }

        tvUbinWa.text = when {
            ui.waConnected -> "Tersambung"
            ui.waLinked -> "Tertaut"
            else -> "Belum ditautkan"
        }
        tvUbinEngine.text = when {
            ui.busy -> "Lagi cek…"
            ui.engineRunning -> "Jalan"
            ui.serviceRunning -> "Jeda"
            else -> "Mati"
        }
        tvUbinRilis.text = when {
            ui.repo == null -> "—"
            ui.lastTag == null -> "Belum ada"
            else -> "${ui.lastTag} · ${ui.postCount} post"
        }
        tvUbinGrup.text = if (ui.grupAktif) (ui.grupNama ?: "Nyala") else "Mati"

        val sekarang = System.currentTimeMillis()
        tvNext.text = listOfNotNull(
            ui.nextCheckAt?.let { "cek rilis ${Durasi.human(it - sekarang)} lagi" },
            ui.nextGrupAt?.let { "cek grup ${Durasi.human(it - sekarang)} lagi" },
            ui.nextLaguAt?.let { "lagu ${Durasi.human(it - sekarang)} lagi" }
        ).joinToString("  ·  ")

        tvLaguStat.text = when {
            !ui.laguAktif -> "Mati. Nyalain saklarnya, terus Simpan."
            else -> listOfNotNull(
                ui.nextLaguAt?.let { "Lagu berikutnya kira-kira ${Durasi.human(it - sekarang)} lagi (jamnya diacak)" }
                    ?: "Nunggu bot jalan…",
                "${ui.laguCount} lagu udah dikirim",
                ui.laguJudul?.let { "Terakhir: $it" },
                ui.laguJatah?.let { "Jatah hari ini dari server: $it (reset tengah malam UTC)" }
            ).joinToString("\n")
        }
        val h = ui.hosting
        tvHostingStat.text = when {
            !h.ada -> "Belum ada project."
            else -> (h.nama ?: h.file ?: "Project") + " — " + when (h.status) {
                "jalan" -> "jalan ✓"
                "install" -> "lagi pasang modul…"
                "error" -> "error, buka buat liat konsol"
                "mati" -> "mati"
                else -> "siap dijalanin"
            }
        }
        tvNext.visibility = if (tvNext.text.isNullOrEmpty()) View.GONE else View.VISIBLE

        btnMulai.text = when {
            tunggu == Aksi.NYALA || tunggu == Aksi.JEDA -> tunggu?.teks ?: ""
            !ui.serviceRunning -> "Nyalakan"
            ui.engineRunning -> "Jeda"
            else -> "Mulai"
        }
        btnMulai.setCompoundDrawablesRelativeWithIntrinsicBounds(
            if (ui.engineRunning) R.drawable.ic_jeda else R.drawable.ic_play, 0, 0, 0
        )
        val mulaiAktif = tunggu == null
        btnMulai.isEnabled = mulaiAktif
        btnMulai.alpha = if (mulaiAktif) 1f else 0.55f

        btnKill.text = when {
            tunggu == Aksi.MATI -> tunggu?.teks ?: ""
            !ui.serviceRunning -> "Service udah mati"
            else -> "Matikan service"
        }
        val killAktif = ui.serviceRunning && tunggu == null
        btnKill.isEnabled = killAktif
        btnKill.alpha = if (killAktif) 1f else 0.45f

        // Kartu "Tautkan WhatsApp" ikut berubah: udah tertaut → isian nomor &
        // tombol nautin disembunyiin, sisa "Lepas WA" doang.
        val nautin = ui.setupState == "starting"
        val tertaut = ui.waLinked && !nautin
        val tampilTaut = if (tertaut) View.GONE else View.VISIBLE
        findViewById<View>(R.id.tvLabelPhone).visibility = tampilTaut
        etPhone.visibility = tampilTaut
        findViewById<View>(R.id.btnPairing).visibility = tampilTaut
        findViewById<View>(R.id.btnQr).visibility = tampilTaut
        findViewById<View>(R.id.btnLepas).visibility = if (tertaut) View.VISIBLE else View.GONE
        findViewById<TextView>(R.id.tvKetTaut).text = if (tertaut) {
            "Udah beres, nggak perlu diapa-apain lagi. Mau ganti nomor? Lepas dulu, baru tautin lagi."
        } else {
            "Cukup sekali. Paling gampang pakai kode: isi nomor WA lo, nanti muncul 8 huruf yang diketik di WhatsApp — nggak perlu HP kedua buat scan QR."
        }
        val nomorTampil = settings.phone.trim().ifBlank { null }

        tvWaStatus.text = when {
            ui.setupState == "starting" && ui.setupTahap != null -> ui.setupTahap!!
            ui.waLinked -> "✓ WhatsApp tertaut" + (nomorTampil?.let { " ($it)" } ?: "") + " — bot siap kerja."
            ui.setupState == "starting" -> "Lagi nautin…"
            else -> "Belum tertaut."
        }
        tvWaStatus.setTextColor(
            ContextCompat.getColor(this, if (ui.waLinked) R.color.wr_hijau else R.color.wr_teks2)
        )

        tvGrupStat.text = if (!ui.grupAktif) {
            "Penjaga grup mati."
        } else {
            val last = ui.grupLastCekAt?.let { "${Durasi.human(sekarang - it)} lalu" } ?: "belum pernah"
            "Grup: ${ui.grupNama ?: "(belum dicek)"}\n" +
                    "Di-approve ${ui.grupDisetujui} · ditolak ${ui.grupDitolak} · daftar hitam ${ui.grupHitam}\n" +
                    "Cek terakhir: $last"
        }

        val err = ui.engineError
        tvError.visibility = if (err != null) View.VISIBLE else View.GONE
        if (err != null) tvError.text = err

        if (ui.log.isNotEmpty()) {
            tvLog.text = ui.log.takeLast(60).joinToString("\n")
            svLog.post { svLog.fullScroll(View.FOCUS_DOWN) }
        }

        val baru = ui.channelBaru
        if (!baru.isNullOrBlank() && baru != settings.channel) {
            settings.channel = baru
            etChannel.setText(baru)
            LogRecorder.tulis("Channel", "field diisi otomatis: $baru")
        }

        if (ui.setupState != setupTerakhir) {
            when (ui.setupState) {
                "done" -> {
                    if (setupTerakhir != null) banner("WhatsApp tertaut! Bot siap kerja.")
                    tutupDialogKode()
                    tutupDialogQr()
                }
                "error" -> if (setupTerakhir != null) banner("Nautin WA gagal — alasannya ada di kartu Log.")
            }
            setupTerakhir = ui.setupState
        }

        if (ui.daftarHitamSeq != hitamSeqTerakhir) {
            val pertama = hitamSeqTerakhir == -1
            hitamSeqTerakhir = ui.daftarHitamSeq
            if (!pertama && (mauLihatHitam || dialogHitam?.isShowing == true)) {
                mauLihatHitam = false
                tampilkanDaftarHitam(ui)
            }
        }

        if (ui.setupTahap != null && ui.setupTahap != tahapTerakhir) {
            banner(ui.setupTahap!!)
        }
        tahapTerakhir = ui.setupTahap

        // QR & pairing code nggak boleh nongol bareng: kalau lagi mode kode,
        // QR-nya diabaikan (Baileys tetap bikin QR di belakang layar).
        // Cuma cara yang lagi dipilih yang boleh tampil.
        tanganiKode(if (nautin && ui.setupMode == "pairing") ui.pairingCode else null)
        tanganiQr(if (nautin && ui.setupMode == "qr" && ui.pairingCode.isNullOrBlank()) ui.qr else null)
    }

    /** Tarik-ke-bawah: minta status terbaru ke engine, tanpa nautin ulang. */
    private fun segarkanStatus() {
        LogRecorder.tulis("Tombol", "tarik: segarkan status")
        handler.removeCallbacks(selesaiSegar)
        renderBatre()
        if (BotService.instance != null) {
            sendCmd(mapOf("type" to "status"))
            banner("Status diperbarui.")
        } else {
            banner("Service lagi mati — tekan Mulai buat nyalain.")
        }
        renderUi(BotBus.ui)
        handler.postDelayed(selesaiSegar, 1200)
    }

    // ----------------------------- pairing code -----------------------------

    private fun tanganiKode(kode: String?) {
        if (kode.isNullOrBlank()) {
            tutupDialogKode()
            return
        }
        if (kode != kodeTerakhir) {
            kodeTerakhir = kode
            kodeDiabaikan = false
        }
        val ada = kodeDialog
        if (ada != null && ada.isShowing) {
            kodeTeks?.text = kode
            return
        }
        if (kodeDiabaikan) return

        val kotak = TextView(this).apply {
            text = kode
            gravity = Gravity.CENTER
            setTextColor(ContextCompat.getColor(this@MainActivity, R.color.wr_hijau_terang))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 34f)
            typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)
            letterSpacing = 0.12f
            setBackgroundResource(R.drawable.bg_kode)
            setPadding(dp(12), dp(20), dp(12), dp(20))
            setTextIsSelectable(true)
        }
        kodeTeks = kotak

        val nomor = settings.phone
        val d = lembar(
            "Masukin kode ini di WhatsApp",
            "1. Buka WhatsApp di HP yang nomornya $nomor\n" +
                    "2. Titik tiga ⋮ → Perangkat tertaut → Tautkan perangkat\n" +
                    "3. Pilih \"Tautkan dengan nomor telepon saja\" (di bawah kamera)\n" +
                    "4. Ketik kode di bawah\n\n" +
                    "Biasanya WA juga ngirim notifikasi \"masukkan kode\" — tinggal tap itu.",
            kotak,
            Tombol("Salin kode", Gaya.UTAMA, tutup = false) {
                salin(kode.replace("-", ""))
                banner("Kode disalin.")
            },
            Tombol("Buka WhatsApp", Gaya.GARIS, tutup = false) { bukaWhatsApp() },
            Tombol("Tutup", Gaya.LEMBUT)
        )
        d.setOnDismissListener {
            if (!sedangTutupPaksa) {
                kodeDiabaikan = true
                LogRecorder.tulis("Kode", "lembar pairing code ditutup user")
            }
        }
        kodeDialog = d
        LogRecorder.tulis("Kode", "pairing code tampil")
    }

    private fun bukaWhatsApp() {
        for (pkg in listOf("com.whatsapp", "com.whatsapp.w4b")) {
            val i = packageManager.getLaunchIntentForPackage(pkg) ?: continue
            try {
                startActivity(i)
                return
            } catch (_: Throwable) {
            }
        }
        banner("WhatsApp nggak ketemu di HP ini — ketik kodenya di HP yang ada WA-nya.")
    }

    private fun tutupDialogKode() {
        val d = kodeDialog ?: return
        sedangTutupPaksa = true
        try {
            if (d.isShowing) d.dismiss()
        } catch (_: Throwable) {
        } finally {
            sedangTutupPaksa = false
        }
        kodeDialog = null
        kodeTeks = null
        kodeTerakhir = null
    }

    // ----------------------------- QR -----------------------------

    private fun tanganiQr(qr: String?) {
        if (qr.isNullOrBlank()) {
            tutupDialogQr()
            return
        }
        if (qr != qrTerakhir) {
            qrTerakhir = qr
            qrBitmap = null
        }
        val bmp = qrBitmap
        if (bmp != null) {
            tampilkanDialogQr(bmp)
            return
        }
        if (qrSedangDibuat) return

        qrSedangDibuat = true
        val teks = qr
        qrScope.launch {
            val hasil = QrBitmap.fromText(teks)
            handler.post {
                qrSedangDibuat = false
                if (isFinishing || isDestroyed) return@post
                if (hasil == null) {
                    LogRecorder.galat("Qr", "QR gagal digambar", null)
                    banner("QR-nya gagal digambar — coba pakai kode aja.")
                    return@post
                }
                if (teks == qrTerakhir) {
                    qrBitmap = hasil
                    tampilkanDialogQr(hasil)
                }
            }
        }
    }

    private fun tampilkanDialogQr(bmp: Bitmap) {
        if (isFinishing || isDestroyed || qrDiabaikan) return
        // QR digambar di background — pas kelar, bisa aja user udah pindah ke kode.
        val u = BotBus.ui
        if (u.setupMode != "qr" || !u.pairingCode.isNullOrBlank()) return
        val ada = qrDialog
        if (ada != null && ada.isShowing) {
            qrImage?.setImageBitmap(bmp)
            return
        }
        val iv = ImageView(this).apply {
            setImageBitmap(bmp)
            adjustViewBounds = true
            setBackgroundResource(R.drawable.bg_qr)
            setPadding(dp(14), dp(14), dp(14), dp(14))
            contentDescription = "Kode QR WhatsApp"
        }
        qrImage = iv
        val d = lembar(
            "Scan pakai WhatsApp",
            "Dari HP LAIN yang ada WA-nya: ⋮ → Perangkat tertaut → Tautkan perangkat, " +
                    "lalu arahkan kamera ke sini. QR-nya ganti sendiri tiap ±20 detik.\n\n" +
                    "Bot-nya di HP yang sama dengan WA? Tutup ini, pakai \"Tautkan pakai kode\".",
            iv,
            Tombol("Tutup", Gaya.LEMBUT)
        )
        d.setOnDismissListener {
            if (!sedangTutupPaksa) {
                qrDiabaikan = true
                LogRecorder.tulis("Qr", "dialog QR ditutup user")
            }
        }
        qrDialog = d
        LogRecorder.tulis("Qr", "QR tampil — menunggu discan")
    }

    private fun tutupDialogQr() {
        val d = qrDialog ?: return
        sedangTutupPaksa = true
        try {
            if (d.isShowing) d.dismiss()
        } catch (_: Throwable) {
        } finally {
            sedangTutupPaksa = false
        }
        qrDialog = null
        qrImage = null
        qrTerakhir = null
        qrBitmap = null
    }

    // ----------------------------- daftar hitam -----------------------------

    /** Dialog daftar hitam: tiap orang ada tombol "Buka blokir". */
    private fun tampilkanDaftarHitam(ui: BotUi) {
        try {
            dialogHitam?.dismiss()
        } catch (_: Throwable) {
        }
        val tgl = java.text.SimpleDateFormat("d MMM yyyy", java.util.Locale("id", "ID"))
        val isi = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }

        fun teks(s: String, warna: Int, ukuran: Float) = TextView(this).apply {
            text = s
            setTextColor(ContextCompat.getColor(this@MainActivity, warna))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, ukuran)
        }

        if (ui.daftarHitam.isEmpty()) {
            isi.addView(teks("Nggak ada yang diblokir otomatis.", R.color.wr_teks2, 14f))
        }
        ui.daftarHitam.forEachIndexed { i, o ->
            val baris = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setBackgroundResource(R.drawable.bg_ubin)
                setPadding(dp(12), dp(10), dp(10), dp(10))
            }
            val kiri = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
            kiri.addView(teks(o.label, R.color.wr_teks, 15f))
            kiri.addView(
                teks(
                    o.sejak?.let { "keluar / dikeluarin ${tgl.format(java.util.Date(it))}" } ?: "dicatat bot",
                    R.color.wr_teks2, 12f
                )
            )
            baris.addView(kiri, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            val tombol = TextView(this, null, 0, R.style.TombolGaris).apply {
                text = "Buka blokir"
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
                setPadding(dp(12), 0, dp(12), 0)
                setOnClickListener {
                    LogRecorder.tulis("Hitam", "buka blokir ${o.label}")
                    text = "Membuka…"
                    isEnabled = false
                    alpha = 0.55f
                    withService { sendCmd(mapOf("type" to "hapus-hitam", "kunci" to o.kunci)) }
                    banner("${o.label} bisa join lagi (di-approve pas cek berikutnya).")
                }
            }
            baris.addView(tombol, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(40)))
            val lp = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
            if (i > 0) lp.topMargin = dp(8)
            isi.addView(baris, lp)
        }
        if (ui.daftarHitamManual.isNotEmpty()) {
            val t = teks(
                "Diblokir manual (kolom \"Selalu tolak nomor ini\"): ${ui.daftarHitamManual.joinToString(", ")}\n" +
                        "Buat buka blokir yang ini, hapus nomornya dari kolom itu terus Simpan.",
                R.color.wr_teks2, 12f
            )
            val lp = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
            lp.topMargin = dp(12)
            isi.addView(t, lp)
        }

        dialogHitam = lembar(
            "Daftar hitam (${ui.daftarHitam.size})",
            "Orang yang pernah keluar / dikeluarin dari grup. Kalau minta join lagi, otomatis ditolak — " +
                    "kecuali lo buka blokirnya di sini.",
            isi,
            Tombol("Tutup", Gaya.LEMBUT)
        )
    }

    // ----------------------------- komponen custom -----------------------------

    private enum class Gaya { UTAMA, GARIS, LEMBUT, BAHAYA }

    private class Tombol(
        val teks: String,
        val gaya: Gaya,
        val tutup: Boolean = true,
        val aksi: (() -> Unit)? = null
    )

    /** Dialog buatan sendiri (res/layout/lembar.xml). */
    private fun lembar(judul: String, pesan: String, isi: View?, vararg tombol: Tombol): Dialog {
        val d = Dialog(this, R.style.Lembar)
        val akar = LayoutInflater.from(this).inflate(R.layout.lembar, null)
        akar.findViewById<TextView>(R.id.lbJudul).text = judul
        akar.findViewById<TextView>(R.id.lbPesan).text = pesan
        val wadahIsi = akar.findViewById<FrameLayout>(R.id.lbIsi)
        if (isi != null) wadahIsi.addView(isi) else wadahIsi.visibility = View.GONE

        val wadahTombol = akar.findViewById<LinearLayout>(R.id.lbTombol)
        tombol.forEachIndexed { i, t ->
            val gayaRes = when (t.gaya) {
                Gaya.UTAMA -> R.style.TombolUtama
                Gaya.GARIS -> R.style.TombolGaris
                Gaya.LEMBUT -> R.style.TombolLembut
                Gaya.BAHAYA -> R.style.TombolBahaya
            }
            val v = TextView(this, null, 0, gayaRes).apply {
                text = t.teks
                setOnClickListener {
                    try {
                        t.aksi?.invoke()
                    } catch (e: Throwable) {
                        LogRecorder.galat("Lembar", "tombol \"${t.teks}\" gagal", e)
                    }
                    if (t.tutup) d.dismiss()
                }
            }
            val lp = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(50))
            if (i > 0) lp.topMargin = dp(8)
            wadahTombol.addView(v, lp)
        }

        d.setContentView(akar)
        d.window?.setLayout(
            (resources.displayMetrics.widthPixels * 0.92).toInt(),
            ViewGroup.LayoutParams.WRAP_CONTENT
        )
        d.show()
        return d
    }

    /** Pengganti Toast: kotak kecil di atas tombol Simpan. */
    private fun banner(pesan: String) {
        handler.removeCallbacks(sembunyikanBanner)
        tvBanner.text = pesan
        if (tvBanner.visibility != View.VISIBLE) {
            tvBanner.alpha = 0f
            tvBanner.translationY = dp(12).toFloat()
            tvBanner.visibility = View.VISIBLE
        }
        tvBanner.animate().alpha(1f).translationY(0f).setDuration(180).start()
        handler.postDelayed(sembunyikanBanner, 3800)
    }

    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()
}
