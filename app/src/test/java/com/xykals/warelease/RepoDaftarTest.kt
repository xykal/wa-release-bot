package com.xykals.warelease

import com.xykals.warelease.util.RepoDaftar
import com.xykals.warelease.util.RepoEntri
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Aturan parsing harus sama dengan bot-js/src/repo.mjs (lihat unit.test.mjs bagian
 * "channel per repo") — kalau salah satu berubah, ubah dua-duanya.
 */
class RepoDaftarTest {

    @Test
    fun `urai memisahkan repo dan channel, unik, urutan dijaga`() {
        val teks = "octo/demo|https://whatsapp.com/channel/0029Va, octo/kedua\n" +
            "https://github.com/octo/ketiga.git/|120363@newsletter ;octo/demo"
        assertEquals(
            listOf(
                RepoEntri("octo/demo", "https://whatsapp.com/channel/0029Va"),
                RepoEntri("octo/kedua", ""),
                RepoEntri("octo/ketiga", "120363@newsletter"),
            ),
            RepoDaftar.urai(teks),
        )
    }

    @Test
    fun `gabung adalah kebalikan urai dan membuang channel kosong`() {
        val daftar = listOf(RepoEntri("a/b", " https://whatsapp.com/channel/x "), RepoEntri("c/d", ""))
        val teks = RepoDaftar.gabung(daftar)
        assertEquals("a/b|https://whatsapp.com/channel/x, c/d", teks)
        assertEquals(listOf(RepoEntri("a/b", "https://whatsapp.com/channel/x"), RepoEntri("c/d")), RepoDaftar.urai(teks))
    }

    @Test
    fun `valid mengikuti aturan nama GitHub`() {
        assertTrue(RepoDaftar.valid("vercel/next.js"))
        assertTrue(RepoDaftar.valid("a_b-c/D.E_F"))
        assertFalse(RepoDaftar.valid("tanpa-garis-miring"))
        assertFalse(RepoDaftar.valid("a/b/c"))
        assertFalse(RepoDaftar.valid("spasi di/sini"))
        assertEquals("owner/nama", RepoDaftar.rapikan(" https://github.com/owner/nama.git/ "))
    }

    @Test
    fun `ringkas menyebut jumlah repo dan channel khusus`() {
        assertTrue(RepoDaftar.ringkas("").startsWith("Belum ada repo"))
        assertEquals("1 repo: a/b", RepoDaftar.ringkas("a/b"))
        assertEquals("2 repo: a/b, c/d (1 pakai channel khusus)", RepoDaftar.ringkas("a/b|link, c/d"))
    }
}
