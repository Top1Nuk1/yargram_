import { Client } from 'pg';
import { readDatabaseUrl } from './database-url.mjs';

const client = new Client({ connectionString: await readDatabaseUrl() });
await client.connect();
const result = await client.query(`
  SELECT payload->>'displayName' AS display_name,
         payload->>'username'    AS username,
         payload->'usernames'    AS usernames,
         payload->>'isOwner'     AS is_owner,
         payload->>'badge'       AS badge,
         payload->>'isVerified'  AS is_verified,
         payload->>'isDeleted'   AS is_deleted,
         payload->>'isFrozen'    AS is_frozen
  FROM users
  WHERE payload->>'isOwner' = 'true'
`);
console.log('Владельцы в базе:');
console.log(JSON.stringify(result.rows, null, 2));
await client.end();
