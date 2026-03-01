import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { userProfileRoute } from './user-profile.js';
import type { UserProfileService } from '../../services/user-profile.js';

function mockUserProfileService(): UserProfileService {
  return {
    get: vi.fn().mockResolvedValue(''),
    update: vi.fn().mockImplementation(async (content: string) => ({
      id: 1,
      content,
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
  it('returns profile content', async () => {
    vi.mocked(userProfileService.get).mockResolvedValue('My name is Seamus');
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/v1/user-profile' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ content: 'My name is Seamus' });
  });

  it('returns empty content when no profile exists', async () => {
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/v1/user-profile' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ content: '' });
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
    expect(userProfileService.update).toHaveBeenCalledWith('My name is Seamus');
    expect(res.json().content).toBe('My name is Seamus');
  });

  it('allows empty content to clear the profile', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'PUT',
      url: '/v1/user-profile',
      payload: { content: '' },
    });

    expect(res.statusCode).toBe(200);
    expect(userProfileService.update).toHaveBeenCalledWith('');
  });

  it('returns 400 for missing content field', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'PUT',
      url: '/v1/user-profile',
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });
});
