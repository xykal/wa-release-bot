package com.xykals.warelease

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Unit test biasa (JVM, tanpa Android) — jalankan: ./gradlew :app:testDebugUnitTest */
class BridgeTokenTest {

    @Test
    fun `token berisi 32 byte acak dalam hex huruf kecil`() {
        val t = BridgeToken.baru()
        assertEquals(64, t.length)
        assertTrue(t.all { it in '0'..'9' || it in 'a'..'f' })
    }

    @Test
    fun `dua token baru selalu berbeda`() {
        assertNotEquals(BridgeToken.baru(), BridgeToken.baru())
    }

    @Test
    fun `token proses stabil selama proses hidup`() {
        assertEquals(BridgeToken.proses, BridgeToken.proses)
        assertEquals(64, BridgeToken.proses.length)
    }
}
