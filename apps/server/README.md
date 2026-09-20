# Yargram 0.1 server

Node.js, Express and Socket.IO API backed by an atomic JSON file. The HTTP and
realtime layers depend on repository interfaces, so the JSON repositories can
later be replaced with Prisma/PostgreSQL without changing route contracts.

## Run

```powershell
Copy-Item .env.example .env
npm install
npm run dev
```

The default listener is `0.0.0.0:3000`. When `HTTPS_PORT`, `TLS_PFX_PATH` and
`TLS_PFX_PASSWORD` are set, the same app and the same Socket.IO instance also
listen on HTTPS. Structured data is stored atomically in `data/yargram.json`;
uploaded bodies are stored under `data/uploads`. Production mode serves
`../web/dist` after all API routes and uses `index.html` as the SPA fallback.

## HTTP API

All protected endpoints expect `Authorization: Bearer <accessToken>`.

- `GET /health` and `GET /api/health`
- `POST /api/auth/register` - `{ email, password, displayName, username? }`
- `POST /api/auth/login` - `{ email, password }`
- `GET /api/auth/me`
- `PATCH /api/users/me` - at least one of `{ displayName, username, bio }`
- `POST /api/users/me/avatar` - multipart field `avatar`, JPG/PNG/WebP, up to 10 MiB
- `DELETE /api/users/me/avatar`
- `GET /api/users?q=&limit=` (alias: `/api/users/search`); `q` searches username only
- `GET /api/users/:userId`
- `PUT|DELETE /api/users/:userId/block`
- `GET /api/users/me/blocked`
- `POST /api/users/:userId/reports` - `{ reason, details? }`
- `POST /api/uploads?kind=image|file` - multipart field `file`; images up to 20 MiB, files up to 100 MiB
- `GET /api/uploads/:uploadId?t=<signed token>&download=1` - temporary signed link; non-images are forced to download
- `POST /api/conversations/direct` - `{ userId }`
- `GET /api/conversations`
- `GET /api/conversations/:conversationId/messages?limit=&before=&q=`
- `POST /api/conversations/:conversationId/messages` - `{ text?, attachmentIds?, replyToId?, forwardedFromId? }`
- `POST /api/conversations/:conversationId/read`
- `PATCH /api/conversations/:conversationId/messages/:messageId` - `{ text }`
- `DELETE /api/conversations/:conversationId/messages/:messageId`
- `POST|DELETE /api/conversations/:conversationId/messages/:messageId/reactions`
- `PUT|DELETE /api/conversations/:conversationId/messages/:messageId/favorite`
- `GET /api/favorites`
- `POST /api/conversations/:conversationId/messages/:messageId/forward`
- `PUT /api/conversations/:conversationId/pin` - `{ messageId }`
- `DELETE /api/conversations/:conversationId/pin`
- `PUT|DELETE /api/conversations/:conversationId/pins/:messageId` - individual 0.2 pins
- `PATCH /api/conversations/:conversationId/settings` - `{ archived?, mutedUntil? }`
- `GET|PUT|DELETE /api/drafts` - personal drafts: `PUT /api/drafts/:conversationId` stores `{ text, attachmentIds?, replyToId? }` for the caller only; an empty draft is removed
- `GET|POST /api/folders`, `PATCH|DELETE /api/folders/:folderId` - personal chat folders: `{ name, position?, conversationIds? }`; only the caller's own chats can be added
- `GET /api/scheduled`, `POST /api/conversations/:conversationId/scheduled`, `PATCH|DELETE /api/scheduled/:scheduledId` - delayed messages: `{ text?, attachmentIds?, replyToId?, sendAt }`; the server delivers them when due and never twice (at-least-once queue with atomic claims)

Messages expose attachments, grouped reactions, `readBy`, favorites, forwarding,
call metadata and non-recursive reply/forward snapshots. Conversation views expose
`lastMessage`, legacy `pinnedMessage`, `pinnedMessages`, `archived`, `mutedUntil`
and whether communication is blocked.

Attachment and avatar URLs returned by the API carry an expiring HMAC signature
(`MEDIA_TOKEN_TTL_SECONDS`, 24 hours by default). Without a valid token the upload
route answers 401, and a token is accepted only while the account it was issued to
still owns the file or still takes part in a conversation that references it.
Deleting a message therefore revokes the file link for the other participant.

Image type is checked from magic bytes, not only from the browser-supplied MIME.
Known PDF/archive/Office/executable signatures are also checked. Stored names are
random UUIDs. Inline rendering is limited to validated images; all other uploads
use `application/octet-stream`, `Content-Disposition: attachment`, `nosniff` and
a restrictive CSP.

## Realtime API

Socket.IO authenticates with `auth: { token }` (or a Bearer header). Message
events sent by the server include `message:new`, `message:updated`,
`message:deleted`, `message:pinned`, `conversation:pins`, `message:reaction`,
`messages:read`, `profile:updated`, `conversation:settings`, `typing:updated`
and `presence:updated`. A client may send `message:send`, `typing:start` and
`typing:stop`. Typing state expires after three seconds. Presence handles multiple
tabs and persists `lastSeenAt` after a short reconnect grace period.

`message:read` receipts, `draft:updated`, `folders:updated` and
`scheduled:updated` are delivered only to their owner's user room.

WebRTC media is peer-to-peer; the server only validates and relays signaling:

- client `call:offer` -> peer `call:incoming`
- client `call:answer` -> peer `call:answered`
- client `call:ice-candidate` -> peer `call:ice-candidate`
- client `call:mode` -> peer `call:mode` and persisted call mode
- client `call:end` -> peer `call:ended`
- invalid or unauthorized signaling -> sender `call:error`

Call start/answer/end state is stored in the JSON database. Ending, rejecting or
timing out a call creates a realtime system message with outcome and duration.
