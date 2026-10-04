import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import bcrypt from 'bcryptjs';
import { readDatabaseUrl } from './database-url.mjs';

/**
 * Заводит служебный аккаунт бота поддержки и служебную группу владельцев.
 *
 * Зачем скриптом, а не через интерфейс: у бота нет и не должно быть входа —
 * пароль ему выдают случайный, а `AuthService.login` такие аккаунты не пускает
 * (`isBot`). Значит, зарегистрировать его обычным путём нельзя в принципе.
 *
 * Что делает:
 *   1. создаёт или обновляет аккаунт `@YargramSupport_Bot` с меткой `isBot`,
 *      значком Yargram, галочкой и полным доступом;
 *   2. создаёт служебную группу (`isSupportInbox`), куда бот пересылает
 *      обращения, — участники: бот и все владельцы Yargram.
 *
 * Идемпотентно: повторный запуск обновляет те же записи, а не плодит новые.
 *
 * Запуск (сервер при этом может быть остановлен, но кластер PostgreSQL должен
 * быть поднят — его поднимает `Запустить Yargram.bat`):
 *   node scripts/create-support-bot.mjs
 */

const BOT_USERNAME = 'YargramSupport_Bot';
const BOT_DISPLAY_NAME = 'Yargram Support';
const BOT_EMAIL = 'support@yargram.app';
const BOT_BIO =
  'Официальный бот поддержки Yargram. Через него можно сообщить об ошибке или предложить идею — обращение увидят владельцы.';
const INBOX_TITLE = 'Yargram · Поддержка';
const INBOX_DESCRIPTION =
  'Служебная группа поддержки. Сюда бот пересылает обращения, а ответ на сообщение бота уходит человеку от вашего имени.';

/** Права администратора по умолчанию: всё, кроме добавления новых админов. */
const ADMIN_DEFAULTS = {
  send_messages: true,
  send_media: true,
  send_links: true,
  send_polls: true,
  add_members: true,
  pin_messages: true,
  change_info: true,
  delete_messages: true,
  remove_members: true,
  restrict_members: true,
  manage_tags: true,
  add_admins: false,
};

const FIND_USER = `
  SELECT id, payload
  FROM users
  WHERE lower(payload->>'username') = lower($1)`;

const FIND_INBOX = `
  SELECT id, payload
  FROM conversations
  WHERE payload->>'isSupportInbox' = 'true'`;

const FIND_OWNERS = `
  SELECT id, payload->>'displayName' AS display_name
  FROM users
  WHERE payload->>'isOwner' = 'true'
    AND COALESCE(payload->>'isDeleted', 'false') <> 'true'
    AND COALESCE(payload->>'isFrozen', 'false') <> 'true'
  ORDER BY payload->>'createdAt' NULLS LAST, id`;

async function upsertBot(client) {
  const found = await client.query(FIND_USER, [BOT_USERNAME]);
  const now = new Date().toISOString();
  const fields = {
    displayName: BOT_DISPLAY_NAME,
    username: BOT_USERNAME,
    bio: BOT_BIO,
    email: BOT_EMAIL,
    // Служебные отметки: метка «бот», значок Yargram, галочка и полный доступ.
    isBot: true,
    isApp: true,
    badge: 'yargram',
    isVerified: true,
    isOwner: true,
    showLastSeen: false,
    emailVerified: true,
    // Бот никого не блокирует и не ведёт избранное — поля есть, но пустые.
    blockedUserIds: [],
    favoriteMessageIds: [],
    usernames: [],
    adminUserIds: [],
    notificationSoundEnabled: false,
  };

  if (found.rowCount === 0) {
    const id = randomUUID();
    const payload = {
      id,
      createdAt: now,
      lastSeenAt: now,
      // Пароль случайный и никому не известен: войти в бота нельзя, а хеш нужен
      // только потому, что поле обязательное в записи аккаунта.
      passwordHash: bcrypt.hashSync(randomUUID(), Number(process.env.BCRYPT_ROUNDS ?? 10)),
      ...fields,
    };
    await client.query('INSERT INTO users (payload) VALUES ($1::jsonb)', [JSON.stringify(payload)]);
    return { id, created: true };
  }

  const existing = found.rows[0];
  await client.query('UPDATE users SET payload = payload || $2::jsonb WHERE id = $1', [
    existing.id,
    JSON.stringify(fields),
  ]);
  return { id: existing.id, created: false };
}

async function upsertInbox(client, botId) {
  const owners = (await client.query(FIND_OWNERS)).rows.filter((row) => row.id !== botId);
  const memberIds = [botId, ...owners.map((owner) => owner.id)];
  const existing = (await client.query(FIND_INBOX)).rows[0];

  if (existing) {
    // Состав мог измениться: приводим участников к «бот + все владельцы».
    await client.query(
      `UPDATE conversations
         SET payload = payload || $2::jsonb
       WHERE id = $1`,
      [existing.id, JSON.stringify({ memberIds })],
    );
    return { id: existing.id, created: false, owners };
  }

  const now = new Date().toISOString();
  const payload = {
    id: randomUUID(),
    type: 'group',
    memberIds,
    // Ключ личного диалога группе не нужен, но поле обязательное.
    directKey: '',
    createdAt: now,
    updatedAt: now,
    pinnedMessageIds: [],
    archivedBy: [],
    mutedUntilBy: {},
    title: INBOX_TITLE,
    description: INBOX_DESCRIPTION,
    avatarUrl: null,
    ownerId: botId,
    adminIds: [],
    adminDefaults: ADMIN_DEFAULTS,
    // Пустой код: по ссылке-приглашению в служебную группу не попасть.
    inviteCode: '',
    permissions: {},
    restrictions: {},
    mutedMembers: {},
    leftIds: [],
    history: [],
    isSupportInbox: true,
  };
  await client.query('INSERT INTO conversations (payload) VALUES ($1::jsonb)', [JSON.stringify(payload)]);
  return { id: payload.id, created: true, owners };
}

async function main() {
  const client = new Client({ connectionString: await readDatabaseUrl() });
  await client.connect();
  try {
    const bot = await upsertBot(client);
    const inbox = await upsertInbox(client, bot.id);

    console.log(bot.created ? `Бот создан: @${BOT_USERNAME}` : `Бот обновлён: @${BOT_USERNAME}`);
    console.log(`  id: ${bot.id}`);
    console.log(
      inbox.created
        ? `Служебная группа создана: ${INBOX_TITLE}`
        : `Служебная группа обновлена: ${INBOX_TITLE}`,
    );
    console.log(`  id: ${inbox.id}`);
    console.log(
      inbox.owners.length
        ? `  владельцы в группе: ${inbox.owners.map((owner) => owner.display_name ?? owner.id).join(', ')}`
        : '  ⚠️ владельцев не найдено — группа только с ботом. Выдайте владельца и запустите скрипт снова.',
    );
    console.log('');
    console.log('Готово. Перезапустите сервер (Запустить Yargram.bat), чтобы бот заработал.');
    console.log('Проверка: в приложении «Поддержка» в меню — должна открыться переписка с ботом.');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Ошибка:', error.message);
  process.exit(1);
});
