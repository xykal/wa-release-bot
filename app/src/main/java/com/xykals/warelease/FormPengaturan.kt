package com.xykals.warelease

import android.app.Activity
import android.view.View
import android.widget.EditText
import android.widget.TextView
import com.xykals.warelease.util.RepoDaftar

/**
 * Formulir setelan di layar utama: memetakan kolom dan saklar ke SettingsStore
 * dua arah (muat() dari prefs ke view, ambil() dari view ke prefs). Dipisah
 * dari MainActivity supaya daftar kolom cuma ada di satu tempat; tombol dan
 * status tetap urusan MainActivity.
 */
internal class FormPengaturan(
    private val a: Activity,
    private val settings: SettingsStore
) {
    lateinit var etPhone: EditText
        private set
    lateinit var etChannel: EditText
        private set
    lateinit var etGrup: EditText
        private set
    private lateinit var tvRepoRingkas: TextView
    private lateinit var etToken: EditText
    private lateinit var etInterval: EditText
    private lateinit var etGrupInterval: EditText
    private lateinit var etGrupHitam: EditText
    private lateinit var etLaguPerHari: EditText
    private lateinit var etLaguJamMulai: EditText
    private lateinit var etLaguJamSelesai: EditText

    // saklar = baris yang di-`isSelected` (nggak pakai Switch Material)
    private lateinit var rowPrerelease: View
    private lateinit var rowPostFirst: View
    private lateinit var rowTestMsg: View
    private lateinit var rowFormatTanya: View
    private lateinit var rowGrupAktif: View
    private lateinit var rowBoot: View
    private lateinit var rowLogcat: View
    private lateinit var rowLaguAktif: View

    private fun saklar(id: Int): View {
        val v = a.findViewById<View>(id)
        v.setOnClickListener { v.isSelected = !v.isSelected }
        return v
    }

    /** Cari semua view; dipanggil sekali setelah setContentView. */
    fun ikat() {
        etPhone = a.findViewById(R.id.etPhone)
        tvRepoRingkas = a.findViewById(R.id.tvRepoRingkas)
        etChannel = a.findViewById(R.id.etChannel)
        etToken = a.findViewById(R.id.etToken)
        etInterval = a.findViewById(R.id.etInterval)
        etGrup = a.findViewById(R.id.etGrup)
        etGrupInterval = a.findViewById(R.id.etGrupInterval)
        etGrupHitam = a.findViewById(R.id.etGrupHitam)

        rowPrerelease = saklar(R.id.rowPrerelease)
        rowPostFirst = saklar(R.id.rowPostFirst)
        rowTestMsg = saklar(R.id.rowTestMsg)
        rowFormatTanya = saklar(R.id.rowFormatTanya)
        rowGrupAktif = saklar(R.id.rowGrupAktif)
        rowBoot = saklar(R.id.rowBoot)
        rowLogcat = saklar(R.id.rowLogcat)
        rowLaguAktif = saklar(R.id.rowLaguAktif)
        etLaguPerHari = a.findViewById(R.id.etLaguPerHari)
        etLaguJamMulai = a.findViewById(R.id.etLaguJamMulai)
        etLaguJamSelesai = a.findViewById(R.id.etLaguJamSelesai)
    }

    fun renderRepoRingkas() {
        tvRepoRingkas.text = RepoDaftar.ringkas(settings.repo)
    }

    /** prefs -> view */
    fun muat() {
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

    /** view -> prefs (angka kosong/aneh jatuh ke bawaan) */
    fun ambil() {
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
}
