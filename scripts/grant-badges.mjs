import { Client } from 'pg';
import { readDatabaseUrl } from './database-url.mjs';

/** Ники по умолчанию можно переопределить аргументами командной строки. */
const defaultNames = ['Top1Nuk1', 'monk', 'vaskaime_0001'];
const requestedNames = process.argv.slice(2).map((value) => value.trim()).filter(Boolean);
const names = requestedNames.length ? requestedNames : defaultNames;

async function grant(client, name) {
  const res = await client.query(
    "SELECT id, payload FROM users WHERE payload->>'displayName' = $1 OR payload->>'username' = $1 OR payload->>'username' = $2",
    [name, '@' + name.toLowerCase()]
  );
  for (const row of res.rows) {
    const obj = row.payload || {};
    obj.isVerified = true;
    obj.badge = 'yargram';
    if (name === 'Top1Nuk1') obj.isOwner = true;
    await client.query('UPDATE users SET payload = $1::jsonb WHERE id = $2', [JSON.stringify(obj), row.id]);
    console.log('ОБНОВЛЁН: ' + name + ' id=' + row.id + ' verified=' + obj.isVerified + ' badge=' + obj.badge + ' owner=' + (obj.isOwner ? 'true' : 'false'));
  }
  if (res.rowCount === 0) console.log('НЕ НАЙДЕН: ' + name);
}

(async () => {
  const client = new Client({ connectionString: await readDatabaseUrl() });
  await client.connect();
  try {
    for (const name of names) await grant(client, name);
  } finally {
    await client.end();
  }
})().catch((error) => {
  console.error('Ошибка:', error.message);
  process.exit(1);
});
