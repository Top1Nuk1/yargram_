import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
const root = fileURLToPath(new URL('../', import.meta.url));
const envPath = fileURLToPath(new URL('../.env', import.meta.url));
const text = await readFile(envPath, 'utf8');
const previous = dotenv.parse(text);
const local = dotenv.parse(await readFile(new URL('../runtime/postgres/database.env', import.meta.url), 'utf8'));
async function listening(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port: Number(port) });
    const done = (value) => { socket.destroy(); resolve(value); };
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.setTimeout(1000, () => done(false));
  });
}
for (const port of new Set([previous.PORT || '3000', previous.HTTPS_PORT || '3443'])) {
  if (port !== '0' && await listening(port)) throw new Error(`Stop Yargram on port ${port} before migration.`);
}
if (previous.DATABASE_URL || previous.DATABASE_DRIVER === 'postgres') {
  throw new Error('A PostgreSQL configuration already exists; refusing to replace it.');
}
const status = await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ['--import', 'tsx', 'apps/server/src/migrate-json.ts'], {
    cwd: root, stdio: 'inherit', env: { ...process.env, ...previous, ...local },
  });
  child.once('error', reject);
  child.once('exit', resolve);
});
if (status !== 0) throw new Error('Import failed; .env was not changed.');
const backup = `${envPath}.backup-${Date.now()}`;
await copyFile(envPath, backup, constants.COPYFILE_EXCL);
const clean = text.split(/\r?\n/).filter((line) => !/^\s*DATABASE_(?:DRIVER|URL)\s*=/.test(line)).join('\n').trimEnd();
await writeFile(envPath, `${clean}\nDATABASE_DRIVER=postgres\nDATABASE_URL=${local.DATABASE_URL}\n`);
console.log('Local PostgreSQL enabled in .env. Original configuration backed up. Start Yargram normally.');
