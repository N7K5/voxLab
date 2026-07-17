import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import multer from 'multer';
import { config } from './config.js';
import { closeDatabase, databaseState, initializeDatabase, requirePool } from './database.js';
import {
  authenticate,
  clearLoginCookie,
  createLoginSession,
  destroyLoginSession,
  hashPassword,
  newId,
  requireAuth,
  verifyPassword,
} from './security.js';

const AUDIO_TYPES = new Set(['audio/webm', 'audio/ogg', 'audio/mp4']);
const MAX_RECORDING_BYTES = 15 * 1024 * 1024;
const MAX_ATTEMPT_JSON_BYTES = 512 * 1024;
const MAX_BATCH_ATTEMPT_JSON_BYTES = MAX_ATTEMPT_JSON_BYTES * 2;
const MAX_OLLAMA_RESPONSE_BYTES = 2 * 1024 * 1024;

class RequestValidationError extends Error {}
class UnsupportedRecordingError extends Error {}

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_RECORDING_BYTES,
    files: 1,
    fields: 1,
    fieldSize: MAX_ATTEMPT_JSON_BYTES,
    parts: 2,
  },
  fileFilter: (_request, file, callback) => {
    const mimeType = normalizedMimeType(file.mimetype);
    if (AUDIO_TYPES.has(mimeType)) callback(null, true);
    else callback(new UnsupportedRecordingError('Use a WebM, Ogg, or MP4 audio recording.'));
  },
});
const batchUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_RECORDING_BYTES,
    files: 2,
    fields: 1,
    fieldSize: MAX_BATCH_ATTEMPT_JSON_BYTES,
    parts: 3,
  },
  fileFilter: (_request, file, callback) => {
    const mimeType = normalizedMimeType(file.mimetype);
    if (AUDIO_TYPES.has(mimeType)) callback(null, true);
    else callback(new UnsupportedRecordingError('Use WebM, Ogg, or MP4 audio recordings.'));
  },
});

const authAttempts = new Map<string, { count: number; resetAt: number }>();
const coachAttempts = new Map<string, { count: number; resetAt: number }>();
const activeCoachRequests = new Set<string>();
const activeAuthRequests = new Map<string, number>();
let activeAuthRequestCount = 0;
const dummyPasswordHash = hashPassword('not-a-real-password');

app.disable('x-powered-by');
app.set('trust proxy', config.server.trustProxy);
app.use((_request, response, next) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'same-origin');
  response.setHeader('Permissions-Policy', 'microphone=(self)');
  next();
});
app.use(cors({
  credentials: true,
  origin(origin, callback) {
    callback(null, !origin || isConfiguredOrigin(origin));
  },
}));
app.use(express.json({ limit: '2mb', strict: true }));
app.use('/api', (_request, response, next) => {
  response.setHeader('Cache-Control', 'no-store');
  next();
});

app.use((request, response, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    next();
    return;
  }
  if (!requestOriginAllowed(request, false)) {
    response.status(403).json({ error: 'Request origin is not allowed.' });
    return;
  }
  next();
});

app.get('/api/health', (_request, response) => {
  response.json({
    ok: true,
    database: {
      configured: databaseState.configured,
      ready: databaseState.ready,
      ...(databaseState.error ? { error: databaseState.error } : {}),
    },
  });
});

app.post('/api/ai/coach', coachAccess, coachRateLimit, async (request, response, next) => {
  const requestKey = request.user?.id ?? `ip:${request.ip || 'unknown'}`;
  if (activeCoachRequests.has(requestKey) || activeCoachRequests.size >= 2) {
    response.status(429).json({ error: 'Another coaching request is still running. Try again shortly.' });
    return;
  }

  activeCoachRequests.add(requestKey);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  let clientDisconnected = false;
  const abortForDisconnect = () => {
    if (response.writableEnded) return;
    clientDisconnected = true;
    controller.abort();
  };
  request.once('aborted', abortForDisconnect);
  response.once('close', abortForDisconnect);
  try {
    const body = validateCoachRequest(request.body);
    const upstream = await fetch(`${config.ollama.endpoint}/api/chat`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    const contentLength = Number(upstream.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > MAX_OLLAMA_RESPONSE_BYTES) {
      throw new Error('Ollama returned an unexpectedly large response.');
    }
    const text = await upstream.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_OLLAMA_RESPONSE_BYTES) {
      throw new Error('Ollama returned an unexpectedly large response.');
    }
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      response.status(502).json({ error: 'Ollama returned an invalid response.' });
      return;
    }
    if (!upstream.ok) {
      const upstreamError = isRecord(payload) && typeof payload.error === 'string'
        ? payload.error.slice(0, 500)
        : `Ollama request failed (${upstream.status}).`;
      response.status(upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502).json({ error: upstreamError });
      return;
    }
    response.json(payload);
  } catch (error) {
    if (controller.signal.aborted) {
      if (!clientDisconnected && !response.writableEnded) {
        response.status(504).json({ error: 'Ollama did not respond before the timeout.' });
      }
      return;
    }
    next(error);
  } finally {
    clearTimeout(timeout);
    request.removeListener('aborted', abortForDisconnect);
    response.removeListener('close', abortForDisconnect);
    activeCoachRequests.delete(requestKey);
  }
});

