import { Router } from 'express';
import { z } from 'zod';
import { ProductItemType } from '@prisma/client';
import { prisma } from '../lib/prisma';

export const productsRouter = Router();

const createProductSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  unit: z.string().min(1),
  itemType: z.nativeEnum(ProductItemType).default(ProductItemType.consumable),
  reorderLevel: z.number().int().min(0).default(0),
  supplierId: z.string().optional(),
  categoryId: z.string().min(1).nullable().optional(),
});

const updateProductSchema = z.object({
  sku: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  unit: z.string().min(1).optional(),
  itemType: z.nativeEnum(ProductItemType).optional(),
  reorderLevel: z.number().int().min(0).optional(),
  supplierId: z.string().min(1).nullable().optional(),
  categoryId: z.string().min(1).nullable().optional(),
});

productsRouter.get('/', async (_req, res, next) => {
  try {
    const products = await prisma.product.findMany({
      include: { supplier: true, category: true },
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
    const product = await prisma.product.create({
      data: payload,
      include: { supplier: true, category: true },
    });
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
      include: { supplier: true, category: true },
    });
    res.json(product);
  } catch (error) {
    next(error);
  }
});
