// Stub untuk modul OPSIONAL Baileys yang tidak tersedia di dalam app
// (sharp = native image processor). Bot ini cuma kirim pesan teks,
// jadi modul ini tidak akan pernah benar-benar dipakai.
function disabled() {
  throw new Error('Modul opsional Baileys tidak tersedia di wa-release-bot (tidak dipakai bot).');
}
module.exports = new Proxy(function () {}, {
  get: (t, p) => {
    if (p === '__esModule') return true;
    if (p === 'default') return disabled;
    if (p === 'format') return {};
    if (p === Symbol.toPrimitive) return () => '';
    if (p === 'toString') return () => '[stub]';
    return disabled;
  },
  apply: () => disabled(),
  construct: () => { throw disabled(); },
});
