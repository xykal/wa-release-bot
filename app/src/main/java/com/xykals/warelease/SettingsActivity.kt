package com.xykals.warelease

import android.content.ComponentName
import android.content.Intent
import android.graphics.Typeface
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.OpenableColumns
import android.provider.Settings
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import java.io.File

/**
 * Setelan: rilis, channel, grup, script bot, batre, log, tentang.
 *
 * Semua isian disimpan ke [SettingsStore] tiap layar ditinggal (biar nggak ada
 * ketikan yang ilang), dan dikirim ke engine pas tombol Simpan ditekan.
 */
class SettingsActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_BAGIAN = "bagian"
        private const val MAKS_SCRIPT = 512 * 1024L

        val CONTOH_SCRIPT = """// Contoh script bot — simpan sebagai sapa.js lalu upload.
// Perintah jalan di grup yang dijaga & chat "Pesan ke diri sendiri".
module.exports = {
  nama: 'Sapa',
  versi: '1.0',
  deskripsi: 'Contoh: !halo, !jam, !catat',

  perintah: {
    // !halo → dibales sapaan
    halo: async (ctx) => {
      await ctx.balas(`Halo ${'$'}{ctx.pengirim.nama || 'kak'}! 👋`);
    },

    // !jam → jam sekarang
    jam: async (ctx) => {
      const j = new Date().toLocaleTimeString('id-ID');
      await ctx.balas(`🕐 Sekarang jam ${'$'}{j}`);
    },

    // !catat <teks> → khusus admin, disimpen & bisa dibaca lagi pakai !catat
    catat: async (ctx) => {
      if (!ctx.adalahAdmin) return ctx.balas('🔒 Khusus admin.');
      if (ctx.sisa) {
        ctx.simpan('catatan', ctx.sisa);
        return ctx.balas('📝 Dicatat.');
      }
      return ctx.balas('📝 ' + (ctx.ambil('catatan') || '(kosong)'));
    },
  },

  // Opsional: tiap pesan biasa (bukan perintah) di grup.
  // onPesan: async (ctx) => { if (/promo/i.test(ctx.teks)) ctx.log('ada promo'); },

  // Opsional: tiap putaran jaga grup.
  // onJadwal: async (ctx) => { },
};
"""
    }

    private val handler = Handler(Looper.getMainLooper())
    private lateinit var settings: SettingsStore
    private lateinit var banner: Banner

    private lateinit var etRepo: EditText
    private lateinit var etToken: EditText
    private lateinit var etInterval: EditText
    private lateinit var etChannel: EditText
    private lateinit var etGrup: EditText
    private lateinit var etGrupInterval: EditText
    private lateinit var etGrupHitam: EditText
    private lateinit var etLinkRules: EditText
    private lateinit var etRingkasRules: EditText
    private lateinit var rowPrerelease: View
    private lateinit var rowPostFirst: View
    private lateinit var rowFormatTanya: View
    private lateinit var rowTestMsg: View
    private lateinit var rowGrupAktif: View
    private lateinit var rowPerintah: View
    private lateinit var rowSamarkan: View
    private lateinit var rowBoot: View
    private lateinit var rowLogcat: View
    private lateinit var tvBatreStat: TextView
    private lateinit var wadahScript: LinearLayout

    private var scriptSeqTerakhir = -1

    private val busListener: (BotUi) -> Unit = { ui -> handler.post { render(ui) } }

    private val pilihScript =
        registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> if (uri != null) pasangScript(uri) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        LogRecorder.tulis("Activity", "SettingsActivity dibuka")
        setContentView(R.layout.activity_setelan)
        settings = SettingsStore(this)
        banner = Banner(findViewById(R.id.tvBanner))
        wire()
        muat()
        intent.getStringExtra(EXTRA_BAGIAN)?.let { gulirKe(it) }
    }

    override fun onResume() {
        super.onResume()
        BotBus.subscribe(busListener)
        renderBatre()
        BotService.instance?.sendCmd(mapOf("type" to "plugin-daftar"))
        renderScript(BotBus.ui)
    }

    override fun onPause() {
        BotBus.unsubscribe(busListener)
        simpanKeStore() // jangan sampai ketikan ilang
        super.onPause()
    }

    private fun banner(pesan: String) = banner.tampil(pesan)
    private fun pasang(id: Int, nama: String, aksi: () -> Unit) = pasangTombol(id, nama, { banner(it) }, aksi)
    private fun withService(action: () -> Unit) = denganService({ banner(it) }) { action() }
    private fun sendCmd(cmd: Map<String, Any>) = kirimCmd(cmd) { banner(it) }

    // ----------------------------------------------------------------- view

    private fun wire() {
        etRepo = findViewById(R.id.etRepo)
        etToken = findViewById(R.id.etToken)
        etInterval = findViewById(R.id.etInterval)
        etChannel = findViewById(R.id.etChannel)
        etGrup = findViewById(R.id.etGrup)
        etGrupInterval = findViewById(R.id.etGrupInterval)
        etGrupHitam = findViewById(R.id.etGrupHitam)
        etLinkRules = findViewById(R.id.etLinkRules)
        etRingkasRules = findViewById(R.id.etRingkasRules)
        rowPrerelease = saklar(R.id.rowPrerelease)
        rowPostFirst = saklar(R.id.rowPostFirst)
        rowFormatTanya = saklar(R.id.rowFormatTanya)
        rowTestMsg = saklar(R.id.rowTestMsg)
        rowGrupAktif = saklar(R.id.rowGrupAktif)
        rowPerintah = saklar(R.id.rowPerintah)
        rowSamarkan = saklar(R.id.rowSamarkan)
        rowBoot = saklar(R.id.rowBoot)
        rowLogcat = saklar(R.id.rowLogcat)
        tvBatreStat = findViewById(R.id.tvBatreStat)
        wadahScript = findViewById(R.id.wadahScript)

        findViewById<TextView>(R.id.tvSetelanSub).text = "Disimpan otomatis · tekan Simpan buat nerapin"
        findViewById<TextView>(R.id.tvTentangVersi).text =
            "WA Release Bot v${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE}) · lisensi pemakaian pribadi"
        findViewById<TextView>(R.id.tvFolderLog).text = LogRecorder.dir?.absolutePath ?: "(folder log nggak kebaca)"

        pasang(R.id.btnKembali, "Kembali") { finish() }
        pasang(R.id.btnSave, "Simpan setelan") { simpan() }
        pasang(R.id.btnBikinChannel, "Bikin channel") {
            lembar(
                "Bikin channel baru?",
                "Bot bikinin channel WhatsApp atas nama akun lo, terus langsung dipakai buat posting. " +
                        "Kalau udah punya channel, tempel aja link-nya di kolom Channel WA.",
                null,
                Tombol("Bikin", Gaya.UTAMA) { if (simpan(diam = true)) withService { sendCmd(mapOf("type" to "bikin-channel")) } },
                Tombol("Batal", Gaya.LEMBUT)
            )
        }
        pasang(R.id.btnCekChannel, "Cek channel") {
            if (!simpan(diam = true)) return@pasang
            withService { sendCmd(mapOf("type" to "cek-channel")) }
            banner("Nyari channel-nya… hasilnya di Log (dashboard).")
        }
        pasang(R.id.btnCekGrup, "Cek grup") {
            if (!simpan(diam = true)) return@pasang
            withService { sendCmd(mapOf("type" to "cek-grup")) }
            banner("Ngecek grup… hasilnya di Log (dashboard).")
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
        pasang(R.id.btnUploadScript, "Upload script") { peringatanScript() }
        pasang(R.id.btnContohScript, "Contoh script") { tampilkanContoh() }
        pasang(R.id.btnBatre, "Izin batre") { mintaIzinBatre() }
        pasang(R.id.btnAutostart, "Autostart") { bukaAutostart() }
        pasang(R.id.btnBukaLog, "Buka folder log") { bukaFolderLog() }
        pasang(R.id.btnKirimLog, "Kirim log") { kirimSemuaLog { banner(it) } }
        pasang(R.id.btnTentang, "Tentang") { startActivity(Intent(this, AboutActivity::class.java)) }
        pasang(R.id.btnSambutan, "Panduan awal") { startActivity(Intent(this, WelcomeActivity::class.java)) }
    }

    private fun gulirKe(bagian: String) {
        val id = when (bagian) {
            "channel" -> R.id.etChannel
            "grup" -> R.id.rowGrupAktif
            "script" -> R.id.wadahScript
            else -> return
        }
        val sv = findViewById<ScrollView>(R.id.svUtama)
        val target = findViewById<View>(id)
        sv.post {
            // posisi relatif ke isi ScrollView (kartu bisa bersarang)
            var y = 0
            var v: View? = target
            while (v != null && v.parent !== sv) {
                y += v.top
                v = v.parent as? View
            }
            sv.smoothScrollTo(0, (y - dp(80)).coerceAtLeast(0))
        }
    }

    private fun muat() {
        etRepo.setText(settings.repo)
        etToken.setText(settings.token)
        etInterval.setText(settings.intervalMinutes.toString())
        etChannel.setText(settings.channel)
        etGrup.setText(settings.grupTarget)
        etGrupInterval.setText(settings.grupInterval.toString())
        etGrupHitam.setText(settings.grupHitam)
        etLinkRules.setText(settings.linkRules)
        etRingkasRules.setText(settings.ringkasRules)
        rowPrerelease.isSelected = settings.includePrereleases
        rowPostFirst.isSelected = settings.postOnFirstRun
        rowFormatTanya.isSelected = settings.formatPertanyaan
        rowTestMsg.isSelected = settings.testMessageOnSetup
        rowGrupAktif.isSelected = settings.grupAktif
        rowPerintah.isSelected = settings.perintahAktif
        rowSamarkan.isSelected = settings.samarkanNomor
        rowBoot.isSelected = settings.autoStartOnBoot
        rowLogcat.isSelected = settings.rekamLogcat
    }

    private fun simpanKeStore() {
        settings.repo = etRepo.text.toString()
        settings.token = etToken.text.toString()
        settings.intervalMinutes = etInterval.text.toString().toIntOrNull() ?: 15
        settings.channel = etChannel.text.toString()
        settings.grupTarget = etGrup.text.toString()
        settings.grupInterval = etGrupInterval.text.toString().toIntOrNull() ?: 5
        settings.grupHitam = etGrupHitam.text.toString()
        settings.linkRules = etLinkRules.text.toString()
        settings.ringkasRules = etRingkasRules.text.toString()
        settings.includePrereleases = rowPrerelease.isSelected
        settings.postOnFirstRun = rowPostFirst.isSelected
        settings.formatPertanyaan = rowFormatTanya.isSelected
        settings.testMessageOnSetup = rowTestMsg.isSelected
        settings.grupAktif = rowGrupAktif.isSelected
        settings.perintahAktif = rowPerintah.isSelected
        settings.samarkanNomor = rowSamarkan.isSelected
        settings.autoStartOnBoot = rowBoot.isSelected

        val logcatLama = settings.rekamLogcat
        settings.rekamLogcat = rowLogcat.isSelected
        if (logcatLama != settings.rekamLogcat) {
            if (settings.rekamLogcat) LogRecorder.mulaiRekamLogcat() else LogRecorder.berhentiRekamLogcat()
        }
    }

    /** @return true kalau setelan valid & udah dikirim ke engine. */
    private fun simpan(diam: Boolean = false): Boolean {
        simpanKeStore()
        if (settings.grupAktif && settings.grupTarget.isBlank()) {
            banner("Penjaga grup dinyalain, tapi link grup-nya masih kosong.")
            gulirKe("grup")
            return false
        }
        if (!settings.hasValidSettings()) {
            banner("Isi repo GitHub, atau nyalain penjaga grup — minimal salah satu.")
            return false
        }
        withService { sendCmd(settings.toConfigureCmd()) }
        if (!diam) {
            banner(
                when {
                    settings.repo.isNotBlank() && settings.channel.isBlank() ->
                        "Disimpan. Channel masih kosong — tempel link channel atau tekan Bikin channel."
                    else -> "✓ Setelan disimpan & diterapin."
                }
            )
        }
        return true
    }

    // ----------------------------------------------------------------- render bus

    private fun render(ui: BotUi) {
        if (isFinishing || isDestroyed) return
        if (ui.scriptBotSeq != scriptSeqTerakhir) renderScript(ui)
        val baru = ui.channelBaru
        if (!baru.isNullOrBlank() && etChannel.text.toString() != baru && settings.channel == baru) {
            etChannel.setText(baru)
        }
    }

    // ----------------------------------------------------------------- script bot

    private fun renderScript(ui: BotUi) {
        scriptSeqTerakhir = ui.scriptBotSeq
        wadahScript.removeAllViews()
        // Kalau engine belum ngirim daftar (service mati), baca dari folder aja.
        val daftar = if (ui.scriptBotSeq > 0) ui.scriptBot else folderScript().listFiles()
            ?.filter { it.isFile && (it.name.endsWith(".js") || it.name.endsWith(".cjs")) }
            ?.sortedBy { it.name }
            ?.map { ScriptBot(it.name, it.name.substringBeforeLast('.'), "", "", emptyList(), null) }
            ?: emptyList()

        fun teks(s: String, warna: Int, ukuran: Float, tebal: Boolean = false) = TextView(this).apply {
            text = s
            setTextColor(ContextCompat.getColor(this@SettingsActivity, warna))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, ukuran)
            if (tebal) setTypeface(typeface, Typeface.BOLD)
        }

        if (daftar.isEmpty()) {
            wadahScript.addView(teks("Belum ada script. Upload file .js, atau liat Contoh dulu.", R.color.wr_teks2, 13f))
            return
        }
        daftar.forEachIndexed { i, s ->
            val baris = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setBackgroundResource(R.drawable.bg_ubin)
                setPadding(dp(12), dp(10), dp(10), dp(10))
            }
            val kiri = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
            kiri.addView(teks(s.nama + (if (s.versi.isNotBlank()) "  v${s.versi}" else ""), R.color.wr_teks, 15f, true))
            val ket = when {
                s.error != null -> "⚠️ Gagal dimuat: ${s.error}"
                s.perintah.isNotEmpty() -> s.perintah.joinToString("  ") + (if (s.deskripsi.isNotBlank()) "\n${s.deskripsi}" else "")
                s.deskripsi.isNotBlank() -> s.deskripsi
                else -> s.file
            }
            kiri.addView(teks(ket, if (s.error != null) R.color.wr_merah else R.color.wr_teks2, 12f))
            baris.addView(kiri, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            val hapus = TextView(this, null, 0, R.style.TombolLembut).apply {
                text = "Hapus"
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
                setPadding(dp(12), 0, dp(12), 0)
                setOnClickListener { hapusScript(s) }
            }
            baris.addView(hapus, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(40)))
            val lp = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
            if (i > 0) lp.topMargin = dp(8)
            wadahScript.addView(baris, lp)
        }
    }

    private fun folderScript(): File = BotService.folderScript(this)

    private fun peringatanScript() {
        lembar(
            "⚠️ Script = akses penuh",
            "Script jalan di dalam bot dengan akses PENUH: bisa baca & kirim pesan pakai akun WA lo, " +
                    "baca file bot, dan akses internet. Script jahat bisa nyuri sesi WA lo.\n\n" +
                    "Cuma upload script yang lo tulis sendiri atau lo baca & pahami isinya. " +
                    "Jangan asal pasang kiriman orang.",
            null,
            Tombol("Ngerti, pilih file .js", Gaya.UTAMA) {
                try {
                    pilihScript.launch(arrayOf("application/javascript", "text/javascript", "text/plain", "application/octet-stream", "*/*"))
                } catch (e: Throwable) {
                    banner("Pemilih file nggak kebuka: ${e.message}")
                }
            },
            Tombol("Batal", Gaya.LEMBUT)
        )
    }

    private fun namaFile(uri: Uri): String? = try {
        contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
            if (c.moveToFirst()) c.getString(0) else null
        }
    } catch (_: Throwable) {
        null
    }

    private fun pasangScript(uri: Uri) {
        val asli = namaFile(uri) ?: "script.js"
        if (!asli.endsWith(".js", true) && !asli.endsWith(".cjs", true)) {
            banner("File-nya harus .js (sekarang: $asli).")
            return
        }
        // nama file dirapikan: huruf, angka, - _ . aja
        val nama = asli.replace(Regex("[^A-Za-z0-9._-]"), "_").take(60)
        try {
            val isi = contentResolver.openInputStream(uri)?.use { ins ->
                val buf = ins.readBytes()
                if (buf.size > MAKS_SCRIPT) {
                    banner("Script kegedean (${buf.size / 1024} KB, maks 512 KB).")
                    return
                }
                buf
            } ?: run {
                banner("File-nya nggak bisa dibaca.")
                return
            }
            val tujuan = File(folderScript(), nama)
            val ganti = tujuan.exists()
            tujuan.writeBytes(isi)
            LogRecorder.tulis("Script", "dipasang: $nama (${isi.size} byte)${if (ganti) " — gantiin yang lama" else ""}")
            banner(if (ganti) "Script $nama diganti. Lagi dimuat ulang…" else "Script $nama dipasang. Lagi dimuat…")
            withService { sendCmd(mapOf("type" to "plugin-muat")) }
        } catch (e: Throwable) {
            LogRecorder.galat("Script", "gagal masang $nama", e)
            banner("Gagal masang script: ${e.message}")
        }
    }

    private fun hapusScript(s: ScriptBot) {
        lembar(
            "Hapus ${s.nama}?",
            "File ${s.file} dihapus dari bot. Perintahnya langsung nggak jalan lagi.",
            null,
            Tombol("Hapus", Gaya.BAHAYA) {
                val f = File(folderScript(), s.file)
                if (f.exists() && f.delete()) {
                    LogRecorder.tulis("Script", "dihapus: ${s.file}")
                    banner("${s.nama} dihapus.")
                } else {
                    banner("File-nya udah nggak ada.")
                }
                if (BotService.instance != null) sendCmd(mapOf("type" to "plugin-muat")) else renderScript(BotBus.ui)
            },
            Tombol("Batal", Gaya.LEMBUT)
        )
    }

    private fun tampilkanContoh() {
        val kode = TextView(this).apply {
            text = CONTOH_SCRIPT
            typeface = Typeface.MONOSPACE
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
            setTextColor(0xFFB8C4CA.toInt())
            setBackgroundResource(R.drawable.bg_log)
            setPadding(dp(12), dp(12), dp(12), dp(12))
            setTextIsSelectable(true)
        }
        lembar(
            "Contoh script",
            "Salin, simpan jadi file sapa.js (pakai editor teks apa aja), terus Upload. " +
                    "Isi ctx: balas(), kirim(jid, teks), pengirim{nama,nomor}, argumen, sisa, adalahAdmin, grup, simpan(), ambil(), log(). " +
                    "Panduan lengkap: docs/PLUGIN.md di repo.",
            kode,
            Tombol("Salin kode", Gaya.UTAMA, tutup = false) {
                salin(CONTOH_SCRIPT)
                banner("Contoh script disalin.")
            },
            Tombol("Tutup", Gaya.LEMBUT)
        )
    }

    // ----------------------------------------------------------------- batre & autostart

    private fun bebasBatre(): Boolean = try {
        getSystemService(PowerManager::class.java)?.isIgnoringBatteryOptimizations(packageName) == true
    } catch (_: Throwable) {
        false
    }

    private fun renderBatre() {
        tvBatreStat.text = if (bebasBatre()) {
            "✓ Pengoptimalan batre: dikecualikan. Android nggak bakal nidurin bot ini."
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
}
