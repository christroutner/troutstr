const LS_CURATED_BASE = 'troutstr_curated_feed_base'

/**
 * @returns {string} Origin only, e.g. http://localhost:8080 (no trailing slash)
 */
export function loadCuratedFeedBaseUrl () {
  try {
    const fromLs = window.localStorage.getItem(LS_CURATED_BASE)
    if (fromLs && String(fromLs).trim()) {
      return normalizeBaseUrl(fromLs)
    }
  } catch (_) {}
  const fromEnv = typeof process !== 'undefined' && process.env?.REACT_APP_CURATED_FEED_URL
  return normalizeBaseUrl(fromEnv || '')
}

/**
 * @param {string} url
 */
export function saveCuratedFeedBaseUrl (url) {
  const n = normalizeBaseUrl(url)
  try {
    if (n) window.localStorage.setItem(LS_CURATED_BASE, n)
    else window.localStorage.removeItem(LS_CURATED_BASE)
  } catch (_) {}
  return n
}

export function normalizeBaseUrl (url) {
  const s = String(url || '').trim().replace(/\/$/, '')
  if (!s) return ''
  try {
    const u = new URL(s)
    return `${u.protocol}//${u.host}`
  } catch {
    return ''
  }
}

/**
 * @param {{ baseUrl: string, pubkey: string, limit?: number, cursor?: string }} opts
 * @returns {Promise<object>} API JSON body
 */
export async function fetchCuratedFeedPage ({ baseUrl, pubkey, limit = 50, cursor }) {
  const base = normalizeBaseUrl(baseUrl)
  if (!base) throw new Error('Curated feed base URL is not configured.')
  const pk = String(pubkey || '').toLowerCase().trim()
  if (!/^[0-9a-f]{64}$/.test(pk)) throw new Error('Invalid pubkey.')

  const u = new URL(`${base}/api/v1/feeds/curated`)
  u.searchParams.set('pubkey', pk)
  u.searchParams.set('limit', String(Math.min(100, Math.max(1, limit))))
  if (cursor) u.searchParams.set('cursor', cursor)

  const res = await fetch(u.toString())
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = body?.error?.message || res.statusText || 'Curated feed request failed'
    throw new Error(msg)
  }
  return body
}
