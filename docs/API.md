# Market Backend API Reference

Base URL: `http://localhost:4000` (or your tunnel URL, e.g. `https://xxx.trycloudflare.com`)

**Interactive docs:** `GET /docs` (Swagger UI) · **OpenAPI JSON:** `GET /openapi.json`

---

## All endpoints (overview)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Service message |
| GET | `/openapi.json` | OpenAPI 3.0.3 spec (JSON) |
| GET | `/health` | Health check |
| GET | `/health/ready` | Readiness (service + DB) |
| GET | `/api/product-categories` | List categories |
| POST | `/api/product-categories` | Create category |
| PATCH | `/api/product-categories/:id` | Update category |
| GET | `/api/products` | List products |
| POST | `/api/products` | Create product |
| PATCH | `/api/products/:id` | Update product |
| GET | `/api/suppliers` | List suppliers |
| POST | `/api/suppliers` | Create supplier |
| PATCH | `/api/suppliers/:id` | Update supplier |
| GET | `/api/inventory` | List inventory balances |
| GET | `/api/inventory/dataset` | Full inventory dashboard dataset |
| POST | `/api/inventory/warehouses` | Create warehouse |
| PATCH | `/api/inventory/warehouses/:id` | Update warehouse |
| POST | `/api/inventory/allocations` | Create/update allocation (product ↔ unit) |
| POST | `/api/inventory/movements` | Record stock movement |
| GET | `/api/purchase-orders` | List purchase orders |
| GET | `/api/purchase-orders/:id` | Get one purchase order (with receipts) |
| POST | `/api/purchase-orders` | Create purchase order |
| POST | `/api/purchase-orders/:id/receive` | Receive items (creates goods receipt) |
| PATCH | `/api/purchase-orders/:id` | Update purchase order |
| GET | `/api/damage-incidents` | List damage incidents |
| POST | `/api/damage-incidents` | Create damage incident |
| GET | `/api/damage-incidents/:id` | Get one damage incident |
| PATCH | `/api/damage-incidents/:id` | Update damage incident |
| GET | `/api/damage-incidents/:id/attachments` | List damage incident attachments |
| POST | `/api/damage-incidents/:id/attachments` | Upload damage incident images |
| GET | `/api/damage-incidents/attachments/:attachmentId/content` | Get damage attachment content |
| GET | `/api/goods-receipts/attachments/:attachmentId/content` | Get attachment image (binary) |
| POST | `/api/goods-receipts/:id/attachments` | Upload goods receipt images |
| GET | `/api/units` | List units (listings). Query: featured, city, limit, offset |
| GET | `/api/units/manage` | List units (auth: admin/agent) |
| GET | `/api/units/:id` | Get unit by ID |
| PATCH | `/api/units/:id` | Update unit (auth: admin/agent) |
| GET | `/api/bookings` | List bookings for a listing. Query: listingId (required) |
| POST | `/api/bookings` | Create booking |
| GET | `/api/bookings/my` | Current user's bookings (auth: admin/agent) |
| GET | `/api/bookings/:id` | Get booking by ID |

*Auth-required endpoints (GET /api/units/manage, PATCH /api/units/:id, GET /api/bookings/my) expect auth headers when login is enabled.*

---

## Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Service health. Returns `{ status: 'ok', service: 'market-backend' }`. |
| GET | `/health/ready` | Readiness (service + DB). Returns `{ status: 'ready', database: 'ok' }` or 503 if DB unreachable. |

---

## Product categories

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/product-categories` | List all categories. Response: `{ categories: [...] }`. |
| POST | `/api/product-categories` | Create category. |
| PATCH | `/api/product-categories/:id` | Update category. |

**POST /api/product-categories** — Body (JSON):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| code | string | Yes | Unique code (stored uppercase). |
| name | string | Yes | Display name. |
| description | string | No | Optional description. |
| isActive | boolean | No | Default true. |

**PATCH /api/product-categories/:id** — Body (JSON): same fields, all optional.

---

## Products

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/products` | List all products (with supplier, category). Response: `{ products: [...] }`. |
| POST | `/api/products` | Create product. |
| PATCH | `/api/products/:id` | Update product. |

**POST /api/products** — Body (JSON):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| sku | string | Yes | SKU. |
| name | string | Yes | Product name. |
| description | string | No | Optional description. |
| unit | string | Yes | Unit of measure (e.g. "pcs", "box"). |
| itemType | string | No | `"consumable"` or `"non_consumable"`. Default `consumable`. |
| reorderLevel | number | No | Min stock level. Default 0. |
| supplierId | string | No | Optional supplier ID. |
| categoryId | string | No | Optional category ID. |

**PATCH /api/products/:id** — Body (JSON): same fields, all optional.

---

