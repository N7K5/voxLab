import pg from 'pg';
import { config } from './config.js';

const { Pool } = pg;

const ssl = config.database.ssl
  ? { rejectUnauthorized: config.database.sslRejectUnauthorized }
  : undefined;

export const pool = config.database.configured
  ? new Pool(config.database.url
    ? {
        connectionString: config.database.url,
        ssl,
        max: 10,
        connectionTimeoutMillis: 5_000,
        idleTimeoutMillis: 30_000,
      }
    : {
        host: config.database.host,
        port: config.database.port,
        database: config.database.database,
        user: config.database.username,
        password: config.database.password,
        ssl,
        max: 10,
        connectionTimeoutMillis: 5_000,
        idleTimeoutMillis: 30_000,
      })
  : null;

export const databaseState: { configured: boolean; ready: boolean; error?: string } = {
  configured: config.database.configured,
  ready: false,
};

export async function initializeDatabase(): Promise<void> {
  if (!pool) return;
  let client: pg.PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY,
        username VARCHAR(32) NOT NULL,
        username_normalized VARCHAR(32) NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS login_sessions (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS login_sessions_user_idx ON login_sessions(user_id);
      CREATE INDEX IF NOT EXISTS login_sessions_expiry_idx ON login_sessions(expires_at);

      CREATE TABLE IF NOT EXISTS attempts (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        topic JSONB NOT NULL,
        stance VARCHAR(10) NOT NULL CHECK (stance IN ('for', 'against')),
        duration_seconds INTEGER NOT NULL CHECK (duration_seconds BETWEEN 1 AND 900),
        transcript TEXT NOT NULL,
        report JSONB NOT NULL,
        recording BYTEA,
        recording_mime_type VARCHAR(120),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS attempts_user_created_idx ON attempts(user_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS user_settings (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        settings JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await client.query('DELETE FROM login_sessions WHERE expires_at < NOW()');
    await client.query('COMMIT');
    databaseState.ready = true;
    delete databaseState.error;
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Preserve the original connection or migration error.
      }
    }
    databaseState.ready = false;
    databaseState.error = 'Database initialization failed.';
    console.error('Database initialization failed:', error);
  } finally {
    client?.release();
  }
}

export function requirePool(): pg.Pool {
  if (!pool || !databaseState.ready) throw new Error('Database storage is unavailable.');
  return pool;
}

export async function closeDatabase(): Promise<void> {
  if (pool) await pool.end();
}

pool?.on('error', (error) => {
  console.error('An idle PostgreSQL connection failed:', error);
});
