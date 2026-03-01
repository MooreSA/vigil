import type { Kysely } from 'kysely';
import type { DB } from '../db/types.js';

export interface UserProfile {
  id: number;
  content: string;
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

  async upsert(content: string): Promise<UserProfile> {
    return this.db
      .insertInto('user_profile')
      .values({ id: 1, content })
      .onConflict((oc) => oc.column('id').doUpdateSet({ content }))
      .returningAll()
      .executeTakeFirstOrThrow();
  }
}
