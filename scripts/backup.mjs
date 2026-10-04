#!/usr/bin/env node
/**
 * Резервная копия Yargram: база и вложения.
 *
 * Зачем. Вся переписка друзей лежит в одном месте — в PostgreSQL на этом
 * компьютере, а фотографии и файлы рядом, в папке загрузок. Один сбой диска или
 * неудачный эксперимент со схемой — и восстанавливать нечего. Поэтому раз в
 * сутки делается копия, а копии старше недели удаляются сами.
 *
 * Что попадает в копию:
 *   runtime/backups/uploads/       — зеркало вложений, докачивается по новым файлам
 *   runtime/backups/<дата>_<время>/database.json — все таблицы целиком
 *   runtime/backups/<дата>_<время>/README.txt    — как восстановить
 *   runtime/backups/<дата>_<время>/КЛЮЧ.txt      — ключ шифрования (см. ниже)
 *   runtime/backups/backup.log                   — журнал всех запусков
 *
 * 🔥 Про `pg_dump`. Его в проекте нет: встроенная PostgreSQL (`embedded-postgres`)
 * поставляется только с `initdb`, `pg_ctl` и `postgres`. Поэтому дамп
 * **логический**: таблицы читаются через `pg` и складываются в JSON. Схема к
 * этому готова — в каждой таблице лежит `id` и `payload` jsonb, а всё остальное
 * (генерируемые колонки и индексы) база построит сама при восстановлении.
 *
 * 🔥 Про ключ шифрования. Тексты сообщений и файлы лежат на диске зашифрованными
 * (AES-256-GCM, ключ `DB_ENCRYPTION_KEY` из `.env`). Без ключа копия бесполезна —
 * из неё не прочитать ни строчки. Поэтому ключ кладётся рядом с копией, в файл
 * `КЛЮЧ.txt`. Если копия уезжает в облако или на чужой носитель — уберите этот
 * файл и сохраните ключ отдельно, иначе шифрование теряет смысл.
 *
 * Запуск:
 *   node scripts/backup.mjs              — сделать копию, если последней больше суток
 *   node scripts/backup.mjs --force      — сделать прямо сейчас
 *   node scripts/backup.mjs --status     — что уже есть и что будет удалено
 *   node scripts/backup.mjs --restore runtime/backups/2026-10-03_0215
 *   node scripts/backup.mjs --dry-run    — показать, что было бы сделано
 *   node scripts/backup.mjs --quiet      — ничего на экран, только в журнал (лаунчер)
 */
