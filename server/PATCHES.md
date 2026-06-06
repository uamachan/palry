# Server runtime patch ledger

`server/index-runtime.js` currently generates the runtime server from `server/index.js` and applies a few production patches before importing it.

This file exists so the remaining patches are explicit and not hidden behavior.

## Active patches

### 1. Candidate profile listing

`/api/profiles` is patched so small public launches can keep showing real registered users even after likes/matches.

- Excludes blocked users only.
- Does not hide liked users.
- Does not hide matched users.
- Keeps gender filter entitlement logic.

### 2. Age validation

`register` and `profile update` are patched to normalize age to `13〜80`.

- Non-numeric values are rejected.
- Empty or out-of-range values are rejected.
- Stored value is normalized as a string.

### 3. Like delivery payload

`/api/like` is patched so first-time one-way likes return both:

```json
{
  "pending_sent": true,
  "receivedLike": { }
}
```

This keeps the server contract aligned with the frontend notification flow.

### 4. Received likes current-user endpoint

Generated runtime server exposes both routes:

```txt
GET /api/received-likes/me
GET /api/received-likes/:userId
```

Both routes use `req.authedUser.id`; the URL userId is not trusted.

## Target cleanup

Move these patches directly into `server/index.js`, then simplify `server/index-runtime.js` to only import `./index.js`, or remove it and start `server/index.js` directly.
