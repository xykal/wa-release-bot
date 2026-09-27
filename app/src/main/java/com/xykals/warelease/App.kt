package com.xykals.warelease

import android.app.Application

/**
 * Titik paling awal yang dijalankan Android.
 *
 * Tugasnya cuma satu: nyalain perekam log + penangkap crash SEBELUM activity
 * atau service apa pun jalan. Kalau dipasangnya di MainActivity, crash yang
 * kejadian waktu activity lagi dibikin nggak akan kecatat — dan justru crash
 * model gitu yang paling nyebelin.
 */
class App : Application() {
    override fun onCreate() {
        super.onCreate()
        LogRecorder.init(this)
        LogRecorder.pasangPenangkapCrash()
        android.util.Log.i("App", "log → ${LogRecorder.dir?.absolutePath ?: "(nggak ada folder)"}")
    }
}
