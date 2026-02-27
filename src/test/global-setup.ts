import 'dotenv/config';
import type { TestProject } from 'vitest/node';
import pg from 'pg';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import { Kysely, PostgresDialect, FileMigrationProvider, Migrator } from 'kysely';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let adminClient: pg.Client;
let testDbName: string;

export async function setup(project: TestProject): Promise<void> {
  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl) {
    throw new Error('DATABASE_URL is required to run tests');
  }
  const parsed = new URL(baseUrl);

  testDbName = `vigil_test_${Date.now()}`;

  // Connect to the configured database to create the test database
  adminClient = new pg.Client({ connectionString: baseUrl });
  await adminClient.connect();
  await adminClient.query(`CREATE DATABASE "${testDbName}"`);

  // Build connection string for the test database
  parsed.pathname = `/${testDbName}`;
  const testUrl = parsed.toString();

  // Run migrations against the test database
  const db = new Kysely({
    dialect: new PostgresDialect({
      pool: new pg.Pool({ connectionString: testUrl }),
    }),
  });

  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.join(__dirname, '..', 'db', 'migrations'),
    }),
  });

  const { error } = await migrator.migrateToLatest();
  if (error) {
    throw new Error(`Test migration failed: ${error}`);
  }

  await db.destroy();

  project.provide('testDatabaseUrl', testUrl);
}

export async function teardown(): Promise<void> {
  // Force disconnect all connections to the test database before dropping
  await adminClient.query(`
    SELECT pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE datname = '${testDbName}' AND pid <> pg_backend_pid()
  `);
  await adminClient.query(`DROP DATABASE IF EXISTS "${testDbName}"`);
  await adminClient.end();
}

declare module 'vitest' {
  export interface ProvidedContext {
    testDatabaseUrl: string;
  }
}
