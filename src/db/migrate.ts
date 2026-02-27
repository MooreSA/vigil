import 'dotenv/config';
import {Migrator} from 'kysely';
import {createDb} from './client.js';
import * as m0001 from './migrations/0001_initial.js';
import * as m0002 from "./migrations/0002_threads_job_run_id.js"
import * as m0003 from "./migrations/0003_job_skills.js"

async function main() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        console.error('DATABASE_URL is required');
        process.exit(1);
    }

    const db = createDb(connectionString);

    const migrator = new Migrator({
        db,
        provider: {
            async getMigrations() {
                return {
                    '0001_initial': m0001,
                    '0002_threads_job_run_id': m0002,
                    '0003_job_skills': m0003,
                };
            },
        },
    });

    const {error, results} = await migrator.migrateToLatest();

    results?.forEach((it) => {
        if (it.status === 'Success') {
            console.log(`Migration "${it.migrationName}" applied successfully`);
        } else if (it.status === 'Error') {
            console.error(`Migration "${it.migrationName}" failed`);
        }
    });

    if (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }

    await db.destroy();
}

main();
