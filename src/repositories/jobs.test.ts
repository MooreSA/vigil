import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { inject } from 'vitest';
import type { Kysely } from 'kysely';
import type { DB } from '../db/types.js';
import { createTestDb, truncateAll } from '../test/helpers.js';
import { JobRepository } from './jobs.js';

let db: Kysely<DB>;
let repo: JobRepository;

beforeAll(() => {
  const url = inject('testDatabaseUrl');
  db = createTestDb(url);
  repo = new JobRepository(db);
});

beforeEach(async () => {
  await truncateAll(db);
});

afterAll(async () => {
  await db.destroy();
});

const baseJob = {
  name: 'Morning briefing',
  schedule: '0 8 * * *',
  prompt: 'Give me a morning briefing',
  next_run_at: new Date('2026-03-01T08:00:00Z'),
};

describe('JobRepository', () => {
  describe('create', () => {
    it('creates a job with defaults', async () => {
      const job = await repo.create(baseJob);

      expect(job.id).toBeDefined();
      expect(job.name).toBe('Morning briefing');
      expect(job.schedule).toBe('0 8 * * *');
      expect(job.prompt).toBe('Give me a morning briefing');
      expect(job.enabled).toBe(true);
      expect(job.max_retries).toBe(3);
      expect(job.next_run_at).toBeInstanceOf(Date);
      expect(job.last_run_at).toBeNull();
      expect(job.deleted_at).toBeNull();
      expect(job.created_at).toBeInstanceOf(Date);
    });

    it('creates a job with custom enabled and max_retries', async () => {
      const job = await repo.create({
        ...baseJob,
        enabled: false,
        max_retries: 5,
      });

      expect(job.enabled).toBe(false);
      expect(job.max_retries).toBe(5);
    });
  });

  describe('findById', () => {
    it('returns a job by id', async () => {
      const created = await repo.create(baseJob);
      const found = await repo.findById(created.id);

      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
      expect(found!.name).toBe('Morning briefing');
    });

    it('returns undefined for non-existent id', async () => {
      const found = await repo.findById('999999');
      expect(found).toBeUndefined();
    });

    it('excludes soft-deleted jobs', async () => {
      const created = await repo.create(baseJob);
      await repo.softDelete(created.id);

      const found = await repo.findById(created.id);
      expect(found).toBeUndefined();
    });
  });

  describe('findAll', () => {
    it('returns all non-deleted jobs ordered by id desc', async () => {
      const j1 = await repo.create({ ...baseJob, name: 'First' });
      const j2 = await repo.create({ ...baseJob, name: 'Second' });
      const j3 = await repo.create({ ...baseJob, name: 'Third' });

      const all = await repo.findAll();

      expect(all).toHaveLength(3);
      expect(all[0].id).toBe(j3.id);
      expect(all[1].id).toBe(j2.id);
      expect(all[2].id).toBe(j1.id);
    });

    it('excludes soft-deleted jobs', async () => {
      await repo.create({ ...baseJob, name: 'Keep' });
      const del = await repo.create({ ...baseJob, name: 'Delete' });
      await repo.softDelete(del.id);

      const all = await repo.findAll();
      expect(all).toHaveLength(1);
      expect(all[0].name).toBe('Keep');
    });
  });

  describe('update', () => {
    it('updates specified fields', async () => {
      const created = await repo.create(baseJob);
      const updated = await repo.update(created.id, {
        name: 'Evening summary',
        enabled: false,
      });

      expect(updated).toBeDefined();
      expect(updated!.name).toBe('Evening summary');
      expect(updated!.enabled).toBe(false);
      expect(updated!.prompt).toBe(baseJob.prompt);
    });

    it('returns undefined for non-existent id', async () => {
      const result = await repo.update('999999', { name: 'nope' });
      expect(result).toBeUndefined();
    });

    it('returns undefined for soft-deleted job', async () => {
      const created = await repo.create(baseJob);
      await repo.softDelete(created.id);

      const result = await repo.update(created.id, { name: 'nope' });
      expect(result).toBeUndefined();
    });
  });

  describe('softDelete', () => {
    it('sets deleted_at on the job', async () => {
      const created = await repo.create(baseJob);
      const deleted = await repo.softDelete(created.id);

      expect(deleted).toBeDefined();
      expect(deleted!.deleted_at).toBeInstanceOf(Date);
    });

    it('returns undefined when deleting already-deleted job', async () => {
      const created = await repo.create(baseJob);
      await repo.softDelete(created.id);

      const result = await repo.softDelete(created.id);
      expect(result).toBeUndefined();
    });
  });

  describe('findDue', () => {
    it('returns enabled jobs with next_run_at in the past', async () => {
      await repo.create({
        ...baseJob,
        name: 'Due',
        next_run_at: new Date('2020-01-01T00:00:00Z'),
      });
      await repo.create({
        ...baseJob,
        name: 'Future',
        next_run_at: new Date('2099-01-01T00:00:00Z'),
      });

      const due = await repo.findDue();
      expect(due).toHaveLength(1);
      expect(due[0].name).toBe('Due');
    });

    it('excludes disabled jobs', async () => {
      await repo.create({
        ...baseJob,
        enabled: false,
        next_run_at: new Date('2020-01-01T00:00:00Z'),
      });

      const due = await repo.findDue();
      expect(due).toHaveLength(0);
    });

    it('excludes soft-deleted jobs', async () => {
      const job = await repo.create({
        ...baseJob,
        next_run_at: new Date('2020-01-01T00:00:00Z'),
      });
      await repo.softDelete(job.id);

      const due = await repo.findDue();
      expect(due).toHaveLength(0);
    });
  });
});
