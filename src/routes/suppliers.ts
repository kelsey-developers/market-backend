import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';

export const suppliersRouter = Router();

const createSupplierSchema = z.object({
  name: z.string().min(1),
  contactName: z.string().optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  address: z.string().optional(),
});

suppliersRouter.get('/', async (_req, res, next) => {
  try {
    const suppliers = await prisma.supplier.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json({ suppliers });
  } catch (error) {
    next(error);
  }
});

suppliersRouter.post('/', async (req, res, next) => {
  try {
    const payload = createSupplierSchema.parse(req.body);
    const supplier = await prisma.supplier.create({ data: payload });
    res.status(201).json(supplier);
  } catch (error) {
    next(error);
  }
});
