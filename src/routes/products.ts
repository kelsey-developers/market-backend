import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';

export const productsRouter = Router();

const createProductSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  unit: z.string().min(1),
  reorderLevel: z.number().int().min(0).default(0),
  supplierId: z.string().optional(),
});

const updateProductSchema = createProductSchema.partial();

productsRouter.get('/', async (_req, res, next) => {
  try {
    const products = await prisma.product.findMany({
      include: { supplier: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ products });
  } catch (error) {
    next(error);
  }
});

productsRouter.post('/', async (req, res, next) => {
  try {
    const payload = createProductSchema.parse(req.body);
    const product = await prisma.product.create({ data: payload });
    res.status(201).json(product);
  } catch (error) {
    next(error);
  }
});

productsRouter.patch('/:id', async (req, res, next) => {
  try {
    const payload = updateProductSchema.parse(req.body);
    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: payload,
    });
    res.json(product);
  } catch (error) {
    next(error);
  }
});
