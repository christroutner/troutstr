import { getPublicKey, nip19 } from 'nostr-tools'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils'

/** Default relays (read+write), aligned with common public relays. */
export const DEFAULT_RELAYS = {
  'wss://nostr-pub.wellorder.net': { read: true, write: true },
  'wss://nostr.onsats.org': { read: true, write: true },
  'wss://nostr-relay.wlvs.space': { read: true, write: true },
  'wss://relay.damus.io': { read: true, write: true },
  'wss://nostr.zebedee.cloud': { read: true, write: false },
  'wss://relay.nostr.info': { read: true, write: true }
}

const LS_RELAYS = 'troutstr_relays'
const LS_PUBKEY = 'troutstr_pubkey'
const LS_SECRET_HEX = 'troutstr_secret_hex'

function getStorage () {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

export function loadPersistedRelays () {
  const storage = getStorage()
  if (!storage) return { ...DEFAULT_RELAYS }
  try {
    const raw = storage.getItem(LS_RELAYS)
    if (!raw) return { ...DEFAULT_RELAYS }
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed
  } catch (_) {}
  return { ...DEFAULT_RELAYS }
}

export function saveRelays (relays) {
  const storage = getStorage()
  if (!storage) return
  storage.setItem(LS_RELAYS, JSON.stringify(relays))
}

export function loadPersistedPubkey () {
  const storage = getStorage()
  if (!storage) return null
  return storage.getItem(LS_PUBKEY)
}

export function loadPersistedSecretHex () {
  const storage = getStorage()
  if (!storage) return null
  return storage.getItem(LS_SECRET_HEX)
}

export function persistSession ({ pubkeyHex, secretHex }) {
  const storage = getStorage()
  if (!storage) return
  if (pubkeyHex) storage.setItem(LS_PUBKEY, pubkeyHex)
  else storage.removeItem(LS_PUBKEY)
  if (secretHex) storage.setItem(LS_SECRET_HEX, secretHex)
  else storage.removeItem(LS_SECRET_HEX)
}

export function clearPersistedSession () {
  const storage = getStorage()
  if (!storage) return
  storage.removeItem(LS_PUBKEY)
  storage.removeItem(LS_SECRET_HEX)
}

export function normalizeRelayUrl (url) {
  const u = String(url || '').trim()
  if (!u) return ''
  try {
    const parsed = new URL(u)
    if (parsed.protocol !== 'wss:' && parsed.protocol !== 'ws:') return ''
    parsed.hash = ''
    parsed.search = ''
    let out = parsed.toString()
    if (out.endsWith('/')) out = out.slice(0, -1)
    return out
  } catch {
    return ''
  }
}

export function readRelayUrls (relaysMap) {
  return Object.entries(relaysMap || {})
    .filter(([, v]) => v && v.read)
    .map(([url]) => normalizeRelayUrl(url))
    .filter(Boolean)
}

export function writeRelayUrls (relaysMap) {
  return Object.entries(relaysMap || {})
    .filter(([, v]) => v && v.write)
    .map(([url]) => normalizeRelayUrl(url))
    .filter(Boolean)
}

/**
 * @param {string} input - nsec… bech32 or 64-char hex seckey
 * @returns {{ secretKey: Uint8Array, pubkeyHex: string }}
 */
export function decodeLoginPrivateKey (input) {
  const trimmed = String(input || '').trim()
  if (!trimmed) throw new Error('Enter your private key or nsec.')

  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    const secretKey = hexToBytes(trimmed.toLowerCase())
    const pubkeyHex = getPublicKey(secretKey)
    return { secretKey, pubkeyHex }
  }

  let decoded
  try {
    decoded = nip19.decode(trimmed)
  } catch {
    throw new Error('Invalid nsec or hex key.')
  }
  if (decoded.type !== 'nsec') {
    throw new Error('Use an nsec private key (not npub).')
  }
  const secretKey = decoded.data
  const pubkeyHex = getPublicKey(secretKey)
  return { secretKey, pubkeyHex }
}

export function secretKeyToHex (secretKey) {
  return bytesToHex(secretKey)
}

export function hexToSecretKey (hex) {
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) return null
  return hexToBytes(hex.toLowerCase())
}

/** Timestamps in ms are ≥ this; Nostr `created_at` unix seconds stay below until year ~33688. */
const NOSTR_CREATED_AT_MS_FLOOR = 1_000_000_000_000

/**
 * Convert Nostr `created_at` (unix seconds) to a Date. Handles legacy values already
 * in milliseconds (e.g. curated API rows affected by a Mongoose timestamp collision).
 * @param {string|number|null|undefined} value
 * @returns {Date}
 */
export function nostrCreatedAtToDate (value) {
  if (value == null || value === '') return new Date(NaN)
  const n = Number(value)
  if (Number.isFinite(n)) {
    if (n >= NOSTR_CREATED_AT_MS_FLOOR) return new Date(n)
    return new Date(n * 1000)
  }
  return new Date(value)
}

export function dedupeById (events) {
  const map = new Map()
  for (const ev of events) {
    if (!ev?.id) continue
    const prev = map.get(ev.id)
    if (!prev || ev.created_at > prev.created_at) map.set(ev.id, ev)
  }
  return [...map.values()]
}

export function sortEventsDescending (events) {
  return [...events].sort((a, b) => b.created_at - a.created_at)
}

/** Latest kind-3 by created_at from a merged list. */
export function pickLatestContactList (events) {
  const k3 = events.filter((e) => e.kind === 3)
  if (!k3.length) return null
  return k3.reduce((a, b) => (a.created_at >= b.created_at ? a : b))
}

export function followPubkeysFromContactEvent (ev) {
  if (!ev?.tags) return []
  return ev.tags
    .filter((t) => Array.isArray(t) && t[0] === 'p' && t[1])
    .map((t) => t[1])
}

export function parseProfileContent (content) {
  try {
    const j = JSON.parse(content || '{}')
    return {
      name: typeof j.name === 'string' ? j.name : '',
      about: typeof j.about === 'string' ? j.about : '',
      picture: typeof j.picture === 'string' ? j.picture : ''
    }
  } catch {
    return { name: '', about: '', picture: '' }
  }
}
