# Database Booking Sync Guide

## Problem
The market-backend database was only syncing bookings **on-demand** (when you hit an API endpoint). This meant:
- If you just opened the database UI without hitting endpoints, no data would be there
- The database felt "stale" or empty
- There was no way to manually refresh the database

## Solution
We've implemented **three sync mechanisms**:

### 1. ✅ Automatic Startup Sync (Recommended)
The backend now automatically syncs bookings from the auth-service when the server starts.

**How it works:**
- When you start the backend server (`npm run dev`), it will automatically fetch all bookings from `https://kelsey.idateph.com/api/bookings/my` and populate the database
- This happens in the background after the server is ready
- The database is ready to query immediately (sync doesn't block startup)

**Benefits:**
- No manual action needed
- Database always has fresh data when server starts
- Automatic fallback to lazy-load sync if startup sync fails

### 2. 🔁 Manual Sync via Script
Use the provided npm script to manually refresh the database at any time.

**How to use:**
```bash
# From market-backend directory
node scripts/sync-bookings.mjs
```

**Output:**
```
🔄 Starting booking database sync...
   API: https://kelsey.idateph.com
✅ Sync completed in 1234ms
   Total bookings in database: 42
   Total booking guests: 87

📊 Database is now up-to-date with auth-service data.
```

**When to use:**
- After restarting the backend
- When you want to immediately refresh without restarting
- During development/debugging

### 3. 📡 Manual Sync via HTTP API
Call the sync endpoint directly to refresh the database via HTTP.

**Endpoint:**
```
POST /api/bookings/sync
```

**Example (cURL):**
```bash
curl -X POST http://localhost:3001/api/bookings/sync \
  -H "Content-Type: application/json"
```

**Response:**
```json
{
  "status": "synced",
  "message": "Database has been refreshed with latest booking data from auth-service",
  "elapsed_ms": 1234,
  "database_state": {
    "total_bookings": 42,
    "total_booking_guests": 87
  }
}
```

**When to use:**
- From your automation/CI/CD pipeline
- From a UI button (wire up a frontend button to call this endpoint)
- For programmatic synchronization

## How Sync Works

### Data Flow
```
Auth-Service (kelsey.idateph.com/api/bookings/my)
         ↓
    [Fetch & Validate]
         ↓
    [Unwrap Payload]  (handles: bookings, data, results, items wrappers)
         ↓
    [Parse Statuses]  (pending → penciled, confirmed → confirmed, etc.)
         ↓
    [Create/Update Records]
         ↓
Market-Backend Database
```

### What Gets Synced
- ✅ Booking ID & Reference Code
- ✅ Check-in/Check-out Dates  
- ✅ Guest Count & Names
- ✅ Booking Status (with raw_status mapping)
- ✅ Total Amount & Unit Charges
- ✅ Guest Details (email, phone, name)
- ✅ Listings/Units (auto-created if missing)

### Sync Robustness
- **Conflict resolution**: Updates existing bookings if ID matches, creates new ones otherwise
- **Eventual consistency**: Handles eventual-consistent external API responses
- **Fallback detail fetch**: Backfills guest info if missing from list response
- **Graceful degradation**: If sync fails, returns 500 but doesn't crash the backend

## Configuration

### Environment Variables
```bash
# Auth-service URL (default: from API_URL)
API_URL=https://kelsey.idateph.com

# Optional: API token for auth-service
AUTH_SERVICE_API_TOKEN=your-token-here
```

### Sync Limits
- **Bookings per request**: 500 (can increase by modifying the `/api/bookings/my?limit=500&page=1` URL)
- **Timeout**: 30 seconds per sync request
- **Retry**: None (failed syncs don't auto-retry, must be triggered manually or on next startup)

## Monitoring

### Check Sync Logs
The backend logs all sync operations to console (in dev mode):

```
[startup-sync] Pre-populating database with booking data from auth-service...
[bookings sync] upserted=42 guests=87 skipped=0 listingId=
[startup-sync] Completed. Database now has 42 bookings and 87 booking-guests.
```

### Query Database After Sync
```sql
-- Check total bookings
SELECT COUNT(*) FROM "Booking";

-- Check booking with guest info
SELECT b.id, b."bookingCode", b.status, 
       g."firstName", g."lastName", g.email
FROM "Booking" b
LEFT JOIN "BookingGuest" bg ON b.id = bg."bookingId"
LEFT JOIN "Guest" g ON bg."guestId" = g.id
LIMIT 10;

-- Check sync stats
SELECT COUNT(*) as total, 
       status, 
       COUNT(DISTINCT "unitId") as unique_units
FROM "Booking"
GROUP BY status;
```

## Troubleshooting

### "Database is still empty after sync"
1. Check that `API_URL` is set correctly: `https://kelsey.idateph.com`
2. Check logs for sync errors: `[startup-sync] Warning: Initial sync failed...`
3. Verify auth-service is reachable: `curl https://kelsey.idateph.com/api/bookings/my`
4. Check if auth requires a token: If 401 error, set `AUTH_SERVICE_API_TOKEN`

### "Sync endpoint returns 500"
1. Check backend logs for detailed error
2. Verify auth-service is responding: `curl https://kelsey.idateph.com/health`
3. Check database connection: Ensure Prisma migrations are up-to-date

### "Sync takes too long"
1. If syncing huge booking lists, increase timeout in `scripts/sync-bookings.mjs`
2. Paginate manually: Use `/api/bookings/my?limit=100&page=1,2,3...`
3. Check auth-service performance/network latency

## Frontend Integration

### Hook up a "Refresh Database" Button
In your frontend, you can add a button that calls the sync endpoint:

```typescript
// In your component
async function refreshDatabase() {
  try {
    const response = await fetch('/api/bookings/sync', {
      method: 'POST',
    });
    const result = await response.json();
    alert(`Database refreshed! Now has ${result.database_state.total_bookings} bookings`);
  } catch (error) {
    alert('Failed to refresh: ' + error.message);
  }
}
```

Then in your UI:
```jsx
<button onClick={refreshDatabase}>
  🔄 Refresh Database
</button>
```

## Migration Guide

### If you updated from the old version:
1. Restart your backend: `npm run dev`
2. Backend will automatically sync on startup
3. You can also manually run: `node scripts/sync-bookings.mjs`
4. Or hit: `POST http://localhost:3001/api/bookings/sync`

There's no database migration needed—the sync happens at the application level.
