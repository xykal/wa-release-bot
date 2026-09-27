// ============================================================================
//  Baca "target channel" yang diketik user di app → JID yang bisa dikirimi.
//
//  Kenapa file ini ada: field "Channel WA" dulu cuma nerima @username / JID,
//  dan buat @username dipakai `sock.onWhatsApp()` — itu buat nyari NOMOR HP,
//  bukan channel. Jadi ngetik @username channel dijamin gagal.
//
//  Yang beneran bisa dipakai engine ini (Baileys 6.7.24) cuma dua kunci:
//    1. invite code — dari link channel: https://whatsapp.com/channel/<kode>
//    2. JID channel  — <angka>@newsletter
//  Nggak ada pencarian lewat username. Daripada nebak-nebak, yang nggak bisa
//  ditolak dengan pesan yang jelas + cara benerinnya.
//
//  Bonus: grup WA juga bisa dipakai jadi target (JID @g.us atau link undangan
//  grup). Kadang lebih gampang daripada bikin channel.
//
//  File ini SENGAJA nggak import apa-apa supaya bisa dites tanpa install
//  Baileys (lihat test/unit.test.mjs).
// ============================================================================

export const JENIS = {
    JID: 'jid', // sudah berupa JID channel: 123...@newsletter
    INVITE: 'invite', // kode undangan channel (dari link)
    GRUP: 'grup', // JID grup: 123...@g.us
    LINK_GRUP: 'link-grup', // link undangan grup: chat.whatsapp.com/<kode>
    USERNAME: 'username', // @nama — TIDAK didukung engine ini
    SALAH: 'salah', // nggak kebaca
};

/**
 * Terjemahkan input user jadi { jenis, nilai }.
 * Nggak manggil jaringan — murni baca teks, jadi gampang dites.
 *
 * @param {string} input
 * @returns {{jenis: string, nilai: string, pesan?: string}}
 */
export function bacaTarget(input) {
    const asli = String(input ?? '').trim();
    if (!asli) return { jenis: JENIS.SALAH, nilai: '', pesan: 'Channel WA masih kosong.' };

    // buang <> kalau user copy-paste dari tempat yang nambahin kurung siku
    let t = asli.replace(/^<|>$/g, '').trim();
    // buang protokol + www + trailing slash, biar matching-nya sederhana
    t = t.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '');

    // 1. link channel: whatsapp.com/channel/<kode>
    const mChannel = t.match(/^whatsapp\.com\/channel\/([A-Za-z0-9_-]+)/i);
    if (mChannel) return { jenis: JENIS.INVITE, nilai: mChannel[1] };

    // 2. link undangan grup: chat.whatsapp.com/<kode>
    const mGrup = t.match(/^chat\.whatsapp\.com\/([A-Za-z0-9_-]+)/i);
    if (mGrup) return { jenis: JENIS.LINK_GRUP, nilai: mGrup[1] };

    // 3. JID langsung
    if (/^\d+@newsletter$/i.test(t)) return { jenis: JENIS.JID, nilai: t };
    if (/^\d+@g\.us$/i.test(t)) return { jenis: JENIS.GRUP, nilai: t };

    // 4. angka doang — hampir pasti JID yang kurang akhiran
    if (/^\d{10,}$/.test(t)) {
        return {
            jenis: JENIS.SALAH,
            nilai: t,
            pesan:
                `"${t}" itu angka doang. Kalau itu JID channel, tulis lengkap dengan akhirannya: ` +
                `${t}@newsletter (channel) atau ${t}@g.us (grup).`,
        };
    }

    // 5. kode undangan channel yang ditempel tanpa link.
    //    Kode channel WhatsApp selalu diawali "00" dan panjang.
    if (/^00[0-9A-Za-z_-]{15,}$/.test(t)) return { jenis: JENIS.INVITE, nilai: t };

    // 6. username — bentuknya @nama atau nama polos
    const polos = t.startsWith('@') ? t.slice(1) : t;
    if (/^[A-Za-z0-9._-]{1,40}$/.test(polos) && /[A-Za-z_]/.test(polos)) {
        return { jenis: JENIS.USERNAME, nilai: `@${polos}` };
    }

    return {
        jenis: JENIS.SALAH,
        nilai: t,
        pesan: `"${asli}" nggak kebaca sebagai channel, grup, atau link.`,
    };
}

