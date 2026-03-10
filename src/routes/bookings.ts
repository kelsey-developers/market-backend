import { BookingStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAnyRole, requireAuth } from '../middleware/auth';

export const bookingsRouter = Router();

const listBookingsQuerySchema = z.object({
  listingId: z.string().min(1, 'listingId is required'),
});

const createBookingSchema = z.object({
  listing_id: z.string().min(1),
  check_in_date: z.string().min(1),
  check_out_date: z.string().min(1),
  num_guests: z.number().int().positive().default(1),
  extra_guests: z.number().int().min(0).default(0),
  landmark: z.string().optional(),
  parking_info: z.string().optional(),
  notes: z.string().optional(),
  request_description: z.string().optional(),
  payment_method: z.string().optional(),
  require_payment: z.boolean().optional(),
  total_amount: z.number().min(0).optional(),
  assigned_agent_id: z.string().optional(),
  assigned_agent_email: z.string().email().optional(),
  assigned_agent_name: z.string().optional(),
  client: z
    .object({
      first_name: z.string().optional(),
      last_name: z.string().optional(),
      email: z.string().email().optional(),
      contact_number: z.string().optional(),
      gender: z.string().optional(),
      birth_date: z.string().optional(),
      preferred_contact: z.string().optional(),
      referred_by: z.string().optional(),
    })
    .optional(),
});

