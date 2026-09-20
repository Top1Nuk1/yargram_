import { Client } from 'pg';
import { readDatabaseUrl } from './database-url.mjs';

async function main() {
  const client = new Client({ connectionString: await readDatabaseUrl() });
  await client.connect();
  const result = await client.query(`
    UPDATE users
    SET payload = payload || '{"isOwner":true,"badge":"yargram","isVerified":true}'::jsonb
    WHERE payload->>'displayName' = 'Top1Nuk1'
  `);
  await client.end();
  console.log('Овнер выдан. Обновлено строк:', result.rowCount);
}

main().catch((e) => {
  console.error('Ошибка:', e.message);
  process.exit(1);
});
