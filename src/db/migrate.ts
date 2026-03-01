import 'dotenv/config';
import { createDb } from './client.js';
import { runMigrations } from './migrator.js';

async function main() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        console.error('DATABASE_URL is required');
        process.exit(1);
    }

    const db = createDb(connectionString);

    try {
        const results = await runMigrations(db);

        for (const r of results) {
            if (r.status === 'Success') {
                console.log(`Migration "${r.migrationName}" applied successfully`);
            } else if (r.status === 'Error') {
                console.error(`Migration "${r.migrationName}" failed`);
            }
        }
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    } finally {
        await db.destroy();
    }
}

main();
