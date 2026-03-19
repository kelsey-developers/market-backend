import { app } from './app';
import { env } from './config/env';
import { prisma } from './lib/prisma';
import { initializeBookingSync } from './routes/bookings';

const port = env.PORT;

const server = app.listen(port, async () => {
  console.log(`market-backend listening on http://localhost:${port}`);
  
  // Perform startup sync to populate database with fresh booking data from auth-service
  try {
    await initializeBookingSync();
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[startup] Initial booking sync encountered an error:', error);
    }
  }
});

async function shutdown(signal: string) {
  console.log(`Received ${signal}. Shutting down...`);

  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
