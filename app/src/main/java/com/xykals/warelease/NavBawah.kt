package com.xykals.warelease

import android.app.Activity
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.widget.ScrollView

/**
 * Bar navigasi bawah: lima tab, satu layar kelihatan sekali.
 *
 * Tiap tab itu satu LinearLayout di [activity_main][R.layout.activity_main]
 * (id `tab*`); di sini cuma diatur mana yang VISIBLE, mana yang GONE, plus
 * item navbar yang ikut nyala (`isSelected`). Tab dipilih user -> gulungan
 * layar balik ke atas dan [onPindah] dipanggil, biar MainActivity bisa
 * ngerjain hal khas tab itu (mis. log langsung ke baris paling baru).
 *
 * Tab terakhir disimpan di `savedInstanceState`, jadi putar layar nggak balik
 * ke Beranda.
 */
internal enum class Tab(val tombol: Int, val wadah: Int, val label: Int, val adaSimpan: Boolean) {
    BERANDA(R.id.navBeranda, R.id.tabBeranda, R.string.u_nav_beranda, true),
    REPO(R.id.navRepo, R.id.tabRepo, R.string.u_nav_repo, true),
    FITUR(R.id.navFitur, R.id.tabFitur, R.string.u_nav_fitur, true),

    // Tab Log nggak punya kolom isian: bar Simpan disembunyiin biar nggak
    // kebingungan "nyimpan apa".
    LOG(R.id.navLog, R.id.tabLog, R.string.u_nav_log, false),
    PENGATURAN(R.id.navPengaturan, R.id.tabPengaturan, R.string.u_nav_pengaturan, true);

    companion object {
        fun dariNama(nama: String?): Tab = entries.firstOrNull { it.name == nama } ?: BERANDA
    }
}

internal class NavBawah(
    private val a: Activity,
    private val onPindah: (Tab) -> Unit
) {
    var aktif: Tab = Tab.BERANDA
        private set

    /**
     * Ada perubahan yang belum disimpan? Tombol Simpan cuma muncul kalau ini
     * true, biar layarnya bersih dan nggak ada tombol yang nggak ada gunanya.
     * Diisi FormPengaturan lewat pantauPerubahan() (semua kotak isian + saklar).
     */
    private var adaPerubahan = false

    private val barSimpan: View get() = a.findViewById(R.id.barSimpan)

    private companion object {
        // kunci Bundle buat nyimpen tab yang lagi dibuka (putar layar)
        const val KUNCI = "tabAktif"
    }

    fun ikat() {
        for (t in Tab.entries) {
            a.findViewById<View>(t.tombol).setOnClickListener { pindah(t) }
        }
        tampilkan(Tab.BERANDA, kabari = false)
    }

    fun pindah(t: Tab) = tampilkan(t, kabari = true)

    fun simpanKe(b: Bundle) {
        b.putString(KUNCI, aktif.name)
    }

    fun pulihkan(b: Bundle) {
        val t = Tab.dariNama(b.getString(KUNCI))
        if (t != aktif) tampilkan(t, kabari = false)
    }

    /** Animasi kartu muncul satu-satu di tab yang lagi kelihatan. */
    fun animasiMasuk() {
        (a.findViewById<View>(aktif.wadah) as? ViewGroup)?.let { Denyut.munculBerurutan(it) }
    }

    /** Dipanggil tiap user ngubah isian/saklar. */
    fun tandaiBerubah() {
        if (adaPerubahan) return
        adaPerubahan = true
        aturBarSimpan()
    }

    /** Dipanggil setelah setting benar-benar tersimpan ke engine. */
    fun bersihkanPerubahan() {
        if (!adaPerubahan) return
        adaPerubahan = false
        aturBarSimpan()
    }

    /** Tombol Simpan: cuma kelihatan di tab yang punya isian DAN ada perubahan. */
    private fun aturBarSimpan() {
        val tampil = aktif.adaSimpan && adaPerubahan
        barSimpan.visibility = if (tampil) View.VISIBLE else View.GONE
        if (tampil) {
            // tanpa animasi alpha: uiautomator (CI) membaca visibility, dan
            // tombol yang "muncul" harus langsung bisa dipencet.
            barSimpan.translationY = a.resources.displayMetrics.density * 8f
            barSimpan.animate().translationY(0f).setDuration(160).start()
        }
    }

    private fun tampilkan(t: Tab, kabari: Boolean) {
        aktif = t
        for (x in Tab.entries) {
            a.findViewById<View>(x.wadah).visibility = if (x == t) View.VISIBLE else View.GONE
            a.findViewById<View>(x.tombol).isSelected = x == t
        }
        aturBarSimpan()
        // Tiap tab mulai dari atas; tanpa ini tab baru kebuka di posisi gulung
        // tab sebelumnya.
        a.findViewById<ScrollView>(R.id.svUtama).scrollTo(0, 0)
        if (kabari) {
            LogRecorder.tulis("Navigasi", "tab ${a.getString(t.label)} dibuka")
            onPindah(t)
        }
    }
}
