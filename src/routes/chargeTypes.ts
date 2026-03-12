import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAnyRole, requireAuth } from '../middleware/auth';

export const chargeTypesRouter = Router();

const pricingModelSchema = z.enum([
  'PER_BOOKING',
  'PER_NIGHT',
  'PER_PERSON',
  'PER_PERSON_PER_NIGHT',
  'MANUAL',
]);

const listQuerySchema = z.object({
  includeInactive: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
});

const createSchema = z.object({
  code: z.string().min(2).max(64),
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional(),
  defaultAmount: z.number().nonnegative().optional(),
  pricingModel: pricingModelSchema.optional(),
  isActive: z.boolean().optional(),
});

const updateSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
  defaultAmount: z.number().nonnegative().nullable().optional(),
  pricingModel: pricingModelSchema.optional(),
  isActive: z.boolean().optional(),
});

chargeTypesRouter.get('/', async (req, res, next) => {
  try {
    const query = listQuerySchema.parse(req.query);
    const chargeTypes = await prisma.chargeType.findMany({
      where: query.includeInactive ? {} : { isActive: true },
      orderBy: [{ isActive: 'desc' }, { code: 'asc' }],
    });
    res.json({ chargeTypes });
  } catch (error) {
    next(error);
  }
});

// Admin CRUD
chargeTypesRouter.post('/', requireAuth, requireAnyRole(['admin', 'finance']), async (req, res, next) => {
  try {
    const payload = createSchema.parse(req.body);
    const created = await prisma.chargeType.create({
      data: {
        code: payload.code.trim().toUpperCase(),
        name: payload.name.trim(),
        description: payload.description?.trim(),
        defaultAmount: payload.defaultAmount,
        pricingModel: payload.pricingModel,
        isActive: payload.isActive ?? true,
      },
    });
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

chargeTypesRouter.patch('/:id', requireAuth, requireAnyRole(['admin', 'finance']), async (req, res, next) => {
  try {
    const payload = updateSchema.parse(req.body);
    const id = String(req.params.id || '').trim();
    if (!id) {
      return res.status(400).json({ message: 'Charge type id is required' });
    }
    const updated = await prisma.chargeType.update({
      where: { id },
      data: {
        ...(payload.name !== undefined ? { name: payload.name.trim() } : {}),
        ...(payload.description !== undefined ? { description: payload.description?.trim() ?? null } : {}),
        ...(payload.defaultAmount !== undefined ? { defaultAmount: payload.defaultAmount ?? null } : {}),
        ...(payload.pricingModel !== undefined ? { pricingModel: payload.pricingModel } : {}),
        ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {}),
      },
    });
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

