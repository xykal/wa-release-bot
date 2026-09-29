package com.xykals.warelease

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout

/**
 * Layar utama.
 *
 * Nggak pakai komponen Material sama sekali: tombol = TextView yang bisa
 * diklik, saklar = baris yang di-`isSelected`, dialog = [lembar] buatan
 * sendiri, notifikasi kecil = [banner] (pengganti Toast).
 *
 * Dipecah per tanggung jawab supaya tiap file kecil dan bisa dibaca sendiri:
 * [FormPengaturan] (kolom <-> SettingsStore), [PanelStatus] (gambar status),
 * [DialogTautan] (QR / pairing code), [LembarHitam] (daftar hitam),
 * [AksiSistem] (batre, autostart, log, clipboard), [SplashUtama]. File ini yang
 * merangkai: tombol, kirim perintah ke service, dan reaksi atas perubahan
 * status (banner, buka/tutup dialog).
 */
class MainActivity : AppCompatActivity() {

    private val handler = Handler(Looper.getMainLooper())
    private lateinit var settings: SettingsStore
    private lateinit var form: FormPengaturan
    private lateinit var panel: PanelStatus
    private lateinit var aksi: AksiSistem
    private lateinit var dialogTaut: DialogTautan
    private lateinit var lembarHitam: LembarHitam
    private lateinit var splash: SplashUtama

    // Daftar repo terakhir yang dikirim ke engine; onResume membandingkannya
    // buat tahu apakah layar Repo mengubah sesuatu.
    private var repoTerkirim: String? = null
    private var segarkan: SwipeRefreshLayout? = null
    private val selesaiSegar = Runnable { segarkan?.isRefreshing = false }
    private lateinit var tvBatreStat: TextView
    private lateinit var tvFolderLog: TextView
    private lateinit var tvBanner: TextView

    private var engineJalan = false
    private var setupTerakhir: String? = null
    private var tahapTerakhir: String? = null
    private var uiPernahTampil = false

    // Daftar hitam: dialognya kebuka kalau user yang minta, dan di-refresh
    // tiap engine ngirim daftar baru (mis. habis buka blokir).
    private var mauLihatHitam = false
    private var hitamSeqTerakhir = -1

