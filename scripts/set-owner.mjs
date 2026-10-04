import { Client } from 'pg';
import { readDatabaseUrl } from './database-url.mjs';

/**
 * Меняет права владельца через прямую правку базы — только для своей машины,
 * когда овнера нужно выдать себе самому и API для этого ещё нет.
 *
 * Значок «Yargram» НЕ выдаётся автоматически: это отдельное право, и решает
 * его владелец в админ-панели.
 *
 * Запуск:
 *   node scripts/set-owner.mjs vaskaime_0001 on
 *   node scripts/set-owner.mjs vaskaime_0001 off
 */
const [usernameArgument, stateArgument] = process.argv.slice(2);
const username = (usernameArgument ?? '').trim().replace(/^@/, '').toLowerCase();
const grant = (stateArgument ?? '').trim().toLowerCase();

if (!username) {
  console.error('Укажите ник: node scripts/set-owner.mjs <ник> on|off');
  process.exit(1);
}
if (grant !== 'on' && grant !== 'off') {
  console.error('Укажите состояние: on (выдать) или off (снять).');
  process.exit(1);
}

async function main() {
  const client = new Client({ connectionString: await readDatabaseUrl() });
  await client.connect();
  // Ник может быть основным или дополнительным, регистр не важен.
  const result = await client.query(
    `
    UPDATE users
    SET payload = payload || $2::jsonb
    WHERE lower(payload->>'username') = $1
       OR EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(COALESCE(payload->'usernames','[]'::jsonb)) AS alias
            WHERE lower(alias) = $1)
    RETURNING id,
              payload->>'displayName' AS display_name,
              payload->>'username' AS username,
              payload->>'isOwner' AS is_owner,
              payload->>'badge' AS badge
    `,
    [username, JSON.stringify({ isOwner: grant === 'on' })],
  );
  await client.end();

  if (result.rowCount === 0) {
    console.error(`Аккаунт @${username} не найден.`);
    process.exit(1);
  }
  if (result.rowCount !== 1) {
    console.error(`Найдено строк: ${result.rowCount} — ник неоднозначен, ничего не меняю.`);
    process.exit(1);
  }

  console.log(JSON.stringify(result.rows, null, 2));
  const row = result.rows[0];
  console.log(
    grant === 'on'
      ? `Готово: @${row.username} — владелец (значок «Yargram» выдаётся отдельно в админке).`
      : `Готово: у @${row.username} права владельца сняты.`,
  );
}

main().catch((error) => {
  console.error('Ошибка:', error.message);
  process.exit(1);
});
