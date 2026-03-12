import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';

export const addonRequestsRouter = Router();

const itemSchema = z.object({
  chargeTypeCode: z.string().min(1).optional(),
  chargeTypeId: z.string().min(1).optional(),
  quantity: z.number().int().positive().default(1),
  amount: z.number().nonnegative().optional(),
  notes: z.string().max(500).optional(),
});

const bulkSchema = z
  .object({
    bookingId: z.string().min(1, 'bookingId is required'),
    items: z.array(itemSchema).min(1, 'At least one item is required'),
  })
  .refine((d) => d.items.every((i) => i.chargeTypeCode || i.chargeTypeId), {
    message: 'Each item must have chargeTypeCode or chargeTypeId',
    path: ['items'],
  });

/**
 * POST /api/addon-requests
 * Submit requested add-ons (items) for a booking in one request.
 * College/external systems can POST multiple items at once.
 */
addonRequestsRouter.post('/', async (req, res, next) => {
  try {
    const payload = bulkSchema.parse(req.body);

    const booking = await prisma.booking.findFirst({
      where: { OR: [{ id: payload.bookingId }, { bookingCode: payload.bookingId }] },
      select: { id: true },
    });
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found.' });
    }

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

    for (const item of payload.items) {
      const ct = item.chargeTypeId
        ? byId.get(item.chargeTypeId)
        : item.chargeTypeCode
          ? byCode.get(item.chargeTypeCode.trim().toUpperCase())
          : null;

      if (!ct) {
        const hint = item.chargeTypeCode || item.chargeTypeId;
        return res.status(400).json({
          message: `Charge type not found or inactive: ${hint}`,
          availableCodes: chargeTypes.map((c) => c.code),
        });
      }

      const defaultAmount = ct.defaultAmount ? Number(ct.defaultAmount) : 0;
      const amount = item.amount ?? defaultAmount;
      if (!Number.isFinite(amount) || amount < 0) {
        return res.status(400).json({
          message: `Invalid amount for ${ct.code}. Provide amount or ensure charge type has defaultAmount.`,
        });
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

    res.status(201).json({
      message: `${created.count} add-on(s) received and added.`,
      count: created.count,
      charges: charges.map((c) => ({
        id: c.id,
        chargeTypeId: c.chargeTypeId,
        name: c.name,
        amount: Number(c.amount),
        quantity: c.quantity,
        notes: c.notes,
      })),
    });
  } catch (error) {
    next(error);
  }
});
