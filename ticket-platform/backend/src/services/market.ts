import { prisma } from '../lib/prisma.js';
import { platformTransfer } from './blockchain.js';

function feeRate(): number {
  const v = Number(process.env.PLATFORM_FEE_RATE ?? 0.05);
  if (!Number.isFinite(v) || v < 0 || v >= 1) return 0.05;
  return v;
}

export interface SettleResult {
  ticketId: string;
  listingId: string;
  price: number;
  fee: number;
  txHash: string;
  mocked: boolean;
}

export class SettleError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

/**
 * Transfer a listed ticket to buyer, record fee, and close the listing.
 * Kept in its own service so both the payment confirm handler (Step 6)
 * and the market buy handler (Step 7) use identical bookkeeping.
 */
export async function settleListingPurchase(params: {
  listingId: string;
  buyerId: string;
}): Promise<SettleResult> {
  const { listingId, buyerId } = params;

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: { ticket: { include: { event: true } } },
  });
  if (!listing) throw new SettleError('listing_not_found');
  if (listing.status !== 'active') throw new SettleError('listing_not_active');
  if (listing.sellerId === buyerId) throw new SettleError('buyer_is_seller');

  const ticket = listing.ticket;
  if (ticket.price < listing.price) {
    // listing price was already validated on creation — defensive check.
    throw new SettleError('listing_above_face');
  }
  if (ticket.event.lockDate.getTime() <= Date.now()) {
    throw new SettleError('lock_passed');
  }

  const buyer = await prisma.user.findUnique({ where: { id: buyerId } });
  if (!buyer) throw new SettleError('buyer_not_found');

  const chainResult = await platformTransfer(
    ticket.event.contractAddr,
    ticket.tokenId,
    buyer.walletAddress,
    listing.price,
  );

  const fee = Math.floor(listing.price * feeRate());

  const [, , tx] = await prisma.$transaction([
    prisma.ticket.update({
      where: { id: ticket.id },
      data: { userId: buyerId },
    }),
    prisma.listing.update({
      where: { id: listing.id },
      data: { status: 'sold' },
    }),
    prisma.transaction.create({
      data: {
        ticketId: ticket.id,
        fromUserId: listing.sellerId,
        toUserId: buyerId,
        price: listing.price,
        fee,
        txHash: chainResult.txHash,
      },
    }),
  ]);

  return {
    ticketId: ticket.id,
    listingId: listing.id,
    price: listing.price,
    fee,
    txHash: tx.txHash ?? chainResult.txHash,
    mocked: chainResult.mocked,
  };
}
