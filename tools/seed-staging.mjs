import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { seedDatabase } from './seed-database.mjs';
import { sha256File } from './lib/fsio.mjs';

// Schema 11 contains historical feedback tables that are not safe to leave to
// account cascade deletion. Future schema changes require a new privacy review.
export async function seedStaging(source, destination, expectedHash) {
  if ([destination, `${destination}-wal`, `${destination}-shm`].some(existsSync)) throw new Error(`Refusing to replace existing staging database: ${destination}`);
  const directory = mkdtempSync(join(dirname(destination), '.staging-seed-'));
  const temporary = join(directory, 'sanitized.sqlite');
  try {
    const original = await seedDatabase(source, temporary, expectedHash);
    if (original.schema !== 11) throw new Error(`Staging seed requires schema 11; found ${original.schema}`);
    const db = new DatabaseSync(temporary);
    try {
      db.exec(`PRAGMA foreign_keys=ON; PRAGMA secure_delete=ON;
        BEGIN IMMEDIATE;
        DELETE FROM feedback_signed_v1;
        DELETE FROM feedback_clears_signed_v1;
        DELETE FROM historical;
        DELETE FROM accounts;
        UPDATE sequence SET value=0;
        COMMIT;
        PRAGMA wal_checkpoint(TRUNCATE);
        VACUUM;
        PRAGMA wal_checkpoint(TRUNCATE);`);
      const remaining = db.prepare(`SELECT
        (SELECT count(*) FROM accounts) + (SELECT count(*) FROM credentials) +
        (SELECT count(*) FROM sessions) + (SELECT count(*) FROM recovery) +
        (SELECT count(*) FROM visits) + (SELECT count(*) FROM reading) +
        (SELECT count(*) FROM feedback) + (SELECT count(*) FROM feedback_clears) +
        (SELECT count(*) FROM feedback_signed_v1) + (SELECT count(*) FROM feedback_clears_signed_v1) +
        (SELECT count(*) FROM ratings) + (SELECT count(*) FROM moods) +
        (SELECT count(*) FROM progress_cache) + (SELECT count(*) FROM historical) AS count`).get().count;
      if (remaining !== 0) throw new Error(`Staging seed retains ${remaining} personal records`);
    } finally { db.close(); }
    return await seedDatabase(temporary, destination, await sha256File(temporary));
  } finally { rmSync(directory, {recursive:true, force:true}); }
}

if (import.meta.main) {
  process.umask(0o077);
  const [source, destination, expectedHash, ...extra] = process.argv.slice(2);
  if (!source || !destination || !expectedHash || extra.length) throw new Error('Usage: seed-staging.mjs SOURCE DESTINATION SHA256');
  console.log(JSON.stringify(await seedStaging(source, destination, expectedHash)));
}
