package com.xykals.warelease

import android.content.Context
import org.json.JSONObject

/** Setting app (SharedPreferences) */
class SettingsStore(ctx: Context) {

    private val p = ctx.getSharedPreferences("wa_release_bot", Context.MODE_PRIVATE)

    init {
        // Build internal lama menyalakan Perintah pribadi dan logcat secara
        // bawaan. Nilai `true` di prefs tidak membuktikan user pernah opt-in,
        // jadi hardening pertama mematikannya sekali. Setelah itu pilihan user
        // dihormati dan tidak disentuh lagi pada startup berikutnya.
        if (!p.getBoolean("hardeningOptInV1", false)) {
            p.edit()
                .putBoolean("perintahPribadi", PengaturanBawaan.PERINTAH_PRIBADI)
                .putBoolean("rekamLogcat", PengaturanBawaan.REKAM_LOGCAT)
                .putBoolean("hardeningOptInV1", true)
                .apply()
        }
    }

    var repo: String
        get() = p.getString("repo", "") ?: ""
        set(v) = p.edit().putString("repo", v.trim()).apply()

    var channel: String
        get() = p.getString("channel", "") ?: ""
        set(v) = p.edit().putString("channel", v.trim()).apply()

    var token: String
        get() = p.getString("token", "") ?: ""
        set(v) = p.edit().putString("token", v).apply()

    var intervalMinutes: Int
        get() = p.getInt("interval", 15)
        set(v) = p.edit().putInt("interval", v.coerceIn(1, 720)).apply()

    var includePrereleases: Boolean
        get() = p.getBoolean("prereleases", false)
        set(v) = p.edit().putBoolean("prereleases", v).apply()

    var postOnFirstRun: Boolean
        get() = p.getBoolean("postFirst", false)
        set(v) = p.edit().putBoolean("postFirst", v).apply()

    var testMessageOnSetup: Boolean
        get() = p.getBoolean("testMsg", true)
        set(v) = p.edit().putBoolean("testMsg", v).apply()

    /** Pesan ke channel dikirim sebagai "Pertanyaan" (follower bisa bales). */
    var formatPertanyaan: Boolean
        get() = p.getBoolean("formatTanya", false)
        set(v) = p.edit().putBoolean("formatTanya", v).apply()

    var autoStartOnBoot: Boolean
        get() = p.getBoolean("boot", true)
        set(v) = p.edit().putBoolean("boot", v).apply()

    /** Nomor WA buat pairing code (format bebas, dirapikan sama engine). */
    var phone: String
        get() = p.getString("phone", "") ?: ""
        set(v) = p.edit().putString("phone", v.trim()).apply()

    // ---- penjaga grup ----
    var grupAktif: Boolean
        get() = p.getBoolean("grupAktif", PengaturanBawaan.PENJAGA_GRUP)
        set(v) = p.edit().putBoolean("grupAktif", v).apply()

    var grupTarget: String
        get() = p.getString("grupTarget", "") ?: ""
        set(v) = p.edit().putString("grupTarget", v.trim()).apply()

    var grupInterval: Int
        get() = p.getInt("grupInterval", 5)
        set(v) = p.edit().putInt("grupInterval", v.coerceIn(2, 720)).apply()

    /** Nomor yang selalu ditolak (dipisah koma / baris). */
    var grupHitam: String
        get() = p.getString("grupHitam", "") ?: ""
        set(v) = p.edit().putString("grupHitam", v).apply()

    // ---- lagu mood ----
    var laguAktif: Boolean
        get() = p.getBoolean("laguAktif", PengaturanBawaan.LAGU)
        set(v) = p.edit().putBoolean("laguAktif", v).apply()

    /** Rata-rata berapa kali sehari (jadwal persisnya diacak engine). */
    var laguPerHari: Int
        get() = p.getInt("laguPerHari", 2)
        set(v) = p.edit().putInt("laguPerHari", v.coerceIn(1, 8)).apply()

    var laguJamMulai: Int
        get() = p.getInt("laguJamMulai", 9)
        set(v) = p.edit().putInt("laguJamMulai", v.coerceIn(0, 23)).apply()

    var laguJamSelesai: Int
        get() = p.getInt("laguJamSelesai", 22)
        set(v) = p.edit().putInt("laguJamSelesai", v.coerceIn(1, 24)).apply()

    // ---- pertanyaan mood (ngejoks) ----
    var pertanyaanAktif: Boolean
        get() = p.getBoolean("pertanyaanAktif", PengaturanBawaan.LAWAK)
        set(v) = p.edit().putBoolean("pertanyaanAktif", v).apply()

    /** Rata-rata berapa kali sehari (jam efektifnya dipatok engine: 10–21). */
    var pertanyaanPerHari: Int
        get() = p.getInt("pertanyaanPerHari", 2)
        set(v) = p.edit().putInt("pertanyaanPerHari", v.coerceIn(1, 8)).apply()

