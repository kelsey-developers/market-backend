import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAnyRole, requireAuth } from '../middleware/auth';

export const unitsRouter = Router();

const UNIT_META_PREFIX = '__meta__:';

type UnitStatus = 'available' | 'unavailable' | 'maintenance';

type UnitMeta = {
  status?: UnitStatus;
  isFeatured?: boolean;
};

const listUnitsQuerySchema = z.object({
  featured: z.enum(['true', 'false']).optional(),
  city: z.string().trim().optional(),
  limit: z.coerce.number().int().positive().max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const updateUnitSchema = z
  .object({
    status: z.enum(['available', 'unavailable', 'maintenance']).optional(),
    is_featured: z.boolean().optional(),
  })
  .refine((payload) => payload.status !== undefined || payload.is_featured !== undefined, {
    message: 'At least one field (status or is_featured) is required.',
  });

const parseUnitMeta = (value?: string | null): UnitMeta => {
  if (!value || !value.startsWith(UNIT_META_PREFIX)) return {};

  try {
    const parsed = JSON.parse(value.slice(UNIT_META_PREFIX.length)) as UnitMeta;
    return {
      status: parsed.status,
      isFeatured: parsed.isFeatured,
    };
  } catch {
    return {};
  }
};

const serializeUnitMeta = (meta: UnitMeta) => `${UNIT_META_PREFIX}${JSON.stringify(meta)}`;

const resolveStatus = (isActive: boolean, metaStatus?: UnitStatus): UnitStatus => {
  if (metaStatus === 'maintenance') return 'maintenance';
  return isActive ? 'available' : 'unavailable';
};

const parseCity = (location?: string | null): string | undefined => {
  if (!location) return undefined;
  const parts = location
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return undefined;

  const cityToken = parts.find((part) => /city/i.test(part));
  return cityToken ?? parts[parts.length - 1];
};

const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toListingBase = (
  unit: {
    id: string;
    name: string;
    code: string;
    capacity: number;
    nightlyRate: unknown;
    isActive: boolean;
    floorLabel?: string | null;
    createdAt: Date;
    updatedAt: Date;
    property: {
      name: string;
      type: string;
      location?: string | null;
      address?: string | null;
    };
  },
  options?: { includeStatus?: boolean; bookingsCount?: number; owner?: { id: string; fullname: string; email: string } | null }
) => {
  const meta = parseUnitMeta(unit.floorLabel);
  const status = resolveStatus(unit.isActive, meta.status);
  const location = unit.property.location ?? unit.property.address ?? '';
  const city = parseCity(location);
  const price = toNumber(unit.nightlyRate);

  const payload: Record<string, unknown> = {
    id: unit.id,
    title: unit.name,
    description: `${unit.property.name} - ${unit.name}`,
    price,
    price_unit: 'night',
    currency: '₱',
    location,
    city,
    country: 'Philippines',
    bedrooms: Math.max(1, Math.ceil(unit.capacity / 2)),
    bathrooms: Math.max(1, Math.ceil(unit.capacity / 4)),
    property_type: unit.property.type,
    main_image_url: '/heroimage.png',
    amenities: [],
    is_available: status === 'available',
    is_featured: meta.isFeatured === true,
    latitude: 0,
    longitude: 0,
    check_in_time: '14:00',
    check_out_time: '12:00',
    created_at: unit.createdAt.toISOString(),
    updated_at: unit.updatedAt.toISOString(),
  };

  if (options?.includeStatus) {
    payload.status = status;
  }

  if (options?.bookingsCount !== undefined) {
    payload.bookings_count = options.bookingsCount;
  }

  if (options?.owner !== undefined) {
    payload.owner = options.owner;
  }

  return payload;
};

unitsRouter.get('/', async (req, res, next) => {
  try {
    const query = listUnitsQuerySchema.parse(req.query);

    const units = await prisma.unit.findMany({
      include: {
        property: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    let listings = units
      .map((unit) => toListingBase(unit))
      .filter((row) => row.is_available === true);

    if (query.featured) {
      const featured = query.featured === 'true';
      listings = listings.filter((row) => row.is_featured === featured);
    }

    if (query.city) {
      const city = query.city.toLowerCase();
      listings = listings.filter((row) => String(row.city ?? '').toLowerCase().includes(city));
    }

    const paged = listings.slice(query.offset, query.offset + query.limit);
    res.json(paged);
  } catch (error) {
    next(error);
  }
});

unitsRouter.get('/manage', requireAuth, requireAnyRole(['admin', 'agent']), async (_req, res, next) => {
  try {
    const units = await prisma.unit.findMany({
      include: {
        property: {
          include: {
            userAccesses: {
              include: {
                user: true,
              },
              orderBy: { createdAt: 'desc' },
            },
          },
        },
        bookings: {
          include: {
            agent: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const payload = units.map((unit) => {
      const latestBookingAgent = unit.bookings.find((booking) => booking.agent)?.agent;
      const fallbackUser = unit.property.userAccesses[0]?.user;

      const owner = latestBookingAgent
        ? {
            id: latestBookingAgent.id,
            fullname: latestBookingAgent.name,
            email: latestBookingAgent.email ?? '',
          }
        : fallbackUser
          ? {
              id: fallbackUser.id,
              fullname: fallbackUser.name,
              email: fallbackUser.email,
            }
          : null;

      return toListingBase(unit, {
        includeStatus: true,
        bookingsCount: unit.bookings.length,
        owner,
      });
    });

    res.json(payload);
  } catch (error) {
    next(error);
  }
});

unitsRouter.get('/:id', async (req, res, next) => {
  try {
    const unitId = String(req.params.id);

    const unit = await prisma.unit.findUnique({
      where: { id: unitId },
      include: {
        property: true,
      },
    });

    if (!unit) {
      return res.status(404).json({ message: 'Unit not found' });
    }

    const listing = toListingBase(unit);
    res.json({
      ...listing,
      listing_id: unit.id,
      images: [listing.main_image_url],
      image_urls: [listing.main_image_url],
      details: listing.description,
    });
  } catch (error) {
    next(error);
  }
});

unitsRouter.patch('/:id', requireAuth, requireAnyRole(['admin', 'agent']), async (req, res, next) => {
  try {
    const unitId = String(req.params.id);
    const payload = updateUnitSchema.parse(req.body);

    const existing = await prisma.unit.findUnique({
      where: { id: unitId },
      select: {
        id: true,
        isActive: true,
        floorLabel: true,
      },
    });

    if (!existing) {
      return res.status(404).json({ message: 'Unit not found' });
    }

    const currentMeta = parseUnitMeta(existing.floorLabel);
    const nextStatus = payload.status ?? resolveStatus(existing.isActive, currentMeta.status);
    const nextIsFeatured = payload.is_featured ?? currentMeta.isFeatured ?? false;

    const updated = await prisma.unit.update({
      where: { id: unitId },
      data: {
        isActive: nextStatus === 'available',
        floorLabel: serializeUnitMeta({
          ...currentMeta,
          status: nextStatus,
          isFeatured: nextIsFeatured,
        }),
      },
      select: {
        id: true,
        updatedAt: true,
      },
    });

    res.json({
      id: updated.id,
      status: nextStatus,
      is_available: nextStatus === 'available',
      is_featured: nextIsFeatured,
      updated_at: updated.updatedAt.toISOString(),
    });
  } catch (error) {
    next(error);
  }
});
