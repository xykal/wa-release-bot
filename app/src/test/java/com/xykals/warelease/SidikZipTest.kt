package com.xykals.warelease

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.security.MessageDigest
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream

/** Unit test biasa (JVM, tanpa Android) — jalankan: ./gradlew :app:testDebugUnitTest */
class SidikZipTest {

    private fun zipContoh(): ByteArray {
        val out = ByteArrayOutputStream()
        ZipOutputStream(out).use { z ->
            z.putNextEntry(ZipEntry("package.json")); z.write("{\"main\":\"index.js\"}".toByteArray()); z.closeEntry()
            z.putNextEntry(ZipEntry("index.js")); z.write("console.log('halo')".toByteArray()); z.closeEntry()
        }
        return out.toByteArray()
    }

    private fun sha256(b: ByteArray) = SidikZip.hex(MessageDigest.getInstance("SHA-256").digest(b))

    @Test
    fun `sidik sama dengan sha256 seluruh file walau ZipInputStream berhenti sebelum central directory`() {
        val bytes = zipContoh()
        val (jumlah, sidik) = SidikZip.bacaDenganSidik(ByteArrayInputStream(bytes)) { s ->
            ZipInputStream(s.buffered()).use { z ->
                var n = 0
                while (z.nextEntry != null) n++
                n
            }
        }
        assertEquals(2, jumlah)
        assertEquals(sha256(bytes), sidik)
    }

    @Test
    fun `stream yang tidak dibaca sama sekali tetap di-hash penuh`() {
        val bytes = zipContoh()
        val (_, sidik) = SidikZip.bacaDenganSidik(ByteArrayInputStream(bytes)) { }
        assertEquals(sha256(bytes), sidik)
    }

    @Test
    fun `validasi dan tampilan sidik`() {
        val s = sha256(zipContoh())
        assertTrue(SidikZip.valid(s))
        assertFalse(SidikZip.valid(s.uppercase()))
        assertFalse(SidikZip.valid("lama"))
        assertFalse(SidikZip.valid(null))
        assertEquals(4, SidikZip.tampilan(s).lines().size)
    }
}
