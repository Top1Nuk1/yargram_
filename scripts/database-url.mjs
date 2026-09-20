import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const environmentFile = join(projectRoot, '.env');
const connectionFile = join(projectRoot, 'runtime', 'postgres', 'connection.json');

function parseEnvironment(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

/**
 * Administrative scripts must never keep a database password in the repository.
 * The connection string is read from the environment, then from the project
 * .env file, and finally from the local PostgreSQL connection file.
 */
export async function readDatabaseUrl() {
  const fromEnvironment = process.env.DATABASE_URL?.trim();
  if (fromEnvironment) return fromEnvironment;

  if (existsSync(environmentFile)) {
    const values = parseEnvironment(await readFile(environmentFile, 'utf8'));
    const configured = values.DATABASE_URL?.trim();
    if (configured) return configured;
  }

  if (existsSync(connectionFile)) {
    const connection = JSON.parse(await readFile(connectionFile, 'utf8'));
    const user = connection.user ?? 'yargram';
    const password = encodeURIComponent(connection.password ?? '');
    const port = connection.port ?? 55432;
    const database = connection.database ?? 'yargram';
    return `postgresql://${user}:${password}@127.0.0.1:${port}/${database}`;
  }

  throw new Error(
    'DATABASE_URL не найден. Запустите npm.cmd run db:local или задайте DATABASE_URL в .env.',
  );
}
