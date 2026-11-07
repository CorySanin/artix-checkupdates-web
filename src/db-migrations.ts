import { type Database } from 'better-sqlite3';

export const TABLE = 'packages';

export function migrate(db: Database) {
    const migrations: string[][] = [
        [`CREATE TABLE IF NOT EXISTS ${TABLE} (package VARCHAR(128) PRIMARY KEY, maintainer VARCHAR(128), move INTEGER, udate INTEGER, lastseen DATETIME);`],
        [`ALTER TABLE ${TABLE} ADD COLUMN artixonly INTEGER DEFAULT 0`],
    ];

    const version = (db.pragma('user_version') as { 'user_version': number }[])[0]?.user_version ?? 0;
    const migrationsTodo = migrations.slice(version);
    const runMigration = db.transaction((migrations: string[]) => {
        migrations.forEach(m => db.exec(m));
    });
    migrationsTodo.forEach((m, i) => {
        console.log(`Running DB migration ${i}`);
        runMigration(m);
    });
    db.pragma(`user_version=${migrations.length}`);
}
