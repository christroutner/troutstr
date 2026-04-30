import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { SimplePool } from 'nostr-tools'
import {
  clearPersistedSession,
  decodeLoginPrivateKey,
  followPubkeysFromContactEvent,
  hexToSecretKey,
  loadPersistedPubkey,
  loadPersistedRelays,
  loadPersistedSecretHex,
  persistSession,
  pickLatestContactList,
  readRelayUrls,
  saveRelays,
  secretKeyToHex
} from '../lib/nostr'

const NostrContext = createContext(null)

export function NostrProvider ({ children }) {
  const poolRef = useRef(null)
  const [relays, setRelaysState] = useState(() => loadPersistedRelays())
  const [pubkeyHex, setPubkeyHex] = useState(() => loadPersistedPubkey() || null)
  const [secretKey, setSecretKey] = useState(() => {
    const h = loadPersistedSecretHex()
    return h ? hexToSecretKey(h) : null
  })
  const [follows, setFollows] = useState([])

  useEffect(() => {
    poolRef.current = new SimplePool()
    return () => {
      poolRef.current?.destroy()
      poolRef.current = null
    }
  }, [])

  const setRelays = useCallback((next) => {
    setRelaysState((prev) => {
      const v = typeof next === 'function' ? next(prev) : next
      saveRelays(v)
      return v
    })
  }, [])

  const readUrls = useMemo(() => readRelayUrls(relays), [relays])
  const readUrlsKey = readUrls.join('|')

  const login = useCallback((input, { remember } = {}) => {
    const { secretKey: sk, pubkeyHex: pk } = decodeLoginPrivateKey(input)
    setSecretKey(sk)
    setPubkeyHex(pk)
    if (remember) {
      persistSession({ pubkeyHex: pk, secretHex: secretKeyToHex(sk) })
    } else {
      persistSession({ pubkeyHex: pk, secretHex: null })
    }
  }, [])

  const logout = useCallback(() => {
    setSecretKey(null)
    setPubkeyHex(null)
    setFollows([])
    clearPersistedSession()
  }, [])

  const refreshFollows = useCallback(async () => {
    const pool = poolRef.current
    const pk = pubkeyHex
    if (!pool || !pk || readUrls.length === 0) {
      setFollows([])
      return []
    }
    try {
      const events = await pool.querySync(readUrls, {
        kinds: [3],
        authors: [pk],
        limit: 50
      })
      const latest = pickLatestContactList(events)
      const list = latest ? followPubkeysFromContactEvent(latest) : []
      setFollows(list)
      return list
    } catch (e) {
      console.warn('refreshFollows', e)
      setFollows([])
      return []
    }
  }, [pubkeyHex, readUrls])

  useEffect(() => {
    if (pubkeyHex && readUrls.length) {
      refreshFollows()
    } else {
      setFollows([])
    }
  }, [pubkeyHex, readUrlsKey, readUrls.length, refreshFollows])

  const value = useMemo(
    () => ({
      pool: poolRef,
      relays,
      setRelays,
      readUrls,
      pubkeyHex,
      secretKey,
      follows,
      refreshFollows,
      login,
      logout
    }),
    [
      relays,
      setRelays,
      readUrls,
      pubkeyHex,
      secretKey,
      follows,
      refreshFollows,
      login,
      logout
    ]
  )

  return (
    <NostrContext.Provider value={value}>{children}</NostrContext.Provider>
  )
}

export function useNostr () {
  const ctx = useContext(NostrContext)
  if (!ctx) throw new Error('useNostr must be used within NostrProvider')
  return ctx
}
