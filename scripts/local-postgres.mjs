import EmbeddedPostgres from 'embedded-postgres';
import { Client } from 'pg';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { createConnection } from 'node:net';

const directory = fileURLToPath(new URL('../runtime/postgres/', import.meta.url));
const dataDirectory = join(directory, 'data');
const settingsPath = join(directory, 'connection.json');
let database;
let started = false;
let stopping = false;
const diagnostics = [];
function diagnostic(message) {
  const text = String(message ?? '').trim();
  if (text) diagnostics.push(text);
  if (diagnostics.length > 12) diagnostics.shift();
}
async function stop() {
  if (stopping || !started) return;
  stopping = true;
  await database.stop();
}
function portIsOpen(port) {
  return new Promise((resolvePort) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    const finish = (open) => { socket.destroy(); resolvePort(open); };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(1500, () => finish(false));
  });
}
async function prepareDatabase(settings) {
  const client = new Client({ host: '127.0.0.1', port: settings.port, user: settings.user,
    password: settings.password, database: 'postgres', connectionTimeoutMillis: 3000 });
  try {
    await client.connect();
    const result = await client.query('SHOW data_directory');
    const normalize = (path) => {
      const normalized = resolve(path);
      return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
    };
    if (normalize(result.rows[0].data_directory) !== normalize(dataDirectory)) {
      throw new Error('The configured port belongs to another PostgreSQL cluster. It was not changed or stopped.');
    }
    const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', ['yargram']);
    if (!existing.rowCount) await client.query('CREATE DATABASE yargram');
  } finally { await client.end(); }
  const url = `postgresql://${encodeURIComponent(settings.user)}:${encodeURIComponent(settings.password)}@127.0.0.1:${settings.port}/yargram`;
  await writeFile(join(directory, 'database.env'), `DATABASE_DRIVER=postgres\nDATABASE_URL=${url}\n`, { mode: 0o600 });
}
async function main() {
  await mkdir(directory, { recursive: true });
  let settings;
  try {
    settings = JSON.parse(await readFile(settingsPath, 'utf8'));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    settings = { user: 'yargram', password: randomBytes(32).toString('hex'), port: 55432 };
    await writeFile(settingsPath, JSON.stringify(settings), { flag: 'wx', mode: 0o600 });
  }
  if (await portIsOpen(settings.port)) {
    await prepareDatabase(settings);
    console.log(`Yargram PostgreSQL is already running on 127.0.0.1:${settings.port}. You can start Yargram now.`);
    console.log('The existing database process was not restarted or stopped.');
    return;
  }
  database = new EmbeddedPostgres({
    databaseDir: dataDirectory, ...settings, persistent: true, authMethod: 'scram-sha-256',
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    postgresFlags: ['-c', 'listen_addresses=127.0.0.1'],
    onLog: diagnostic, onError: diagnostic,
  });
  try { await readFile(join(dataDirectory, 'PG_VERSION')); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; await database.initialise(); }
  await database.start();
  started = true;
  await prepareDatabase(settings);
  console.log(`Local PostgreSQL ready on 127.0.0.1:${settings.port}. Connection saved to runtime/postgres/database.env.`);
  console.log('Keep this terminal open. Ctrl+C stops PostgreSQL without removing data.');
  const shutdown = () => { void stop().catch((error) => {
    console.error('Could not stop PostgreSQL:', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }); };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
main().catch(async (error) => {
  console.error('Local PostgreSQL failed:', error instanceof Error ? error.message : String(error ?? 'PostgreSQL did not start'));
  if (diagnostics.length) console.error(diagnostics.join('\n'));
  await stop().catch(() => {});
  process.exitCode = 1;
});
