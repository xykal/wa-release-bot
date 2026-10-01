// Satu sesi WA cuma boleh punya satu socket. Kalau Mode jaga pesan sedang
// nyala, tugas singkat harus nebeng socket itu, bukan login ulang pakai creds sama.
export async function tungguSocketJaga({ aktif, ambilSocket, batasMs = 30000, jedaMs = 100 }) {
  if (!aktif()) return null;
  const batas = Date.now() + batasMs;
  while (aktif()) {
    const sock = ambilSocket();
    if (sock) return sock;
    if (Date.now() >= batas) throw new Error('Socket Mode jaga pesan belum pulih setelah 30 dtk.');
    await new Promise((resolve) => setTimeout(resolve, jedaMs));
  }
  return null;
}

export async function sambungDenganSocketJaga({ pinjamSocket, sambungBaru }) {
  const sock = await pinjamSocket?.();
  if (sock) return { sock, close() {} };
  return sambungBaru();
}
