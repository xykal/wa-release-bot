package com.xykals.warelease

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings
import androidx.core.content.FileProvider

/**
 * Aksi yang keluar dari app ke sistem / app lain: izin batre, menu autostart
 * vendor, info aplikasi, folder log, bagikan log, clipboard, buka WhatsApp.
 * Semuanya cuma butuh Activity + cara ngasih tahu user (banner), jadi
 * dipisah dari MainActivity supaya layar utama tinggal urusan tampilan.
 */
internal class AksiSistem(
    private val a: Activity,
    private val banner: (String) -> Unit
) {
    fun bebasBatre(): Boolean = try {
        a.getSystemService(PowerManager::class.java)?.isIgnoringBatteryOptimizations(a.packageName) == true
    } catch (_: Throwable) {
        false
    }

    fun mintaIzinBatre() {
        if (bebasBatre()) {
            banner(a.getString(R.string.k_udah_dikecualikan_dari_pengoptimalan_batre))
            return
        }
        try {
            a.startActivity(
                Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
                    .setData(Uri.parse("package:${a.packageName}"))
            )
        } catch (e: Throwable) {
            LogRecorder.tulis("Batre", "dialog izin batre nggak ada: ${e.message}")
            try {
                a.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
                banner(a.getString(R.string.k_cari_wa_release_bot_pilih))
            } catch (_: Throwable) {
                bukaInfoApp()
            }
        }
    }

    /**
     * Xiaomi/Oppo/Vivo/Huawei punya menu "Autostart" sendiri. Tanpa izin itu,
     * broadcast boot nggak pernah sampai → bot nggak nyala habis restart.
     */
    fun bukaAutostart() {
        val kandidat = listOf(
            ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"),
            ComponentName("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity"),
            ComponentName("com.oplus.safecenter", "com.oplus.safecenter.permission.startup.StartupAppListActivity"),
            ComponentName("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"),
            ComponentName("com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"),
            ComponentName("com.samsung.android.lool", "com.samsung.android.sm.ui.battery.BatteryActivity")
        )
        for (c in kandidat) {
            try {
                a.startActivity(Intent().setComponent(c).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                LogRecorder.tulis("Autostart", "kebuka: ${c.packageName}")
                banner(a.getString(R.string.k_cari_wa_release_bot_lalu))
                return
            } catch (_: Throwable) {
            }
        }
        bukaInfoApp()
        banner(a.getString(R.string.k_menu_autostart_khusus_nggak_ketemu))
    }

    fun bukaInfoApp() {
        try {
            a.startActivity(
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).setData(Uri.parse("package:${a.packageName}"))
            )
        } catch (_: Throwable) {
        }
    }

    fun bukaFolderLog() {
        val d = LogRecorder.dir
        if (d == null) {
            banner(a.getString(R.string.k_folder_log_nggak_kebaca_di))
            return
        }
        try {
            a.startActivity(
                Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(Uri.parse("file://${d.absolutePath}"), "resource/folder")
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
            )
            return
        } catch (e: Throwable) {
            LogRecorder.tulis("Log", "nggak ada file manager yang bisa buka folder: ${e.message}")
        }
        salin(d.absolutePath)
        a.lembar(
            a.getString(R.string.k_folder_log),
            a.getString(R.string.k_file_manager_di_hp_ini, d.absolutePath),
            null,
            Tombol(a.getString(R.string.k_oke), Gaya.UTAMA)
        )
    }

    fun kirimLog() {
        val d = LogRecorder.dir
        if (d == null) {
            banner(a.getString(R.string.k_folder_log_nggak_kebaca))
            return
        }
        val berkas = d.listFiles(java.io.FileFilter { f -> f.isFile && f.name.contains(".log") })
            ?.sortedBy { it.name } ?: emptyList()
        if (berkas.isEmpty()) {
            banner(a.getString(R.string.k_belum_ada_file_log))
            return
        }
        val uris = ArrayList<Uri>()
        for (f in berkas) {
            try {
                uris.add(FileProvider.getUriForFile(a, "${a.packageName}.fileprovider", f))
            } catch (e: Throwable) {
                LogRecorder.galat("Log", "file ${f.name} nggak bisa dibagikan", e)
            }
        }
        if (uris.isEmpty()) {
            banner(a.getString(R.string.k_nggak_bisa_nyiapin_file_log))
            return
        }
        val kirim = Intent(Intent.ACTION_SEND_MULTIPLE).apply {
            type = "text/plain"
            putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris)
            putExtra(Intent.EXTRA_SUBJECT, a.getString(R.string.k_log_wa_release_bot))
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            val cd = ClipData.newUri(a.contentResolver, "log", uris[0])
            for (u in uris.drop(1)) cd.addItem(ClipData.Item(u))
            clipData = cd
        }
        LogRecorder.tulis("Log", "bagikan ${berkas.size} file log")
        a.startActivity(Intent.createChooser(kirim, a.getString(R.string.k_kirim_log_ke)))
    }

    fun salin(teks: String) {
        try {
            (a.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager)
                .setPrimaryClip(ClipData.newPlainText("wa-release-bot", teks))
        } catch (_: Throwable) {
        }
    }

    fun bukaWhatsApp() {
        for (pkg in listOf("com.whatsapp", "com.whatsapp.w4b")) {
            val i = a.packageManager.getLaunchIntentForPackage(pkg) ?: continue
            try {
                a.startActivity(i)
                return
            } catch (_: Throwable) {
            }
        }
        banner(a.getString(R.string.k_whatsapp_nggak_ketemu_di_hp))
    }
}
