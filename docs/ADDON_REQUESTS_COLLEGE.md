# Add-on Requests API — For College / External Systems

Your college can submit requested add-ons (items) for a booking **in one request** — no need to post items one by one.

---

## Endpoint

**POST** `{BASE_URL}/api/addon-requests`

Example: `POST http://localhost:4000/api/addon-requests` (or your deployed URL)

---

## Request body (JSON)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `bookingId` | string | Yes | Booking ID or reference code (e.g. `BKG-ABC123`) |
| `items` | array | Yes | List of add-on items (min 1) |

**Each item in `items`:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `chargeTypeCode` | string | One of code/id | Charge type code (e.g. `CLEANING_FEE`, `LATE_CHECKOUT`) |
| `chargeTypeId` | string | One of code/id | Charge type ID (alternative to code) |
| `quantity` | number | No | Default 1 |
| `amount` | number | No | Override price (otherwise uses charge type default) |
| `notes` | string | No | Optional notes (max 500 chars) |

---

## Example request

```json
{
  "bookingId": "BKG-ABC123",
  "items": [
    { "chargeTypeCode": "CLEANING_FEE", "quantity": 1 },
    { "chargeTypeCode": "LATE_CHECKOUT", "quantity": 1, "amount": 500 },
    { "chargeTypeCode": "EXTRA_TOWELS", "quantity": 2, "notes": "For room 101" }
  ]
}
```

---

## Example response (201 Created)

```json
{
  "message": "3 add-on(s) received and added.",
  "count": 3,
  "charges": [
    {
      "id": "clx...",
      "chargeTypeId": "clx...",
      "name": "Cleaning fee",
      "amount": 800,
      "quantity": 1,
      "notes": null
    },
    {
      "id": "clx...",
      "chargeTypeId": "clx...",
      "name": "Late checkout",
      "amount": 500,
      "quantity": 1,
      "notes": null
    }
  ]
}
```

---

## Error responses

| Status | Meaning |
|--------|---------|
| **400** | Validation error — e.g. invalid charge type, missing amount, or each item must have `chargeTypeCode` or `chargeTypeId` |
| **404** | Booking not found — check `bookingId` |
| **500** | Server error |

**400 example** (charge type not found):

```json
{
  "message": "Charge type not found or inactive: CLEANING_FEE",
  "availableCodes": ["CLEANING_FEE", "LATE_CHECKOUT", "SWIMMING_POOL"]
}
```

---

## How to get available charge type codes

**GET** `{BASE_URL}/api/charge-types`

Returns all charge types. Use the `code` field (e.g. `CLEANING_FEE`) in your add-on requests.

---

## Alternative: booking ID in URL

**POST** `{BASE_URL}/api/bookings/{bookingId}/charges/bulk`

Body: `{ "items": [...] }` (no `bookingId` in body)

Same behavior, different URL format.
