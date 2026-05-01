# Curated Feed API Specification (Express.js)

## Purpose

This specification defines a REST API for a server-side curated feed that integrates cleanly with Troutstr while preserving compatibility with the existing Nostr event rendering pipeline.

The client's current relay-derived feed remains the default. This API adds an optional second feed mode (`curated`).

## Design Goals

- Return data in a shape that the current client can consume with minimal transformation.
- Keep event-level compatibility with Nostr (`id`, `pubkey`, `kind`, `content`, `tags`, `sig`, `created_at`).
- Support paging and deterministic ordering.
- Allow server-side filtering/ranking while staying transparent and debuggable.

## Non-Goals

- Replacing the default relay feed.
- Defining moderation policy details.
- Supporting post creation/publishing through this API.

---

## 1) API Overview

Base path:

- `/api/v1`

Primary endpoint:

- `GET /api/v1/feeds/curated`

Supporting endpoint:

- `GET /api/v1/health`

Optional explain endpoint:

- `GET /api/v1/feeds/curated/explain`

---

## 2) Authentication and Identity

The curated feed is personalized to the logged-in user.

Recommended approach:

1. Client sends:
   - `pubkey` (hex, 64 chars), and
   - a signed challenge token (NIP-42 style or custom challenge/signature scheme).
2. API verifies signature corresponds to `pubkey`.

MVP fallback (less secure):

- Accept `pubkey` without proof and rely on rate limits.

### Required request identity field

- `pubkey`: lowercase 64-char hex string.

---

## 3) Endpoint Specification

## 3.1 `GET /api/v1/feeds/curated`

Returns a curated list of Nostr events for a user.

### Query Parameters

- `pubkey` (required): user pubkey hex.
- `limit` (optional): default `50`, max `100`.
- `cursor` (optional): opaque pagination cursor from previous response.
- `since` (optional): unix timestamp; fetch events newer than timestamp.
- `mode` (optional): reserved for algorithm variants (for example `default`, `strict`, `discover`).

### Response (200)

```json
{
  "feedType": "curated",
  "version": "1",
  "pubkey": "0123abcd...",
  "items": [
    {
      "event": {
        "id": "a747a4a9f3000bad68b351a3631caa0953ec49219020c00b3e18f25d182f6ff8",
        "pubkey": "ab12...",
        "created_at": 1714580000,
        "kind": 1,
        "tags": [["p", "..."]],
        "content": "Post body...",
        "sig": "..."
      },
      "meta": {
        "score": 0.9132,
        "reasons": ["followed_author", "quality_threshold_pass"],
        "sourceRelays": ["wss://relay.damus.io"],
        "replyCount": 4
      }
    }
  ],
  "paging": {
    "nextCursor": "eyJ1bnRpbCI6MTcxNDU3OTAwMH0",
    "hasMore": true
  },
  "generatedAt": 1714580100
}
```

### Response Rules

- `items[].event` MUST be a valid Nostr event object.
- Events SHOULD be ordered newest-first by `created_at`.
- `nextCursor` MUST be opaque to clients.
- `meta` is optional, but recommended for debugging/explainability.

### Error Responses

- `400` invalid parameters
- `401` failed auth/signature
- `429` rate limited
- `500` server error

Error shape:

```json
{
  "error": {
    "code": "INVALID_PUBKEY",
    "message": "pubkey must be 64-char lowercase hex"
  }
}
```

---

## 3.2 `GET /api/v1/feeds/curated/explain` (Optional)

Returns explanation metadata without full event payloads.

Use cases:

- debugging curation policy
- admin observability
- user-facing "why am I seeing this?" UI

Minimal response:

```json
{
  "pubkey": "0123...",
  "policyVersion": "2026-05-01",
  "signals": ["follow_graph", "mute_rules", "keyword_filters", "engagement"],
  "notes": "Filtered to original posts and removed blocked authors."
}
```

---

## 4) Data Contract Details

## 4.1 Event Eligibility

For compatibility with current Troutstr feed behavior:

