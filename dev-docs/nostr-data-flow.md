# Nostr Data Flow

## End-to-End Flow

1. User logs in with `nsec` or hex private key.
2. `NostrContext` derives pubkey and initializes runtime state.
3. App fetches latest kind-3 contact list for the user.
4. Feed queries kind-1 events from `[self + follows]`.
5. Events are deduped/sorted, then rendered.
6. Missing profile metadata (kind 0) is batch fetched and merged.
7. `NoteContent` parses links:
   - media URLs render inline
   - `nostr:*` links may trigger event embed fetches or in-app routing

## Curated feed tab (HTTP)

When the user selects the **Curated** tab on the Feed and a base URL is configured (`NostrContext` / Settings / `REACT_APP_CURATED_FEED_URL`):

1. `fetchCuratedFeedPage` in `src/lib/curated-feed.js` calls `GET /api/v1/feeds/curated` with `pubkey`, optional `cursor`, and optional `category` (taxonomy label).
2. Response `items[].event` is rendered like relay events; `items[].meta.categories` drives the tag cloud (scores in tooltips).
3. Profile enrichment for visible authors still uses relays + `SimplePool` (same as relay tab).

The backend must list the viewer’s pubkey as a tracked user; otherwise the API returns `403`.

## Query Strategy

- **Feed pages:** page-sized historical queries with `until` cursor
- **Refresh:** periodic `since` polling for new events
- **Replies:** query by `#e` tags using parent id
- **Single post page:** query direct `ids: [eventId]`, then replies by `#e`

## Event Normalization

- `dedupeById` keeps one event per id (latest timestamp wins)
- `sortEventsDescending` controls timeline order
- reply association is computed from `e` tags

## Profile Enrichment

- Pages collect visible author pubkeys
- Kind-0 metadata fetched in batch
- latest kind-0 per pubkey is selected
- UI falls back to shortened keys when metadata is missing

## Embedded Event Flow

1. `NoteContent` detects `nostr:nevent` / `nostr:note`.
2. It surfaces references via callback to the page.
3. Page resolves referenced events through relays and caches results.
4. Embedded cards render with profile headers and truncated content behavior.

## Publish Flow (Like)

1. User clicks `Like`.
2. Page constructs unsigned kind-7 reaction event with `e` and `p` tags.
3. Event is signed with session private key.
4. Event is published to write-enabled relays.

## Error Handling Pattern

- Query failures surface as page-level alerts where relevant.
- Background enrichment failures are logged and fail soft (feed still renders).
