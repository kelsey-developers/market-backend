#!/usr/bin/env node
/**
 * Smoke test for market-backend API endpoints.
 * Usage: node scripts/test-api-endpoints.mjs [baseUrl]
 * Default baseUrl: http://localhost:4000
 */

const BASE = process.argv[2] || 'http://localhost:4000';

const log = (msg) => console.log(msg);
const ok = (label, res) => {
  const status = res.status;
  const ok = status >= 200 && status < 400;
  log(`${ok ? '✓' : '✗'} ${label} → ${status}`);
  return ok;
};

async function run() {
  const results = { pass: 0, fail: 0 };
  const assert = (label, ok) => {
    if (ok) results.pass++;
    else results.fail++;
  };

  log('\n--- Market Backend API endpoint checks ---\n');

  try {
    // Root
    let res = await fetch(`${BASE}/`);
    assert('GET /', ok('GET /', res));

    // Health
    res = await fetch(`${BASE}/health`);
    assert('GET /health', ok('GET /health', res));
    res = await fetch(`${BASE}/health/ready`);
    const readyOk = res.status === 200 || res.status === 503;
    log(`${readyOk ? '✓' : '✗'} GET /health/ready → ${res.status}`);
    assert('GET /health/ready', readyOk);

    // Docs
    res = await fetch(`${BASE}/openapi.json`);
    assert('GET /openapi.json', ok('GET /openapi.json', res));

    // Product categories
    res = await fetch(`${BASE}/api/product-categories`);
    assert('GET /api/product-categories', ok('GET /api/product-categories', res));

    // Products
    res = await fetch(`${BASE}/api/products`);
    assert('GET /api/products', ok('GET /api/products', res));

    // Suppliers
    res = await fetch(`${BASE}/api/suppliers`);
    assert('GET /api/suppliers', ok('GET /api/suppliers', res));

    // Inventory
    res = await fetch(`${BASE}/api/inventory`);
    assert('GET /api/inventory', ok('GET /api/inventory', res));
    res = await fetch(`${BASE}/api/inventory/dataset`);
    assert('GET /api/inventory/dataset', ok('GET /api/inventory/dataset', res));

    // Purchase orders
    res = await fetch(`${BASE}/api/purchase-orders`);
    assert('GET /api/purchase-orders', ok('GET /api/purchase-orders', res));

    // Units
    res = await fetch(`${BASE}/api/units`);
    assert('GET /api/units', ok('GET /api/units', res));

    // Bookings (GET requires query listingId; 400 without it = route exists)
    res = await fetch(`${BASE}/api/bookings`);
    const bookingsOk = res.status === 200 || res.status === 400;
    log(`${bookingsOk ? '✓' : '✗'} GET /api/bookings → ${res.status}`);
    assert('GET /api/bookings', bookingsOk);

    // Goods receipts: attachment content (404 for invalid id = route exists)
    res = await fetch(`${BASE}/api/goods-receipts/attachments/invalid-id/content`);
    const grRouteOk = res.status === 404 || res.status === 400 || res.status === 200;
    log(`${grRouteOk ? '✓' : '✗'} GET /api/goods-receipts/attachments/:id/content → ${res.status}`);
    assert('GET /api/goods-receipts/attachments/:id/content', grRouteOk);

    // POST endpoints (expect 400 without body or 201)
    res = await fetch(`${BASE}/api/product-categories`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    log(`${(res.status === 400 || res.status === 201) ? '✓' : '✗'} POST /api/product-categories → ${res.status}`);
    assert('POST /api/product-categories', res.status === 400 || res.status === 201);

    res = await fetch(`${BASE}/api/inventory/warehouses`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Test WH' }) });
    const whOk = res.status === 201 || res.status === 400;
    log(`${whOk ? '✓' : '✗'} POST /api/inventory/warehouses → ${res.status}`);
    assert('POST /api/inventory/warehouses', whOk);

    res = await fetch(`${BASE}/api/purchase-orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    log(`${(res.status === 400 || res.status === 201) ? '✓' : '✗'} POST /api/purchase-orders → ${res.status}`);
    assert('POST /api/purchase-orders', res.status === 400 || res.status === 201);

    // PATCH warehouse (404 for invalid id = route exists)
    res = await fetch(`${BASE}/api/inventory/warehouses/non-existent-id`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'X' }) });
    log(`${(res.status === 404 || res.status === 400 || res.status === 200) ? '✓' : '✗'} PATCH /api/inventory/warehouses/:id → ${res.status}`);
    assert('PATCH /api/inventory/warehouses/:id', res.status === 404 || res.status === 400 || res.status === 200);

    // POST receive (404 for invalid PO id = route exists)
    res = await fetch(`${BASE}/api/purchase-orders/fake-id/receive`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ warehouseId: 'w1', items: [{ productId: 'p1', quantityReceived: 1 }] }) });
    log(`${(res.status === 404 || res.status === 400) ? '✓' : '✗'} POST /api/purchase-orders/:id/receive → ${res.status}`);
    assert('POST /api/purchase-orders/:id/receive', res.status === 404 || res.status === 400);

    // POST goods receipt attachments (404 for invalid receipt id = route exists)
    const form = new FormData();
    form.append('files', new Blob(['x'], { type: 'image/png' }), 'x.png');
    res = await fetch(`${BASE}/api/goods-receipts/fake-receipt-id/attachments`, { method: 'POST', body: form });
    log(`${(res.status === 404 || res.status === 400) ? '✓' : '✗'} POST /api/goods-receipts/:id/attachments → ${res.status}`);
    assert('POST /api/goods-receipts/:id/attachments', res.status === 404 || res.status === 400);

    // 404 catch-all: request to non-existent API path
    res = await fetch(`${BASE}/api/nonexistent-path`);
    const body = await res.json().catch(() => ({}));
    const catchAllOk = res.status === 404 && body.message === 'API route not found';
    log(`${catchAllOk ? '✓' : '✗'} GET /api/nonexistent-path → 404 catch-all`);
    assert('404 for unknown path', catchAllOk);
  } catch (err) {
    log(`\n✗ Request failed: ${err.message}`);
    log('  Is the server running? Try: npm run dev');
    results.fail++;
  }

  log('\n--- Summary ---');
  log(`Passed: ${results.pass}, Failed: ${results.fail}`);
  process.exit(results.fail > 0 ? 1 : 0);
}

run();
