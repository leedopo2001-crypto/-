const TOKEN_KEY = 'ticket_platform_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export interface User {
  id: string;
  name: string;
  phone: string;
  walletAddress: string;
  createdAt: string;
}

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) {
    super(`api_error:${status}:${code}`);
    this.status = status;
    this.code = code;
  }
}

export async function api<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(path, { ...init, headers });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new ApiError(res.status, body?.error ?? 'unknown');
  }
  return body as T;
}

export const authApi = {
  register: (name: string, phone: string) =>
    api<{ token: string; user: User }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, phone }),
    }),
  login: (name: string, phone: string) =>
    api<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ name, phone }),
    }),
  me: () => api<{ user: User }>('/api/auth/me'),
};

export interface SeatGrade {
  id: string;
  eventId: string;
  grade: string;
  price: number;
  totalCount: number;
}

export interface Event {
  id: string;
  name: string;
  venue: string;
  eventDate: string;
  lockDate: string;
  contractAddr: string;
  status: string;
  createdAt: string;
  seatGrades: SeatGrade[];
  _count?: { tickets: number };
}

export interface CreateEventInput {
  name: string;
  venue: string;
  eventDate: string;
  lockDate: string;
  seatGrades: Array<{ grade: string; price: number; totalCount: number }>;
}

export interface MintAssignment {
  grade: string;
  walletAddress: string;
}

export interface Ticket {
  id: string;
  tokenId: string;
  eventId: string;
  userId: string;
  seatId: string;
  grade: string;
  price: number;
  status: string;
  isLocked: boolean;
  mintedAt: string;
  event: {
    id: string;
    name: string;
    venue: string;
    eventDate: string;
    lockDate: string;
    contractAddr: string;
  };
  listing: unknown | null;
}

export interface QrResponse {
  token: string;
  qrDataUrl: string;
  expiresAt: number;
  ttlSeconds: number;
}

export const ticketsApi = {
  my: () => api<{ tickets: Ticket[] }>('/api/tickets/my'),
  one: (id: string) => api<{ ticket: Ticket }>(`/api/tickets/${id}`),
  qr: (id: string) => api<QrResponse>(`/api/tickets/${id}/qr`),
};

export interface VerifyOk {
  ok: true;
  ticket: {
    id: string;
    seatId: string;
    grade: string;
    event: { id: string; name: string; venue: string; eventDate: string };
    holderNameMasked: string;
  };
  burn: { txHash: string; mocked: boolean };
}

export interface VerifyFail {
  ok: false;
  reason: string;
}

export const qrApi = {
  verify: async (token: string): Promise<VerifyOk | VerifyFail> => {
    // /api/qr/verify returns 200 on success and 4xx on failure — normalize
    // both into the same discriminated response shape the UI expects.
    const res = await fetch('/api/qr/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getToken() ?? ''}`,
      },
      body: JSON.stringify({ token }),
    });
    const body = await res.json().catch(() => ({ ok: false, reason: 'malformed' }));
    return body as VerifyOk | VerifyFail;
  },
};

export interface PrepareOrderResponse {
  orderId: string;
  amount: number;
  orderName: string;
  customerKey: string;
  customerName: string;
  clientKey: string;
  successUrl: string;
  failUrl: string;
}

export interface ConfirmResponse {
  ok: true;
  order: { id: string; status: string };
  toss: { paymentKey: string; method?: string; approvedAt?: string; mocked: boolean };
  settle: {
    ticketId: string;
    listingId: string;
    price: number;
    fee: number;
    txHash: string;
    mocked: boolean;
  } | null;
}

export interface Listing {
  id: string;
  ticketId: string;
  sellerId: string;
  price: number;
  status: string;
  createdAt: string;
  ticket: {
    id: string;
    tokenId: string;
    seatId: string;
    grade: string;
    price: number;
    event: {
      id: string;
      name: string;
      venue: string;
      eventDate: string;
      lockDate: string;
    };
  };
  seller?: { id: string; name: string };
}

export const marketApi = {
  list: () => api<{ listings: Listing[] }>('/api/market'),
  myListings: () => api<{ listings: Listing[] }>('/api/market/my'),
  sell: (ticketId: string) =>
    api<{ listing: Listing }>('/api/market/list', {
      method: 'POST',
      body: JSON.stringify({ ticketId }),
    }),
  buy: (listingId: string) =>
    api<PrepareOrderResponse>(`/api/market/buy/${listingId}`, { method: 'POST' }),
  cancel: (listingId: string) =>
    api<{ ok: boolean }>(`/api/market/${listingId}`, { method: 'DELETE' }),
};

export const paymentApi = {
  config: () => api<{ clientKey: string }>('/api/payment/config'),
  prepare: (listingId: string) =>
    api<PrepareOrderResponse>('/api/payment/prepare', {
      method: 'POST',
      body: JSON.stringify({ listingId }),
    }),
  confirm: (paymentKey: string, orderId: string, amount: number) =>
    api<ConfirmResponse>('/api/payment/confirm', {
      method: 'POST',
      body: JSON.stringify({ paymentKey, orderId, amount }),
    }),
  fail: (orderId: string, code?: string, message?: string) =>
    api<{ ok: boolean }>('/api/payment/fail', {
      method: 'POST',
      body: JSON.stringify({ orderId, code, message }),
    }),
};

export const adminApi = {
  listEvents: () => api<{ events: Event[] }>('/api/admin/events'),
  createEvent: (input: CreateEventInput) =>
    api<{ event: Event; deploy: { txHash: string; mocked: boolean } }>(
      '/api/admin/events',
      { method: 'POST', body: JSON.stringify(input) },
    ),
  mint: (eventId: string, assignments: MintAssignment[]) =>
    api<{ tickets: unknown[] }>(`/api/admin/events/${eventId}/mint`, {
      method: 'POST',
      body: JSON.stringify({ assignments }),
    }),
};
