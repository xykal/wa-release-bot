package com.xykals.warelease

import java.io.ByteArrayOutputStream
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class HostingSecurityTest {

    @Test
    fun `sha256 arsip stabil dan huruf kecil`() {
        val hash = HostingSecurity.sha256("abc".byteInputStream())
        assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", hash)
    }

    @Test
    fun `arsip yang dihash disalin byte per byte untuk dipasang`() {
        val sumber = ByteArray(150_000) { (it % 251).toByte() }
        val tujuan = ByteArrayOutputStream()
        HostingSecurity.salinDanSha256(sumber.inputStream(), tujuan)
        assertArrayEquals(sumber, tujuan.toByteArray())
    }

    @Test
    fun `arsip berhenti disalin ketika melewati batas`() {
        assertThrows(HostingSecurity.ArsipTerlaluBesar::class.java) {
            HostingSecurity.salinDanSha256("abc".byteInputStream(), ByteArrayOutputStream(), 2)
        }
    }
}
