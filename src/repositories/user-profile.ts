import type { Kysely } from 'kysely';
import type { DB } from '../db/types.js';

export interface UserProfile {
  id: number;
  content: string;
  timezone: string;
  created_at: Date;
  updated_at: Date;
}

export class UserProfileRepository {
  constructor(private db: Kysely<DB>) {}

  async get(): Promise<UserProfile | undefined> {
    return this.db
      .selectFrom('user_profile')
      .selectAll()
      .where('id', '=', 1)
      .executeTakeFirst();
  }

  async upsert(fields: { content?: string; timezone?: string }): Promise<UserProfile> {
    const updateSet: Record<string, string> = {};
    if (fields.content !== undefined) updateSet.content = fields.content;
    if (fields.timezone !== undefined) updateSet.timezone = fields.timezone;

    return this.db
      .insertInto('user_profile')
      .values({
        id: 1,
        content: fields.content ?? '',
        timezone: fields.timezone ?? 'UTC',
      })
      .onConflict((oc) => oc.column('id').doUpdateSet(updateSet))
      .returningAll()
      .executeTakeFirstOrThrow();
  }
}
