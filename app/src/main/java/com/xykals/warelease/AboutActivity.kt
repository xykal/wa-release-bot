package com.xykals.warelease

import android.os.Bundle
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

/** Tentang: versi, lisensi, karya pihak ketiga, privasi. */
class AboutActivity : AppCompatActivity() {

    companion object {
        const val REPO = "https://github.com/xykal/wa-release-bot"

        val PIHAK_KETIGA = listOf(
            "Baileys (WhiskeySockets)       MIT",
            "nodejs-mobile                  MIT",
            "Node.js                        MIT",
            "pino / ws                      MIT",
            "esbuild                        MIT",
            "OkHttp (Square)                Apache-2.0",
            "ZXing core                     Apache-2.0",
            "AndroidX / Material / Kotlin   Apache-2.0",
        )
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_tentang)
        val banner = Banner(findViewById(R.id.tvBanner))

        findViewById<TextView>(R.id.tvVersiTentang).text =
            "v${BuildConfig.VERSION_NAME} (build ${BuildConfig.VERSION_CODE}) · © 2025–2026 xykal"
        findViewById<TextView>(R.id.tvLisensi).text =
            "Lisensi pemakaian pribadi (source-available), BUKAN open source.\n\n" +
                    "✓ Boleh: pakai buat diri sendiri, baca & pelajari kodenya, ubah buat dipakai sendiri.\n" +
                    "✗ Nggak boleh tanpa izin tertulis: jual, sewain, sebar ulang (APK / kode), " +
                    "ganti nama & ngaku bikinan sendiri (rebrand), atau pakai buat bisnis / jasa berbayar.\n\n" +
                    "Kode pihak ketiga di bawah tetap ikut lisensi aslinya masing-masing."
        findViewById<TextView>(R.id.tvPihakKetiga).text = PIHAK_KETIGA.joinToString("\n")
        findViewById<TextView>(R.id.tvPrivasi).text =
            "Nggak ada server, analytics, atau iklan. Sesi WhatsApp, setelan, token GitHub, dan log " +
                    "cuma disimpen di HP ini. Koneksi keluar cuma ke WhatsApp dan api.github.com.\n\n" +
                    "App ini alat tidak resmi — nggak ada hubungannya sama WhatsApp / Meta atau GitHub."

        pasangTombol(R.id.btnKembali, "Kembali", { banner.tampil(it) }) { finish() }
        pasangTombol(R.id.btnRepo, "Buka repo", { banner.tampil(it) }) { bukaLink(REPO) }
        pasangTombol(R.id.btnLisensi, "Lisensi", { banner.tampil(it) }) { bukaLink("$REPO/blob/main/LICENSE") }
    }
}
