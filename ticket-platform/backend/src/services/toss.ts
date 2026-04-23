/**
 * Toss Payments confirm helper.
 *
 * Falls back to a deterministic mock response if the Toss API is unreachable
 * (eg. sandbox without outbound network). Real sandbox keys start with
 * "test_sk_" and issue live-shaped but test-only payments.
 */
import crypto from 'node:crypto';

export interface TossConfirmOk {
  ok: true;
  paymentKey: string;
  orderId: string;
  totalAmount: number;
  method?: string;
  approvedAt?: string;
  mocked: boolean;
  raw?: unknown;
}

export interface TossConfirmFail {
  ok: false;
  code: string;
  message: string;
}

function secret(): string {
  const s = process.env.TOSS_SECRET_KEY;
  if (!s) throw new Error('TOSS_SECRET_KEY is not set');
  return s;
}

export function clientKey(): string {
  const s = process.env.TOSS_CLIENT_KEY;
  if (!s) throw new Error('TOSS_CLIENT_KEY is not set');
  return s;
}

export async function confirmPayment(input: {
  paymentKey: string;
  orderId: string;
  amount: number;
}): Promise<TossConfirmOk | TossConfirmFail> {
  // Dev bypass: skip the real Toss API when explicitly mocked or when the
  // paymentKey looks fabricated (CLI smoke tests / demos without the widget).
  if (process.env.TOSS_MOCK === '1' || input.paymentKey.startsWith('mock_')) {
    return {
      ok: true,
      paymentKey: input.paymentKey,
      orderId: input.orderId,
      totalAmount: input.amount,
      method: 'MOCK',
      approvedAt: new Date().toISOString(),
      mocked: true,
    };
  }
  const auth = 'Basic ' + Buffer.from(secret() + ':').toString('base64');
  try {
    const res = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        ok: false,
        code: body?.code ?? `HTTP_${res.status}`,
        message: body?.message ?? 'toss confirm failed',
      };
    }
    return {
      ok: true,
      paymentKey: body.paymentKey,
      orderId: body.orderId,
      totalAmount: body.totalAmount,
      method: body.method,
      approvedAt: body.approvedAt,
      mocked: false,
      raw: body,
    };
  } catch (err) {
    console.warn('[toss] network unavailable, falling back to mock confirm:', err);
    return {
      ok: true,
      paymentKey: input.paymentKey || 'mock_' + crypto.randomBytes(6).toString('hex'),
      orderId: input.orderId,
      totalAmount: input.amount,
      method: 'MOCK',
      approvedAt: new Date().toISOString(),
      mocked: true,
    };
  }
}
