// Modul cek GitHub Release — satu request API per cek, dan kalau tidak ada
// perubahan, request-nya conditional (ETag) sehingga jawabannya 304 tanpa body
// dan tidak dihitung ke rate limit GitHub.

const API = 'https://api.github.com';
const API_VERSION = '2022-11-28';
export const TIMEOUT_MS = 20000;

export function parseRepo(repoStr) {
  const m = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(String(repoStr || '').trim());
  if (!m) throw new Error(`Format repo salah: "${repoStr}". Harus "owner/nama-repo".`);
  return { owner: m[1], repo: m[2] };
}

function urlRelease(owner, repo, includePrereleases) {
  return includePrereleases
    ? `${API}/repos/${owner}/${repo}/releases?per_page=1`
    : `${API}/repos/${owner}/${repo}/releases/latest`;
}

function bentukRelease(rel, etag) {
  return {
    tag: rel.tag_name,
    name: rel.name || rel.tag_name,
    body: rel.body || '',
    url: rel.html_url,
    author: rel.author?.login || 'unknown',
    publishedAt: rel.published_at,
    isPrerelease: Boolean(rel.prerelease),
    etag,
    notModified: false,
  };
}

/**
 * @param {string} repoStr  "owner/repo"
 * @param {{
 *   token?: string,
 *   includePrereleases?: boolean,
 *   etag?: string,              // ETag dari cek sebelumnya -> If-None-Match
 *   timeoutMs?: number,
 *   fetchImpl?: typeof fetch,   // buat unit test
 * }} [opts]
 * @returns {Promise<{notModified: true, etag: string} | ReturnType<typeof bentukRelease>>}
 */
export async function fetchLatestRelease(repoStr, {
  token = '',
  includePrereleases = false,
  etag = '',
  timeoutMs = TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
} = {}) {
  const { owner, repo } = parseRepo(repoStr);

  const headers = {
    'User-Agent': 'wa-release-bot (android app)',
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': API_VERSION,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (etag) headers['If-None-Match'] = etag;

  let res;
  try {
    res = await fetchImpl(urlRelease(owner, repo, includePrereleases), {
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    // Jaringan HP bisa "nyangkut" tanpa error: tanpa batas waktu satu cek bisa
    // menggantung bermenit-menit dan menahan jadwal berikutnya.
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
      throw new Error(`GitHub nggak jawab dalam ${Math.round(timeoutMs / 1000)} dtk (jaringan HP lambat?). Dicoba lagi jadwal berikutnya.`, { cause: e });
    }
    throw new Error(`Nggak bisa nyampe GitHub (cek internet HP): ${e.message}`, { cause: e });
  }

  if (res.status === 304) return { notModified: true, etag };
  if (res.status === 404) {
    throw new Error(`Repo ${owner}/${repo} nggak punya release (atau repo private — isi token GitHub di setting).`);
  }
  if (res.status === 401 || res.status === 403 || res.status === 429) {
    throw new Error(`GitHub menolak (HTTP ${res.status}) — kemungkinan rate limit. Isi token GitHub atau kurangi frekuensi cek.`);
  }
  if (!res.ok) throw new Error(`GitHub API error: HTTP ${res.status}`);

  const json = await res.json();
  const rel = Array.isArray(json) ? json[0] : json;
  if (!rel) throw new Error(`Repo ${owner}/${repo} nggak punya release sama sekali.`);
  if (rel.draft) throw new Error(`Release terbaru (${rel.tag_name}) masih draft — dilewatin.`);

  const etagBaru = (typeof res.headers?.get === 'function' && res.headers.get('etag')) || '';
  return bentukRelease(rel, etagBaru);
}
