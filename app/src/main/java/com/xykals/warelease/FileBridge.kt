package com.xykals.warelease

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.io.File
import java.io.RandomAccessFile
import java.nio.charset.Charset

/**
 * Jalur utama komunikasi App <-> Engine (100% file-based, pasti jalan):
 *  - Node → App : append ke events.jsonl (app polling, offset-based)
 *  - App → Node : tulis cmd.json (atomik via rename), node polling
 */
class FileBridge(
    private val dataDir: File,
    private val scope: CoroutineScope
) {
    private val eventsFile = File(dataDir, "events.jsonl")
    private val cmdFile = File(dataDir, "cmd.json")

    @Volatile
    private var offset = 0L

    var onEvent: ((JSONObject) -> Unit)? = null

    fun start() {
        // Buang perintah yang belum sempat diproses dari sesi sebelumnya.
        // Tanpa ini, cmd.json yang nggak pernah kebaca (mis. karena mesin Node
        // mati waktu perintahnya dikirim) bakal disimpan di file dan DIPROSES
        // belakangan waktu Node akhirnya jalan — jadi bot ngelakuin hal yang
        // udah nggak relevan.
        try {
            if (cmdFile.exists()) cmdFile.delete()
        } catch (_: Exception) {
        }

        scope.launch {
            while (isActive) {
                delay(300)
                try {
                    RandomAccessFile(eventsFile, "r").use { raf ->
                        val size = raf.length()
                        if (size < offset) offset = 0L // file di-rotate
                        if (size > offset) {
                            raf.seek(offset)
                            val tail = ByteArray((size - offset).toInt())
                            raf.readFully(tail)
                            val text = String(tail, Charset.forName("UTF-8"))
                            val lastNl = text.lastIndexOf('\n')
                            if (lastNl >= 0) {
                                val chunk = text.substring(0, lastNl + 1)
                                offset += chunk.toByteArray(Charset.forName("UTF-8")).size
                                for (line in chunk.split('\n')) {
                                    val t = line.trim()
                                    if (t.isEmpty()) continue
                                    try {
                                        onEvent?.invoke(JSONObject(t))
                                    } catch (_: Exception) {
                                    }
                                }
                            }
                        }
                    }
                } catch (_: Exception) {
                    // file lagi di-tulis / belum ada — coba lagi tick berikutnya
                }
            }
        }
    }

    fun send(cmd: JSONObject) {
        try {
            val tmp = File(dataDir, "cmd.json.tmp")
            tmp.writeText(cmd.toString())
            if (cmdFile.exists()) cmdFile.delete()
            if (!tmp.renameTo(cmdFile)) tmp.copyTo(cmdFile, overwrite = true)
        } catch (_: Exception) {
        }
    }
}
