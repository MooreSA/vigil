import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryService } from './memory.js';
import type { MemoryRepository, SimilarityResult } from '../repositories/memory.js';
import type { EmbeddingService } from './embedding.js';
import pino from 'pino';

const logger = pino({ level: 'silent' });

function mockMemoryRepo(): MemoryRepository {
  return {
    create: vi.fn().mockImplementation(async (input) => ({
      id: '1',
      content: input.content,
      source: input.source,
      thread_id: input.thread_id,
      embedding: '',
      deleted_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    })),
    update: vi.fn().mockImplementation(async (id, content) => ({
      id,
      content,
      source: 'agent',
      thread_id: null,
      embedding: '',
      deleted_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    })),
    findById: vi.fn(),
    findAll: vi.fn().mockResolvedValue([]),
    softDelete: vi.fn().mockImplementation(async (id) => ({
      id,
      content: 'deleted',
      source: 'agent',
      thread_id: null,
      embedding: '',
      deleted_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    })),
    similaritySearch: vi.fn().mockResolvedValue([]),
  } as unknown as MemoryRepository;
}

function mockEmbeddingService(): EmbeddingService {
  return {
    embed: vi.fn().mockResolvedValue(new Array(1536).fill(0.1)),
  } as unknown as EmbeddingService;
}

let memoryRepo: ReturnType<typeof mockMemoryRepo>;
let embeddingService: ReturnType<typeof mockEmbeddingService>;
let service: MemoryService;

beforeEach(() => {
  memoryRepo = mockMemoryRepo();
  embeddingService = mockEmbeddingService();
  service = new MemoryService({ memoryRepo, embeddingService, logger });
});

describe('MemoryService', () => {
  describe('remember', () => {
    it('embeds content and creates a new entry', async () => {
      const result = await service.remember('User likes TypeScript');

      expect(embeddingService.embed).toHaveBeenCalledWith('User likes TypeScript');
      expect(memoryRepo.create).toHaveBeenCalledWith({
        content: 'User likes TypeScript',
        embedding: expect.any(Array),
        source: 'agent',
        thread_id: undefined,
      });
      expect(result).toBeDefined();
    });

    it('updates existing entry when replaceId is provided', async () => {
      await service.remember('User likes TypeScript', 'agent', undefined, '42');

      expect(memoryRepo.update).toHaveBeenCalledWith(
        '42',
        'User likes TypeScript',
        expect.any(Array),
      );
      expect(memoryRepo.create).not.toHaveBeenCalled();
    });

    it('creates new entry when replaceId is not provided', async () => {
      await service.remember('User likes TypeScript');

      expect(memoryRepo.create).toHaveBeenCalled();
      expect(memoryRepo.update).not.toHaveBeenCalled();
    });

    it('passes source and threadId through', async () => {
      await service.remember('A fact', 'user', '99');

      expect(memoryRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'user',
          thread_id: '99',
        }),
      );
    });
  });

  describe('recall', () => {
    it('embeds query and searches with default limit', async () => {
      await service.recall('What does the user prefer?');

      expect(embeddingService.embed).toHaveBeenCalledWith('What does the user prefer?');
      expect(memoryRepo.similaritySearch).toHaveBeenCalledWith(
        expect.any(Array),
        10,
        0.3,
      );
    });

    it('respects custom limit', async () => {
      await service.recall('query', 5);

      expect(memoryRepo.similaritySearch).toHaveBeenCalledWith(
        expect.any(Array),
        5,
        0.3,
      );
    });

    it('returns similarity results', async () => {
      const results: SimilarityResult[] = [
        {
          id: '1',
          content: 'User prefers dark mode',
          source: 'agent',
          thread_id: null,
          similarity: 0.88,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];
      vi.mocked(memoryRepo.similaritySearch).mockResolvedValue(results);

      const found = await service.recall('dark mode');
      expect(found).toEqual(results);
    });
  });

  describe('list', () => {
    it('delegates to repository', async () => {
      await service.list();
      expect(memoryRepo.findAll).toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('delegates to repository soft delete', async () => {
      await service.delete('5');
      expect(memoryRepo.softDelete).toHaveBeenCalledWith('5');
    });
  });

  describe('update', () => {
    it('re-embeds and updates via repository', async () => {
      await service.update('7', 'Updated fact');

      expect(embeddingService.embed).toHaveBeenCalledWith('Updated fact');
      expect(memoryRepo.update).toHaveBeenCalledWith(
        '7',
        'Updated fact',
        expect.any(Array),
      );
    });
  });
});
