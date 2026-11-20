// Uses the existing hosted runner's disposable Postgres service, never Supabase.
import {randomUUID} from 'node:crypto';

export async function openN196Postgres(connectionString) {
  const controlUrl = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(controlUrl.protocol) ||
      !['localhost', '127.0.0.1'].includes(controlUrl.hostname) ||
      controlUrl.pathname !== '/lemma_test' || controlUrl.search || controlUrl.hash) {
    throw Error('N196 requires the isolated local lemma_test Postgres service');
  }
  const {default: {Client}} = await import('pg');
  const client = async url => {
    const connection = new Client({connectionString: url.toString(), statement_timeout: 15000});
    await connection.connect();
    return connection;
  };
  const control = await client(controlUrl);
  const name = 'lemma_n196_' + randomUUID().replaceAll('-', '');
  const url = new URL(controlUrl);
  url.pathname = '/' + name;
  let admin, created = false;
  try {
    await control.query('create database ' + name + ' template template0');
    created = true;
    admin = await client(url);
  } catch (error) {
    try { if (created) await control.query('drop database ' + name); } finally { await control.end(); }
    throw error;
  }
  return {
    native: true,
    exec: sql => admin.query(sql),
    query: (sql, values) => admin.query(sql, values),
    async transaction(run) {
      const c = await client(url);
      try {
        await c.query('begin');
        const output = await run(c);
        await c.query('commit');
        return output;
      } catch (error) {
        await c.query('rollback');
        throw error;
      } finally { await c.end(); }
    },
    async waitForBlockedLock(pid) {
      const end = Date.now() + 10000;
      do {
        const {rows: [row]} = await admin.query(`select exists(select 1 from pg_locks
          where locktype='advisory' and pid=$1 and not granted) as blocked`, [pid]);
        if (row.blocked) return;
        await new Promise(resolve => setTimeout(resolve, 10));
      } while (Date.now() < end);
      throw Error('N196 second backend did not wait on the operation lock');
    },
    async close() {
      try {
        await admin.end();
        await control.query('drop database ' + name);
      } finally { await control.end(); }
    },
  };
}
