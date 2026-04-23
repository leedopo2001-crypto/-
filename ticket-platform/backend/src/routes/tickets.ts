import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { issueQr } from '../services/qr.js';

const router = Router();

router.use(requireAuth);

/** GET /api/tickets/my */
router.get('/my', async (req, res) => {
  const userId = req.auth!.userId;
  const tickets = await prisma.ticket.findMany({
    where: { userId },
    orderBy: { mintedAt: 'desc' },
    include: {
      event: { select: { id: true, name: true, venue: true, eventDate: true, lockDate: true, contractAddr: true } },
      listing: true,
    },
  });
  res.json({ tickets });
});

/** GET /api/tickets/:id */
router.get('/:id', async (req, res) => {
  const userId = req.auth!.userId;
  const ticket = await prisma.ticket.findUnique({
    where: { id: req.params.id },
    include: {
      event: true,
      listing: true,
    },
  });
  if (!ticket) return res.status(404).json({ error: 'not_found' });
  if (ticket.userId !== userId) return res.status(403).json({ error: 'forbidden' });
  res.json({ ticket });
});

/** GET /api/tickets/:id/qr — 30초 만료 HMAC 토큰 + 데이터URL QR */
router.get('/:id/qr', async (req, res) => {
  const userId = req.auth!.userId;
  const ticket = await prisma.ticket.findUnique({
    where: { id: req.params.id },
    include: { listing: true },
  });
  if (!ticket) return res.status(404).json({ error: 'not_found' });
  if (ticket.userId !== userId) return res.status(403).json({ error: 'forbidden' });
  if (ticket.status !== 'issued') {
    return res.status(409).json({ error: 'ticket_not_issuable', status: ticket.status });
  }
  if (ticket.listing && ticket.listing.status === 'active') {
    return res.status(409).json({ error: 'ticket_listed_for_sale' });
  }
  const qr = await issueQr(ticket.id);
  res.json(qr);
});

export default router;