import { appendFileSync, existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const backupsDir = join(root, 'runtime', 'backups');
const uploadsMirrorDir = join(backupsDir, 'uploads');
const envPath = join(root, '.env');
/** Журнал: сюда попадает каждый запуск, даже когда окна у скрипта нет. */
const logPath = join(backupsDir, 'backup.log');

/** Сколько дней живут копии. Неделя — как просил владелец проекта. */
const KEEP_DAYS = 7;
/** Чаще, чем раз в сутки, копию не делаем: лаунчер зовёт скрипт при каждом старте. */
const MIN_INTERVAL_HOURS = 24;
/** Имя папки копии: `2026-10-03_0215`. */
const STAMP_PATTERN = /^\d{4}-\d{2}-\d{2}_\d{4}$/;

/**
 * 🔥 Зачем свой журнал, а не перенаправление из PowerShell. Лаунчер запускает
 * копию в фоне, а `Start-Process -RedirectStandardOutput` в Windows PowerShell
 * 5.1 падает с «Элемент уже добавлен. Ключ в словаре: "Path"» — стоит в
 * окружении оказаться и `Path`, и `PATH`. Поэтому вывод пишет сам скрипт, а
 * лаунчеру перенаправлять нечего.
 *
 * `quiet` — для фонового запуска: на экран ничего, только в журнал.
 */
let quiet = false;

/** Пишет строку в журнал и (если не `--quiet`) на экран. */
function report(line = '') {
  if (!quiet) console.log(line);
  try {
    appendFileSync(logPath, `${line}\n`);
  } catch {
    // Журнал — удобство, а не смысл работы: не сломать бы из-за него копию.
  }
}

/** То же, что `report()`, но на экран — в поток ошибок (и тоже в журнал). */
function reportError(line = '') {
  if (!quiet) console.error(line);
  try {
    appendFileSync(logPath, `${line}\n`);
  } catch {
    // см. report()
  }
}

/** Заголовок запуска: по нему в журнале видно, где кончается прошлый прогон. */
function startLogRun(command) {
  try {
    appendFileSync(
      logPath,
      `\n===== ${new Date().toLocaleString('ru-RU')} — ${command} =====\n`,
    );
  } catch {
    // Папку создаёт main() до этого вызова; сюда попадаем только если её нет прав.
  }
}

/** Разбирает ключи командной строки. */
function parseArgs(argv) {
  const restoreAt = argv.indexOf('--restore');
  return {
    force: argv.includes('--force'),
    status: argv.includes('--status'),
    dryRun: argv.includes('--dry-run'),
    quiet: argv.includes('--quiet'),
    restore: restoreAt >= 0 ? argv[restoreAt + 1] : null,
  };
}

/**
 * Настройки берём из `.env` напрямую, а не из собранного сервера: копию надо
 * уметь снять и без `npm run build`. Так же читает базу `use-local-postgres.mjs`.
 */
async function loadSettings() {
  const own = existsSync(envPath) ? dotenv.parse(await readFile(envPath, 'utf8')) : {};
  // Переменная окружения важнее файла — так же разрешает адрес и сам сервер
  // (dotenv не перебивает уже заданное окружение). Нужно, чтобы прогнать
  // восстановление в отдельную базу, не трогая боевую.
  let databaseUrl = process.env.DATABASE_URL ?? own.DATABASE_URL ?? '';
  if (!databaseUrl) {
    const localPath = join(root, 'runtime', 'postgres', 'database.env');
    if (existsSync(localPath)) {
      databaseUrl = dotenv.parse(await readFile(localPath, 'utf8')).DATABASE_URL ?? '';
    }
  }
  if (!databaseUrl) {
    throw new Error(
      'Не нашёл DATABASE_URL ни в .env, ни в runtime/postgres/database.env.\n' +
        'Если база ещё на JSON-драйвере, копировать нужно apps/server/data/yargram.json — тогда скрипт не нужен.',
    );
  }
  const dataDir = own.DATA_DIR ? resolve(root, own.DATA_DIR) : join(root, 'apps', 'server', 'data');
  return { databaseUrl, dataDir, encryptionKey: own.DB_ENCRYPTION_KEY ?? '' };
}

/** Список таблиц берём у самой базы: так он не разъедется со схемой. */
async function listTables(client) {
  const { rows } = await client.query(
    `select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
      order by table_name`,
  );
  return rows.map((row) => row.table_name);
}

/**
 * Читает все таблицы одной транзакцией `repeatable read`.
 *
 * 🔥 Иначе копия получится рваной: пока читаем `messages`, сервер успеет
 * записать новое сообщение, и в копии окажется сообщение без беседы.
 */
async function dumpDatabase(client) {
  const tables = await listTables(client);
  const dump = {};
  let rows = 0;

  await client.query('begin isolation level repeatable read read only');
  try {
    for (const table of tables) {
      // `sequence` — порядок вставки; восстанавливаем в том же порядке, чтобы
      // он остался прежним.
      const result = await client.query(`select id, payload from ${quote(table)} order by sequence`);
      dump[table] = result.rows;
      rows += result.rows.length;
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  }

  return { tables, dump, rows };
}

/** Имя таблицы в кавычках: в проекте они простые, но подставлять сырое нельзя. */
function quote(identifier) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

/** Сколько байт занимает папка: по копии нужно понимать, растёт она или нет. */
async function directorySize(path) {
  if (!existsSync(path)) return 0;
  let total = 0;
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const full = join(path, entry.name);
    total += entry.isDirectory() ? await directorySize(full) : (await stat(full)).size;
  }
  return total;
}

/**
 * Докачивает вложения в зеркало.
 *
 * Копируем не всю папку заново (это под две сотни мегабайт каждый день), а
 * только те файлы, которых в зеркале ещё нет или которые изменились. Поэтому у
 * вложений одно общее зеркало, а не копия в каждой папке с датой.
 *
 * 🔥 Зеркало только дополняется: файл, удалённый в приложении, в нём остаётся.
 * Для восстановления это верно — иначе вернулись бы сообщения без картинок, —
 * но знать об этом надо: «удалить навсегда» копию не трогает.
 */
async function mirrorUploads(sourceDir, targetDir, { dryRun }) {
  const result = { copied: 0, skipped: 0, bytes: 0, missing: !existsSync(sourceDir) };
  if (result.missing) return result;

  const walk = async (current) => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const from = join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(from);
        continue;
      }
      const to = join(targetDir, relative(sourceDir, from));
      const size = (await stat(from)).size;
      const already = existsSync(to) && (await stat(to)).size === size;
      if (already) {
        result.skipped += 1;
        continue;
      }
      result.copied += 1;
      result.bytes += size;
      if (dryRun) continue;
      await mkdir(dirname(to), { recursive: true });
      await copyFile(from, to);
    }
  };

  await walk(sourceDir);
  return result;
}

