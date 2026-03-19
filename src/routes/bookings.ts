import { BookingStatus, PaymentMethod, PaymentStatus, Prisma } from '@prisma/client';
import { Request, Response, Router } from 'express';
import type { NextFunction } from 'express';
import { z } from 'zod';
import { getAuthServiceBaseUrl } from '../lib/authServiceProxy';
import { prisma } from '../lib/prisma';
import { optionalAuth, requireAnyRole, requireAuth } from '../middleware/auth';

export const bookingsRouter = Router();

const listBookingsQuerySchema = z.object({
  listingId: z.string().min(1, 'listingId is required'),
});

const createBookingSchema = z.object({
  listing_id: z.string().min(1),
  check_in_date: z.string().min(1),
  check_out_date: z.string().min(1),
  num_guests: z.number().int().positive().optional(),
  total_guests: z.number().int().positive().optional(),
  extra_guests: z.number().int().min(0).optional(),
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

const toDateOnlyStr = (value: Date) => {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const upsertAutoChargesForBooking = async (
  bookingId: string,
  unitId: string,
  checkIn: Date,
  checkOut: Date,
  nights: number,
  extraGuests: number
) => {
  const chargeTypes = await prisma.chargeType.findMany({
    where: { isActive: true },
    orderBy: { code: 'asc' },
  });

  const chargeTypeIds = chargeTypes.map((c) => c.id);
  const start = new Date(checkIn);
  const end = new Date(checkOut);
  // Dates that count as nights: check-in date inclusive, check-out date exclusive.
  const stayDates: Date[] = [];
  for (const cursor = new Date(start); cursor < end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    stayDates.push(new Date(cursor));
  }

  // Load per-unit per-date overrides for this booking range.
  const overrides =
    unitId && chargeTypeIds.length > 0 && stayDates.length > 0
      ? await prisma.unitChargeTypeDateOverride.findMany({
          where: {
            unitId,
            chargeTypeId: { in: chargeTypeIds },
            date: {
              gte: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())),
              lt: new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate())),
            },
          },
          select: { chargeTypeId: true, date: true, amount: true },
        })
      : [];

  const overrideMap = new Map<string, number>();
  for (const ov of overrides) {
    const key = `${ov.chargeTypeId}:${toDateOnlyStr(ov.date)}`;
    overrideMap.set(key, Number(ov.amount));
  }

  const createCharges: Array<{ chargeTypeId: string; category: 'addon'; name: string; amount: number; quantity: number; notes?: string }> = [];

  for (const ct of chargeTypes) {
    const defaultAmount = ct.defaultAmount ? Number(ct.defaultAmount) : 0;
    if (!Number.isFinite(defaultAmount) || defaultAmount <= 0) continue;

    // Per-night pricing: allow date overrides (e.g. holidays) per unit.
    if (ct.pricingModel === 'PER_NIGHT') {
      for (const d of stayDates) {
        const dateKey = toDateOnlyStr(d);
        const amount = overrideMap.get(`${ct.id}:${dateKey}`) ?? defaultAmount;
        if (!Number.isFinite(amount) || amount <= 0) continue;
        createCharges.push({
          chargeTypeId: ct.id,
          category: 'addon',
          name: ct.name,
          amount,
          quantity: 1,
          notes: `AUTO:${ct.code}:${dateKey}`,
        });
      }
      continue;
    }

    // Per-person-per-night pricing: also allow date overrides; quantity is extra guests for that night.
    if (ct.pricingModel === 'PER_PERSON_PER_NIGHT') {
      const qty = Math.max(0, extraGuests);
      if (qty <= 0) continue;
      for (const d of stayDates) {
        const dateKey = toDateOnlyStr(d);
        const amount = overrideMap.get(`${ct.id}:${dateKey}`) ?? defaultAmount;
        if (!Number.isFinite(amount) || amount <= 0) continue;
        createCharges.push({
          chargeTypeId: ct.id,
          category: 'addon',
          name: ct.name,
          amount,
          quantity: qty,
          notes: `AUTO:${ct.code}:${dateKey}`,
        });
      }
      continue;
    }

    let quantity = 1;
    if (ct.pricingModel === 'PER_PERSON') quantity = Math.max(0, extraGuests);
    if (ct.pricingModel === 'MANUAL') quantity = 0;

    if (quantity <= 0) continue;

    createCharges.push({
      chargeTypeId: ct.id,
      category: 'addon',
      name: ct.name,
      amount: defaultAmount,
      quantity,
      notes: `AUTO:${ct.code}`,
    });
  }

  if (createCharges.length === 0) return;

  // Replace AUTO charges for this booking (do not touch manual lines).
  await prisma.bookingCharge.deleteMany({
    where: {
      bookingId,
      notes: { startsWith: 'AUTO:' },
    },
  });

  await prisma.bookingCharge.createMany({
    data: createCharges.map((c) => ({
      bookingId,
      chargeTypeId: c.chargeTypeId,
      category: c.category,
      name: c.name,
      amount: c.amount,
      quantity: c.quantity,
      notes: c.notes,
    })),
  });
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

