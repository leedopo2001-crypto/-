import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { clientKey, confirmPayment } from '../services/toss.js';
import { settleListingPurchase, SettleError } from '../services/market.js';

const router = Router();

/** GET /api/payment/config — expose the Toss client key to the frontend. */
router.get('/config', (_req, res) => {
  try {
    res.json({ clientKey: clientKey() });
  } catch (err) {
    res.status(500).json({ error: 'toss_not_configured' });
  }
});

/**
 * POST /api/payment/prepare
 * Body: { listingId }
 * Creates a pending Order bound to the buyer and returns the parameters
 * needed by the Toss widget.
 */
router.post('/prepare', requireAuth, async (req, res) => {
  const buyerId = req.auth!.userId;
  const { listingId } = req.body ?? {};
  if (typeof listingId !== 'string') {
    return res.status(400).json({ error: 'invalid_listingId' });
  }

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: {
      ticket: { include: { event: true } },
      seller: { select: { id: true, name: true } },
    },
  });
  if (!listing) return res.status(404).json({ error: 'listing_not_found' });
  if (listing.status !== 'active') return res.status(409).json({ error: 'listing_not_active' });
  if (listing.sellerId === buyerId) return res.status(400).json({ error: 'buyer_is_seller' });

  const orderName = `${listing.ticket.event.name} ${listing.ticket.grade} ${listing.ticket.seatId}`;
  const order = await prisma.order.create({
    data: {
      buyerId,
      listingId: listing.id,
      amount: listing.price,
      orderName,
    },
  });

  const buyer = await prisma.user.findUnique({ where: { id: buyerId } });
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

/**
 * POST /api/payment/confirm
 * Called by the frontend after Toss redirects to successUrl with
 * ?paymentKey=&orderId=&amount=.
 */
router.post('/confirm', requireAuth, async (req, res) => {
  const buyerId = req.auth!.userId;
  const { paymentKey, orderId, amount } = req.body ?? {};
  if (typeof paymentKey !== 'string' || typeof orderId !== 'string' || typeof amount !== 'number') {
    return res.status(400).json({ error: 'invalid_params' });
  }

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return res.status(404).json({ error: 'order_not_found' });
  if (order.buyerId !== buyerId) return res.status(403).json({ error: 'forbidden' });
  if (order.status !== 'pending') {
    return res.status(409).json({ error: 'order_not_pending', status: order.status });
  }
  if (order.amount !== amount) {
    return res.status(400).json({ error: 'amount_mismatch', expected: order.amount, actual: amount });
  }

  const toss = await confirmPayment({ paymentKey, orderId, amount });
  if (!toss.ok) {
    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'failed', failCode: toss.code, failMessage: toss.message },
    });
    return res.status(402).json({ error: 'toss_rejected', code: toss.code, message: toss.message });
  }

  let settle: Awaited<ReturnType<typeof settleListingPurchase>> | null = null;
  try {
    if (order.listingId) {
      settle = await settleListingPurchase({ listingId: order.listingId, buyerId });
    }
  } catch (err) {
    if (err instanceof SettleError) {
      await prisma.order.update({
        where: { id: order.id },
        data: { status: 'failed', failCode: err.code, failMessage: 'settle_failed' },
      });
      return res.status(409).json({ error: err.code });
    }
    throw err;
  }

  await prisma.order.update({
    where: { id: order.id },
    data: { status: 'done', paymentKey: toss.paymentKey },
  });

  res.json({
    ok: true,
    order: { id: order.id, status: 'done' },
    toss: {
      paymentKey: toss.paymentKey,
      method: toss.method,
      approvedAt: toss.approvedAt,
      mocked: toss.mocked,
    },
    settle,
  });
});

/** POST /api/payment/fail — record a cancel/fail coming back from the widget. */
router.post('/fail', requireAuth, async (req, res) => {
  const buyerId = req.auth!.userId;
  const { orderId, code, message } = req.body ?? {};
  if (typeof orderId !== 'string') return res.status(400).json({ error: 'invalid_orderId' });

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return res.status(404).json({ error: 'order_not_found' });
  if (order.buyerId !== buyerId) return res.status(403).json({ error: 'forbidden' });
  if (order.status !== 'pending') return res.json({ ok: true, alreadyResolved: true });

  await prisma.order.update({
    where: { id: order.id },
    data: {
      status: 'failed',
      failCode: typeof code === 'string' ? code : null,
      failMessage: typeof message === 'string' ? message : null,
    },
  });
  res.json({ ok: true });
});

export default router;
