import type { NextFunction, Request, Response } from 'express';

export interface RequestAuthContext {
  userId?: string;
  email?: string;
  roles: string[];
  bearerToken?: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: RequestAuthContext;
    }
  }
}

const normalizeRoles = (value: string | undefined) => {
  if (!value) return [] as string[];
  return value
    .split(',')
    .map((role) => role.trim().toLowerCase())
    .filter(Boolean);
};

const getBearerToken = (authorizationHeader: string | undefined) => {
  if (!authorizationHeader) return undefined;
  const [scheme, token] = authorizationHeader.split(' ');
  if (!scheme || !token) return undefined;
  if (scheme.toLowerCase() !== 'bearer') return undefined;
  return token.trim() || undefined;
};

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const userId = req.header('x-user-id')?.trim() || undefined;
  const email = req.header('x-user-email')?.trim() || undefined;

  const roleHeader = req.header('x-user-role');
  const rolesHeader = req.header('x-user-roles');
  const roles = [
    ...normalizeRoles(roleHeader ?? undefined),
    ...normalizeRoles(rolesHeader ?? undefined),
  ];

  const bearerToken = getBearerToken(req.header('authorization') ?? undefined);

  const isAuthenticated = Boolean(userId || email || bearerToken);
  if (!isAuthenticated) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  req.auth = {
    userId,
    email,
    roles: Array.from(new Set(roles)),
    bearerToken,
  };

  return next();
};

/** Sets req.auth from headers when present; never returns 401. Use for routes that need role-aware filtering but allow unauthenticated/list-all. */
export const optionalAuth = (req: Request, _res: Response, next: NextFunction) => {
  const userId = req.header('x-user-id')?.trim() || undefined;
  const email = req.header('x-user-email')?.trim() || undefined;
  const roleHeader = req.header('x-user-role');
  const rolesHeader = req.header('x-user-roles');
  const roles = [
    ...normalizeRoles(roleHeader ?? undefined),
    ...normalizeRoles(rolesHeader ?? undefined),
  ];
  const bearerToken = getBearerToken(req.header('authorization') ?? undefined);
  if (userId || email || bearerToken || roles.length > 0) {
    req.auth = {
      userId,
      email,
      roles: Array.from(new Set(roles)),
      bearerToken,
    };
  }
  return next();
};

export const requireAnyRole = (requiredRoles: string[]) => {
  const normalizedRequired = requiredRoles.map((role) => role.toLowerCase());

  return (req: Request, res: Response, next: NextFunction) => {
    const auth = req.auth;

    if (!auth) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const hasRole = auth.roles.some((role) => normalizedRequired.includes(role));
    if (!hasRole) {
      return res.status(403).json({ message: `Forbidden - required role: ${requiredRoles.join(' or ')}` });
    }

    return next();
  };
};
