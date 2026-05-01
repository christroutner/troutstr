import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Card, Spinner } from 'react-bootstrap'
import { finalizeEvent, nip19 } from 'nostr-tools'
import NoteContent from '../components/NoteContent'
import { useNostr } from '../context/NostrContext'
import {
  dedupeById,
  parseProfileContent,
  sortEventsDescending
} from '../lib/nostr'

const PAGE = 50

function latestKind0ByPubkey (events) {
  const byPk = {}
  for (const e of events) {
    if (e.kind !== 0) continue
    const prev = byPk[e.pubkey]
    if (!prev || e.created_at > prev.created_at) byPk[e.pubkey] = e
  }
  return byPk
}

function shortenPubkey (hex) {
  if (!hex || hex.length < 16) return hex || ''
  return `${hex.slice(0, 8)}…${hex.slice(-6)}`
}

function buildAuthors (pubkeyHex, followList) {
  if (!pubkeyHex) return []
  return [...new Set([pubkeyHex, ...(followList || [])])]
}

export default function Feed () {
  const { pool: poolRef, pubkeyHex, secretKey, follows, readUrls, writeUrls, refreshFollows } = useNostr()
  const [events, setEvents] = useState([])
  const [profiles, setProfiles] = useState({})
  const [embeddedEvents, setEmbeddedEvents] = useState({})
  const [likedEventIds, setLikedEventIds] = useState({})
  const [likingEventIds, setLikingEventIds] = useState({})
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [hasMore, setHasMore] = useState(true)
  const newestTs = useRef(Math.floor(Date.now() / 1000))
  const fetchingEmbeddedIdsRef = useRef(new Set())

  const authors = useMemo(() => buildAuthors(pubkeyHex, follows), [pubkeyHex, follows])
  const readUrlsKey = readUrls.join('|')
  const authorsKey = authors.join(',')

  const mergeProfiles = useCallback((kind0Events) => {
    const map = latestKind0ByPubkey(kind0Events)
    setProfiles((prev) => {
      const next = { ...prev }
      for (const [pk, ev] of Object.entries(map)) {
        next[pk] = parseProfileContent(ev.content)
      }
      return next
    })
  }, [])

  const fetchProfilesFor = useCallback(
    async (pubkeys) => {
      const pool = poolRef.current
      if (!pool || readUrls.length === 0 || !pubkeys.length) return
      try {
        const batch = [...new Set(pubkeys)].slice(0, 200)
        const evs = await pool.querySync(readUrls, {
          kinds: [0],
          authors: batch,
          limit: batch.length * 4
        })
        mergeProfiles(evs)
      } catch (e) {
        console.warn('profiles', e)
      }
    },
    [poolRef, readUrls, mergeProfiles]
  )

  const queryFeedPage = useCallback(
    async (authorList, untilTs) => {
      const pool = poolRef.current
      if (!pool || readUrls.length === 0) {
        throw new Error('Add at least one read relay in Settings.')
      }
      const evs = await pool.querySync(readUrls, {
        kinds: [1, 2],
        authors: authorList,
        until: untilTs,
        limit: PAGE
      })
      return sortEventsDescending(dedupeById(evs))
    },
    [poolRef, readUrls]
  )

  const fetchEmbeddedEvents = useCallback(
    async (refs) => {
      const pool = poolRef.current
      if (!pool || readUrls.length === 0 || !Array.isArray(refs) || refs.length === 0) return
      const byId = {}
      for (const ref of refs) {
        if (!ref?.id) continue
        if (embeddedEvents[ref.id]) continue
        if (fetchingEmbeddedIdsRef.current.has(ref.id)) continue
        byId[ref.id] = ref
      }
      const missingIds = Object.keys(byId)
      if (!missingIds.length) return
      for (const id of missingIds) fetchingEmbeddedIdsRef.current.add(id)
      try {
        const hintedRelays = refs.flatMap((r) => (Array.isArray(r?.relays) ? r.relays : []))
        const relaySet = new Set([...readUrls, ...hintedRelays])
        const relaysToUse = [...relaySet]
        const evs = await pool.querySync(relaysToUse, {
          ids: missingIds,
          limit: missingIds.length * 3
        })
        const latestById = new Map()
        for (const ev of evs) {
          if (!ev?.id) continue
          const prev = latestById.get(ev.id)
          if (!prev || ev.created_at > prev.created_at) latestById.set(ev.id, ev)
        }
        if (latestById.size > 0) {
          const foundEvents = [...latestById.values()]
          setEmbeddedEvents((prev) => {
            const next = { ...prev }
            for (const ev of foundEvents) {
              next[ev.id] = ev
            }
            return next
          })
          await fetchProfilesFor(foundEvents.map((e) => e.pubkey))
        }
      } catch (e) {
        console.warn('embedded-events', e)
      } finally {
        for (const id of missingIds) fetchingEmbeddedIdsRef.current.delete(id)
      }
    },
    [poolRef, readUrls, embeddedEvents, fetchProfilesFor]
  )

  const initialLoad = useCallback(async () => {
    if (!pubkeyHex) return
    setLoading(true)
    setHasMore(true)
    setError('')
    const now = Math.floor(Date.now() / 1000)
    newestTs.current = now
    try {
      const followList = await refreshFollows()
      const authorList = buildAuthors(pubkeyHex, followList)
      const first = await queryFeedPage(authorList, now)
      setEvents(first)
      setLikedEventIds({})
      if (first.length < PAGE) setHasMore(false)
      if (first.length) {
        newestTs.current = Math.max(...first.map((e) => e.created_at)) + 1
      }
      await fetchProfilesFor(first.map((e) => e.pubkey))
    } catch (e) {
      setError(e?.message || String(e))
      setEvents([])
    } finally {
      setLoading(false)
    }
  }, [pubkeyHex, queryFeedPage, refreshFollows, fetchProfilesFor])

  const likeEvent = useCallback(async (targetEvent) => {
    const pool = poolRef.current
    if (!targetEvent?.id) return
    if (!pool) {
      setError('Relay pool not ready yet.')
      return
    }
    if (!secretKey || !pubkeyHex) {
      setError('Like requires your private key in this session. Log in again with nsec.')
      return
    }
    if (!writeUrls.length) {
      setError('Enable at least one write relay in Settings to like posts.')
      return
    }
    if (likedEventIds[targetEvent.id] || likingEventIds[targetEvent.id]) return

    setError('')
    setLikingEventIds((prev) => ({ ...prev, [targetEvent.id]: true }))
    try {
      const unsigned = {
        kind: 7,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['e', targetEvent.id],
          ['p', targetEvent.pubkey]
        ],
        content: '+'
      }
      const signed = finalizeEvent(unsigned, secretKey)
      const pubs = pool.publish(writeUrls, signed)
      if (Array.isArray(pubs) && pubs.length > 0) {
        await Promise.any(pubs.map((p) => Promise.resolve(p)))
      } else {
        await Promise.resolve(pubs)
      }
      setLikedEventIds((prev) => ({ ...prev, [targetEvent.id]: true }))
    } catch (e) {
      setError(e?.message || 'Failed to publish like event.')
    } finally {
      setLikingEventIds((prev) => {
        const next = { ...prev }
        delete next[targetEvent.id]
        return next
      })
    }
  }, [poolRef, secretKey, pubkeyHex, writeUrls, likedEventIds, likingEventIds])

  useEffect(() => {
    if (!pubkeyHex) return
    initialLoad()
  }, [pubkeyHex, readUrlsKey, initialLoad])

  const loadMore = async () => {
    if (!hasMore || loadingMore || !events.length || !authors.length) return
    setLoadingMore(true)
    setError('')
    try {
      const minT = Math.min(...events.map((e) => e.created_at))
      const nextUntil = minT - 1
      const page = await queryFeedPage(authors, nextUntil)
      const combined = sortEventsDescending(dedupeById([...events, ...page]))
      setEvents(combined)
      if (page.length < PAGE) setHasMore(false)
      await fetchProfilesFor(page.map((e) => e.pubkey))
    } catch (e) {
      setError(e?.message || String(e))
    } finally {
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    if (!pubkeyHex || readUrls.length === 0 || !authors.length) return
    const pool = poolRef.current
    if (!pool) return
    const id = setInterval(async () => {
      try {
        const since = newestTs.current
        const fresh = await pool.querySync(readUrls, {
          kinds: [1, 2],
          authors,
          since,
          limit: 100
        })
        if (!fresh.length) return
        const top = Math.max(...fresh.map((e) => e.created_at))
        if (top >= newestTs.current) newestTs.current = top + 1
        setEvents((prev) => sortEventsDescending(dedupeById([...fresh, ...prev])))
        await fetchProfilesFor(fresh.map((e) => e.pubkey))
      } catch (_) {}
    }, 45000)
    return () => clearInterval(id)
  }, [pubkeyHex, readUrlsKey, authorsKey, authors, readUrls, poolRef, fetchProfilesFor])

  if (!pubkeyHex) {
    return <Alert variant='secondary'>Log in to see your feed.</Alert>
  }

  if (!readUrls.length) {
    return <Alert variant='warning'>Enable at least one relay for reading in Settings.</Alert>
  }

  return (
    <div>
      <div className='d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2'>
        <h1 className='h3 mb-0'>Feed</h1>
        <Button variant='outline-secondary' size='sm' onClick={() => initialLoad()} disabled={loading}>
          Refresh
        </Button>
      </div>
      <p className='text-secondary small'>
        Showing notes (kinds 1 and 2) from you and your follows (kind 3). Newest first.
      </p>
      {error ? <Alert variant='danger'>{error}</Alert> : null}
      {loading
        ? (
          <div className='text-center py-5'>
            <Spinner animation='border' />
          </div>
          )
        : (
            events.map((ev) => {
              const prof = profiles[ev.pubkey] || {}
              const name = prof.name || shortenPubkey(ev.pubkey)
              let npubDisplay = ''
              try {
                npubDisplay = nip19.npubEncode(String(ev.pubkey).toLowerCase())
              } catch {
                npubDisplay = ev.pubkey
              }
              return (
                <Card key={ev.id} className='mb-3'>
                  <Card.Header className='d-flex align-items-center gap-2 py-2'>
                    {prof.picture
                      ? (
                        <img src={prof.picture} alt='' className='note-avatar' referrerPolicy='no-referrer' />
                        )
                      : (
                        <div
                          className='note-avatar bg-secondary d-flex align-items-center justify-content-center text-white small'
                        >
                          {name.slice(0, 2).toUpperCase()}
                        </div>
                        )}
                    <div className='flex-grow-1 min-width-0'>
                      <div className='fw-semibold text-truncate'>{name}</div>
                      <div className='small text-muted text-truncate' title={npubDisplay}>
                        {shortenPubkey(npubDisplay)}
                      </div>
                    </div>
                    <div className='small text-muted text-nowrap'>
                      {new Date(ev.created_at * 1000).toLocaleString()}
                    </div>
                  </Card.Header>
                  <Card.Body>
                    <NoteContent
                      content={ev.content}
                      embeddedEvents={embeddedEvents}
                      profiles={profiles}
                      onNostrRefs={fetchEmbeddedEvents}
                    />
                  </Card.Body>
                  <Card.Footer className='d-flex align-items-center gap-2'>
                    <Button
                      variant={likedEventIds[ev.id] ? 'success' : 'outline-secondary'}
                      size='sm'
                      onClick={() => likeEvent(ev)}
                      disabled={Boolean(likingEventIds[ev.id]) || likedEventIds[ev.id]}
                    >
                      {likingEventIds[ev.id] ? 'Liking…' : likedEventIds[ev.id] ? 'Liked' : 'Like'}
                    </Button>
                  </Card.Footer>
                </Card>
              )
            })
          )}
      {!loading && !events.length ? <Alert variant='light'>No posts found yet. Try other relays or follow people.</Alert> : null}
      {hasMore && events.length > 0
        ? (
          <div className='text-center mt-3'>
            <Button variant='primary' onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? <Spinner animation='border' size='sm' className='me-2' /> : null}
              Load more
            </Button>
          </div>
          )
        : null}
    </div>
  )
}