const toRawClientStatus = (status: BookingStatus) => {
  if (status === 'pending') return 'penciled';
  if (status === 'confirmed') return 'confirmed';
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

const EXTERNAL_SYNC_PROPERTY_NAME = 'External Sync Units';

type ExternalBookingLike = {
  id?: string | number;
  booking_id?: string | number;
  listing_id?: string;
  listingId?: string;
  listing?: { id?: string; title?: string };
  reference_code?: string;
  booking_code?: string;
  check_in_date?: string;
  check_out_date?: string;
  num_guests?: number;
  total_guests?: number;
  total_amount?: number;
  unit_charge?: number;
  notes?: string;
  status?: string;
  client?: {
    first_name?: string;
    last_name?: string;
    email?: string;
    contact_number?: string;
  };
};

const parseExternalDateSafe = (value: unknown, fallback: Date) => {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  const normalized = value.includes('T') ? value : `${value}T00:00:00`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
};

const mapExternalBookingStatus = (value?: string): BookingStatus => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'pending' || normalized === 'penciled') return 'pending';
  if (normalized === 'confirmed' || normalized === 'booked') return 'confirmed';
  if (normalized === 'checked_in' || normalized === 'ongoing') return 'checked_in';
  if (normalized === 'checked_out' || normalized === 'completed') return 'checked_out';
  if (normalized === 'cancelled' || normalized === 'canceled') return 'cancelled';
  return 'pending';
};

const toExternalBookingRecords = (payload: unknown): ExternalBookingLike[] => {
  if (Array.isArray(payload)) return payload as ExternalBookingLike[];
  if (payload && typeof payload === 'object') {
    const boxed = payload as {
      bookings?: unknown;
      data?: unknown;
      booking?: unknown;
      item?: unknown;
      results?: unknown;
      items?: unknown;
    };
    if (Array.isArray(boxed.bookings)) return boxed.bookings as ExternalBookingLike[];
    if (Array.isArray(boxed.data)) return boxed.data as ExternalBookingLike[];
    if (Array.isArray(boxed.results)) return boxed.results as ExternalBookingLike[];
    if (Array.isArray(boxed.items)) return boxed.items as ExternalBookingLike[];
    if (boxed.data && typeof boxed.data === 'object') return [boxed.data as ExternalBookingLike];
    if (boxed.booking && typeof boxed.booking === 'object') return [boxed.booking as ExternalBookingLike];
    if (boxed.item && typeof boxed.item === 'object') return [boxed.item as ExternalBookingLike];
    return [payload as ExternalBookingLike];
  }
  return [];
};

const recordHasClient = (raw: ExternalBookingLike): boolean => {
  const c = raw.client;
  if (!c) return false;
  return Boolean(
    (c.first_name && c.first_name.trim()) ||
      (c.last_name && c.last_name.trim()) ||
      (c.email && c.email.trim()) ||
      (c.contact_number && c.contact_number.trim())
  );
};

const toExternalBookingId = (raw: ExternalBookingLike): string => {
  const directId = String(raw.id ?? raw.booking_id ?? '').trim();
  if (directId) return directId;

  const codeId = String(raw.reference_code ?? raw.booking_code ?? '').trim();
  return codeId;
};

const ensureLocalUnitForBooking = async (
  tx: Prisma.TransactionClient,
  unitId: string,
  unitTitle?: string,
  nightlyRate?: number | null
) => {
  const existing = await tx.unit.findUnique({
    where: { id: unitId },
    select: { id: true, nightlyRate: true },
  });
  const safeNightlyRate =
    nightlyRate != null && Number.isFinite(Number(nightlyRate)) ? Number(nightlyRate) : undefined;

  if (existing) {
    // Only fill in missing/zero rates to avoid overwriting manual values unless the unit was never priced.
    if (safeNightlyRate != null && safeNightlyRate > 0) {
      const current = existing.nightlyRate == null ? 0 : Number(existing.nightlyRate);
      if (!Number.isFinite(current) || current <= 0) {
        await tx.unit.update({
          where: { id: unitId },
          data: {
            nightlyRate: new Prisma.Decimal(safeNightlyRate),
          },
        });
      }
    }
    return;
  }

  let property = await tx.property.findFirst({
    where: { name: EXTERNAL_SYNC_PROPERTY_NAME },
    select: { id: true },
  });

  if (!property) {
    property = await tx.property.create({
      data: {
        name: EXTERNAL_SYNC_PROPERTY_NAME,
        type: 'apartment',
        location: 'Synced from external Auth Service',
        isActive: true,
      },
      select: { id: true },
    });
  }

  const codeSuffix = unitId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'unit';
  await tx.unit.create({
    data: {
      id: unitId,
      propertyId: property.id,
      code: `ext-${codeSuffix}`,
      name: unitTitle?.trim() || `External Unit ${unitId.slice(0, 8)}`,
      capacity: 1,
      nightlyRate:
        safeNightlyRate != null && safeNightlyRate > 0 ? new Prisma.Decimal(safeNightlyRate) : new Prisma.Decimal(0),
      isActive: true,
    },
  });
};

