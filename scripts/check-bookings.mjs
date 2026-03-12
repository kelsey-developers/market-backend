import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

try {
  const [count, latest] = await Promise.all([
    prisma.booking.count(),
    prisma.booking.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 10,
      select: {
        id: true,
        bookingCode: true,
        unitId: true,
        status: true,
        checkIn: true,
        checkOut: true,
        totalAmount: true,
        updatedAt: true,
      },
    }),
  ]);

  console.log(
    JSON.stringify(
      {
        bookings: count,
        latest: latest.map((b) => ({
          ...b,
          totalAmount: Number(b.totalAmount),
        })),
      },
      null,
      2
    )
  );
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

