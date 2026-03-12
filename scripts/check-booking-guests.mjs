import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

try {
  const [guestCount, linkCount, latestLinks] = await Promise.all([
    prisma.guest.count(),
    prisma.bookingGuest.count(),
    prisma.bookingGuest.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        booking: {
          select: {
            id: true,
            bookingCode: true,
            unitId: true,
          },
        },
        guest: true,
      },
    }),
  ]);

  console.log(
    JSON.stringify(
      {
        guests: guestCount,
        bookingGuests: linkCount,
        latest: latestLinks.map((link) => ({
          id: link.id,
          bookingId: link.bookingId,
          guestId: link.guestId,
          isPrimary: link.isPrimary,
          isBooker: link.isBooker,
          bookingCode: link.booking.bookingCode,
          unitId: link.booking.unitId,
          guest: {
            firstName: link.guest.firstName,
            lastName: link.guest.lastName,
            email: link.guest.email,
            phone: link.guest.phone,
          },
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

