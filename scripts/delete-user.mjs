import { config as loadEnv } from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../apps/server/dist/config.js';
import { openStorage } from '../apps/server/dist/storage/open-storage.js';
import { RealtimeEvents } from '../apps/server/dist/realtime/events.js';
import { AdminService } from '../apps/server/dist/services/admin-service.js';

/**
 * Удаление и возврат аккаунтов из консоли — тем же кодом, что и админка.
 *
 * Зачем не SQL, как в `set-user-account.mjs`: удаление — это не одна строка в
 * базе. `AdminService.deleteUser` стирает черновики, отложенные, заметки и
 * аватар, вычёркивает аккаунт из чужих списков дружбы, блокировок и
 * администрирования, и только потом ставит `isDeleted`. Повторить это в SQL —
 * значит завести вторую реализацию, которая со временем разъедется с первой.
 * Поэтому здесь поднимаются настоящие сервисы сервера (`apps/server/dist`),
 * и вызывается ровно тот метод, что и по кнопке в админ-панели.
 *
 * Удаление мягкое, как и в приложении: запись остаётся, почта и ник остаются
 * занятыми, аккаунт можно вернуть (`--restore`).
 *
 * Запуск:
 *   node scripts/delete-user.mjs <ник> [<ник> …]              — удалить
 *   node scripts/delete-user.mjs <ник> --restore              — вернуть
 *   node scripts/delete-user.mjs <ник> --as=vaskaime_0001     — от имени овнера
 *   node scripts/delete-user.mjs <ник> --dry-run              — только показать
 *
 * Перед запуском нужен свежий билд сервера: `npm run build`.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
loadEnv({ path: join(root, '.env') });

const args = process.argv.slice(2);
const flags = new Map();
const handles = [];
for (const arg of args) {
  const match = /^--([^=]+)(?:=(.*))?$/.exec(arg);
  if (match) flags.set(match[1].toLowerCase(), match[2] ?? '');
  else handles.push(arg.trim().replace(/^@/, '').toLowerCase());
}

const restore = flags.has('restore');
const dryRun = flags.has('dry-run');
const asHandle = (flags.get('as') ?? '').trim().replace(/^@/, '').toLowerCase();

if (flags.has('help') || flags.has('h') || handles.length === 0) {
  console.log(`Удаление и возврат аккаунтов Yargram.

  node scripts/delete-user.mjs <ник> [<ник> …]            удалить (мягко)
  node scripts/delete-user.mjs <ник> --restore            вернуть
  node scripts/delete-user.mjs <ник> --as=<овнер>         от имени овнера
  node scripts/delete-user.mjs <ник> --dry-run            ничего не менять

Ники — основные или дополнительные, регистр не важен. Без --as берётся первый
овнер из базы. Удаление мягкое: почта и ник остаются занятыми, ключ --restore
возвращает аккаунт. Нужен свежий билд: npm run build.`);
  process.exit(handles.length === 0 ? 1 : 0);
}

/** Достаёт сообщение из ошибки сервиса: AppError несёт понятный текст. */
function reasonOf(error) {
  if (error && typeof error === 'object' && 'message' in error) return String(error.message);
  return String(error);
}

async function main() {
  const config = loadConfig();
  if (config.databaseDriver !== 'postgres') {
    console.warn(`Внимание: драйвер ${config.databaseDriver}, а не postgres — правки пойдут не в боевую базу.`);
  }
  const storage = await openStorage(config);
  const adminService = new AdminService(storage.repositories, new RealtimeEvents());

  try {
    const everyone = await storage.repositories.users.list({ limit: 10_000 });
    const grantor = asHandle
      ? everyone.find((user) => user.username?.toLowerCase() === asHandle
          || (user.usernames ?? []).some((alias) => alias.toLowerCase() === asHandle))
      : everyone.find((user) => user.isOwner);
    if (!grantor) {
      console.error(asHandle ? `Овнер @${asHandle} не найден.` : 'В базе нет ни одного овнера.');
      process.exitCode = 1;
      return;
    }
    if (!grantor.isOwner) {
      console.error(`@${grantor.username} не овнер — удалять аккаунты может только он.`);
      process.exitCode = 1;
      return;
    }
    console.log(`Действуем от имени овнера @${grantor.username}.`);
    console.log(restore ? 'Режим: вернуть аккаунты.' : 'Режим: удалить аккаунты (мягко).');
    if (dryRun) console.log('Пробный прогон: ничего не меняем.');
    console.log('');

    let failed = 0;
    for (const handle of handles) {
      const target = everyone.find((user) => user.username?.toLowerCase() === handle
        || (user.usernames ?? []).some((alias) => alias.toLowerCase() === handle));
      if (!target) {
        console.error(`  @${handle}: не найден`);
        failed += 1;
        continue;
      }
      const label = `@${target.username ?? handle} (${target.email})`;
      if (dryRun) {
        console.log(`  ${label}: ${target.isDeleted ? 'уже удалён' : 'будет удалён'}`);
        continue;
      }
      try {
        if (restore) {
          await adminService.restoreUser(grantor.id, target.id);
          console.log(`  ${label}: возвращён`);
        } else {
          await adminService.deleteUser(grantor.id, target.id);
          console.log(`  ${label}: удалён`);
        }
      } catch (error) {
        console.error(`  ${label}: ${reasonOf(error)}`);
        failed += 1;
      }
    }

    console.log('');
    if (failed > 0) {
      console.log(`Готово с ошибками: не удалось обработать ${failed} из ${handles.length}.`);
      process.exitCode = 1;
    } else {
      console.log(`Готово. Обработано аккаунтов: ${handles.length}.`);
      console.log(restore
        ? 'Вернуть аккаунты обратно: node scripts/delete-user.mjs <ник>'
        : 'Вернуть удалённый аккаунт: node scripts/delete-user.mjs <ник> --restore');
    }
  } finally {
    await storage.close();
  }
}

main().catch((error) => {
  console.error('Ошибка:', reasonOf(error));
  process.exit(1);
});
