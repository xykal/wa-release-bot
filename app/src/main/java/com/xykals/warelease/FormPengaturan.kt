package com.xykals.warelease

import android.app.Activity
import android.view.View
import android.view.ViewGroup
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
    private lateinit var rowSuaraSplash: View
    private lateinit var rowModerasi: View
    private lateinit var rowPerintahPribadi: View
    private lateinit var rowModerasiIzinkanLink: View
    private lateinit var etModerasiStrike: EditText
    private lateinit var etModerasiKata: EditText
    private lateinit var etModerasiDomain: EditText
    private lateinit var etStoryKe: EditText
    private lateinit var rowBerkalaAktif: View
    private lateinit var etBerkalaJam: EditText
    private lateinit var etBerkalaTeks: EditText
    private lateinit var rowBerkalaHitam: View

    /** Dipanggil tiap ada perubahan (buat tombol Simpan yang muncul-muncul). */
    private var onBerubah: (() -> Unit)? = null

    private fun kabari() {
        onBerubah?.invoke()
    }

    private fun saklar(id: Int): View {
        val v = a.findViewById<View>(id)
        v.setOnClickListener {
            v.isSelected = !v.isSelected
            kabari()
        }
        return v
    }

    /**
     * Mulai mantau perubahan. Dipanggil SETELAH muat() — kalau dipanggil
     * sebelum, isian awal dari prefs bakal dikira perubahan user dan tombol
     * Simpan langsung nongol sendiri.
     */
    fun pantauPerubahan(fn: () -> Unit) {
        onBerubah = fn
        for (et in semuaIsian()) {
            et.addTextChangedListener(object : android.text.TextWatcher {
                override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) = Unit
                override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) = kabari()
                override fun afterTextChanged(s: android.text.Editable?) = Unit
            })
        }
    }

    /** Semua EditText di layar utama: itu semua isian setting, jadi ikut dipantau. */
    private fun semuaIsian(): List<EditText> {
        val hasil = mutableListOf<EditText>()
        fun telusuri(v: View) {
            if (v is EditText) {
                hasil.add(v)
                return
            }
            if (v is ViewGroup) for (i in 0 until v.childCount) telusuri(v.getChildAt(i))
        }
        telusuri(a.findViewById(android.R.id.content))
        return hasil
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

        // Bukan lewat saklar(): nyalain baris ini artinya "boleh bunyi lagi",
        // jadi bendera voSudahMain dikosongin (lihat SuaraSplash.kt).
        rowSuaraSplash = a.findViewById(R.id.rowSuaraSplash)
        rowSuaraSplash.setOnClickListener {
            val baru = !rowSuaraSplash.isSelected
            rowSuaraSplash.isSelected = baru
            settings.suaraSplash = baru
            if (baru) settings.voSudahMain = false
            kabari()
        }
        etLaguPerHari = a.findViewById(R.id.etLaguPerHari)
        etLaguJamMulai = a.findViewById(R.id.etLaguJamMulai)
        etLaguJamSelesai = a.findViewById(R.id.etLaguJamSelesai)

        rowModerasi = saklar(R.id.rowModerasi)
        rowPerintahPribadi = saklar(R.id.rowPerintahPribadi)
        rowModerasiIzinkanLink = saklar(R.id.rowModerasiIzinkanLink)
        etModerasiStrike = a.findViewById(R.id.etModerasiStrike)
        etModerasiKata = a.findViewById(R.id.etModerasiKata)
        etModerasiDomain = a.findViewById(R.id.etModerasiDomain)
        etStoryKe = a.findViewById(R.id.etStoryKe)

        rowBerkalaAktif = saklar(R.id.rowBerkalaAktif)
        etBerkalaJam = a.findViewById(R.id.etBerkalaJam)
        etBerkalaTeks = a.findViewById(R.id.etBerkalaTeks)
        rowBerkalaHitam = saklar(R.id.rowBerkalaHitam)
    }

    fun renderRepoRingkas() {
        tvRepoRingkas.text = RepoDaftar.ringkas(settings.repo)
    }

    /** Saklar di kartu Log dan Pengaturan berbagi satu preferensi. */
    fun aturRekamLogcat(aktif: Boolean) {
        settings.rekamLogcat = aktif
        rowLogcat.isSelected = aktif
        if (aktif) LogRecorder.mulaiRekamLogcat() else LogRecorder.berhentiRekamLogcat()
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
        rowSuaraSplash.isSelected = settings.suaraSplash
        rowModerasi.isSelected = settings.moderasiAktif
        rowPerintahPribadi.isSelected = settings.perintahPribadi
        rowModerasiIzinkanLink.isSelected = settings.moderasiIzinkanLink
        etModerasiStrike.setText(settings.moderasiStrike.toString())
        etModerasiKata.setText(settings.moderasiKata)
        etModerasiDomain.setText(settings.moderasiDomain)
        etStoryKe.setText(settings.storyKe)
        rowBerkalaAktif.isSelected = settings.berkalaAktif
        etBerkalaJam.setText(settings.berkalaJam.toString())
        etBerkalaTeks.setText(settings.berkalaTeks)
        rowBerkalaHitam.isSelected = settings.berkalaHitamSaja
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
        settings.suaraSplash = rowSuaraSplash.isSelected
        settings.moderasiAktif = rowModerasi.isSelected
        settings.perintahPribadi = rowPerintahPribadi.isSelected
        settings.moderasiIzinkanLink = rowModerasiIzinkanLink.isSelected
        settings.moderasiStrike = etModerasiStrike.text.toString().toIntOrNull() ?: 2
        settings.moderasiKata = etModerasiKata.text.toString()
        settings.moderasiDomain = etModerasiDomain.text.toString()
        settings.storyKe = etStoryKe.text.toString()
        settings.berkalaAktif = rowBerkalaAktif.isSelected
        settings.berkalaJam = etBerkalaJam.text.toString().toIntOrNull() ?: 12
        settings.berkalaTeks = etBerkalaTeks.text.toString()
        settings.berkalaHitamSaja = rowBerkalaHitam.isSelected

        val logcatLama = settings.rekamLogcat
        settings.rekamLogcat = rowLogcat.isSelected
        if (logcatLama != settings.rekamLogcat) {
            if (settings.rekamLogcat) LogRecorder.mulaiRekamLogcat() else LogRecorder.berhentiRekamLogcat()
        }
    }
}
