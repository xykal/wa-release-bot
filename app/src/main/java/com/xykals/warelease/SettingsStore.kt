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

    var autoStartOnBoot: Boolean
        get() = p.getBoolean("boot", false)
        set(v) = p.edit().putBoolean("boot", v).apply()

    fun hasValidSettings(): Boolean = repo.isNotBlank() && channel.isNotBlank()

    fun toConfigJson(): JSONObject = JSONObject()
        .put(
            "github",
            JSONObject()
                .put("repo", repo)
                .put("token", token)
                .put("includePrereleases", includePrereleases)
        )
        .put("whatsapp", JSONObject().put("channel", channel))
        .put(
            "bot",
            JSONObject()
                .put("checkIntervalMinutes", intervalMinutes)
                .put("postOnFirstRun", postOnFirstRun)
                .put("testMessageOnSetup", testMessageOnSetup)
        )
}