- Return only original kind-1 posts (no replies) by default:
  - `kind === 1`
  - no `e` tag references in `tags`

If API returns replies, include policy flag in `meta` so client can decide whether to render.

## 4.2 Follow List Dependency

Server should derive follow list from latest kind-3 event for requesting user:

- query latest kind-3 authored by `pubkey`
- parse `p` tags into follow pubkeys
- include self pubkey in candidate author set if desired by product policy

## 4.3 Signature Verification (Recommended)

Before returning events, server SHOULD verify each event signature to avoid serving invalid data:

- drop invalid events
- optionally include count of dropped events in diagnostics logs

---

## 5) Pagination Model

Use cursor pagination, not page number.

Cursor should encode at least:

- boundary timestamp (`until`)
- tiebreaker (`id`) for stable ordering when timestamps collide

### Example server cursor payload (internal)

```json
{
  "until": 1714579000,
  "lastId": "abc123..."
}
```

Client treats cursor as opaque string.

---

## 6) Express.js Implementation Blueprint

## 6.1 Suggested Project Structure

```text
src/
  app.js
  routes/
    feeds.js
    health.js
  controllers/
    curatedFeedController.js
  services/
    nostrQueryService.js
    followGraphService.js
    curationService.js
    eventValidationService.js
  middleware/
    auth.js
    rateLimit.js
    validateQuery.js
  utils/
    cursor.js
    errors.js
```

## 6.2 Minimal Route Wiring

- `GET /api/v1/health` -> liveness + dependency status
- `GET /api/v1/feeds/curated` ->
  1. validate query
  2. authenticate identity
  3. load follow set
  4. fetch candidate events from relays/store
  5. filter/rank/dedupe
  6. return shaped response

## 6.3 Curation Pipeline (Server)

1. Candidate retrieval:
   - by authors in follow set
   - bounded by cursor/since/limit
2. Normalization:
   - dedupe by `id`
   - sort by `created_at` desc
3. Filtering:
   - exclude replies (default)
   - apply mute/block/policy filters
4. Ranking:
   - assign score
   - apply threshold
5. Output shaping:
   - event + optional meta

---

## 7) Client Integration Notes (Troutstr)

For clean integration with current code:

- Keep using current render path (`NoteContent`, profile enrichment, embeds).
- Replace/augment feed data source in `Feed.jsx`:
  - default mode: existing relay query path
  - curated mode: API fetch path
- Continue running client-side safety steps:
  - `dedupeById`
  - sort by `created_at`

### Feed mode switch suggestion

- Persist mode in local storage (`default` | `curated`)
- Display active mode in Feed UI label

### Failure fallback

If curated API errors:

- show non-blocking alert
- allow one-click return to default feed mode

---

## 8) Operational Requirements

- Rate limiting per IP and/or pubkey
- Structured logs with request id and pubkey
- Timeout and retry policy for relay/backend dependencies
- Health endpoint should include dependency status

---

## 9) Security Considerations

- Validate all query params strictly.
- Sanitize and bound cursor decoding.
- Verify identity signature where possible.
- Do not trust client-provided follow lists.
- Use CORS allowlist for trusted origins.

---

## 10) Versioning and Compatibility

- Prefix routes with `/api/v1`.
- Include response `version`.
- Additive changes to `meta` are safe.
- Breaking field changes require `/api/v2`.

---

## 11) Example cURL

```bash
curl "http://localhost:8080/api/v1/feeds/curated?pubkey=<hex>&limit=50"
```

With auth header example:

```bash
curl \
  -H "Authorization: Bearer <signed-token>" \
  "http://localhost:8080/api/v1/feeds/curated?pubkey=<hex>&limit=50"
```

---

## 12) Acceptance Criteria

- Endpoint returns valid Nostr event payloads consumable by current Troutstr feed rendering.
- Pagination is deterministic and stable across repeated calls.
- Default mode remains relay-derived; curated mode is optional and switchable.
- Curated API failures do not break default feed experience.