## Suppliers

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/suppliers` | List all suppliers. Response: `{ suppliers: [...] }`. |
| POST | `/api/suppliers` | Create supplier. |
| PATCH | `/api/suppliers/:id` | Update supplier. |

**POST /api/suppliers** — Body (JSON):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Supplier name. |
| contactName | string | No | Contact person. |
| contactEmail | string | No | Valid email. |
| contactPhone | string | No | Phone. |
| address | string | No | Address. |

**PATCH /api/suppliers/:id** — Body (JSON): same fields, all optional.

---

## Inventory

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/inventory` | List inventory balances by product/warehouse. Response: `{ inventory: [...] }`. |
| GET | `/api/inventory/dataset` | Full dataset for inventory dashboard (products, warehouses, POs, receipts, movements, etc.). |
| POST | `/api/inventory/warehouses` | Create warehouse. |
| PATCH | `/api/inventory/warehouses/:id` | Update warehouse. |
| POST | `/api/inventory/allocations` | Create or update allocation (product ↔ unit). |
| POST | `/api/inventory/movements` | Record stock movement (IN / OUT / ADJUSTMENT). |

**POST /api/inventory/warehouses** — Body (JSON):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Warehouse name. |
| location | string | No | Location description. |
| code | string | No | Short code (auto-generated from name if omitted). |

**PATCH /api/inventory/warehouses/:id** — Body (JSON): same fields, all optional.

**POST /api/inventory/allocations** — Body (JSON):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| productId | string | Yes | Product ID. |
| unitId | string | Yes | Unit ID. |
| quantityDelta | number | Yes | Change in allocated quantity (can be negative). |
| minStock | number | No | Min stock for this allocation (integer ≥ 0). |

**POST /api/inventory/movements** — Body (JSON):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| productId | string | Yes | Product ID. |
| warehouseId | string | Yes | Warehouse ID. |
| type | string | Yes | `"IN"` \| `"OUT"` \| `"ADJUSTMENT"`. |
| quantity | number | Yes | Positive integer. |
| reason | string | No | Optional reason. |
| referenceType | string | No | `purchase_order` \| `goods_receipt` \| `booking` \| `damage_incident` \| `manual_adjustment`. |
| referenceId | string | No | Generic reference ID. |
| purchaseOrderId | string | No | Required if referenceType is `purchase_order`. |
| goodsReceiptId | string | No | Required if referenceType is `goods_receipt`. |
| bookingId | string | No | Required if referenceType is `booking`. |
| damageIncidentId | string | No | Required if referenceType is `damage_incident`. |
| notes | string | No | Optional notes. |

---

## Damage incidents

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/damage-incidents` | List damage incidents. Query: `unitId`, `bookingId`, `status`, `limit`, `offset`. |
| POST | `/api/damage-incidents` | Create damage incident. |
| GET | `/api/damage-incidents/:id` | Get one damage incident with unit/booking/users/attachments. |
| PATCH | `/api/damage-incidents/:id` | Update damage incident. |
| GET | `/api/damage-incidents/:id/attachments` | List attachments for a damage incident. |
| POST | `/api/damage-incidents/:id/attachments` | Upload one or more image attachments. |
| GET | `/api/damage-incidents/attachments/:attachmentId/content` | Open/redirect to image content URL. |

**GET /api/damage-incidents** — Query:

| Param | Type | Description |
|-------|------|-------------|
| unitId | string | Filter by unit ID. |
| bookingId | string | Filter by booking ID. |
| status | string | `open` \| `charged_to_guest` \| `absorbed` \| `settled`. |
| limit | number | Max results (default 100, max 200). |
| offset | number | Pagination offset (default 0). |

**POST /api/damage-incidents** — Body (JSON):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| unitId | string | Yes | Unit/listing ID. |
| description | string | Yes | Incident details. |
| cost | number | Yes | Estimated total cost. |
| bookingId | string | No | Related booking ID. |
| reportedByUserId | string | No | Reporter user ID. |
| resolvedByUserId | string | No | Resolver user ID. |
| reportedAt | string | No | ISO datetime. |
| resolvedAt | string | No | ISO datetime. |
| resolutionNotes | string | No | Resolution notes. |
| chargedToGuest | number | No | Amount charged to guest. |
| absorbedAmount | number | No | Amount absorbed by business. |
| status | string | No | `open` \| `charged_to_guest` \| `absorbed` \| `settled`. |

**PATCH /api/damage-incidents/:id** — Body (JSON): same fields, all optional.

**POST /api/damage-incidents/:id/attachments** — Body: `multipart/form-data`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| files | file[] | Yes | Image files (JPG, PNG, WEBP). Max 8 files, 10 MB each. |

---

## Purchase orders

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/purchase-orders` | List all POs (with supplier, items). Response: `{ purchaseOrders: [...] }`. |
| GET | `/api/purchase-orders/:id` | Get one PO by ID (with supplier, items, receipts). |
| POST | `/api/purchase-orders` | Create purchase order. |
| POST | `/api/purchase-orders/:id/receive` | Receive items (creates goods receipt, updates stock). |
| PATCH | `/api/purchase-orders/:id` | Update PO (supplier, status, notes, etc.). |

