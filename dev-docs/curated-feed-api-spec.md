# Curated Feed API Specification (Express.js + MongoDB + Mongoose)

## Purpose

This specification defines a server-side curated feed API that integrates with Troutstr's existing client rendering pipeline. The default feed remains relay-derived; curated feed is an optional second feed source.

This version adds:

- MongoDB persistence of original posts
- Mongoose schemas and indexes
- LLM-driven post categorization labels and weights
- Prompt/response contract for robust category extraction

---

## 1) Core Requirements

- API base path: `/api/v1`
- Primary endpoint: `GET /api/v1/feeds/curated`
- Supporting endpoint: `GET /api/v1/health`
- Store each **original post** in MongoDB (not replies).
- Use `mongoose` for DB models and queries.
- Return Nostr-compatible event payloads so Troutstr can render without major changes.

---

## 2) Original Post Definition

For this system, an event is an **original post** when:

- `kind === 1`
- tags do **not** contain an `e` reference tag

Implementation hint:

```js
function isOriginalPost (ev) {
  if (!ev || ev.kind !== 1) return false
  const hasETag = (ev.tags || []).some((t) => Array.isArray(t) && t[0] === 'e' && t[1])
  return !hasETag
}
```

Replies are never inserted into `posts` collection in this spec.

---

## 3) API Endpoints

## 3.1 `GET /api/v1/feeds/curated`

Returns curated original posts for a specific user.

### Query Parameters

- `pubkey` (required): lowercase 64-char hex
- `limit` (optional): default `50`, max `100`
- `cursor` (optional): opaque paging token
- `since` (optional): unix timestamp lower bound
- `category` (optional): filter by category label (for example `news`, `opinion`)
- `mode` (optional): algorithm variant (`default`, `strict`, `discover`)

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
        "curationScore": 0.9132,
        "reasons": ["followed_author", "quality_threshold_pass"],
        "replyCount": 4,
        "categories": [
          { "label": "news", "weight": 0.81 },
          { "label": "opinion", "weight": 0.46 }
        ],
        "primaryCategory": "news",
        "classificationVersion": "v1.0.0"
      }
    }
  ],
  "paging": {
    "nextCursor": "eyJ1bnRpbCI6MTcxNDU3OTAwMCwibGFzdElkIjoiYWJjIn0",
    "hasMore": true
  },
  "generatedAt": 1714580100
}
```

### Error Responses

- `400` invalid query
- `401` auth/signature failure
- `429` rate limited
- `500` internal error

---

## 4) MongoDB Data Model (Mongoose)

## 4.1 Collection: `posts`

One document per original post (`event.id` unique).

### Required fields to copy from Nostr event

- `eventId` (string, unique) -> `event.id`
- `pubkey` (string)
- `kind` (number; always `1` here)
- `createdAt` (number unix seconds)
- `content` (string)
- `tags` (array of arrays)
- `sig` (string)

### Curated metadata fields

- `isOriginal` (boolean, true)
- `sourceRelays` (string[])
- `replyCount` (number, default 0)
- `curationScore` (number, default 0)
- `curationReasons` (string[])
- `categories` (array of `{ label, weight }`)
- `primaryCategory` (string | null)
- `classificationVersion` (string)
- `llmProvider` (string)
- `llmModel` (string)
- `classifiedAt` (Date)
- `rawClassification` (mixed/json, optional, debug/audit)

### Operational fields

- `seenAt` (Date)
- `updatedAtSource` (Date)
- `ingestionVersion` (string)

## 4.2 Suggested Mongoose Schema

```js
import mongoose from 'mongoose'

const CategoryScoreSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, lowercase: true, trim: true },
    weight: { type: Number, required: true, min: 0, max: 1 }
  },
  { _id: false }
)

const PostSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true, index: true },
    pubkey: { type: String, required: true, index: true },
    kind: { type: Number, required: true, enum: [1], index: true },
    createdAt: { type: Number, required: true, index: true },
    content: { type: String, required: true },
    tags: { type: [[String]], default: [] },
    sig: { type: String, required: true },

    isOriginal: { type: Boolean, required: true, default: true, index: true },
    sourceRelays: { type: [String], default: [] },
    replyCount: { type: Number, default: 0, min: 0 },

    curationScore: { type: Number, default: 0, index: true },
    curationReasons: { type: [String], default: [] },
    categories: { type: [CategoryScoreSchema], default: [] },
    primaryCategory: { type: String, default: null, index: true },
    classificationVersion: { type: String, default: 'v1.0.0' },
    llmProvider: { type: String, default: '' },
    llmModel: { type: String, default: '' },
    classifiedAt: { type: Date, default: null },
    rawClassification: { type: mongoose.Schema.Types.Mixed, default: null },

    seenAt: { type: Date, default: Date.now },
    updatedAtSource: { type: Date, default: Date.now },
    ingestionVersion: { type: String, default: 'v1.0.0' }
  },
  { timestamps: true, versionKey: false }
)

PostSchema.index({ isOriginal: 1, createdAt: -1, eventId: 1 })
PostSchema.index({ pubkey: 1, createdAt: -1 })
PostSchema.index({ primaryCategory: 1, createdAt: -1 })
PostSchema.index({ 'categories.label': 1, createdAt: -1 })

export const PostModel = mongoose.model('Post', PostSchema)
```

---

## 5) Category Taxonomy

Use multi-label categorization with weights in `[0..1]`.

Recommended label set:

- `news`
- `opinion`
- `question`
- `educational`
- `resource`
- `personal_update`
- `announcement`
- `promotional`
- `community`
- `entertainment`
- `media`
- `longform`

### Rules

- Store 1..N labels above a threshold (for example `>= 0.35`).
- `primaryCategory` = highest-weight label.
- Unknown labels from LLM must be dropped or mapped to `other`.

---

## 6) LLM Classification Workflow

## 6.1 High-Level Pipeline

1. Ingest candidate events from relays.
2. Keep only original posts.
3. Upsert original posts into MongoDB.
4. For posts with missing/stale classification:
   - call LLM classification service
   - validate response against schema
   - normalize labels/weights
   - update post document
5. Curated endpoint queries MongoDB and returns ranked items.

## 6.2 Prompt Input Contract

Pass to LLM:

- `eventId`
- `content`
- optional context fields:
  - author pubkey
  - createdAt
  - extracted URLs
  - language hint (if available)

## 6.3 Prompt Requirements

System prompt must instruct model to:

- choose from fixed taxonomy only
- return valid JSON only
- provide a confidence weight per chosen label in `[0,1]`
- avoid hallucinating unsupported fields

## 6.4 Example Prompt (Specification-level)

```text
You classify social posts into a fixed taxonomy.
Return JSON only with this shape:
{
  "categories": [{ "label": "news", "weight": 0.82 }],
  "primaryCategory": "news",
  "reasoning": ["short machine-readable reason strings"]
}

Allowed labels:
news, opinion, question, educational, resource, personal_update,
announcement, promotional, community, entertainment, media, longform

