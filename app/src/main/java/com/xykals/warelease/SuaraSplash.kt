package com.xykals.warelease

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer

/**
 * Voice over pembuka: "XyVerse Technology Global" (`res/raw/vo_xyverse.ogg`).
 *
 * Aturan yang dipilih kall (2026-09-30): bunyi **sekali** pas pertama buka
 * setelah pasang, setelah itu diam sendiri kecuali saklarnya dinyalain lagi
 * (lihat kartu Tampilan & suara di tab Pengaturan). Mode senyap dihormati:
 * kalau HP-nya silent, suaranya dilewati dan bendera "sudah pernah bunyi"
 * TIDAK dipasang, jadi masih kebagian pas HP-nya nggak silent.
 *
 * Pemutarannya sengaja tidak dipotong pas splash ditutup (durasi 2,6 dtk,
 * splash minimal 1,6 dtk) — kalau dipotong, kalimatnya jadi kepotong juga.
 */
internal object SuaraSplash {

    private var pemutar: MediaPlayer? = null

    /** @return true kalau suaranya benar-benar diputar. */
    fun putar(ctx: Context, settings: SettingsStore): Boolean {
        if (!settings.suaraSplash || settings.voSudahMain) return false
        val audio = ctx.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
        if (audio?.ringerMode == AudioManager.RINGER_MODE_SILENT) {
            LogRecorder.tulis("Splash", "voice over dilewati: HP lagi mode senyap")
            return false
        }
        return try {
            hentikan()
            val mp = MediaPlayer.create(ctx, R.raw.vo_xyverse)
            if (mp == null) {
                LogRecorder.tulis("Splash", "voice over nggak bisa dimuat (res/raw/vo_xyverse.ogg)")
                return false
            }
            mp.setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build()
            )
            mp.setVolume(1f, 1f)
            mp.setOnCompletionListener { selesai() }
            mp.setOnErrorListener { _, _, _ ->
                LogRecorder.tulis("Splash", "voice over berhenti karena galat pemutar")
                selesai()
                true
            }
            mp.start()
            pemutar = mp
            // ditandai setelah benar-benar mulai: kalau gagal, masih dicoba lain kali
            settings.voSudahMain = true
            LogRecorder.tulis("Splash", "voice over diputar (${mp.duration} ms)")
            true
        } catch (e: Throwable) {
            LogRecorder.galat("Splash", "voice over gagal diputar", e)
            false
        }
    }

    /** Lepas pemutarnya (dipanggil pas activity hancur). */
    fun hentikan() {
        pemutar?.runCatching {
            if (isPlaying) stop()
            release()
        }
        pemutar = null
    }

    private fun selesai() {
        pemutar?.runCatching { release() }
        pemutar = null
    }
}
