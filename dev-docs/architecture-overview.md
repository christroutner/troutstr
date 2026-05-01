# Architecture Overview

## Goal

Troutstr is a Nostr web client that prioritizes a simple, understandable React architecture while supporting core social features:

- login with `nsec`
- follow-based relay feed (default)
- optional **curated** feed tab backed by a separate HTTP API ([`troutstr-be`](../../troutstr-be))
- relay configuration and optional curated API base URL
- post/reply exploration
- event embedding

## Why This Architecture

The reference client (Astral) used a complex stack (Vue/Quasar, workers, sql.js). Troutstr intentionally uses:

- React components + hooks
- one in-memory `SimplePool` relay client
- browser `localStorage` for lightweight persistence

### Decision Rationale

- **Fast iteration:** fewer moving pieces than worker/database pipelines
- **Lower cognitive load:** logic stays in page/component hooks
- **Good enough for MVP:** correctness and feature completeness first, optimization later

## High-Level Layers

1. **Protocol/utility layer**
   - `src/lib/nostr.js`
   - decoding keys, relay URL normalization, event sort/dedupe helpers, profile/contact parsing
2. **State/provider layer**
   - `src/context/NostrContext.jsx`
   - owns session, relays, follows, curated feed base URL, and pool lifecycle
3. **Page orchestration layer**
   - `src/pages/*.jsx`
   - performs event queries and assembles view models
4. **Rendering primitives**
   - `src/components/NoteContent.jsx`
   - rich text rendering, media handling, Nostr-link routing/embed behavior

## Core Architectural Patterns

- **Context as app boundary:** pages access Nostr state through `useNostr()`
- **Query + normalize + render loop:**
  - query events from relays
  - dedupe/sort
  - fetch supporting metadata (kind 0 profiles)
  - render cards
- **Progressive enrichment:**
  - content initially renders as text/links
  - linked events are fetched and embedded afterward

## Known Constraints

- No worker-backed local event database
- Polling-based refresh rather than full streaming timelines
- Write interactions currently focused on reactions (likes)

## Future Evolution (Expected)

- Introduce a normalized event cache/store to reduce duplicate queries
- Incremental stream subscriptions for lower-latency updates
- Expand authoring actions (new posts/replies) and stronger thread semantics
