import type { NextFunction, Request, Response } from 'express';

/**
 * Paths each restricted role is allowed to access (relative to /api mount).
 * Admin, Agent, and users without these roles are not restricted.
 */
const ROLE_ALLOWED_PREFIXES: Record<string, string[]> = {
  inventory: [
    '/inventory',
    '/products',
    '/product-categories',
    '/suppliers',
    '/purchase-orders',
    '/goods-receipts',
    '/damage-incidents',
  ],
  finance: ['/bookings', '/damage-incidents', '/charge-types'],
  housekeeping: [
    '/inventory',
    '/units',
    '/damage-incidents',
    '/products',
    '/product-categories',
  ],
  operations: [
    '/inventory',
    '/units',
    '/damage-incidents',
    '/products',
    '/product-categories',
  ],
};

function normalizeRoles(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((r) => r.trim().toLowerCase())
    .filter(Boolean);
}

function getRestrictedRole(req: Request): string | null {
  const role = req.header('x-user-role');
  const roles = req.header('x-user-roles');
  const all = [...normalizeRoles(role), ...normalizeRoles(roles)];

  // Check in order: first matching restricted role wins
  if (all.includes('inventory')) return 'inventory';
  if (all.includes('finance')) return 'finance';
  if (all.includes('housekeeping') || all.includes('operations')) return 'housekeeping';
  return null;
}

function isAllowedPath(path: string, role: string): boolean {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const prefixes = ROLE_ALLOWED_PREFIXES[role];
  if (!prefixes) return true;

  // Housekeeping/operations: block /units/manage (admin/agent only)
  if ((role === 'housekeeping' || role === 'operations') && normalized.startsWith('/units/manage')) {
    return false;
  }

  return prefixes.some((prefix) => normalized.startsWith(prefix));
}

/**
 * Middleware: restricts inventory, finance, and housekeeping/operations roles
 * to their allowed API paths. Block all others with 403.
 */
export function roleGuard(req: Request, res: Response, next: NextFunction): void {
  const role = getRestrictedRole(req);
  if (!role) {
    return next();
  }

  const path = req.path || req.url?.split('?')[0] || '';
  if (isAllowedPath(path, role)) {
    return next();
  }

  const messages: Record<string, string> = {
    inventory:
      'Forbidden - inventory role can only access inventory, products, suppliers, purchase orders, goods receipts, and damage incidents',
    finance:
      'Forbidden - finance role can only access bookings, damage incidents, and charge types',
    housekeeping:
      'Forbidden - housekeeping role can only access inventory, units, damage incidents, and products',
  };

  res.status(403).json({
    message: messages[role] ?? 'Forbidden - insufficient permissions',
  });
}
