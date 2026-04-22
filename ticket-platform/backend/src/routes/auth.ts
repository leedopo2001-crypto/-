import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { createWallet, encryptPrivateKey } from '../lib/wallet.js';
import { signToken } from '../lib/jwt.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

/** Accept "010-1234-5678" / "01012345678" — Korean mobile format. */
function normalizePhone(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const digits = input.replace(/[^\d]/g, '');
  if (!/^01[0-9]\d{7,8}$/.test(digits)) return null;
  return digits;
}

function validName(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (trimmed.length < 2 || trimmed.length > 20) return null;
  return trimmed;
}

/** POST /api/auth/register — mock real-name verification + wallet + JWT. */
router.post('/register', async (req, res) => {
  const name = validName(req.body?.name);
  const phone = normalizePhone(req.body?.phone);
  if (!name) return res.status(400).json({ error: 'invalid_name' });
  if (!phone) return res.status(400).json({ error: 'invalid_phone' });

  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) {
    return res.status(409).json({ error: 'phone_already_registered' });
  }

  const { address, privateKey } = createWallet();
  const user = await prisma.user.create({
    data: {
      name,
      phone,
      walletAddress: address,
      privateKeyEnc: encryptPrivateKey(privateKey),
    },
    select: { id: true, name: true, phone: true, walletAddress: true, createdAt: true },
  });

  const token = signToken({ userId: user.id, phone: user.phone });
  return res.status(201).json({ token, user });
});

/** POST /api/auth/login — mock. Phone + matching name returns a JWT. */
router.post('/login', async (req, res) => {
  const name = validName(req.body?.name);
  const phone = normalizePhone(req.body?.phone);
  if (!name) return res.status(400).json({ error: 'invalid_name' });
  if (!phone) return res.status(400).json({ error: 'invalid_phone' });

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user || user.name !== name) {
    return res.status(401).json({ error: 'user_not_found' });
  }
  const token = signToken({ userId: user.id, phone: user.phone });
  return res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      phone: user.phone,
      walletAddress: user.walletAddress,
      createdAt: user.createdAt,
    },
  });
});

/** GET /api/auth/me — current user (for frontend session restore). */
router.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.auth!.userId },
    select: { id: true, name: true, phone: true, walletAddress: true, createdAt: true },
  });
  if (!user) return res.status(404).json({ error: 'user_not_found' });
  return res.json({ user });
});

export default router;
