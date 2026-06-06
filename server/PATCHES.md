# Server patch ledger

All runtime patches previously listed here have been absorbed directly into `server/index.js`.

`server/index-runtime.js` is now a minimal passthrough (`await import('./index.js')`).

## Absorbed patches (now in index.js)

| Feature | Location in index.js |
|---|---|
| Candidate profile listing — block-only exclusion | `/api/profiles` handler |
| Age validation `cleanAge()` — range 13–80 | `register` + `profile update` handlers |
| Like delivery payload — returns `receivedLike` + `pending_sent` | `/api/like` handler |
| Received likes endpoints — `/api/received-likes/me` + `/:userId` | `sendReceivedLikesForCurrentUser` |
