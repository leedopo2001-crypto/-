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
