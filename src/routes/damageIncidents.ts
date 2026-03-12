import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import multer from 'multer';
import { Request, Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';

export const damageIncidentsRouter = Router();

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_FILES_PER_REQUEST = 8;

const upload = multer({
  storage: multer.memoryStorage(),
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

const createDamageIncidentSchema = z.object({
  bookingId: z.string().optional(),
  unitId: z.string().min(1),
  reportedByUserId: z.string().optional(),
  resolvedByUserId: z.string().optional(),
  reportedAt: z.coerce.date().optional(),
  resolvedAt: z.coerce.date().optional(),
  description: z.string().min(1),
  resolutionNotes: z.string().optional(),
  cost: z.number().nonnegative(),
  chargedToGuest: z.number().nonnegative().optional(),
  absorbedAmount: z.number().nonnegative().optional(),
  status: z.enum(['open', 'charged_to_guest', 'absorbed', 'settled']).optional(),
});

const updateDamageIncidentSchema = z.object({
  bookingId: z.string().nullable().optional(),
  unitId: z.string().min(1).optional(),
  reportedByUserId: z.string().nullable().optional(),
  resolvedByUserId: z.string().nullable().optional(),
  reportedAt: z.coerce.date().optional(),
  resolvedAt: z.coerce.date().nullable().optional(),
  description: z.string().min(1).optional(),
  resolutionNotes: z.string().nullable().optional(),
  cost: z.number().nonnegative().optional(),
  chargedToGuest: z.number().nonnegative().optional(),
  absorbedAmount: z.number().nonnegative().optional(),
  status: z.enum(['open', 'charged_to_guest', 'absorbed', 'settled']).optional(),
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

damageIncidentsRouter.get('/', async (req, res, next) => {
  try {
    const query = listDamageIncidentsQuerySchema.parse(req.query);
    const incidents = await prisma.damageIncident.findMany({
      where: {
        ...(query.unitId ? { unitId: query.unitId } : {}),
        ...(query.bookingId ? { bookingId: query.bookingId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      include: {
        booking: true,
        unit: true,
        reportedByUser: true,
        resolvedByUser: true,
        attachments: {
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { reportedAt: 'desc' },
      take: query.limit,
      skip: query.offset,
    });

    res.json({ damageIncidents: incidents });
  } catch (error) {
    next(error);
  }
});

damageIncidentsRouter.post('/', async (req, res, next) => {
  try {
    const payload = createDamageIncidentSchema.parse(req.body);
    const incident = await prisma.damageIncident.create({
      data: {
        bookingId: payload.bookingId,
        unitId: payload.unitId,
        reportedByUserId: payload.reportedByUserId,
        resolvedByUserId: payload.resolvedByUserId,
        reportedAt: payload.reportedAt,
        resolvedAt: payload.resolvedAt,
        description: payload.description,
        resolutionNotes: payload.resolutionNotes,
        cost: payload.cost,
        chargedToGuest: payload.chargedToGuest,
        absorbedAmount: payload.absorbedAmount,
        status: payload.status,
      },
      include: {
        booking: true,
        unit: true,
        reportedByUser: true,
        resolvedByUser: true,
        attachments: true,
      },
    });

    res.status(201).json(incident);
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

    return res.redirect(attachment.fileUrl);
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

damageIncidentsRouter.post('/:id/attachments', upload.array('files', MAX_FILES_PER_REQUEST), async (req, res, next) => {
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

    const uploadDir = path.join(process.cwd(), 'uploads', 'damage-incidents');
    await fs.mkdir(uploadDir, { recursive: true });

    const uploadedByUserId = typeof req.headers['x-user-id'] === 'string'
      ? req.headers['x-user-id']
      : undefined;

    const created = await Promise.all(
      files.map(async (file) => {
        const extension = path.extname(file.originalname) || (
          file.mimetype === 'image/png' ? '.png' : file.mimetype === 'image/webp' ? '.webp' : '.jpg'
        );
        const safeFileName = `${incidentId}-${Date.now()}-${randomUUID()}${extension}`;
        const diskPath = path.join(uploadDir, safeFileName);
        await fs.writeFile(diskPath, file.buffer);

        const publicUrl = toAttachmentUrl(req, safeFileName);
        return prisma.damageAttachment.create({
          data: {
            damageIncidentId: incidentId,
            fileUrl: publicUrl,
            fileName: file.originalname,
            mimeType: file.mimetype,
            uploadedByUserId,
          },
        });
      })
    );

    return res.status(201).json({
      attachments: created.map((entry) => ({
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

damageIncidentsRouter.get('/:id', async (req, res, next) => {
  try {
    const incident = await prisma.damageIncident.findUnique({
      where: { id: req.params.id },
      include: {
        booking: true,
        unit: true,
        reportedByUser: true,
        resolvedByUser: true,
        attachments: {
          orderBy: { createdAt: 'desc' },
        },
        stockMovements: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!incident) {
      return res.status(404).json({ message: 'Damage incident not found' });
    }

    res.json(incident);
  } catch (error) {
    next(error);
  }
});

damageIncidentsRouter.patch('/:id', async (req, res, next) => {
  try {
    const payload = updateDamageIncidentSchema.parse(req.body);
    const incident = await prisma.damageIncident.update({
      where: { id: req.params.id },
      data: {
        bookingId: payload.bookingId,
        unitId: payload.unitId,
        reportedByUserId: payload.reportedByUserId,
        resolvedByUserId: payload.resolvedByUserId,
        reportedAt: payload.reportedAt,
        resolvedAt: payload.resolvedAt,
        description: payload.description,
        resolutionNotes: payload.resolutionNotes,
        cost: payload.cost,
        chargedToGuest: payload.chargedToGuest,
        absorbedAmount: payload.absorbedAmount,
        status: payload.status,
      },
      include: {
        booking: true,
        unit: true,
        reportedByUser: true,
        resolvedByUser: true,
        attachments: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    res.json(incident);
  } catch (error) {
    next(error);
  }
});