app.use('/api', (request, response, next) => {
  if (!databaseState.configured || !databaseState.ready) {
    response.status(503).json({
      error: databaseState.configured
        ? 'The configured database is unavailable.'
        : 'No remote database is configured.',
    });
    return;
  }
  void authenticate(request, response, next);
});

app.post('/api/auth/signup', authRateLimit, async (request, response, next) => {
  try {
    const credentials = validateCredentials(request.body);
    const id = newId();
    const passwordHash = await hashPassword(credentials.password);
    const result = await requirePool().query<{ created_at: Date }>(
      'INSERT INTO users (id, username, username_normalized, password_hash) VALUES ($1, $2, $3, $4) RETURNING created_at',
      [id, credentials.username, credentials.normalized, passwordHash],
    );
    await createLoginSession(id, response);
    authAttempts.delete(authRateKey(request));
    response.status(201).json({
      id,
      username: credentials.username,
      createdAt: result.rows[0].created_at.toISOString(),
    });
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      response.status(409).json({ error: 'That username is already taken.' });
      return;
    }
    next(error);
  }
});

app.post('/api/auth/login', authRateLimit, async (request, response, next) => {
  try {
    const credentials = validateCredentials(request.body);
    const result = await requirePool().query<{
      id: string;
      username: string;
      password_hash: string;
      created_at: Date;
    }>('SELECT id, username, password_hash, created_at FROM users WHERE username_normalized = $1', [credentials.normalized]);
    const row = result.rows[0];
    const passwordMatches = await verifyPassword(credentials.password, row?.password_hash ?? await dummyPasswordHash);
    if (!row || !passwordMatches) {
      response.status(401).json({ error: 'Incorrect username or password.' });
      return;
    }
    await createLoginSession(row.id, response);
    authAttempts.delete(authRateKey(request));
    response.json({ id: row.id, username: row.username, createdAt: row.created_at.toISOString() });
  } catch (error) {
    next(error);
  }
});

app.get('/api/auth/me', requireAuth, (request, response) => response.json(request.user));

