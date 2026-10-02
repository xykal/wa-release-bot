// Copyright (c) 2026 xykal — XyVerse Technology Global
package com.xykals.warelease

import java.util.Locale
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class StikerTest {
    @Test
    fun `rapikan teks merapikan whitespace dan lowercase stabil`() {
        val semula = Locale.getDefault()
        try {
            Locale.setDefault(Locale("tr", "TR"))
            assertEquals("i halo dunia", teksBratTerbatas("  I  HALO\n dunia  "))
        } finally {
            Locale.setDefault(semula)
        }
    }

    @Test
    fun `batas 48 karakter menghitung code point dan menjaga emoji utuh`() {
        val hasil = teksBratTerbatas("😀".repeat(49))!!
        assertEquals(48, hasil.codePointCount(0, hasil.length))
        assertEquals("😀".repeat(48), hasil)
    }

    @Test
    fun `input kosong ditolak`() {
        assertNull(teksBratTerbatas(" \n  \t "))
    }
}