/**
 * Pesan bantuan kalau user ngasih username. Dipakai di dua tempat (setup &
 * test) supaya kalimatnya konsisten.
 */
export function pesanCaraIsiChannel(username) {
    return (
        `Username channel (${username}) nggak bisa dipakai di engine versi ini — ` +
        'WhatsApp nggak nyediain pencarian channel lewat username di API yang dipakai.\n\n' +
        'Ganti pakai salah satu ini:\n' +
        '  • LINK channel — buka channel-nya di WA → ⋯ → Bagikan → salin link-nya\n' +
        '    (bentuknya https://whatsapp.com/channel/0029...)\n' +
        '  • JID channel — <angka>@newsletter\n' +
        '  • atau pakai GRUP WA: JID <angka>@g.us / link chat.whatsapp.com/...\n' +
        '  • atau tekan tombol "Bikin Channel" di app — bot yang bikinin channel-nya.'
    );
}

/**
 * Ubah target jadi JID. Butuh socket yang sudah terhubung ke WhatsApp.
 *
 * @param {any} sock socket Baileys yang sudah open
 * @param {string} input isi field "Channel WA"
 * @param {(m: string) => void} [log]
 * @returns {Promise<{jid: string, nama: string|null, jenis: string, invite?: string|null}>}
 */
export async function resolveTarget(sock, input, log = () => { }) {
    const t = bacaTarget(input);

    switch (t.jenis) {
        case JENIS.JID: {
            const meta = await newsMeta(sock, 'jid', t.nilai, log);
            if (!meta) {
                throw new Error(
                    `Channel ${t.nilai} nggak ketemu. Cek lagi JID-nya, atau pakai link channel-nya.`
                );
            }
            return hasil(meta, t.nilai, JENIS.JID);
        }

        case JENIS.INVITE: {
            const meta = await newsMeta(sock, 'invite', t.nilai, log);
            if (!meta?.id) {
                throw new Error(
                    'Link channel-nya nggak kebaca. Pastikan link-nya masih aktif ' +
                    '(buka channel → ⋯ → Bagikan → Salin link) lalu tempel ulang.'
                );
            }
            return hasil(meta, meta.id, JENIS.JID);
        }

        case JENIS.GRUP: {
            const g = await sock.groupMetadata(t.nilai);
            if (!g?.id) throw new Error(`Grup ${t.nilai} nggak ketemu, atau bot-nya bukan anggota.`);
            return { jid: g.id, nama: g.subject || null, jenis: JENIS.GRUP };
        }

        case JENIS.LINK_GRUP: {
            const g = await sock.groupGetInviteInfo(t.nilai);
            if (!g?.id) throw new Error('Link undangan grup-nya nggak kebaca / sudah kadaluarsa.');
            return { jid: g.id, nama: g.subject || null, jenis: JENIS.GRUP };
        }

        case JENIS.USERNAME:
            throw new Error(pesanCaraIsiChannel(t.nilai));

        default:
            throw new Error(t.pesan || 'Channel WA belum diisi dengan benar.');
    }
}

/** Bikin channel baru dari nomor yang lagi login. Balikannya JID channel. */
export async function bikinChannel(sock, nama, deskripsi = '') {
    const meta = await sock.newsletterCreate(nama, deskripsi || null);
    if (!meta?.id) {
        throw new Error('WhatsApp nggak ngasih balasan pas bikin channel. Coba lagi sebentar lagi.');
    }
    return meta;
}

/** Link yang bisa dibagikan ke orang lain supaya mereka bisa ikut channel. */
export function linkChannel(meta) {
    return meta?.invite ? `https://whatsapp.com/channel/${meta.invite}` : null;
}

async function newsMeta(sock, jenis, kunci, log) {
    try {
        return await sock.newsletterMetadata(jenis, kunci);
    } catch (e) {
        log(`⚠️ Gagal baca metadata channel (${jenis}): ${e.message}`);
        return null;
    }
}

function hasil(meta, jid, jenis) {
    return {
        jid,
        nama: meta?.name || null,
        jenis,
        invite: meta?.invite || null,
        subscribers: typeof meta?.subscribers === 'number' ? meta.subscribers : null,
    };
}
