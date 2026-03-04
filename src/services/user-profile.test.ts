import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserProfileService } from './user-profile.js';
import type { UserProfileRepository } from '../repositories/user-profile.js';

function mockUserProfileRepo(): UserProfileRepository {
  return {
    get: vi.fn().mockResolvedValue(undefined),
    upsert: vi.fn().mockImplementation(async (fields: { content?: string; timezone?: string }) => ({
      id: 1,
      content: fields.content ?? '',
      timezone: fields.timezone ?? 'UTC',
      created_at: new Date(),
      updated_at: new Date(),
    })),
  } as unknown as UserProfileRepository;
}

let repo: ReturnType<typeof mockUserProfileRepo>;
let service: UserProfileService;

beforeEach(() => {
  repo = mockUserProfileRepo();
  service = new UserProfileService({ userProfileRepo: repo });
});

describe('UserProfileService', () => {
  describe('get', () => {
    it('returns defaults when no profile exists', async () => {
      const result = await service.get();
      expect(result).toEqual({ content: '', timezone: 'UTC' });
      expect(repo.get).toHaveBeenCalled();
    });

    it('returns profile content and timezone when profile exists', async () => {
      vi.mocked(repo.get).mockResolvedValue({
        id: 1,
        content: 'My name is Seamus',
        timezone: 'Europe/Dublin',
        created_at: new Date(),
        updated_at: new Date(),
      });

      const result = await service.get();
      expect(result).toEqual({ content: 'My name is Seamus', timezone: 'Europe/Dublin' });
    });
  });

  describe('getTimezone', () => {
    it('returns UTC when no profile exists', async () => {
      const result = await service.getTimezone();
      expect(result).toBe('UTC');
    });

    it('returns configured timezone', async () => {
      vi.mocked(repo.get).mockResolvedValue({
        id: 1,
        content: '',
        timezone: 'America/New_York',
        created_at: new Date(),
        updated_at: new Date(),
      });

      const result = await service.getTimezone();
      expect(result).toBe('America/New_York');
    });
  });

  describe('update', () => {
    it('upserts content only', async () => {
      const result = await service.update({ content: 'My name is Seamus' });
      expect(repo.upsert).toHaveBeenCalledWith({ content: 'My name is Seamus' });
      expect(result.content).toBe('My name is Seamus');
    });

    it('upserts timezone only', async () => {
      await service.update({ timezone: 'Europe/Dublin' });
      expect(repo.upsert).toHaveBeenCalledWith({ timezone: 'Europe/Dublin' });
    });

    it('upserts both content and timezone', async () => {
      await service.update({ content: 'test', timezone: 'Asia/Tokyo' });
      expect(repo.upsert).toHaveBeenCalledWith({ content: 'test', timezone: 'Asia/Tokyo' });
    });
  });
});
