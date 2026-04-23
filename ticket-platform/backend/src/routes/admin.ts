import crypto from 'node:crypto';
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAdmin } from '../middleware/admin.js';
import {
  batchMint,
  deployTicketNFT,
  eventIdToUint,
} from '../services/blockchain.js';

const router = Router();

interface SeatGradeInput {
  grade: string;
  price: number;
  totalCount: number;
}

/** POST /api/admin/events — create event, auto-deploy TicketNFT. */
router.post('/events', requireAdmin, async (req, res) => {
  const { name, venue, eventDate, lockDate, seatGrades } = req.body ?? {};

  if (typeof name !== 'string' || name.trim().length < 2) {
    return res.status(400).json({ error: 'invalid_name' });
  }
  if (typeof venue !== 'string' || venue.trim().length < 1) {
    return res.status(400).json({ error: 'invalid_venue' });
  }
  const eventDateObj = new Date(eventDate);
  const lockDateObj = new Date(lockDate);
  if (Number.isNaN(eventDateObj.getTime())) {
    return res.status(400).json({ error: 'invalid_eventDate' });
  }
  if (Number.isNaN(lockDateObj.getTime())) {
    return res.status(400).json({ error: 'invalid_lockDate' });
  }
  if (!Array.isArray(seatGrades) || seatGrades.length === 0) {
    return res.status(400).json({ error: 'invalid_seatGrades' });
  }
  const grades: SeatGradeInput[] = [];
  for (const g of seatGrades) {
    if (
      !g ||
      typeof g.grade !== 'string' ||
      !Number.isInteger(g.price) ||
      g.price <= 0 ||
      !Number.isInteger(g.totalCount) ||
      g.totalCount <= 0
    ) {
      return res.status(400).json({ error: 'invalid_seatGrade_row' });
    }
    grades.push({ grade: g.grade.trim(), price: g.price, totalCount: g.totalCount });
  }

  const eventId = crypto.randomUUID();
  const deploy = await deployTicketNFT(eventId);

  const created = await prisma.event.create({
    data: {
      id: eventId,
      name: name.trim(),
      venue: venue.trim(),
      eventDate: eventDateObj,
      lockDate: lockDateObj,
      contractAddr: deploy.address,
      seatGrades: {
        create: grades,
      },
    },
    include: { seatGrades: true },
  });

  return res.status(201).json({
    event: created,
    deploy: { txHash: deploy.txHash, mocked: deploy.mocked },
  });
});

/** GET /api/admin/events — list events for admin. */
router.get('/events', requireAdmin, async (_req, res) => {
  const events = await prisma.event.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      seatGrades: true,
      _count: { select: { tickets: true } },
    },
  });
  res.json({ events });
});

/**
 * POST /api/admin/events/:id/mint
 * Body: { assignments: [{ grade, walletAddress }] }
 * Mints one ticket per assignment, assigning sequential seat numbers per grade.
 */
router.post('/events/:id/mint', requireAdmin, async (req, res) => {
  const eventId = req.params.id;
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { seatGrades: true },
  });
  if (!event) return res.status(404).json({ error: 'event_not_found' });

  const assignments = req.body?.assignments;
  if (!Array.isArray(assignments) || assignments.length === 0) {
    return res.status(400).json({ error: 'invalid_assignments' });
  }

  // Group by grade, validate addresses, and resolve to existing users.
  const byGrade = new Map<string, string[]>();
  for (const a of assignments) {
    if (
      !a ||
      typeof a.grade !== 'string' ||
      typeof a.walletAddress !== 'string' ||
      !/^0x[0-9a-fA-F]{40}$/.test(a.walletAddress)
    ) {
      return res.status(400).json({ error: 'invalid_assignment_row' });
    }
    const list = byGrade.get(a.grade) ?? [];
    list.push(a.walletAddress);
    byGrade.set(a.grade, list);
  }

  const gradeByName = new Map(event.seatGrades.map((g) => [g.grade, g]));
  for (const [grade] of byGrade) {
    if (!gradeByName.has(grade)) {
      return res.status(400).json({ error: `unknown_grade:${grade}` });
    }
  }

  // Capacity check: alreadyMinted + newCount <= totalCount.
  const existingCounts = await prisma.ticket.groupBy({
    by: ['grade'],
    where: { eventId },
    _count: { _all: true },
  });
  const existingByGrade = new Map(existingCounts.map((c) => [c.grade, c._count._all]));

  for (const [grade, recipients] of byGrade) {
    const cap = gradeByName.get(grade)!.totalCount;
    const already = existingByGrade.get(grade) ?? 0;
    if (already + recipients.length > cap) {
      return res
        .status(400)
        .json({ error: `capacity_exceeded:${grade}`, cap, already, requested: recipients.length });
    }
  }

  // Mint per grade with consistent price + lockDate.
  const lockUnix = Math.floor(event.lockDate.getTime() / 1000);
  const createdTickets: unknown[] = [];

  for (const [grade, recipients] of byGrade) {
    const gradeInfo = gradeByName.get(grade)!;
    const already = existingByGrade.get(grade) ?? 0;
    const seatIds = recipients.map((_, i) => already + i + 1);

    const result = await batchMint({
      contractAddress: event.contractAddr,
      recipients,
      eventIdOnChain: eventIdToUint(event.id),
      seatIds,
      price: gradeInfo.price,
      lockDate: lockUnix,
    });

    for (let i = 0; i < recipients.length; i++) {
      const user = await prisma.user.findUnique({
        where: { walletAddress: recipients[i] },
      });
      if (!user) {
        // Skip unknown wallets but surface them so admin can re-try.
        createdTickets.push({ walletAddress: recipients[i], error: 'user_not_found' });
        continue;
      }
      const t = await prisma.ticket.create({
        data: {
          tokenId: result.tokenIds[i] ?? `pending:${result.txHash}:${i}`,
          eventId,
          userId: user.id,
          seatId: `${grade}-${seatIds[i]}`,
          grade,
          price: gradeInfo.price,
          status: 'issued',
        },
      });
      createdTickets.push({ ticket: t, mocked: result.mocked, txHash: result.txHash });
    }
  }

  return res.status(201).json({ tickets: createdTickets });
});

export default router;
