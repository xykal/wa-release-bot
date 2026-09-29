package com.xykals.warelease.util

/**
 * Satu entri di layar Repo: repo GitHub + channel WA khusus (opsional).
 * Channel kosong berarti repo itu memakai "Channel WA" utama di layar depan.
 */
data class RepoEntri(val repo: String, val channel: String = "")

/**
 * Parser/serializer daftar repo. Bentuk simpannya SENGAJA tetap satu string di
 * pref `repo` ("owner/a|https://whatsapp.com/channel/..., owner/b") karena engine
 * (bot-js/src/repo.mjs) dan CLI membaca format yang sama: setting lama tanpa '|'
 * tetap terbaca tanpa migrasi, dan cukup satu tempat kebenaran untuk aturannya.
 * Aturan di sini harus sama persis dengan repo.mjs.
 */
object RepoDaftar {
    /** owner/nama — huruf, angka, titik, strip, garis bawah (aturan GitHub). */
    private val POLA = Regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
    private val AWALAN_GITHUB = Regex("^(https?://)?(www\\.)?github\\.com/", RegexOption.IGNORE_CASE)
    private val AKHIRAN_GIT = Regex("\\.git$", RegexOption.IGNORE_CASE)
    private val PEMISAH_DAFTAR = Regex("[\\s,;]+")

    /** '|' tidak pernah muncul di link channel/grup maupun JID (JID pakai '@'). */
    const val PEMISAH_CHANNEL = '|'

    /** 'https://github.com/owner/nama.git/' -> 'owner/nama'; selain itu cuma trim. */
    fun rapikan(teks: String): String =
        teks.trim().replace(AWALAN_GITHUB, "").trimEnd('/').replace(AKHIRAN_GIT, "")

    fun valid(repo: String): Boolean = POLA.matches(repo)

    /** Pecah string simpanan jadi entri unik (repo pertama menang), urutan dijaga. Belum divalidasi. */
    fun urai(teks: String): List<RepoEntri> {
        val hasil = ArrayList<RepoEntri>()
        for (bagian in teks.split(PEMISAH_DAFTAR)) {
            val t = bagian.trim()
            if (t.isEmpty()) continue
            val i = t.indexOf(PEMISAH_CHANNEL)
            val repo = rapikan(if (i < 0) t else t.substring(0, i))
            val channel = if (i < 0) "" else t.substring(i + 1).trim()
            if (repo.isNotEmpty() && hasil.none { it.repo == repo }) hasil.add(RepoEntri(repo, channel))
        }
        return hasil
    }

    /** Kebalikan urai(): "owner/a|link, owner/b". */
    fun gabung(daftar: List<RepoEntri>): String = daftar.joinToString(", ") {
        if (it.channel.isBlank()) it.repo else it.repo + PEMISAH_CHANNEL + it.channel.trim()
    }

    /** Teks singkat buat kartu di layar depan. */
    fun ringkas(teks: String): String {
        val d = urai(teks)
        if (d.isEmpty()) return "Belum ada repo. Tekan Kelola repo buat nambah."
        val khusus = d.count { it.channel.isNotBlank() }
        val nama = d.joinToString(", ") { it.repo }
        val ekor = if (khusus > 0) " ($khusus pakai channel khusus)" else ""
        return "${d.size} repo: $nama$ekor"
    }
}
