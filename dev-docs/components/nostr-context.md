# Component: NostrContext

## File

- `src/context/NostrContext.jsx`

## Responsibility

`NostrContext` is the application's Nostr runtime boundary. It centralizes:

- relay pool lifecycle (`SimplePool`)
- authenticated user session (`pubkeyHex`, `secretKey`)
- relay preferences (read/write map)
- follow list state (kind-3 derived)
- **curated feed API base URL** (`curatedFeedBaseUrl`, persisted via `src/lib/curated-feed.js` and used by the Feed page’s Curated tab)

Pages and components consume this via `useNostr()`.

## State Managed

- `relays`: persisted relay map
- `readUrls` / `writeUrls`: normalized relay URL lists derived from relay map
- `pubkeyHex`: logged-in public key
- `secretKey`: optional private key in memory
- `follows`: contact list derived from latest kind-3 event

## Persistence Choices

- Relay config, session identity, and curated API base URL are persisted in `localStorage` (see `src/lib/nostr.js` and `src/lib/curated-feed.js`)
- Private key persistence is optional and explicit via login flow

This is a conscious MVP tradeoff (simplicity over hardened secret management).

## Lifecycle

1. On mount, create one `SimplePool`
2. On unmount, destroy pool
3. On session/relay changes, recalculate derived lists and refresh follows

## API Surface Exposed to UI

- `login(input, { remember })`
- `logout()`
- `setRelays(next)`
- `setCuratedFeedBaseUrl(url)`
- `refreshFollows()`
- runtime data (`pool`, `readUrls`, `writeUrls`, `pubkeyHex`, `secretKey`, `follows`, `curatedFeedBaseUrl`)

## Why Context Instead of Global Store Library

- Current app domain is modest and mostly centered on one protocol client
- React context + hooks is sufficient and easy to reason about
- Avoids introducing Redux/Zustand complexity before it is needed
