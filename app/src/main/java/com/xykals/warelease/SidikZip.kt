package com.xykals.warelease

import java.io.FilterInputStream
import java.io.InputStream
import java.security.DigestInputStream
import java.security.MessageDigest

/**
 * Sidik jari SHA-256 ZIP project hosting, dihitung sambil dibongkar (sekali baca).
 * Mesin memakai sidik ini sebagai kunci persetujuan: ZIP baru wajib disetujui ulang.
 */
object SidikZip {

    // ZipInputStream.close() ikut menutup stream di bawahnya; sisa file harus
    // tetap bisa dibaca sesudahnya supaya sidik mencakup seluruh isi file.
    private class TanpaTutup(s: InputStream) : FilterInputStream(s) {
        override fun close() {}
    }

    /**
     * Jalankan [baca] atas [ins] lalu habiskan sisa stream (ZipInputStream berhenti
     * sebelum central directory), jadi hasilnya sama dengan `sha256sum file.zip`.
     */
    fun <T> bacaDenganSidik(ins: InputStream, baca: (InputStream) -> T): Pair<T, String> {
        val md = MessageDigest.getInstance("SHA-256")
        val dis = DigestInputStream(ins, md)
        val hasil = baca(TanpaTutup(dis))
        val buf = ByteArray(64 * 1024)
        while (dis.read(buf) >= 0) {}
        return hasil to hex(md.digest())
    }

    fun hex(b: ByteArray): String = b.joinToString("") { "%02x".format(it) }

    fun valid(sidik: String?): Boolean =
        sidik != null && sidik.length == 64 && sidik.all { it in '0'..'9' || it in 'a'..'f' }

    /** 64 karakter dipecah 4 baris supaya bisa dicocokkan mata di layar HP. */
    fun tampilan(sidik: String): String = sidik.chunked(16).joinToString("\n")
}