**POST /api/purchase-orders** — Body (JSON):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| supplierId | string | Yes | Supplier ID. |
| notes | string | No | Optional notes. |
| items | array | Yes | At least one line item. |
| items[].productId | string | Yes | Product ID. |
| items[].quantityOrdered | number | Yes | Positive integer. |
| items[].unitCost | number | No | Unit cost. |

**POST /api/purchase-orders/:id/receive** — Body (JSON):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| warehouseId | string | Yes | Warehouse where items are received. |
| receivedByUserId | string | No | User ID (optional until auth). |
| notes | string | No | Receipt notes. |
| items | array | Yes | At least one line. |
| items[].productId | string | Yes | Product ID. |
| items[].quantityReceived | number | Yes | Positive integer. |

**PATCH /api/purchase-orders/:id** — Body (JSON):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| supplierId | string | No | Supplier ID. |
| status | string | No | `DRAFT` \| `ORDERED` \| `PARTIALLY_RECEIVED` \| `RECEIVED` \| `CANCELLED`. |
| expectedDelivery | string | No | Date string. |
| notes | string | No | Notes. |

---

## Goods receipts

Goods receipts are documented in two parts:

- **Creation flow:** `POST /api/purchase-orders/:id/receive` (under Purchase Orders, because receipt creation is tied to PO receiving).
- **Evidence image management:** goods-receipt attachment endpoints below.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/purchase-orders/:id/receive` | Create goods receipt from a PO receive action; returns `{ purchaseOrder, goodsReceipt }`. |
| GET | `/api/goods-receipts/attachments/:attachmentId/content` | Get attachment image (binary). Use as image `src` or download. |
| POST | `/api/goods-receipts/:id/attachments` | Upload one or more images for a goods receipt. |

**POST /api/goods-receipts/:id/attachments** — Body: `multipart/form-data`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| files | file[] | Yes | Image files (e.g. JPG, PNG, WEBP). Max 8 files, 10 MB each. |

Response (201): `{ attachments: [{ id, url, fileName, mimeType, sizeBytes, createdAt }, ...] }`.

---

## Units

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/units` | List units (listings). Query: `featured`, `city`, `limit`, `offset`. |
| GET | `/api/units/manage` | List units (auth: admin/agent). |
| GET | `/api/units/:id` | Get one unit by ID. |
| PATCH | `/api/units/:id` | Update unit (auth: admin/agent). Body: `status`, `is_featured`. |

**GET /api/units** — Query:

| Param | Type | Description |
|-------|------|-------------|
| featured | string | `"true"` \| `"false"`. |
| city | string | Filter by city. |
| limit | number | Max results (default 50, max 200). |
| offset | number | Pagination offset (default 0). |

---

## Bookings

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/bookings` | List bookings for a listing. **Query:** `listingId` (required). |
| POST | `/api/bookings` | Create booking. |
| GET | `/api/bookings/my` | Current user's bookings (auth: admin/agent). |
| GET | `/api/bookings/:id` | Get one booking by ID. |

**GET /api/bookings** — Query:

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| listingId | string | Yes | Unit/listing ID. |

**POST /api/bookings** — Body (JSON):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| listing_id | string | Yes | Unit ID. |
| check_in_date | string | Yes | Date (YYYY-MM-DD). |
| check_out_date | string | Yes | Date (YYYY-MM-DD). |
| num_guests | number | No | Default 1. |
| extra_guests | number | No | Default 0. |
| landmark | string | No | Landmark. |
| parking_info | string | No | Parking info. |
| notes | string | No | Notes. |
| request_description | string | No | Request description. |
| payment_method | string | No | cash, gcash, bank_transfer, card, other. |
| require_payment | boolean | No | Whether payment is required. |
| total_amount | number | No | Total amount. |
| assigned_agent_id | string | No | Agent ID. |
| assigned_agent_email | string | No | Agent email. |
| assigned_agent_name | string | No | Agent name. |
| client | object | No | Client first_name, last_name, email, contact_number, etc. |

---

## Root and docs

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Returns `{ message: 'market-backend is running' }`. |
| GET | `/docs` | Swagger UI (HTML). Open in browser to explore and try endpoints. |
| GET | `/openapi.json` | OpenAPI 3.0.3 specification (JSON). Use for Postman/Insomnia import. |

---

## Errors

| Code | Meaning |
|------|--------|
| **400** | Validation error or bad request. Body: `{ message: 'Validation error', errors: [...] }` or `{ message: '...' }`. |
| **404** | Resource not found. Body: `{ message: '...' }` or `{ message: 'Requested record was not found' }`. |
| **409** | Unique constraint violation (e.g. duplicate category code). Body: `{ message: 'Unique constraint violation', meta }`. |
| **500** | Internal server error. Body: `{ message: 'Internal server error' }`. |
| **503** | Service not ready (e.g. `GET /health/ready` when DB is unreachable). |

---

## CORS

Controlled by `CORS_ORIGIN` on the server. Default allows any origin in development.
