import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { inject } from 'vitest';
import type { Kysely } from 'kysely';
import type { DB } from '../db/types.js';
import { createTestDb, truncateAll } from '../test/helpers.js';
import { ThreadRepository } from './threads.js';

let db: Kysely<DB>;
let repo: ThreadRepository;

beforeAll(() => {
  const url = inject('testDatabaseUrl');
  db = createTestDb(url);
  repo = new ThreadRepository(db);
});

beforeEach(async () => {
  await truncateAll(db);
});

afterAll(async () => {
  await db.destroy();
});

describe('ThreadRepository', () => {
  describe('create', () => {
    it('creates a thread with defaults', async () => {
      const thread = await repo.create();

      expect(thread.id).toBeDefined();
      expect(thread.title).toBeNull();
      expect(thread.source).toBe('user');
      expect(thread.deleted_at).toBeNull();
      expect(thread.created_at).toBeInstanceOf(Date);
      expect(thread.updated_at).toBeInstanceOf(Date);
    });

    it('creates a thread with title and source', async () => {
      const thread = await repo.create({ title: 'Test Thread', source: 'wake' });

      expect(thread.title).toBe('Test Thread');
      expect(thread.source).toBe('wake');
    });
  });

  describe('findById', () => {
    it('returns a thread by id', async () => {
      const created = await repo.create({ title: 'Find Me' });
      const found = await repo.findById(created.id);

      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
      expect(found!.title).toBe('Find Me');
    });

    it('returns undefined for non-existent id', async () => {
      const found = await repo.findById('999999');
      expect(found).toBeUndefined();
    });

    it('excludes soft-deleted threads', async () => {
      const created = await repo.create();
      await repo.softDelete(created.id);

      const found = await repo.findById(created.id);
      expect(found).toBeUndefined();
    });
  });

  describe('findAll', () => {
    it('returns all non-deleted threads ordered by id desc', async () => {
      const t1 = await repo.create({ title: 'First' });
      const t2 = await repo.create({ title: 'Second' });
      const t3 = await repo.create({ title: 'Third' });

      const all = await repo.findAll();

      expect(all).toHaveLength(3);
      expect(all[0].id).toBe(t3.id);
      expect(all[1].id).toBe(t2.id);
      expect(all[2].id).toBe(t1.id);
    });

    it('excludes soft-deleted threads', async () => {
      await repo.create({ title: 'Keep' });
      const del = await repo.create({ title: 'Delete' });
      await repo.softDelete(del.id);

      const all = await repo.findAll();
      expect(all).toHaveLength(1);
      expect(all[0].title).toBe('Keep');
    });
  });

  describe('archive / unarchive / findAllArchived', () => {
    it('archive sets archived_at', async () => {
      const t = await repo.create({ title: 'To Archive' });
      const archived = await repo.archive(t.id);

      expect(archived).toBeDefined();
      expect(archived!.archived_at).toBeInstanceOf(Date);
    });

    it('unarchive clears archived_at', async () => {
      const t = await repo.create();
      await repo.archive(t.id);
      const restored = await repo.unarchive(t.id);

      expect(restored).toBeDefined();
      expect(restored!.archived_at).toBeNull();
    });

    it('archive returns undefined for non-existent id', async () => {
      const result = await repo.archive('999999');
      expect(result).toBeUndefined();
    });

    it('findAll excludes archived threads', async () => {
      const t1 = await repo.create({ title: 'Active' });
      const t2 = await repo.create({ title: 'Archived' });
      await repo.archive(t2.id);

      const all = await repo.findAll();
      expect(all.map((t) => t.id)).toContain(t1.id);
      expect(all.map((t) => t.id)).not.toContain(t2.id);
    });

    it('findAllArchived returns only archived non-deleted threads', async () => {
      await repo.create({ title: 'Active' });
      const t2 = await repo.create({ title: 'Archived' });
      const t3 = await repo.create({ title: 'Also Archived' });
      await repo.archive(t2.id);
      await repo.archive(t3.id);

      const archived = await repo.findAllArchived();
      expect(archived).toHaveLength(2);
      expect(archived.map((t) => t.id)).toContain(t2.id);
      expect(archived.map((t) => t.id)).toContain(t3.id);
    });

    it('findAllArchived excludes soft-deleted threads', async () => {
      const t = await repo.create({ title: 'Archived then Deleted' });
      await repo.archive(t.id);
      await repo.softDelete(t.id);

      const archived = await repo.findAllArchived();
      expect(archived.map((a) => a.id)).not.toContain(t.id);
    });
  });

  describe('softDelete', () => {
    it('sets deleted_at on the thread', async () => {
      const created = await repo.create();
      const deleted = await repo.softDelete(created.id);

      expect(deleted).toBeDefined();
      expect(deleted!.deleted_at).toBeInstanceOf(Date);
    });

    it('returns undefined when deleting already-deleted thread', async () => {
      const created = await repo.create();
      await repo.softDelete(created.id);

      const result = await repo.softDelete(created.id);
      expect(result).toBeUndefined();
    });

    it('returns undefined for non-existent id', async () => {
      const result = await repo.softDelete('999999');
      expect(result).toBeUndefined();
    });
  });
});
