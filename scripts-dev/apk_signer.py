#!/usr/bin/env python3
"""
Baca sertifikat penandatangan APK langsung dari APK Signing Block (skema v2/v3).

Kenapa ini ada: buat membandingkan sertifikat antar-APK tanpa perlu install
Android SDK lengkap (apksigner). Kalau dua build di-sign dengan kunci yang
berbeda, sidik jari SHA-256-nya akan beda — dan itu artinya APK yang baru
TIDAK bisa dipasang menimpa APK yang lama.

Pakai:
    python3 apk_signer.py file.apk [file2.apk ...]
"""
import hashlib
import struct
import sys

MAGIC = b"APK Sig Block 42"
ID_V2 = 0x7109871A
ID_V3 = 0xF05368C0


class Reader:
    """Pembaca berurutan dengan panjang awalan (length-prefixed)."""

    def __init__(self, buf, pos=0):
        self.buf = buf
        self.pos = pos

    def u32(self):
        (v,) = struct.unpack_from("<I", self.buf, self.pos)
        self.pos += 4
        return v

    def chunk(self):
        """Baca uint32 panjang, lalu potong sebanyak itu."""
        n = self.u32()
        data = self.buf[self.pos:self.pos + n]
        assert len(data) == n, "panjang chunk melebihi buffer"
        self.pos += n
        return data


def find_signing_block(data):
    """Kembalikan dict {id: value} dari APK Signing Block, atau None."""
    # Cari End of Central Directory (EOCD) dari belakang.
    eocd = data.rfind(b"PK\x05\x06")
    if eocd < 0:
        return None
    cd_offset = struct.unpack_from("<I", data, eocd + 16)[0]
    if data[cd_offset - 16:cd_offset] != MAGIC:
        return None

    # Tata letak blok:  [size(8)][pasangan id-value][size(8)][magic(16)]
    # size di footer TIDAK termasuk dirinya sendiri, jadi:
    #   total blok = 8 + size2,  dan blok mulai di cd_offset - size2 - 8.
    (size2,) = struct.unpack_from("<Q", data, cd_offset - 24)
    block_start = cd_offset - size2 - 8
    if block_start < 0:
        return None
    (size1,) = struct.unpack_from("<Q", data, block_start)
    if size1 != size2:
        return None

    pairs = {}
    r = Reader(data, block_start + 8)
    end = cd_offset - 24          # berhenti sebelum size field terakhir
    while r.pos < end:
        pair_len = r.u32() | (r.u32() << 32)  # uint64
        pid = r.u32()
        pairs[pid] = data[r.pos:r.pos + pair_len - 4]
        r.pos += pair_len - 4
    return pairs


def first_cert(value):
    """Ambil sertifikat X.509 pertama dari value skema v2/v3."""
    r = Reader(value)
    signers = Reader(r.chunk())      # urutan signer
    signer = Reader(signers.chunk())  # signer pertama
    signed_data = Reader(signer.chunk())
    signed_data.chunk()               # digests — dilewati
    certs = Reader(signed_data.chunk())
    return certs.chunk()              # sertifikat pertama (DER)


def fingerprint(der):
    h = hashlib.sha256(der).hexdigest().upper()
    return ":".join(h[i:i + 2] for i in range(0, len(h), 2))


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)

    results = {}
    for path in sys.argv[1:]:
        with open(path, "rb") as fh:
            data = fh.read()
        pairs = find_signing_block(data)
        if not pairs:
            print(f"{path}: tidak ada APK Signing Block (mungkin cuma v1/JAR signing)")
            continue
        scheme = "v3" if ID_V3 in pairs else ("v2" if ID_V2 in pairs else "?")
        value = pairs.get(ID_V3) or pairs.get(ID_V2)
        cert = first_cert(value)
        fp = fingerprint(cert)
        results[path] = fp
        print(f"{path}")
        print(f"   skema      : {scheme}")
        print(f"   SHA-256    : {fp}")
        print(f"   ukuran cert: {len(cert)} byte")

    if len(results) > 1:
        uniq = set(results.values())
        print()
        print("=" * 64)
        print(f"  {len(uniq)} sidik jari berbeda dari {len(results)} APK")
        for fp in uniq:
            nama = [p.split("/")[-1] for p, f in results.items() if f == fp]
            print(f"   - {fp[:23]}...  ({', '.join(nama)})")
        if len(uniq) == 1:
            print("  → SEMUA SAMA: APK baru bisa dipasang menimpa APK lama.")
        else:
            print("  → BEDA: APK baru TIDAK bisa dipasang menimpa yang lama")
            print("    (Android nolak: 'App not installed' / signature mismatch).")


if __name__ == "__main__":
    main()
