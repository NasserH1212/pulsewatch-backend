# PulseWatch

Self-hosted infrastructure uptime & alerting API. PulseWatch periodically checks HTTP endpoints, TCP ports, and hosts (ICMP ping), stores historical results, pushes live status updates over WebSockets, and sends Telegram alerts the moment something goes down — and again when it recovers.

> Built as a portfolio project to demonstrate backend architecture, real-time systems, and applied security practices (RBAC, JWT, rate limiting) beyond typical CRUD apps.

## Features

- ✅ HTTP / TCP Port / ICMP Ping checks, each monitor on its own interval
- ✅ Concurrent checks with a cap, so slow or timing-out targets never block the rest
- ✅ Real-time status updates via Socket.io, authenticated with the same JWT as the API
- ✅ Failure threshold per monitor (default 2 failed checks in a row), with a fast 20s re-check to confirm, so one network blip never pages anyone
- ✅ Automatic incident tracking (opens on a confirmed outage, dated from the first failure; closes on recovery), race-safe via row locking
- ✅ Telegram alerts on status change (once per transition, never repeated)
- ✅ Automatic cleanup of check history older than 30 days (configurable)
- ✅ JWT authentication: 15-min access token + httpOnly refresh cookie
- ✅ Refresh token rotation with reuse detection (a replayed token revokes all of that user's sessions)
- ✅ Role-based access control (ADMIN can manage monitors, VIEWER is read-only)
- ✅ Rate-limited register / login / refresh endpoints
- ✅ Request validation with zod: type-specific targets, normalized emails, field-level error messages
- ✅ Consistent JSON errors: 400 / 404 / 409 where they belong, and 500s never leak internal details
- ✅ Graceful shutdown on SIGTERM (scheduler, sockets, DB connections)
- ✅ HMAC signature middleware ready for a future agent push endpoint

## Architecture

```
Request → Middleware (auth, RBAC, rate-limit) → Controller → Service → Prisma → PostgreSQL
                                                                  ↓
                                                    Check scheduler → Socket.io broadcast
                                                                  ↓
                                                          Telegram alert (on state change)
```

Each module (`auth`, `monitors`, `checks`, `alerts`) is self-contained under `src/modules/`, with the HTTP layer (controller/routes) separated from business logic (service) — services have no Express dependency, so they're directly unit-testable.

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js + Express + TypeScript |
| Database | PostgreSQL + Prisma ORM |
| Real-time | Socket.io |
| Scheduling | Custom interval scheduler (5s tick, per-monitor intervals) |
| Auth | JWT (jsonwebtoken), bcryptjs for passwords, SHA-256 for refresh tokens |
| Testing | Jest + Supertest |
| CI/CD | GitHub Actions |

## Getting Started

```bash
# 1. Start PostgreSQL
docker compose up -d

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# edit .env — at minimum set JWT_ACCESS_SECRET / JWT_REFRESH_SECRET

# 4. Apply migrations
npx prisma migrate deploy

# 5. Start the dev server
npm run dev
```

API is now live at `http://localhost:4000`. Health check: `GET /health`.

**Create the first admin.** Registration always creates VIEWER accounts. Register through the API, then promote yourself:

```bash
npm run admin:promote -- you@example.com
```

Log in again afterwards; the role is carried inside the access token.

## API Overview

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | — | Create an account (default role: VIEWER) |
| POST | `/api/auth/login` | — | Returns access token, sets refresh cookie |
| POST | `/api/auth/refresh` | Refresh cookie | New access token; rotates the refresh cookie |
| POST | `/api/auth/logout` | Refresh cookie | Revokes the session, clears the cookie |
| GET | `/api/auth/me` | Any authed user | Current user |
| GET | `/api/monitors` | Any authed user | List all monitors with latest status |
| GET | `/api/monitors/:id` | Any authed user | Monitor detail + check/incident history |
| POST | `/api/monitors` | ADMIN | Create a monitor (see below) |
| DELETE | `/api/monitors/:id` | ADMIN | Remove a monitor |

**Creating a monitor.** The target format depends on the type:

| type | target example | Optional fields |
|---|---|---|
| `HTTP` | `https://example.com/health` | `intervalSeconds` (10 – 86400, default 60) |
| `PORT` | `db.example.com:5432` | `failureThreshold` (1 – 10, default 2) |
| `PING` | `8.8.8.8` or `example.com` | |

```json
{ "name": "Main site", "type": "HTTP", "target": "https://example.com", "intervalSeconds": 60 }
```

**Errors** always have the same shape. Invalid bodies also list each field:

```json
{ "error": "Invalid request body",
  "details": [{ "field": "target", "message": "HTTP target must be a full URL, e.g. https://example.com/health" }] }
```

**Socket.io.** Connect with the access token, otherwise the connection is refused:

```js
const socket = io(API_URL, { auth: { token: accessToken } });
socket.on('check:update', (e) => {
  // e.status              confirmed monitor state: 'UP' | 'DOWN' | null (not confirmed yet)
  // e.checkStatus         raw result of this one check: 'UP' | 'DOWN'
  // e.consecutiveFailures failed checks in a row
  // e.monitorId, e.responseTimeMs, e.checkedAt
});
```

The server disconnects a socket when its token expires; reconnect with a fresh one.

## Configuration

Set in `.env` (see `.env.example`). Only the first three are required.

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | — | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | — | Two different random secrets |
| `CHECK_RETENTION_DAYS` | `30` | Days of check history to keep; `0` keeps everything |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | empty | Alerts are off when empty |
| `CLIENT_URL` | `http://localhost:5173` | Frontend origin allowed by CORS and sockets |
| `PORT` | `4000` | HTTP port |

## Testing

```bash
npm test
```

| File | Needs DB | Covers |
|---|---|---|
| `monitorState.test.ts` | No | Intervals, retry timing, failure threshold state machine |
| `tokens.test.ts` | No | Token hashing, socket handshake auth |
| `validation.test.ts` | No | Target formats, schemas, JSON 400/404 responses |
| `auth.test.ts` | Yes | Register, login, `/me`, refresh rotation, reuse detection, logout |
| `monitors.test.ts` | Yes | RBAC, validation and 404s on monitor endpoints, admin promotion |
| `scheduler.test.ts` | Yes | Threshold, incidents and alerts, including concurrent results |
| `retention.test.ts` | Yes | Old checks deleted, recent checks and incidents kept |

DB tests clean up the users and monitors they create. CI runs everything against a fresh Postgres.

## Roadmap

- [ ] React + TypeScript dashboard (live status grid + Recharts uptime history)
- [ ] Public status page (read-only, no auth)
- [ ] External agent push endpoint using the existing HMAC middleware
- [x] Per-monitor check intervals
- [x] Refresh / logout / me endpoints with token rotation
- [x] Input validation with zod
- [x] Consecutive-failure threshold before alerting
- [x] Check history retention
- [ ] Uptime / response-time stats endpoint
- [ ] Edit and pause monitors

## License

MIT
