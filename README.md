# Troutstr

Troutstr is a React + react-bootstrap Nostr web client inspired by Astral.

It focuses on a clean MVP experience:

- Log in with an `nsec` (or hex private key)
- Configure read/write relays
- View a follow-based feed of original posts
- Expand post threads and view replies
- Like posts (publish reaction events)
- Render media links (images/videos)
- Resolve and embed linked Nostr events (`nevent` / `note`)
- Navigate profile links from post content (`naddr` / `nprofile` / `npub`)
- Optional **curated feed** tab (HTTP API) with category tags and scores on hover

## Curated feed (optional backend)

The relay feed is the default. To use the **curated** feed tab you need the sibling API service [`../troutstr-be`](../troutstr-be) (or your own deployment) running per [dev-docs/curated-feed-api-spec.md](dev-docs/curated-feed-api-spec.md).

**Client configuration**

- **Settings → Curated feed API**: save the API origin only (e.g. `http://localhost:8080`, no trailing slash).
- Or set **`REACT_APP_CURATED_FEED_URL`** at build time (same shape).

**Feed UI**

- **Relays** tab: existing Nostr relay timeline (original posts only, with likes / replies modal / Open post).
- **Curated** tab: `GET /api/v1/feeds/curated?pubkey=<hex>&category=<label>&…` via [`src/lib/curated-feed.js`](src/lib/curated-feed.js). Category filter buttons match the server taxonomy ([`CURATED_CATEGORY_TAXONOMY`](src/lib/curated-feed.js)); default selected category is **`media`**. Each post shows a small tag cloud; hover a tag to see the model **score** (tooltip).

**Server requirement**

- Your logged-in **hex pubkey** must appear in the backend’s tracked list (`TRACKED_NPUBS` or `src/config/tracked-npubs.json` in `troutstr-be`). Otherwise the API returns `403` and the Curated tab will show that error.

## Install note

This repo uses [`.npmrc`](.npmrc) `legacy-peer-deps=true` so `npm install` resolves `react-scripts` and `nostr-tools` peer expectations without extra flags.

## Tech Stack

- React (CRA)
- react-bootstrap + Bootstrap 5
- react-router
- `nostr-tools` (`SimplePool`, `nip19`, event signing)

## Project Structure

- `src/pages/Feed.jsx` - relay vs curated tabs, likes, reply modal, curated category filters
- `src/pages/Post.jsx` - single post view with replies
- `src/pages/Profile.jsx` - profile view with recent posts
- `src/components/FeedPostCard.jsx` - shared card (relay + curated); category tag cloud when meta is present
- `src/components/CategoryTagCloud.jsx` - curated category badges + score tooltips
- `src/components/NoteContent.jsx` - link/media parsing, Nostr link handling, embeds
- `src/context/NostrContext.jsx` - session, relay config, curated API base URL, pool lifecycle
- `src/lib/nostr.js` - Nostr utility helpers and local storage persistence
- `src/lib/curated-feed.js` - curated base URL persistence and `fetchCuratedFeedPage`

## Installation

### Prerequisites

- Node.js 18+ (recommended)
- npm 9+

### Setup

```bash
git clone <your-repo-url>
cd troutstr
npm install
```

## Usage

### Start development server

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000).

### Build for production

```bash
npm run build
```

### Lint

```bash
npm run lint
```

## First-Time App Flow

1. Open the app and log in with your `nsec` (or hex private key).
2. Go to **Relays** and verify your read/write relay selections.
3. Open **Feed** → **Relays** tab to load original posts from you + your follows.
4. Optionally open **Feed** → **Curated** tab (after configuring the curated API URL and server-side tracking).
5. Use:
   - **Like** to publish a reaction event (relay tab)
   - **Replies: X** to inspect reply threads in a modal
   - **Open** to navigate to the dedicated post page
6. Click author headers or profile-style Nostr links to open profile pages.

## Notes

- The app stores session/relay preferences in browser local storage.
- If no write relays are enabled, publishing actions (for example likes) will fail.
- Feed/reply/profile content depends on availability of the configured relays.