const syncExternalBookingsToLocal = async (payload: unknown, fallbackListingId?: string) => {
  const records = toExternalBookingRecords(payload);
  if (records.length === 0) return { upserted: 0, skipped: 0, guestsUpserted: 0 };

  let upserted = 0;
  let skipped = 0;
  let guestsUpserted = 0;

  await prisma.$transaction(async (tx) => {
    for (const raw of records) {
      const id = toExternalBookingId(raw);
      if (!id) {
        skipped += 1;
        continue;
      }

      const listingId = String(
        raw.listing_id ?? raw.listingId ?? raw.listing?.id ?? fallbackListingId ?? ''
      ).trim();
      if (!listingId) {
        skipped += 1;
        continue;
      }

      const now = new Date();
      const checkIn = parseExternalDateSafe(raw.check_in_date, now);
      let checkOut = parseExternalDateSafe(raw.check_out_date, new Date(checkIn));
      if (checkOut <= checkIn) {
        checkOut = new Date(checkIn);
        checkOut.setUTCDate(checkOut.getUTCDate() + 1);
      }

      const nights = nightsBetween(checkIn, checkOut);
      const totalAmount = Number(raw.total_amount ?? 0);
      const rawUnitCharge = raw.unit_charge != null ? Number(raw.unit_charge) : NaN;

      // External `unit_charge` represents nightly rate; fall back to (total / nights) when missing.
      let nightlyRate = Number.isFinite(rawUnitCharge) && rawUnitCharge > 0 ? rawUnitCharge : totalAmount / Math.max(1, nights);
      if (!Number.isFinite(nightlyRate) || nightlyRate < 0) nightlyRate = 0;

      const basePrice = nightlyRate > 0 ? nightlyRate * nights : totalAmount;

      await ensureLocalUnitForBooking(tx, listingId, raw.listing?.title, nightlyRate);
      const referenceCode = String(raw.reference_code ?? raw.booking_code ?? `EXT-${id}`);
      const guestFirst = raw.client?.first_name?.trim() || '';
      const guestLast = raw.client?.last_name?.trim() || '';
      const guestName = `${guestFirst} ${guestLast}`.trim() || null;
      const totalGuests = Math.max(1, Number(raw.total_guests ?? raw.num_guests ?? 1));

      const booking = await tx.booking.upsert({
        where: { id },
        update: {
          bookingCode: referenceCode,
          unitId: listingId,
          channel: 'direct',
          status: mapExternalBookingStatus(raw.status),
          guestName,
          guestCount: totalGuests,
          checkIn,
          checkOut,
          basePrice: Number.isFinite(basePrice) ? basePrice : 0,
          discount: 0,
          totalAmount: Number.isFinite(totalAmount) ? totalAmount : 0,
          notes: raw.notes ?? null,
        },
        create: {
          id,
          bookingCode: referenceCode,
          unitId: listingId,
          channel: 'direct',
          status: mapExternalBookingStatus(raw.status),
          guestName,
          guestCount: totalGuests,
          checkIn,
          checkOut,
          basePrice: Number.isFinite(basePrice) ? basePrice : 0,
          discount: 0,
          totalAmount: Number.isFinite(totalAmount) ? totalAmount : 0,
          notes: raw.notes ?? null,
        },
      });

      upserted += 1;

      const hasClientInfo =
        Boolean(raw.client?.first_name) ||
        Boolean(raw.client?.last_name) ||
        Boolean(raw.client?.email) ||
        Boolean(raw.client?.contact_number);

      if (hasClientInfo) {
        const email = raw.client?.email?.trim() || null;
        const phone = raw.client?.contact_number?.trim() || null;

        const existingGuest =
          (email &&
            (await tx.guest.findFirst({
              where: { email },
            }))) ||
          (phone &&
            (await tx.guest.findFirst({
              where: { phone },
            })));

        const firstName = raw.client?.first_name?.trim() || 'Guest';
        const lastName = raw.client?.last_name?.trim() || null;

        const guest =
          existingGuest ||
          (await tx.guest.create({
            data: {
              firstName,
              lastName,
              email,
              phone,
            },
          }));

        await tx.bookingGuest.upsert({
          where: {
            bookingId_guestId: {
              bookingId: booking.id,
              guestId: guest.id,
            },
          },
          update: {
            isPrimary: true,
            isBooker: true,
          },
          create: {
            bookingId: booking.id,
            guestId: guest.id,
            isPrimary: true,
            isBooker: true,
          },
        });

        guestsUpserted += 1;
      }
    }
  });

  return { upserted, skipped, guestsUpserted };
};

