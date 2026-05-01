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

## Tech Stack

- React (CRA)
- react-bootstrap + Bootstrap 5
- react-router
- `nostr-tools` (`SimplePool`, `nip19`, event signing)

## Project Structure

- `src/pages/Feed.jsx` - main follow feed, likes, reply modal
- `src/pages/Post.jsx` - single post view with replies
- `src/pages/Profile.jsx` - profile view with recent posts
- `src/components/NoteContent.jsx` - link/media parsing, Nostr link handling, embeds
- `src/context/NostrContext.jsx` - session, relay config, pool lifecycle
- `src/lib/nostr.js` - Nostr utility helpers and local storage persistence

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
3. Open **Feed** to load original posts from you + your follows.
4. Use:
   - **Like** to publish a reaction event
   - **Replies: X** to inspect reply threads in a modal
   - **Open** to navigate to the dedicated post page
5. Click author headers or profile-style Nostr links to open profile pages.

## Notes

- The app stores session/relay preferences in browser local storage.
- If no write relays are enabled, publishing actions (for example likes) will fail.
- Feed/reply/profile content depends on availability of the configured relays.
