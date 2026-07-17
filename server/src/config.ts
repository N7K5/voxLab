import 'dotenv/config';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface FileConfig {
  database?: {
    url?: string;
    host?: string;
    port?: number;
    database?: string;
    username?: string;
    password?: string;
    ssl?: boolean;
    sslRejectUnauthorized?: boolean;
  };
  server?: {
    port?: number;
    sessionSecret?: string;
    allowedOrigins?: string[];
    trustProxy?: boolean | number;
  };
  ollama?: {
    endpoint?: string;
    allowUnauthenticated?: boolean;
  };
}

function integer(value: unknown, fallback: number, minimum: number, maximum: number, name: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    if (value === undefined || value === '') return fallback;
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

function boolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  throw new Error(`Expected a boolean value, received "${String(value)}".`);
}

function trustProxy(value: unknown): boolean | number {
  if (value === undefined || value === '') return false;
  if (typeof value === 'number') return integer(value, 0, 0, 16, 'server.trustProxy');
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return integer(value, 0, 0, 16, 'server.trustProxy');
}

function httpEndpoint(value: string): string {
  let endpoint: URL;
  try {
    endpoint = new URL(value);
  } catch {
    throw new Error('OLLAMA_ENDPOINT must be a valid HTTP(S) URL.');
  }
  if (!['http:', 'https:'].includes(endpoint.protocol)) {
    throw new Error('OLLAMA_ENDPOINT must use HTTP or HTTPS.');
  }
  if (endpoint.username || endpoint.password) {
    throw new Error('OLLAMA_ENDPOINT must not contain credentials.');
  }
  return endpoint.toString().replace(/\/$/, '');
}

function allowedOrigin(value: string): string {
  let origin: URL;
  try {
    origin = new URL(value);
  } catch {
    throw new Error(`Allowed origin "${value}" is not a valid URL.`);
  }
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password) {
    throw new Error(`Allowed origin "${value}" must be an HTTP(S) origin without credentials.`);
  }
  return origin.origin;
}

function loadFileConfig(): FileConfig {
  const candidates = [
    resolve(process.cwd(), 'server/config.local.json'),
    resolve(process.cwd(), 'config.local.json'),
  ];
  const path = candidates.find(existsSync);
  if (!path) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as FileConfig;
  } catch (error) {
    throw new Error(`Could not parse ${path}: ${error instanceof Error ? error.message : 'invalid JSON'}`);
  }
}

const file = loadFileConfig();
const databaseUrl = process.env.DATABASE_URL || file.database?.url || '';
const host = process.env.DB_HOST || file.database?.host || '';
const username = process.env.DB_USER || file.database?.username || '';
const password = process.env.DB_PASSWORD || file.database?.password || '';
const database = process.env.DB_NAME || file.database?.database || '';
const production = process.env.NODE_ENV === 'production';
const sessionSecret = process.env.SESSION_SECRET || file.server?.sessionSecret || 'voxlab-local-development-only';

const insecureSessionSecrets = new Set([
  'voxlab-local-development-only',
  'replace-with-a-long-random-string',
  'change-this-in-production',
]);
if (production && (insecureSessionSecrets.has(sessionSecret) || sessionSecret.length < 32)) {
  throw new Error('SESSION_SECRET must contain at least 32 characters in production.');
}

const allowedOrigins = (process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : file.server?.allowedOrigins ?? ['http://localhost:5173'])
  .map((origin) => origin.trim())
  .filter(Boolean)
  .map(allowedOrigin);

export const config = {
  database: {
    configured: Boolean(databaseUrl || (host && username && database)),
    url: databaseUrl,
    host,
    port: integer(process.env.DB_PORT ?? file.database?.port, 5432, 1, 65_535, 'DB_PORT'),
    database,
    username,
    password,
    ssl: boolean(process.env.DB_SSL ?? file.database?.ssl, false),
    sslRejectUnauthorized: boolean(
      process.env.DB_SSL_REJECT_UNAUTHORIZED ?? file.database?.sslRejectUnauthorized,
      true,
    ),
  },
  server: {
    port: integer(process.env.PORT ?? file.server?.port, 8787, 1, 65_535, 'PORT'),
    sessionSecret,
    allowedOrigins,
    production,
    trustProxy: trustProxy(process.env.TRUST_PROXY ?? file.server?.trustProxy),
  },
  ollama: {
    endpoint: httpEndpoint(process.env.OLLAMA_ENDPOINT || file.ollama?.endpoint || 'http://localhost:11434'),
    allowUnauthenticated: boolean(
      process.env.ALLOW_UNAUTHENTICATED_OLLAMA ?? file.ollama?.allowUnauthenticated,
      !production,
    ),
  },
};
