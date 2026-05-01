import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Card, Spinner } from 'react-bootstrap'
import { nip19 } from 'nostr-tools'
import { Link, useParams } from 'react-router-dom'
import NoteContent from '../components/NoteContent'
import { useNostr } from '../context/NostrContext'
import { dedupeById, parseProfileContent, sortEventsDescending } from '../lib/nostr'

function shortenPubkey (hex) {
  if (!hex || hex.length < 16) return hex || ''
  return `${hex.slice(0, 8)}…${hex.slice(-6)}`
}

function latestKind0ByPubkey (events) {
  const byPk = {}
  for (const e of events) {
    if (e.kind !== 0 || !e.pubkey) continue
    const prev = byPk[e.pubkey]
    if (!prev || e.created_at > prev.created_at) byPk[e.pubkey] = e
  }
  return byPk
}

export default function Post () {
  const { eventId } = useParams()
  const { pool: poolRef, readUrls } = useNostr()
  const [post, setPost] = useState(null)
  const [replies, setReplies] = useState([])
  const [profiles, setProfiles] = useState({})
  const [embeddedEvents, setEmbeddedEvents] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const fetchingEmbeddedIdsRef = useRef(new Set())

  const postId = useMemo(() => String(eventId || '').trim().toLowerCase(), [eventId])

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

  const fetchProfilesFor = useCallback(async (pubkeys) => {
    const pool = poolRef.current
    if (!pool || !readUrls.length || !Array.isArray(pubkeys) || !pubkeys.length) return
    try {
      const batch = [...new Set(pubkeys)].slice(0, 200)
      const kind0Events = await pool.querySync(readUrls, {
        kinds: [0],
        authors: batch,
        limit: batch.length * 4
      })
      mergeProfiles(kind0Events)
    } catch (e) {
      console.warn('post-page-profiles', e)
    }
  }, [poolRef, readUrls, mergeProfiles])

  const fetchEmbeddedEvents = useCallback(async (refs) => {
    const pool = poolRef.current
    if (!pool || !readUrls.length || !Array.isArray(refs) || !refs.length) return
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
      const evs = await pool.querySync([...relaySet], {
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
          for (const ev of foundEvents) next[ev.id] = ev
          return next
        })
        await fetchProfilesFor(foundEvents.map((e) => e.pubkey))
      }
    } catch (e) {
      console.warn('post-page-embedded', e)
    } finally {
      for (const id of missingIds) fetchingEmbeddedIdsRef.current.delete(id)
    }
  }, [poolRef, readUrls, embeddedEvents, fetchProfilesFor])

  useEffect(() => {
    const pool = poolRef.current
    if (!pool || !readUrls.length) return
    if (!/^[a-f0-9]{64}$/.test(postId)) {
      setError('Invalid post id.')
      setPost(null)
      setReplies([])
      return
    }
    let stopped = false
    setLoading(true)
    setError('')
    ;(async () => {
      try {
        const [targetEvents, replyEvents] = await Promise.all([
          pool.querySync(readUrls, { ids: [postId], limit: 20 }),
          pool.querySync(readUrls, { kinds: [1], '#e': [postId], limit: 300 })
        ])
        if (stopped) return
        const target = dedupeById(targetEvents).sort((a, b) => b.created_at - a.created_at)[0] || null
        if (!target) {
          setError('Post not found on current relays.')
          setPost(null)
          setReplies([])
          return
        }
        const dedupedReplies = dedupeById(replyEvents).filter((ev) => ev.id !== postId)
        setPost(target)
        setReplies(sortEventsDescending(dedupedReplies))
        await fetchProfilesFor([target.pubkey, ...dedupedReplies.map((e) => e.pubkey)])
      } catch (e) {
        if (stopped) return
        setError(e?.message || String(e))
      } finally {
        if (!stopped) setLoading(false)
      }
    })()
    return () => {
      stopped = true
    }
  }, [poolRef, readUrls, postId, fetchProfilesFor])

  function renderHeader (ev) {
    const prof = profiles[ev.pubkey] || {}
    const name = prof.name || shortenPubkey(ev.pubkey)
    let npubDisplay = ''
    try {
      npubDisplay = nip19.npubEncode(String(ev.pubkey).toLowerCase())
    } catch {
      npubDisplay = ev.pubkey
    }
    return (
      <Card.Header className='d-flex align-items-center gap-2 py-2'>
        <Link to={`/profile/${ev.pubkey}`} className='post-author-link d-flex align-items-center gap-2 flex-grow-1 min-width-0'>
          {prof.picture
            ? <img src={prof.picture} alt='' className='note-avatar' referrerPolicy='no-referrer' />
            : (
              <div className='note-avatar bg-secondary d-flex align-items-center justify-content-center text-white small'>
                {name.slice(0, 2).toUpperCase()}
              </div>
              )}
          <div className='min-width-0'>
            <div className='fw-semibold text-truncate'>{name}</div>
            <div className='small text-muted text-truncate' title={npubDisplay}>
              {shortenPubkey(npubDisplay)}
            </div>
          </div>
        </Link>
        <div className='small text-muted text-nowrap'>
          {new Date(ev.created_at * 1000).toLocaleString()}
        </div>
      </Card.Header>
    )
  }

  if (!readUrls.length) {
    return <Alert variant='warning'>Enable at least one read relay in Settings.</Alert>
  }

  return (
    <div>
      <div className='mb-3'>
        <Link to='/feed' className='small text-decoration-none'>← Back to feed</Link>
      </div>
      {error ? <Alert variant='danger'>{error}</Alert> : null}
      {loading
        ? <div className='text-center py-5'><Spinner animation='border' /></div>
        : (
          <>
            {post
              ? (
                <Card className='mb-3'>
                  {renderHeader(post)}
                  <Card.Body>
                    <NoteContent
                      content={post.content}
                      embeddedEvents={embeddedEvents}
                      profiles={profiles}
                      onNostrRefs={fetchEmbeddedEvents}
                    />
                  </Card.Body>
                </Card>
                )
              : null}
            <h2 className='h5 mb-3'>Replies ({replies.length})</h2>
            {replies.length === 0
              ? <Alert variant='light'>No replies found for this post.</Alert>
              : replies
                .slice()
                .sort((a, b) => a.created_at - b.created_at)
                .map((reply) => (
                  <Card key={reply.id} className='mb-3'>
                    {renderHeader(reply)}
                    <Card.Body>
                      <NoteContent
                        content={reply.content}
                        embeddedEvents={embeddedEvents}
                        profiles={profiles}
                        onNostrRefs={fetchEmbeddedEvents}
                      />
                    </Card.Body>
                  </Card>
                ))}
          </>
          )}
    </div>
  )
}