    // ---- hosting & sambutan ----
    /** Pernah upload project bot custom → service boleh nyala sendiri pas boot. */
    var hostingDipakai: Boolean
        get() = p.getBoolean("hostingDipakai", false)
        set(v) = p.edit().putBoolean("hostingDipakai", v).apply()

    var sudahSambutan: Boolean
        get() = p.getBoolean("sambutanV2", false)
        set(v) = p.edit().putBoolean("sambutanV2", v).apply()

    // ---- bot WA umum: moderasi grup + perintah pribadi ----
    /** Moderasi grup: hapus link/phishing/promo, peringatan, strike kedua keluar. */
    var moderasiAktif: Boolean
        get() = p.getBoolean("moderasiAktif", PengaturanBawaan.MODERASI)
        set(v) = p.edit().putBoolean("moderasiAktif", v).apply()

    /** Perintah pribadi (.menu, .stiker, .story) HANYA di chat sendiri. */
    var perintahPribadi: Boolean
        get() = p.getBoolean("perintahPribadi", PengaturanBawaan.PERINTAH_PRIBADI)
        set(v) = p.edit().putBoolean("perintahPribadi", v).apply()

    /** Berapa kali boleh melanggar sebelum dikeluarkan. */
    var moderasiStrike: Int
        get() = p.getInt("moderasiStrike", 2)
        set(v) = p.edit().putInt("moderasiStrike", v.coerceIn(1, 5)).apply()

    /** Kata kunci tambahan yang ikut dianggap spam (dipisah koma/baris). */
    var moderasiKata: String
        get() = p.getString("moderasiKata", "") ?: ""
        set(v) = p.edit().putString("moderasiKata", v).apply()

    /** Domain yang langsung dianggap phishing (dipisah koma/baris). */
    var moderasiDomain: String
        get() = p.getString("moderasiDomain", "") ?: ""
        set(v) = p.edit().putString("moderasiDomain", v).apply()

    /** Izinkan link biasa (selain domain izin) — default: nggak. */
    var moderasiIzinkanLink: Boolean
        get() = p.getBoolean("moderasiIzinkanLink", false)
        set(v) = p.edit().putBoolean("moderasiIzinkanLink", v).apply()

    /** Nomor penonton story (dipisah koma/baris), selain anggota grup. */
    var storyKe: String
        get() = p.getString("storyKe", "") ?: ""
        set(v) = p.edit().putString("storyKe", v).apply()

    // ---- pesan berkala ke grup ----
    /** Kirim pesan berkala (mis. daftar hitam) ke grup yang dipantau. */
    var berkalaAktif: Boolean
        get() = p.getBoolean("berkalaAktif", PengaturanBawaan.PESAN_BERKALA)
        set(v) = p.edit().putBoolean("berkalaAktif", v).apply()

    /** Jarak antar pesan dalam jam (1-168; di luar itu dijepit engine). */
    var berkalaJam: Int
        get() = p.getInt("berkalaJam", 12)
        set(v) = p.edit().putInt("berkalaJam", v.coerceIn(1, 168)).apply()

    /** Kalau kosong, yang dikirim daftar hitam grup; kalau diisi, teks ini. */
    /** Saklar "selalu daftar hitam": teks di kolom pesan diabaikan kalau nyala. */
    var berkalaHitamSaja: Boolean
        get() = p.getBoolean("berkalaHitamSaja", false)
        set(v) = p.edit().putBoolean("berkalaHitamSaja", v).apply()

    var berkalaTeks: String
        get() = p.getString("berkalaTeks", "") ?: ""
        set(v) = p.edit().putString("berkalaTeks", v).apply()

    // ---- splash & suara ----
    /** Saklar "Suara pembuka" di tab Pengaturan. */
    var suaraSplash: Boolean
        get() = p.getBoolean("suaraSplash", true)
        set(v) = p.edit().putBoolean("suaraSplash", v).apply()

    /**
     * Voice over "XyVerse Technology Global" cuma bunyi SEKALI (permintaan kall
     * 2026-09-30). Bendera ini dipasang setelah suaranya benar-benar mulai;
     * nyalain saklarnya lagi akan mengosonginya, jadi bunyi sekali lagi.
     */
    var voSudahMain: Boolean
        get() = p.getBoolean("voSudahMain", false)
        set(v) = p.edit().putBoolean("voSudahMain", v).apply()

    // ---- batre ----
    var rekamLogcat: Boolean
        get() = p.getBoolean("rekamLogcat", PengaturanBawaan.REKAM_LOGCAT)
        set(v) = p.edit().putBoolean("rekamLogcat", v).apply()

