package com.xykals.warelease

import android.Manifest
import android.app.Dialog
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.xykals.warelease.util.Durasi
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * Dashboard: status bot, tautan WA, aksi cepat, log.
 * Semua isian setelan pindah ke [SettingsActivity] (ikon gerigi).
 */
class MainActivity : AppCompatActivity() {

    private val handler = Handler(Looper.getMainLooper())
    private lateinit var settings: SettingsStore
    private lateinit var banner: Banner

    private lateinit var etPhone: EditText
    private lateinit var tvPill: TextView
    private lateinit var tvUbinWa: TextView
    private lateinit var tvUbinMode: TextView
    private lateinit var tvUbinRilis: TextView
    private lateinit var tvUbinGrup: TextView
    private lateinit var tvNext: TextView
    private lateinit var tvError: TextView
    private lateinit var tvWaStatus: TextView
    private lateinit var tvGrupStat: TextView
    private lateinit var tvLog: TextView
    private lateinit var svLog: ScrollView
    private var logTampil: List<String>? = null
    private lateinit var btnMulai: TextView
    private lateinit var btnKill: TextView
    private lateinit var kartuTertaut: View
    private lateinit var kartuTautkan: View
    private lateinit var tvTertautJudul: TextView
    private lateinit var tvTertautKet: TextView

    private var engineJalan = false
    private var setupTerakhir: String? = null
    private var tahapTerakhir: String? = null

    // Daftar hitam: dialognya kebuka kalau user yang minta, dan di-refresh
    // tiap engine ngirim daftar baru (mis. habis buka blokir).
    private var mauLihatHitam = false
    private var hitamSeqTerakhir = -1
    private var dialogHitam: Dialog? = null

    // Lihat respons Pertanyaan
    private var mauLihatRespons = false
    private var responsSeqTerakhir = -1
    private var dialogRespons: Dialog? = null

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
                Aksi.NYALA -> "Bot belum mau jalan. Cek Setelan & kartu Log."
                Aksi.JEDA -> "Engine belum ngejawab perintah jeda. Coba lagi, atau Matikan."
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

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        LogRecorder.init(this)
        LogRecorder.tulis("Activity", "MainActivity dibuka")
        settings = SettingsStore(this)

        // Pertama kali buka → layar sambutan dulu.
        if (!settings.sambutanSelesai) {
            startActivity(Intent(this, WelcomeActivity::class.java))
        }

