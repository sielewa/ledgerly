import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { config } from '../config';

// Single source of DB settings, used both by the app (Nest) and by the TypeORM CLI (migrations).
// We write SQL by hand (raw queries, explicit locks), so there are no entities and no `synchronize`.
export const dataSource = new DataSource({
  type: 'postgres',
  url: config.databaseUrl,
  migrations: [join(__dirname, 'migrations', '*.js')],
  migrationsTableName: 'migrations',
  // Default is 'all' = every pending migration in ONE transaction. Locks are held until COMMIT, so a fast
  // migration that takes ACCESS EXCLUSIVE would keep the table locked through every later migration.
  migrationsTransactionMode: 'each',
  synchronize: false,
});
