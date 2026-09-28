package com.xykals.warelease

import android.content.Context
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PathMeasure
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import android.os.SystemClock
import android.util.AttributeSet
import android.view.View
import android.view.animation.OvershootInterpolator
import androidx.core.content.ContextCompat
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin

/**
 * Animasi splash: satu siluet yang terus MORPH
 *   bot → gelembung chat → not lagu → gear (otomatis) → bot → …
 *
 * Caranya: tiap bentuk dibikin sebagai [Path] biasa (gabungan beberapa
 * bentuk pakai Path.op UNION), terus kelilingnya di-sampel jadi N titik yang
 * jaraknya rata. Morph = interpolasi titik ke titik. Titik awal tiap bentuk
 * disamain (yang paling dekat arah jam 12) & arahnya disamain (searah jarum
 * jam) biar morph-nya mulus, nggak "melintir".
 *
 * Hiasan (mata bot, titik-titik ngetik, lubang gear) digambar terpisah dan
 * cuma muncul pas bentuknya lagi diam.
 *
 * Semua digambar pakai Canvas — tanpa library, tanpa file animasi.
 */
class MorphView @JvmOverloads constructor(
    ctx: Context,
    attrs: AttributeSet? = null,
) : View(ctx, attrs) {

    /** Dipanggil tiap ganti bentuk (0 bot, 1 chat, 2 lagu, 3 otomatis). */
    var onGantiBentuk: ((Int) -> Unit)? = null

    private val jumlahTitik = 360 // makin banyak makin mulus lengkungnya
    private val bentuk: List<FloatArray> = listOf(bikinBot(), bikinChat(), bikinNada(), bikinGear())
    private val sekarang = FloatArray(jumlahTitik * 2)
    private val gearPutar = FloatArray(jumlahTitik * 2)
    private val jalur = Path()
    private val lentur = OvershootInterpolator(1.3f)

    private val diam = 420L
    private val ubah = 560L
    private val satuBentuk = diam + ubah

    private var mulaiPada = 0L
    private var bentukTerakhir = -1

    private val warnaHijau = ContextCompat.getColor(ctx, R.color.wr_hijau)
    private val warnaTerang = ContextCompat.getColor(ctx, R.color.wr_hijau_terang)
    private val warnaLatar = ContextCompat.getColor(ctx, R.color.wr_latar)

    private val catIsi = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val catHalo = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val catHias = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL; color = warnaLatar }
    private val oval = RectF()
    private val posisiMata = floatArrayOf(76f, 124f)

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        mulaiPada = SystemClock.uptimeMillis()
        bentukTerakhir = -1
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        val r = min(w, h) / 2f
        catIsi.shader = LinearGradient(
            w / 2f - r, h / 2f - r, w / 2f + r, h / 2f + r,
            warnaTerang, warnaHijau, Shader.TileMode.CLAMP,
        )
        catHalo.shader = RadialGradient(
            w / 2f, h / 2f, r,
            intArrayOf(0x5525D366, 0x1825D366, 0x0025D366), floatArrayOf(0f, 0.55f, 1f),
            Shader.TileMode.CLAMP,
        )
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        if (width == 0 || height == 0) return
        // drawingTime = waktu vsync frame ini (bukan jam "sekarang") → gerak rata, nggak patah-patah
        val t = (drawingTime - mulaiPada).coerceAtLeast(0L)
        val putaran = (t / satuBentuk).toInt()
        val ke = putaran % bentuk.size
        val lokal = t % satuBentuk
        val lagiUbah = lokal >= diam
        val u = if (lagiUbah) lentur.getInterpolation((lokal - diam).toFloat() / ubah) else 0f
        val tujuan = (ke + 1) % bentuk.size

        // tulisan ganti pas morph MULAI (bareng bentuk baru kebentuk), bukan telat
        val tampil = if (lagiUbah) tujuan else ke
        if (tampil != bentukTerakhir) {
            bentukTerakhir = tampil
            onGantiBentuk?.invoke(tampil)
        }

        // gear muter pelan terus (termasuk pas lagi morph dari/ke gear)
        val sudut = t / 900f
        val cs = cos(sudut)
        val sn = sin(sudut)
        val g = bentuk[3]
        for (k in 0 until jumlahTitik) {
            val x = g[2 * k]
            val y = g[2 * k + 1]
            gearPutar[2 * k] = x * cs - y * sn
            gearPutar[2 * k + 1] = x * sn + y * cs
        }
        val a = if (ke == 3) gearPutar else bentuk[ke]
        val b = if (tujuan == 3) gearPutar else bentuk[tujuan]
        for (i in sekarang.indices) sekarang[i] = a[i] + (b[i] - a[i]) * u

        val cx = width / 2f
        val cy = height / 2f
        val napas = 1f + 0.025f * sin(t / 260f)
        val s = min(width, height) / 2f * 0.72f * napas

        canvas.drawCircle(cx, cy, min(width, height) / 2f, catHalo)

        jalur.reset()
        jalur.moveTo(cx + sekarang[0] * s, cy + sekarang[1] * s)
        for (k in 1 until jumlahTitik) jalur.lineTo(cx + sekarang[2 * k] * s, cy + sekarang[2 * k + 1] * s)
        jalur.close()
        canvas.drawPath(jalur, catIsi)

        // hiasan: muncul pas diam, ilang cepet begitu mulai morph
        val alfa = if (!lagiUbah) 1f else (1f - (lokal - diam).toFloat() / (ubah * 0.35f)).coerceIn(0f, 1f)
        if (alfa > 0f) gambarHiasan(canvas, ke, t, alfa, cx, cy, s, sudut)

        if (isAttachedToWindow && visibility == VISIBLE) postInvalidateOnAnimation()
    }

    /** Koordinat kotak 200×200 (dipakai waktu bikin bentuk) → layar. */
    private fun px(v: Float, c: Float, s: Float) = c + (v / 100f - 1f) * s

    private fun gambarHiasan(c: Canvas, ke: Int, t: Long, alfa: Float, cx: Float, cy: Float, s: Float, sudut: Float) {
        catHias.alpha = (alfa * 255).toInt()
        val skala = s / 100f
        when (ke) {
            0 -> { // mata bot (kedip) + mulut
                val kedip = if (t % 2400 < 110) 0.15f else 1f
                for (x in posisiMata) {
                    val ex = px(x, cx, s)
                    val ey = px(108f, cy, s)
                    val r = 11f * skala
                    oval.set(ex - r, ey - r * kedip, ex + r, ey + r * kedip)
                    c.drawOval(oval, catHias)
                }
                oval.set(px(82f, cx, s), px(132f, cy, s), px(118f, cx, s), px(141f, cy, s))
                c.drawRoundRect(oval, 5f * skala, 5f * skala, catHias)
            }
            1 -> { // titik-titik "lagi ngetik…"
                for (i in 0..2) {
                    val loncat = sin((t / 140.0 - i * 0.9)).toFloat().coerceAtLeast(0f) * 7f
                    c.drawCircle(px(70f + i * 30f, cx, s), px(92f - loncat, cy, s), 9f * skala, catHias)
                }
            }
            3 -> { // lubang tengah gear + satu penanda biar kelihatan muter
                c.drawCircle(cx, cy, 24f * skala, catHias)
                val r = 44f * skala
                c.drawCircle(cx + cos(sudut) * r, cy + sin(sudut) * r, 6f * skala, catHias)
            }
        }
    }

    // ------------------------------------------------------------ bentuk
    // Semua digambar di kotak 200×200, titik tengah (100,100).

    private fun gabung(vararg p: Path): Path {
        val hasil = Path(p[0])
        for (i in 1 until p.size) hasil.op(p[i], Path.Op.UNION)
        return hasil
    }

    private fun kotakBulat(l: Float, t: Float, r: Float, b: Float, rad: Float) =
        Path().apply { addRoundRect(RectF(l, t, r, b), rad, rad, Path.Direction.CW) }

    private fun bulat(x: Float, y: Float, r: Float) =
        Path().apply { addCircle(x, y, r, Path.Direction.CW) }

    private fun poligon(vararg xy: Float) = Path().apply {
        moveTo(xy[0], xy[1])
        var i = 2
        while (i < xy.size) { lineTo(xy[i], xy[i + 1]); i += 2 }
        close()
    }

    private fun bikinBot() = sampel(
        gabung(
            kotakBulat(40f, 62f, 160f, 162f, 30f), // kepala
            kotakBulat(96f, 34f, 104f, 66f, 4f), // antena
            bulat(100f, 30f, 11f),
            kotakBulat(26f, 96f, 44f, 128f, 7f), // kuping
            kotakBulat(156f, 96f, 174f, 128f, 7f),
        ),
    )

    private fun bikinChat() = sampel(
        gabung(
            kotakBulat(28f, 44f, 172f, 142f, 34f),
            poligon(52f, 128f, 40f, 172f, 98f, 136f),
        ),
    )

    private fun bikinNada() = sampel(
        gabung(
            bulat(68f, 146f, 23f),
            bulat(142f, 128f, 23f),
            kotakBulat(81f, 50f, 91f, 148f, 3f),
            kotakBulat(155f, 32f, 165f, 130f, 3f),
            poligon(81f, 50f, 165f, 32f, 165f, 58f, 81f, 76f),
        ),
    )

    private fun bikinGear(): FloatArray {
        val xy = ArrayList<Float>()
        val gigi = 8
        for (i in 0 until gigi) {
            val dasar = i * 2 * PI / gigi - PI / 2
            for ((r, geser) in listOf(66.0 to -0.30, 86.0 to -0.17, 86.0 to 0.17, 66.0 to 0.30)) {
                xy.add((100 + r * cos(dasar + geser)).toFloat())
                xy.add((100 + r * sin(dasar + geser)).toFloat())
            }
        }
        return sampel(poligon(*xy.toFloatArray()))
    }

    /** Keliling path → N titik rata (dinormalisasi ke -1..1). */
    private fun sampel(p: Path): FloatArray {
        // ambil kontur paling panjang (hasil union mestinya cuma satu)
        val ukur = PathMeasure(p, true)
        var terpanjang = 0f
        var indeks = 0
        var i = 0
        do {
            if (ukur.length > terpanjang) { terpanjang = ukur.length; indeks = i }
            i++
        } while (ukur.nextContour())
        val pm = PathMeasure(p, true)
        repeat(indeks) { pm.nextContour() }
        val panjang = pm.length
        val n = jumlahTitik
        val out = FloatArray(n * 2)
        val pos = FloatArray(2)
        for (k in 0 until n) {
            pm.getPosTan(panjang * k / n, pos, null)
            out[2 * k] = pos[0] / 100f - 1f
            out[2 * k + 1] = pos[1] / 100f - 1f
        }
        // samain arah (searah jarum jam di layar = luas bertanda positif)
        var luas = 0f
        for (k in 0 until n) {
            val j = (k + 1) % n
            luas += out[2 * k] * out[2 * j + 1] - out[2 * j] * out[2 * k + 1]
        }
        val arah = if (luas < 0) {
            FloatArray(n * 2).also { r ->
                for (k in 0 until n) { r[2 * k] = out[2 * (n - 1 - k)]; r[2 * k + 1] = out[2 * (n - 1 - k) + 1] }
            }
        } else out
        // samain titik awal: yang paling deket arah jam 12
        var awal = 0
        var selisihMin = Float.MAX_VALUE
        for (k in 0 until n) {
            val sud = atan2(arah[2 * k + 1], arah[2 * k])
            val d = abs(sud + (PI / 2).toFloat())
            if (d < selisihMin) { selisihMin = d; awal = k }
        }
        return FloatArray(n * 2).also { r ->
            for (k in 0 until n) {
                val j = (k + awal) % n
                r[2 * k] = arah[2 * j]
                r[2 * k + 1] = arah[2 * j + 1]
            }
        }
    }
}
