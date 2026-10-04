import { Client } from 'pg';
import bcrypt from 'bcryptjs';
import { readDatabaseUrl } from './database-url.mjs';

/**
 * Правка аккаунта напрямую в базе — когда через интерфейс это сделать нельзя.
 *
 * Зачем: почту нельзя сменить ни в профиле, ни в админке — в `updateProfileSchema`
 * её нет, а отдельной ручки смены адреса тоже не существует. При включённом
 * `EMAIL_CONFIRMATION` код приходит именно на почту, поэтому аккаунт с
 * несуществующим адресом остаётся без входа навсегда.
 *
 * Почему в базу, а не через сервис: `AuthService` умеет только выдать код на
 * существующий адрес. Здесь мы меняем адрес и пароль в обход почты — это
 * аварийный путь для своей машины.
 *
 * Запуск:
 *   node scripts/set-user-account.mjs --list                     — все аккаунты
 *   node scripts/set-user-account.mjs <ник>                      — показать аккаунт
 *   node scripts/set-user-account.mjs <ник> --email=новый@адрес   — сменить почту
 *   node scripts/set-user-account.mjs <ник> --password=новый      — задать пароль
 *   node scripts/set-user-account.mjs <ник> --verify              — почта подтверждена
 *
 * Флаги совмещаются: `--email=... --verify` за один проход.
 *
 * ⚠️ `--password` остаётся в истории консоли. Если пароль неизвестен, а почта
 * рабочая — лучше не задавать его здесь, а воспользоваться сбросом по коду
 * («Забыли пароль?» на экране входа).
 */
const args = process.argv.slice(2);
const flags = new Map();
const positional = [];
for (const arg of args) {
  const match = /^--([^=]+)(?:=(.*))?$/.exec(arg);
  if (match) flags.set(match[1].toLowerCase(), match[2] ?? '');
  else positional.push(arg);
}

const wantHelp = flags.has('help') || flags.has('h');
const wantList = flags.has('list');
const handle = (positional[0] ?? '').trim().replace(/^@/, '').toLowerCase();
const email = flags.has('email') ? flags.get('email').trim().toLowerCase() : null;
const password = flags.has('password') ? flags.get('password') : null;
const verify = flags.has('verify');
const unverify = flags.has('unverify');

if (wantHelp || (!wantList && !handle)) {
  console.log(`Правка аккаунта Yargram напрямую в базе.

  node scripts/set-user-account.mjs --list                    все аккаунты
  node scripts/set-user-account.mjs <ник>                     показать аккаунт
  node scripts/set-user-account.mjs <ник> --email=адрес        сменить почту
  node scripts/set-user-account.mjs <ник> --password=пароль    задать пароль
  node scripts/set-user-account.mjs <ник> --verify             почта подтверждена
  node scripts/set-user-account.mjs <ник> --unverify           снять подтверждение

Ник ищется по основному и по дополнительным, регистр не важен.
После правки сервер надо перезапустить: аккаунт он читает из базы заново,
но уже открытые сессии держат старое состояние в памяти.`);
  process.exit(wantHelp ? 0 : 1);
}

/** Правила те же, что у сервера: `registerSchema` в http/routes.ts. */
function assertEmail(value) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || value.length > 254) {
    throw new Error(`Это не похоже на адрес почты: ${value}`);
  }
}
function assertPassword(value) {
  if (value.length < 8 || value.length > 72) {
    throw new Error(`Пароль должен быть от 8 до 72 символов, а в нём ${value.length}.`);
  }
}

/** Ник может быть основным или дополнительным — как в set-owner.mjs. */
const FIND_BY_HANDLE = `
  SELECT id,
         payload->>'displayName'  AS display_name,
         payload->>'username'     AS username,
         payload->>'email'        AS email,
         payload->>'emailVerified' AS email_verified,
         payload->>'isOwner'      AS is_owner,
         payload->>'isDeleted'    AS is_deleted
  FROM users
  WHERE lower(payload->>'username') = $1
     OR EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(COALESCE(payload->'usernames','[]'::jsonb)) AS alias
          WHERE lower(alias) = $1)`;

