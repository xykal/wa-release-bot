package com.xykals.warelease

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class RekamEksporTest {
    @Test
    fun `folder ekspor berada di dalam Android media milik app`() {
        val media = File("/storage/emulated/0/Android/media/com.xykals.warelease")
        assertEquals(File(media, "rekaman"), folderEksporRekam(arrayOf(null, media)))
    }

    @Test
    fun `tanpa media eksternal app tetap memakai penyimpanan internal`() {
        assertNull(folderEksporRekam(emptyArray<File?>()))
        assertNull(folderEksporRekam(arrayOf<File?>(null)))
    }
}
