import jwt from 'jsonwebtoken';

export interface JwtPayload {
  userId: string;
  phone: string;
}

function secret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET is not set');
  return s;
}

export function signToken(payload: JwtPayload, expiresIn: string | number = '30d'): string {
  return jwt.sign(payload, secret(), { expiresIn } as jwt.SignOptions);
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, secret()) as JwtPayload;
}
