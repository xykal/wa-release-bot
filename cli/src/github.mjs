// Modul cek GitHub Release — cuma 1 request API, ringan banget.

const API = 'https://api.github.com';

export function parseRepo(repoStr) {
  const m = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(String(repoStr || '').trim());
  if (!m) {
    throw new Error(
      `Format "github.repo" di config.json salah. Harus "owner/nama-repo" — yang lo isi: "${repoStr}"`
    );
  }
  return { owner: m[1], repo: m[2] };
}

/**
 * Ambil release terbaru dari sebuah repo GitHub.
 * @param {string} repoStr "owner/nama-repo"
 * @param {{token?: string, includePrereleases?: boolean}} opts
 */
export async function fetchLatestRelease(repoStr, { token = '', includePrereleases = false } = {}) {
  const { owner, repo } = parseRepo(repoStr);

  const headers = {
    'User-Agent': 'wa-release-bot (personal)',
    Accept: 'application/vnd.github+json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const url = includePrereleases
    ? `${API}/repos/${owner}/${repo}/releases?per_page=1`
    : `${API}/repos/${owner}/${repo}/releases/latest`;

  let res;
  try {
    res = await fetch(url, { headers });
  } catch (e) {
    // { cause: e } bikin error aslinya tetap kebawa buat debugging.
    throw new Error(`Nggak bisa nyampe GitHub (internet HP lo check): ${e.message}`, { cause: e });
  }

  if (res.status === 404) {
    throw new Error(
      `Repo ${owner}/${repo} nggak punya release (atau repo private — kalau private, isi "github.token" di config.json).`
    );
  }
  if (res.status === 401 || res.status === 403 || res.status === 429) {
    throw new Error(
      `GitHub nyuruh-nyuruh (HTTP ${res.status}) — kemungkinan rate limit. Tambah token GitHub di config.json atau kelonggaran interval cek.`
    );
  }
  if (!res.ok) {
    throw new Error(`GitHub API error: HTTP ${res.status}`);
  }

  const json = await res.json();
  const rel = Array.isArray(json) ? json[0] : json;
  if (!rel) throw new Error(`Repo ${owner}/${repo} nggak punya release sama sekali.`);
  if (rel.draft) throw new Error(`Release terbaru (${rel.tag_name}) masih draft — dilewatin, bukan rilis beneran.`);

  return {
    tag: rel.tag_name,
    name: rel.name || rel.tag_name,
    body: rel.body || '',
    url: rel.html_url,
    author: rel.author?.login || 'unknown',
    publishedAt: rel.published_at,
    isPrerelease: Boolean(rel.prerelease),
  };
}
