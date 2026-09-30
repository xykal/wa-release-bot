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
    private lateinit var nav: NavBawah

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
                Aksi.NYALA -> getString(R.string.k_bot_belum_mau_jalan_cek)
                Aksi.JEDA -> getString(R.string.k_engine_belum_ngejawab_perintah_jeda)
                Aksi.MATI -> getString(R.string.k_service_belum_berhenti_coba_lagi)
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
        nav = NavBawah(this) { t -> onPindahTab(t) }
        splash = SplashUtama(this, handler, { uiPernahTampil }, { nav.animasiMasuk() })
        wireViews()
        nav.ikat()
        if (savedInstanceState != null) nav.pulihkan(savedInstanceState)
        form.muat()
        // pemanis: tiap tombol berdenyut pas dipencet, kartu muncul satu-satu
        Denyut.pasangSemua(window.decorView)
        if (savedInstanceState == null) {
            splash.mulai()
        } else {
            nav.animasiMasuk()
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
                banner(getString(R.string.k_daftar_repo_diperbarui))
            } else {
                banner(getString(R.string.k_daftar_repo_kosong_bot_nggak))
            }
        }
        repoTerkirim = repoSekarang
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        if (::nav.isInitialized) nav.simpanKe(outState)
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
                banner(getString(R.string.k_gagal, nama, e.message))
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
            getString(R.string.k_v_rilis_github_whatsapp, BuildConfig.VERSION_NAME)
        tvFolderLog.text = LogRecorder.dir?.absolutePath ?: "(folder log nggak kebaca)"
        val namaApp = getString(R.string.app_name)
        findViewById<TextView>(R.id.tvTentang).text =
            getString(R.string.k_v_bot_pribadi_rilis_github, namaApp, BuildConfig.VERSION_NAME, BuildConfig.VERSION_CODE)
        pasang(R.id.btnKelolaRepo, "Kelola repo") { startActivity(Intent(this, RepoActivity::class.java)) }
        pasang(R.id.btnRepo, "Buka repo") {
            try {
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://github.com/xykal/wa-release-bot")))
            } catch (_: Exception) {
                banner(getString(R.string.k_nggak_ada_browser_buat_buka))
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
                getString(R.string.k_lepas_whatsapp),
                getString(R.string.k_bot_berhenti_bisa_posting_jaga),
                null,
                Tombol(getString(R.string.k_lepas), Gaya.BAHAYA) { withService { sendCmd(mapOf("type" to "lepas")) } },
                Tombol(getString(R.string.k_batal), Gaya.LEMBUT)
            )
        }
        pasang(R.id.btnTest, "Tes kirim channel") {
            if (!simpanDiamDiam()) return@pasang
            withService { sendCmd(mapOf("type" to "test")) }
            banner(getString(R.string.k_ngirim_pesan_tes_ke_channel))
        }
        pasang(R.id.btnTesGrup, "Tes kirim grup") {
            form.ambil()
            if (settings.grupTarget.isBlank()) {
                banner(getString(R.string.k_isi_link_undangan_grup_dulu))
                form.etGrup.requestFocus()
                return@pasang
            }
            if (!simpanDiamDiam()) return@pasang
            withService { sendCmd(mapOf("type" to "tes-grup")) }
            banner(getString(R.string.k_ngirim_pesan_tes_ke_grup))
        }
        pasang(R.id.btnBikinChannel, "Bikin channel") {
            lembar(
                getString(R.string.k_bikin_channel_baru),
                getString(R.string.k_bot_bikinin_channel_whatsapp_atas),
                null,
                Tombol(getString(R.string.k_bikin), Gaya.UTAMA) {
                    if (simpanDiamDiam()) withService { sendCmd(mapOf("type" to "bikin-channel")) }
                },
                Tombol(getString(R.string.k_batal), Gaya.LEMBUT)
            )
        }
        pasang(R.id.btnCekGrup, "Cek grup") {
            if (!simpanDiamDiam()) return@pasang
            withService { sendCmd(mapOf("type" to "cek-grup")) }
        }
        pasang(R.id.btnLihatHitam, "Daftar hitam") {
            mauLihatHitam = true
            withService { sendCmd(mapOf("type" to "lihat-hitam")) }
            banner(getString(R.string.k_ngambil_daftar_hitam))
        }
        pasang(R.id.btnResetHitam, "Kosongin daftar hitam") {
            lembar(
                getString(R.string.k_kosongin_daftar_hitam),
                getString(R.string.k_semua_orang_yang_dicatat_bot),
                null,
                Tombol(getString(R.string.u_kosongin), Gaya.BAHAYA) { withService { sendCmd(mapOf("type" to "reset-hitam")) } },
                Tombol(getString(R.string.k_batal), Gaya.LEMBUT)
            )
        }
        pasang(R.id.btnLaguSekarang, "Kirim lagu sekarang") {
            form.ambil()
            if (settings.channel.isBlank()) {
                // Kolomnya di tab Repo; pindah dulu biar kelihatan, baru disuruh isi.
                nav.pindah(Tab.REPO)
                banner(getString(R.string.k_isi_channel_wa_dulu_lagunya))
                form.etChannel.requestFocus()
                return@pasang
            }
            if (!simpanDiamDiam()) return@pasang
            withService { sendCmd(mapOf("type" to "lagu-sekarang")) }
            banner(getString(R.string.k_ngambil_lagu_dari_antrian_ngirim))
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
                getString(R.string.k_matikan_service),
                getString(R.string.k_proses_node_semua_jadwal_berhenti),
                null,
                Tombol(getString(R.string.k_matikan), Gaya.BAHAYA) {
                    tungguAksi(Aksi.MATI)
                    BotService.stop(this)
                },
                Tombol(getString(R.string.k_batal), Gaya.LEMBUT)
            )
        }
    }

    /** Reaksi pas user pindah tab (dipanggil NavBawah sesudah tab-nya kelihatan). */
    private fun onPindahTab(t: Tab) {
        // Log panjang: begitu tab dibuka, yang kelihatan harus baris paling baru,
        // bukan posisi gulung lama.
        if (t == Tab.LOG) panel.lompatKeBawah()
    }

    // ----------------------------- simpan & perintah -----------------------------

    /** @return true kalau setting valid & udah dikirim ke engine. */
    private fun onSave(diam: Boolean): Boolean {
        form.ambil()
        if (settings.grupAktif && settings.grupTarget.isBlank()) {
            banner(getString(R.string.k_penjaga_grup_dinyalain_tapi_link))
            return false
        }
        if (!settings.hasValidSettings()) {
            banner(getString(R.string.k_isi_repo_github_nyalain_penjaga))
            return false
        }
        withService { sendCmd(settings.toConfigureCmd()) }
        repoTerkirim = settings.repo
        if (!diam) {
            banner(
                when {
                    settings.repo.isNotBlank() && settings.channel.isBlank() ->
                        getString(R.string.k_disimpan_channel_masih_kosong_tempel)
                    else -> getString(R.string.k_setting_disimpan)
                }
            )
        }
        return true
    }

    private fun simpanDiamDiam(): Boolean = onSave(diam = true)

    private fun mulaiTautkan(cara: String) {
        form.ambil()
        if (cara == "pairing" && settings.phone.filter { it.isDigit() }.length < 8) {
            banner(getString(R.string.k_isi_nomor_wa_lo_dulu))
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
        banner(if (cara == "pairing") getString(R.string.k_minta_kode_ke_whatsapp) else getString(R.string.k_nyiapin_qr))
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
                banner(getString(R.string.k_gagal_nyalain_service, e.message))
                return
            }
        }
        if (cobaKe >= 14) {
            LogRecorder.tulis("Service", "nyerah nunggu service siap (>10 detik)")
            banner(getString(R.string.k_service_nya_lama_nggak_siap))
            return
        }
        val jeda = if (cobaKe < 4) 400L else 1000L
        handler.postDelayed({ withService(cobaKe + 1, action) }, jeda)
    }

    private fun sendCmd(cmd: Map<String, Any>) {
        val svc = BotService.instance
        if (svc == null) {
            LogRecorder.tulis("Cmd", "dibuang, service belum siap: ${cmd["type"]}")
            banner(getString(R.string.k_service_belum_siap_coba_lagi))
            return
        }
        // token GitHub jangan ikut ke-log
        LogRecorder.tulis("Cmd", "kirim: ${cmd.filterKeys { it != "token" }}")
        svc.setUiTerlihat(true)
        svc.sendCmd(cmd)
    }

    private fun renderBatre() {
        tvBatreStat.text = if (aksi.bebasBatre()) {
            getString(R.string.k_pengoptimalan_batre_dikecualikan_android_nggak)
        } else {
            getString(R.string.k_pengoptimalan_batre_masih_aktif_bot)
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
            Aksi.NYALA -> if (ui.engineRunning) aksiBeres(getString(R.string.k_bot_jalan_cek_rilis_sesuai))
            Aksi.JEDA -> if (!ui.engineRunning) aksiBeres(getString(R.string.k_bot_dijeda_jadwal_berhenti_service))
            Aksi.MATI -> if (!ui.serviceRunning) aksiBeres(getString(R.string.k_service_mati_bot_berhenti_total))
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
                    if (setupTerakhir != null) banner(getString(R.string.k_whatsapp_tertaut_bot_siap_kerja))
                    dialogTaut.tutupSemua()
                }
                "error" -> if (setupTerakhir != null) banner(getString(R.string.k_nautin_wa_gagal_alasannya_ada))
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
            banner(getString(R.string.k_status_diperbarui))
        } else {
            banner(getString(R.string.k_service_lagi_mati_tekan_mulai))
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
