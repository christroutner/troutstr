import React, { useEffect, useMemo, useState } from 'react'
import { nip19 } from 'nostr-tools'
import { Link } from 'react-router-dom'
import { nostrCreatedAtToDate } from '../lib/nostr'

const TOKEN_REGEX = /(https?:\/\/[^\s<>'"()[\]{}]+|nostr:[^\s<>'"()[\]{}]+)/gi
const CONTENT_PREVIEW_LIMIT = 1000

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg)(\?|$)/i
const VIDEO_EXT = /\.(mp4|webm|ogg)(\?|$)/i
const TRAILING_PUNCTUATION = /[),.;!?]+$/

function isImageUrl (url) {
  try {
    const p = new URL(url).pathname
    return IMAGE_EXT.test(p)
  } catch {
    return IMAGE_EXT.test(url)
  }
}

function isVideoUrl (url) {
  try {
    const p = new URL(url).pathname
    return VIDEO_EXT.test(p)
  } catch {
    return VIDEO_EXT.test(url)
  }
}

function shortenPubkey (hex) {
  if (!hex || hex.length < 16) return hex || ''
  return `${hex.slice(0, 8)}…${hex.slice(-6)}`
}

/**
 * Renders note text with plain URLs turned into links; image/video URLs render as media.
 */
function decodeNostrRef (value) {
  const raw = String(value || '')
  const entity = raw.startsWith('nostr:') ? raw.slice(6) : raw
  if (!entity) return null
  let decoded
  try {
    decoded = nip19.decode(entity)
  } catch {
    return null
  }
  if (decoded.type === 'nevent' && decoded.data?.id) {
    return {
      type: decoded.type,
      id: decoded.data.id,
      relays: Array.isArray(decoded.data.relays) ? decoded.data.relays : [],
      entity
    }
  }
  if (decoded.type === 'note' && typeof decoded.data === 'string') {
    return { type: decoded.type, id: decoded.data, relays: [], entity }
  }
  if (decoded.type === 'naddr' && decoded.data?.pubkey) {
    return {
      type: decoded.type,
      id: null,
      relays: Array.isArray(decoded.data.relays) ? decoded.data.relays : [],
      entity,
      profilePubkey: String(decoded.data.pubkey).toLowerCase()
    }
  }
  if (decoded.type === 'nprofile' && decoded.data?.pubkey) {
    return {
      type: decoded.type,
      id: null,
      relays: Array.isArray(decoded.data.relays) ? decoded.data.relays : [],
      entity,
      profilePubkey: String(decoded.data.pubkey).toLowerCase()
    }
  }
  if (decoded.type === 'npub' && typeof decoded.data === 'string') {
    return {
      type: decoded.type,
      id: null,
      relays: [],
      entity,
      profilePubkey: String(decoded.data).toLowerCase()
    }
  }
  return null
}