const toDateOnly = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseInputDate = (value: string) => {
  const normalized = value.includes('T') ? value : `${value}T00:00:00`;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date value: ${value}`);
  }
  return parsed;
};

const nightsBetween = (checkIn: Date, checkOut: Date) => {
  const diff = checkOut.getTime() - checkIn.getTime();
  const nights = Math.ceil(diff / (1000 * 60 * 60 * 24));
  return Math.max(1, nights);
};

const toClientBookingStatus = (status: BookingStatus, paymentStatus?: PaymentStatus | null) => {
  if (status === 'pending' && paymentStatus === 'unpaid') return 'pending-payment';
  if (status === 'confirmed') return 'booked';
  if (status === 'checked_in') return 'ongoing';
  if (status === 'checked_out') return 'completed';
  if (status === 'cancelled') return 'cancelled';
  return 'pending';
};

const toAvailabilityStatus = (status: BookingStatus) => {
  if (status === 'pending' || status === 'confirmed') return 'penciled';
  if (status === 'checked_in') return 'ongoing';
  if (status === 'checked_out') return 'completed';
  if (status === 'cancelled') return 'cancelled';
  return 'penciled';
};

const mapPaymentMethod = (method?: string): PaymentMethod | undefined => {
  if (!method) return undefined;
  const normalized = method.trim().toLowerCase();
  if (normalized === 'cash') return 'cash';
  if (normalized === 'gcash') return 'gcash';
  if (normalized === 'bank_transfer') return 'bank_transfer';
  if (normalized === 'credit_card' || normalized === 'card') return 'card';
  return 'other';
};

const generateBookingCode = async () => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const random = Math.random().toString(36).slice(2, 12).toUpperCase();
    const candidate = `BKG-${random}`;
    const exists = await prisma.booking.findUnique({
      where: { bookingCode: candidate },
      select: { id: true },
    });
    if (!exists) return candidate;
  }

  return `BKG-${Date.now().toString(36).toUpperCase()}`;
};

bookingsRouter.get('/', async (req, res, next) => {
  try {
    const query = listBookingsQuerySchema.parse(req.query);
    const bookings = await prisma.booking.findMany({
      where: { unitId: query.listingId },
      orderBy: { checkIn: 'asc' },
    });

    res.json(
      bookings.map((booking) => ({
        id: booking.id,
        check_in_date: toDateOnly(booking.checkIn),
        check_out_date: toDateOnly(booking.checkOut),
        status: toAvailabilityStatus(booking.status),
      }))
    );
  } catch (error) {
    next(error);
  }
});

bookingsRouter.post('/', async (req, res, next) => {
  try {
    const payload = createBookingSchema.parse(req.body);

    const checkIn = parseInputDate(payload.check_in_date);
    const checkOut = parseInputDate(payload.check_out_date);

    if (checkOut <= checkIn) {
      return res.status(400).json({ error: 'check_out_date must be after check_in_date' });
    }

    const unit = await prisma.unit.findUnique({
      where: { id: payload.listing_id },
      include: { property: true },
    });

    if (!unit) {
      return res.status(404).json({ error: 'Unit not found' });
    }

    const overlapping = await prisma.booking.findFirst({
      where: {
        unitId: payload.listing_id,
        status: { not: 'cancelled' },
        AND: [{ checkIn: { lt: checkOut } }, { checkOut: { gt: checkIn } }],
      },
      select: { id: true },
    });

    if (overlapping) {
      return res.status(409).json({
        error: 'Booking dates overlap with existing booking',
        overlapping: true,
      });
    }

    const code = await generateBookingCode();
    const nights = nightsBetween(checkIn, checkOut);
    const nightlyRate = Number(unit.nightlyRate ?? 0);
    const computedTotal = nightlyRate * nights;
    const totalAmount = payload.total_amount ?? computedTotal;

    const agent = payload.assigned_agent_email
      ? await prisma.agent.upsert({
          where: { email: payload.assigned_agent_email },
          update: {
            name: payload.assigned_agent_name ?? payload.assigned_agent_email,
          },
          create: {
            name: payload.assigned_agent_name ?? payload.assigned_agent_email,
            email: payload.assigned_agent_email,
          },
        })
      : null;

    const booking = await prisma.booking.create({
      data: {
        bookingCode: code,
        unitId: payload.listing_id,
        agentId: payload.assigned_agent_id ?? agent?.id,
        channel: 'direct',
        status: 'pending',
        guestName: [payload.client?.first_name, payload.client?.last_name].filter(Boolean).join(' ').trim() || null,
        guestCount: payload.num_guests,
        checkIn,
        checkOut,
        basePrice: computedTotal,
        discount: 0,
        totalAmount,
        notes: payload.notes ?? payload.request_description,
      },
    });

    if (payload.client?.first_name || payload.client?.last_name || payload.client?.email) {
      const guest = await prisma.guest.create({
        data: {
          firstName: payload.client?.first_name || 'Guest',
          lastName: payload.client?.last_name || null,
          email: payload.client?.email || null,
          phone: payload.client?.contact_number || null,
        },
      });

      await prisma.bookingGuest.create({
        data: {
          bookingId: booking.id,
          guestId: guest.id,
          isPrimary: true,
          isBooker: true,
        },
      });
    }

    const blocks: Array<{ unitId: string; bookingId: string; date: Date }> = [];
    for (const cursor = new Date(checkIn); cursor < checkOut; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      blocks.push({
        unitId: booking.unitId,
        bookingId: booking.id,
        date: new Date(cursor),
      });
    }
    if (blocks.length > 0) {
      await prisma.unitDateBlock.createMany({ data: blocks });
    }

    const needsPayment = payload.require_payment !== false;
    const paymentMethod = mapPaymentMethod(payload.payment_method);

    const payment = await prisma.payment.upsert({
      where: { bookingId: booking.id },
      update: {
        subTotal: totalAmount,
        totalPaid: needsPayment ? 0 : totalAmount,
        status: needsPayment ? 'unpaid' : 'paid',
        method: paymentMethod,
        referenceNo: null,
      },
      create: {
        bookingId: booking.id,
        subTotal: totalAmount,
        totalPaid: needsPayment ? 0 : totalAmount,
        status: needsPayment ? 'unpaid' : 'paid',
        method: paymentMethod,
      },
    });

    res.status(201).json({
      id: booking.id,
      booking_id: booking.id,
      reference_code: booking.bookingCode,
      check_in_date: toDateOnly(booking.checkIn),
      check_out_date: toDateOnly(booking.checkOut),
      num_guests: booking.guestCount,
      status: toClientBookingStatus(booking.status, payment.status),
      total_amount: Number(booking.totalAmount),
    });
  } catch (error) {
    next(error);
  }
});

bookingsRouter.get('/my', requireAuth, requireAnyRole(['admin', 'agent']), async (req, res, next) => {
  try {
    const auth = req.auth!;
    const isAdmin = auth.roles.includes('admin');

    if (!isAdmin && !auth.userId && !auth.email) {
      return res.status(403).json({ message: 'Forbidden - agent identity is required' });
    }

    const where = isAdmin
      ? {}
      : {
          OR: [
            ...(auth.userId ? [{ agentId: auth.userId }] : []),
            ...(auth.email ? [{ agent: { email: auth.email } }] : []),
          ],
        };

    const bookings = await prisma.booking.findMany({
      where,
      include: {
        unit: {
          include: {
            property: true,
          },
        },
        guests: {
          include: {
            guest: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        payment: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(
      bookings.map((booking) => {
        const primaryGuest = booking.guests[0]?.guest;
        const location = booking.unit.property.location ?? booking.unit.property.address ?? '';

        return {
          id: booking.id,
          reference_code: booking.bookingCode,
          check_in_date: toDateOnly(booking.checkIn),
          check_out_date: toDateOnly(booking.checkOut),
          status: toClientBookingStatus(booking.status, booking.payment?.status),
          total_amount: Number(booking.totalAmount),
          transaction_number: booking.payment?.referenceNo ?? booking.bookingCode,
          listing: {
            title: booking.unit.name,
            location,
            main_image_url: '/heroimage.png',
          },
          client: {
            first_name: primaryGuest?.firstName ?? booking.guestName?.split(' ')[0] ?? 'Guest',
            last_name: primaryGuest?.lastName ?? booking.guestName?.split(' ').slice(1).join(' ') ?? '',
          },
          payment: booking.payment
            ? {
                reference_number: booking.payment.referenceNo ?? '',
                status: booking.payment.status,
              }
            : undefined,
        };
      })
    );
  } catch (error) {
    next(error);
  }
});

bookingsRouter.get('/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const booking = await prisma.booking.findFirst({
      where: {
        OR: [{ id }, { bookingCode: id }],
      },
      include: {
        unit: {
          include: {
            property: true,
          },
        },
        agent: true,
        guests: {
          include: {
            guest: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        payment: true,
      },
    });

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    const nightlyRate = Number(booking.unit.nightlyRate ?? 0);
    const nights = nightsBetween(booking.checkIn, booking.checkOut);
  const primaryGuest = booking.guests[0]?.guest;
    const location = booking.unit.property.location ?? booking.unit.property.address ?? '';

    res.json({
      id: booking.id,
      reference_code: booking.bookingCode,
      listing_id: booking.unitId,
      check_in_date: toDateOnly(booking.checkIn),
      check_out_date: toDateOnly(booking.checkOut),
      nights,
      num_guests: booking.guestCount,
      extra_guests: 0,
      extra_guest_charge: 0,
      unit_charge: nightlyRate,
      amenities_charge: 0,
      service_charge: 0,
      discount: Number(booking.discount),
      total_amount: Number(booking.totalAmount),
      currency: 'PHP',
      status: toClientBookingStatus(booking.status, booking.payment?.status),
      landmark: '',
      parking_info: '',
      notes: booking.notes ?? '',
      listing: {
        id: booking.unit.id,
        title: booking.unit.name,
        location,
        main_image_url: '/heroimage.png',
        property_type: booking.unit.property.type,
        check_in_time: '14:00',
        check_out_time: '12:00',
        latitude: 0,
        longitude: 0,
      },
      agent: {
        id: booking.agent?.id ?? '',
        fullname: booking.agent?.name ?? 'Unassigned',
        email: booking.agent?.email ?? '',
      },
      client: {
        first_name: primaryGuest?.firstName ?? booking.guestName?.split(' ')[0] ?? 'Guest',
        last_name: primaryGuest?.lastName ?? booking.guestName?.split(' ').slice(1).join(' ') ?? '',
        email: primaryGuest?.email ?? '',
        contact_number: primaryGuest?.phone ?? '',
      },
      payment: booking.payment
        ? {
            payment_method: booking.payment.method,
            reference_number: booking.payment.referenceNo,
            payment_status: booking.payment.status,
          }
        : undefined,
    });
  } catch (error) {
    next(error);
  }
});
