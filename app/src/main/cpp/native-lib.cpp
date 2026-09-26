// ============================================================================
//  Jembatan JNI: menjalankan Node.js (nodejs-mobile) di dalam aplikasi.
//
//  Resepnya sederhana (persis yang dipakai plugin React Native-nya):
//    1. set environment variables (WR_DATA_DIR dst)
//    2. redirect stdout/stderr ke logcat (opsional)
//    3. panggil node::Start(argc, argv)  → event loop Node jalan di thread ini
//
//  Node "hidup" selama proses app hidup; bot-nya sendiri tidur-bangun
//  berdasarkan scheduler di sisi JS (bundle.cjs).
// ============================================================================

#include <jni.h>
#include <string>
#include <cstdlib>
#include <cstring>
#include <pthread.h>
#include <unistd.h>
#include <android/log.h>

#include "node.h"

static const char* ADBTAG = "WRBot";

// ---------- redirect stdout/stderr → logcat ----------

static int pipe_stdout[2];
static int pipe_stderr[2];
static pthread_t thread_stdout;
static pthread_t thread_stderr;

static void* thread_stdout_func(void*) {
    ssize_t n;
    char buf[2048];
    while ((n = read(pipe_stdout[0], buf, sizeof(buf) - 1)) > 0) {
        if (buf[n - 1] == '\n') --n;
        buf[n] = 0;
        __android_log_write(ANDROID_LOG_INFO, ADBTAG, buf);
    }
    return nullptr;
}

static void* thread_stderr_func(void*) {
    ssize_t n;
    char buf[2048];
    while ((n = read(pipe_stderr[0], buf, sizeof(buf) - 1)) > 0) {
        if (buf[n - 1] == '\n') --n;
        buf[n] = 0;
        __android_log_write(ANDROID_LOG_WARN, ADBTAG, buf);
    }
    return nullptr;
}

static int start_redirecting_stdout_stderr() {
    setvbuf(stdout, 0, _IONBF, 0);
    if (pipe(pipe_stdout) == -1) return -1;
    dup2(pipe_stdout[1], STDOUT_FILENO);

    setvbuf(stderr, 0, _IONBF, 0);
    if (pipe(pipe_stderr) == -1) return -1;
    dup2(pipe_stderr[1], STDERR_FILENO);

    if (pthread_create(&thread_stdout, 0, thread_stdout_func, 0) == -1) return -1;
    pthread_detach(thread_stdout);
    if (pthread_create(&thread_stderr, 0, thread_stderr_func, 0) == -1) return -1;
    pthread_detach(thread_stderr);
    return 0;
}

// ---------- entry point dari Kotlin ----------

// Dipanggil dari thread khusus (lihat NodeBridge.kt). BLOCKING selama node jalan.
extern "C"
JNIEXPORT jint JNICALL
Java_com_xykals_warelease_NodeBridge_startNode(
        JNIEnv* env,
        jclass /* clazz */,
        jstring scriptPath,
        jobject envMap,
        jboolean redirectLogcat) {

    // 1) environment variables
    if (envMap) {
        jclass mapClass = env->FindClass("java/util/Map");
        jmethodID entrySet = env->GetMethodID(mapClass, "entrySet", "()Ljava/util/Set;");
        jobject setObj = env->CallObjectMethod(envMap, entrySet);
        jclass setClass = env->FindClass("java/util/Set");
        jmethodID iteratorM = env->GetMethodID(setClass, "iterator", "()Ljava/util/Iterator;");
        jobject iterator = env->CallObjectMethod(setObj, iteratorM);
        jclass iterClass = env->FindClass("java/util/Iterator");
        jmethodID hasNext = env->GetMethodID(iterClass, "hasNext", "()Z");
        jmethodID next = env->GetMethodID(iterClass, "next", "()Ljava/lang/Object;");
        jclass entryClass = env->FindClass("java/util/Map$Entry");
        jmethodID getKey = env->GetMethodID(entryClass, "getKey", "()Ljava/lang/Object;");
        jmethodID getValue = env->GetMethodID(entryClass, "getValue", "()Ljava/lang/Object;");

        while (env->CallBooleanMethod(iterator, hasNext)) {
            jobject entry = env->CallObjectMethod(iterator, next);
            jstring k = (jstring) env->CallObjectMethod(entry, getKey);
            jstring v = (jstring) env->CallObjectMethod(entry, getValue);
            if (k && v) {
                const char* ks = env->GetStringUTFChars(k, 0);
                const char* vs = env->GetStringUTFChars(v, 0);
                if (ks && vs) setenv(ks, vs, 1);
                if (ks) env->ReleaseStringUTFChars(k, ks);
                if (vs) env->ReleaseStringUTFChars(v, vs);
            }
        }
    }

    // 2) redirect output ke logcat (biar gampang debug: adb logcat -s WRBot)
    if (redirectLogcat && start_redirecting_stdout_stderr() == -1) {
        __android_log_write(ANDROID_LOG_WARN, ADBTAG,
                            "Gagal redirect stdout/stderr ke logcat (fitur log tetap jalan via file)");
    }

    // 3) bangun argv — libuv/Node butuh argumen di memori kontigu
    const char* script = env->GetStringUTFChars(scriptPath, 0);
    const char* execPath = "node";
    size_t total = strlen(execPath) + strlen(script) + 2;
    char* buffer = (char*) calloc(total, 1);
    char* argv0 = buffer;
    strcpy(argv0, execPath);
    char* argv1 = argv0 + strlen(execPath) + 1;
    strcpy(argv1, script);
    char* argv[2] = { argv0, argv1 };
    int argc = 2;

    __android_log_write(ANDROID_LOG_INFO, ADBTAG,
                        (std::string("Menjalankan Node: ") + script).c_str());

    // 4) jalankan Node (blocking)
    int exit_code = node::Start(argc, argv);

    env->ReleaseStringUTFChars(scriptPath, script);
    free(buffer);

    __android_log_write(ANDROID_LOG_INFO, ADBTAG,
                        (std::string("node::Start selesai (exit " ) + std::to_string(exit_code) + ")").c_str());
    return exit_code;
}
