package com.xykals.warelease

import android.app.Activity
import android.graphics.drawable.GradientDrawable
import android.view.View
import android.widget.ScrollView
import android.widget.TextView
import androidx.core.content.ContextCompat
import com.xykals.warelease.util.Durasi

/** Aksi Mulai / Jeda / Matikan yang lagi ditunggu hasilnya (tombolnya nunjukin teks ini). */
internal enum class Aksi(val teksRes: Int) {
    NYALA(R.string.k_menyalakan), JEDA(R.string.k_menjeda), MATI(R.string.k_mematikan)
}

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
    private lateinit var tvModerasiStat: TextView
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
        tvModerasiStat = a.findViewById(R.id.tvModerasiStat)
        tvLog = a.findViewById(R.id.tvLog)
        svLog = a.findViewById(R.id.svLog)
        btnMulai = a.findViewById(R.id.btnMulai)
        btnKill = a.findViewById(R.id.btnKill)
    }

    fun render(ui: BotUi, tunggu: Aksi?) {
        val (teksPill, warnaPill) = when {
            tunggu != null -> a.getString(tunggu.teksRes).uppercase() to R.color.wr_kuning
            ui.busy -> a.getString(R.string.k_cek) to R.color.wr_hijau
            ui.engineRunning -> a.getString(R.string.k_jalan) to R.color.wr_hijau
            ui.serviceRunning -> a.getString(R.string.k_jeda) to R.color.wr_kuning
            else -> a.getString(R.string.u_mati) to R.color.wr_merah
        }
        tvPill.text = teksPill
        tvPill.setTextColor(ContextCompat.getColor(a, warnaPill))
        tvPill.background = GradientDrawable().apply {
            cornerRadius = a.dp(50).toFloat()
            setColor(ContextCompat.getColor(a, warnaPill) and 0x00FFFFFF or 0x26000000)
        }

        tvUbinWa.text = when {
            ui.waConnected -> a.getString(R.string.k_tersambung)
            ui.waLinked -> a.getString(R.string.k_tertaut)
            else -> a.getString(R.string.k_belum_ditautkan)
        }
        tvUbinEngine.text = when {
            ui.busy -> a.getString(R.string.k_lagi_cek)
            ui.engineRunning -> a.getString(R.string.k_jalan_2)
            ui.serviceRunning -> a.getString(R.string.k_jeda_2)
            else -> a.getString(R.string.k_mati)
        }
        tvUbinRilis.text = when {
            ui.repo == null -> "—"
            ui.lastTag == null -> a.getString(R.string.k_belum_ada)
            else -> a.getString(R.string.k_post, ui.lastTag, ui.postCount)
        }
        tvUbinGrup.text = if (ui.grupAktif) (ui.grupNama ?: a.getString(R.string.k_nyala)) else a.getString(R.string.k_mati)

        val sekarang = System.currentTimeMillis()
        tvNext.text = listOfNotNull(
            ui.nextCheckAt?.let { a.getString(R.string.k_cek_rilis_lagi, Durasi.human(it - sekarang)) },
            ui.nextGrupAt?.let { a.getString(R.string.k_cek_grup_lagi, Durasi.human(it - sekarang)) },
            ui.nextLaguAt?.let { a.getString(R.string.k_lagu_lagi, Durasi.human(it - sekarang)) }
        ).joinToString("  ·  ")
        tvNext.visibility = if (tvNext.text.isNullOrEmpty()) View.GONE else View.VISIBLE

        tvLaguStat.text = when {
            !ui.laguAktif -> a.getString(R.string.k_mati_nyalain_saklarnya_terus_simpan)
            else -> listOfNotNull(
                ui.nextLaguAt?.let { a.getString(R.string.k_lagu_berikutnya_kira_kira_lagi, Durasi.human(it - sekarang)) }
                    ?: a.getString(R.string.k_nunggu_bot_jalan),
                a.getString(R.string.k_lagu_udah_dikirim, ui.laguCount),
                ui.laguJudul?.let { a.getString(R.string.k_terakhir, it) },
                ui.laguJatah?.let { a.getString(R.string.k_jatah_hari_ini_dari_server, it) }
            ).joinToString("\n")
        }
        val h = ui.hosting
        // h.status adalah nilai protokol dari engine (jangan diterjemahkan);
        // yang tampil ke user diambil dari resource.
        val statusProject = when (h.status) {
            "jalan" -> a.getString(R.string.k_hosting_jalan)
            "install" -> a.getString(R.string.k_hosting_install)
            "error" -> a.getString(R.string.k_hosting_error)
            "mati" -> a.getString(R.string.k_hosting_mati)
            else -> a.getString(R.string.k_hosting_siap)
        }
        val namaProject = h.nama ?: h.file ?: a.getString(R.string.k_project)
        tvHostingStat.text = if (!h.ada) a.getString(R.string.k_belum_ada_project) else "$namaProject — $statusProject"

        btnMulai.text = when {
            tunggu == Aksi.NYALA || tunggu == Aksi.JEDA -> tunggu?.let { a.getString(it.teksRes) } ?: ""
            !ui.serviceRunning -> a.getString(R.string.k_nyalakan)
            ui.engineRunning -> a.getString(R.string.k_jeda_2)
            else -> a.getString(R.string.u_mulai)
        }
        btnMulai.setCompoundDrawablesRelativeWithIntrinsicBounds(
            if (ui.engineRunning) R.drawable.ic_jeda else R.drawable.ic_play, 0, 0, 0
        )
        val mulaiAktif = tunggu == null
        btnMulai.isEnabled = mulaiAktif
        btnMulai.alpha = if (mulaiAktif) 1f else 0.55f

        btnKill.text = when {
            tunggu == Aksi.MATI -> tunggu?.let { a.getString(it.teksRes) } ?: ""
            !ui.serviceRunning -> a.getString(R.string.k_service_udah_mati)
            else -> a.getString(R.string.u_matikan_service)
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
            a.getString(R.string.k_udah_beres_nggak_perlu_diapa)
        } else {
            a.getString(R.string.u_cukup_sekali_paling_gampang_pakai)
        }
        val nomorTampil = settings.phone.trim().ifBlank { null }

        tvWaStatus.text = when {
            ui.setupState == "starting" && ui.setupTahap != null -> ui.setupTahap!!
            ui.waLinked -> {
                val nomorKet = nomorTampil?.let { " ($it)" } ?: ""
                a.getString(R.string.k_whatsapp_tertaut_bot_siap_kerja_2, nomorKet)
            }
            ui.setupState == "starting" -> a.getString(R.string.k_lagi_nautin)
            else -> a.getString(R.string.k_belum_tertaut)
        }
        tvWaStatus.setTextColor(
            ContextCompat.getColor(a, if (ui.waLinked) R.color.wr_hijau else R.color.wr_teks2)
        )

        tvGrupStat.text = if (!ui.grupAktif) {
            a.getString(R.string.k_penjaga_grup_mati)
        } else {
            val last = ui.grupLastCekAt?.let { a.getString(R.string.k_lalu, Durasi.human(sekarang - it)) } ?: a.getString(R.string.k_belum_pernah)
            val namaGrup = ui.grupNama ?: a.getString(R.string.k_belum_dicek)
            a.getString(R.string.k_grup_di_approve_ditolak_daftar, namaGrup, ui.grupDisetujui, ui.grupDitolak, ui.grupHitam, last)
        }

        tvModerasiStat.text = buildString {
            append(
                if (ui.moderasiAktif) a.getString(R.string.k_moderasi_nyala)
                else a.getString(R.string.k_moderasi_mati)
            )
            append(" | ")
            append(
                a.getString(
                    R.string.k_perintah_pribadi_2,
                    a.getString(if (ui.jagaAktif) R.string.k_nyala else R.string.k_mati)
                )
            )
            append("\n")
            append(a.getString(R.string.k_dihapus_diperingatkan_dikeluarkan_2, ui.moderasiHapus, ui.moderasiPeringatan, ui.moderasiKick))
            append("\n")
            append(a.getString(R.string.k_stiker_story_perintah_2, ui.stikerDibuat, ui.storyDikirim, ui.perintahJalan))
            ui.perangkat?.let {
                append("\n")
                append(a.getString(R.string.k_perangkat_2, it))
            }
        }

        val err = ui.engineError
        tvError.visibility = if (err != null) View.VISIBLE else View.GONE
        if (err != null) tvError.text = err

        if (ui.log.isNotEmpty()) {
            val diBawah = !svLog.canScrollVertically(1)
            tvLog.text = ui.log.takeLast(60).joinToString("\n")
            // Log punya tab sendiri (NavBawah.kt). Kalau tab-nya lagi nggak
            // kelihatan, jangan digulir: nggak ada yang lihat, dan posisinya
            // jadi nggak karuan pas dibuka.
            if (svLog.isShown) svLog.ikutKeBawah(diBawah)
        }
    }

    /** Dipanggil pas tab Log dibuka (NavBawah.kt): taruh di baris paling baru. */
    fun lompatKeBawah() {
        svLog.ikutKeBawah(true)
    }
}
