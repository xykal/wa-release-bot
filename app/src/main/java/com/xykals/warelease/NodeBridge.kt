package com.xykals.warelease

import android.os.Build
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Jembatan ke native: menjalankan Node.js (nodejs-mobile) di thread khusus.
 * Native-nya (native-lib.cpp) memanggil node::Start() dari libnode.so.
 *
 * ---------------------------------------------------------------------------
 *  ⚠️ System.loadLibrary() — INI WAJIB, DAN SEMPAT KELUPAAN
 * ---------------------------------------------------------------------------
 *  APK-nya berisi dua file native:
 *      lib/<abi>/libnode.so         mesin Node.js-nya sendiri
 *      lib/<abi>/libnodebridge.so   pembungkus JNI kecil yang manggil node::Start()
 *
 *  Punya file-nya di dalam APK itu TIDAK cukup. Android baru menautkan
 *  (link) sebuah .so kalau ada yang memintanya lewat System.loadLibrary().
 *  Tanpa itu, waktu `startNode()` dipanggil, JVM nggak nemu implementasinya
 *  dan melempar:
 *
 *      java.lang.UnsatisfiedLinkError: No implementation found for int
 *      com.xykals.warelease.NodeBridge.startNode(...)
 *      - is the library loaded, e.g. System.loadLibrary?
 *
 *  Persis itu yang kejadian: app-nya jalan, tombolnya bisa ditekan, tapi
 *  mesin Node-nya nggak pernah nyala — jadi QR nggak muncul, setup nggak
 *  jalan, posting nggak jalan. Semua fitur bot mati dengan error yang
 *  kelihatan "aneh" karena pesannya nyaranin hal yang emang bener.
 *
 *  Ini juga alasan tidak ada tes lokal yang bisa nangkep: build-nya sukses
 *  (CMake nemu libnode.so, .so-nya ikut ke-package), dan isi APK-nya bener.
 *  Yang salah cuma satu baris yang nggak pernah ditulis.
 *
 *  Sekarang ada dua penjaga di CI supaya nggak kejadian lagi:
 *    1. `readelf` memastikan libnodebridge.so punya simbol
 *       Java_com_xykals_warelease_NodeBridge_startNode.
 *    2. grep memastikan baris loadLibrary di bawah masih ada.
 */
object NodeBridge {

    private var thread: Thread? = null

    private val libSiap = AtomicBoolean(false)

    val isAlive: Boolean
        get() = thread?.isAlive == true

    @Synchronized
    fun start(scriptPath: String, env: Map<String, String>) {
        if (isAlive) return
        val t = Thread({
            try {
                muatPerpustakaan()

                val kode = startNode(scriptPath, env, true)

                // Node cuma balik ke sini kalau event loop-nya berhenti
                // (mis. `process.exit()` di bundle, atau libnode-nya ngamuk).
                LogRecorder.galat("NodeBridge", "proses Node berhenti sendiri (exit $kode)", null)
                BotBus.publish {
                    engineError = "Engine Node berhenti (exit $kode). Lihat log, lalu tekan Mulai."
                }
            } catch (e: UnsatisfiedLinkError) {
                val pesan = pesanLibGagal(e)
                LogRecorder.galat("NodeBridge", pesan, e)
                BotBus.publish { engineError = pesan }
            } catch (t: Throwable) {
                LogRecorder.galat("NodeBridge", "thread Node mati", t)
                BotBus.publish { engineError = "Engine Node gagal jalan: ${t.message}" }
            }
        }, "wa-bot-node")
        t.start()
        thread = t
    }

    /**
     * Muat kedua library native.
     *
     * Dipanggil dari dalam thread Node, BUKAN dari thread utama: libnode.so
     * itu 45 MB, memuatnya butuh ratusan milidetik — kalau di thread utama,
     * layarnya nge-freeze.
     *
     * URUTANNYA PENTING. libnodebridge.so punya DT_NEEDED ke libnode.so
     * (lihat: readelf -d libnodebridge.so). Jadi libnode.so dimuat dulu.
     */
    private fun muatPerpustakaan() {
        if (libSiap.get()) return

        LogRecorder.tulis(
            "NodeBridge",
            "memuat libnode.so + libnodebridge.so (ABI HP: ${Build.SUPPORTED_ABIS.joinToString()})"
        )
        System.loadLibrary("node")        // libnode.so
        System.loadLibrary("nodebridge")  // libnodebridge.so
        libSiap.set(true)

        LogRecorder.tulis("NodeBridge", "kedua library native siap")
    }

    private fun pesanLibGagal(e: UnsatisfiedLinkError): String {
        val abi = Build.SUPPORTED_ABIS.firstOrNull() ?: "?"
        return "Mesin Node nggak bisa dimuat di HP ini (ABI: $abi). " +
                "Biasanya karena APK yang dipasang nggak cocok sama HP-nya — " +
                "coba pasang wa-release-bot-armeabi-v7a-release.apk. " +
                "Detail: ${e.message}"
    }

    private external fun startNode(
        scriptPath: String,
        env: Map<String, String>,
        redirectLogcat: Boolean
    ): Int
}