    // Aksi Mulai / Jeda / Matikan yang lagi ditunggu hasilnya. Selama belum
    // kejadian, tombolnya nunjukin "Menyalakan…" dst. dan nggak bisa dipencet
    // dobel — biar jelas bot-nya udah nyala/mati atau belum.
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
        aksi = AksiSistem(this) { banner(it) }
        form = FormPengaturan(this, settings)
        panel = PanelStatus(this, settings, form)
        dialogTaut = DialogTautan(this, handler, { settings.phone }, { banner(it) }, aksi)
        lembarHitam = LembarHitam(this, { banner(it) }) { cmd -> withService { sendCmd(cmd) } }
        splash = SplashUtama(this, handler) { uiPernahTampil }
        wireViews()
        form.muat()
        // pemanis: tiap tombol berdenyut pas dipencet, kartu muncul satu-satu
        Denyut.pasangSemua(window.decorView)
        if (savedInstanceState == null) {
            splash.mulai()
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
            form.renderRepoRingkas()
            if (settings.hasValidSettings()) {
                withService { sendCmd(settings.toConfigureCmd()) }
                banner("Daftar repo diperbarui.")
            } else {
                banner("Daftar repo kosong — bot nggak mantau apa-apa sampai lo nambah repo.")
            }
        }
        repoTerkirim = repoSekarang
    }

    override fun onPause() {
        BotBus.unsubscribe(busListener)
        BotService.instance?.setUiTerlihat(false)
        super.onPause()
    }

    override fun onDestroy() {
        // Jalur onboarding keluar dari onCreate sebelum bagian-bagian ini dibuat.
        if (::splash.isInitialized) splash.hancurkan()
        if (::dialogTaut.isInitialized) dialogTaut.hancurkan()
        super.onDestroy()
    }

    // ----------------------------- pasang view -----------------------------

    /** Semua tombol lewat sini: dicatat ke log, dan kalau meledak app nggak mati. */
    private fun pasang(id: Int, nama: String, kerja: () -> Unit) {
        findViewById<View>(id).setOnClickListener {
            LogRecorder.tulis("Tombol", "tekan: $nama")
            try {
                kerja()
            } catch (e: Throwable) {
                LogRecorder.galat("Tombol", "\"$nama\" gagal", e)
                banner("\"$nama\" gagal: ${e.message}")
            }
        }
    }

    private fun wireViews() {
        form.ikat()
        panel.ikat()
        segarkan = findViewById<SwipeRefreshLayout>(R.id.segarkan).apply {
            setColorSchemeColors(ContextCompat.getColor(this@MainActivity, R.color.wr_hijau))
            setProgressBackgroundColorSchemeColor(ContextCompat.getColor(this@MainActivity, R.color.wr_latar))
            setOnRefreshListener { segarkanStatus() }
        }
        tvBatreStat = findViewById(R.id.tvBatreStat)
        tvFolderLog = findViewById(R.id.tvFolderLog)
        tvBanner = findViewById(R.id.tvBanner)

        findViewById<TextView>(R.id.tvVersi).text =
            "v${BuildConfig.VERSION_NAME} · rilis GitHub → WhatsApp"
        tvFolderLog.text = LogRecorder.dir?.absolutePath ?: "(folder log nggak kebaca)"
        findViewById<TextView>(R.id.tvTentang).text =
            "${getString(R.string.app_name)} v${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})\n" +
                    "Bot pribadi: rilis GitHub → saluran WA, penjaga grup, lagu mood, hosting bot.\n" +
                    "Lisensi: pemakaian pribadi — nggak boleh dijual / disebar ulang tanpa izin."
        pasang(R.id.btnKelolaRepo, "Kelola repo") { startActivity(Intent(this, RepoActivity::class.java)) }
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
            form.ambil()
            if (settings.grupTarget.isBlank()) {
                banner("Isi link undangan grup dulu.")
                form.etGrup.requestFocus()
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
            form.ambil()
            if (settings.channel.isBlank()) {
                banner("Isi Channel WA dulu — lagunya dikirim ke sana.")
                form.etChannel.requestFocus()
                return@pasang
            }
            if (!simpanDiamDiam()) return@pasang
            withService { sendCmd(mapOf("type" to "lagu-sekarang")) }
            banner("Ngambil lagu dari antrian & ngirim ke channel… hasilnya di kartu Log.")
        }
        pasang(R.id.btnHosting, "Buka hosting") {
            startActivity(Intent(this, HostingActivity::class.java))
        }
        pasang(R.id.btnBatre, "Izin batre") { aksi.mintaIzinBatre() }
        pasang(R.id.btnAutostart, "Autostart") { aksi.bukaAutostart() }
        pasang(R.id.btnBukaLog, "Buka folder log") { aksi.bukaFolderLog() }
        pasang(R.id.btnKirimLog, "Kirim log") { aksi.kirimLog() }
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

    // ----------------------------- simpan & perintah -----------------------------

    /** @return true kalau setting valid & udah dikirim ke engine. */
    private fun onSave(diam: Boolean): Boolean {
        form.ambil()
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
        form.ambil()
        if (cara == "pairing" && settings.phone.filter { it.isDigit() }.length < 8) {
            banner("Isi nomor WA lo dulu (yang mau dipakai bot), contoh 0812 3456 7890.")
            form.etPhone.requestFocus()
            return
        }
        // Setting ikut dikirim kalau udah valid; kalau belum, nautin tetap jalan.
        if (settings.hasValidSettings()) withService { sendCmd(settings.toConfigureCmd()) }
        // Ganti cara nautin → tampilan cara yang lama langsung ditutup
        // (engine juga ngebatalin setup yang lama).
        dialogTaut.mulaiUlang()
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

    private fun renderBatre() {
        tvBatreStat.text = if (aksi.bebasBatre()) {
            "Pengoptimalan batre: dikecualikan. Android nggak bakal nidurin bot ini."
        } else {
            "Pengoptimalan batre: masih AKTIF. Bot bisa ditidurin / dimatiin sistem pas layar mati. Tekan tombol di atas."
        }
    }

    // ----------------------------- render -----------------------------

    /** Dipanggil tiap status engine berubah: gambar ulang panel, lalu reaksi (banner, dialog). */
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
        panel.render(ui, aksiTunggu)

        val baru = ui.channelBaru
        if (!baru.isNullOrBlank() && baru != settings.channel) {
            settings.channel = baru
            form.etChannel.setText(baru)
            LogRecorder.tulis("Channel", "field diisi otomatis: $baru")
        }

        if (ui.setupState != setupTerakhir) {
            when (ui.setupState) {
                "done" -> {
                    if (setupTerakhir != null) banner("WhatsApp tertaut! Bot siap kerja.")
                    dialogTaut.tutupSemua()
                }
                "error" -> if (setupTerakhir != null) banner("Nautin WA gagal — alasannya ada di kartu Log.")
            }
            setupTerakhir = ui.setupState
        }

        if (ui.daftarHitamSeq != hitamSeqTerakhir) {
            val pertama = hitamSeqTerakhir == -1
            hitamSeqTerakhir = ui.daftarHitamSeq
            if (!pertama && (mauLihatHitam || lembarHitam.sedangTampil)) {
                mauLihatHitam = false
                lembarHitam.tampilkan(ui)
            }
        }

        if (ui.setupTahap != null && ui.setupTahap != tahapTerakhir) {
            banner(ui.setupTahap!!)
        }
        tahapTerakhir = ui.setupTahap

        // QR & pairing code nggak boleh nongol bareng: kalau lagi mode kode,
        // QR-nya diabaikan (Baileys tetap bikin QR di belakang layar).
        // Cuma cara yang lagi dipilih yang boleh tampil.
        val nautin = ui.setupState == "starting"
        dialogTaut.tanganiKode(if (nautin && ui.setupMode == "pairing") ui.pairingCode else null)
        dialogTaut.tanganiQr(if (nautin && ui.setupMode == "qr" && ui.pairingCode.isNullOrBlank()) ui.qr else null)
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
}
