import crypto from 'node:crypto';
import QRCode from 'qrcode';

const TTL_SECONDS = 30;

function secret(): string {
  const s = process.env.QR_HMAC_SECRET;
  if (!s) throw new Error('QR_HMAC_SECRET is not set');
  return s;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function fromB64url(input: string): Buffer {
  return Buffer.from(input, 'base64url');
}

export interface QrPayload {
  ticketId: string;
  iat: number; // issued at (unix seconds)
  exp: number; // expiry (unix seconds)
}

export interface IssuedQr {
  token: string;
  qrDataUrl: string;
  expiresAt: number; // unix seconds
  ttlSeconds: number;
}

export async function issueQr(ticketId: string): Promise<IssuedQr> {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + TTL_SECONDS;
  const payload: QrPayload = { ticketId, iat, exp };
  const body = b64url(JSON.stringify(payload));
  const mac = crypto.createHmac('sha256', secret()).update(body).digest();
  const token = `${body}.${b64url(mac)}`;
  const qrDataUrl = await QRCode.toDataURL(token, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 512,
  });
  return { token, qrDataUrl, expiresAt: exp, ttlSeconds: TTL_SECONDS };
}

export interface VerifiedQr {
  ok: true;
  payload: QrPayload;
}
export interface BadQr {
  ok: false;
  reason: 'malformed' | 'bad_signature' | 'expired';
}

export function verifyQr(token: string): VerifiedQr | BadQr {
  if (typeof token !== 'string' || !token.includes('.')) {
    return { ok: false, reason: 'malformed' };
  }
  const [body, sigB64] = token.split('.');
  if (!body || !sigB64) return { ok: false, reason: 'malformed' };

  const expected = crypto.createHmac('sha256', secret()).update(body).digest();
  const given = fromB64url(sigB64);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) {
    return { ok: false, reason: 'bad_signature' };
  }

  let payload: QrPayload;
  try {
    payload = JSON.parse(fromB64url(body).toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (
    typeof payload?.ticketId !== 'string' ||
    typeof payload?.iat !== 'number' ||
    typeof payload?.exp !== 'number'
  ) {
    return { ok: false, reason: 'malformed' };
  }
  const now = Math.floor(Date.now() / 1000);
  if (now > payload.exp) return { ok: false, reason: 'expired' };
  return { ok: true, payload };
}