    /**
     * Buat nyalain engine, yang wajib cuma repo.
     *
     * Channel sengaja TIDAK ikut diwajibkan: dari sananya user nggak punya
     * channel, dan dia nggak bisa dapet channel sebelum engine-nya jalan
     * (tombol "Bikin Channel" butuh engine hidup). Kalau channel diwajibkan,
     * keadaannya jadi mentok: nggak bisa nyimpen setting → nggak bisa bikin
     * channel → nggak bisa ngisi channel.
     *
     * Kalau channel-nya kosong pas mau posting, engine bakal ngeluh di log
     * dengan pesan yang jelas — bukan gagal diam-diam.
     */
    fun hasValidSettings(): Boolean =
        repo.isNotBlank() || (grupAktif && grupTarget.isNotBlank()) || laguAktif ||
            pertanyaanAktif || moderasiAktif || perintahPribadi

    /** Offset zona waktu HP (menit) — engine Node di Android nggak tau zona waktu lokal. */
    private fun tzMenit(): Int =
        java.util.TimeZone.getDefault().getOffset(System.currentTimeMillis()) / 60_000

    /** Isi perintah `configure` buat engine — satu sumber, dipakai app & service. */
    fun toConfigureCmd(): Map<String, Any> = mapOf(
        "type" to "configure",
        "repo" to repo,
        "channel" to channel,
        "phone" to phone,
        "formatChannel" to (if (formatPertanyaan) "pertanyaan" else "teks"),
        "token" to token,
        "intervalMinutes" to intervalMinutes,
        "includePrereleases" to includePrereleases,
        "postOnFirstRun" to postOnFirstRun,
        "testMessageOnSetup" to testMessageOnSetup,
        "grupAktif" to grupAktif,
        "grupTarget" to grupTarget,
        "grupInterval" to grupInterval,
        "grupHitam" to grupHitam,
        "moderasiAktif" to moderasiAktif,
        "perintahPribadi" to perintahPribadi,
        "moderasiStrike" to moderasiStrike,
        "moderasiKata" to moderasiKata,
        "moderasiDomain" to moderasiDomain,
        "moderasiIzinkanLink" to moderasiIzinkanLink,
        "storyKe" to storyKe,
        "berkalaAktif" to berkalaAktif,
        "berkalaJam" to berkalaJam,
        "berkalaTeks" to berkalaTeks,
        "berkalaHitamSaja" to berkalaHitamSaja,
        "laguAktif" to laguAktif,
        "laguPerHari" to laguPerHari,
        "laguJamMulai" to laguJamMulai,
        "laguJamSelesai" to laguJamSelesai,
        "pertanyaanAktif" to pertanyaanAktif,
        "pertanyaanPerHari" to pertanyaanPerHari,
        "tzMenit" to tzMenit()
    )

    fun toConfigJson(): JSONObject = JSONObject()
        .put(
            "github",
            JSONObject()
                .put("repo", repo)
                .put("token", token)
                .put("includePrereleases", includePrereleases)
        )
        .put(
            "whatsapp",
            JSONObject()
                .put("channel", channel)
                .put("phone", phone)
                .put("format", if (formatPertanyaan) "pertanyaan" else "teks")
        )
        .put(
            "grup",
            JSONObject()
                .put("aktif", grupAktif)
                .put("target", grupTarget)
                .put("intervalMinutes", grupInterval)
                .put("daftarHitam", grupHitam)
        )
        .put(
            "jaga",
            JSONObject()
                .put("moderasi", moderasiAktif)
                .put("perintah", perintahPribadi)
                .put("batasStrike", moderasiStrike)
                .put("kataTerlarang", moderasiKata.split(",", "\n").map { it.trim() }.filter { it.isNotEmpty() })
                .put("linkTerlarang", moderasiDomain.split(",", "\n").map { it.trim() }.filter { it.isNotEmpty() })
                .put("izinkanLink", moderasiIzinkanLink)
                .put("storyKe", storyKe)
        )
        .put(
            "berkala",
            JSONObject()
                .put("aktif", berkalaAktif)
                .put("intervalJam", berkalaJam)
                .put("teks", berkalaTeks)
                .put("hitamSaja", berkalaHitamSaja)
        )
        .put(
            "lagu",
            JSONObject()
                .put("aktif", laguAktif)
                .put("perHari", laguPerHari)
                .put("jamMulai", laguJamMulai)
                .put("jamSelesai", laguJamSelesai)
                .put("tzMenit", tzMenit())
                // "sumber" sengaja tidak dikirim: URL Worker cuma ada di
                // bot-js/src/lagu.mjs (SUMBER_BAWAAN). Dulu ditulis dua kali dan
                // yang di sini salah subdomain, fitur lagu mati diam-diam.
        )
        .put(
            "lawak",
            JSONObject()
                .put("aktif", pertanyaanAktif)
                .put("perHari", pertanyaanPerHari)
                // Jam efektif pertanyaan sengaja diset dari sini (nggak ada UI):
                // siang-sore biar bunyinya kerasa, bukan azan.
                .put("jamMulai", 10)
                .put("jamSelesai", 21)
                .put("tzMenit", tzMenit())
        )
        .put(
            "bot",
            JSONObject()
                .put("checkIntervalMinutes", intervalMinutes)
                .put("postOnFirstRun", postOnFirstRun)
                .put("testMessageOnSetup", testMessageOnSetup)
        )
}
