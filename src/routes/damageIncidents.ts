import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import multer from 'multer';
import { Request, Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import {
  findUserIdByEmail,
  getDisplayNamesForUserIds,
  getRequestIdentity,
  resolveRequestUserId,
} from '../lib/requestUser';
import { getDamageIncidentUploadsPath } from '../lib/paths';
import { optionalAuth } from '../middleware/auth';

export const damageIncidentsRouter = Router();

function normalizeDisplayName(value?: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === '—') return null;
  const lower = trimmed.toLowerCase();
  if (lower === 'unknown' || lower === 'unknown reporter') return null;
  return trimmed;
}

function buildActorDisplayLabel(name?: string | null, userId?: string | null): string {
  const normalizedName = normalizeDisplayName(name);
  const normalizedUserId = userId?.trim() || '';

  if (normalizedName && normalizedUserId) {
    const lowerName = normalizedName.toLowerCase();
    if (lowerName.includes('(id:') || lowerName.includes('user id:')) return normalizedName;
    if (lowerName === normalizedUserId.toLowerCase()) return `User ID: ${normalizedUserId}`;
    return `${normalizedName} (ID: ${normalizedUserId})`;
  }
  if (normalizedName) return normalizedName;
  if (normalizedUserId) return `User ID: ${normalizedUserId}`;
  return '—';
}

/** Reporter user id for DB. Prefer body email, then x-user-email, then x-reporter-user-id, else raw identity. */
async function getReporterFromRequest(
  req: Request,
  bodyEmail?: string | null
): Promise<string | null> {
  const reporterHeaderId = req.get('x-reporter-user-id')?.trim() || null;
  const email = (bodyEmail?.trim() || req.get('x-user-email')?.trim() || req.auth?.email?.trim()) || null;
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    try {
      const existingId = await findUserIdByEmail(email);
      if (existingId) return existingId;
    } catch {
      // fall through
    }
  }
  let internalId = await resolveRequestUserId(req, { headerKey: 'x-reporter-user-id' });
  if (internalId) return internalId;
  internalId = await resolveRequestUserId(req);
  if (internalId) return internalId;
  return getRequestIdentity(req) ?? reporterHeaderId;
}

/** Resolve optional FK ids: only return ids that exist in DB to avoid constraint violations (e.g. bookingId from another system). */
async function resolveOptionalFks(payload: {
  bookingId?: string | null;
  unitId?: string | null;
  warehouseId?: string | null;
}): Promise<{ bookingId?: string; unitId?: string; warehouseId?: string }> {
  const out: { bookingId?: string; unitId?: string; warehouseId?: string } = {};
  if (payload.bookingId?.trim()) {
    const b = await prisma.booking.findUnique({ where: { id: payload.bookingId.trim() }, select: { id: true } });
    if (b) out.bookingId = b.id;
  }
  if (payload.unitId?.trim()) {
    const u = await prisma.unit.findUnique({ where: { id: payload.unitId.trim() }, select: { id: true } });
    if (u) out.unitId = u.id;
  }
  if (payload.warehouseId?.trim()) {
    const w = await prisma.warehouse.findUnique({ where: { id: payload.warehouseId.trim() }, select: { id: true } });
    if (w) out.warehouseId = w.id;
  }
  return out;
}

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_FILES_PER_REQUEST = 8;

const upload = multer({
  storage: multer.memoryStorage(), // Use memory storage to avoid writing to disk
  limits: {
    files: MAX_FILES_PER_REQUEST,
    fileSize: MAX_FILE_SIZE_BYTES,
  },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      callback(new Error('Unsupported file type. Only JPG, PNG, and WEBP are allowed.'));
      return;
    }
    callback(null, true);
  },
});

