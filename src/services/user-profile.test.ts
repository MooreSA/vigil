import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserProfileService } from './user-profile.js';
import type { UserProfileRepository } from '../repositories/user-profile.js';

function mockUserProfileRepo(): UserProfileRepository {
  return {
    get: vi.fn().mockResolvedValue(undefined),
    upsert: vi.fn().mockImplementation(async (content: string) => ({
      id: 1,
      content,
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
    it('returns empty string when no profile exists', async () => {
      const result = await service.get();
      expect(result).toBe('');
      expect(repo.get).toHaveBeenCalled();
    });

    it('returns profile content when profile exists', async () => {
      vi.mocked(repo.get).mockResolvedValue({
        id: 1,
        content: 'My name is Seamus',
        created_at: new Date(),
        updated_at: new Date(),
      });

      const result = await service.get();
      expect(result).toBe('My name is Seamus');
    });
  });

  describe('update', () => {
    it('upserts the profile content', async () => {
      const result = await service.update('My name is Seamus');
      expect(repo.upsert).toHaveBeenCalledWith('My name is Seamus');
      expect(result.content).toBe('My name is Seamus');
    });
  });
});
