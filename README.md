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

⚠️ **Note**: On startup, the backend automatically syncs bookings from the auth-service into the database. See [BOOKING_SYNC.md](docs/BOOKING_SYNC.md) for details.

Health checks:

- `GET /health` (service alive)
- `GET /health/ready` (service + DB reachable)

## 3.1) Run API + DB fully in Docker

If you want to run both backend and MySQL in Docker:

```bash
copy .env.example .env
npm run docker:up
```

Then open:

- `http://localhost:4000/health`
- `http://localhost:4000/docs`

Useful commands:

```bash
npm run docker:logs
npm run docker:down
```

Notes:

- In Docker, backend uses `DATABASE_URL=mysql://market_user:market_pass@db:3306/market` internally.
- Upload files are persisted in Docker volume `uploads_data`.
- This is stable while your machine is on. For true always-on hosting, run this Docker stack on a cloud VM/server.
- If port 4000 is already in use on your machine, set `APP_PORT=4010` in `.env`, then access `http://localhost:4010`.

## 3.2) Manual Database Sync

To refresh the database with the latest booking data from the auth-service:

**Via script:**
```bash
node scripts/sync-bookings.mjs
```

**Via HTTP:**
```bash
curl -X POST http://localhost:4000/api/bookings/sync
```

For detailed documentation, see [BOOKING_SYNC.md](docs/BOOKING_SYNC.md).

## 4) Endpoints

- `GET /health`
- `GET /api/product-categories`
- `POST /api/product-categories`
- `PATCH /api/product-categories/:id`
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

## 6) Domain Coverage

Current Prisma models now cover:

- Inventory + supply: `InventoryCategory`, `Product` (with `itemType` for consumable/non-consumable), `Supplier`, `Warehouse`, `InventoryBalance`, `StockMovement`, `PurchaseOrder`, `PurchaseOrderItem`, `InventoryAllocation`
- Finance + sales report: `Property`, `Unit`, `Agent`, `Booking`, `BookingCharge`, `Payment`, `DamageIncident`

## 7) API documentation (complete)

All backend endpoints are documented.

- **Swagger UI:** Open `http://localhost:4000/docs` in a browser (when the server is running). Try endpoints from the UI.
- **OpenAPI JSON:** `GET http://localhost:4000/openapi.json` — use for Postman/Insomnia or codegen.
- **Full reference (markdown):** [docs/API.md](docs/API.md) — every endpoint, request/response body, query params, and error codes.

## 8) Helpful Scripts

- `npm run db:status` to check MySQL container status
- `npm run db:logs` to tail MySQL logs
- `npm run typecheck` for TypeScript checks without building
