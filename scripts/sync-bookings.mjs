#!/usr/bin/env node

/**
 * Manual booking database sync script
 * 
 * Usage:
 *   node scripts/sync-bookings.mjs
 * 
 * This script refreshes the market-backend database with the latest booking data
 * from the auth-service (kelsey.idateph.com). Use this when the database feels
 * stale or you want to force a refresh without having to hit the API endpoints.
 */

import 'dotenv/config';

const API_URL = process.env.API_URL || 'https://kelsey.idateph.com';
const BACKEND_URL = process.env.MARKET_BACKEND_URL || 'http://localhost:4000';
const AUTH_TOKEN = process.env.AUTH_SERVICE_API_TOKEN;

async function syncBookings() {
  try {
    console.log('Starting booking database sync...');
    console.log(`   API: ${API_URL}`);
    console.log(`   Backend: ${BACKEND_URL}`);
    
    const startTime = Date.now();
    
    // Call manual sync endpoint
    const response = await fetch(`${BACKEND_URL}/api/bookings/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(AUTH_TOKEN && { authorization: AUTH_TOKEN }),
      },
    });

    const elapsedMs = Date.now() - startTime;
    
    if (!response.ok) {
      console.error(`Sync failed with status ${response.status}`);
      const errorText = await response.text();
      console.error('   Error:', errorText);
      process.exit(1);
    }

    const result = await response.json();
    
    console.log(`Sync completed in ${elapsedMs}ms`);
    console.log(`   Total bookings in database: ${result.database_state.total_bookings}`);
    console.log(`   Total booking guests: ${result.database_state.total_booking_guests}`);
    console.log('\nDatabase is now up-to-date with auth-service data.');
    
  } catch (error) {
    console.error('Error during sync:');
    console.error('  ', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.error(`\n   Make sure market-backend is running on ${BACKEND_URL}`);
      console.error('   Run: npm run dev');
    }
    
    process.exit(1);
  }
}

syncBookings();