const createDamageIncidentSchema = z
  .object({
    bookingId: z.string().optional(),
    // UI may send empty strings for unselected fields; accept and treat as missing.
    unitId: z.string().optional(),
    warehouseId: z.string().optional(),
    reportedByUserId: z.string().optional(),
    reportedByEmail: z.string().max(191).optional(),
    resolvedByUserId: z.string().optional(),
    reportedAt: z.coerce.date().optional(),
    resolvedAt: z.coerce.date().optional(),
    description: z.string().min(1),
    resolutionNotes: z.string().optional(),
    // Cost is required at the database level but optional in the API payload;
    // default to 0 so callers don't have to calculate it upfront.
    cost: z.number().nonnegative().optional().default(0),
    chargedToGuest: z.number().nonnegative().optional(),
    absorbedAmount: z.number().nonnegative().optional(),
    status: z
      .enum(['open', 'in-review', 'in_review', 'resolved', 'charged_to_guest', 'absorbed', 'settled'])
      .optional()
      .transform((v) => (v === 'in-review' ? 'in_review' : v)),
  })
  .refine((data) => {
    const unit = (data.unitId ?? '').trim();
    const warehouse = (data.warehouseId ?? '').trim();
    return !!unit || !!warehouse;
  }, {
    message: 'Either unitId or warehouseId is required.',
    path: ['unitId'],
  });

const updateDamageIncidentSchema = z.object({
  bookingId: z.string().nullable().optional(),
  // Allow clearing with null and avoid rejecting empty strings.
  unitId: z.string().nullable().optional(),
  warehouseId: z.string().nullable().optional(),
  reportedByUserId: z.string().nullable().optional(),
  resolvedByUserId: z.string().nullable().optional(),
  reportedAt: z.coerce.date().optional(),
  resolvedAt: z.coerce.date().nullable().optional(),
  description: z.string().min(1).optional(),
  resolutionNotes: z.string().nullable().optional(),
  cost: z.number().nonnegative().optional(),
  chargedToGuest: z.number().nonnegative().optional(),
  absorbedAmount: z.number().nonnegative().optional(),
  status: z
    .enum(['open', 'in-review', 'in_review', 'resolved', 'charged_to_guest', 'absorbed', 'settled'])
    .optional()
    .transform((v) => (v === 'in-review' ? 'in_review' : v)),
});

