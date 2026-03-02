import { Kysely, Migrator } from 'kysely';
import type { DB } from './types.js';
import * as m0001 from './migrations/0001_initial.js';
import * as m0002 from './migrations/0002_threads_job_run_id.js';
import * as m0003 from './migrations/0003_job_skills.js';
import * as m0004 from './migrations/0004_nullable_job_schedule.js';
import * as m0005 from './migrations/0005_job_notify.js';
import * as m0006 from './migrations/0006_thread_archive.js';

export interface MigrationResult {
  migrationName: string;
  status: 'Success' | 'Error' | 'NotExecuted';
}

export async function runMigrations(db: Kysely<DB>): Promise<MigrationResult[]> {
  const migrator = new Migrator({
    db,
    provider: {
      async getMigrations() {
        return {
          '0001_initial': m0001,
          '0002_threads_job_run_id': m0002,
          '0003_job_skills': m0003,
          '0004_nullable_job_schedule': m0004,
          '0005_job_notify': m0005,
          '0006_thread_archive': m0006,
        };
      },
    },
  });

  const { error, results } = await migrator.migrateToLatest();

  if (error) {
    throw error;
  }

  return results ?? [];
}
