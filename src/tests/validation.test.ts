import request from 'supertest';
import { createApp } from '../app';
import { registerSchema } from '../modules/auth/auth.schemas';
import {
  createMonitorSchema,
  isHost,
  isHostPort,
  isHttpUrl,
  statsQuerySchema,
  updateMonitorSchema,
} from '../modules/monitors/monitor.schemas';

// No database needed: schemas and requests that are rejected before any query.

describe('target formats', () => {
  it('accepts real HTTP URLs only', () => {
    expect(isHttpUrl('https://example.com/health')).toBe(true);
    expect(isHttpUrl('http://10.0.0.5:8080')).toBe(true);
    expect(isHttpUrl('example.com')).toBe(false);
    expect(isHttpUrl('ftp://example.com')).toBe(false);
    expect(isHttpUrl('javascript:alert(1)')).toBe(false);
  });

  it('accepts hostnames and IPv4 addresses', () => {
    expect(isHost('db.internal')).toBe(true);
    expect(isHost('8.8.8.8')).toBe(true);
    expect(isHost('999.1.1.1')).toBe(false);
    expect(isHost('-bad.example.com')).toBe(false);
    expect(isHost('has space.com')).toBe(false);
    expect(isHost('8.8.8.8; rm -rf /')).toBe(false);
  });

  it('accepts host:port with a valid port', () => {
    expect(isHostPort('db.example.com:5432')).toBe(true);
    expect(isHostPort('10.0.0.1:1')).toBe(true);
    expect(isHostPort('db.example.com')).toBe(false);
    expect(isHostPort(':5432')).toBe(false);
    expect(isHostPort('db.example.com:0')).toBe(false);
    expect(isHostPort('db.example.com:70000')).toBe(false);
    expect(isHostPort('db.example.com:abc')).toBe(false);
  });
});

describe('createMonitorSchema', () => {
  const valid = { name: '  API  ', type: 'HTTP', target: 'https://example.com', intervalSeconds: 60 };

  it('trims and keeps only known fields', () => {
    const parsed = createMonitorSchema.parse({ ...valid, createdById: 'someone-else', lastStatus: 'UP' });
    expect(parsed).toEqual({ name: 'API', type: 'HTTP', target: 'https://example.com', intervalSeconds: 60 });
  });

  it('checks the target against the monitor type', () => {
    expect(createMonitorSchema.safeParse({ ...valid, type: 'PORT' }).success).toBe(false);
    expect(createMonitorSchema.safeParse({ ...valid, type: 'PORT', target: 'db:5432' }).success).toBe(true);
    expect(createMonitorSchema.safeParse({ ...valid, type: 'PING', target: '1.1.1.1' }).success).toBe(true);
  });

  it('rejects bad intervals and thresholds', () => {
    for (const intervalSeconds of [5, 60.5, '60', 100_000]) {
      expect(createMonitorSchema.safeParse({ ...valid, intervalSeconds }).success).toBe(false);
    }
    for (const failureThreshold of [0, 11, 1.5]) {
      expect(createMonitorSchema.safeParse({ ...valid, failureThreshold }).success).toBe(false);
    }
  });
});

describe('statsQuerySchema', () => {
  it('defaults to 24h when no period is given', () => {
    expect(statsQuerySchema.parse({})).toEqual({ period: '24h' });
  });

  it('accepts the other supported periods', () => {
    expect(statsQuerySchema.parse({ period: '7d' })).toEqual({ period: '7d' });
    expect(statsQuerySchema.parse({ period: '30d' })).toEqual({ period: '30d' });
  });

  it('rejects an unsupported period', () => {
    expect(statsQuerySchema.safeParse({ period: '1h' }).success).toBe(false);
  });
});

describe('updateMonitorSchema', () => {
  it('rejects a body with no fields', () => {
    expect(updateMonitorSchema.safeParse({}).success).toBe(false);
  });

  it('accepts a single field and keeps only known ones', () => {
    const parsed = updateMonitorSchema.parse({ paused: true, type: 'PING', createdById: 'x' });
    expect(parsed).toEqual({ paused: true });
  });

  it('validates intervalSeconds and failureThreshold the same way create does', () => {
    expect(updateMonitorSchema.safeParse({ intervalSeconds: 5 }).success).toBe(false);
    expect(updateMonitorSchema.safeParse({ failureThreshold: 0 }).success).toBe(false);
    expect(updateMonitorSchema.safeParse({ intervalSeconds: 120 }).success).toBe(true);
  });
});

describe('registerSchema', () => {
  const valid = { name: 'Nasser', email: '  Nasser@Example.COM ', password: 'long-enough' };

  it('lowercases and trims the email', () => {
    expect(registerSchema.parse(valid).email).toBe('nasser@example.com');
  });

  it('rejects passwords bcrypt would silently truncate', () => {
    expect(registerSchema.safeParse({ ...valid, password: 'a'.repeat(72) }).success).toBe(true);
    expect(registerSchema.safeParse({ ...valid, password: 'a'.repeat(73) }).success).toBe(false);
    // 'é' is 2 bytes in UTF-8: 37 of them is 74 bytes, over the limit.
    expect(registerSchema.safeParse({ ...valid, password: 'é'.repeat(37) }).success).toBe(false);
  });
});

describe('HTTP error responses', () => {
  const app = createApp();

  it('answers unknown routes with JSON 404', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Route not found' });
  });

  it('answers malformed JSON with 400, not 500', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Malformed JSON body' });
  });

  it('lists every invalid field', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'not-an-email', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid request body');
    expect(res.body.details.map((d: { field: string }) => d.field).sort()).toEqual(['email', 'name', 'password']);
  });
});