const listDamageIncidentsQuerySchema = z.object({
  unitId: z.string().optional(),
  bookingId: z.string().optional(),
  status: z.enum(['open', 'charged_to_guest', 'absorbed', 'settled']).optional(),
  limit: z.coerce.number().int().positive().max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

const toAttachmentUrl = (req: Request, fileName: string) => {
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http');
  const host = req.get('host') || '';
  return `${proto}://${host}/uploads/damage-incidents/${encodeURIComponent(fileName)}`;
};

const toAttachmentContentUrl = (req: Request, attachmentId: string) => {
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http');
  const host = req.get('host') || '';
  return `${proto}://${host}/api/damage-incidents/attachments/${attachmentId}/content`;
};

damageIncidentsRouter.get('/', optionalAuth, async (req, res, next) => {
  try {
    const query = listDamageIncidentsQuerySchema.parse(req.query);
    // Finance sees all damage incidents (same as admin) so damage/penalty data always reflects.
    const incidents = await prisma.damageIncident.findMany({
      where: {
        ...(query.unitId ? { unitId: query.unitId } : {}),
        ...(query.bookingId ? { bookingId: query.bookingId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      include: {
        booking: true,
        unit: true,
        attachments: { orderBy: { createdAt: 'desc' } },
        stockMovements: {
          include: { product: true, warehouse: true },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { reportedAt: 'desc' },
      take: query.limit,
      skip: query.offset,
    });

    const userIds = [...new Set(incidents.flatMap((i) => [i.reportedByUserId, i.resolvedByUserId].filter(Boolean) as string[]))];
    const userDisplay = await getDisplayNamesForUserIds(userIds);

    type IncRow = (typeof incidents)[number] & {
      stockMovements?: Array<{ id: string; productId: string; quantity: number }>;
      unitId?: string | null;
      warehouseId?: string | null;
    };
    const payload = incidents.map((inc) => {
      const row = inc as IncRow;
      const items = (row.stockMovements ?? []).map((m) => ({
        id: m.id,
        productId: m.productId,
        unitId: row.unitId ?? undefined,
        warehouseId: row.warehouseId ?? undefined,
        quantity: Math.abs(m.quantity),
        itemCost: undefined,
      }));
      const { stockMovements: _sm, ...rest } = inc;
      const reportedBy = buildActorDisplayLabel(
        row.reportedByUserId ? userDisplay.get(row.reportedByUserId) : null,
        row.reportedByUserId
      );
      const resolvedBy = buildActorDisplayLabel(
        row.resolvedByUserId ? userDisplay.get(row.resolvedByUserId) : null,
        row.resolvedByUserId
      );
      return {
        ...rest,
        reportDate: inc.reportedAt,
        dateReported: inc.reportedAt,
        reportedBy,
        resolvedBy,
        warehouseId: row.warehouseId ?? undefined,
        items,
      };
    });

    res.json({ damageIncidents: payload });
  } catch (error) {
    next(error);
  }
});

damageIncidentsRouter.post('/', optionalAuth, async (req, res, next) => {
  try {
    const payload = createDamageIncidentSchema.parse(req.body);
    const fks = await resolveOptionalFks({
      bookingId: payload.bookingId,
      unitId: payload.unitId ?? null,
      warehouseId: payload.warehouseId ?? null,
    });
    if (!fks.unitId && !fks.warehouseId) {
      res.status(400).json({
        message: 'Either unitId or warehouseId must reference an existing unit or warehouse in this system.',
      });
      return;
    }
    const bodyReportedByEmail = payload.reportedByEmail ?? null;
    const reportedByUserId = await getReporterFromRequest(req, bodyReportedByEmail);
    const isResolvedStatus = payload.status === 'resolved' || payload.status === 'charged_to_guest' || payload.status === 'absorbed' || payload.status === 'settled';
    let resolvedByUserId: string | null | undefined = payload.resolvedByUserId ?? null;
    if (resolvedByUserId == null && isResolvedStatus) {
      resolvedByUserId = (await resolveRequestUserId(req)) ?? getRequestIdentity(req);
    }
    const createData: Record<string, unknown> = {
      description: payload.description,
      resolutionNotes: payload.resolutionNotes,
      cost: payload.cost ?? 0,
      chargedToGuest: payload.chargedToGuest ?? 0,
      absorbedAmount: payload.absorbedAmount ?? 0,
      status: payload.status as 'open' | 'charged_to_guest' | 'absorbed' | 'settled',
      reportedAt: payload.reportedAt ?? new Date(),
      reportedByUserId: reportedByUserId ?? undefined,
      resolvedByUserId: resolvedByUserId ?? undefined,
    };
    if (fks.bookingId != null) createData.bookingId = fks.bookingId;
    if (fks.unitId != null) createData.unitId = fks.unitId;
    if (fks.warehouseId != null) createData.warehouseId = fks.warehouseId;
    if (payload.resolvedAt != null) createData.resolvedAt = payload.resolvedAt;

    const incident = await prisma.damageIncident.create({
      data: createData as never,
      include: {
        booking: true,
        unit: true,
        attachments: true,
      },
    });

    const inc = incident;
    const reporterDisplayMap = inc.reportedByUserId ? await getDisplayNamesForUserIds([inc.reportedByUserId]) : new Map<string, string>();
    const resolverDisplayMap = inc.resolvedByUserId ? await getDisplayNamesForUserIds([inc.resolvedByUserId]) : new Map<string, string>();
    const reportedBy = buildActorDisplayLabel(
      inc.reportedByUserId ? reporterDisplayMap.get(inc.reportedByUserId) : null,
      inc.reportedByUserId
    );
    const resolvedBy = buildActorDisplayLabel(
      inc.resolvedByUserId ? resolverDisplayMap.get(inc.resolvedByUserId) : null,
      inc.resolvedByUserId
    );
    res.status(201).json({ ...incident, reportedBy, resolvedBy });
  } catch (error) {
    next(error);
  }
});

damageIncidentsRouter.get('/attachments/:attachmentId/content', async (req, res, next) => {
  try {
    const attachmentId = String(req.params.attachmentId || '').trim();
    if (!attachmentId) {
      return res.status(400).json({ message: 'Attachment ID is required.' });
    }

    const attachment = await prisma.damageAttachment.findUnique({
      where: { id: attachmentId },
      select: {
        fileUrl: true,
      },
    });

    if (!attachment?.fileUrl) {
      return res.status(404).json({ message: 'Attachment not found.' });
    }

    const stored = attachment.fileUrl;
    let targetUrl = stored;

    // Normalize legacy file-system style paths (e.g. "C:\\repo\\uploads\\damage-incidents\\file.png")
    // so they always redirect through the HTTP /uploads/* URL on this backend.
    const looksLikeFsPath =
      /^[a-zA-Z]:[\\/]/.test(stored) || // Windows "C:\path"
      stored.startsWith('//') || // UNC-style
      stored.startsWith('/'); // Unix-style absolute path

    if (looksLikeFsPath) {
      const fileName = path.basename(stored);
      targetUrl = toAttachmentUrl(req, fileName);
    }

    return res.redirect(targetUrl);
  } catch (error) {
    next(error);
  }
});

damageIncidentsRouter.get('/:id/attachments', async (req, res, next) => {
  try {
    const incidentId = String(req.params.id || '').trim();
    if (!incidentId) {
      return res.status(400).json({ message: 'Damage incident ID is required.' });
    }

    const exists = await prisma.damageIncident.findUnique({
      where: { id: incidentId },
      select: { id: true },
    });
    if (!exists) {
      return res.status(404).json({ message: 'Damage incident not found.' });
    }

    const attachments = await prisma.damageAttachment.findMany({
      where: { damageIncidentId: incidentId },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({
      attachments: attachments.map((entry) => ({
        id: entry.id,
        url: toAttachmentContentUrl(req, entry.id),
        fileUrl: entry.fileUrl,
        fileName: entry.fileName,
        mimeType: entry.mimeType,
        createdAt: entry.createdAt,
      })),
    });
  } catch (error) {
    next(error);
  }
});

damageIncidentsRouter.post('/:id/attachments', optionalAuth, upload.array('files', MAX_FILES_PER_REQUEST), async (req, res, next) => {
  try {
    const incidentId = String(req.params.id || '').trim();
    if (!incidentId) {
      return res.status(400).json({ message: 'Damage incident ID is required.' });
    }

    const incident = await prisma.damageIncident.findUnique({
      where: { id: incidentId },
      select: { id: true },
    });
    if (!incident) {
      return res.status(404).json({ message: 'Damage incident not found.' });
    }

    const files = (req.files as Express.Multer.File[]) ?? [];
    if (files.length === 0) {
      return res.status(400).json({ message: 'At least one image file is required.' });
    }

    const uploadedByUserId = await resolveRequestUserId(req);

    const created = await Promise.all(
      files.map(async (file) => {
        return prisma.damageAttachment.create({
          data: {
            damageIncidentId: incidentId,
            fileUrl: 'pending',
            fileName: file.originalname,
            mimeType: file.mimetype,
            uploadedByUserId,
            // Prisma Bytes expects `Uint8Array<ArrayBuffer>`. Multer buffer is `Buffer<ArrayBufferLike>`.
            fileData: new Uint8Array(file.buffer),
          },
        });
      })
    );

    res.status(201).json({
      attachments: created.map((entry) => ({
        id: entry.id,
        fileName: entry.fileName,
        mimeType: entry.mimeType,
        createdAt: entry.createdAt,
      })),
    });
  } catch (error) {
    next(error);
  }
});

damageIncidentsRouter.get('/:id', async (req, res, next) => {
  try {
    const incident = await prisma.damageIncident.findUnique({
      where: { id: req.params.id },
      include: {
        booking: true,
        unit: true,
        attachments: { orderBy: { createdAt: 'desc' } },
        stockMovements: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!incident) {
      return res.status(404).json({ message: 'Damage incident not found' });
    }

    const inc = incident;
    const ids = [inc.reportedByUserId, inc.resolvedByUserId].filter(Boolean) as string[];
    const display = await getDisplayNamesForUserIds(ids);
    const reportedBy = buildActorDisplayLabel(
      inc.reportedByUserId ? display.get(inc.reportedByUserId) : null,
      inc.reportedByUserId
    );
    const resolvedBy = buildActorDisplayLabel(
      inc.resolvedByUserId ? display.get(inc.resolvedByUserId) : null,
      inc.resolvedByUserId
    );

    res.json({
      ...incident,
      reportedBy,
      resolvedBy,
    });
  } catch (error) {
    next(error);
  }
});

damageIncidentsRouter.patch('/:id', optionalAuth, async (req, res, next) => {
  try {
    const payload = updateDamageIncidentSchema.parse(req.body);
    const fks = await resolveOptionalFks({
      bookingId: payload.bookingId ?? null,
      unitId: payload.unitId ?? null,
      warehouseId: payload.warehouseId ?? null,
    });
    let resolvedByUserId: string | null | undefined = payload.resolvedByUserId;
    const isResolvedStatus = payload.status === 'resolved' || payload.status === 'charged_to_guest' || payload.status === 'absorbed' || payload.status === 'settled';
    if (resolvedByUserId == null && isResolvedStatus) {
      resolvedByUserId = (await resolveRequestUserId(req)) ?? getRequestIdentity(req);
    }
    const incidentId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const incident = await prisma.damageIncident.update({
      where: { id: incidentId },
      data: {
        ...(payload.bookingId !== undefined ? { bookingId: payload.bookingId === null ? null : fks.bookingId ?? null } : {}),
        ...(payload.unitId !== undefined ? { unitId: payload.unitId === null ? null : fks.unitId ?? null } : {}),
        ...(payload.warehouseId !== undefined ? { warehouseId: payload.warehouseId === null ? null : fks.warehouseId ?? null } : {}),
        ...(resolvedByUserId !== undefined ? { resolvedByUserId: resolvedByUserId ?? null } : {}),
        reportedAt: payload.reportedAt,
        resolvedAt: payload.resolvedAt,
        description: payload.description,
        resolutionNotes: payload.resolutionNotes,
        cost: payload.cost,
        chargedToGuest: payload.chargedToGuest,
        absorbedAmount: payload.absorbedAmount,
        status: payload.status as 'open' | 'charged_to_guest' | 'absorbed' | 'settled',
      } as never,
      include: {
        booking: true,
        unit: true,
        attachments: { orderBy: { createdAt: 'desc' } },
      },
    });

    const inc = incident;
    const ids = [inc.reportedByUserId, inc.resolvedByUserId].filter(Boolean) as string[];
    const display = await getDisplayNamesForUserIds(ids);
    const reportedBy = buildActorDisplayLabel(
      inc.reportedByUserId ? display.get(inc.reportedByUserId) : null,
      inc.reportedByUserId
    );
    const resolvedBy = buildActorDisplayLabel(
      inc.resolvedByUserId ? display.get(inc.resolvedByUserId) : null,
      inc.resolvedByUserId
    );
    res.json({
      ...incident,
      reportedBy,
      resolvedBy,
    });
  } catch (error) {
    next(error);
  }
});
