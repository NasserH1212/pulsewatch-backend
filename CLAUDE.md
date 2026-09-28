# PulseWatch backend

Uptime monitoring API: checks HTTP URLs, TCP ports and hosts (ping) on a schedule,
stores results, opens incidents, pushes live updates over Socket.io, and sends
Telegram alerts. Portfolio project for a co-op application, so code quality,
security and tests matter as much as features.

## Stack

Node 20 + Express 4 + TypeScript (strict) · Prisma 5.22 + PostgreSQL (Supabase)
· zod 4 for validation · Socket.io 4 · Jest + Supertest · GitHub Actions CI.

## Commands (Windows, PowerShell)

- `npm run dev` start the API on http://localhost:4000
- `npm run build` type-check and compile (must pass before you finish)
- `npm test` run all tests (must pass before you finish)
- `npx prisma generate` after any change to `prisma/schema.prisma`
- `npm run admin:promote -- <email>` make a registered user ADMIN

## Layout

- `src/modules/<feature>/` → `*.routes.ts`, `*.controller.ts`, `*.service.ts`, `*.schemas.ts`
- `src/modules/checks/` → `scheduler.ts` (runs checks), `monitorState.ts` (pure rules),
  `retention.ts` (deletes old checks), `check.service.ts` (HTTP/PORT/PING probes)
- `src/lib/` → prisma client, JWT helpers, `validate.ts` (zod middleware)
- `src/middlewares/` → auth, RBAC, error handler
- `src/tests/` → one test file per area; `helpers.ts` has shared DB test helpers

## Conventions

- Validate every request body with a zod schema through `validateBody(...)` in the
  route. Controllers assume the body is already valid and normalized.
- Services throw `{ status, message }` for expected errors (404, 409, ...). The
  error handler formats every error as `{ error }` and never exposes 500 details.
- Keep decision logic pure (no DB, no network) in small functions like those in
  `monitorState.ts`, and unit-test them directly.
- Check results go through `recordResult` in `scheduler.ts`, which locks the monitor
  row. Keep transactions short and never make network calls inside them.
- Every feature or fix gets tests. DB tests create their own users with
  `uniqueEmail()` and delete them in `afterAll` via `cleanupUsers()`.
- Comments explain why, not what. Match the style of the existing files.

## Database and migrations (important)

`DATABASE_URL` in `.env` points at the real Supabase database, and `npm test` runs
against it too.

- Never run `prisma migrate reset`, `prisma db push` or `prisma migrate dev`.
  They can wipe or desync the real database.
- To add a migration: edit `schema.prisma`, then generate the SQL against the
  current database:

  ```
  npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script -o prisma/migrations/<YYYYMMDDHHMMSS>_<snake_name>/migration.sql
  ```

  Read the SQL, add a data backfill if existing rows need one, then run
  `npx prisma migrate deploy` and `npx prisma generate`.
- Never edit a migration that is already on GitHub; add a new one instead.

## Safety rules

- Never read, print, copy or commit `.env`. Only `.env.example` holds example values.
- Do not commit or push. Stop when the work is done; Nasser reviews the diff and
  commits himself.
- Don't upgrade Prisma to 6+ or other major versions unless asked.

## Known limitations

- PING needs the operating system's `ping` program; some cloud hosts don't have it.
- IPv6 targets are not supported (PORT targets are split on `:`).
- The scheduler assumes a single running API instance.

## Working with Nasser

Nasser is a software engineering student. When you finish, explain what you
changed and why in short, simple Gulf Arabic, keeping technical terms in English.
Point out anything he must run himself (for example a new migration).