/** Папки с датой, свежие первыми. */
async function listBackups() {
  if (!existsSync(backupsDir)) return [];
  const entries = await readdir(backupsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && STAMP_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .reverse();
}

/** Возраст копии в часах: по нему решаем, пора ли делать новую. */
async function ageInHours(stamp) {
  const [date, time] = stamp.split('_');
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.match(/\d{2}/g).map(Number);
  const created = new Date(year, month - 1, day, hour, minute);
  return (Date.now() - created.getTime()) / 3_600_000;
}

/** Удаляет копии старше недели. Возвращает имена удалённых папок. */
async function rotate({ dryRun }) {
  const removed = [];
  for (const stamp of await listBackups()) {
    if ((await ageInHours(stamp)) <= KEEP_DAYS * 24) continue;
    removed.push(stamp);
    if (!dryRun) await rm(join(backupsDir, stamp), { recursive: true, force: true });
  }
  return removed;
}

/** Читаемый размер: в мегабайтах с одним знаком. */
function megabytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

function stampNow() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
}

const README = (stamp, tables, rows) => `Резервная копия Yargram — ${stamp}

Что здесь лежит
  database.json — все таблицы базы целиком (${tables.length} шт., ${rows} записей)
  КЛЮЧ.txt      — ключ шифрования, без которого данные не прочитать

Вложения (фотографии и файлы) лежат не здесь, а в общей папке
  runtime/backups/uploads
Она одна на все копии и только дополняется: файлы копируются по одному разу, а
не заново каждый день. Удалённые в приложении файлы в ней остаются — так
восстановленная переписка не останется без картинок.

Как восстановить
  1. Остановите Yargram (закройте окно сервера).
  2. Убедитесь, что база поднята: она стартует вместе с «Запустить Yargram.bat».
  3. Запустите:
       node scripts/backup.mjs --restore runtime/backups/${stamp}
     Скрипт очистит таблицы и зальёт данные из копии. Спрашивать подтверждение
     он не будет — это восстановление, а не просмотр.
  4. Верните вложения: скопируйте содержимое runtime/backups/uploads в
     apps/server/data/uploads
  5. Сверьте КЛЮЧ.txt с DB_ENCRYPTION_KEY в .env. Если ключи разные, тексты
     сообщений прочитаются как «yargram1:…» — верните прежний ключ.

Что важно знать
  • Ключ шифрования менять нельзя: данные, записанные старым ключом, новым не
    читаются. Поэтому копия и хранит его рядом.
  • Файл КЛЮЧ.txt — секрет. Если копия уезжает в облако или на чужой носитель,
    удалите его и сохраните ключ отдельно.
  • Копии старше ${KEEP_DAYS} дней удаляются автоматически при следующем запуске.
`;

