import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';

export const userRolesRouter = Router();

// Internal system roles that live only in market-backend (not sent to Auth Service)
const INTERNAL_ROLES = ['finance', 'inventory', 'operations', 'frontdesk'] as const;
type InternalRole = (typeof INTERNAL_ROLES)[number];

// Map frontend display names to Prisma UserRole enum values
const ROLE_MAP: Record<string, InternalRole> = {
  Finance:      'finance',
  Inventory:    'inventory',
  Housekeeping: 'operations',
  Operations:   'operations',
  Frontdesk:    'frontdesk',
  'Front Desk': 'frontdesk',
  finance:      'finance',
  inventory:    'inventory',
  housekeeping: 'operations',
  operations:   'operations',
  frontdesk:    'frontdesk',
};

const patchSchema = z.object({
  email: z.string().email(),
  name:  z.string().optional(),
  role:  z.string(),
});

/**
 * GET /api/user-roles
 * Returns all locally-stored internal role mappings keyed by email.
 * e.g. { "user@example.com": "inventory", "other@example.com": "finance" }
 */
userRolesRouter.get('/', async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: { role: { in: INTERNAL_ROLES as unknown as ('finance' | 'inventory' | 'operations' | 'frontdesk')[] } },
      select: { email: true, role: true, name: true },
    });
    const map: Record<string, string> = {};
    for (const u of users) {
      map[u.email] = u.role;
    }
    res.json(map);
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/user-roles
 * Upserts an internal role mapping for a user by email.
 * Body: { email, name?, role }
 * Role must be one of: Finance, Inventory, Housekeeping, Operations, Frontdesk (case-insensitive)
 */
userRolesRouter.patch('/', async (req, res, next) => {
  try {
    const { email, name, role } = patchSchema.parse(req.body);

    const prismaRole = ROLE_MAP[role];
    if (!prismaRole) {
      return res.status(400).json({
        error: `Unknown internal role: ${role}. Valid options: Finance, Inventory, Housekeeping, Frontdesk`,
      });
    }

    const user = await prisma.user.upsert({
      where: { email },
      update: { role: prismaRole, ...(name ? { name } : {}) },
      create: { email, name: name ?? email.split('@')[0], role: prismaRole },
      select: { email: true, role: true, name: true },
    });

    res.json({ email: user.email, role: user.role, name: user.name });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/user-roles
 * Removes the internal role record for a given email (e.g. when user is reassigned to a non-internal role).
 * Body: { email }
 */
userRolesRouter.delete('/', async (req, res, next) => {
  try {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    await prisma.user.deleteMany({ where: { email } });
    res.json({ message: 'Role mapping removed' });
  } catch (error) {
    next(error);
  }
});
