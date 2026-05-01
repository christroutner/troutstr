# Component: NoteContent

## File

- `src/components/NoteContent.jsx`

## Responsibility

`NoteContent` renders post text safely while adding rich behavior:

- URL linkification
- inline image/video rendering
- parsing `nostr:*` references
- embedded event preview rendering
- long-content truncation with `Show More`

It is used across feed cards, post pages, profile summaries, and replies.

## Parsing Pipeline

1. Tokenize content into text and URL/nostr tokens
2. Convert tokens into render parts:
   - plain text spans
   - media blocks
   - standard links
   - Nostr references
3. Surface event references to parent via callback (`onNostrRefs`)
4. Parent fetches referenced events and passes them back via `embeddedEvents`

## Nostr Link Behavior

- `nostr:nevent` / `nostr:note`: resolve and embed event card
- `nostr:naddr` / `nostr:nprofile` / `nostr:npub`: route to profile page when pubkey is available

## Long Content Design

- Content above 1000 chars is truncated
- UI appends `... Show More`
- Expansion is per-instance local state
- Applies to both top-level and embedded post rendering

## Embedding Safeguards

- Embedded content reuses `NoteContent` to keep behavior consistent
- Depth guard prevents recursive unbounded embedding chains

## Why This Is Centralized

Keeping all content interpretation in one component ensures:

- consistent rendering rules across pages
- easier protocol-link behavior evolution
- reduced duplication and bug surface