/** Основной проход: снять копию. */
async function makeBackup(settings, { dryRun }) {
  const client = new pg.Client({ connectionString: settings.databaseUrl, connectionTimeoutMillis: 10_000 });
  await client.connect();
  let dump;
  try {
    dump = await dumpDatabase(client);
  } finally {
    await client.end();
  }

  const stamp = stampNow();
  const folder = join(backupsDir, stamp);

  report(`Таблиц: ${dump.tables.length}, записей: ${dump.rows}`);
  report(`Вложения: ${join(settings.dataDir, 'uploads')}`);

  const uploads = await mirrorUploads(join(settings.dataDir, 'uploads'), uploadsMirrorDir, { dryRun });
  if (uploads.missing) {
    report('  папки вложений нет — пропускаю');
  } else {
    report(
      `  новых файлов: ${uploads.copied} (${megabytes(uploads.bytes)}), уже было: ${uploads.skipped}`,
    );
  }

  if (dryRun) {
    report(`\n[пробный прогон] копия легла бы в ${folder}`);
  } else {
    // Имя папки — минута. Если кнопку нажали дважды подряд, второй запуск
    // попадает в ту же папку: обновляем её, а не плодим копии-близнецы.
    if (existsSync(folder)) {
      report(`Копия за эту минуту уже есть — обновляю её (${stamp}).`);
    }
    await mkdir(folder, { recursive: true });
    await writeFile(
      join(folder, 'database.json'),
      JSON.stringify(
        { format: 'yargram-backup/1', createdAt: new Date().toISOString(), tables: dump.dump },
        null,
        2,
      ),
      'utf8',
    );
    await writeFile(join(folder, 'README.txt'), README(stamp, dump.tables, dump.rows), 'utf8');
    if (settings.encryptionKey) {
      await writeFile(
        join(folder, 'КЛЮЧ.txt'),
        [
          'DB_ENCRYPTION_KEY — ключ шифрования данных Yargram.',
          'Без него тексты сообщений и файлы из этой копии не прочитать.',
          '',
          'Секрет: не выкладывайте этот файл вместе с копией в облако или на',
          'чужой носитель. Сохраните ключ отдельно, а файл уберите.',
          '',
          settings.encryptionKey,
          '',
        ].join('\n'),
        'utf8',
      );
    }
    const size = await directorySize(folder);
    report(`Копия готова: ${folder} (${megabytes(size)})`);
  }

  const removed = await rotate({ dryRun });
  if (removed.length > 0) {
    report(`Удалил старые копии (старше ${KEEP_DAYS} дней): ${removed.join(', ')}`);
  }
}

/** Восстановление: чистит таблицы и заливает данные из копии. */
async function restoreBackup(settings, folderArgument) {
  const folder = resolve(root, folderArgument);
  const file = join(folder, 'database.json');
  if (!existsSync(file)) {
    throw new Error(`Не нашёл ${file}`);
  }

  const parsed = JSON.parse(await readFile(file, 'utf8'));
  if (parsed.format !== 'yargram-backup/1') {
    throw new Error(`Неизвестный формат копии: ${parsed.format ?? 'нет поля format'}`);
  }

  const client = new pg.Client({ connectionString: settings.databaseUrl, connectionTimeoutMillis: 10_000 });
  await client.connect();
  try {
    const existing = new Set(await listTables(client));
    let restored = 0;
    await client.query('begin');
    for (const [table, rows] of Object.entries(parsed.tables)) {
      if (!existing.has(table)) {
        report(`  таблицы ${table} в базе нет — пропускаю`);
        continue;
      }
      // `truncate` заодно сбрасывает счётчик `sequence`, поэтому порядок записей
      // восстановится таким же, каким был.
      await client.query(`truncate table ${quote(table)} restart identity`);
      for (const row of rows) {
        await client.query(`insert into ${quote(table)} (payload) values ($1::jsonb)`, [
          JSON.stringify(row.payload),
        ]);
      }
      restored += rows.length;
      report(`  ${table}: ${rows.length}`);
    }
    await client.query('commit');
    report(`\nВосстановлено записей: ${restored}`);
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }

  report('');
  report('Не забудьте про вложения:');
  report(`  скопируйте ${join(backupsDir, 'uploads')} в ${join(settings.dataDir, 'uploads')}`);
  report('и сверьте КЛЮЧ.txt с DB_ENCRYPTION_KEY в .env.');
}

