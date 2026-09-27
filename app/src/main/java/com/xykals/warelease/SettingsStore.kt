package com.xykals.warelease

import android.content.Context
import org.json.JSONObject

/** Setting app (SharedPreferences) */
class SettingsStore(ctx: Context) {

    private val p = ctx.getSharedPreferences("wa_release_bot", Context.MODE_PRIVATE)

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
        get() = p.getBoolean("formatTanya", true)
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
        get() = p.getBoolean("grupAktif", false)
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

    // ---- batre ----
    var rekamLogcat: Boolean
        get() = p.getBoolean("rekamLogcat", true)
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
        repo.isNotBlank() || (grupAktif && grupTarget.isNotBlank())

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
        "grupHitam" to grupHitam
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
            "bot",
            JSONObject()
                .put("checkIntervalMinutes", intervalMinutes)
                .put("postOnFirstRun", postOnFirstRun)
                .put("testMessageOnSetup", testMessageOnSetup)
        )
}
