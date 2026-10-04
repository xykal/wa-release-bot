// Pertanyaan ngejoks: bank pertanyaan absurd tapi "plenger" (muter di kepala,
// nggak garing, nggak cringe) buat dikirim sebagai postingan Pertanyaan di
// channel. Logika murni tanpa jaringan supaya gampang diuji unit.
//
// Filosofi bank ini (permintaan kall 2026-10-04: "anti cringe anti garing,
// super duper ultra plenger"):
//   - outer-nya absurd, dalemnya bener: begitu dipikir, ternyata muter.
//   - observasi sehari-hari (tukang parkir, kucing, nasi) — bukan tebak-tebakan
//     bapak-bapak yang jawabannya cengengesan.
//   - singkat satu-dua kalimat; tanpa setup "tau nggak sih" yang bertele-tele.
import { NAMA_BOT } from './config/brand.mjs';

/**
 * Bank pertanyaan. Satu pertanyaan satu entri. Tambah di sini saja — mesin
 * (mesin/lawak-mood.mjs) + Worker nggak perlu tahu isinya.
 */
export const BANK_LAWAK = [
  'Kalau semut ketemu Kamis, dia juga ngerasa harinya berat nggak?',
  'Kalau nasi udah jadi bubur, dia masih ngaku nasi atau udah pindah marga?',
  'Tukang parkir nggak pernah kehabisan tempat. Sebenernya dia tau apa pas kita dateng?',
  'Kalau kamu ketemu kamu yang lima menit lalu, kabur atau tanya kabar?',
  'Kenapa bantal sisi satunya selalu lebih dingin, padahal kainnya sama?',
  'Kalau air itu transparan, kenapa laut biru? Airnya minder apa gimana?',
  'Kalau bumi muter terus, kenapa pusingnya cuma pas liat pengumuman?',
  'Gajah mati ninggalin gading. Kalau kamis mati, ninggalin apa?',
  'Kalau boneka masa kecil dibuang, dia sekarang lagi ngapain ya di TPA?',
  'Kenapa kucing paham makanan dicampur, tapi pura-pura nggak kenal abis disuapin obat?',
  'Kalau "nanti" itu jam berapa sebenernya? Kok semua orang Indonesia hafal?',
  'Kalau cincin muter di jari, yang muter cincinnya apa jarinya?',
  'Ular bisa liat tanpa kelopak mata. Sombong nggak ya soal itu?',
  'Kenapa bulan terang banget, padahal dia nggak punya lampu beneran?',
  'Kalau pasir itu air yang capek, gurun berarti laut yang udah mutusin buat rebahan?',
  'Kalau kamu beli tiket balik ke masa lalu, berarti tiketnya dateng dari masa depan. Ngejelasinnya ke arsip gimana?',
  'Kenapa nomor darurat harus dijalanin kalau darurat, padahal pas darurat malah lupa nomor?',
  'Kalau TV di ruang darurat, siapa yang lagi darurat — TV-nya atau penontonnya?',
  'Nasi goreng itu nasi yang dijadiin nasi lagi. Tangan pertama yang aduk, doi oknum apa ya?',
  'Kalau semua jalan menuju Roma, kenapa kamu sampainya di warkop?',
  'Tahu itu awalnya kotak, digoreng jadi keriput. Tahu-nya tahu nggak dia kena kritik?',
  'Kalau pacar lagi tidur siang, status masih pacaran ala badan yang diem atau ala hati yang sibuk?',
  'Kenapa tukang sayur jualan pagi, tapi capeknya keliatan kayak udah sore?',
  'Kalau kipas muter buat ngademin kita, kenapa kita nggak muterin dia balik?',
  'Kalau garis tangan garis nasib, orang kidal nasibnya nyambung ke mana?',
  'Kenapa kita percaya kucing denger kita, padahal dia jawabnya cuma "meong"?',
  'Kalau dompet tipis karena nahan diri, yang tebal nahan apa?',
  'Kenapa nomor darurat rumah sakit ada, tapi yang darurat selalu jantungan duluan?',
  'Kalau kamu ketemu dirimu yang lebih tua, takut apa tanya arah?',
  'Mie instan bilang "instan". Tiga menitnya nunggu itu terasa nggak ke mereka?',
  'Kalau bensin habis, mobilnya tau nggak dia ditinggal, apa dia pikir lagi istirahat?',
  'Kenapa sandal jepit putusnya selalu di tempat yang jauh dari rumah?',
  'Kalau listrik mati, kipas kapok atau cuma istirahat ngayal?',
  'Kenapa es batu di minuman anget kerasa kebangetan, padahal dia udah kedinginan duluan?',
  'Kalau kucing meong sama manusia doang, artinya dia nyoba ngomong bahasa kita. Kapan kita belajar bahasa dia?',
  'Kalau rumah sakit itu tempat sehat, kenapa namanya rumah sakit?',
  'Kenapa kamu yakin kamu yang bangun itu kamu yang tadi tidur? Buktinya mana?',
  'Kalau tanggal merah bikin libur, tanggal hitamnya ngapain aja?',
  'Kalau guru pensiun, muridnya yang dulu nakal ikut pensiun nggak dari dosa-dosanya?',
  'Nasi padang bungkus porsinya gede karena porsinya gede, apa karena kita yang minta?',
  'Ongkos kirim kadang lebih mahal dari barangnya. Barangnya baper nggak ya?',
  'Kalau sendok ilang di dapur, biasanya nongol kalau udah beli baru. Kirain pindah?',
  'Kalau ojek nanya "mas sekalian?", sekalian apaan sebenernya dia tanya duluan?',
  'Kenapa kucing bisa tidur di mana aja, tapi kalau dipindah dikit langsung ngambek pindahan?',
  'Kalau parfum bilang "tahan 8 jam", yang ngukur siapa? Emang ada polisi parfum?',
  'Kenapa jam digital di rumah selalu beda 3 menit satu sama lain? Ada rapat tahunan nggak sih mereka?',
  'Kalau kamu udah dewasa, mobil mainan masa kecil nyadar nggak kalau udah gantian?',
  'Kenapa nasi yang disambelin itu selalu nasi terakhir, padahal bukan dia yang salah?',
  'Kalau dompetmu bisa ngomong, misinya bukan nabung tapi ngapain?',
  'Pohon jatuh di hutan tanpa saksi itu bilang deg-degan nggak?',
  'Kalau semua orang unik, bukannya jadi nggak ada yang unik?',
  'Kenapa kita percaya angka keberuntungan, padahal angkanya nggak kenal kita?',
  'Kalau karcis dibuang habis masuk wahana, wahananya tau nggak kalau sudah sah?',
  'Kentang digoreng jadi kecil dan ilang. Dipikir-pikir itu hilangnya sah apa tipu?',
  'Kalau kamu ketemu kamu yang belum jadi, kenalin dia sama hidup atau diam aja biar nggak spoiel?',
];

