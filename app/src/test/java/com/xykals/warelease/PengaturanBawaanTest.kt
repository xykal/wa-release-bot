package com.xykals.warelease

import org.junit.Assert.assertFalse
import org.junit.Test

/** Menjaga instalasi baru tetap dalam mode hemat: semua fitur tambahan opt-in. */
class PengaturanBawaanTest {

    @Test
    fun `fitur yang membuka koneksi tambahan mati pada instalasi baru`() {
        assertFalse(PengaturanBawaan.PERINTAH_PRIBADI)
        assertFalse(PengaturanBawaan.MODERASI)
        assertFalse(PengaturanBawaan.LAGU)
        assertFalse(PengaturanBawaan.PENJAGA_GRUP)
        assertFalse(PengaturanBawaan.PESAN_BERKALA)
        assertFalse(PengaturanBawaan.REKAM_LOGCAT)
    }
}
