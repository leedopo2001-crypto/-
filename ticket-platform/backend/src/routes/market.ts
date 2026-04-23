import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { clientKey } from '../services/toss.js';

const router = Router();

/** GET /api/market — public list of active listings. */
router.get('/', async (_req, res) => {
  const listings = await prisma.listing.findMany({
    where: { status: 'active' },
    orderBy: { createdAt: 'desc' },
    include: {
      ticket: {
        include: {
          event: { select: { id: true, name: true, venue: true, eventDate: true, lockDate: true } },
        },
      },
      seller: { select: { id: true, name: true } },
    },
  });
  res.json({ listings });
});

router.use(requireAuth);

/** GET /api/market/my — listings I created. */
router.get('/my', async (req, res) => {
  const userId = req.auth!.userId;
  const listings = await prisma.listing.findMany({
    where: { sellerId: userId },
    orderBy: { createdAt: 'desc' },
    include: {
      ticket: {
        include: {
          event: { select: { id: true, name: true, venue: true, eventDate: true, lockDate: true } },
        },
      },
    },
  });
  res.json({ listings });
});

/**
 * POST /api/market/list
 * Body: { ticketId }
 * Price is forced to the ticket's face value — no client-side override.
 */
router.post('/list', async (req, res) => {
  const userId = req.auth!.userId;
  const { ticketId } = req.body ?? {};
  if (typeof ticketId !== 'string') return res.status(400).json({ error: 'invalid_ticketId' });

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { event: true, listing: true },
  });
  if (!ticket) return res.status(404).json({ error: 'ticket_not_found' });
  if (ticket.userId !== userId) return res.status(403).json({ error: 'forbidden' });
  if (ticket.status !== 'issued') return res.status(409).json({ error: 'ticket_not_listable', status: ticket.status });
  if (ticket.event.lockDate.getTime() <= Date.now()) return res.status(409).json({ error: 'lock_passed' });
  if (ticket.listing && ticket.listing.status === 'active') {
    return res.status(409).json({ error: 'already_listed' });
  }

  // Re-use prior canceled listing row if present, otherwise create fresh.
  const listing = ticket.listing
    ? await prisma.listing.update({
        where: { id: ticket.listing.id },
        data: { status: 'active', price: ticket.price, sellerId: userId },
      })
    : await prisma.listing.create({
        data: { ticketId: ticket.id, sellerId: userId, price: ticket.price },
      });

  res.status(201).json({ listing });
});

/**
 * POST /api/market/buy/:id
 * Starts a purchase for the listing. Returns Toss widget parameters; the
 * actual confirm happens at /api/payment/confirm after the redirect.
 */
router.post('/buy/:id', async (req, res) => {
  const buyerId = req.auth!.userId;
  const listingId = req.params.id;

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: {
      ticket: { include: { event: true } },
    },
  });
  if (!listing) return res.status(404).json({ error: 'listing_not_found' });
  if (listing.status !== 'active') return res.status(409).json({ error: 'listing_not_active' });
  if (listing.sellerId === buyerId) return res.status(400).json({ error: 'buyer_is_seller' });
  if (listing.ticket.event.lockDate.getTime() <= Date.now()) {
    return res.status(409).json({ error: 'lock_passed' });
  }

  const orderName = `${listing.ticket.event.name} ${listing.ticket.grade} ${listing.ticket.seatId}`;
  const buyer = await prisma.user.findUnique({ where: { id: buyerId } });
  const order = await prisma.order.create({
    data: {
      buyerId,
      listingId: listing.id,
      amount: listing.price,
      orderName,
    },
  });

  res.json({
    orderId: order.id,
    amount: order.amount,
    orderName: order.orderName,
    customerKey: buyer?.id,
    customerName: buyer?.name,
    clientKey: clientKey(),
    successUrl: `${req.protocol}://${req.get('host')}/payment/success`,
    failUrl: `${req.protocol}://${req.get('host')}/payment/fail`,
  });
});

/** DELETE /api/market/:id — seller cancels. */
router.delete('/:id', async (req, res) => {
  const userId = req.auth!.userId;
  const listing = await prisma.listing.findUnique({ where: { id: req.params.id } });
  if (!listing) return res.status(404).json({ error: 'listing_not_found' });
  if (listing.sellerId !== userId) return res.status(403).json({ error: 'forbidden' });
  if (listing.status !== 'active') return res.status(409).json({ error: 'listing_not_active' });

  await prisma.listing.update({
    where: { id: listing.id },
    data: { status: 'canceled' },
  });
  res.json({ ok: true });
});

export default router;
