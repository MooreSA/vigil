import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { userProfileRoute } from './user-profile.js';
import type { UserProfileService } from '../../services/user-profile.js';

function mockUserProfileService(): UserProfileService {
  return {
    get: vi.fn().mockResolvedValue({ content: '', timezone: 'UTC' }),
    getTimezone: vi.fn().mockResolvedValue('UTC'),
    update: vi.fn().mockImplementation(async (fields: { content?: string; timezone?: string }) => ({
      id: 1,
      content: fields.content ?? '',
      timezone: fields.timezone ?? 'UTC',
      created_at: new Date(),
      updated_at: new Date(),
    })),
  } as unknown as UserProfileService;
}

let userProfileService: ReturnType<typeof mockUserProfileService>;

beforeEach(() => {
  userProfileService = mockUserProfileService();
});

async function buildApp() {
  const app = Fastify();
  await app.register(userProfileRoute, {
    prefix: '/v1',
    userProfileService,
  });
  await app.ready();
  return app;
}

describe('GET /v1/user-profile', () => {
  it('returns profile content and timezone', async () => {
    vi.mocked(userProfileService.get).mockResolvedValue({ content: 'My name is Seamus', timezone: 'Europe/Dublin' });
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/v1/user-profile' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ content: 'My name is Seamus', timezone: 'Europe/Dublin' });
  });

  it('returns defaults when no profile exists', async () => {
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/v1/user-profile' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ content: '', timezone: 'UTC' });
  });
});

describe('PUT /v1/user-profile', () => {
  it('updates profile content', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'PUT',
      url: '/v1/user-profile',
      payload: { content: 'My name is Seamus' },
    });

    expect(res.statusCode).toBe(200);
    expect(userProfileService.update).toHaveBeenCalledWith({ content: 'My name is Seamus' });
    expect(res.json().content).toBe('My name is Seamus');
  });

  it('updates timezone only', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'PUT',
      url: '/v1/user-profile',
      payload: { timezone: 'America/New_York' },
    });

    expect(res.statusCode).toBe(200);
    expect(userProfileService.update).toHaveBeenCalledWith({ timezone: 'America/New_York' });
  });

  it('updates both content and timezone', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'PUT',
      url: '/v1/user-profile',
      payload: { content: 'Updated', timezone: 'Asia/Tokyo' },
    });

    expect(res.statusCode).toBe(200);
    expect(userProfileService.update).toHaveBeenCalledWith({ content: 'Updated', timezone: 'Asia/Tokyo' });
  });

  it('accepts empty payload for no-op update', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'PUT',
      url: '/v1/user-profile',
      payload: {},
    });

    expect(res.statusCode).toBe(200);
  });
});
