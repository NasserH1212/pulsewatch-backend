# PulseWatch

Self-hosted infrastructure uptime & alerting API. PulseWatch periodically checks HTTP endpoints, TCP ports, and hosts (ICMP ping), stores historical results, pushes live status updates over WebSockets, and sends Telegram alerts the moment something goes down — and again when it recovers.

> Built as a portfolio project to demonstrate backend architecture, real-time systems, and applied security practices (RBAC, JWT, rate limiting) beyond typical CRUD apps.

## Features

- ✅ HTTP / TCP Port / ICMP Ping checks on a configurable schedule
- ✅ Real-time status updates via Socket.io — no polling on the frontend
- ✅ Automatic incident tracking (opens on failure, closes on recovery)
- ✅ Telegram alerts on status change
- ✅ JWT authentication (short-lived access token + httpOnly refresh cookie)
- ✅ Role-based access control (ADMIN can manage monitors, VIEWER is read-only)
- ✅ Rate-limited login endpoint
- ✅ HMAC-authenticated endpoint reserved for external push agents

## Architecture

```
Request → Middleware (auth, RBAC, rate-limit) → Controller → Service → Prisma → PostgreSQL
                                                                  ↓
                                                    Cron scheduler → Socket.io broadcast
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
| Scheduling | node-cron |
| Auth | JWT (jsonwebtoken) + bcryptjs |
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

# 4. Run migrations
npx prisma migrate dev --name init

# 5. Start the dev server
npm run dev
```

API is now live at `http://localhost:4000`. Health check: `GET /health`.

## API Overview

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | — | Create an account (default role: VIEWER) |
| POST | `/api/auth/login` | — | Returns access token, sets refresh cookie |
| GET | `/api/monitors` | Any authed user | List all monitors with latest status |
| GET | `/api/monitors/:id` | Any authed user | Monitor detail + check/incident history |
| POST | `/api/monitors` | ADMIN | Create a monitor |
| DELETE | `/api/monitors/:id` | ADMIN | Remove a monitor |

Socket.io event: `check:update` → `{ monitorId, status, responseTimeMs, checkedAt }`

## Testing

```bash
npm test
```

`src/tests/auth.test.ts` is a starting example — add one test file per module as you build out `monitors` and `checks`.

## Roadmap

- [ ] React + TypeScript dashboard (live status grid + Recharts uptime history)
- [ ] Public status page (read-only, no auth)
- [ ] External agent push endpoint using the existing HMAC middleware
- [ ] Per-monitor check intervals (currently all monitors share one 30s tick)

## License

MIT
