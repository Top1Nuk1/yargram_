import 'dotenv/config';
import { Client } from 'pg';
import { readFile, open } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

async function check() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 1500 });
  try { await client.connect(); await client.query('SELECT 1'); }
  finally { await client.end(); }
}
async function main() {
  if (process.env.DATABASE_DRIVER === 'json' || !process.env.DATABASE_URL) return;
  try { await check(); console.log('PostgreSQL ready.'); return; }
  catch (error) { if (error?.code !== 'ECONNREFUSED') throw error; }
  const url = new URL(process.env.DATABASE_URL);
  const settings = JSON.parse(await readFile(new URL('../runtime/postgres/connection.json', import.meta.url), 'utf8'));
  if (url.hostname !== '127.0.0.1' || Number(url.port) !== settings.port || decodeURIComponent(url.username) !== settings.user || decodeURIComponent(url.password) !== settings.password || url.pathname !== '/yargram') {
    throw new Error('Configured PostgreSQL is unavailable. Automatic startup only supports the existing local Yargram database.');
  }
  // Redirect to a file so the database lifetime does not depend on launcher stdio.
  const log = await open(new URL('../runtime/postgres/launcher.log', import.meta.url), 'a');
  let spawnError;
  try {
    const child = spawn(process.execPath, [fileURLToPath(new URL('./local-postgres.mjs', import.meta.url))], {
      cwd: fileURLToPath(new URL('../', import.meta.url)), detached: true, windowsHide: true,
      stdio: ['ignore', log.fd, log.fd],
    });
    child.on('error', error => { spawnError = error; });
    child.unref();
  } finally { await log.close(); }
  for (let attempt = 0; attempt < 40; attempt++) {
    if (spawnError) throw spawnError;
    try { await check(); console.log('Local PostgreSQL started automatically.'); return; }
    catch { await delay(250); }
  }
  throw new Error('PostgreSQL did not become ready. See runtime/postgres/launcher.log.');
}
main().catch(error => {
  console.error('Database startup failed:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
