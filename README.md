# Postgres Safety Proxy for AI Agents

A small proxy that sits between an AI agent and a PostgreSQL database. Every SQL statement is parsed, its blast radius (rows affected) is measured in a dry run, and risky statements wait for a human to approve them.

> **Status: early prototype (v0).** It works end to end on a local machine. See [Status](#status) for what is done and what is not.

## Why

AI coding agents have deleted production databases and their backups in seconds. This project puts a checkpoint in front of the database: small, safe changes go through, and anything large or destructive is held until a person approves it.

## How it works

```
                 ┌────────────────────────────────────────────┐
  AI agent ────► │ Agent plane  :8000   POST /api/query       │
                 │   1. parse SQL (real Postgres parser)      │
                 │   2. run it inside a transaction           │
                 │   3. count affected rows                   │
                 │   4. small change  -> COMMIT (auto)        │
                 │      anything else -> ROLLBACK + queue it  │
                 └───────────────┬────────────────────────────┘
                                 │
          ┌──────────────────────┴───────────────────────┐
          ▼                                              ▼
   Target DB (the agent's data)               Control DB (audit log, approvals)
   used by the restricted `ai_agent` user     the agent has no permissions on it

                 ┌────────────────────────────────────────────┐
  Human ───────► │ Admin plane  :8001 (127.0.0.1 only)        │
  (dashboard)    │   list audit log, approve, reject          │
                 └────────────────────────────────────────────┘
```

**Two databases.** The target database holds the data the agent works on. The control database holds the audit log and the approval queue. The agent only gets credentials for the target database.

**Two ports.** The agent can only reach the query endpoint. Approve and reject live on a separate admin port that requires a token and listens on localhost only.

### What happens to each query

| Statement | Behaviour |
|---|---|
| `SELECT` | Runs in a read-only transaction with a 5 second timeout |
| `UPDATE` | Auto-runs if it touches at most `MAX_AUTO_UPDATE_ROWS` rows (default 2), otherwise queued for approval |
| `DELETE` | Auto-runs if it touches exactly `MAX_AUTO_DELETE_ROWS` rows (default 1), otherwise queued for approval |
| `INSERT` | Queued for approval |
| Writes hidden in a `WITH` clause (for example `WITH x AS (DELETE ...) SELECT ...`) | Rejected and logged |
| Several statements in one request | Rejected and logged |
| Anything unrecognised (`COMMIT`, `EXPLAIN`, `COPY`, invalid SQL) | Rejected and logged |
| DDL (`DROP`, `ALTER`, `CREATE`, `TRUNCATE`, `SELECT ... INTO`) | Refused: the `ai_agent` database user has no permission to change the schema |

When an admin approves a queued statement, it runs again inside a transaction. If it now touches a different number of rows than the admin was shown, it is rolled back and marked `REJECTED_STATE_CHANGE`.

## Setup

### Requirements

- Node.js 20 or newer
- PostgreSQL 15 or newer running locally (default port 5432)

### 1. Install

```bash
git clone https://github.com/IshantS4/Postgres-safety-tool.git
cd Postgres-safety-tool/backend
npm install
```

### 2. Configure

```bash
cp .env.example .env
```

(On Windows PowerShell: `copy .env.example .env`.)

Open `.env` and replace every `change-me` value. Generate strong secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

- `ADMIN_SECRET`: any random string of 16 or more characters.
- `TARGET_DB_ADMIN_PASSWORD` and `CONTROL_DB_PASSWORD`: your local `postgres` password (the same value on both lines).
- `AGENT_DB_PASSWORD` and `TARGET_DB_PASSWORD`: a new password of your choice (the same value on both lines).

### 3. Create the two databases

In your local PostgreSQL, create two empty databases:

```bash
psql -U postgres -c "CREATE DATABASE target_db;"
psql -U postgres -c "CREATE DATABASE control_db;"
```

(Or create them in pgAdmin.) Both databases live on the same PostgreSQL server.

### 4. Create the tables and the restricted user

Run these in this order:

```bash
npx tsx src/seed.ts            # target DB: users table with sample rows
npx tsx src/setup-user.ts      # creates the restricted ai_agent user and its permissions
npx tsx src/seed-control.ts    # control DB: audit_logs table
```

`seed.ts` and `setup-user.ts` connect with the admin credentials (`TARGET_DB_ADMIN_USER` / `TARGET_DB_ADMIN_PASSWORD`). The running server connects to the target database as `ai_agent` only. `setup-user.ts` is safe to run again: it updates the password if the user already exists.

### 5. Run the backend

```bash
npm run dev
```

You should see the agent plane on port 8000 and the admin plane on `127.0.0.1:8001`.

### 6. Run the dashboard

Create `frontend/.env` with the same admin token the backend uses:

```
VITE_ADMIN_SECRET=<the same value as ADMIN_SECRET>
```

Then:

```bash
cd ../frontend
npm install
npm run dev
```

Open http://localhost:5173.

> The dashboard currently reads the admin token from `VITE_ADMIN_SECRET` in `frontend/.env`. That is fine on your own machine. Do not host the dashboard publicly until it has a login screen.

## Try it

Send a query as the agent:

```bash
curl -X POST http://localhost:8000/api/query \
  -H "Content-Type: application/json" \
  -d '{"query": "DELETE FROM users WHERE plan = '\''free'\''"}'
```

Expected: `403`, because the statement affects more than one row. Open the dashboard, find the pending entry, and approve or reject it.

PowerShell:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:8000/api/query `
  -ContentType "application/json" `
  -Body '{"query": "DELETE FROM users WHERE plan = ''free''"}'
```

## Tests

```bash
cd backend
npm test
```

The tests use [Vitest](https://vitest.dev) and need no database. There are 11 tests for the query classifier, covering normal queries, DDL, hidden writes in `WITH` clauses, multi-statement attacks, `SELECT ... INTO`, `EXPLAIN` and invalid SQL.

## Queries it stops

These were tried against a real database and all were blocked, with no rows changed:

| Query | Result |
|---|---|
| `DELETE FROM users; COMMIT;` | Rejected: multiple statements |
| `UPDATE users SET plan='x' WHERE id=1; DELETE FROM users` | Rejected: multiple statements |
| `WITH x AS (DELETE FROM users RETURNING *) SELECT * FROM x` | Rejected: hidden write |
| `WITH x AS (DELETE FROM users RETURNING *) UPDATE users SET plan='a' WHERE id=1` | Rejected: hidden write |
| `SELECT * INTO copy FROM users` | Refused: `ai_agent` cannot create tables |
| `SELECT my_function_that_deletes()` | Blocked by the read-only transaction |
| `EXPLAIN ANALYZE DELETE FROM users` | Rejected: unrecognised statement |
| `DROP TABLE users` / `TRUNCATE users` | Refused: `ai_agent` has no permission |

How each query is classified is covered by the automated tests. The database-level behaviour (the read-only transaction and the restricted user) was checked by hand against a real Postgres, and automated tests for it are planned.

## Configuration

| Variable | Purpose | Default |
|---|---|---|
| `PORT` | Agent plane port | `8000` |
| `ADMIN_PORT` | Admin plane port | `8001` |
| `ADMIN_SECRET` | Admin token, at least 16 characters, required | none |
| `DASHBOARD_ORIGIN` | Allowed CORS origin | `http://localhost:5173` |
| `MAX_AUTO_UPDATE_ROWS` | Largest UPDATE that runs without approval | `2` |
| `MAX_AUTO_DELETE_ROWS` | DELETE size that runs without approval | `1` |

Database variables:

| Variable | Used by | Purpose |
|---|---|---|
| `TARGET_DB_ADMIN_USER` / `TARGET_DB_ADMIN_PASSWORD` | `seed.ts`, `setup-user.ts` | Admin login for the setup scripts (usually `postgres`) |
| `AGENT_DB_PASSWORD` | `setup-user.ts` | Password given to the `ai_agent` user |
| `TARGET_DB_USER` / `TARGET_DB_PASSWORD` | the server | Must be `ai_agent` and its password |
| `CONTROL_DB_USER` / `CONTROL_DB_PASSWORD` | the server | Login for the control database (usually `postgres`) |
| `*_HOST`, `*_PORT`, `*_NAME` | everything | Both databases on `localhost:5432` by default |

## Tech stack

TypeScript, Node.js, Express, PostgreSQL (`pg`, no ORM), `pgsql-parser`, React, Vite, Tailwind CSS, Vitest.

## Status

**Working**

- [x] Two databases (target and control)
- [x] Separate agent and admin ports, admin token with timing-safe comparison
- [x] Real Postgres parser for statement classification
- [x] Multi-statement queries and writes hidden in `WITH` clauses are rejected
- [x] Dry run and execution in a single transaction
- [x] Approval and rejection from a dashboard, with a stale-data check on approve
- [x] Audit log, including rejected statements
- [x] Restricted `ai_agent` database user
- [x] Configurable auto-approve limits
- [x] Vitest suite for the classifier (11 tests)

**In progress**

- [ ] Automated tests against a real database
- [ ] Login screen for the dashboard (needed before hosting)
- [ ] `npm run` scripts for seed and setup

**Planned**

- [ ] Undo, including rows removed by `ON DELETE CASCADE`
- [ ] Evaluation numbers: attacks caught, added latency, undo correctness
- [ ] Hosted demo

## Security notes

- Never commit `.env`. Only `.env.example` belongs in the repository.
- The admin port is bound to `127.0.0.1`. Keep the admin token away from the agent.
- The two databases share one PostgreSQL server in this setup. The `ai_agent` user has no permissions on the control tables, but for stronger isolation run the control database on a separate server.
- This is a prototype. Do not put it in front of a database you cannot afford to lose.

## License

MIT