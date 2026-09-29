package com.xykals.warelease

import android.graphics.Typeface
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.inputmethod.EditorInfo
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.xykals.warelease.util.RepoDaftar
import com.xykals.warelease.util.RepoEntri

/**
 * Layar Repo: daftar repo GitHub yang dipantau, masing-masing boleh punya channel
 * WA sendiri. Perubahan langsung disimpan ke SettingsStore; MainActivity yang
 * mengirim config baru ke engine saat layar ini ditutup (onResume di sana),
 * supaya hanya ada satu jalur "kirim configure" dan tidak balapan dengan Simpan.
 */
class RepoActivity : AppCompatActivity() {

    private val handler = Handler(Looper.getMainLooper())
    private lateinit var settings: SettingsStore
    private lateinit var etRepo: EditText
    private lateinit var etChannel: EditText
    private lateinit var kolomDaftar: LinearLayout
    private lateinit var tvKosong: TextView
    private lateinit var tvBanner: TextView

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()
    private fun warna(id: Int) = ContextCompat.getColor(this, id)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        settings = SettingsStore(this)
        LogRecorder.init(this)
        LogRecorder.tulis("Activity", "Layar repo dibuka")
        setContentView(bangunLayar())
        Denyut.pasangSemua(window.decorView)
        render()
    }

    // ------------------------------------------------------------ layar

    private fun tombol(teks: String, gaya: Int, ikon: Int, aksi: () -> Unit) =
        TextView(this, null, 0, gaya).apply {
            text = teks
            setCompoundDrawablesRelativeWithIntrinsicBounds(ikon, 0, 0, 0)
            setOnClickListener {
                LogRecorder.tulis("Tombol", "repo: $teks")
                try { aksi() } catch (e: Throwable) {
                    LogRecorder.galat("Tombol", "repo \"$teks\" gagal", e)
                    banner(getString(R.string.k_gagal_2, e.message))
                }
            }
        }

    private fun kartu() = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        background = ContextCompat.getDrawable(this@RepoActivity, R.drawable.bg_kartu)
        setPadding(dp(18), dp(16), dp(18), dp(16))
    }

    private fun label(teks: String) = TextView(this, null, 0, R.style.Label).apply { text = teks }

    private fun bangunLayar(): View {
        val akar = FrameLayout(this).apply { setBackgroundColor(warna(R.color.wr_latar)) }
        val gulir = ScrollView(this).apply { isFillViewport = true }
        val kolom = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(14), dp(16), dp(24))
        }

        // header: tombol kembali + judul
        val header = LinearLayout(this).apply { gravity = Gravity.CENTER_VERTICAL }
        val kembali = ImageView(this).apply {
            setImageResource(R.drawable.ic_tutup)
            setColorFilter(warna(R.color.wr_teks))
            setPadding(dp(8), dp(8), dp(8), dp(8))
            isClickable = true
            contentDescription = getString(R.string.k_kembali)
            setOnClickListener { finish() }
        }
        header.addView(kembali, LinearLayout.LayoutParams(dp(40), dp(40)))
        val judulKol = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(8), 0, 0, 0) }
        judulKol.addView(TextView(this).apply {
            text = getString(R.string.u_repo_github)
            setTextColor(warna(R.color.wr_teks)); textSize = 21f
            typeface = Typeface.DEFAULT_BOLD
        })
        judulKol.addView(TextView(this).apply {
            text = getString(R.string.k_repo_yang_dipantau_dan_channel)
            setTextColor(warna(R.color.wr_teks2)); textSize = 12f
        })
        header.addView(judulKol, LinearLayout.LayoutParams(0, -2, 1f))
        kolom.addView(header)

        // kartu tambah
        val kTambah = kartu()
        kTambah.addView(label(getString(R.string.k_repo)))
        etRepo = EditText(this, null, 0, R.style.Isian).apply {
            hint = getString(R.string.k_pemilik_nama_repo_atau_link)
            importantForAutofill = View.IMPORTANT_FOR_AUTOFILL_NO
            imeOptions = EditorInfo.IME_ACTION_NEXT
        }
        kTambah.addView(etRepo, LinearLayout.LayoutParams(-1, -2))
        kTambah.addView(label(getString(R.string.k_channel_khusus_opsional)))
        etChannel = EditText(this, null, 0, R.style.Isian).apply {
            hint = getString(R.string.k_kosong_pakai_channel_wa_utama)
            importantForAutofill = View.IMPORTANT_FOR_AUTOFILL_NO
            imeOptions = EditorInfo.IME_ACTION_DONE
            setOnEditorActionListener { _, id, _ ->
                if (id == EditorInfo.IME_ACTION_DONE) { tambah(); true } else false
            }
        }
        kTambah.addView(etChannel, LinearLayout.LayoutParams(-1, -2))
        kTambah.addView(
            tombol(getString(R.string.k_tambah_perbarui), R.style.TombolUtama, R.drawable.ic_tambah) { tambah() },
            LinearLayout.LayoutParams(-1, dp(52)).apply { topMargin = dp(14) },
        )
        kTambah.addView(TextView(this).apply {
            text = getString(R.string.k_repo_yang_sudah_ada_di)
            setTextColor(warna(R.color.wr_teks2)); textSize = 11.5f
            setPadding(0, dp(10), 0, 0)
        })
        kolom.addView(kTambah, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(14) })

        // kartu daftar
        val kDaftar = kartu()
        kDaftar.addView(TextView(this, null, 0, R.style.JudulKartu).apply {
            text = getString(R.string.k_daftar_repo)
            setCompoundDrawablesRelativeWithIntrinsicBounds(R.drawable.ic_daftar, 0, 0, 0)
        })
        tvKosong = TextView(this).apply {
            text = getString(R.string.k_belum_ada_repo_isi_form)
            setTextColor(warna(R.color.wr_teks2)); textSize = 13f
            setPadding(0, dp(8), 0, 0)
        }
        kDaftar.addView(tvKosong)
        kolomDaftar = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        kDaftar.addView(kolomDaftar, LinearLayout.LayoutParams(-1, -2))
        kolom.addView(kDaftar, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(12) })

        kolom.addView(TextView(this).apply {
            text = getString(R.string.k_perubahan_tersimpan_otomatis_dan_dikirim)
            setTextColor(warna(R.color.wr_teks2)); textSize = 11.5f
            setPadding(dp(4), dp(12), dp(4), 0)
        })

        gulir.addView(kolom, FrameLayout.LayoutParams(-1, -2))
        akar.addView(gulir, FrameLayout.LayoutParams(-1, -1))

        tvBanner = TextView(this).apply {
            background = ContextCompat.getDrawable(this@RepoActivity, R.drawable.bg_banner)
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

    // ------------------------------------------------------------ data

    private fun daftar(): List<RepoEntri> = RepoDaftar.urai(settings.repo)

    private fun simpan(baru: List<RepoEntri>) {
        settings.repo = RepoDaftar.gabung(baru)
        render()
    }

    private fun tambah() {
        val repo = RepoDaftar.rapikan(etRepo.text.toString())
        val channel = etChannel.text.toString().trim()
        if (repo.isEmpty()) { banner(getString(R.string.k_isi_dulu_repo_nya_contoh)); return }
        if (!RepoDaftar.valid(repo)) { banner(getString(R.string.k_format_repo_salah_contoh_yang)); return }
        val lama = daftar()
        val ada = lama.any { it.repo == repo }
        val baru = if (ada) lama.map { if (it.repo == repo) RepoEntri(repo, channel) else it } else lama + RepoEntri(repo, channel)
        simpan(baru)
        etRepo.text.clear(); etChannel.text.clear(); etRepo.requestFocus()
        banner(if (ada) getString(R.string.k_channel_diperbarui, repo) else getString(R.string.k_ditambahkan, repo))
    }

    private fun hapus(repo: String) {
        simpan(daftar().filter { it.repo != repo })
        banner(getString(R.string.k_dihapus, repo))
    }

    private fun render() {
        val d = daftar()
        kolomDaftar.removeAllViews()
        tvKosong.visibility = if (d.isEmpty()) View.VISIBLE else View.GONE
        d.forEach { e ->
            val baris = LinearLayout(this).apply {
                gravity = Gravity.CENTER_VERTICAL
                setPadding(0, dp(10), 0, dp(10))
            }
            val teks = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
            teks.addView(TextView(this).apply {
                text = e.repo
                setTextColor(warna(R.color.wr_teks)); textSize = 15f; typeface = Typeface.DEFAULT_BOLD
                maxLines = 1
            })
            teks.addView(TextView(this).apply {
                text = if (e.channel.isBlank()) getString(R.string.k_channel_utama) else e.channel
                setTextColor(warna(R.color.wr_teks2)); textSize = 12f
                maxLines = 1
            })
            baris.addView(teks, LinearLayout.LayoutParams(0, -2, 1f))
            val btnHapus = tombol("", R.style.TombolBahaya, R.drawable.ic_hapus) { hapus(e.repo) }
            btnHapus.setPadding(dp(14), 0, dp(10), 0)
            btnHapus.contentDescription = getString(R.string.k_hapus, e.repo)
            baris.addView(btnHapus, LinearLayout.LayoutParams(dp(52), dp(44)).apply { marginStart = dp(10) })
            kolomDaftar.addView(baris, LinearLayout.LayoutParams(-1, -2))
            kolomDaftar.addView(View(this).apply { setBackgroundColor(warna(R.color.wr_garis)) }, LinearLayout.LayoutParams(-1, dp(1)))
        }
    }

    // ------------------------------------------------------------ banner

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
