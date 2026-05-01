import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Modal, Nav, Spinner, Tab } from 'react-bootstrap'
import { finalizeEvent } from 'nostr-tools'
import { Link } from 'react-router-dom'
import FeedPostCard from '../components/FeedPostCard'
import { useNostr } from '../context/NostrContext'
import { fetchCuratedFeedPage } from '../lib/curated-feed'
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

function buildAuthors (pubkeyHex, followList) {
  if (!pubkeyHex) return []
  return [...new Set([pubkeyHex, ...(followList || [])])]
}

function eventIdsFromETags (tags = []) {
  return tags
    .filter((t) => Array.isArray(t) && t[0] === 'e' && t[1])
    .map((t) => t[1])
}

function isOriginalPost (ev) {
  if (!ev || ev.kind !== 1) return false
  return eventIdsFromETags(ev.tags).length === 0
}

export default function Feed () {
  const {
    pool: poolRef,
    pubkeyHex,
    secretKey,
    follows,
    readUrls,
    writeUrls,
    refreshFollows,
    curatedFeedBaseUrl
  } = useNostr()

  const [feedTab, setFeedTab] = useState('relays')

  const [events, setEvents] = useState([])
  const [profiles, setProfiles] = useState({})
  const [embeddedEvents, setEmbeddedEvents] = useState({})
  const [repliesByPost, setRepliesByPost] = useState({})
  const [replyCountByPost, setReplyCountByPost] = useState({})
  const [showRepliesModal, setShowRepliesModal] = useState(false)
  const [selectedPostId, setSelectedPostId] = useState('')
  const [loadingRepliesId, setLoadingRepliesId] = useState('')
  const [likedEventIds, setLikedEventIds] = useState({})
  const [likingEventIds, setLikingEventIds] = useState({})
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [hasMore, setHasMore] = useState(true)
  const newestTs = useRef(Math.floor(Date.now() / 1000))
  const fetchingEmbeddedIdsRef = useRef(new Set())

  const [curatedItems, setCuratedItems] = useState([])
  const [curatedMetaById, setCuratedMetaById] = useState({})
  const [curatedLoading, setCuratedLoading] = useState(false)
  const [curatedLoadingMore, setCuratedLoadingMore] = useState(false)
  const [curatedError, setCuratedError] = useState('')
  const [curatedCursor, setCuratedCursor] = useState(null)
  const [curatedHasMore, setCuratedHasMore] = useState(false)

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
        kinds: [1],
        authors: authorList,
        until: untilTs,
        limit: PAGE * 2
      })
      return sortEventsDescending(dedupeById(evs)).filter(isOriginalPost).slice(0, PAGE)
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

  const fetchReplySummariesFor = useCallback(async (postIds) => {
    const pool = poolRef.current
    if (!pool || readUrls.length === 0 || !Array.isArray(postIds) || postIds.length === 0) return
    try {
      const ids = [...new Set(postIds)]
      const replyEvents = await pool.querySync(readUrls, {
        kinds: [1],
        '#e': ids,
        limit: Math.max(300, ids.length * 25)
      })
      const byPost = {}
      for (const id of ids) byPost[id] = []
      for (const ev of dedupeById(replyEvents)) {
        const referenced = eventIdsFromETags(ev.tags)
        for (const refId of referenced) {
          if (byPost[refId]) byPost[refId].push(ev)
        }
      }
      for (const id of Object.keys(byPost)) {
        byPost[id] = sortEventsDescending(byPost[id])
      }
      setRepliesByPost((prev) => ({ ...prev, ...byPost }))
      setReplyCountByPost((prev) => {
        const next = { ...prev }
        for (const [id, list] of Object.entries(byPost)) next[id] = list.length
        return next
      })
      await fetchProfilesFor(replyEvents.map((e) => e.pubkey))
    } catch (e) {
      console.warn('reply-summaries', e)
    }
  }, [poolRef, readUrls, fetchProfilesFor])

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
      setRepliesByPost({})
      setReplyCountByPost({})
      if (first.length < PAGE) setHasMore(false)
      if (first.length) {
        newestTs.current = Math.max(...first.map((e) => e.created_at)) + 1
      }
      await fetchProfilesFor(first.map((e) => e.pubkey))
      await fetchReplySummariesFor(first.map((e) => e.id))
    } catch (e) {
      setError(e?.message || String(e))
      setEvents([])
    } finally {
      setLoading(false)
    }
  }, [pubkeyHex, queryFeedPage, refreshFollows, fetchProfilesFor, fetchReplySummariesFor])

  const initialLoadCurated = useCallback(async () => {
    if (!pubkeyHex || !curatedFeedBaseUrl) return
    setCuratedLoading(true)
    setCuratedError('')
    setCuratedCursor(null)
    try {
      const data = await fetchCuratedFeedPage({
        baseUrl: curatedFeedBaseUrl,
        pubkey: pubkeyHex,
        limit: PAGE
      })
      const items = Array.isArray(data.items) ? data.items : []
      const evs = items.map((it) => it.event).filter(Boolean)
      const meta = {}
      for (const it of items) {
        if (it?.event?.id && it.meta) meta[it.event.id] = it.meta
      }
      setCuratedItems(evs)
      setCuratedMetaById(meta)
      setCuratedCursor(data.paging?.nextCursor || null)
      setCuratedHasMore(!!data.paging?.hasMore)
      await fetchProfilesFor(evs.map((e) => e.pubkey))
      await fetchReplySummariesFor(evs.map((e) => e.id))
    } catch (e) {
      setCuratedError(e?.message || String(e))
      setCuratedItems([])
      setCuratedMetaById({})
    } finally {
      setCuratedLoading(false)
    }
  }, [pubkeyHex, curatedFeedBaseUrl, fetchProfilesFor, fetchReplySummariesFor])

  const loadMoreCurated = async () => {
    if (!curatedHasMore || curatedLoadingMore || !curatedCursor || !pubkeyHex || !curatedFeedBaseUrl) return
    setCuratedLoadingMore(true)
    setCuratedError('')
    try {
      const data = await fetchCuratedFeedPage({
        baseUrl: curatedFeedBaseUrl,
        pubkey: pubkeyHex,
        limit: PAGE,
        cursor: curatedCursor
      })
      const items = Array.isArray(data.items) ? data.items : []
      const newEvs = items.map((it) => it.event).filter(Boolean)
      setCuratedItems((prev) => sortEventsDescending(dedupeById([...prev, ...newEvs])))
      setCuratedMetaById((prev) => {
        const next = { ...prev }
        for (const it of items) {
          if (it?.event?.id && it.meta) next[it.event.id] = it.meta
        }
        return next
      })
      setCuratedCursor(data.paging?.nextCursor || null)
      setCuratedHasMore(!!data.paging?.hasMore)
      await fetchProfilesFor(newEvs.map((e) => e.pubkey))
      await fetchReplySummariesFor(newEvs.map((e) => e.id))
    } catch (e) {
      setCuratedError(e?.message || String(e))
    } finally {
      setCuratedLoadingMore(false)
    }
  }

  const likeEvent = useCallback(async (targetEvent) => {
    const pool = poolRef.current
    if (!targetEvent?.id) return
    if (!pool) {
      setError('Relay pool not ready yet.')
      setCuratedError('Relay pool not ready yet.')
      return
    }
    if (!secretKey || !pubkeyHex) {
      const msg = 'Like requires your private key in this session. Log in again with nsec.'
      setError(msg)
      setCuratedError(msg)
      return
    }
    if (!writeUrls.length) {
      const msg = 'Enable at least one write relay in Settings to like posts.'
      setError(msg)
      setCuratedError(msg)
      return
    }
    if (likedEventIds[targetEvent.id] || likingEventIds[targetEvent.id]) return

    setError('')
    setCuratedError('')
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
      const msg = e?.message || 'Failed to publish like event.'
      setError(msg)
      setCuratedError(msg)
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
    if (feedTab !== 'relays') return
    initialLoad()
  }, [pubkeyHex, readUrlsKey, feedTab, initialLoad])

  useEffect(() => {
    if (!pubkeyHex || feedTab !== 'curated' || !curatedFeedBaseUrl) return
    initialLoadCurated()
  }, [pubkeyHex, feedTab, curatedFeedBaseUrl, initialLoadCurated])

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
      await fetchReplySummariesFor(page.map((e) => e.id))
    } catch (e) {
      setError(e?.message || String(e))
    } finally {
      setLoadingMore(false)
    }
  }

  const openRepliesModal = async (postId) => {
    setSelectedPostId(postId)
    setShowRepliesModal(true)
    if (repliesByPost[postId]) return
    setLoadingRepliesId(postId)
    try {
      await fetchReplySummariesFor([postId])
    } finally {
      setLoadingRepliesId('')
    }
  }

  useEffect(() => {
    if (!pubkeyHex || readUrls.length === 0 || !authors.length) return
    if (feedTab !== 'relays') return
    const pool = poolRef.current
    if (!pool) return
    const id = setInterval(async () => {
      try {
        const since = newestTs.current
        const fresh = await pool.querySync(readUrls, {
          kinds: [1],
          authors,
          since,
          limit: 100
        })
        const freshOriginals = dedupeById(fresh).filter(isOriginalPost)
        if (!freshOriginals.length) return
        const top = Math.max(...fresh.map((e) => e.created_at))
        if (top >= newestTs.current) newestTs.current = top + 1
        setEvents((prev) => sortEventsDescending(dedupeById([...freshOriginals, ...prev])))
        await fetchProfilesFor(fresh.map((e) => e.pubkey))
        await fetchReplySummariesFor(freshOriginals.map((e) => e.id))
      } catch (_) {}
    }, 45000)
    return () => clearInterval(id)
  }, [pubkeyHex, readUrlsKey, authorsKey, authors, readUrls, poolRef, fetchProfilesFor, fetchReplySummariesFor, feedTab])

  if (!pubkeyHex) {
    return <Alert variant='secondary'>Log in to see your feed.</Alert>
  }

  return (
    <div>
      <div className='d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2'>
        <h1 className='h3 mb-0'>Feed</h1>
        {feedTab === 'relays'
          ? (
            <Button variant='outline-secondary' size='sm' onClick={() => initialLoad()} disabled={loading}>
              Refresh
            </Button>
            )
          : (
            <Button
              variant='outline-secondary'
              size='sm'
              onClick={() => initialLoadCurated()}
              disabled={curatedLoading || !curatedFeedBaseUrl}
            >
              Refresh
            </Button>
            )}
      </div>

      <Tab.Container activeKey={feedTab} onSelect={(k) => k && setFeedTab(k)}>
        <Nav variant='tabs' className='mb-3'>
          <Nav.Item>
            <Nav.Link eventKey='relays'>Relays</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey='curated'>Curated</Nav.Link>
          </Nav.Item>
        </Nav>
        <Tab.Content>
          <Tab.Pane eventKey='relays'>
            {!readUrls.length
              ? (
                <Alert variant='warning'>Enable at least one relay for reading in Settings.</Alert>
                )
              : (
                <>
                  <p className='text-secondary small'>
                    Original notes from you and your follows (kind 3). Newest first.
                  </p>
                  {error ? <Alert variant='danger'>{error}</Alert> : null}
                  {loading
                    ? (
                      <div className='text-center py-5'>
                        <Spinner animation='border' />
                      </div>
                      )
                    : (
                        events.map((ev) => (
                          <FeedPostCard
                            key={ev.id}
                            ev={ev}
                            profiles={profiles}
                            embeddedEvents={embeddedEvents}
                            onNostrRefs={fetchEmbeddedEvents}
                            categories={[]}
                            replyCount={replyCountByPost[ev.id] || 0}
                            likedEventIds={likedEventIds}
                            likingEventIds={likingEventIds}
                            onLike={likeEvent}
                            onOpenReplies={openRepliesModal}
                          />
                        ))
                      )}
                  {!loading && !events.length
                    ? (
                      <Alert variant='light'>No posts found yet. Try other relays or follow people.</Alert>
                      )
                    : null}
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
                </>
                )}
          </Tab.Pane>
          <Tab.Pane eventKey='curated'>
            {!curatedFeedBaseUrl
              ? (
                <Alert variant='info'>
                  Set the curated feed API URL in{' '}
                  <Link to='/settings'>Settings</Link>
                  {' '}(or <code className='small'>REACT_APP_CURATED_FEED_URL</code> at build time).
                </Alert>
                )
              : (
                <>
                  <p className='text-secondary small'>
                    Posts from the curated feed service. Categories show model-assigned labels (hover for score).
                  </p>
                  {curatedError ? <Alert variant='danger'>{curatedError}</Alert> : null}
                  {curatedLoading
                    ? (
                      <div className='text-center py-5'>
                        <Spinner animation='border' />
                      </div>
                      )
                    : (
                        curatedItems.map((ev) => {
                          const meta = curatedMetaById[ev.id] || {}
                          const cats = Array.isArray(meta.categories) ? meta.categories : []
                          return (
                            <FeedPostCard
                              key={ev.id}
                              ev={ev}
                              profiles={profiles}
                              embeddedEvents={embeddedEvents}
                              onNostrRefs={fetchEmbeddedEvents}
                              categories={cats}
                              replyCount={meta.replyCount ?? replyCountByPost[ev.id] ?? 0}
                              likedEventIds={likedEventIds}
                              likingEventIds={likingEventIds}
                              onLike={likeEvent}
                              onOpenReplies={openRepliesModal}
                            />
                          )
                        })
                      )}
                  {!curatedLoading && !curatedItems.length
                    ? (
                      <Alert variant='light'>No curated posts yet. Check the API and that your pubkey is configured on the server.</Alert>
                      )
                    : null}
                  {curatedHasMore && curatedItems.length > 0
                    ? (
                      <div className='text-center mt-3'>
                        <Button variant='primary' onClick={loadMoreCurated} disabled={curatedLoadingMore}>
                          {curatedLoadingMore ? <Spinner animation='border' size='sm' className='me-2' /> : null}
                          Load more
                        </Button>
                      </div>
                      )
                    : null}
                </>
                )}
          </Tab.Pane>
        </Tab.Content>
      </Tab.Container>

      <Modal show={showRepliesModal} onHide={() => setShowRepliesModal(false)} size='lg' centered>
        <Modal.Header closeButton>
          <Modal.Title>Replies</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {loadingRepliesId === selectedPostId
            ? (
              <div className='text-center py-4'><Spinner animation='border' /></div>
              )
            : (repliesByPost[selectedPostId] || []).length === 0
                ? (
                  <Alert variant='light' className='mb-0'>No replies found for this post.</Alert>
                  )
                : (
                    (repliesByPost[selectedPostId] || [])
                      .slice()
                      .sort((a, b) => a.created_at - b.created_at)
                      .map((reply) => (
                        <FeedPostCard
                          key={reply.id}
                          ev={reply}
                          profiles={profiles}
                          embeddedEvents={embeddedEvents}
                          onNostrRefs={fetchEmbeddedEvents}
                          categories={[]}
                          replyCount={0}
                          likedEventIds={likedEventIds}
                          likingEventIds={likingEventIds}
                          onLike={likeEvent}
                          onOpenReplies={() => {}}
                          showActions={false}
                        />
                      ))
                  )}
        </Modal.Body>
      </Modal>
    </div>
  )
}
