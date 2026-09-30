#!/usr/bin/env python3
"""
QA responsif landing page: render web/ di Chromium headless (Playwright) pada banyak
ukuran layar, deteksi overflow horizontal + elemen yang bocor keluar viewport, simpan
screenshot dan lembar kontak.

  pip install playwright pillow && python3 -m playwright install chromium
  python3 scripts-dev/tangkap_web.py [dir_keluaran=/tmp/qa/web] [--penuh]

Keluar dengan kode 1 kalau ada halaman yang overflow (dipakai job CI `tangkapan`).
Server statis lokal dinyalakan sebentar di thread (bukan dev server; mati saat selesai).
"""
import functools
import http.server
import socketserver
import sys
import threading
from pathlib import Path

AKAR = Path(__file__).resolve().parent.parent
WEB = AKAR / "web"
# (nama, lebar, tinggi) -- HP kecil sampai ultrawide, portrait + landscape
LAYAR = [
    ("fold-cover", 344, 882), ("se", 320, 568), ("android-kecil", 360, 640), ("android", 360, 800),
    ("iphone", 390, 844), ("pixel", 412, 915), ("hp-landscape", 800, 360), ("tablet", 768, 1024),
    ("ipad-air", 820, 1180), ("tablet-landscape", 1024, 768), ("laptop", 1280, 720),
    ("desktop", 1440, 900), ("fhd", 1920, 1080), ("ultrawide", 2560, 1080),
]
HALAMAN = [("beranda", "/"), ("unduh", "/unduh/"), ("unduh-lewat", "/unduh/?t=2026-10-11T12:00:01Z"), ("beranda-en", "/?bahasa=en")]

CEK_JS = """() => {
  const w = document.documentElement.clientWidth;
  const bocor = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    const st = getComputedStyle(el);
    if (st.position === 'fixed' || st.visibility === 'hidden' || r.right <= 0) continue; // skip link sengaja di luar layar
    let a = el.parentElement, dalamScroll = false;
    while (a && a !== document.body) { const o = getComputedStyle(a).overflowX; if (o === 'auto' || o === 'scroll') { dalamScroll = true; break; } a = a.parentElement; }
    if (dalamScroll) continue; // galeri: isinya memang lebih lebar, kontainernya yang dicek
    if (r.right > w + 1 || r.left < -1) {
      const id = el.id ? '#' + el.id : ''; const cls = el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).join('.') : '';
      bocor.push(el.tagName.toLowerCase() + id + cls + ' [' + Math.round(r.left) + '..' + Math.round(r.right) + ']');
    }
    if (bocor.length > 6) break;
  }
  return { scrollW: document.documentElement.scrollWidth, w, bocor };
}"""


def server_statis():
    class Diam(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a, **k):  # tanpa log akses di terminal/CI
            pass
    handler = functools.partial(Diam, directory=str(WEB))
    srv = socketserver.TCPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, srv.server_address[1]


def main():
    keluar = Path(next((a for a in sys.argv[1:] if not a.startswith("--")), "/tmp/qa/web"))
    penuh = "--penuh" in sys.argv
    keluar.mkdir(parents=True, exist_ok=True)
    from playwright.sync_api import sync_playwright

    srv, port = server_statis()
    gagal = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for nama_h, path in HALAMAN:
            for nama_l, lebar, tinggi in LAYAR:
                if nama_h != "beranda" and nama_l in ("ipad-air", "tablet-landscape", "desktop", "ultrawide", "android-kecil"):
                    continue  # halaman lain cukup sampel
                ctx = browser.new_context(viewport={"width": lebar, "height": tinggi}, device_scale_factor=1, reduced_motion="reduce")
                pg = ctx.new_page()
                pg.goto(f"http://127.0.0.1:{port}{path}", wait_until="networkidle")
                pg.wait_for_timeout(300)
                hasil = pg.evaluate(CEK_JS)
                tag = f"{nama_h}-{nama_l}-{lebar}x{tinggi}"
                if hasil["scrollW"] > hasil["w"] or hasil["bocor"]:
                    gagal.append(f"{tag}: scrollWidth {hasil['scrollW']} > {hasil['w']}; bocor: {hasil['bocor'][:4]}")
                pg.screenshot(path=str(keluar / f"{tag}.png"), full_page=penuh and nama_h == "beranda")
                ctx.close()
        browser.close()
    srv.shutdown()
    print(f"{len(list(keluar.glob('*.png')))} screenshot di {keluar}")
    if gagal:
        print("OVERFLOW:\n  " + "\n  ".join(gagal))
        sys.exit(1)
    print("tidak ada overflow horizontal")


if __name__ == "__main__":
    main()
