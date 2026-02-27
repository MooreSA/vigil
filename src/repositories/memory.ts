import { sql, type Kysely } from 'kysely';
import type { DB } from '../db/types.js';

export interface CreateMemoryInput {
  content: string;
  embedding: number[];
  source?: 'agent' | 'user';
  thread_id?: string | null;
}

export interface SimilarityResult {
  id: string;
  content: string;
  source: 'agent' | 'user';
  thread_id: string | null;
  similarity: number;
  created_at: Date;
  updated_at: Date;
}

export class MemoryRepository {
  constructor(private db: Kysely<DB>) {}

  async create(input: CreateMemoryInput) {
    const embeddingStr = `[${input.embedding.join(',')}]`;
    return this.db
      .insertInto('memory_entries')
      .values({
        content: input.content,
        embedding: embeddingStr,
        source: input.source ?? 'agent',
        thread_id: input.thread_id ?? null,
        deleted_at: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async update(id: string, content: string, embedding: number[]) {
    const embeddingStr = `[${embedding.join(',')}]`;
    return this.db
      .updateTable('memory_entries')
      .set({
        content,
        embedding: embeddingStr,
      })
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .returningAll()
      .executeTakeFirst();
  }

  async findById(id: string) {
    return this.db
      .selectFrom('memory_entries')
      .selectAll()
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
  }

  async findAll() {
    return this.db
      .selectFrom('memory_entries')
      .selectAll()
      .where('deleted_at', 'is', null)
      .orderBy('id', 'desc')
      .execute();
  }

  async softDelete(id: string) {
    return this.db
      .updateTable('memory_entries')
      .set({ deleted_at: new Date() })
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .returningAll()
      .executeTakeFirst();
  }

  async similaritySearch(
    embedding: number[],
    limit: number,
    threshold: number,
  ): Promise<SimilarityResult[]> {
    const embeddingStr = `[${embedding.join(',')}]`;
    const results = await sql<SimilarityResult>`
      SELECT
        id,
        content,
        source,
        thread_id,
        1 - (embedding <=> ${embeddingStr}::vector) AS similarity,
        created_at,
        updated_at
      FROM memory_entries
      WHERE deleted_at IS NULL
        AND 1 - (embedding <=> ${embeddingStr}::vector) >= ${threshold}
      ORDER BY embedding <=> ${embeddingStr}::vector
      LIMIT ${limit}
    `.execute(this.db);
    return results.rows;
  }
}
