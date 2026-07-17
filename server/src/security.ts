import { createHmac, randomBytes, randomUUID, scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { config } from './config.js';
import { requirePool } from './database.js';

const COOKIE_NAME = 'voxlab_session';
const SESSION_DAYS = 30;
const SCRYPT_OPTIONS = { N: 32_768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; username: string; createdAt: string };
      sessionToken?: string;
    }
  }
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await derivePassword(password, salt, 64);
  return `scrypt$${SCRYPT_OPTIONS.N}$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, costValue, saltValue, hashValue] = stored.split('$');
  if (algorithm !== 'scrypt' || !costValue || !saltValue || !hashValue) return false;
  const cost = Number(costValue);
  if (cost !== 32_768 || !/^[A-Za-z0-9_-]+$/.test(saltValue) || !/^[A-Za-z0-9_-]+$/.test(hashValue)) {
    return false;
  }
  const salt = Buffer.from(saltValue, 'base64url');
  const expected = Buffer.from(hashValue, 'base64url');
  if (salt.length !== 16 || expected.length !== 64) return false;
  const actual = await derivePassword(password, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function derivePassword(password: string, salt: Buffer, length: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    nodeScrypt(password, salt, length, SCRYPT_OPTIONS, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

function tokenHash(token: string): string {
  return createHmac('sha256', config.server.sessionSecret).update(token).digest('hex');
}

function parseCookies(header = ''): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (!key) continue;
    try {
      cookies[key] = decodeURIComponent(rest.join('='));
    } catch {
      // Ignore malformed cookie values instead of failing every API request.
    }
  }
  return cookies;
}

export async function createLoginSession(userId: string, response: Response): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const pool = requirePool();
  await pool.query('DELETE FROM login_sessions WHERE user_id = $1 AND expires_at <= NOW()', [userId]);
  await pool.query(
    'INSERT INTO login_sessions (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)',
    [randomUUID(), userId, tokenHash(token), expires],
  );
  response.setHeader('Set-Cookie', [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${SESSION_DAYS * 24 * 60 * 60}`,
    config.server.production ? 'Secure' : '',
  ].filter(Boolean).join('; '));
}

export function clearLoginCookie(response: Response): void {
  response.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${config.server.production ? '; Secure' : ''}`);
}

export async function authenticate(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const token = parseCookies(request.headers.cookie)[COOKIE_NAME];
    if (!token) {
      next();
      return;
    }
    const result = await requirePool().query<{
      id: string;
      username: string;
      created_at: Date;
    }>(`
      SELECT users.id, users.username, users.created_at
      FROM login_sessions
      JOIN users ON users.id = login_sessions.user_id
      WHERE login_sessions.token_hash = $1 AND login_sessions.expires_at > NOW()
    `, [tokenHash(token)]);
    const row = result.rows[0];
    if (row) {
      request.user = { id: row.id, username: row.username, createdAt: row.created_at.toISOString() };
      request.sessionToken = token;
    } else {
      clearLoginCookie(response);
    }
    next();
  } catch (error) {
    next(error);
  }
}

export function requireAuth(request: Request, response: Response, next: NextFunction): void {
  if (!request.user) {
    response.status(401).json({ error: 'Please sign in again.' });
    return;
  }
  next();
}

export async function destroyLoginSession(request: Request): Promise<void> {
  if (!request.sessionToken) return;
  await requirePool().query('DELETE FROM login_sessions WHERE token_hash = $1', [tokenHash(request.sessionToken)]);
}

export function newId(): string {
  return randomUUID();
}