app.post('/api/auth/logout', async (request, response, next) => {
  try {
    await destroyLoginSession(request);
    clearLoginCookie(response);
    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.delete('/api/account', requireAuth, async (request, response, next) => {
  try {
    await requirePool().query('DELETE FROM users WHERE id = $1', [request.user!.id]);
    clearLoginCookie(response);
    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.get('/api/attempts', requireAuth, async (request, response, next) => {
  try {
    const result = await requirePool().query(`
      SELECT id, user_id, topic, stance, duration_seconds, transcript, report, created_at,
             recording_mime_type, (recording IS NOT NULL) AS has_recording
      FROM attempts WHERE user_id = $1 ORDER BY created_at DESC
    `, [request.user!.id]);
    response.json(result.rows.map(serializeAttempt));
  } catch (error) {
    next(error);
  }
});

app.get('/api/attempts/:id', requireAuth, async (request, response, next) => {
  try {
    const id = validateId(request.params.id);
    const result = await requirePool().query(`
      SELECT id, user_id, topic, stance, duration_seconds, transcript, report, created_at,
             recording_mime_type, (recording IS NOT NULL) AS has_recording
      FROM attempts WHERE id = $1 AND user_id = $2
    `, [id, request.user!.id]);
    if (!result.rows[0]) {
      response.status(404).json({ error: 'Attempt not found.' });
      return;
    }
    response.json(serializeAttempt(result.rows[0]));
  } catch (error) {
    next(error);
  }
});

app.post('/api/attempts', requireAuth, upload.single('recording'), async (request, response, next) => {
  try {
    if (typeof request.body?.attempt !== 'string') {
      throw new RequestValidationError('Attempt data is required.');
    }
    const attempt = validateAttempt(JSON.parse(request.body.attempt) as unknown);
    const recordingMimeType = request.file ? normalizedMimeType(request.file.mimetype) : null;
    if (request.file && !hasExpectedAudioSignature(request.file.buffer, recordingMimeType!)) {
      throw new RequestValidationError('The recording does not match its declared audio type.');
    }
    const result = await requirePool().query<{ id: string }>(`
      INSERT INTO attempts (id, user_id, topic, stance, duration_seconds, transcript, report, recording, recording_mime_type, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO UPDATE SET
        topic = EXCLUDED.topic,
        stance = EXCLUDED.stance,
        duration_seconds = EXCLUDED.duration_seconds,
        transcript = EXCLUDED.transcript,
        report = EXCLUDED.report,
        recording = COALESCE(EXCLUDED.recording, attempts.recording),
        recording_mime_type = COALESCE(EXCLUDED.recording_mime_type, attempts.recording_mime_type)
      WHERE attempts.user_id = EXCLUDED.user_id
      RETURNING id
    `, [
      attempt.id,
      request.user!.id,
      JSON.stringify(attempt.topic),
      attempt.stance,
      attempt.durationSeconds,
      attempt.transcript,
      JSON.stringify(attempt.report),
      request.file?.buffer ?? null,
      recordingMimeType,
      attempt.createdAt,
    ]);
    if (result.rowCount !== 1) {
      response.status(409).json({ error: 'That attempt ID is already owned by another account.' });
      return;
    }
    response.status(204).end();
  } catch (error) {
    if (error instanceof SyntaxError) {
      response.status(400).json({ error: 'Attempt data is not valid JSON.' });
      return;
    }
    next(error);
  }
});

app.post('/api/attempts/batch', requireAuth, batchUpload.fields([
  { name: 'recording0', maxCount: 1 },
  { name: 'recording1', maxCount: 1 },
]), async (request, response, next) => {
  try {
    if (typeof request.body?.attempts !== 'string') {
      throw new RequestValidationError('Attempt data is required.');
    }
    const rawAttempts = JSON.parse(request.body.attempts) as unknown;
    if (!Array.isArray(rawAttempts) || rawAttempts.length !== 2) {
      throw new RequestValidationError('A 1v1 batch must contain exactly two attempts.');
    }
    const attempts = rawAttempts.map(validateAttempt);
    if (new Set(attempts.map((attempt) => attempt.id)).size !== attempts.length) {
      throw new RequestValidationError('Attempt IDs must be unique.');
    }
    const files = request.files as Record<string, Express.Multer.File[]> | undefined;
    const recordings = attempts.map((_attempt, index) => files?.[`recording${index}`]?.[0]);
    const recordingTypes = recordings.map((file) => file ? normalizedMimeType(file.mimetype) : null);
    recordings.forEach((file, index) => {
      if (file && !hasExpectedAudioSignature(file.buffer, recordingTypes[index]!)) {
        throw new RequestValidationError(`Recording ${index + 1} does not match its declared audio type.`);
      }
    });

    const client = await requirePool().connect();
    try {
      await client.query('BEGIN');
      for (let index = 0; index < attempts.length; index += 1) {
        const attempt = attempts[index];
        const result = await client.query<{ id: string }>(`
          INSERT INTO attempts (id, user_id, topic, stance, duration_seconds, transcript, report, recording, recording_mime_type, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (id) DO UPDATE SET
            topic = EXCLUDED.topic,
            stance = EXCLUDED.stance,
            duration_seconds = EXCLUDED.duration_seconds,
            transcript = EXCLUDED.transcript,
            report = EXCLUDED.report,
            recording = COALESCE(EXCLUDED.recording, attempts.recording),
            recording_mime_type = COALESCE(EXCLUDED.recording_mime_type, attempts.recording_mime_type)
          WHERE attempts.user_id = EXCLUDED.user_id
          RETURNING id
        `, [
          attempt.id,
          request.user!.id,
          JSON.stringify(attempt.topic),
          attempt.stance,
          attempt.durationSeconds,
          attempt.transcript,
          JSON.stringify(attempt.report),
          recordings[index]?.buffer ?? null,
          recordingTypes[index],
          attempt.createdAt,
        ]);
        if (result.rowCount !== 1) throw new RequestValidationError('An attempt ID is already owned by another account.');
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    response.status(204).end();
  } catch (error) {
    if (error instanceof SyntaxError) {
      response.status(400).json({ error: 'Attempt data is not valid JSON.' });
      return;
    }
    next(error);
  }
});

app.delete('/api/attempts/batch', requireAuth, async (request, response, next) => {
  try {
    if (!Array.isArray(request.body?.ids) || request.body.ids.length < 1 || request.body.ids.length > 10) {
      throw new RequestValidationError('Attempt IDs are invalid.');
    }
    const ids = [...new Set(request.body.ids.map((id: unknown) => validateId(typeof id === 'string' ? id : '')))] as string[];
    await requirePool().query('DELETE FROM attempts WHERE user_id = $1 AND id = ANY($2::uuid[])', [request.user!.id, ids]);
    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.delete('/api/attempts/:id', requireAuth, async (request, response, next) => {
  try {
    const id = validateId(request.params.id);
    await requirePool().query('DELETE FROM attempts WHERE id = $1 AND user_id = $2', [id, request.user!.id]);
    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.get('/api/attempts/:id/recording', requireAuth, async (request, response, next) => {
  try {
    const id = validateId(request.params.id);
    const result = await requirePool().query<{ recording: Buffer | null; recording_mime_type: string | null }>(
      'SELECT recording, recording_mime_type FROM attempts WHERE id = $1 AND user_id = $2',
      [id, request.user!.id],
    );
    const row = result.rows[0];
    if (!row?.recording) {
      response.status(404).json({ error: 'Recording not found.' });
      return;
    }
    const mimeType = normalizedMimeType(row.recording_mime_type || '');
    response.type(AUDIO_TYPES.has(mimeType) ? mimeType : 'application/octet-stream');
    response.setHeader('Content-Length', String(row.recording.length));
    response.send(row.recording);
  } catch (error) {
    next(error);
  }
});

app.get('/api/settings', requireAuth, async (request, response, next) => {
  try {
    const result = await requirePool().query<{ settings: unknown }>(
      'SELECT settings FROM user_settings WHERE user_id = $1',
      [request.user!.id],
    );
    response.json(result.rows[0]?.settings ?? null);
  } catch (error) {
    next(error);
  }
});

app.put('/api/settings', requireAuth, async (request, response, next) => {
  try {
    const settings = validateSettings(request.body);
    await requirePool().query(`
      INSERT INTO user_settings (user_id, settings) VALUES ($1, $2)
      ON CONFLICT (user_id) DO UPDATE SET settings = EXCLUDED.settings, updated_at = NOW()
    `, [request.user!.id, JSON.stringify(settings)]);
    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.use('/api', (_request, response) => {
  response.status(404).json({ error: 'API endpoint not found.' });
});

const webDist = resolve(process.cwd(), 'dist');
if (existsSync(webDist)) {
  app.use(express.static(webDist, { index: false }));
  app.use((request, response, next) => {
    if (request.method !== 'GET' || request.path.startsWith('/api/')) {
      next();
      return;
    }
    response.sendFile(resolve(webDist, 'index.html'));
  });
}

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  if (error instanceof RequestValidationError || error instanceof UnsupportedRecordingError) {
    response.status(400).json({ error: error.message });
    return;
  }
  if (error instanceof multer.MulterError) {
    const message = error.code === 'LIMIT_FILE_SIZE'
      ? 'Recording is too large.'
      : error.code === 'LIMIT_FIELD_VALUE'
        ? 'Attempt data is too large.'
        : 'Invalid recording upload.';
    response.status(400).json({ error: message });
    return;
  }
  const status = isRecord(error) && typeof error.status === 'number' ? error.status : undefined;
  if (status === 400) {
    response.status(400).json({ error: 'Request body is not valid JSON.' });
    return;
  }
  console.error(error);
  response.status(500).json({ error: 'The server could not complete this request.' });
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isConfiguredOrigin(origin: string): boolean {
  try {
    return config.server.allowedOrigins.includes(new URL(origin).origin);
  } catch {
    return false;
  }
}

function requestOriginAllowed(request: Request, requireOrigin: boolean): boolean {
  const origin = request.headers.origin;
  if (!origin) return !requireOrigin;
  try {
    const normalized = new URL(origin).origin;
    const requestOrigin = new URL(`${request.protocol}://${request.get('host')}`).origin;
    return normalized === requestOrigin || config.server.allowedOrigins.includes(normalized);
  } catch {
    return false;
  }
}

function normalizedMimeType(value: string): string {
  return value.split(';', 1)[0].trim().toLowerCase();
}

function hasExpectedAudioSignature(buffer: Buffer, mimeType: string): boolean {
  if (buffer.length < 12) return false;
  if (mimeType === 'audio/webm') {
    return buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  }
  if (mimeType === 'audio/ogg') return buffer.subarray(0, 4).toString('ascii') === 'OggS';
  if (mimeType === 'audio/mp4') return buffer.subarray(4, 8).toString('ascii') === 'ftyp';
  return false;
}

function authRateKey(request: Request): string {
  return request.ip || 'unknown';
}

function consumeRateLimit(
  entries: Map<string, { count: number; resetAt: number }>,
  key: string,
  limit: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const current = entries.get(key);
  const entry = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current;
  entry.count += 1;
  entries.set(key, entry);
  return entry.count <= limit;
}

function authRateLimit(request: Request, response: Response, next: NextFunction): void {
  const key = authRateKey(request);
  if (!consumeRateLimit(authAttempts, key, 30, 15 * 60_000)) {
    response.status(429).json({ error: 'Too many sign-in attempts. Try again later.' });
    return;
  }
  if ((activeAuthRequests.get(key) ?? 0) >= 3 || activeAuthRequestCount >= 8) {
    response.status(429).json({ error: 'Too many sign-in attempts are already being processed.' });
    return;
  }
  activeAuthRequests.set(key, (activeAuthRequests.get(key) ?? 0) + 1);
  activeAuthRequestCount += 1;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    const remaining = (activeAuthRequests.get(key) ?? 1) - 1;
    if (remaining > 0) activeAuthRequests.set(key, remaining);
    else activeAuthRequests.delete(key);
    activeAuthRequestCount = Math.max(0, activeAuthRequestCount - 1);
  };
  response.once('finish', release);
  response.once('close', release);
  next();
}

async function coachAccess(request: Request, response: Response, next: NextFunction): Promise<void> {
  if (databaseState.configured) {
    if (!databaseState.ready) {
      response.status(503).json({ error: 'The configured database is unavailable.' });
      return;
    }
    await authenticate(request, response, (error?: unknown) => {
      if (error) next(error);
      else requireAuth(request, response, next);
    });
    return;
  }
  if (!config.ollama.allowUnauthenticated) {
    response.status(503).json({ error: 'The Ollama proxy requires remote sign-in in this environment.' });
    return;
  }
  if (!requestOriginAllowed(request, true)) {
    response.status(403).json({ error: 'An allowed browser origin is required for the local Ollama proxy.' });
    return;
  }
  next();
}

function coachRateLimit(request: Request, response: Response, next: NextFunction): void {
  const key = request.user?.id ?? `ip:${request.ip || 'unknown'}`;
  if (!consumeRateLimit(coachAttempts, key, 20, 60 * 60_000)) {
    response.status(429).json({ error: 'Too many coaching requests. Try again later.' });
    return;
  }
  next();
}

function validateCredentials(value: unknown): { username: string; normalized: string; password: string } {
  if (!isRecord(value)) throw new RequestValidationError('Username and password are required.');
  if (typeof value.username !== 'string') {
    throw new RequestValidationError('Use 3–32 letters, numbers, dots, dashes, or underscores for the username.');
  }
  const username = value.username.trim().normalize('NFKC');
  if (!/^[\p{L}\p{N}_.-]{3,32}$/u.test(username)) {
    throw new RequestValidationError('Use 3–32 letters, numbers, dots, dashes, or underscores for the username.');
  }
  const normalized = username.toLowerCase();
  if ([...normalized].length > 32) {
    throw new RequestValidationError('That username is too long after normalization.');
  }
  if (typeof value.password !== 'string' || value.password.length < 8 || value.password.length > 256) {
    throw new RequestValidationError('Password must contain 8–256 characters.');
  }
  return { username, normalized, password: value.password };
}

function validateId(value: unknown): string {
  if (typeof value !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new RequestValidationError('Invalid attempt ID.');
  }
  return value;
}

function boundedString(value: unknown, label: string, maximum: number, allowEmpty = false): string {
  if (typeof value !== 'string' || value.length > maximum || (!allowEmpty && value.trim().length === 0)) {
    throw new RequestValidationError(`${label} is invalid.`);
  }
  return value;
}

function validateTopic(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new RequestValidationError('Topic is invalid.');
  const difficulty = value.difficulty;
  if (!['easy', 'medium', 'hard'].includes(String(difficulty))) {
    throw new RequestValidationError('Topic difficulty is invalid.');
  }
  if (value.language !== undefined && value.language !== 'en' && value.language !== 'bn' && value.language !== 'hi') {
    throw new RequestValidationError('Topic language is invalid.');
  }
  return {
    id: boundedString(value.id, 'Topic ID', 120),
    prompt: boundedString(value.prompt, 'Topic prompt', 1_000),
    difficulty,
    category: boundedString(value.category, 'Topic category', 120),
    ...(value.language === 'en' || value.language === 'bn' || value.language === 'hi' ? { language: value.language } : {}),
    ...(typeof value.context === 'string' && value.context.trim()
      ? { context: boundedString(value.context, 'Topic context', 2_000) }
      : {}),
  };
}

function validateReport(value: unknown): Record<string, unknown> {
  if (!isRecord(value)
    || !isRecord(value.audio)
    || !isRecord(value.text)
    || !isRecord(value.scores)
    || !isRecord(value.feedback)) {
    throw new RequestValidationError('Analysis report is incomplete.');
  }
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > 256 * 1024) {
    throw new RequestValidationError('Analysis report is too large.');
  }
  return value;
}

function validateAttempt(value: unknown): {
  id: string;
  topic: Record<string, unknown>;
  stance: 'for' | 'against';
  durationSeconds: number;
  transcript: string;
  report: Record<string, unknown>;
  createdAt: string;
} {
  if (!isRecord(value)) throw new RequestValidationError('Attempt data is invalid.');
  if (value.stance !== 'for' && value.stance !== 'against') {
    throw new RequestValidationError('Stance is invalid.');
  }
  const duration = Number(value.durationSeconds);
  if (!Number.isFinite(duration)) throw new RequestValidationError('Duration is invalid.');
  const parsedDate = typeof value.createdAt === 'string' ? Date.parse(value.createdAt) : Number.NaN;
  const createdAt = Number.isFinite(parsedDate) && parsedDate <= Date.now() + 5 * 60_000
    ? new Date(parsedDate).toISOString()
    : new Date().toISOString();
  return {
    id: validateId(typeof value.id === 'string' ? value.id : ''),
    topic: validateTopic(value.topic),
    stance: value.stance,
    durationSeconds: Math.max(1, Math.min(900, Math.round(duration))),
    transcript: boundedString(value.transcript, 'Transcript', 50_000),
    report: validateReport(value.report),
    createdAt,
  };
}

function validateSettings(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new RequestValidationError('Settings are invalid.');
  if (value.aiProvider !== 'browser' && value.aiProvider !== 'ollama') {
    throw new RequestValidationError('Invalid AI provider.');
  }
  if (value.whisperDevice !== 'auto' && value.whisperDevice !== 'webgpu' && value.whisperDevice !== 'wasm') {
    throw new RequestValidationError('Invalid speech-model device.');
  }
  if (value.speechLanguage !== undefined && value.speechLanguage !== 'en' && value.speechLanguage !== 'bn' && value.speechLanguage !== 'hi') {
    throw new RequestValidationError('Invalid practice language.');
  }
  if (value.stanceAnalysis !== undefined && value.stanceAnalysis !== 'signals' && value.stanceAnalysis !== 'semantic') {
    throw new RequestValidationError('Invalid stance-analysis mode.');
  }
  if (typeof value.ollamaViaServer !== 'boolean' || typeof value.saveRecordings !== 'boolean') {
    throw new RequestValidationError('Settings contain invalid boolean values.');
  }
  const endpoint = boundedString(value.ollamaEndpoint, 'Ollama endpoint', 2_000);
  try {
    const parsed = new URL(endpoint);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error();
  } catch {
    throw new RequestValidationError('Ollama endpoint must be an HTTP(S) URL without embedded credentials.');
  }
  return {
    aiProvider: value.aiProvider,
    ollamaEndpoint: endpoint.replace(/\/$/, ''),
    ollamaModel: boundedString(value.ollamaModel, 'Ollama model', 120),
    ollamaViaServer: value.ollamaViaServer,
    whisperModel: boundedString(value.whisperModel, 'Speech model', 200),
    whisperDevice: value.whisperDevice,
    speechLanguage: value.speechLanguage ?? 'en',
    stanceAnalysis: value.stanceAnalysis ?? 'semantic',
    saveRecordings: value.saveRecordings,
  };
}

function validateCoachRequest(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new RequestValidationError('Invalid Ollama request.');
  const model = boundedString(value.model, 'Ollama model', 120);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(model)) {
    throw new RequestValidationError('Ollama model name is invalid.');
  }
  if (!Array.isArray(value.messages) || value.messages.length < 1 || value.messages.length > 4) {
    throw new RequestValidationError('Ollama messages are invalid.');
  }
  let totalCharacters = 0;
  const messages = value.messages.map((message) => {
    if (!isRecord(message) || !['system', 'user'].includes(String(message.role))) {
      throw new RequestValidationError('Ollama messages are invalid.');
    }
    const content = boundedString(message.content, 'Ollama message', 24_000);
    totalCharacters += content.length;
    return { role: message.role, content };
  });
  if (totalCharacters > 32_000) throw new RequestValidationError('Ollama messages are too large.');

  let format: unknown;
  if (value.format === 'json') format = 'json';
  else if (isRecord(value.format) && JSON.stringify(value.format).length <= 20_000) format = value.format;
  else throw new RequestValidationError('Ollama response format is invalid.');

  const requestedTemperature = isRecord(value.options) && typeof value.options.temperature === 'number'
    ? value.options.temperature
    : 0.2;
  return {
    model,
    messages,
    stream: false,
    format,
    options: { temperature: Math.max(0, Math.min(1, requestedTemperature)), num_predict: 1_600 },
  };
}

function serializeAttempt(row: Record<string, unknown>) {
  const createdAt = row.created_at instanceof Date
    ? row.created_at.toISOString()
    : new Date(String(row.created_at)).toISOString();
  return {
    id: row.id,
    userId: row.user_id,
    topic: row.topic,
    stance: row.stance,
    durationSeconds: row.duration_seconds,
    transcript: row.transcript,
    report: row.report,
    createdAt,
    recordingMimeType: row.recording_mime_type ?? undefined,
    hasRecording: Boolean(row.has_recording),
  };
}

const cleanupRateLimits = setInterval(() => {
  const now = Date.now();
  for (const [key, value] of authAttempts) if (value.resetAt <= now) authAttempts.delete(key);
  for (const [key, value] of coachAttempts) if (value.resetAt <= now) coachAttempts.delete(key);
}, 15 * 60_000);
cleanupRateLimits.unref();

await initializeDatabase();
const server = app.listen(config.server.port, (error?: Error) => {
  if (error) {
    console.error(`VoxLab API could not listen on port ${config.server.port}:`, error);
    process.exitCode = 1;
    return;
  }
  console.log(`VoxLab API listening on http://localhost:${config.server.port}`);
  console.log(databaseState.configured
    ? `Database: ${databaseState.ready ? 'ready' : 'configured but unavailable'}`
    : 'Database: not configured (browser storage will be used)');
});

let shuttingDown = false;
async function shutDown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}; shutting down.`);
  clearInterval(cleanupRateLimits);
  server.close(async (error) => {
    try {
      await closeDatabase();
    } finally {
      if (error) {
        console.error('HTTP server shutdown failed:', error);
        process.exitCode = 1;
      }
    }
  });
}

process.once('SIGINT', () => { void shutDown('SIGINT'); });
process.once('SIGTERM', () => { void shutDown('SIGTERM'); });
