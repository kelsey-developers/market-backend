# market-backend

Backend scaffold for supply and inventory management using:

- Node.js + Express + TypeScript
- Prisma ORM
- MySQL (Docker)

## 1) Prerequisites

- Node.js 20+
- Docker Desktop

## 2) Setup

```bash
npm install
copy .env.example .env
npm run db:init
```

Or step-by-step:

```bash
npm run db:up
npm run prisma:generate
npm run prisma:migrate -- --name init
npm run seed
```

## 3) Run API

```bash
npm run dev
```

Server runs on `http://localhost:4000`.

Health checks:

- `GET /health` (service alive)
- `GET /health/ready` (service + DB reachable)

## 4) Endpoints

- `GET /health`
- `GET /api/products`
- `POST /api/products`
- `PATCH /api/products/:id`
- `GET /api/suppliers`
- `POST /api/suppliers`
- `GET /api/inventory`
- `POST /api/inventory/movements`
- `GET /api/purchase-orders`
- `POST /api/purchase-orders`
- `POST /api/purchase-orders/:id/receive`

## 5) Notes

- Uses MySQL in Docker from `docker-compose.yml` (host port `3308`).
- If you previously migrated with PostgreSQL, delete `prisma/migrations/*` and rerun `npm run prisma:migrate -- --name init`.
- Replace `DATABASE_URL` in `.env` when moving to managed MySQL.

## 6) Helpful Scripts

- `npm run db:status` to check MySQL container status
- `npm run db:logs` to tail MySQL logs
- `npm run typecheck` for TypeScript checks without building