Rules:
- Use 1 to 4 labels max.
- weight must be between 0 and 1.
- primaryCategory must be one of the returned labels.
- If uncertain, return lower weights rather than guessing.
```

## 6.5 Expected LLM Response JSON

```json
{
  "categories": [
    { "label": "news", "weight": 0.81 },
    { "label": "opinion", "weight": 0.44 }
  ],
  "primaryCategory": "news",
  "reasoning": ["followed_source_news_link", "contains_commentary_language"]
}
```

## 6.6 Response Validation and Normalization

After LLM returns:

- validate JSON with runtime schema (zod/joi recommended)
- lowercase labels and enforce allow-list
- clamp weights to `[0,1]`
- sort descending by `weight`
- remove duplicates
- set `primaryCategory` to top weight if missing/invalid
- persist sanitized payload to `categories`, `primaryCategory`, `curationReasons`
- persist raw model output to `rawClassification` for debugging

If validation fails:

- store fallback classification:
  - `categories: []`
  - `primaryCategory: null`
  - `curationReasons: ["classification_failed"]`

---

## 7) Curated Ranking and Retrieval

## 7.1 Candidate Retrieval Query (MongoDB)

Base filters:

- `isOriginal: true`
- `kind: 1`
- `pubkey in follow-set` (derived from user's latest kind-3 follow list)
- optional category filter (`primaryCategory` or `categories.label`)

Sort:

- primary: `curationScore desc`
- secondary: `createdAt desc`
- tiebreaker: `eventId asc`

## 7.2 Cursor Pagination

Cursor should encode:

- `lastScore`
- `lastCreatedAt`
- `lastEventId`

Cursor remains opaque for client.

---

## 8) Express App Structure

```text
src/
  app.js
  config/
    mongo.js
    llm.js
  models/
    Post.js
  routes/
    feeds.js
    health.js
  controllers/
    curatedFeedController.js
  services/
    nostrIngestionService.js
    followGraphService.js
    curationService.js
    classificationService.js
    feedQueryService.js
    relayPollService.js
  jobs/
    classifyPosts.job.js
    ingestOriginalPosts.job.js
  middleware/
    auth.js
    rateLimit.js
    validateQuery.js
  utils/
    cursor.js
    taxonomy.js
    eventGuards.js
