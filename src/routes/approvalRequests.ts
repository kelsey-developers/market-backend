import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';

export const approvalRequestsRouter = Router();

const THRESHOLD_LARGE_STOCK_OUT = 20;

/**
 * GET /api/approval-requests
 * Returns approval requests from DB + derived from stock movements and damage incidents
 */
approvalRequestsRouter.get('/', async (req, res, next) => {
  try {
    const statusFilter = (req.query.status as string) || 'pending';

    const dbRequests = await prisma.approvalRequest.findMany({
      where: statusFilter === 'all' ? {} : { status: statusFilter },
      orderBy: { requestedAt: 'desc' },
    });

    const movements = await prisma.stockMovement.findMany({
      where: {
        type: 'OUT',
        quantity: { gte: THRESHOLD_LARGE_STOCK_OUT },
      },
      include: {
        product: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const damageIncidents = await prisma.damageIncident.findMany({
      where: { status: 'open' },
      include: {
        unit: { select: { name: true } },
      },
      orderBy: { reportedAt: 'desc' },
      take: 20,
    });

    const derivedFromMovements = movements
      .filter((m) => !dbRequests.some((r) => r.referenceType === 'stock_movement' && r.referenceId === m.id))
      .map((m) => ({
        id: `movement-${m.id}`,
        kind: 'stock-out',
        risk: m.quantity >= 40 ? 'high' : m.quantity >= THRESHOLD_LARGE_STOCK_OUT ? 'medium' : 'low',
        itemName: m.product.name,
        quantity: m.quantity,
        reason: m.reason ?? 'Bulk stock-out',
        requestedBy: null,
        requestedAt: m.createdAt,
        referenceId: m.id,
        referenceType: 'stock_movement',
        status: 'pending',
        reviewedBy: null,
        reviewedAt: null,
      }));

    const derivedFromDamage = damageIncidents.map((d) => ({
      id: `damage-${d.id}`,
      kind: 'write-off',
      risk: 'high',
      itemName: d.description.slice(0, 80),
      quantity: 1,
      reason: d.description,
      requestedBy: null,
      requestedAt: d.reportedAt,
      referenceId: d.id,
      referenceType: 'damage_incident',
      status: 'pending',
      reviewedBy: null,
      reviewedAt: null,
    }));

    const dbFormatted = dbRequests.map((r) => ({
      id: r.id,
      kind: r.kind,
      risk: r.risk,
      itemName: r.itemName,
      quantity: r.quantity,
      reason: r.reason,
      requestedBy: r.requestedBy,
      requestedAt: r.requestedAt,
      referenceId: r.referenceId,
      referenceType: r.referenceType,
      status: r.status,
      reviewedBy: r.reviewedBy,
      reviewedAt: r.reviewedAt,
    }));

    const combined = [...dbFormatted, ...derivedFromMovements, ...derivedFromDamage];
    if (statusFilter !== 'all') {
      const filtered = combined.filter((r) => r.status === statusFilter);
      return res.json(filtered);
    }
    return res.json(combined);
  } catch (error) {
    next(error);
  }
});

const reviewSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  reviewedBy: z.string().optional(),
});

/**
 * PATCH /api/approval-requests/:id
 * Approve or reject. For DB records, updates. For derived (movement-*, damage-*), creates ApprovalRequest and updates reference.
 */
approvalRequestsRouter.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const body = reviewSchema.parse(req.body);
    const reviewedBy = body.reviewedBy ?? req.header('x-user-email') ?? 'admin';

    if (id.startsWith('movement-')) {
      const movementId = id.replace('movement-', '');
      await prisma.approvalRequest.create({
        data: {
          kind: 'stock-out',
          status: body.status,
          risk: 'medium',
          referenceType: 'stock_movement',
          referenceId: movementId,
          itemName: 'Stock movement',
          quantity: 0,
          reason: 'Bulk stock-out approval',
          requestedBy: null,
          reviewedBy,
          reviewedAt: new Date(),
        },
      });
      return res.json({ id, status: body.status, message: 'Recorded' });
    }

    if (id.startsWith('damage-')) {
      const damageId = id.replace('damage-', '');
      await prisma.approvalRequest.create({
        data: {
          kind: 'write-off',
          status: body.status,
          risk: 'high',
          referenceType: 'damage_incident',
          referenceId: damageId,
          itemName: 'Damage incident',
          quantity: 1,
          reason: 'Damage write-off',
          requestedBy: null,
          reviewedBy,
          reviewedAt: new Date(),
        },
      });
      if (body.status === 'approved') {
        await prisma.damageIncident.update({
          where: { id: damageId },
          data: { status: 'settled', resolvedAt: new Date() },
        });
      }
      return res.json({ id, status: body.status, message: 'Recorded' });
    }

    const updated = await prisma.approvalRequest.update({
      where: { id },
      data: {
        status: body.status,
        reviewedBy,
        reviewedAt: new Date(),
      },
    });
    return res.json(updated);
  } catch (error) {
    next(error);
  }
});
