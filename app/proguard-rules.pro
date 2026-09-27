# ============================================================================
#  ProGuard/R8 — aturan keep untuk wa-release-bot
#
#  R8 me-rename class dan method jadi nama pendek (a, b, c, ...) dan membuang
#  yang nggak kepakai. Itu bagus buat ukuran APK, tapi berbahaya kalau ada
#  bagian yang manggil kode LEWAT NAMA (string), bukan lewat referensi langsung
#  di kode. Yang di-rename tapi masih dicari pakai nama lama = crash di HP.
#
#  Di aplikasi ini, yang manggil lewat nama cuma empat:
#    1. JNI  — native-lib.cpp nyari Java_com_xykals_warelease_NodeBridge_startNode
#    2. WorkManager — bikin ulang worker dari nama class yang disimpan di DB
#    3. Android (sistem) — Application/Activity/Service/Receiver dari AndroidManifest
#    4. androidx (Consumer rules bawaan library) — diurus library-nya sendiri
#
#  Selain empat itu, semuanya aman di-rename: bridge ke Node lewat FILE
#  (events.jsonl / cmd.json), bukan lewat nama class. Nggak ada
#  addJavascriptInterface, nggak ada reflection, nggak ada Class.forName.
#  Jadi daftar keep-nya sengaja pendek.
# ============================================================================

# ----------------------------------------------------------------------------
# 1) JNI
# ----------------------------------------------------------------------------
# NodeBridge.startNode() adalah `external fun` → dipanggil dari C++.
# Nama class DAN nama method-nya harus tetap, karena JNI nyari simbol
# Java_<paket>_<class>_<method>. Di-rename sedikit saja → UnsatisfiedLinkError.
-keep class com.xykals.warelease.NodeBridge {
    native <methods>;
}

# ----------------------------------------------------------------------------
# 2) WorkManager
# ----------------------------------------------------------------------------
# WorkManager menyimpan NAMA CLASS worker di database-nya, lalu bikin ulang
# pakai reflection. Kalau namanya berubah antar versi, work yang sudah
# terjadwal (watchdog bot) nggak bisa dipulihkan lagi.
-keep class * extends androidx.work.ListenableWorker {
    public <init>(android.content.Context, androidx.work.WorkerParameters);
}

# ----------------------------------------------------------------------------
# 3) Komponen Android dari manifest
# ----------------------------------------------------------------------------
# Activity/Service/Receiver di-instansiasi oleh SISTEM lewat nama class dari
# AndroidManifest. AGP sebenarnya sudah otomatis bikin aturan ini, tapi ditulis
# eksplisit biar kalau suatu saat manifest-nya berubah, tetap aman.
-keep class com.xykals.warelease.App { *; }
-keep class com.xykals.warelease.MainActivity { *; }
-keep class com.xykals.warelease.BotService { *; }
-keep class com.xykals.warelease.BootReceiver { *; }
-keep class com.xykals.warelease.BotWatchdogWorker { *; }

# ----------------------------------------------------------------------------
# 4) Info buat debugging
# ----------------------------------------------------------------------------
# Simpan nomor baris + nama file asli, supaya stack trace dari HP masih bisa
# dibaca. Dipakai bareng mapping.txt (di-upload sebagai artifact CI).
# Catatan: mapping.txt-nya tetap diperlukan buat menerjemahkan nama class.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Jangan hapus anotasi + signature generik: dipakai library (coroutines,
# okhttp) buat baca informasi tipe saat runtime.
-keepattributes *Annotation*, Signature, InnerClasses, EnclosingMethod

# ----------------------------------------------------------------------------
# 5) Peringatan yang nggak perlu (class opsional yang memang nggak dipakai)
# ----------------------------------------------------------------------------
# OkHttp punya jalur opsional ke BouncyCastle/Conscrypt/OpenJSSE buat TLS
# alternatif. Di Android kita pakai TLS bawaan sistem, jadi class itu memang
# nggak ada — dan R8 bakal ngeluh kalau nggak dibisukan.
-dontwarn okhttp3.internal.platform.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**
-dontwarn javax.annotation.**
