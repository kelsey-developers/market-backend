import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';

export const productCategoriesRouter = Router();

const createCategorySchema = z.object({
  code: z.string().trim().min(1).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(1),
  description: z.string().trim().optional(),
  isActive: z.boolean().optional(),
});

const updateCategorySchema = z.object({
  code: z.string().trim().min(1).transform((value) => value.toUpperCase()).optional(),
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().nullable().optional(),
  isActive: z.boolean().optional(),
});

productCategoriesRouter.get('/', async (_req, res, next) => {
  try {
    const categories = await prisma.inventoryCategory.findMany({
      include: {
        _count: {
          select: { products: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    res.json({ categories });
  } catch (error) {
    next(error);
  }
});

productCategoriesRouter.post('/', async (req, res, next) => {
  try {
    const payload = createCategorySchema.parse(req.body);
    const category = await prisma.inventoryCategory.create({ data: payload });
    res.status(201).json(category);
  } catch (error) {
    next(error);
  }
});

productCategoriesRouter.patch('/:id', async (req, res, next) => {
  try {
    const payload = updateCategorySchema.parse(req.body);
    const category = await prisma.inventoryCategory.update({
      where: { id: req.params.id },
      data: payload,
    });
    res.json(category);
  } catch (error) {
    next(error);
  }
});
