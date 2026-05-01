# Troutstr Developer Docs

This documentation explains Troutstr's architecture, major design decisions, and how app components connect.

## Documentation Map

- [`architecture-overview.md`](./architecture-overview.md)
  - System boundaries, app layers, and key tradeoffs
- [`nostr-data-flow.md`](./nostr-data-flow.md)
  - How data moves from relays into UI
- [`components/nostr-context.md`](./components/nostr-context.md)
  - Session state, relay config, and `SimplePool` lifecycle
- [`components/note-content.md`](./components/note-content.md)
  - Text/link/media parsing, Nostr link handling, and embed behavior
- [`pages-and-routing.md`](./pages-and-routing.md)
  - Route topology and page responsibilities

## Read Order

1. Start with `architecture-overview.md`
2. Continue with `nostr-data-flow.md`
3. Read component and page docs for implementation detail

## Scope Notes

- These docs focus on the current MVP implementation in `src/`.
- They document intentional simplifications versus legacy Astral architecture.
