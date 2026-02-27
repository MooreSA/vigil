import type { Kysely } from 'kysely';
import type { DB } from '../db/types.js';

export interface CreateJobInput {
  name: string;
  schedule: string;
  prompt?: string | null;
  enabled?: boolean;
  max_retries?: number;
  skill_name?: string | null;
  skill_config?: Record<string, unknown> | null;
  next_run_at: Date | string;
}

export interface UpdateJobInput {
  name?: string;
  schedule?: string;
  prompt?: string | null;
  enabled?: boolean;
  max_retries?: number;
  skill_name?: string | null;
  skill_config?: Record<string, unknown> | null;
  next_run_at?: Date | string;
  last_run_at?: Date | string;
}

export class JobRepository {
  constructor(private db: Kysely<DB>) {}

  async create(input: CreateJobInput) {
    return this.db
      .insertInto('jobs')
      .values({
        name: input.name,
        schedule: input.schedule,
        prompt: input.prompt ?? null,
        enabled: input.enabled ?? true,
        max_retries: input.max_retries ?? 3,
        skill_name: input.skill_name ?? null,
        skill_config: input.skill_config ? JSON.stringify(input.skill_config) : null,
        next_run_at: input.next_run_at,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async findById(id: string) {
    return this.db
      .selectFrom('jobs')
      .selectAll()
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
  }

  async findAll() {
    return this.db
      .selectFrom('jobs')
      .selectAll()
      .where('deleted_at', 'is', null)
      .orderBy('id', 'desc')
      .execute();
  }

  async update(id: string, fields: UpdateJobInput) {
    const { skill_config, ...rest } = fields;
    const setFields: Record<string, unknown> = { ...rest };
    if (skill_config !== undefined) {
      setFields.skill_config = skill_config ? JSON.stringify(skill_config) : null;
    }

    return this.db
      .updateTable('jobs')
      .set(setFields)
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .returningAll()
      .executeTakeFirst();
  }

  async softDelete(id: string) {
    return this.db
      .updateTable('jobs')
      .set({ deleted_at: new Date() })
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .returningAll()
      .executeTakeFirst();
  }

  async findDue() {
    return this.db
      .selectFrom('jobs')
      .selectAll()
      .where('enabled', '=', true)
      .where('next_run_at', '<=', new Date())
      .where('deleted_at', 'is', null)
      .execute();
  }
}
