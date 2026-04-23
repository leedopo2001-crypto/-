import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { verifyQr } from '../services/qr.js';
import { burnTicket } from '../services/blockchain.js';

const router = Router();

/** POST /api/qr/verify — staff scan entry point. */
router.post('/verify', requireAuth, async (req, res) => {
  const token: unknown = req.body?.token;
  if (typeof token !== 'string') {
    return res.status(400).json({ ok: false, reason: 'malformed' });
  }

  const v = verifyQr(token);
  if (!v.ok) {
    return res.status(400).json({ ok: false, reason: v.reason });
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id: v.payload.ticketId },
    include: {
      event: { select: { id: true, name: true, venue: true, contractAddr: true, eventDate: true } },
      user: { select: { name: true } },
    },
  });
  if (!ticket) {
    return res.status(404).json({ ok: false, reason: 'not_found' });
  }
  if (ticket.status === 'used') {
    return res.status(409).json({ ok: false, reason: 'already_used' });
  }
  if (ticket.status !== 'issued') {
    return res.status(409).json({ ok: false, reason: 'invalid_status', status: ticket.status });
  }

  // Mark used atomically, then burn on-chain.
  await prisma.ticket.update({
    where: { id: ticket.id },
    data: { status: 'used' },
  });
  const burn = await burnTicket(ticket.event.contractAddr, ticket.tokenId);

  return res.json({
    ok: true,
    ticket: {
      id: ticket.id,
      seatId: ticket.seatId,
      grade: ticket.grade,
      event: ticket.event,
      holderNameMasked: maskName(ticket.user.name),
    },
    burn: { txHash: burn.txHash, mocked: burn.mocked },
  });
});

function maskName(name: string): string {
  if (!name) return '';
  if (name.length === 1) return name;
  if (name.length === 2) return name[0] + '*';
  return name[0] + '*'.repeat(name.length - 2) + name[name.length - 1];
}

export default router;
