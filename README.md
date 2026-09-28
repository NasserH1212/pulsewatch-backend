# PulseWatch

Self-hosted infrastructure uptime & alerting API. PulseWatch periodically checks HTTP endpoints, TCP ports, and hosts (ICMP ping), stores historical results, pushes live status updates over WebSockets, and sends Telegram alerts the moment something goes down — and again when it recovers.

> Built as a portfolio project to demonstrate backend architecture, real-time systems, and applied security practices (RBAC, JWT, rate limiting) beyond typical CRUD apps.

## Features

- ✅ HTTP / TCP Port / ICMP Ping checks, each monitor on its own interval
- ✅ Concurrent checks with a cap, so slow or timing-out targets never block the rest
- ✅ Real-time status updates via Socket.io, authenticated with the same JWT as the API
- ✅ Automatic incident tracking (opens on failure, closes on recovery), race-safe via row locking
- ✅ Telegram alerts on status change (once per transition, never repeated)
- ✅ JWT authentication: 15-min access token + httpOnly refresh cookie
- ✅ Refresh token rotation with reuse detection (a replayed token revokes all of that user's sessions)
- ✅ Role-based access control (ADMIN can manage monitors, VIEWER is read-only)
- ✅ Rate-limited register / login / refresh endpoints
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
| POST | `/api/monitors` | ADMIN | Create a monitor |
| DELETE | `/api/monitors/:id` | ADMIN | Remove a monitor |

**Socket.io.** Connect with the access token, otherwise the connection is refused:

```js
const socket = io(API_URL, { auth: { token: accessToken } });
socket.on('check:update', ({ monitorId, status, responseTimeMs, checkedAt }) => { /* ... */ });
```

The server disconnects a socket when its token expires; reconnect with a fresh one.

## Testing

```bash
npm test
```

| File | Needs DB | Covers |
|---|---|---|
| `monitorState.test.ts` | No | Interval and UP/DOWN transition rules |
| `tokens.test.ts` | No | Token hashing, socket handshake auth |
| `auth.test.ts` | Yes | Register, login, `/me`, refresh rotation, reuse detection, logout |
| `monitors.test.ts` | Yes | RBAC on monitor endpoints, admin promotion |
| `scheduler.test.ts` | Yes | Incidents and alerts, including concurrent results |

DB tests clean up the users and monitors they create. CI runs everything against a fresh Postgres.

## Roadmap

- [ ] React + TypeScript dashboard (live status grid + Recharts uptime history)
- [ ] Public status page (read-only, no auth)
- [ ] External agent push endpoint using the existing HMAC middleware
- [x] Per-monitor check intervals
- [x] Refresh / logout / me endpoints with token rotation
- [ ] Input validation with zod
- [ ] Consecutive-failure threshold before alerting
- [ ] Check history retention
- [ ] Uptime / response-time stats endpoint

## License

MIT
