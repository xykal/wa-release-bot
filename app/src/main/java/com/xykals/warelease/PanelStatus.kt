package com.xykals.warelease

import android.app.Activity
import android.graphics.drawable.GradientDrawable
import android.view.View
import android.widget.ScrollView
import android.widget.TextView
import androidx.core.content.ContextCompat
import com.xykals.warelease.util.Durasi

/** Aksi Mulai / Jeda / Matikan yang lagi ditunggu hasilnya (tombolnya nunjukin teks ini). */
internal enum class Aksi(val teks: String) { NYALA("Menyalakan…"), JEDA("Menjeda…"), MATI("Mematikan…") }

/**
 * Bagian layar utama yang murni menggambar status engine: pil status, ubin,
 * jadwal berikutnya, kartu Tautkan WA, statistik grup/lagu/hosting, log.
 * Tidak menyimpan keadaan dan tidak mengirim perintah; MainActivity yang
 * memutuskan reaksi (banner, dialog) lalu memanggil render().
 */
internal class PanelStatus(
    private val a: Activity,
    private val settings: SettingsStore,
    private val form: FormPengaturan
) {
    private lateinit var tvPill: TextView
    private lateinit var tvUbinWa: TextView
    private lateinit var tvUbinEngine: TextView
    private lateinit var tvUbinRilis: TextView
    private lateinit var tvUbinGrup: TextView
    private lateinit var tvNext: TextView
    private lateinit var tvError: TextView
    private lateinit var tvWaStatus: TextView
    private lateinit var tvGrupStat: TextView
    private lateinit var tvLaguStat: TextView
    private lateinit var tvHostingStat: TextView
    private lateinit var tvLog: TextView
    private lateinit var svLog: ScrollView
    private lateinit var btnMulai: TextView
    private lateinit var btnKill: TextView

    fun ikat() {
        tvPill = a.findViewById(R.id.tvPill)
        tvUbinWa = a.findViewById(R.id.tvUbinWa)
        tvUbinEngine = a.findViewById(R.id.tvUbinEngine)
        tvUbinRilis = a.findViewById(R.id.tvUbinRilis)
        tvUbinGrup = a.findViewById(R.id.tvUbinGrup)
        tvNext = a.findViewById(R.id.tvNext)
        tvError = a.findViewById(R.id.tvError)
        tvWaStatus = a.findViewById(R.id.tvWaStatus)
        tvGrupStat = a.findViewById(R.id.tvGrupStat)
        tvLaguStat = a.findViewById(R.id.tvLaguStat)
        tvHostingStat = a.findViewById(R.id.tvHostingStat)
        tvLog = a.findViewById(R.id.tvLog)
        svLog = a.findViewById(R.id.svLog)
        btnMulai = a.findViewById(R.id.btnMulai)
        btnKill = a.findViewById(R.id.btnKill)
    }

    fun render(ui: BotUi, tunggu: Aksi?) {
        val (teksPill, warnaPill) = when {
            tunggu != null -> tunggu.teks.uppercase() to R.color.wr_kuning
            ui.busy -> "CEK…" to R.color.wr_hijau
            ui.engineRunning -> "JALAN" to R.color.wr_hijau
            ui.serviceRunning -> "JEDA" to R.color.wr_kuning
            else -> "MATI" to R.color.wr_merah
        }
        tvPill.text = teksPill
        tvPill.setTextColor(ContextCompat.getColor(a, warnaPill))
        tvPill.background = GradientDrawable().apply {
            cornerRadius = a.dp(50).toFloat()
            setColor(ContextCompat.getColor(a, warnaPill) and 0x00FFFFFF or 0x26000000)
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
        tvNext.visibility = if (tvNext.text.isNullOrEmpty()) View.GONE else View.VISIBLE

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
        a.findViewById<View>(R.id.tvLabelPhone).visibility = tampilTaut
        form.etPhone.visibility = tampilTaut
        a.findViewById<View>(R.id.btnPairing).visibility = tampilTaut
        a.findViewById<View>(R.id.btnQr).visibility = tampilTaut
        a.findViewById<View>(R.id.btnLepas).visibility = if (tertaut) View.VISIBLE else View.GONE
        a.findViewById<TextView>(R.id.tvKetTaut).text = if (tertaut) {
            "Udah beres, nggak perlu diapa-apain lagi. Mau ganti nomor? Lepas dulu, baru tautin lagi."
        } else {
            KET_TAUT_BELUM
        }
        val nomorTampil = settings.phone.trim().ifBlank { null }

        tvWaStatus.text = when {
            ui.setupState == "starting" && ui.setupTahap != null -> ui.setupTahap!!
            ui.waLinked -> "✓ WhatsApp tertaut" + (nomorTampil?.let { " ($it)" } ?: "") + " — bot siap kerja."
            ui.setupState == "starting" -> "Lagi nautin…"
            else -> "Belum tertaut."
        }
        tvWaStatus.setTextColor(
            ContextCompat.getColor(a, if (ui.waLinked) R.color.wr_hijau else R.color.wr_teks2)
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
    }

    private companion object {
        const val KET_TAUT_BELUM = "Cukup sekali. Paling gampang pakai kode: isi nomor WA lo, nanti muncul 8 huruf yang diketik di WhatsApp — nggak perlu HP kedua buat scan QR."
    }
}
