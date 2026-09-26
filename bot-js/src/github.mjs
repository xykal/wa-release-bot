// Modul cek GitHub Release — cuma 1 request API.

const API = 'https://api.github.com';

export function parseRepo(repoStr) {
  const m = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(String(repoStr || '').trim());
  if (!m) throw new Error(`Format repo salah: "${repoStr}". Harus "owner/nama-repo".`);
  return { owner: m[1], repo: m[2] };
}

export async function fetchLatestRelease(repoStr, { token = '', includePrereleases = false } = {}) {
  const { owner, repo } = parseRepo(repoStr);

  const headers = {
    'User-Agent': 'wa-release-bot (android app)',
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
    // { cause: e } bikin error aslinya (ECONNREFUSED, DNS, timeout, dll.)
    // tetap kebawa, jadi pas di-debug nggak cuma keliatan pesan bungkusnya.
    throw new Error(`Nggak bisa nyampe GitHub (cek internet HP): ${e.message}`, { cause: e });
  }

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
