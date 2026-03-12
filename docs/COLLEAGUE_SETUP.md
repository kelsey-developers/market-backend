# Complete setup: Connect to Market Backend (for colleagues)

This guide explains how to **run and share** the market-backend (with Cloudflare Tunnel) and how **colleagues** can connect their frontend to it.

---

## Quick roles

| Role | What you do |
|------|-------------|
| **Host** | Runs market-backend + database + Cloudflare Tunnel. Shares the tunnel URL. |
| **Colleague** | Uses the frontend app; points it at the shared tunnel URL. No backend or tunnel needed. |

---

# Part A: Host — Run backend and share via tunnel

*One person (or one machine) runs the backend and tunnel, then shares the URL.*

## A.1 Prerequisites

- **Node.js** 18+ ([nodejs.org](https://nodejs.org))
- **Docker Desktop** (for MySQL) — [docker.com](https://www.docker.com/products/docker-desktop)
- **Git**

## A.2 Clone and install backend

```powershell
git clone https://github.com/kelsey-developers/market-backend.git
cd market-backend
npm install
```

## A.3 Environment (backend)

Create a `.env` file in the `market-backend` folder (copy from `.env.example`):

```powershell
copy .env.example .env
```

Edit `.env` and set at least:

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | MySQL connection string | `mysql://market_user:market_pass@localhost:3308/market` |
| `PORT` | API port (default 4000) | `4000` |
| `CORS_ORIGIN` | Allowed frontend origin (optional) | `http://localhost:3000` or `*` |

If you use Docker for MySQL (default), keep `DATABASE_URL` as in `.env.example` and start the DB (next step).

## A.4 Database (Docker)

Start MySQL and run migrations + seed:

```powershell
npm run db:up
npm run prisma:generate
npm run prisma:migrate -- --name init
npm run seed
```

If you use an existing MySQL instance, set `DATABASE_URL` in `.env` and run only:

```powershell
npm run prisma:generate
npm run prisma:migrate -- --name init
npm run seed
```

## A.5 Start the API

In a **first terminal**:

```powershell
cd market-backend
npm run dev
```

Leave it running. The API is at `http://localhost:4000`.

## A.6 Start the tunnel (Cloudflare)

In a **second terminal**:

```powershell
cd market-backend
npm run tunnel
```

- On first use, **cloudflared** is run via a built-in path (no extra install on Windows).
- If you see *"cloudflared is not recognized"*, install it once:
  - **Windows:** `winget install Cloudflare.cloudflared`
  - Then run `npm run tunnel` again.

Look for the line that looks like:

```
|  https://something-random.trycloudflare.com                                      |
```

That is your **public API URL**.

## A.7 Share with colleagues

Send them:

1. **Market API URL** — e.g. `https://prices-learned-sms-applies.trycloudflare.com` (no trailing slash).
2. **Main app API URL** (if they need auth/other services) — e.g. your `API_URL` (e.g. `https://kelsey.idateph.com`).

**Note:** The tunnel URL **changes every time** you restart `npm run tunnel`. When it changes, tell colleagues to update their `MARKET_API_URL`.

---

# Part B: Colleague — Connect your frontend to the shared backend

*You only need the frontend app and the URL shared by the host.*

## B.1 Prerequisites

- **Node.js** 18+
- **Git**

## B.2 Clone and install frontend

```powershell
git clone https://github.com/kelsey-developers/main-frontend.git
cd main-frontend
npm install
```

*(Use your actual frontend repo URL if different.)*

## B.3 Environment (frontend)

Create a file named `.env.local` in the **main-frontend** folder.

**Minimum to use the shared market backend:**

```env
# Shared market backend (from host's Cloudflare Tunnel)
MARKET_API_URL=https://YOUR-TUNNEL-URL.trycloudflare.com

# Main app / auth backend (ask host or use your org's URL)
API_URL=https://kelsey.idateph.com
```

Replace:

- `https://YOUR-TUNNEL-URL.trycloudflare.com` with the **exact URL** the host sent you (e.g. `https://prices-learned-sms-applies.trycloudflare.com`).
- `API_URL` with your real auth/main API URL if different.

**Optional (dev auth):**

```env
NEXT_PUBLIC_DEV_AUTH_USER_ID=mock-1
NEXT_PUBLIC_DEV_AUTH_EMAIL=admin@example.com
NEXT_PUBLIC_DEV_AUTH_ROLE=admin
```

- No spaces around `=`.
- No trailing slash on URLs.

## B.4 Run the frontend

```powershell
cd main-frontend
npm run dev
```

Open the app (e.g. `http://localhost:3000`). The inventory and market features will use the shared backend via `MARKET_API_URL`.

## B.5 If something doesn’t work

1. **Check the URL** — Host may have restarted the tunnel; get the new URL and update `MARKET_API_URL` in `.env.local`, then restart the frontend (`npm run dev`).
2. **Backend must be running** — Host must have both `npm run dev` (backend) and `npm run tunnel` running.
3. **Restart after env change** — After editing `.env.local`, stop the dev server (Ctrl+C) and run `npm run dev` again.

---

# Reference: What the tunnel URL is used for

The frontend sends market/inventory requests to `MARKET_API_URL`. For example:

| Purpose | URL |
|--------|-----|
| API base | `https://YOUR-URL.trycloudflare.com` |
| Health | `https://YOUR-URL.trycloudflare.com/health` |
| API docs (Swagger) | `https://YOUR-URL.trycloudflare.com/docs` |
| OpenAPI JSON | `https://YOUR-URL.trycloudflare.com/openapi.json` |

---

# Summary checklist

**Host**

- [ ] Clone market-backend, `npm install`
- [ ] Copy `.env.example` to `.env`, set `DATABASE_URL` (and optionally `CORS_ORIGIN`)
- [ ] Start DB: `npm run db:up` (or use existing MySQL)
- [ ] Migrate + seed: `npm run prisma:migrate -- --name init`, `npm run seed`
- [ ] Terminal 1: `npm run dev`
- [ ] Terminal 2: `npm run tunnel`
- [ ] Share the `https://....trycloudflare.com` URL with colleagues

**Colleague**

- [ ] Clone main-frontend, `npm install`
- [ ] Create `.env.local` with `MARKET_API_URL=<shared URL>` and `API_URL=<main app URL>`
- [ ] `npm run dev` and open the app
