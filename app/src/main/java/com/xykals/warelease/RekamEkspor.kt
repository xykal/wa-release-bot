package com.xykals.warelease

import java.io.File

/** Pilih direktori media utama yang dimiliki app untuk salinan rekaman channel. */
internal fun folderEksporRekam(mediaDirs: Array<out File?>): File? =
    mediaDirs.filterNotNull().firstOrNull()?.let { File(it, "rekaman") }