/** Batas panjang teks satu postingan pertanyaan (biar nggak numpuk di feed). */
export const MAKS_TANYA = 260;

/**
 * Pilih satu pertanyaan, hindari yang baru aja kekirim.
 * @param {string[]} jangan yang baru kekirim (substring persis entri bank)
 */
export function acakPertanyaanLawak(jangan = []) {
  const bebas = BANK_LAWAK.filter((q) => !jangan.includes(q));
  const kolam = bebas.length ? bebas : BANK_LAWAK;
  return kolam[Math.floor(Math.random() * kolam.length)];
}

// Ajakan: follower bisa jawab sebagai balasan privat (cuma admin yang baca).
export const AJAKAN_JAWAB = '💬 _Jawab asal-asalan boleh — jawabanmu cuma sampai ke admin._';

/**
 * Bentuk teks final: kepala SukiBot digabung judul (polanya sama dengan
 * pesanRapi), isi = satu pertanyaan. `judul` acak biar feed nggak monoton.
 */
const JUDUL = [
  'PERTANYAAN MOOD',
  'PERTANYAAN HARIAN',
  'PERTANYAAN TENGAH MALAM',
  'PERTANYAAN PLONGER PLENGER',
];

export function formatPertanyaanLawak(q) {
  const isi = String(q || '').slice(0, MAKS_TANYA).trim();
  const judul = JUDUL[Math.floor(Math.random() * JUDUL.length)];
  return [`*🦴 ${NAMA_BOT.toUpperCase()} · ${judul}*`, '', isi, '', AJAKAN_JAWAB].join('\n');
}
