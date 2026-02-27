import type { Kysely } from 'kysely';
import type { DB } from '../db/types.js';

export interface CreateMessageInput {
  thread_id: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  model?: string | null;
  content: Record<string, unknown>;
}

export class MessageRepository {
  constructor(private db: Kysely<DB>) {}

  async create(input: CreateMessageInput) {
    return this.db
      .insertInto('messages')
      .values({
        thread_id: input.thread_id,
        role: input.role,
        model: input.model ?? null,
        content: JSON.stringify(input.content),
        deleted_at: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async createMany(inputs: CreateMessageInput[]) {
    return this.db
      .insertInto('messages')
      .values(
        inputs.map((input) => ({
          thread_id: input.thread_id,
          role: input.role,
          model: input.model ?? null,
          content: JSON.stringify(input.content),
          deleted_at: null,
        }))
      )
      .returningAll()
      .execute();
  }

  async findByThreadId(threadId: string) {
    return this.db
      .selectFrom('messages')
      .selectAll()
      .where('thread_id', '=', threadId)
      .where('deleted_at', 'is', null)
      .orderBy('id', 'asc')
      .execute();
  }

  async findById(id: string) {
    return this.db
      .selectFrom('messages')
      .selectAll()
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
  }

  async softDelete(id: string) {
    return this.db
      .updateTable('messages')
      .set({ deleted_at: new Date() })
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .returningAll()
      .executeTakeFirst();
  }
}