const LIST_ALL = `
  SELECT payload->>'username'     AS username,
         payload->>'displayName'  AS display_name,
         payload->>'email'        AS email,
         payload->>'emailVerified' AS email_verified,
         payload->>'isOwner'      AS is_owner,
         payload->>'isDeleted'    AS is_deleted
  FROM users
  ORDER BY payload->>'createdAt' NULLS LAST, id`;

function describe(row) {
  const marks = [
    row.is_owner === 'true' ? 'OWNER' : '',
    row.is_deleted === 'true' ? 'УДАЛЁН' : '',
    row.email_verified === 'true' ? 'почта подтверждена' : 'почта НЕ подтверждена',
  ].filter(Boolean);
  return `${(row.username ?? '—').padEnd(18)} ${(row.email ?? '—').padEnd(34)} ${marks.join(', ')}`;
}

async function main() {
  const client = new Client({ connectionString: await readDatabaseUrl() });
  await client.connect();

  if (wantList) {
    const { rows } = await client.query(LIST_ALL);
    console.log(`Аккаунтов в базе: ${rows.length}`);
    for (const row of rows) console.log('  ' + describe(row));
    await client.end();
    return;
  }

  const found = await client.query(FIND_BY_HANDLE, [handle]);
  if (found.rowCount === 0) {
    await client.end();
    console.error(`Аккаунт @${handle} не найден. Посмотреть всех: --list`);
    process.exit(1);
  }
  if (found.rowCount > 1) {
    await client.end();
    console.error(`Найдено строк: ${found.rowCount} — ник неоднозначен, ничего не меняю.`);
    process.exit(1);
  }

  const account = found.rows[0];
  console.log('Сейчас:');
  console.log('  ' + describe(account));

  const patch = {};
  if (email !== null) {
    assertEmail(email);
    patch.email = email;
    // Код, выданный на прежний адрес, после смены станет бессмысленным:
    // подтвердить им новую почту нельзя, а в базе он бы остался действующим.
    patch.emailCodeHash = null;
    patch.emailCodePurpose = null;
    patch.emailCodeExpiresAt = null;
    patch.emailCodeAttempts = 0;
  }
  if (password !== null) {
    assertPassword(password);
    const rounds = Number(process.env.BCRYPT_ROUNDS ?? 10);
    patch.passwordHash = bcrypt.hashSync(password, rounds);
  }
  if (verify) patch.emailVerified = true;
  if (unverify) patch.emailVerified = false;

  if (Object.keys(patch).length === 0) {
    await client.end();
    console.log('');
    console.log('Флагов правки нет — аккаунт только показан. Добавьте --email=…, --password=… или --verify.');
    return;
  }

  try {
    await client.query(`UPDATE users SET payload = payload || $2::jsonb WHERE id = $1`, [
      account.id,
      JSON.stringify(patch),
    ]);
  } catch (error) {
    await client.end();
    // `users_email_unique` — уникальный индекс по генерируемой колонке
    // lower(payload->>'email'), поэтому занятый адрес ловится именно так.
    if (error.code === '23505') {
      console.error(`\nПочта ${email} уже занята другим аккаунтом — в том числе удалённым.`);
      console.error('Удалённый аккаунт держит адрес за собой: сначала найдите его через --list.');
      process.exit(1);
    }
    throw error;
  }

  // Читаем обратно из базы, а не верим патчу: так видно, что записалось.
  const after = (await client.query(FIND_BY_HANDLE, [handle])).rows[0];
  await client.end();

  console.log('');
  console.log('Стало:');
  console.log('  ' + describe(after));
  console.log('');
  console.log('Готово. Перезапустите сервер (Запустить Yargram.bat), чтобы он взял новые данные.');
}

main().catch((error) => {
  console.error('Ошибка:', error.message);
  process.exit(1);
});
