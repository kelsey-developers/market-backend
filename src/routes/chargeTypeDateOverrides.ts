import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';

export const chargeTypeDateOverridesRouter = Router();

const listQuerySchema = z.object({
  unitId: z.string().min(1),
  from: z.string().optional(), // YYYY-MM-DD
  to: z.string().optional(), // YYYY-MM-DD (exclusive)
});

const upsertSchema = z.object({
  unitId: z.string().min(1),
  chargeTypeId: z.string().min(1),
  date: z.string().min(10), // YYYY-MM-DD
  amount: z.number().nonnegative(),
});

const deleteSchema = z.object({
  unitId: z.string().min(1),
  chargeTypeId: z.string().min(1),
  date: z.string().min(10),
});

function parseDateOnly(value: string): Date {
  // Force UTC midnight to avoid timezone shifting.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) throw new Error(`Invalid date (expected YYYY-MM-DD): ${value}`);
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  return new Date(Date.UTC(y, mo, d));
}

chargeTypeDateOverridesRouter.get('/', async (req, res, next) => {
  try {
    const query = listQuerySchema.parse(req.query);
    const from = query.from ? parseDateOnly(query.from) : undefined;
    const to = query.to ? parseDateOnly(query.to) : undefined;

    const rows = await prisma.unitChargeTypeDateOverride.findMany({
      where: {
        unitId: query.unitId,
        ...(from || to
          ? {
              date: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lt: to } : {}),
              },
            }
          : {}),
      },
      include: {
        chargeType: { select: { id: true, code: true, name: true, pricingModel: true, isActive: true } },
      },
      orderBy: [{ date: 'asc' }, { chargeTypeId: 'asc' }],
    });

    res.json({
      overrides: rows.map((r) => ({
        id: r.id,
        unitId: r.unitId,
        chargeTypeId: r.chargeTypeId,
        date: r.date.toISOString().slice(0, 10),
        amount: Number(r.amount),
        chargeType: r.chargeType,
      })),
    });
  } catch (error) {
    next(error);
  }
});

// Admin CRUD — no auth guard since admin panel has no login flow yet
chargeTypeDateOverridesRouter.post('/', async (req, res, next) => {
  try {
    const payload = upsertSchema.parse(req.body);
    const date = parseDateOnly(payload.date);

    // Ensure FK targets exist to return a clearer error.
    const [unit, ct] = await Promise.all([
      prisma.unit.findUnique({ where: { id: payload.unitId }, select: { id: true } }),
      prisma.chargeType.findUnique({ where: { id: payload.chargeTypeId }, select: { id: true } }),
    ]);
    if (!unit) return res.status(404).json({ message: 'Unit not found' });
    if (!ct) return res.status(404).json({ message: 'Charge type not found' });

    const created = await prisma.unitChargeTypeDateOverride.upsert({
      where: {
        unitId_chargeTypeId_date: {
          unitId: payload.unitId,
          chargeTypeId: payload.chargeTypeId,
          date,
        },
      },
      update: {
        amount: payload.amount,
      },
      create: {
        unitId: payload.unitId,
        chargeTypeId: payload.chargeTypeId,
        date,
        amount: payload.amount,
      },
    });

    res.status(201).json({
      id: created.id,
      unitId: created.unitId,
      chargeTypeId: created.chargeTypeId,
      date: created.date.toISOString().slice(0, 10),
      amount: Number(created.amount),
    });
  } catch (error) {
    next(error);
  }
});

chargeTypeDateOverridesRouter.delete('/', async (req, res, next) => {
  try {
    const payload = deleteSchema.parse(req.body);
    const date = parseDateOnly(payload.date);

    await prisma.unitChargeTypeDateOverride.deleteMany({
      where: {
        unitId: payload.unitId,
        chargeTypeId: payload.chargeTypeId,
        date,
      },
    });

    res.json({ deleted: true });
  } catch (error) {
    next(error);
  }
});

