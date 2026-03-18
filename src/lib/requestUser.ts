import type { Request } from 'express';
import { prisma } from './prisma';

/**
 * Resolve the current request user (or a custom header like x-reporter-user-id) to an internal User.id.
 * Tries: (1) custom header value as User.id, (2) x-user-id as User.id, (3) User by x-user-email.
 * Returns internal User id so stored FKs are valid and display name can be resolved from User table.
 */
export async function resolveRequestUserId(
  req: Request,
  options?: { headerKey?: string }
): Promise<string | null> {
  const auth = req.auth;

  if (options?.headerKey) {
    const headerValue = req.get(options.headerKey)?.trim();
    if (headerValue) {
      const byId = await prisma.user.findUnique({ where: { id: headerValue }, select: { id: true } });
      if (byId) return byId.id;
    }
  }

  if (auth?.userId) {
    const byId = await prisma.user.findUnique({ where: { id: auth.userId }, select: { id: true } });
    if (byId) return byId.id;
  }

  if (auth?.email) {
    const byEmail = await prisma.user.findUnique({ where: { email: auth.email }, select: { id: true } });
    if (byEmail) return byEmail.id;
  }

  return null;
}

/**
 * Resolve an existing internal User.id by email.
 * This is lookup-only: it never creates local users or assigns local roles.
 */
export async function findUserIdByEmail(
  email: string
): Promise<string | null> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return null;

  const existing = await prisma.user.findUnique({
    where: { email: trimmed },
    select: { id: true },
  });

  return existing?.id ?? null;
}

/**
 * Fallback identity string when no internal User is found (e.g. auth id or email).
 * Use only for tables that allow non-FK storage (e.g. DamageIncident reportedByUserId as plain string).
 */
export function getRequestIdentity(req: Request): string | null {
  const auth = req.auth;
  if (!auth) return null;
  return auth.userId ?? auth.email ?? null;
}

/**
 * Batch resolve user ids to display names (name or email). Returns Map<userId, displayName>.
 * Use when building list/GET responses that need "reportedBy", "receivedBy", etc.
 * Ids not found in User table get "Unknown reporter" so the UI never shows raw ids.
 */
export async function getDisplayNamesForUserIds(userIds: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(userIds)].filter(Boolean);
  if (unique.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true, email: true },
  });
  const map = new Map<string, string>(users.map((u) => [u.id, u.name?.trim() || u.email || u.id]));
  for (const id of unique) {
    if (!map.has(id)) map.set(id, 'Unknown reporter');
  }
  return map;
}
