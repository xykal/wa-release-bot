package com.xykals.warelease

import android.app.Activity

/** Format ringkasan rekaman agar kartu Bot WA tetap terbaca dalam dua bahasa. */
internal fun Activity.teksStatusRekamChannel(ui: BotUi): String = buildString {
    append(
        getString(
            R.string.k_rekam_channel_status,
            getString(if (ui.rekamChannelAktif) R.string.k_nyala else R.string.k_mati),
            ui.rekamChannelJumlah
        )
    )
    append("\n")
    append(
        when (ui.rekamChannelTerakhir) {
            "tersimpan" -> getString(R.string.k_rekam_channel_terakhir_disimpan)
            "dilewatkan" -> getString(R.string.k_rekam_channel_terakhir_dilewatkan)
            "gagal" -> getString(R.string.k_rekam_channel_terakhir_gagal)
            else -> getString(R.string.k_rekam_channel_belum_ada)
        }
    )
}