export default function NoteContent ({
  content,
  embeddedEvents = {},
  profiles = {},
  onNostrRefs,
  embedDepth = 0
}) {
  const text = content ?? ''
  const [expanded, setExpanded] = useState(false)
  const isLong = text.length > CONTENT_PREVIEW_LIMIT
  const visibleText = !isLong || expanded ? text : text.slice(0, CONTENT_PREVIEW_LIMIT)

  const { parts, nostrRefs } = useMemo(() => {
    const nextParts = []
    const refs = []
    let last = 0
    let m
    const re = new RegExp(TOKEN_REGEX.source, TOKEN_REGEX.flags)
    while ((m = re.exec(visibleText)) !== null) {
      if (m.index > last) {
        nextParts.push({ type: 'text', value: visibleText.slice(last, m.index) })
      }
      const rawToken = m[0]
      const tokenValue = rawToken.replace(TRAILING_PUNCTUATION, '')
      const trailing = rawToken.slice(tokenValue.length)
      if (tokenValue.startsWith('nostr:')) {
        const ref = decodeNostrRef(tokenValue)
        nextParts.push({ type: 'nostr', value: tokenValue, ref })
        if (ref?.id) refs.push(ref)
      } else {
        nextParts.push({ type: 'url', value: tokenValue })
      }
      if (trailing) {
        nextParts.push({ type: 'text', value: trailing })
      }
      last = m.index + m[0].length
    }
    if (last < visibleText.length) {
      nextParts.push({ type: 'text', value: visibleText.slice(last) })
    }
    if (!nextParts.length) {
      nextParts.push({ type: 'text', value: visibleText })
    }
    return { parts: nextParts, nostrRefs: refs }
  }, [visibleText])

  useEffect(() => {
    if (nostrRefs.length > 0 && typeof onNostrRefs === 'function') {
      onNostrRefs(nostrRefs)
    }
  }, [nostrRefs, onNostrRefs])

  const canRenderEmbedded = embedDepth < 1

  function renderEmbeddedEvent (ref, key) {
    if (!ref?.id) return null
    const ev = embeddedEvents[ref.id]
    if (!ev) return null
    const prof = profiles[ev.pubkey] || {}
    const name = prof.name || shortenPubkey(ev.pubkey)
    let npubDisplay = ''
    try {
      npubDisplay = nip19.npubEncode(String(ev.pubkey).toLowerCase())
    } catch {
      npubDisplay = ev.pubkey
    }
    return (
      <div key={key} className='border rounded mt-2 bg-light overflow-hidden'>
        <div className='d-flex align-items-center gap-2 py-2 px-2 border-bottom'>
          <Link to={`/profile/${ev.pubkey}`} className='post-author-link d-flex align-items-center gap-2 flex-grow-1 min-width-0'>
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
            <div className='min-width-0'>
              <div className='fw-semibold text-truncate'>{name}</div>
              <div className='small text-muted text-truncate' title={npubDisplay}>
                {shortenPubkey(npubDisplay)}
              </div>
            </div>
          </Link>
          <div className='small text-muted text-nowrap'>
            {nostrCreatedAtToDate(ev.created_at).toLocaleString()}
          </div>
        </div>
        <div className='p-2' style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          <NoteContent
            content={ev.content}
            embeddedEvents={embeddedEvents}
            profiles={profiles}
            onNostrRefs={onNostrRefs}
            embedDepth={embedDepth + 1}
          />
        </div>
      </div>
    )
  }

  return (
    <div className='note-content'>
      {parts.map((p, i) => {
        if (p.type === 'text') {
          return (
            <span key={i} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {p.value}
            </span>
          )
        }
        const url = p.value
        if (p.type === 'nostr') {
          if (p.ref?.profilePubkey) {
            return (
              <span key={i} className='d-block my-1'>
                <Link to={`/profile/${p.ref.profilePubkey}`}>
                  {url}
                </Link>
              </span>
            )
          }
          const href = p.ref?.entity ? `https://njump.me/${p.ref.entity}` : '#'
          return (
            <span key={i} className='d-block my-1'>
              <a href={href} target='_blank' rel='noopener noreferrer'>
                {url}
              </a>
              {canRenderEmbedded ? renderEmbeddedEvent(p.ref, `${i}-${p.ref?.id || 'nostr'}`) : null}
            </span>
          )
        }
        if (isImageUrl(url)) {
          return (
            <span key={i} className='d-block my-2'>
              <a href={url} target='_blank' rel='noopener noreferrer'>
                <img src={url} alt='' className='img-fluid rounded' style={{ maxHeight: '480px' }} />
              </a>
            </span>
          )
        }
        if (isVideoUrl(url)) {
          return (
            <span key={i} className='d-block my-2'>
              <video src={url} controls className='w-100 rounded' style={{ maxHeight: '480px' }}>
                <a href={url} target='_blank' rel='noopener noreferrer'>
                  Video
                </a>
              </video>
            </span>
          )
        }
        return (
          <a key={i} href={url} target='_blank' rel='noopener noreferrer'>
            {url}
          </a>
        )
      })}
      {isLong && !expanded
        ? (
          <span>
            ...
            {' '}
            <button
              type='button'
              className='btn btn-link btn-sm p-0 align-baseline'
              onClick={() => setExpanded(true)}
            >
              Show More
            </button>
          </span>
          )
        : null}
    </div>
  )
}
