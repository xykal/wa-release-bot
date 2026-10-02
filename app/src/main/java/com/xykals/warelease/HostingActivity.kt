package com.xykals.warelease

import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.view.Gravity
import android.view.View
import android.view.inputmethod.EditorInfo
import android.widget.EditText
import android.widget.FrameLayout
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
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import org.json.JSONObject
import java.util.zip.ZipInputStream

/**
 * Hosting bot custom: upload ZIP project → (pasang modul) → jalankan.
 * Bot-nya jalan di worker thread di dalam engine Node (lihat bot-js/src/hosting.mjs).
 */
class HostingActivity : AppCompatActivity() {

    private val handler = Handler(Looper.getMainLooper())
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    private lateinit var tvStatus: TextView
    private lateinit var tvNama: TextView
    private lateinit var tvPesan: TextView
    private lateinit var tvKonsol: TextView
    private lateinit var svKonsol: ScrollView
    private lateinit var etInput: EditText
    private lateinit var btnJalan: TextView
    private lateinit var btnPasang: TextView
    private lateinit var btnUpload: TextView
    private lateinit var rowAuto: LinearLayout
    private lateinit var ivAuto: ImageView
    private lateinit var tvBanner: TextView

    private var logSeqTerakhir = -1
    private var statusTerakhir: HostingUi? = null
    private var lagiUpload = false

    private val dirProyek by lazy { File(filesDir, "wa_release_bot/hosting/proyek") }

