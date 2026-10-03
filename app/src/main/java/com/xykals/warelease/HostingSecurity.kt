package com.xykals.warelease

import java.io.InputStream
import java.io.OutputStream
import java.security.MessageDigest

/** Fungsi murni untuk identitas arsip project sebelum pengguna menyetujuinya. */
internal object HostingSecurity {
    class ArsipTerlaluBesar : IllegalStateException()

    fun sha256(input: InputStream): String = salinDanSha256(input, null)

    /** Salin dan hash dalam satu lintasan agar arsip yang disetujui = yang dipasang. */
    fun salinDanSha256(
        input: InputStream,
        output: OutputStream?,
        batasByte: Long = Long.MAX_VALUE
    ): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val buffer = ByteArray(64 * 1024)
        var total = 0L
        while (true) {
            val read = input.read(buffer)
            if (read < 0) break
            if (read > 0) {
                total += read
                if (total > batasByte) throw ArsipTerlaluBesar()
                digest.update(buffer, 0, read)
                output?.write(buffer, 0, read)
            }
        }
        output?.flush()
        return digest.digest().joinToString("") { "%02x".format(it.toInt() and 0xff) }
    }
}
