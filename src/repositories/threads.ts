import type { Kysely } from 'kysely';
import type { DB } from '../db/types.js';

export interface CreateThreadInput {
  title?: string | null;
  source?: 'user' | 'wake';
}

export class ThreadRepository {
  constructor(private db: Kysely<DB>) {}

  async create(input: CreateThreadInput = {}) {
    return this.db
      .insertInto('threads')
      .values({
        title: input.title ?? null,
        source: input.source ?? 'user',
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async findById(id: string) {
    return this.db
      .selectFrom('threads')
      .selectAll()
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
  }

  async findAll() {
    return this.db
      .selectFrom('threads')
      .selectAll()
      .where('deleted_at', 'is', null)
      .orderBy('id', 'desc')
      .execute();
  }

  async updateTitle(id: string, title: string) {
    await this.db
      .updateTable('threads')
      .set({ title })
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .execute();
  }

  async softDelete(id: string) {
    return this.db
      .updateTable('threads')
      .set({ deleted_at: new Date() })
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .returningAll()
      .executeTakeFirst();
  }
}
