import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ThreadService } from './threads.js';
import type { ThreadRepository } from '../repositories/threads.js';
import type { MessageRepository } from '../repositories/messages.js';

function mockThreadRepo(): ThreadRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    softDelete: vi.fn(),
  } as unknown as ThreadRepository;
}

function mockMessageRepo(): MessageRepository {
  return {
    create: vi.fn(),
    createMany: vi.fn(),
    findByThreadId: vi.fn(),
    findById: vi.fn(),
    softDelete: vi.fn(),
  } as unknown as MessageRepository;
}

let threadRepo: ReturnType<typeof mockThreadRepo>;
let messageRepo: ReturnType<typeof mockMessageRepo>;
let service: ThreadService;

beforeEach(() => {
  threadRepo = mockThreadRepo();
  messageRepo = mockMessageRepo();
  service = new ThreadService({ threadRepo, messageRepo });
});

describe('ThreadService', () => {
  describe('create', () => {
    it('delegates to threadRepo.create', async () => {
      const row = { id: '1', title: null, source: 'user' };
      vi.mocked(threadRepo.create).mockResolvedValue(row as any);

      const result = await service.create();

      expect(threadRepo.create).toHaveBeenCalledWith(undefined);
      expect(result).toBe(row);
    });

    it('passes options through', async () => {
      const opts = { title: 'Test', source: 'wake' as const };
      vi.mocked(threadRepo.create).mockResolvedValue({ id: '1', ...opts } as any);

      await service.create(opts);

      expect(threadRepo.create).toHaveBeenCalledWith(opts);
    });
  });

  describe('findById', () => {
    it('delegates to threadRepo.findById', async () => {
      const row = { id: '42', title: 'Found' };
      vi.mocked(threadRepo.findById).mockResolvedValue(row as any);

      const result = await service.findById('42');

      expect(threadRepo.findById).toHaveBeenCalledWith('42');
      expect(result).toBe(row);
    });

    it('returns undefined when not found', async () => {
      vi.mocked(threadRepo.findById).mockResolvedValue(undefined);

      const result = await service.findById('999');

      expect(result).toBeUndefined();
    });
  });

  describe('addMessage', () => {
    it('delegates to messageRepo.create', async () => {
      const input = {
        thread_id: '1',
        role: 'user' as const,
        content: { role: 'user', content: 'hello' },
      };
      const row = { id: '10', ...input };
      vi.mocked(messageRepo.create).mockResolvedValue(row as any);

      const result = await service.addMessage(input);

      expect(messageRepo.create).toHaveBeenCalledWith(input);
      expect(result).toBe(row);
    });
  });

  describe('getMessages', () => {
    it('delegates to messageRepo.findByThreadId', async () => {
      const rows = [{ id: '1' }, { id: '2' }];
      vi.mocked(messageRepo.findByThreadId).mockResolvedValue(rows as any);

      const result = await service.getMessages('5');

      expect(messageRepo.findByThreadId).toHaveBeenCalledWith('5');
      expect(result).toBe(rows);
    });
  });
});
