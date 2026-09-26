package com.xykals.warelease

import com.xykals.warelease.util.Durasi
import org.junit.Assert.assertEquals
import org.junit.Test

/** Unit test biasa (JVM, tanpa Android) — jalankan: ./gradlew :app:testDebugUnitTest */
class DurasiTest {

    @Test
    fun `kurang dari semenit ditampilkan dalam detik`() {
        assertEquals("1 detik", Durasi.human(1_000))
        assertEquals("45 detik", Durasi.human(45_000))
        assertEquals("59 detik", Durasi.human(59_999))
    }

    @Test
    fun `semenit sampai sejam pakai format m dan d`() {
        assertEquals("1m 0d", Durasi.human(60_000))
        assertEquals("2m 30d", Durasi.human(150_000))
        assertEquals("59m 59d", Durasi.human(3_599_000))
    }

    @Test
    fun `sejam ke atas pakai format j dan m`() {
        assertEquals("1j 0m", Durasi.human(3_600_000))
        assertEquals("3j 15m", Durasi.human(11_700_000))
        assertEquals("24j 0m", Durasi.human(24 * 3_600_000L))
    }

    @Test
    fun `nol dan negatif dianggap sebentar lagi`() {
        assertEquals("sebentar lagi", Durasi.human(0))
        assertEquals("sebentar lagi", Durasi.human(-5_000))
    }
}
