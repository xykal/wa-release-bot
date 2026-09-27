# 🧩 Script bot (plugin)

Mulai v1.4.0 lo bisa nambahin **perintah sendiri** ke bot pakai file JavaScript
(`.js`). Upload dari app: **Setelan → Script bot → Upload .js**.

Script jalan di **dua tempat** aja:

- grup yang dijaga (kolom *Link undangan grup* di Setelan → Penjaga grup)
- chat **"Pesan ke diri sendiri"** di WA lo — enak buat nyoba tanpa ganggu grup

> ⚠️ **Script = akses penuh.** Script jalan di dalam proses bot (Node.js 18)
> tanpa sandbox: bisa kirim pesan pakai akun WA lo, baca file bot (termasuk
> sesi WA), dan akses internet. **Cuma pasang script yang lo tulis sendiri
> atau udah lo baca & pahami isinya.**

---

## Bentuk file

Format CommonJS (`module.exports`). Minimal:

```js
module.exports = {
  nama: 'Sapa',          // nama yang tampil di app & !menu
  versi: '1.0',          // opsional
  deskripsi: 'Bales !halo', // opsional

  perintah: {
    halo: async (ctx) => {
      await ctx.balas(`Halo ${ctx.pengirim.nama || 'kak'}! 👋`);
    },
  },
};
```

- Nama perintah boleh ditulis `halo`, `!halo`, atau `.halo` — semuanya jadi `!halo`.
- Di chat, perintah boleh diawali `!`, `.`, atau `/` (`!halo`, `.halo`, `/halo`).
- Huruf besar/kecil nggak ngaruh.
- Kalau dua script punya perintah yang sama, yang **namanya duluan (urut abjad file)** menang.
- Perintah bawaan (`!info`, `!rules`, `!menu`, `!ping`) nggak bisa ditimpa.

## Isi `ctx` (buat perintah & `onPesan`)

| Nama | Isi |
|---|---|
| `ctx.balas(teks)` | Bales pesan itu (dikutip). Nunggu konfirmasi server. |
| `ctx.kirim(jid, teks)` | Kirim ke chat lain (`...@g.us`, `...@s.whatsapp.net`). |
| `ctx.perintah` | Perintahnya, mis. `'!halo'` |
| `ctx.argumen` | Kata-kata setelah perintah, dalam array: `!cari a b` → `['a','b']` |
| `ctx.sisa` | Teks setelah perintah apa adanya: `'a b'` |
| `ctx.teks` | Teks pesan lengkap |
| `ctx.pengirim` | `{ id, nama, nomor }` — `nomor` bisa kosong / ID samaran di grup LID |
| `ctx.adalahAdmin` | `true` kalau pengirimnya admin grup (atau lo sendiri) |
| `ctx.dariSaya` | `true` kalau yang ngirim akun lo sendiri |
| `ctx.diGrup` / `ctx.chatSendiri` | Pesannya dari grup atau chat diri sendiri |
| `ctx.grup` | `{ jid, nama }` grup yang dijaga (atau `null`) |
| `ctx.simpan(kunci, nilai)` / `ctx.ambil(kunci)` | Simpenan kecil per script (masuk `state.json`, tahan restart). Jangan buat data gede. |
| `ctx.log(teks)` | Nulis ke kartu Log app |
| `ctx.pesan` | Objek pesan mentah dari Baileys (buat yang ngerti) |
| `ctx.sock` | Socket Baileys 6.7.24 mentah (buat yang ngerti — hati-hati) |

## Hook opsional

```js
module.exports = {
  nama: 'Penjaga promo',
  // Tiap pesan BIASA (bukan perintah) di grup / chat sendiri.
  onPesan: async (ctx) => {
    if (/wa\.me\/|chat\.whatsapp\.com/i.test(ctx.teks) && !ctx.adalahAdmin) {
      await ctx.balas('⚠️ Promosi wajib izin admin dulu ya.');
    }
  },
  // Tiap putaran jaga grup (ikut jadwal mode aktivitas).
  onJadwal: async (ctx) => {
    // ctx: grup, kirim(jid, teks), kirimKeGrup(teks), simpan, ambil, log, sock
  },
  // Sekali pas script dimuat.
  onMuat: ({ log }) => log('siap!'),
};
```

> `onPesan` di script: `ctx.adalahAdmin` cuma `true` buat pesan dari lo sendiri
> (ngecek admin tiap pesan biasa terlalu boros).

## Batasan

- Tiap perintah / hook maksimal **15 detik**. Lebih dari itu dianggap gagal (dicatat di Log).
- Ukuran file maksimal **512 KB**. Cuma satu file — `require()` modul npm luar nggak bisa
  (yang ada cuma modul bawaan Node: `fs`, `path`, `crypto`, `https`, dll).
- Anti-spam bawaan: satu orang maksimal 1 perintah / 4 detik.
- Pesan yang masuk pas bot lagi tidur tetap diproses pas bot bangun, asal belum lewat **1 jam**.
  Seberapa cepat dibalas tergantung **mode aktivitas** (Realtime = langsung, Berkala = pas jadwal, dst).
- Script error pas dimuat → tampil ⚠️ di Setelan → Script bot, script lain tetap jalan.

## Ganti / hapus

- Upload file dengan **nama yang sama** → gantiin yang lama, langsung dimuat ulang.
- Tombol **Hapus** di tiap script.
- Filenya ada di folder internal app (`files/wa_release_bot/plugins/`), nggak bisa dibuka file manager.

## Contoh lengkap

Tombol **Contoh** di Setelan → Script bot nampilin contoh yang bisa langsung disalin
(`!halo`, `!jam`, `!catat`).
