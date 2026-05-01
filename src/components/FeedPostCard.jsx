import React from 'react'
import { Button, Card } from 'react-bootstrap'
import { nip19 } from 'nostr-tools'
import { Link } from 'react-router-dom'
import CategoryTagCloud from './CategoryTagCloud'
import NoteContent from './NoteContent'

function shortenPubkey (hex) {
  if (!hex || hex.length < 16) return hex || ''
  return `${hex.slice(0, 8)}…${hex.slice(-6)}`
}

/**
 * Shared card for relay and curated feeds.
 */
export default function FeedPostCard ({
  ev,
  profiles,
  embeddedEvents,
  onNostrRefs,
  categories,
  replyCount = 0,
  likedEventIds,
  likingEventIds,
  onLike,
  onOpenReplies,
  showActions = true
}) {
  const prof = profiles[ev.pubkey] || {}
  const name = prof.name || shortenPubkey(ev.pubkey)
  let npubDisplay = ''
  try {
    npubDisplay = nip19.npubEncode(String(ev.pubkey).toLowerCase())
  } catch {
    npubDisplay = ev.pubkey
  }

  return (
    <Card className='mb-3'>
      <Card.Header className='d-flex align-items-center gap-2 py-2'>
        <Link to={`/profile/${ev.pubkey}`} className='post-author-link d-flex align-items-center gap-2 flex-grow-1 min-width-0'>
          {prof.picture
            ? (
              <img src={prof.picture} alt='' className='note-avatar' referrerPolicy='no-referrer' />
              )
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
        <Link to={`/post/${ev.id}`} className='small text-decoration-none'>
          Open
        </Link>
        <div className='small text-muted text-nowrap'>
          {new Date(ev.created_at * 1000).toLocaleString()}
        </div>
      </Card.Header>
      <Card.Body>
        <CategoryTagCloud categories={categories} />
        <NoteContent
          content={ev.content}
          embeddedEvents={embeddedEvents}
          profiles={profiles}
          onNostrRefs={onNostrRefs}
        />
      </Card.Body>
      {showActions
        ? (
          <Card.Footer className='d-flex align-items-center gap-2'>
            <Button
              variant={likedEventIds[ev.id] ? 'success' : 'outline-secondary'}
              size='sm'
              onClick={() => onLike(ev)}
              disabled={Boolean(likingEventIds[ev.id]) || likedEventIds[ev.id]}
            >
              {likingEventIds[ev.id] ? 'Liking…' : likedEventIds[ev.id] ? 'Liked' : 'Like'}
            </Button>
            <Button
              variant='outline-primary'
              size='sm'
              onClick={() => onOpenReplies(ev.id)}
            >
              Replies: {replyCount}
            </Button>
          </Card.Footer>
          )
        : null}
    </Card>
  )
}