    private val pilihZip = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) pasangZip(uri)
    }

    private val busListener: (BotUi) -> Unit = { ui -> handler.post { render(ui) } }

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()
    private fun warna(id: Int) = ContextCompat.getColor(this, id)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        LogRecorder.init(this)
        LogRecorder.tulis("Activity", "Hosting dibuka")
        setContentView(bangunLayar())
        Denyut.pasangSemua(window.decorView)
    }

    override fun onResume() {
        super.onResume()
        BotBus.subscribe(busListener)
        BotService.instance?.setUiTerlihat(true)
        pastikanService { kirim(mapOf("type" to "hosting-status")) }
    }

    override fun onPause() {
        BotBus.unsubscribe(busListener)
        BotService.instance?.setUiTerlihat(false)
        super.onPause()
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }

    // ------------------------------------------------------------ layar

    private fun tombol(teks: String, gaya: Int, ikon: Int, aksi: () -> Unit) =
        TextView(this, null, 0, gaya).apply {
            text = teks
            setCompoundDrawablesRelativeWithIntrinsicBounds(ikon, 0, 0, 0)
            setOnClickListener {
                LogRecorder.tulis("Tombol", "hosting: $teks")
                try { aksi() } catch (e: Throwable) {
                    LogRecorder.galat("Tombol", "hosting \"$teks\" gagal", e)
                    banner(getString(R.string.k_gagal_2, e.message))
                }
            }
        }

    private fun kartu() = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        background = ContextCompat.getDrawable(this@HostingActivity, R.drawable.bg_kartu)
        setPadding(dp(18), dp(16), dp(18), dp(16))
    }

    private fun baris(vararg v: View) = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        v.forEachIndexed { i, x ->
            addView(x, LinearLayout.LayoutParams(0, dp(50), 1f).apply { if (i > 0) marginStart = dp(10) })
        }
    }

    private fun bangunLayar(): View {
        val akar = FrameLayout(this).apply { setBackgroundColor(warna(R.color.wr_latar)) }

        // elemen melayang tipis di pojok atas — pemanis
        val hiasan = Melayang(this).apply {
            isi(
                listOf(
                    Melayang.Elemen(R.drawable.melayang_kode, 0.86f, 0.05f, 46, 0.7f),
                    Melayang.Elemen(R.drawable.melayang_bintang, 0.68f, 0.03f, 22, 0.4f),
                )
            )
            mulai()
        }
        akar.addView(hiasan, FrameLayout.LayoutParams(-1, -1))

        val kolom = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(14), dp(16), dp(14))
        }

        // header
        val header = LinearLayout(this).apply { gravity = Gravity.CENTER_VERTICAL }
        val kembali = ImageView(this).apply {
            setImageResource(R.drawable.ic_tutup)
            setColorFilter(warna(R.color.wr_teks))
            setPadding(dp(8), dp(8), dp(8), dp(8))
            isClickable = true
            setOnClickListener { finish() }
        }
        header.addView(kembali, LinearLayout.LayoutParams(dp(40), dp(40)))
        val judulKol = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(8), 0, 0, 0) }
        judulKol.addView(TextView(this).apply {
            text = getString(R.string.k_hosting_bot)
            setTextColor(warna(R.color.wr_teks)); textSize = 21f
            typeface = Typeface.DEFAULT_BOLD
        })
        judulKol.addView(TextView(this).apply {
            text = getString(R.string.k_jalanin_project_bot_node_js)
            setTextColor(warna(R.color.wr_teks2)); textSize = 12f
        })
        header.addView(judulKol, LinearLayout.LayoutParams(0, -2, 1f))
        kolom.addView(header)

        // kartu status
        val kStatus = kartu()
        val barisAtas = LinearLayout(this).apply { gravity = Gravity.CENTER_VERTICAL }
        tvNama = TextView(this).apply {
            setTextColor(warna(R.color.wr_teks)); textSize = 16f; typeface = Typeface.DEFAULT_BOLD
            maxLines = 1
        }
        barisAtas.addView(tvNama, LinearLayout.LayoutParams(0, -2, 1f))
        tvStatus = TextView(this).apply {
            textSize = 11f; typeface = Typeface.DEFAULT_BOLD; letterSpacing = 0.08f
            setPadding(dp(10), dp(4), dp(10), dp(4))
        }
        barisAtas.addView(tvStatus)
        kStatus.addView(barisAtas)
        tvPesan = TextView(this).apply {
            setTextColor(warna(R.color.wr_teks2)); textSize = 13f
            setPadding(0, dp(6), 0, 0)
        }
        kStatus.addView(tvPesan)

        btnUpload = tombol(getString(R.string.k_upload_zip_project), R.style.TombolUtama, R.drawable.ic_folder) {
            if (lagiUpload) return@tombol
            pilihZip.launch(arrayOf("application/zip", "application/x-zip-compressed", "application/octet-stream"))
        }
        kStatus.addView(btnUpload, LinearLayout.LayoutParams(-1, dp(52)).apply { topMargin = dp(14) })

        btnJalan = tombol(getString(R.string.k_jalankan), R.style.TombolGaris, R.drawable.ic_play) {
            val h = statusTerakhir
            when {
                h?.status == "jalan" || h?.status == "install" -> kirim(mapOf("type" to "hosting-stop"))
                h != null && !h.setuju -> DialogPersetujuanHosting.tampilkan(this, h.sha256) {
                    kirim(mapOf("type" to "hosting-setuju", "sha256" to (h.sha256 ?: "lama")))
                    kirim(mapOf("type" to "hosting-mulai"))
                }
                else -> kirim(mapOf("type" to "hosting-mulai"))
            }
        }
        btnPasang = tombol(getString(R.string.k_pasang_modul), R.style.TombolLembut, R.drawable.ic_tambah) {
            kirim(mapOf("type" to "hosting-pasang"))
            banner(getString(R.string.k_pasang_modul_dari_npm_progresnya))
        }
        kStatus.addView(baris(btnJalan, btnPasang), LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(10) })

        val btnRestart = tombol(getString(R.string.k_restart), R.style.TombolLembut, R.drawable.ic_power) {
            kirim(mapOf("type" to "hosting-restart"))
        }
        val btnHapus = tombol(getString(R.string.k_hapus_project), R.style.TombolBahaya, R.drawable.ic_hapus) {
            konfirmasiHapus()
        }
        kStatus.addView(baris(btnRestart, btnHapus), LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(10) })

        // saklar restart otomatis
        rowAuto = LinearLayout(this).apply {
            gravity = Gravity.CENTER_VERTICAL
            isClickable = true
            setPadding(0, dp(12), 0, 0)
            setOnClickListener {
                val baru = !(statusTerakhir?.autoRestart ?: true)
                kirim(mapOf("type" to "hosting-atur", "autoRestart" to baru))
            }
        }
        rowAuto.addView(TextView(this).apply {
            text = getString(R.string.k_restart_otomatis_kalau_crash)
            setTextColor(warna(R.color.wr_teks)); textSize = 14f
        }, LinearLayout.LayoutParams(0, -2, 1f))
        ivAuto = ImageView(this).apply { setImageResource(R.drawable.sel_saklar); isDuplicateParentStateEnabled = true }
        rowAuto.addView(ivAuto, LinearLayout.LayoutParams(dp(46), dp(28)))
        kStatus.addView(rowAuto)
        kolom.addView(kStatus, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(12) })

        // konsol
        val kKonsol = kartu().apply { setPadding(dp(12), dp(12), dp(12), dp(12)) }
        kKonsol.addView(TextView(this).apply {
            text = getString(R.string.k_konsol)
            setTextColor(warna(R.color.wr_teks2)); textSize = 11f; letterSpacing = 0.1f
            typeface = Typeface.DEFAULT_BOLD
        })
        svKonsol = ScrollView(this).apply {
            background = ContextCompat.getDrawable(this@HostingActivity, R.drawable.bg_log)
            setPadding(dp(10), dp(8), dp(10), dp(8))
        }
        tvKonsol = TextView(this).apply {
            typeface = Typeface.MONOSPACE
            textSize = 11.5f
            setTextColor(warna(R.color.wr_teks))
            setTextIsSelectable(true)
            text = getString(R.string.k_belum_ada_output)
        }
        svKonsol.addView(tvKonsol)
        kKonsol.addView(svKonsol, LinearLayout.LayoutParams(-1, 0, 1f).apply { topMargin = dp(8) })

        val barisInput = LinearLayout(this).apply { gravity = Gravity.CENTER_VERTICAL }
        etInput = isianBaru().apply {
            hint = getString(R.string.k_ketik_input_buat_bot_mis)
            imeOptions = EditorInfo.IME_ACTION_SEND
            setOnEditorActionListener { _, id, _ ->
                if (id == EditorInfo.IME_ACTION_SEND) { kirimInput(); true } else false
            }
        }
        barisInput.addView(etInput, LinearLayout.LayoutParams(0, -2, 1f))
        val btnKirim = tombol("", R.style.TombolUtama, R.drawable.ic_kirim) { kirimInput() }
        btnKirim.setPadding(dp(14), 0, dp(10), 0)
        barisInput.addView(btnKirim, LinearLayout.LayoutParams(dp(56), dp(50)).apply { marginStart = dp(8) })
        kKonsol.addView(barisInput, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(8) })
        kolom.addView(kKonsol, LinearLayout.LayoutParams(-1, 0, 1f).apply { topMargin = dp(12) })

        kolom.addView(TextView(this).apply {
            text = getString(R.string.k_zip_berisi_package_json_file)
            setTextColor(warna(R.color.wr_teks2)); textSize = 11.5f
            setPadding(dp(4), dp(10), dp(4), 0)
        })

        akar.addView(kolom, FrameLayout.LayoutParams(-1, -1))

        tvBanner = TextView(this).apply {
            background = ContextCompat.getDrawable(this@HostingActivity, R.drawable.bg_banner)
            setTextColor(warna(R.color.wr_teks)); textSize = 14f
            setPadding(dp(14), dp(14), dp(14), dp(14))
            elevation = dp(8).toFloat()
            visibility = View.GONE
        }
        akar.addView(tvBanner, FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM).apply {
            setMargins(dp(16), 0, dp(16), dp(24))
        })

        Denyut.munculBerurutan(kolom)
        return akar
    }

    // ------------------------------------------------------------ render

    private fun render(ui: BotUi) {
        if (isFinishing || isDestroyed) return
        val h = ui.hosting
        val lama = statusTerakhir
        statusTerakhir = h

        tvNama.text = when {
            !h.ada -> getString(R.string.k_belum_ada_project_2)
            h.nama != null -> h.nama + (h.versi?.let { " v$it" } ?: "")
            else -> h.file ?: getString(R.string.k_project)
        }
        val (label, w) = when (h.status) {
            "jalan" -> getString(R.string.k_jalan) to R.color.wr_hijau
            "install" -> getString(R.string.k_pasang) to R.color.wr_kuning
            "error" -> getString(R.string.k_error) to R.color.wr_merah
            "mati" -> getString(R.string.u_mati) to R.color.wr_merah
            "siap" -> getString(R.string.k_siap) to R.color.wr_teks2
            else -> getString(R.string.k_kosong) to R.color.wr_teks2
        }
        tvStatus.text = label
        tvStatus.setTextColor(warna(w))
        tvStatus.background = GradientDrawable().apply {
            cornerRadius = dp(50).toFloat()
            setColor(warna(w) and 0x00FFFFFF or 0x26000000)
        }
        val uptime = h.mulaiPada?.let { " · " + getString(R.string.k_hosting_nyala_durasi, Durasi.human(System.currentTimeMillis() - it)) } ?: ""
        tvPesan.text = listOfNotNull(
            h.pesan.ifBlank { null },
            h.node?.let { getString(R.string.k_node, it, uptime) }
        ).joinToString("\n")

        val jalan = h.status == "jalan" || h.status == "install"
        btnJalan.text = if (jalan) getString(R.string.k_stop) else getString(R.string.k_jalankan)
        btnJalan.setCompoundDrawablesRelativeWithIntrinsicBounds(if (jalan) R.drawable.ic_jeda else R.drawable.ic_play, 0, 0, 0)
        btnJalan.isEnabled = h.ada
        btnJalan.alpha = if (h.ada) 1f else 0.5f
        btnPasang.isEnabled = h.ada && !jalan
        btnPasang.alpha = if (btnPasang.isEnabled) 1f else 0.5f
        rowAuto.isSelected = h.autoRestart
        btnUpload.text = when {
            lagiUpload -> getString(R.string.k_membongkar_zip)
            h.ada -> getString(R.string.k_ganti_project_upload_zip)
            else -> getString(R.string.k_upload_zip_project)
        }

        // status berubah jadi "jalan" → denyut di pill biar kerasa hidup
        if (lama != null && lama.status != h.status) Denyut.riak(tvStatus)

        if (ui.hostingLogSeq != logSeqTerakhir) {
            logSeqTerakhir = ui.hostingLogSeq
            tampilkanKonsol(ui.hostingLog)
        }
    }

    private fun tampilkanKonsol(baris: List<BarisKonsol>) {
        if (baris.isEmpty()) { tvKonsol.text = getString(R.string.k_belum_ada_output); return }
        val bawah = !svKonsol.canScrollVertically(1)
        val sb = SpannableStringBuilder()
        for (b in baris.takeLast(300)) {
            val mulai = sb.length
            sb.append(b.teks).append('\n')
            val w = when (b.jenis) {
                "err" -> R.color.wr_merah
                "sys" -> R.color.wr_hijau
                "in" -> R.color.wr_kuning
                else -> 0
            }
            if (w != 0) sb.setSpan(ForegroundColorSpan(warna(w)), mulai, sb.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        }
        tvKonsol.text = sb
        svKonsol.ikutKeBawah(bawah)
    }

    // ------------------------------------------------------------ aksi

    private fun kirimInput() {
        val t = etInput.text.toString()
        if (t.isEmpty()) return
        kirim(mapOf("type" to "hosting-input", "teks" to t))
        etInput.setText("")
    }

    private fun konfirmasiHapus() {
        val d = android.app.Dialog(this, R.style.Lembar)
        val v = layoutInflater.inflate(R.layout.lembar, null)
        v.findViewById<TextView>(R.id.lbJudul).text = getString(R.string.k_hapus_project_2)
        v.findViewById<TextView>(R.id.lbPesan).text =
            getString(R.string.k_bot_di_stop_semua_file)
        v.findViewById<View>(R.id.lbIsi).visibility = View.GONE
        val wadah = v.findViewById<LinearLayout>(R.id.lbTombol)
        val ya = TextView(this, null, 0, R.style.TombolBahaya).apply {
            text = getString(R.string.k_hapus_2)
            setOnClickListener { kirim(mapOf("type" to "hosting-hapus")); d.dismiss() }
        }
        val batal = TextView(this, null, 0, R.style.TombolLembut).apply {
            text = getString(R.string.k_batal)
            setOnClickListener { d.dismiss() }
        }
        wadah.addView(ya, LinearLayout.LayoutParams(-1, dp(50)))
        wadah.addView(batal, LinearLayout.LayoutParams(-1, dp(50)).apply { topMargin = dp(8) })
        Denyut.pasangSemua(v)
        d.setContentView(v)
        d.window?.setLayout((resources.displayMetrics.widthPixels * 0.92).toInt(), -2)
        d.show()
    }

    /**
     * Bongkar ZIP ke folder project. Folder lama nggak langsung dibuang:
     * isi yang NGGAK ada di ZIP baru (sesi WA bot, .env, node_modules) dibawa
     * pindah — jadi update project nggak bikin bot-nya harus ditautin ulang.
     */
    private fun pasangZip(uri: Uri) {
        lagiUpload = true
        render(BotBus.ui)
        banner(getString(R.string.k_membongkar_zip))
        scope.launch {
            val hasil = try {
                if (BotService.instance != null && statusTerakhir?.status == "jalan") {
                    kirim(mapOf("type" to "hosting-stop"))
                    delay(2500)
                }
                withContext(Dispatchers.IO) { bongkar(uri) }
            } catch (e: Throwable) {
                LogRecorder.galat("Hosting", "bongkar ZIP gagal", e)
                getString(R.string.k_gagal_2, e.message)
            }
            lagiUpload = false
            SettingsStore(this@HostingActivity).hostingDipakai = true
            banner(hasil)
            pastikanService { kirim(mapOf("type" to "hosting-cek")) }
            render(BotBus.ui)
        }
    }

    private fun bongkar(uri: Uri): String {
        val induk = dirProyek.parentFile ?: throw IllegalStateException(getString(R.string.k_folder_data_nggak_ada))
        induk.mkdirs()
        val baru = File(induk, "proyek.baru").apply { deleteRecursively(); mkdirs() }
        val akarBaru = baru.canonicalPath + File.separator
        var jumlah = 0
        var total = 0L

        val sidik = contentResolver.openInputStream(uri).use { ins ->
            if (ins == null) throw IllegalStateException(getString(R.string.k_file_zip_nggak_kebaca))
            SidikZip.bacaDenganSidik(ins) { s ->
                ZipInputStream(s.buffered()).use { zip ->
                    while (true) {
                        val e = zip.nextEntry ?: break
                        val n = e.name.replace('\\', '/')
                        if (n.startsWith("__MACOSX/") || n.endsWith(".DS_Store")) continue
                        val target = File(baru, n)
                        // cegah "zip slip" (../../ keluar folder)
                        if (!target.canonicalPath.startsWith(akarBaru)) continue
                        if (e.isDirectory) { target.mkdirs(); continue }
                        target.parentFile?.mkdirs()
                        target.outputStream().use { out ->
                            val buf = ByteArray(64 * 1024)
                            while (true) {
                                val r = zip.read(buf)
                                if (r < 0) break
                                out.write(buf, 0, r)
                                total += r
                                if (total > 700L * 1024 * 1024) throw IllegalStateException(getString(R.string.k_isi_zip_kegedean_700_mb))
                            }
                        }
                        jumlah++
                    }
                }
            }.second
        }
        if (jumlah == 0) throw IllegalStateException(getString(R.string.k_zip_nya_kosong))

        // ZIP yang isinya satu folder (mis. "botku-main/…") → naikin isinya
        var sumber = baru
        val isi = baru.listFiles()?.filter { it.name != "__MACOSX" } ?: emptyList()
        if (!File(baru, "package.json").exists() && isi.size == 1 && isi[0].isDirectory) sumber = isi[0]
        if (!File(sumber, "package.json").exists()) {
            baru.deleteRecursively()
            throw IllegalStateException(getString(R.string.k_package_json_nggak_ketemu_di))
        }

        // Persetujuan lama gugur sebelum isi project diganti: kalau proses mati di
        // tengah jalan, project baru tidak boleh lolos pakai persetujuan project lama.
        File(induk, "persetujuan.json").delete()
        File(induk, "sumber.json").delete()

        // bawa isi lama yang nggak ada di ZIP baru (sesi, .env, node_modules)
        var dibawa = 0
        if (dirProyek.exists()) {
            dirProyek.listFiles()?.forEach { f ->
                val tujuan = File(sumber, f.name)
                if (!tujuan.exists() && f.renameTo(tujuan)) dibawa++
            }
        }
        dirProyek.deleteRecursively()
        if (!sumber.renameTo(dirProyek)) {
            sumber.copyRecursively(dirProyek, overwrite = true)
        }
        baru.deleteRecursively()
        tulisSumber(induk, sidik)
        return getString(R.string.k_project_masuk_file, jumlah) + (if (dibawa > 0) getString(R.string.k_file_folder_lama_dipertahankan, dibawa) else "") + "."
    }

    /** Ditulis atomik (tmp lalu rename) supaya mesin tidak pernah membaca sumber.json setengah jadi. */
    private fun tulisSumber(induk: File, sidik: String) {
        val tmp = File(induk, "sumber.json.tmp")
        tmp.writeText(JSONObject().put("sha256", sidik).put("waktu", System.currentTimeMillis()).toString())
        if (!tmp.renameTo(File(induk, "sumber.json"))) throw IllegalStateException(getString(R.string.k_hosting_sumber_gagal))
    }

    private fun kirim(cmd: Map<String, Any>) {
        pastikanService { BotService.instance?.sendCmd(cmd) }
    }

    /** Nyalain service kalau belum, tunggu sampai siap, baru jalanin [aksi]. */
    private fun pastikanService(coba: Int = 0, aksi: () -> Unit) {
        val s = BotService.instance
        if (s != null) { aksi(); return }
        if (coba == 0) BotService.start(this)
        if (coba > 30) { banner(getString(R.string.k_service_belum_nyala_coba_lagi)); return }
        handler.postDelayed({ pastikanService(coba + 1, aksi) }, 250)
    }

    private val sembunyikan = Runnable {
        tvBanner.animate().alpha(0f).setDuration(200).withEndAction { tvBanner.visibility = View.GONE }.start()
    }

    private fun banner(pesan: String) {
        handler.removeCallbacks(sembunyikan)
        tvBanner.text = pesan
        if (tvBanner.visibility != View.VISIBLE) {
            tvBanner.alpha = 0f
            tvBanner.translationY = dp(12).toFloat()
            tvBanner.visibility = View.VISIBLE
        }
        tvBanner.animate().alpha(1f).translationY(0f).setDuration(180).start()
        handler.postDelayed(sembunyikan, 3800)
    }
}
