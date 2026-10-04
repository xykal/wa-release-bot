package com.xykals.warelease

/**
 * Bawaan yang berpengaruh ke janji "bot tidur" dikumpulkan di sini supaya
 * bisa diuji tanpa Android Context. Semua fitur yang menahan koneksi WhatsApp
 * wajib opt-in; instalasi baru hanya menjalankan pemantau release.
 */
internal object PengaturanBawaan {
    const val PERINTAH_PRIBADI = false
    const val MODERASI = false
    const val LAGU = false
    // Pertanyaan mood (ngejoks) — opt-in juga, isi banknya lokal di HP.
    const val LAWAK = false
    const val PENJAGA_GRUP = false
    const val PESAN_BERKALA = false
    const val REKAM_LOGCAT = false
}
