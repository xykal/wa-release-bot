// Format pesan WhatsApp (markdown WA: *bold*, _italic_, `mono`).

const MAX_BODY = 1800;

// Penutup buat format "pertanyaan" di channel: follower bisa bales pesan ini
// (balasannya cuma keliatan sama admin channel).
export const AJAKAN_BALAS = '💬 _Ada pertanyaan / nemu bug di versi ini? Bales aja pesan ini — cuma admin yang bisa baca._';

export function formatReleasePost(rel, repoStr, { ajakBalas = false } = {}) {
  const tanggal = new Date(rel.publishedAt || Date.now()).toLocaleString('id-ID', {
    dateStyle: 'full',
    timeStyle: 'short',
  });

  const body = (rel.body || '').trim();
  const bodyFinal =
    body.length > MAX_BODY ? body.slice(0, MAX_BODY) + '\n\n_(notes-nya panjang, lanjut di link)_' : body;

  const lines = [
    '🚀 *RELEASE BARU DETEKSI!*',
    '',
    `📦 Repo: \`${repoStr}\``,
    `🏷️ Versi: *${rel.tag}*`,
  ];
  if (rel.name && rel.name.trim() !== rel.tag) lines.push(`📌 Title: ${rel.name}`);
  if (rel.isPrerelease) lines.push('🧪 _(prerelease)_');
  lines.push(
    `👤 Oleh: @${rel.author}`,
    `🕐 ${tanggal}`,
    '',
    '📝 *Changelog:*',
    bodyFinal || '_(tidak ada deskripsi di release ini)_',
    '',
    `🔗 ${rel.url}`,
    '',
    ...(ajakBalas ? [AJAKAN_BALAS, ''] : []),
    '_⚙️ Auto-posting oleh wa-release-bot — bot cuma bangun pas ada rilis baru_ 🦴'
  );

  return lines.join('\n');
}

export function formatTestMessage(repoStr, { ajakBalas = false } = {}) {
  return [
    '✅ *WA RELEASE BOT — SETUP SUKSES!*',
    '',
    `Bot ini sekarang siap ngabarin update release dari repo: \`${repoStr}\``,
    '',
    'Setiap ada *release baru* di GitHub, bot bakal bangun & posting info-nya ke channel ini.',
    'Kalau nggak ada update? Bot tidur. Nggak nyala 24 jam.',
    '',
    ...(ajakBalas ? [AJAKAN_BALAS, ''] : []),
    '🦴 _wa-release-bot_ ' + new Date().toLocaleString('id-ID')
  ].join('\n');
}

export const LINK_RULES_DEFAULT = 'https://rules.xyc.my.id/';

export const RINGKAS_RULES_DEFAULT = [
  'Keluar / dikeluarin dari grup = permanen. Nggak bisa balik, nomor kedua juga ketahuan.',
  'Transaksi lewat admin / rekber. Jalan sendiri = risiko sendiri.',
  'Promosi wajib izin admin dulu, maks 1× sehari.',
  'Nama yang kebaca, no SARA, no tag-all, jam tenang 22.00–06.00.',
].join('\n');

function barisRules(ringkas) {
  return String(ringkas || RINGKAS_RULES_DEFAULT)
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 10)
    .map((s, i) => `${i + 1}. ${s.replace(/^\d+[.)]\s*/, '')}`);
}

/**
 * Pesan "Tes kirim" / sapaan di grup: bot aktif + fiturnya + aturan singkat +
 * link aturan lengkap.
 */
export function formatTesGrup(namaGrup, { linkRules = LINK_RULES_DEFAULT, ringkasRules, perintah = true } = {}) {
  const lines = [
    '🛡️ *BOT PENJAGA GRUP AKTIF*',
    '',
    `Grup${namaGrup ? ` *${namaGrup}*` : ' ini'} sekarang dijaga bot. Yang dikerjain:`,
    '✅ Permintaan join di-approve otomatis',
    '⛔ Yang pernah keluar / dikeluarin → ditolak kalau minta join lagi',
    '🚪 Anggota yang keluar langsung dicatat ke daftar hitam',
  ];
  if (perintah) {
    lines.push(
      '',
      '⌨️ *Perintah:*',
      '• *!rules* — aturan grup',
      '• *!menu* — daftar perintah',
      '• *!info* — ringkasan grup & daftar hitam _(khusus admin)_',
    );
  }
  lines.push('', '📜 *Aturan singkat:*', ...barisRules(ringkasRules));
  if (linkRules) lines.push('', `📖 Aturan lengkap: ${linkRules}`);
  lines.push('', '🌙 _wa-release-bot_');
  return lines.join('\n');
}

export function formatRules(namaGrup, { linkRules = LINK_RULES_DEFAULT, ringkasRules } = {}) {
  return [
    `📜 *ATURAN GRUP${namaGrup ? ` ${namaGrup.toUpperCase()}` : ''}*`,
    '',
    ...barisRules(ringkasRules),
    ...(linkRules ? ['', `📖 Lengkapnya: ${linkRules}`] : []),
  ].join('\n');
}

export function formatMenu(perintahScript = []) {
  const lines = [
    '📋 *MENU BOT*',
    '',
    '• *!rules* — aturan grup',
    '• *!menu* — daftar ini',
    '• *!info* — ringkasan grup _(admin)_',
  ];
  if (perintahScript.length) {
    lines.push('', '🧩 *Dari script:*');
    for (const p of perintahScript.slice(0, 30)) lines.push(`• *${p.perintah}* _(${p.dari})_`);
  }
  return lines.join('\n');
}

function lalu(ms) {
  if (!ms) return 'belum pernah';
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'barusan';
  if (m < 60) return `${m} mnt lalu`;
  const j = Math.round(m / 60);
  return j < 48 ? `${j} jam lalu` : `${Math.round(j / 24)} hari lalu`;
}

/**
 * !info (khusus admin).
 * @param {{ nama, anggota, admin, permintaan, disetujui, ditolak, hitam: Array<{label, sejak}>,
 *           manual: number, lastCekAt, mode }} d
 */
export function formatInfoGrup(d) {
  const lines = [
    `📊 *INFO GRUP${d.nama ? ` — ${d.nama}` : ''}*`,
    '',
    `👥 Anggota: *${d.anggota}* (admin ${d.admin})`,
    `📥 Permintaan join nunggu: *${d.permintaan ?? '-'}*`,
    `✅ Di-approve bot: *${d.disetujui || 0}*  ·  ⛔ Ditolak: *${d.ditolak || 0}*`,
    `🚫 Daftar hitam: *${d.hitam.length}* orang${d.manual ? ` + ${d.manual} nomor manual` : ''}`,
  ];
  const tampil = d.hitam.slice(0, 20);
  tampil.forEach((o, i) => {
    const tgl = o.sejak ? ` _(${new Date(o.sejak).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })})_` : '';
    lines.push(`   ${i + 1}. ${o.label}${tgl}`);
  });
  if (d.hitam.length > tampil.length) lines.push(`   … +${d.hitam.length - tampil.length} lagi (lihat di app)`);
  lines.push('', `🕐 Cek terakhir: ${lalu(d.lastCekAt)}  ·  mode: ${d.mode}`);
  return lines.join('\n');
}
