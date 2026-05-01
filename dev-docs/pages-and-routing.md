# Pages and Routing

## Router Entry

- `src/App.js` defines protected and public routes.
- Authenticated pages are wrapped in a `Protected` gate keyed on `pubkeyHex`.

## Route Map

- `/login` - key-based authentication
- `/feed` - follow-based timeline of original posts
- `/settings` - relay configuration (read/write toggles)
- `/profile/:pubkey` - author profile + recent posts
- `/post/:eventId` - dedicated post view + replies

## Page Responsibilities

### Feed (`src/pages/Feed.jsx`)

- **Tabs:** **Relays** (default) — original posts from `[self + follows]` via `SimplePool`; **Curated** — posts from `GET /api/v1/feeds/curated` when `curatedFeedBaseUrl` is set
- Relays tab: fetches profile metadata and reply counts; likes; replies modal; embedded event resolution
- Curated tab: category filter buttons (taxonomy aligned with API); default category **`media`**; tag cloud with score tooltips on each post (`FeedPostCard` + `CategoryTagCloud`)

### Post (`src/pages/Post.jsx`)

- Loads one target post by event id
- Loads and displays replies for that post
- Reuses header/content rendering conventions from feed

### Profile (`src/pages/Profile.jsx`)

- Resolves profile key from route param (hex or `npub`)
- Loads kind-0 metadata and recent authored posts
- Supports embedded event behavior in profile post list

### Settings (`src/pages/Settings.jsx`)

- Relay CRUD and read/write toggles
- Curated feed API base URL field (saved to context / local storage)
- Persists relay map and curated URL used by context

### Login (`src/pages/Login.jsx`)

- Accepts `nsec` or hex private key
- Derives pubkey and initializes session
- optional persistence behavior for private key

## Navigation Semantics

- Author header in cards links to profile page
- `Open` link in feed card header links to post page
- Nostr profile-style links inside content route in-app when possible

## Why This Routing Shape

- Mirrors user mental model: timeline -> person -> single thread
- Keeps each page's data-loading concern narrow
- Encourages reusable rendering primitives (`NoteContent`, card headers)
