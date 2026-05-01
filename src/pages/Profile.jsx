import React, { useEffect, useMemo, useState } from 'react'
import { Alert, Card, Spinner } from 'react-bootstrap'
import { nip19 } from 'nostr-tools'
import { Link, useParams } from 'react-router-dom'
import NoteContent from '../components/NoteContent'
import { useNostr } from '../context/NostrContext'
import { parseProfileContent, sortEventsDescending } from '../lib/nostr'

function shortenPubkey (hex) {
  if (!hex || hex.length < 16) return hex || ''
  return `${hex.slice(0, 8)}…${hex.slice(-6)}`
}

function resolveProfileParam (param) {
  const value = String(param || '').trim()
  if (!value) return ''
  if (/^[a-fA-F0-9]{64}$/.test(value)) return value.toLowerCase()
  try {
    const decoded = nip19.decode(value)
    if (decoded.type === 'npub' && typeof decoded.data === 'string') {
      return decoded.data.toLowerCase()
    }
  } catch {}
  return ''
}

export default function Profile () {
  const { pubkey: rawPubkey } = useParams()
  const { pool: poolRef, readUrls } = useNostr()
  const [profile, setProfile] = useState({ name: '', about: '', picture: '' })
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const pubkeyHex = useMemo(() => resolveProfileParam(rawPubkey), [rawPubkey])
  const npubDisplay = useMemo(() => {
    if (!pubkeyHex) return ''
    try {
      return nip19.npubEncode(pubkeyHex)
    } catch {
      return pubkeyHex
    }
  }, [pubkeyHex])

  useEffect(() => {
    const pool = poolRef.current
    if (!pool || !readUrls.length) return
    if (!pubkeyHex) {
      setError('Invalid profile key.')
      setNotes([])
      return
    }
    let stopped = false
    setLoading(true)
    setError('')
    ;(async () => {
      try {
        const [kind0Events, postEvents] = await Promise.all([
          pool.querySync(readUrls, { kinds: [0], authors: [pubkeyHex], limit: 20 }),
          pool.querySync(readUrls, { kinds: [1, 2], authors: [pubkeyHex], limit: 20 })
        ])
        if (stopped) return
        if (kind0Events.length > 0) {
          const latest = [...kind0Events].sort((a, b) => b.created_at - a.created_at)[0]
          setProfile(parseProfileContent(latest.content))
        } else {
          setProfile({ name: '', about: '', picture: '' })
        }
        setNotes(sortEventsDescending(postEvents))
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
  }, [poolRef, readUrls, pubkeyHex])

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
        ? (
          <div className='text-center py-5'>
            <Spinner animation='border' />
          </div>
          )
        : (
          <>
            <Card className='mb-3'>
              <Card.Body className='d-flex gap-3 align-items-start'>
                {profile.picture
                  ? (
                    <img src={profile.picture} alt='' className='note-avatar' referrerPolicy='no-referrer' />
                    )
                  : (
                    <div className='note-avatar bg-secondary d-flex align-items-center justify-content-center text-white small'>
                      {(profile.name || shortenPubkey(pubkeyHex)).slice(0, 2).toUpperCase()}
                    </div>
                    )}
                <div className='min-width-0'>
                  <h1 className='h4 mb-1 text-truncate'>{profile.name || shortenPubkey(pubkeyHex)}</h1>
                  <div className='small text-muted mb-2 text-break'>{npubDisplay}</div>
                  {profile.about ? <p className='mb-0' style={{ whiteSpace: 'pre-wrap' }}>{profile.about}</p> : null}
                </div>
              </Card.Body>
            </Card>

            <h2 className='h5 mb-3'>Recent posts</h2>
            {notes.length === 0
              ? (
                <Alert variant='light'>No posts found for this profile.</Alert>
                )
              : (
                  notes.map((ev) => (
                    <Card key={ev.id} className='mb-3'>
                      <Card.Body>
                        <div className='small text-muted mb-2'>
                          {new Date(ev.created_at * 1000).toLocaleString()}
                        </div>
                        <NoteContent content={ev.content} />
                      </Card.Body>
                    </Card>
                  ))
                )}
          </>
          )}
    </div>
  )
}
