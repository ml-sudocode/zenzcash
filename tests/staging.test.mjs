import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { seedStaging } from '../tools/seed-staging.mjs';
import { sha256File } from '../tools/lib/fsio.mjs';

function fixture(path, people) {
  const result = spawnSync(resolve('server/target/debug/zforum-server'), ['report', '--db', path], {encoding:'utf8', timeout:30000});
  assert.equal(result.status, 0, result.stderr);
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA foreign_keys=ON;
    INSERT INTO releases VALUES('release','{"content":"public fixture"}',1);
    INSERT INTO published VALUES('topic','release');
    INSERT INTO current_posts VALUES('7/1',0,'source','rendition','topic');
    INSERT INTO current_posts VALUES('7/2',1,'hidden-source',NULL,'topic');
    INSERT INTO restrictions VALUES('7/2',1);
    INSERT INTO renditions VALUES('rendition','7/1','source','run','public rewrite');
    INSERT INTO historical VALUES('legacy','PRIVATE_STAGING_FIXTURE');
    UPDATE sequence SET value=42;`);
  for (let i=0; i<people; i++) {
    const id = `PRIVATE_STAGING_FIXTURE_${i}`;
    db.prepare("INSERT INTO accounts VALUES(?,?,'cat',NULL,1)").run(id,id);
    db.prepare('INSERT INTO credentials VALUES(?,?,?)').run(id,id,id);
    db.prepare('INSERT INTO sessions VALUES(?,?,?,1,9999999999)').run(id,id,id);
    db.prepare('INSERT INTO recovery VALUES(?,?)').run(id,id);
    db.prepare("INSERT INTO visits VALUES(?,'device',1,0)").run(id);
    db.prepare("INSERT INTO reading VALUES(?,'7/1',1,1)").run(id);
    db.prepare("INSERT INTO saved_topics VALUES(?,'topic')").run(id);
    db.prepare("INSERT INTO feedback VALUES(?,'7/1','rendition','head',1,1)").run(id);
    db.prepare("INSERT INTO feedback_clears VALUES(?,'7/1','emotions',2)").run(id);
    db.prepare("INSERT INTO feedback_signed_v1 VALUES(?,'7/1','rendition','head',10,3)").run(id);
    db.prepare("INSERT INTO feedback_clears_signed_v1 VALUES(?,'7/1','emotions',4)").run(id);
    db.prepare("INSERT INTO ratings VALUES(?,'7/1','new-light')").run(id);
    db.prepare("INSERT INTO moods VALUES(?,'7/1',1,5)").run(id);
    db.prepare('INSERT INTO progress_cache VALUES(?,1,1)').run(id);
  }
  db.close();
}

test('staging removes personal data while preserving content and the source, with zero, one or multiple accounts', async()=>{
  for (const people of [0,1,4]) {
    const root=mkdtempSync(join(tmpdir(),'staging-test-'));
    try {
      const source=join(root,'source.sqlite'), destination=join(root,'staging.sqlite');
      fixture(source,people);
      const hash=await sha256File(source);
      assert.deepEqual(await seedStaging(source,destination,hash),{schema:12,topics:1,posts:2,accounts:0});
      assert.equal(await sha256File(source),hash);
      assert.equal(statSync(destination).mode & 0o777,0o600);
      assert.equal(readFileSync(destination).includes(Buffer.from('PRIVATE_STAGING_FIXTURE')),false);
      const db=new DatabaseSync(destination,{readOnly:true});
      try {
        for (const table of ['accounts','credentials','sessions','recovery','visits','reading','saved_topics','feedback','feedback_clears','feedback_signed_v1','feedback_clears_signed_v1','ratings','moods','progress_cache','historical']) {
          assert.equal(db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n,0,table);
        }
        assert.equal(db.prepare('SELECT value FROM sequence').get().value,0);
        assert.equal(db.prepare('SELECT data FROM releases').get().data,'{"content":"public fixture"}');
        assert.deepEqual({...db.prepare('SELECT * FROM restrictions').get()},{post:'7/2',observed:1});
        assert.equal(db.prepare("SELECT hidden FROM current_posts WHERE post='7/2'").get().hidden,1);
        assert.equal(db.prepare('SELECT text FROM renditions').get().text,'public rewrite');
      } finally { db.close(); }
      const seededHash=await sha256File(destination);
      await assert.rejects(seedStaging(source,destination,hash),{message:`Refusing to replace existing staging database: ${destination}`});
      assert.equal(await sha256File(destination),seededHash);
      assert.equal(readdirSync(root).some(name=>name.startsWith('.staging-seed-')),false);
    } finally { rmSync(root,{recursive:true,force:true}); }
  }
});

test('staging rejects hash mismatch, unknown schema and occupied WAL files without installing a database', async()=>{
  const root=mkdtempSync(join(tmpdir(),'staging-test-'));
  try {
    const source=join(root,'source.sqlite'), destination=join(root,'staging.sqlite');
    fixture(source,1);
    await assert.rejects(seedStaging(source,destination,'0'.repeat(64)),{message:'Seed SHA-256 mismatch'});
    assert.equal(existsSync(destination),false);
    const db=new DatabaseSync(source);
    db.exec('PRAGMA user_version=10'); db.close();
    const hash=await sha256File(source);
    await assert.rejects(seedStaging(source,destination,hash),{message:'Staging seed requires schema 11 or 12; found 10'});
    assert.equal(existsSync(destination),false);
    writeFileSync(`${destination}-wal`,'occupied');
    await assert.rejects(seedStaging(source,destination,hash),{message:`Refusing to replace existing staging database: ${destination}`});
    assert.equal(readFileSync(`${destination}-wal`,'utf8'),'occupied');
    assert.equal(readdirSync(root).some(name=>name.startsWith('.staging-seed-')),false);
  } finally { rmSync(root,{recursive:true,force:true}); }
});

test('staging still sanitizes schema 11 backups before the saved-topics migration',async()=>{
  const root=mkdtempSync(join(tmpdir(),'staging-legacy-'));
  try {
    const source=join(root,'source.sqlite'),destination=join(root,'staging.sqlite');
    fixture(source,1);
    const db=new DatabaseSync(source);db.exec('DROP TABLE saved_topics; PRAGMA user_version=11');db.close();
    const hash=await sha256File(source);
    assert.deepEqual(await seedStaging(source,destination,hash),{schema:11,topics:1,posts:2,accounts:0});
    assert.equal(await sha256File(source),hash);
    assert.equal(readFileSync(destination).includes(Buffer.from('PRIVATE_STAGING_FIXTURE')),false);
  } finally { rmSync(root,{recursive:true,force:true}); }
});