        setContentView(R.layout.activity_main)
        wireViews()
        etPhone.setText(settings.phone)

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
    }

    override fun onPause() {
        BotBus.unsubscribe(busListener)
        BotService.instance?.setUiTerlihat(false)
        val hp = etPhone.text.toString()
        if (hp != settings.phone) settings.phone = hp
        super.onPause()
    }

    override fun onDestroy() {
        qrScope.cancel()
        tutupDialogQr()
        tutupDialogKode()
        super.onDestroy()
    }

    private fun banner(pesan: String) = banner.tampil(pesan)
    private fun pasang(id: Int, nama: String, aksi: () -> Unit) = pasangTombol(id, nama, { banner(it) }, aksi)
    private fun withService(action: () -> Unit) = denganService({ banner(it) }) { action() }
    private fun sendCmd(cmd: Map<String, Any>) = kirimCmd(cmd) { banner(it) }

    private fun bukaSetelan(bagian: String? = null) {
        startActivity(Intent(this, SettingsActivity::class.java).apply {
            if (bagian != null) putExtra(SettingsActivity.EXTRA_BAGIAN, bagian)
        })
    }

    // ----------------------------- pasang view -----------------------------

    private fun wireViews() {
        etPhone = findViewById(R.id.etPhone)
        tvPill = findViewById(R.id.tvPill)
        tvUbinWa = findViewById(R.id.tvUbinWa)
        tvUbinMode = findViewById(R.id.tvUbinMode)
        tvUbinRilis = findViewById(R.id.tvUbinRilis)
        tvUbinGrup = findViewById(R.id.tvUbinGrup)
        tvNext = findViewById(R.id.tvNext)
        tvError = findViewById(R.id.tvError)
        tvWaStatus = findViewById(R.id.tvWaStatus)
        tvGrupStat = findViewById(R.id.tvGrupStat)
        tvLog = findViewById(R.id.tvLog)
        svLog = findViewById(R.id.svLog)
        btnMulai = findViewById(R.id.btnMulai)
        btnKill = findViewById(R.id.btnKill)
        kartuTertaut = findViewById(R.id.kartuTertaut)
        kartuTautkan = findViewById(R.id.kartuTautkan)
        tvTertautJudul = findViewById(R.id.tvTertautJudul)
        tvTertautKet = findViewById(R.id.tvTertautKet)
        banner = Banner(findViewById(R.id.tvBanner))

        findViewById<TextView>(R.id.tvVersi).text = "v${BuildConfig.VERSION_NAME}"

        pasang(R.id.btnSetelan, "Setelan") { bukaSetelan() }
        pasang(R.id.btnMulai, "Mulai/Jeda") {
            if (aksiTunggu != null) return@pasang // lagi nunggu yang tadi
            if (engineJalan) {
                tungguAksi(Aksi.JEDA)
                withService { sendCmd(mapOf("type" to "stop")) }
            } else {
                if (!kirimSetelan()) return@pasang
                tungguAksi(Aksi.NYALA)
                withService { sendCmd(mapOf("type" to "start")) }
            }
        }
        pasang(R.id.btnCheck, "Cek sekarang") {
            if (!kirimSetelan()) return@pasang
            withService { sendCmd(mapOf("type" to "check")) }
            banner("Ngecek sekarang… hasilnya di Log.")
        }
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
            if (settings.channel.isBlank()) {
                banner("Channel WA masih kosong — isi di Setelan → Channel.")
                bukaSetelan("channel")
                return@pasang
            }
            if (!kirimSetelan()) return@pasang
            withService { sendCmd(mapOf("type" to "test")) }
            banner("Ngirim pesan tes ke channel… hasilnya di Log.")
        }
        pasang(R.id.btnRespons, "Lihat respons") {
            if (!kirimSetelan()) return@pasang
            mauLihatRespons = true
            withService { sendCmd(mapOf("type" to "lihat-respons")) }
            banner("Ngambil respons follower…")
        }
        pasang(R.id.btnTesGrup, "Tes kirim grup") {
            if (settings.grupTarget.isBlank()) {
                banner("Link grup masih kosong — isi di Setelan → Penjaga grup.")
                bukaSetelan("grup")
                return@pasang
            }
            if (!kirimSetelan()) return@pasang
            withService { sendCmd(mapOf("type" to "tes-grup")) }
            banner("Ngirim pesan \"Bot penjaga grup aktif\" ke grup… hasilnya di Log.")
        }
        pasang(R.id.btnLihatHitam, "Daftar hitam") {
            mauLihatHitam = true
            withService { sendCmd(mapOf("type" to "lihat-hitam")) }
            banner("Ngambil daftar hitam…")
        }
        pasang(R.id.btnKirimLog, "Kirim log") { kirimSemuaLog { banner(it) } }
        pasang(R.id.btnKill, "Matikan service") {
            lembar(
                "Matikan bot?",
                "Proses Node & semua jadwal berhenti sampai lo tekan Nyalakan lagi " +
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

    /**
     * Kirim setelan yang tersimpan ke engine.
     * @return false kalau setelan belum lengkap (user diarahkan ke Setelan).
     */
    private fun kirimSetelan(): Boolean {
        if (settings.grupAktif && settings.grupTarget.isBlank()) {
            banner("Penjaga grup nyala, tapi link grup-nya kosong. Lengkapi di Setelan.")
            bukaSetelan("grup")
            return false
        }
        if (!settings.hasValidSettings()) {
            banner("Isi repo GitHub atau nyalain penjaga grup dulu di Setelan.")
            bukaSetelan()
            return false
        }
        withService { sendCmd(settings.toConfigureCmd()) }
        return true
    }

    private fun mulaiTautkan(cara: String) {
        settings.phone = etPhone.text.toString()
        if (cara == "pairing" && settings.phone.filter { it.isDigit() }.length < 8) {
            banner("Isi nomor WA lo dulu (yang mau dipakai bot), contoh 0812 3456 7890.")
            etPhone.requestFocus()
            return
        }
        // Setelan ikut dikirim kalau udah valid; kalau belum, nautin tetap jalan.
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

    // ----------------------------- render -----------------------------

    private fun renderUi(ui: BotUi) {
        if (isFinishing || isDestroyed) return
        if (ui.serviceRunning) BotService.instance?.setUiTerlihat(true)

        engineJalan = ui.engineRunning

        // Aksi yang ditunggu udah kejadian? → kasih tau, balikin tombol normal.
        when (aksiTunggu) {
            Aksi.NYALA -> if (ui.engineRunning) aksiBeres("✓ Bot jalan — mode ${Mode.nama(ui.mode)}.")
            Aksi.JEDA -> if (!ui.engineRunning) aksiBeres("⏸ Bot dijeda — jadwal berhenti, service tetap nyala.")
            Aksi.MATI -> if (!ui.serviceRunning) aksiBeres("⏻ Bot mati total sampai lo tekan Nyalakan.")
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

        // ---- kartu tautan: udah tertaut → banner hijau, belum → form nautin
        val nomor = rapikanNomor(ui.waNomor)
        val lagiNautin = ui.setupState == "starting"
        if (ui.waLinked && !lagiNautin) {
            kartuTertaut.visibility = View.VISIBLE
            kartuTautkan.visibility = View.GONE
            tvTertautJudul.text = if (nomor.isNotBlank()) "✓ WA $nomor SUDAH TERTAUT" else "✓ WA SUDAH TERTAUT"
            tvTertautKet.text = when {
                ui.waConnected -> "Lagi nyambung ke WhatsApp sekarang"
                ui.engineRunning -> "Perangkat tertaut aktif · nyambung pas perlu"
                else -> "Perangkat tertaut aktif · bot lagi nggak jalan"
            }
        } else {
            kartuTertaut.visibility = View.GONE
            kartuTautkan.visibility = View.VISIBLE
        }

        tvUbinWa.text = when {
            ui.waConnected -> "Tersambung"
            ui.waLinked -> "Tertaut"
            else -> "Belum ditautkan"
        }
        tvUbinMode.text = Mode.nama(ui.mode) + when {
            ui.busy -> " · cek…"
            ui.engineRunning -> ""
            ui.serviceRunning -> " · jeda"
            else -> " · mati"
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
            ui.nextGrupAt?.let { "cek grup ${Durasi.human(it - sekarang)} lagi" }
        ).joinToString("  ·  ")
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
            !ui.serviceRunning -> "Udah mati"
            else -> "Matikan"
        }
        val killAktif = ui.serviceRunning && tunggu == null
        btnKill.isEnabled = killAktif
        btnKill.alpha = if (killAktif) 1f else 0.45f

        tvWaStatus.text = when {
            lagiNautin && ui.setupTahap != null -> ui.setupTahap!!
            lagiNautin -> "Lagi nautin…"
            else -> "Belum tertaut."
        }
        tvWaStatus.setTextColor(
            ContextCompat.getColor(this, if (lagiNautin) R.color.wr_kuning else R.color.wr_teks2)
        )

        tvGrupStat.text = buildString {
            if (!ui.grupAktif) {
                append("Penjaga grup mati.")
            } else {
                val last = ui.grupLastCekAt?.let { "${Durasi.human(sekarang - it)} lalu" } ?: "belum pernah"
                append("Grup: ${ui.grupNama ?: "(belum dicek)"}\n")
                append("Di-approve ${ui.grupDisetujui} · ditolak ${ui.grupDitolak} · daftar hitam ${ui.grupHitam}\n")
                append("Cek terakhir: $last")
            }
            if (ui.pluginJumlah > 0) append("\nScript bot aktif: ${ui.pluginJumlah}")
        }

        val err = ui.engineError
        tvError.visibility = if (err != null) View.VISIBLE else View.GONE
        if (err != null) tvError.text = err

        // Kartu log cuma digambar ulang kalau isinya BERUBAH (dulu tiap status
        // masuk — beberapa kali per detik pas engine rame).
        if (ui.log.isNotEmpty() && ui.log !== logTampil) {
            logTampil = ui.log
            tvLog.text = ui.log.takeLast(60).joinToString("\n")
            svLog.post { svLog.fullScroll(View.FOCUS_DOWN) }
        }

        val baru = ui.channelBaru
        if (!baru.isNullOrBlank() && baru != settings.channel) {
            settings.channel = baru
            LogRecorder.tulis("Channel", "setelan diisi otomatis: $baru")
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

        if (ui.responsSeq != responsSeqTerakhir) {
            val pertama = responsSeqTerakhir == -1
            responsSeqTerakhir = ui.responsSeq
            val r = ui.respons
            if (!pertama && mauLihatRespons && r != null) {
                mauLihatRespons = false
                tampilkanRespons(r)
            }
        }

        if (ui.setupTahap != null && ui.setupTahap != tahapTerakhir) {
            banner(ui.setupTahap!!)
        }
        tahapTerakhir = ui.setupTahap

        // QR & pairing code nggak boleh nongol bareng: kalau lagi mode kode,
        // QR-nya diabaikan (Baileys tetap bikin QR di belakang layar).
        tanganiKode(ui.pairingCode)
        tanganiQr(if (ui.pairingCode.isNullOrBlank()) ui.qr else null)
    }

    // ----------------------------- lihat respons -----------------------------

    private fun tampilkanRespons(r: HasilRespons) {
        try {
            dialogRespons?.dismiss()
        } catch (_: Throwable) {
        }
        if (!r.ok) {
            dialogRespons = lembar(
                "Lihat respons",
                r.pesan ?: "Gagal ngambil respons.",
                null,
                Tombol("Oke", Gaya.UTAMA)
            )
            return
        }
        val jam = java.text.SimpleDateFormat("d MMM, HH:mm", java.util.Locale("id", "ID"))
        val isi = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        fun teks(s: String, warna: Int, ukuran: Float, tebal: Boolean = false) = TextView(this).apply {
            text = s
            setTextColor(ContextCompat.getColor(this@MainActivity, warna))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, ukuran)
            if (tebal) setTypeface(typeface, Typeface.BOLD)
        }
        if (r.items.isEmpty()) {
            isi.addView(teks("Belum ada yang bales.", R.color.wr_teks2, 14f))
        }
        r.items.forEachIndexed { i, o ->
            val kotak = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setBackgroundResource(R.drawable.bg_ubin)
                setPadding(dp(12), dp(10), dp(12), dp(10))
            }
            val kepala = o.nama + (o.t?.let { "  ·  " + jam.format(java.util.Date(it)) } ?: "") +
                    (if (o.dibalas) "  ·  ✓ dibalas" else "")
            kotak.addView(teks(kepala, R.color.wr_hijau, 12.5f, true))
            kotak.addView(teks(o.teks, R.color.wr_teks, 14.5f).apply { setTextIsSelectable(true) })
            val lp = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
            if (i > 0) lp.topMargin = dp(8)
            isi.addView(kotak, lp)
        }
        dialogRespons = lembar(
            "Respons (${r.items.size})",
            "Balasan follower buat \"${r.judul ?: "Pertanyaan terakhir"}\". Cuma lo (admin) yang bisa liat ini. " +
                    "Buat bales, buka channel-nya di WhatsApp → pesan → Lihat respons.",
            isi,
            Tombol("Muat ulang", Gaya.GARIS) {
                mauLihatRespons = true
                withService { sendCmd(mapOf("type" to "lihat-respons")) }
            },
            Tombol("Tutup", Gaya.LEMBUT)
        )
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

}