```

---

## 9) Periodic Ingestion Controller (Timer-Based)

This section defines the background ingestion system that periodically pulls fresh kind-1 events from relays, classifies new originals, and persists them to MongoDB.

## 9.1 Goal

- Poll multiple relays on a fixed interval.
- Build candidate stream from users' follow lists.
- Keep one-to-one mapping: one original post event -> one DB document.
- Classify only newly discovered, unprocessed originals.

## 9.2 Scheduling Strategy

Use a timer-driven controller (for example `setInterval`) in the API process:

- interval config: `INGEST_INTERVAL_MS` (default `120000`)
- run-at-start: immediate first pass on process boot
- overlap guard: skip tick if previous run still active

Pseudo-flow:

```js
let isRunning = false
setInterval(async () => {
  if (isRunning) return
  isRunning = true
  try {
    await runIngestionTick()
  } finally {
    isRunning = false
  }
}, INGEST_INTERVAL_MS)
```

## 9.3 Relay Configuration

Relays are defined in config file (or env-injected JSON), for example:

```js
// config/relays.js
export const INGEST_RELAYS = [
  'wss://relay.damus.io',
  'wss://nostr-pub.wellorder.net',
  'wss://relay.nostr.info'
]
```

Rules:

- Use only configured read relays for ingestion polling.
- Normalize URLs before use.
- De-duplicate relay list at startup.

## 9.4 Follow-List Source for Ingestion

Two supported modes:

1. **Per-request pull model (minimum)**
   - Ingestion only happens on API request path.
2. **Global pre-ingestion model (recommended)**
   - Maintain tracked users collection (users who have requested curated feed).
   - On each tick, for each tracked user:
     - fetch latest kind-3 from relays
     - parse `p` tags
     - build author set: follows (+ optional self)

Recommended collection:

- `tracked_users`
  - `pubkey` (unique)
  - `lastSeenAt`
  - `lastFollowSyncAt`
  - `followSetHash`

## 9.5 Ingestion Tick Algorithm

For each tracked user:

1. Resolve follow set from latest kind-3.
2. Build relay query filters:
   - `kinds: [1]`
   - `authors: followSet`
   - `since: lastIngestedAtByUser` (buffer by a few seconds to avoid clock drift)
3. Query **multiple relays** and merge results.
4. Deduplicate by `event.id`.
5. Keep only originals (`kind===1` and no `e` tags).
6. Validate event shape/signature (recommended).
7. For each surviving event:
   - upsert into `posts` by `eventId`
   - if inserted new: classify with LLM and update categories/weights
   - if already exists: skip reclassification unless stale policy/version
8. Update user's ingestion cursor/watermark.

## 9.6 Duplicate Rejection and One-to-One Guarantee

Requirements:

- `posts.eventId` must be unique indexed.
- Use atomic upsert:
  - `updateOne({ eventId }, { $setOnInsert: ... }, { upsert: true })`
- Treat duplicate key errors as benign race outcomes.

One-to-one invariant:

- exactly one DB record per original post event id.

## 9.7 Classification Trigger Rules

Classify only when:

- post is newly inserted, OR
- `classificationVersion` is outdated and reclassification is enabled.

Do **not** classify:

- replies
- invalid event signatures
- posts already classified with current policy version (unless forced)

## 9.8 Fault Tolerance / Reliability

- Relay timeout per query (for example 5-10s)
- Per-relay failures should be soft; continue with remaining relays
- Batch LLM classification with bounded concurrency
- Retry classification with backoff on transient failures
- Dead-letter/failure marker for persistent classification errors

Recommended post-level fields:

- `classificationStatus`: `pending|completed|failed`
- `classificationError`: short machine-readable code
- `classificationAttempts`: number

## 9.9 Observability

Emit per-tick metrics:

- users processed
- relays queried
- events fetched
- original posts kept
- inserted vs duplicate counts
- classification success/failure counts
- run duration

Log key ids:

- `tickId`, `pubkey`, `relay`, `eventId`, `classificationStatus`

---

## 10) Client Compatibility Notes (Troutstr)

- Keep response `items[].event` as valid Nostr event objects.
- Troutstr can continue to use:
  - dedupe by event id
  - created_at sorting safeguards
  - existing render components (`NoteContent`, profile fetches, embeds)
- Curated feed mode should be switchable and non-breaking when API fails.

### Implemented mapping (reference client)

The Troutstr app ([`nostr/troutstr`](../../troutstr)):

- Persists curated API origin via **Settings** and `localStorage` (`src/lib/curated-feed.js`); optional build-time `REACT_APP_CURATED_FEED_URL`.
- **Feed** page: **Relays** vs **Curated** tabs; curated requests use `GET /api/v1/feeds/curated` with `pubkey`, `cursor`, and `category` (taxonomy label). Default selected category in the UI is **`media`**.
- Renders `items[].meta.categories` as a tag cloud; hover shows **weight** (score).
- Viewer `pubkey` must be listed as a **tracked user** on the server (`troutstr-be` `TRACKED_NPUBS` or `src/config/tracked-npubs.json`); otherwise `403 PUBKEY_NOT_CONFIGURED`.

---

## 11) Security and Ops

- Validate `pubkey`, `limit`, `cursor`, `since`, `category`.
- Use CORS allowlist.
- Rate limit by IP and pubkey.
- Log request ids and classification failures.
- Expose dependency state in `/health`:
  - MongoDB connectivity
  - relay ingestion status
  - LLM provider reachability (optional)

---

## 12) Example cURL

```bash
curl "http://localhost:8080/api/v1/feeds/curated?pubkey=<hex>&limit=50"
```

With category filter:

```bash
curl "http://localhost:8080/api/v1/feeds/curated?pubkey=<hex>&category=news&limit=25"
```

---

## 13) Acceptance Criteria

- Every stored document in `posts` represents an original kind-1 post only.
- `eventId` uniqueness prevents duplicates.
- Curated endpoint returns Nostr-compatible event payloads.
- Category labels and weights are persisted from validated LLM output.
- Invalid LLM output fails safe and does not break endpoint responses.
- Default Troutstr relay feed remains available and unaffected.
- Timer ingestion polls configured relays periodically without overlapping runs.
- New originals are upserted once and classified once per policy version.
