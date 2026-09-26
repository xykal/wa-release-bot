// Modul format pesan WhatsApp (pakai markdown WA: *bold*, _italic_, `mono`).

const MAX_BODY = 1800;

export function formatReleasePost(rel, repoStr) {
  const tanggal = new Date(rel.publishedAt || Date.now()).toLocaleString('id-ID', {
    dateStyle: 'full',
    timeStyle: 'short',
  });

  const body = (rel.body || '').trim();
  const bodyTerpotong =
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
    bodyTerpotong || '_(tidak ada deskripsi di release ini)_',
    '',
    `🔗 ${rel.url}`,
    '',
    '_⚙️ Auto-posting oleh wa-release-bot — bot cuma bangun pas ada rilis baru_ 🦴'
  );

  return lines.join('\n');
}

export function formatTestMessage(repoStr) {
  return [
    '✅ *WA RELEASE BOT — SETUP SUKSES!*',
    '',
    `Bot ini sekarang siap ngabarin update release dari repo: \`${repoStr}\``,
    '',
    'Setiap ada *release baru* di GitHub, bot bakal bangun & posting info-nya ke channel ini.',
    'Kalau nggak ada update? Bot tidur. Nggak nyala 24 jam.',
    '',
    '🦴 _wa-release-bot_ ' + new Date().toLocaleString('id-ID')
  ].join('\n');
}