/** Показывает состояние, ничего не меняя. */
async function showStatus(settings) {
  const backups = await listBackups();
  report(`Папка копий: ${backupsDir}`);
  report(`Храним ${KEEP_DAYS} дней, делаем не чаще раза в ${MIN_INTERVAL_HOURS} ч.`);
  report('');

  if (backups.length === 0) {
    report('Копий нет.');
  } else {
    for (const stamp of backups) {
      const hours = await ageInHours(stamp);
      const size = await directorySize(join(backupsDir, stamp));
      report(`  ${stamp}  ${megabytes(size).padStart(9)}  ${Math.round(hours)} ч назад`);
    }
    const newest = backups[0];
    const age = await ageInHours(newest);
    report('');
    report(
      age >= MIN_INTERVAL_HOURS
        ? `Пора делать новую: последней ${Math.round(age)} ч.`
        : `Следующая будет нужна через ${Math.round(MIN_INTERVAL_HOURS - age)} ч.`,
    );
  }

  const stale = [];
  for (const stamp of backups) {
    if ((await ageInHours(stamp)) > KEEP_DAYS * 24) stale.push(stamp);
  }
  if (stale.length > 0) report(`Удалятся при следующем запуске: ${stale.join(', ')}`);

  const mirror = await directorySize(uploadsMirrorDir);
  const source = await directorySize(join(settings.dataDir, 'uploads'));
  report('');
  report(`Вложения: в зеркале ${megabytes(mirror)}, в приложении ${megabytes(source)}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  quiet = args.quiet;
  // Папка нужна до первой записи в журнал: в фоновом запуске её может ещё не быть.
  await mkdir(backupsDir, { recursive: true });
  startLogRun(
    args.status
      ? '--status'
      : args.restore
        ? `--restore ${args.restore}`
        : args.force
          ? '--force'
          : args.dryRun
            ? '--dry-run'
            : 'обычный запуск',
  );
  const settings = await loadSettings();

  if (args.status) {
    await showStatus(settings);
    return;
  }

  if (args.restore) {
    await restoreBackup(settings, args.restore);
    return;
  }

  // Лаунчер зовёт скрипт при каждом запуске, а копия нужна раз в сутки —
  // поэтому без `--force` сначала смотрим на возраст последней.
  if (!args.force) {
    const [newest] = await listBackups();
    if (newest && (await ageInHours(newest)) < MIN_INTERVAL_HOURS) {
      report(
        `Свежая копия уже есть: ${newest}. Пропускаю (нужна принудительно — --force).`,
      );
      return;
    }
  }

  await makeBackup(settings, { dryRun: args.dryRun });
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  reportError(`Не получилось: ${message}`);
  // Самая частая причина — Yargram (а с ним и база) не запущен: скрипт стучится
  // в PostgreSQL, а её никто не поднял. Говорим об этом прямо, иначе владелец
  // видит лишь ECONNREFUSED и не понимает, что делать.
  if (/ECONNREFUSED|connect ETIMEDOUT|Connection terminated|timeout expired/i.test(message)) {
    reportError('');
    reportError('Похоже, база данных не запущена. Резервная копия читает её напрямую.');
    reportError('Запустите «Запустить Yargram.bat» и не закрывайте окно сервера —');
    reportError('после этого повторите копирование.');
  }
  process.exitCode = 1;
}
