// Stub universal untuk dependensi OPSIONAL Baileys
// (qrcode-terminal, jimp, link-preview-js) yang di-require secara lazy
// dan tidak dipakai oleh bot ini.
function disabled() {
  throw new Error('Modul opsional Baileys tidak tersedia di wa-release-bot (tidak dipakai bot).');
}
module.exports = new Proxy(function () {}, {
  get: (t, p) => {
    if (p === '__esModule') return true;
    if (p === 'default') return disabled;
    if (p === 'generate') return () => {}; // qrcode-terminal.generate → no-op
    if (p === Symbol.toPrimitive) return () => '';
    if (p === 'toString') return () => '[stub]';
    return disabled;
  },
  apply: () => disabled(),
  construct: () => { throw disabled(); },
});