const fetchExternalBookingsAndSync = async (
  req: {
    method: string;
    originalUrl: string;
    headers: Record<string, unknown>;
    body?: unknown;
  },
  fallbackListingId?: string
) => {
  const baseUrl = getAuthServiceBaseUrl();
  const method = req.method.toUpperCase();
  const canHaveBody = method !== 'GET' && method !== 'HEAD';

  const upstream = await fetch(`${baseUrl.replace(/\/+$/, '')}${req.originalUrl}`, {
    method,
    headers: {
      accept: 'application/json',
      ...(typeof req.headers.authorization === 'string'
        ? { authorization: req.headers.authorization }
        : {}),
      ...(process.env.AUTH_SERVICE_API_TOKEN
        ? { authorization: process.env.AUTH_SERVICE_API_TOKEN }
        : {}),
      ...(canHaveBody ? { 'content-type': 'application/json' } : {}),
    },
    ...(canHaveBody ? { body: JSON.stringify(req.body ?? {}) } : {}),
  });

  const contentType = upstream.headers.get('content-type') || 'application/json; charset=utf-8';
  const bodyText = await upstream.text();
  if (upstream.ok) {
    try {
      const parsed = JSON.parse(bodyText) as unknown;
      const initialRecords = toExternalBookingRecords(parsed);
      const result = await syncExternalBookingsToLocal(parsed, fallbackListingId);

      // Backfill missing client/guest details by calling booking detail endpoint per ID.
      const recordsNeedingClient = initialRecords
        .map((raw) => ({ raw, id: toExternalBookingId(raw) }))
        .filter((x) => !recordHasClient(x.raw) && x.id);
      let detailGuestsUpserted = 0;
      for (const item of recordsNeedingClient) {
        const id = String(item.id ?? '').trim();
        if (!id) continue;

        try {
          const detailRes = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/bookings/${id}`, {
            method: 'GET',
            headers: {
              accept: 'application/json',
              ...(typeof req.headers.authorization === 'string'
                ? { authorization: req.headers.authorization }
                : {}),
              ...(process.env.AUTH_SERVICE_API_TOKEN
                ? { authorization: process.env.AUTH_SERVICE_API_TOKEN }
                : {}),
            },
          });

          if (!detailRes.ok) continue;

          const detailText = await detailRes.text();
          if (!detailText) continue;

          const detailParsed = JSON.parse(detailText) as unknown;
          const detailResult = await syncExternalBookingsToLocal(detailParsed, fallbackListingId);
          detailGuestsUpserted += detailResult.guestsUpserted;
        } catch {
          // Ignore detail failures; base sync already ran.
        }
      }

      if (process.env.NODE_ENV !== 'production') {
        console.log(
          `[bookings sync] upserted=${result.upserted} guests=${result.guestsUpserted + detailGuestsUpserted} skipped=${result.skipped} listingId=${fallbackListingId ?? ''}`
        );
      }
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[bookings sync] failed to parse/sync upstream response:', error);
      }
    }
  }

  return {
    status: upstream.status,
    contentType,
    bodyText,
  };
};

const createExternalBookingAndSync = async (
  req: {
    method: string;
    originalUrl: string;
    headers: Record<string, unknown>;
    body?: unknown;
  }
) => {
  const baseUrl = getAuthServiceBaseUrl();
  const url = `${baseUrl.replace(/\/+$/, '')}/api/bookings`;

  const upstream = await fetch(url, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      ...(typeof req.headers.authorization === 'string'
        ? { authorization: req.headers.authorization }
        : {}),
      ...(process.env.AUTH_SERVICE_API_TOKEN
        ? { authorization: process.env.AUTH_SERVICE_API_TOKEN }
        : {}),
      'content-type': 'application/json',
    },
    body: JSON.stringify(req.body ?? {}),
  });

  const contentType = upstream.headers.get('content-type') || 'application/json; charset=utf-8';
  const bodyText = await upstream.text();

  if (upstream.ok) {
    try {
      const parsed = JSON.parse(bodyText) as unknown;
      // Merge client details from the request body so guests are always available for sync.
      const payloadWithClient =
        parsed && typeof parsed === 'object'
          ? {
              ...(parsed as Record<string, unknown>),
              client:
                (parsed as { client?: ExternalBookingLike['client'] }).client ??
                ((req.body as { client?: ExternalBookingLike['client'] })?.client ?? undefined),
            }
          : parsed;

      const result = await syncExternalBookingsToLocal(payloadWithClient, (req.body as any)?.listing_id);
      if (process.env.NODE_ENV !== 'production') {
        console.log(
          `[bookings sync:create] upserted=${result.upserted} guests=${result.guestsUpserted} skipped=${result.skipped} listingId=${(req.body as any)?.listing_id ?? ''}`
        );
      }
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[bookings sync:create] failed to parse/sync upstream response:', error);
      }
    }
  }

  return {
    status: upstream.status,
    contentType,
    bodyText,
  };
};

const syncBookingsForRequest = async (
  req: {
    method: string;
    originalUrl: string;
    headers: Record<string, unknown>;
    body?: unknown;
  },
  fallbackListingId?: string
) => {
  const normalizeSyncUrl = (originalUrl: string) => {
    try {
      const url = new URL(originalUrl, 'http://local');
      if (url.pathname === '/api/bookings/my') {
        if (!url.searchParams.has('limit')) url.searchParams.set('limit', '200');
        if (!url.searchParams.has('page')) url.searchParams.set('page', '1');
      }
      return `${url.pathname}${url.search}`;
    } catch {
      return originalUrl;
    }
  };

  try {
    await fetchExternalBookingsAndSync(
      {
        ...req,
        originalUrl: normalizeSyncUrl(req.originalUrl),
      },
      fallbackListingId
    );
  } catch {
    // Keep local DB reads resilient when upstream sync is unavailable.
  }
};

const extractBookingLookupKeys = (payload: unknown): string[] => {
  const keys = new Set<string>();
  const add = (value: unknown) => {
    const str = String(value ?? '').trim();
    if (str) keys.add(str);
  };

  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    const obj = value as Record<string, unknown>;

    add(obj.id);
    add(obj.booking_id);
    add(obj.reference_code);
    add(obj.booking_code);

    const nested = obj.data ?? obj.booking ?? obj.item;
    if (nested && nested !== value) {
      visit(nested);
    }
  };

  visit(payload);
  return Array.from(keys);
};

const findLocalBookingByLookupKeys = async (keys: string[]) => {
  for (const key of keys) {
    const booking = await prisma.booking.findFirst({
      where: {
        OR: [{ id: key }, { bookingCode: key }],
      },
      include: {
        payment: true,
      },
    });

    if (booking) return booking;
  }

  return null;
};

const toCreatedBookingResponse = (booking: {
  id: string;
  bookingCode: string;
  checkIn: Date;
  checkOut: Date;
  guestCount: number;
  status: BookingStatus;
  totalAmount: Prisma.Decimal;
  payment?: { status: PaymentStatus } | null;
}) => ({
  id: booking.id,
  booking_id: booking.id,
  reference_code: booking.bookingCode,
  check_in_date: toDateOnly(booking.checkIn),
  check_out_date: toDateOnly(booking.checkOut),
  num_guests: booking.guestCount,
  total_guests: booking.guestCount,
  status: toClientBookingStatus(booking.status, booking.payment?.status),
  total_amount: Number(booking.totalAmount),
});

const shouldFallbackToLocalCreate = (status: number) => {
  return status >= 500 || status === 401 || status === 403 || status === 404;
};

bookingsRouter.get('/', async (req, res, next) => {
  try {
    await syncBookingsForRequest(
      req,
      typeof req.query.listingId === 'string' ? req.query.listingId : undefined
    );

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
    try {
      const upstream = await createExternalBookingAndSync(req);
      if (!shouldFallbackToLocalCreate(upstream.status)) {
        let upstreamPayload: unknown = null;
        try {
          upstreamPayload = upstream.bodyText ? (JSON.parse(upstream.bodyText) as unknown) : null;
        } catch {
          upstreamPayload = null;
        }

        let synced = await findLocalBookingByLookupKeys(extractBookingLookupKeys(upstreamPayload));

        // Some upstream create responses can be eventually consistent. Force one list sync pass
        // by listing ID before returning upstream payload so local DB is as current as possible.
        if (!synced) {
          const listingId =
            typeof (req.body as { listing_id?: unknown })?.listing_id === 'string'
              ? String((req.body as { listing_id?: string }).listing_id).trim()
              : '';

          if (listingId) {
            try {
              await fetchExternalBookingsAndSync(
                {
                  method: 'GET',
                  originalUrl: `/api/bookings?listingId=${encodeURIComponent(listingId)}`,
                  headers: req.headers as Record<string, unknown>,
                },
                listingId
              );
              synced = await findLocalBookingByLookupKeys(extractBookingLookupKeys(upstreamPayload));
            } catch {
              // Non-fatal: return upstream payload if follow-up sync fails.
            }
          }
        }

        if (synced) {
          return res.status(upstream.status === 201 ? 201 : 200).json(toCreatedBookingResponse(synced));
        }

        res.status(upstream.status);
        res.setHeader('Content-Type', upstream.contentType);
        res.send(upstream.bodyText);
        return;
      }

      if (process.env.NODE_ENV !== 'production') {
        console.warn(
          `[bookings create] upstream status=${upstream.status}; falling back to local create.`
        );
      }
    } catch {
      // fallback to local when external is unreachable
    }

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
    const totalGuests = Math.max(1, Number(payload.total_guests ?? payload.num_guests ?? 1));

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
        guestCount: totalGuests,
        checkIn,
        checkOut,
        basePrice: computedTotal,
        discount: 0,
        totalAmount,
        notes: payload.notes ?? payload.request_description,
      },
    });

    // Auto-attach configured charge types (addons) to this booking.
    const extraGuests = Math.max(0, Number(payload.extra_guests ?? Math.max(0, totalGuests - 1)));
    await upsertAutoChargesForBooking(booking.id, booking.unitId, checkIn, checkOut, nights, extraGuests);

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

    res.status(201).json(
      toCreatedBookingResponse({
        ...booking,
        payment: payment ? { status: payment.status } : null,
      })
    );
  } catch (error) {
    next(error);
  }
});

bookingsRouter.get('/my', optionalAuth, async (req, res, next) => {
  try {
    await syncBookingsForRequest(req);

    // Always return local DB bookings so admin and finance get consistent data (unit, dates, guest, base price, add-ons).
    // optionalAuth: no 401/403 — return all bookings when unauthenticated, filter by agent when authenticated as agent.
    const auth = req.auth ?? { roles: [], userId: undefined, email: undefined };
    const isAdmin = auth.roles.includes('admin');
    const isFinance = auth.roles.includes('finance');
    const noRole = auth.roles.length === 0;
    const isAgentOnly = auth.roles.includes('agent') && !isAdmin && !isFinance;

    // Admin, finance, or no role → all bookings. Agent-only → filter by agent id/email when present.
    const where =
      isAgentOnly && (auth.userId || auth.email)
        ? {
            OR: [
              ...(auth.userId ? [{ agentId: auth.userId }] : []),
              ...(auth.email ? [{ agent: { email: auth.email } }] : []),
            ],
          }
        : {};

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
        charges: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(
      bookings.map((booking) => {
        const primaryGuest = booking.guests[0]?.guest;
        const location = booking.unit.property.location ?? booking.unit.property.address ?? '';

        const charges = (booking.charges ?? []).map((c) => ({
          id: c.id,
          category: c.category,
          name: c.name,
          amount: Number(c.amount),
          quantity: c.quantity,
          notes: c.notes ?? '',
        }));

        return {
          id: booking.id,
          reference_code: booking.bookingCode,
          raw_status: toRawClientStatus(booking.status),
          check_in_date: toDateOnly(booking.checkIn),
          check_out_date: toDateOnly(booking.checkOut),
          status: toClientBookingStatus(booking.status, booking.payment?.status),
          total_amount: Number(booking.totalAmount),
          transaction_number: booking.payment?.referenceNo ?? booking.bookingCode,
          charges,
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

/**
 * Schema for bulk add-on charges.
 * Items can use chargeTypeCode (e.g. "CLEANING_FEE") or chargeTypeId.
 */
const bulkAddChargesSchema = z.object({
  items: z.array(
    z.object({
      chargeTypeCode: z.string().min(1).optional(),
      chargeTypeId: z.string().min(1).optional(),
      quantity: z.number().int().positive().default(1),
      amount: z.number().nonnegative().optional(),
      notes: z.string().max(500).optional(),
    })
  ).min(1, 'At least one item is required'),
}).refine((data) => data.items.every((i) => i.chargeTypeCode || i.chargeTypeId), {
  message: 'Each item must have chargeTypeCode or chargeTypeId',
  path: ['items'],
});

async function processBulkAddCharges(
  bookingIdOrCode: string,
  items: z.infer<typeof bulkAddChargesSchema>['items']
) {
  const booking = await prisma.booking.findFirst({
    where: { OR: [{ id: bookingIdOrCode }, { bookingCode: bookingIdOrCode }] },
    select: { id: true },
  });
  if (!booking) return { error: 'Booking not found.', status: 404 as const };

  const chargeTypes = await prisma.chargeType.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true, defaultAmount: true },
  });
  const byId = new Map(chargeTypes.map((c) => [c.id, c]));
  const byCode = new Map(chargeTypes.map((c) => [c.code.toUpperCase(), c]));

  const toCreate: Array<{
    bookingId: string;
    chargeTypeId: string;
    category: 'addon';
    name: string;
    amount: number;
    quantity: number;
    notes: string | null;
  }> = [];

  for (const item of items) {
    const ct = item.chargeTypeId
      ? byId.get(item.chargeTypeId)
      : item.chargeTypeCode
        ? byCode.get(item.chargeTypeCode.trim().toUpperCase())
        : null;

    if (!ct) {
      const hint = item.chargeTypeCode || item.chargeTypeId;
      return {
        error: `Charge type not found or inactive: ${hint}`,
        availableCodes: chargeTypes.map((c) => c.code),
        status: 400 as const,
      };
    }

    const defaultAmount = ct.defaultAmount ? Number(ct.defaultAmount) : 0;
    const amount = item.amount ?? defaultAmount;
    if (!Number.isFinite(amount) || amount < 0) {
      return {
        error: `Invalid amount for ${ct.code}. Provide amount or ensure charge type has defaultAmount.`,
        status: 400 as const,
      };
    }

    toCreate.push({
      bookingId: booking.id,
      chargeTypeId: ct.id,
      category: 'addon',
      name: ct.name,
      amount,
      quantity: item.quantity,
      notes: item.notes?.trim() || null,
    });
  }

  const created = await prisma.bookingCharge.createMany({ data: toCreate });
  const charges = await prisma.bookingCharge.findMany({
    where: { bookingId: booking.id },
    orderBy: { createdAt: 'desc' },
    take: toCreate.length,
  });

  return {
    count: created.count,
    charges: charges.map((c) => ({
      id: c.id,
      chargeTypeId: c.chargeTypeId,
      name: c.name,
      amount: Number(c.amount),
      quantity: c.quantity,
      notes: c.notes,
    })),
  };
}

/** POST /api/bookings/:id/charges/bulk — add add-ons by booking ID in path */
bookingsRouter.post('/:id/charges/bulk', async (req, res, next) => {
  try {
    const bookingId = String(req.params.id || '').trim();
    if (!bookingId) {
      return res.status(400).json({ message: 'Booking ID is required.' });
    }
    const payload = bulkAddChargesSchema.parse(req.body);
    const result = await processBulkAddCharges(bookingId, payload.items);
    if ('error' in result) {
      const status = result.status ?? 400;
      return res.status(status).json(
        status === 404 ? { message: result.error } : { message: result.error, ...(result as { availableCodes?: string[] }) }
      );
    }
    res.status(201).json({
      message: `${result.count} add-on(s) added.`,
      count: result.count,
      charges: result.charges,
    });
  } catch (error) {
    next(error);
  }
});

type ListingSyncStatus = {
  listingId: string;
  status: number;
};

const getLocalListingIdsForFallbackSync = async (): Promise<string[]> => {
  const units = await prisma.unit.findMany({
    select: { id: true },
    orderBy: { id: 'asc' },
  });

  return Array.from(
    new Set(
      units
        .map((u) => String(u.id ?? '').trim())
        .filter(Boolean)
    )
  );
};

const syncBookingsUsingListingFallback = async (
  headers: Record<string, unknown>,
  listingIds: string[]
): Promise<ListingSyncStatus[]> => {
  const statuses: ListingSyncStatus[] = [];

  for (const listingId of listingIds) {
    const upstream = await fetchExternalBookingsAndSync(
      {
        method: 'GET',
        originalUrl: `/api/bookings?listingId=${encodeURIComponent(listingId)}`,
        headers,
      },
      listingId
    );

    statuses.push({ listingId, status: upstream.status });
  }

  return statuses;
};

const syncAllBookingsToLocal = async (headers: Record<string, unknown>) => {
  const beforeBookings = await prisma.booking.count();

  const primarySync = await fetchExternalBookingsAndSync(
    {
      method: 'GET',
      originalUrl: '/api/bookings/my?limit=500&page=1',
      headers,
    },
    undefined
  );

  const afterPrimaryBookings = await prisma.booking.count();
  const primaryUnauthorized = primarySync.status === 401 || primarySync.status === 403;
  const primaryDidNotChangeData = afterPrimaryBookings <= beforeBookings;

  let fallbackUsed = false;
  let fallbackListingStatuses: ListingSyncStatus[] = [];

  if (primaryUnauthorized || primaryDidNotChangeData) {
    const listingIds = await getLocalListingIdsForFallbackSync();
    if (listingIds.length > 0) {
      fallbackUsed = true;
      fallbackListingStatuses = await syncBookingsUsingListingFallback(headers, listingIds);
    }
  }

  const totalBookings = await prisma.booking.count();
  const totalGuests = await prisma.bookingGuest.count();

  return {
    primaryStatus: primarySync.status,
    primaryUnauthorized,
    fallbackUsed,
    fallbackAttemptedListingCount: fallbackListingStatuses.length,
    fallbackListingStatuses,
    totalBookings,
    totalGuests,
  };
};

/**
 * POST /api/bookings/sync — Manual database refresh/sync
 * Forces a full sync of all bookings from the external auth-service API.
 * Falls back to per-listing sync when /bookings/my is unauthorized.
 */
bookingsRouter.post('/sync', async (req, res, next) => {
  try {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[manual-sync] Starting full booking database sync...');
    }

    const startTime = Date.now();
    const syncResult = await syncAllBookingsToLocal(req.headers as Record<string, unknown>);
    const elapsedMs = Date.now() - startTime;

    const hasData = syncResult.totalBookings > 0;
    const statusCode = hasData ? 200 : 502;

    res.status(statusCode).json({
      status: hasData ? 'synced' : 'sync_failed',
      message: hasData
        ? 'Database has been refreshed with latest booking data from auth-service'
        : 'Sync completed but no bookings were written to local database. Check auth-service access.',
      elapsed_ms: elapsedMs,
      sync_details: {
        primary_sync_status: syncResult.primaryStatus,
        primary_sync_unauthorized: syncResult.primaryUnauthorized,
        fallback_used: syncResult.fallbackUsed,
        fallback_attempted_listing_count: syncResult.fallbackAttemptedListingCount,
        fallback_listing_statuses: syncResult.fallbackListingStatuses,
      },
      database_state: {
        total_bookings: syncResult.totalBookings,
        total_booking_guests: syncResult.totalGuests,
      },
    });

    if (process.env.NODE_ENV !== 'production') {
      console.log(
        `[manual-sync] Completed in ${elapsedMs}ms. primary=${syncResult.primaryStatus} fallback=${syncResult.fallbackUsed} bookings=${syncResult.totalBookings} guests=${syncResult.totalGuests}`
      );
    }
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[manual-sync] Error during sync:', error);
    }
    next(error);
  }
});

bookingsRouter.get('/:id', async (req, res, next) => {
  try {
    await syncBookingsForRequest(req);

    const id = req.params.id;
    let booking = await prisma.booking.findFirst({
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
      try {
        await fetchExternalBookingsAndSync(
          {
            method: 'GET',
            originalUrl: '/api/bookings/my?limit=200&page=1',
            headers: req.headers as Record<string, unknown>,
          },
          undefined
        );

        booking = await prisma.booking.findFirst({
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
      } catch {
        // Ignore follow-up sync failures and return standard 404 below if still missing.
      }
    }

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
      total_guests: booking.guestCount,
      extra_guests: 0,
      extra_guest_charge: 0,
      excess_pax_charge: 0,
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
            deposit_amount: Number(booking.payment.totalPaid),
          }
        : undefined,
    });
  } catch (error) {
    next(error);
  }
  });

/**
 * initializeBookingSync — Can be called at startup to pre-populate database
 * @internal Used for server startup initialization
 */
export const initializeBookingSync = async () => {
  try {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[startup-sync] Pre-populating database with booking data from auth-service...');
    }

    const syncResult = await syncAllBookingsToLocal({});

    if (process.env.NODE_ENV !== 'production') {
      console.log(
        `[startup-sync] Completed. primary=${syncResult.primaryStatus} fallback=${syncResult.fallbackUsed} bookings=${syncResult.totalBookings} guests=${syncResult.totalGuests}`
      );
    }

    return {
      success: true,
      totalBookings: syncResult.totalBookings,
      totalGuests: syncResult.totalGuests,
    };
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[startup-sync] Warning: Initial sync failed (will sync on first request):', error);
    }
    return { success: false, error: String(error), totalBookings: 0, totalGuests: 0 };
  }
};

