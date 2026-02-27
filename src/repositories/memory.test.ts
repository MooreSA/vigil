import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { inject } from 'vitest';
import type { Kysely } from 'kysely';
import type { DB } from '../db/types.js';
import { createTestDb, truncateAll } from '../test/helpers.js';
import { ThreadRepository } from './threads.js';
import { MemoryRepository } from './memory.js';

let db: Kysely<DB>;
let memoryRepo: MemoryRepository;
let threadRepo: ThreadRepository;

// A simple normalized vector for testing (1536 dims)
function makeEmbedding(seed: number): number[] {
  const raw = Array.from({ length: 1536 }, (_, i) => Math.sin(seed * (i + 1)));
  const norm = Math.sqrt(raw.reduce((sum, v) => sum + v * v, 0));
  return raw.map((v) => v / norm);
}

beforeAll(() => {
  const url = inject('testDatabaseUrl');
  db = createTestDb(url);
  memoryRepo = new MemoryRepository(db);
  threadRepo = new ThreadRepository(db);
});

beforeEach(async () => {
  await truncateAll(db);
});

afterAll(async () => {
  await db.destroy();
});

describe('MemoryRepository', () => {
  describe('create', () => {
    it('creates a memory entry with embedding', async () => {
      const embedding = makeEmbedding(1);
      const entry = await memoryRepo.create({
        content: 'User prefers dark mode',
        embedding,
        source: 'agent',
      });

      expect(entry.id).toBeDefined();
      expect(entry.content).toBe('User prefers dark mode');
      expect(entry.source).toBe('agent');
      expect(entry.thread_id).toBeNull();
      expect(entry.deleted_at).toBeNull();
    });

    it('stores thread_id when provided', async () => {
      const thread = await threadRepo.create({ title: 'Test' });
      const embedding = makeEmbedding(2);
      const entry = await memoryRepo.create({
        content: 'From thread context',
        embedding,
        thread_id: thread.id,
      });

      expect(entry.thread_id).toBe(thread.id);
    });

    it('defaults source to agent', async () => {
      const entry = await memoryRepo.create({
        content: 'No source specified',
        embedding: makeEmbedding(3),
      });

      expect(entry.source).toBe('agent');
    });
  });

  describe('update', () => {
    it('updates content and embedding', async () => {
      const entry = await memoryRepo.create({
        content: 'Original content',
        embedding: makeEmbedding(10),
      });

      const newEmbedding = makeEmbedding(11);
      const updated = await memoryRepo.update(entry.id, 'Updated content', newEmbedding);

      expect(updated).toBeDefined();
      expect(updated!.content).toBe('Updated content');
      expect(updated!.id).toBe(entry.id);
    });

    it('returns undefined for deleted entry', async () => {
      const entry = await memoryRepo.create({
        content: 'Will be deleted',
        embedding: makeEmbedding(12),
      });
      await memoryRepo.softDelete(entry.id);

      const result = await memoryRepo.update(entry.id, 'Nope', makeEmbedding(13));
      expect(result).toBeUndefined();
    });
  });

  describe('findById', () => {
    it('returns a memory entry by id', async () => {
      const entry = await memoryRepo.create({
        content: 'Find me',
        embedding: makeEmbedding(20),
      });

      const found = await memoryRepo.findById(entry.id);
      expect(found).toBeDefined();
      expect(found!.content).toBe('Find me');
    });

    it('returns undefined for non-existent id', async () => {
      const found = await memoryRepo.findById('999999');
      expect(found).toBeUndefined();
    });

    it('returns undefined for deleted entry', async () => {
      const entry = await memoryRepo.create({
        content: 'Deleted',
        embedding: makeEmbedding(21),
      });
      await memoryRepo.softDelete(entry.id);

      const found = await memoryRepo.findById(entry.id);
      expect(found).toBeUndefined();
    });
  });

  describe('findAll', () => {
    it('returns all non-deleted entries', async () => {
      await memoryRepo.create({ content: 'A', embedding: makeEmbedding(30) });
      await memoryRepo.create({ content: 'B', embedding: makeEmbedding(31) });
      const c = await memoryRepo.create({ content: 'C', embedding: makeEmbedding(32) });
      await memoryRepo.softDelete(c.id);

      const all = await memoryRepo.findAll();
      expect(all).toHaveLength(2);
    });

    it('returns entries in descending id order', async () => {
      await memoryRepo.create({ content: 'First', embedding: makeEmbedding(33) });
      await memoryRepo.create({ content: 'Second', embedding: makeEmbedding(34) });

      const all = await memoryRepo.findAll();
      expect(BigInt(all[0].id)).toBeGreaterThan(BigInt(all[1].id));
    });
  });

  describe('softDelete', () => {
    it('sets deleted_at on the entry', async () => {
      const entry = await memoryRepo.create({
        content: 'Delete me',
        embedding: makeEmbedding(40),
      });

      const deleted = await memoryRepo.softDelete(entry.id);
      expect(deleted).toBeDefined();
      expect(deleted!.deleted_at).toBeInstanceOf(Date);
    });

    it('returns undefined when deleting already-deleted entry', async () => {
      const entry = await memoryRepo.create({
        content: 'Already gone',
        embedding: makeEmbedding(41),
      });
      await memoryRepo.softDelete(entry.id);

      const result = await memoryRepo.softDelete(entry.id);
      expect(result).toBeUndefined();
    });
  });

  describe('similaritySearch', () => {
    it('returns entries above threshold ordered by similarity', async () => {
      const baseEmbedding = makeEmbedding(50);
      // Create a very similar embedding by adding tiny noise to the base
      const similarEmbedding = baseEmbedding.map((v) => v + 0.0001);
      const differentEmbedding = makeEmbedding(999);

      await memoryRepo.create({ content: 'Similar', embedding: similarEmbedding });
      await memoryRepo.create({ content: 'Different', embedding: differentEmbedding });

      const results = await memoryRepo.similaritySearch(baseEmbedding, 10, 0.9);

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].content).toBe('Similar');
      expect(results[0].similarity).toBeGreaterThanOrEqual(0.9);
    });

    it('respects limit parameter', async () => {
      // Insert several similar entries
      for (let i = 0; i < 5; i++) {
        await memoryRepo.create({
          content: `Entry ${i}`,
          embedding: makeEmbedding(60 + i * 0.001),
        });
      }

      const results = await memoryRepo.similaritySearch(makeEmbedding(60), 2, 0.0);
      expect(results).toHaveLength(2);
    });

    it('excludes soft-deleted entries', async () => {
      const embedding = makeEmbedding(70);
      const entry = await memoryRepo.create({ content: 'Deleted', embedding });
      await memoryRepo.softDelete(entry.id);

      const results = await memoryRepo.similaritySearch(embedding, 10, 0.0);
      expect(results).toHaveLength(0);
    });

    it('returns empty array when no entries match threshold', async () => {
      await memoryRepo.create({
        content: 'Lonely entry',
        embedding: makeEmbedding(80),
      });

      // Search with a very different vector and high threshold
      const results = await memoryRepo.similaritySearch(makeEmbedding(999), 10, 0.99);
      expect(results).toHaveLength(0);
    });

    it('includes similarity score in results', async () => {
      const embedding = makeEmbedding(90);
      await memoryRepo.create({ content: 'Exact match', embedding });

      const results = await memoryRepo.similaritySearch(embedding, 10, 0.0);
      expect(results).toHaveLength(1);
      // Searching with the exact same vector should give similarity ~1.0
      expect(results[0].similarity).toBeGreaterThan(0.99);
    });
  });
});
