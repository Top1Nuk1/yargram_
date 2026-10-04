# Yargram — архитектура, шифрование, запуск, окружение

## Стек

Monorepo npm workspaces: `apps/web` (React 19 + Vite 7 + Tailwind 3 + socket.io-client) и `apps/server`
(Express 4 + Socket.IO 4 + Zod + bcryptjs + jsonwebtoken). Сервер — один процесс, два слушателя
(HTTP 3000 / HTTPS 3443), один экземпляр Socket.IO на оба. Медиа — файлы в `apps/server/data/uploads`
по подписанным ссылкам (JWT, TTL 24 ч, `lib/media-links.ts`).

## Шифрование в покое (AES-256-GCM)

`lib/crypto.ts` → `AtRestCrypto`, ключ `DB_ENCRYPTION_KEY` (≥16 символов), деривация
`scryptSync(secret, "yargram-at-rest-v1", 32)`, префикс `yargram1:`. Записи без префикса читаются как
есть. **Ключ ротировать нельзя.** `encrypted-repositories.ts` → `withEncryption()` поверх
сообщений/отложенных/черновиков: поиск по тексту перебирает страницы в памяти (БД по шифротексту не
фильтрует). `UploadService` шифрует файлы при записи и расшифровывает при отдаче;
`readAuthorizedFile()` + ручной разбор `Range` ради перемотки.
⚠️ **История вида `yargram1:…` — датасет записан другим ключом.**

## Запуск и проверка (самый частый источник «ничего не работает»)

- 🔥 **После правок агента приложение надо перезапустить.** Лаунчер из сессии агента не работает
  (админ-сессия → PostgreSQL не стартует). Для своей проверки:
  `DATABASE_DRIVER=json PORT=3000 node apps/server/dist/index.js` (нужен свежий `npm run build`).
- Устаревший процесс: стукнуть по маршруту **без токена** — новый отвечает
  `404 Route … was not found`, существующий — `401 AUTH_REQUIRED`. Факт перезапуска — в
  `runtime/launch-access.log` и по PID (`netstat -ano | grep LISTENING | grep :3000`).
- Остановка по PID: `taskkill //PID <pid> //T //F`. `local-postgres.mjs` останавливать **не нужно**.
- **Отправку почты из сессии агента проверить нельзя** (SMTP заблокирован) — гоняет пользователь.

## Резервные копии (`scripts/backup.mjs`)

Раз в сутки, копии старше недели удаляются сами. Зовёт лаунчер при каждом старте (шаг `[4/4]`,
фоновым процессом) + кнопка `Сделать копию Yargram.bat` (`--force`) + `npm run backup` / `backup:status`.

- 🔥 **`pg_dump` в проекте нет.** Встроенная PostgreSQL (`embedded-postgres`) поставляет только
  `initdb`, `pg_ctl`, `postgres`. Поэтому дамп **логический**: `select id, payload from <таблица>`
  внутри `begin isolation level repeatable read read only` → `runtime/backups/<stamp>/database.json`
  (`{format:'yargram-backup/1'}`). Схема к этому готова: всё в `id` + `payload` jsonb, генерируемые
  колонки и индексы база строит сама. Восстановление: `truncate … restart identity` + `insert (payload)`.
- Вложения — **общее зеркало** `runtime/backups/uploads`, только дополняется (файл копируется, если его
  нет или размер другой). Удалённое в приложении в зеркале **остаётся** — иначе вернулись бы сообщения
  без картинок. Поэтому у вложений одно зеркало, а не копия в каждой папке с датой.
- Рядом с копией лежит `КЛЮЧ.txt` с `DB_ENCRYPTION_KEY`: без него копия нечитаема (тексты и файлы
  зашифрованы). Файл — секрет: уезжает в облако → убрать, ключ хранить отдельно.
- Настройки скрипт читает сам: `process.env.DATABASE_URL` ?? `.env` ?? `runtime/postgres/database.env`
  (поэтому копию можно снять без `npm run build`, а `--restore` прогнать в отдельную базу через env).
- ⚠️ **Журнал ведёт сам скрипт** (`runtime/backups/backup.log`, ключ `--quiet` = только в файл) —
  см. грабли про `-RedirectStandardOutput`.
- 🔥 **Перенос на другой сервер: `DB_ENCRYPTION_KEY` переносить, не генерировать.** `migrate-json.ts`
  кладёт `payload` **как есть** (`databaseSchema.parse` → `importState`), перешифровки нет. С новым
  ключом импорт пройдёт **без ошибки**, но все перенесённые тексты и файлы не прочитаются, и заметно
  это станет не сразу. Правило: `JWT_SECRET` можно новый (только сессии), `DB_ENCRYPTION_KEY` — только
  прежний (из `КЛЮЧ.txt` рядом с копией). 🔥 Источник данных для переноса — **копия**
  (`runtime/backups/<stamp>/database.json`), а не `apps/server/data/yargram.json` (устаревший слепок).
  Вложения — из `runtime/backups/uploads` в `apps/server/data/uploads`: импорт их не трогает.
- 🔥 **У проекта нет удалённого репозитория** (`git remote` пуст) → код на сервер не клонируется, пока
  его не запушить. `.env` и `runtime/` в `.gitignore` — пушить безопасно, но **сначала закоммитить**:
  иначе уедет старый код (проверять `git status --short`).
- 🔥 **`dist/` тоже в `.gitignore`** (`.gitignore:5`, `apps/web/.gitignore:2`) → собранные файлы через
  git не уезжают, `npm run build` надо выполнять **на сервере**, и при каждом обновлении кода тоже.
  🔥 Отсюда же: `npm install --omit=dev` **до** сборки — ошибка: `build` = `tsc` + `vite`, это
  dev-зависимости. Правильный порядок на диске с лимитом: `npm install --workspaces
  --include-workspace-root` → `npm run build` → `npm prune --omit=dev`.
- `DATA_DIR` по умолчанию `apps/server/data`, `dataFile` = `DATA_DIR/yargram.json`; `PORT` из env
  (по умолчанию 3000) и должен совпасть с портом, который выделил хостинг.

## Окружение и инструменты (грабли)

- **Интерактивный ввод Node на Windows:** 1) `replace` по `^КЛЮЧ=.*$` заменой-функцией (иначе хвост
  старого значения); 2) очередь строк на одном читателе stdin; 3) `setRawMode(true)` дублирует
  символы — глушить буфер флагом.
- **Скрипты к Postgres — файлом в `scripts/`** (`Write`), не heredoc и не `/tmp`: heredoc ломает
  `${...}`, извне проекта не резолвится `pg`. `jsonb && jsonb` не существует — для массивов
  `EXISTS (… jsonb_array_elements_text …)`. `pg`/`bcryptjs`/`dotenv` резолвятся из корня; модуль
  `bcrypt` — **нет**, в проекте `bcryptjs`.

## Грабли (подробный список)

- 🔥 **Новое поле — по всей цепочке**: `DatabaseState` → `repositories/types.ts` → оба репозитория →
  `storage/json-database.ts` (**Zod-схема!**) → `storage/postgres-database.ts` → `createApp` →
  `routes.ts` → сервис. Без Zod-схемы хранилище **молча** вырежет поле. Новый метод — в интерфейс и
  **оба** класса. ⚠️ Тихих фильтров **два**: `userSchema`/`conversationSchema` и `attachmentKindSchema`.
- 🔥 **Ссылки оформления (фон/баннер) — строка с подписью на 24 ч** → переподписывать при чтении
  (`refreshDecorativeUrl` в `toPublicUser`). Аватар и баннер-вложение не страдают (URL собирают заново).
- 🔥 **Не поднимать `uploadLimits.image` ради фона/баннера**: вид делят фото в переписке (обещано 20 МБ,
  `messengerUtils.ts`). У фона свой вид `wallpaper` (50 МиБ).
- `participantUser()` (`lib/conversation.ts`) собирает `User` вручную — новые флаги (`isFrozen`,
  `isDeleted`, `scam`, `fake`, `badge`, `isVerified`) пробрасывать в `types.ts` и туда; лишняя
  переменная — ошибка линта (`--max-warnings=0`).
- 🔥 **Вложенная `<button>` запрещена** → `div role="button"` + `tabIndex` + `onKeyDown`, внутренняя
  кнопка гасит всплытие.
- **`npx vitest run` из корня невалиден** — только `npm run verify` (из `apps/web`/`apps/server`).
  `apps/server/vitest.config.ts` нужен ради `testTimeout: 20_000`. ⚠️ Флейки бывают («assign and revoke
  administrator rights») — сначала перезапустить. **Невакуозность:** переименовать вызов (`api.x(` →
  `xNeutered(`), убедиться, что тесты **падают**, вернуть. `npx vitest run -t "…"` ищет ВСЕ совпадения
  по названию, а не только свой блок.
- `formatLastSeen(user, t?, now?)` — **`now` третий**. `AppError` проверять **раньше** ветки
  «`status === 413`» (`lib/errors.ts`).
- **Не бросать исключение внутри `for await` по `request`** — дочитать поток, потом бросать. **`title` у
  `<svg>` запрещён** — подсказка на `<span title="…">`; длинный текст + `truncate` — полный в `title`.
- `getByText` берёт только прямые текстовые узлы; testing-library склеивает имя без пробела.
- **`count` и `POST /api/conversations/saved`**: «Избранное» — **POST**, не GET; метод ручки смотреть в
  `routes.ts`, а не по названию в `docs/API.md`.
- **Две правки одного файла в одном сообщении теряются.** **`npx tsc … | head` маскирует код возврата**
  — `echo $?` отдельно. Временные `.mjs` в корне ломают eslint — удалять до `verify`.
- **`.bat` — только ASCII** (`chcp 65001`, `cd /d "%~dp0"`, `pause`); `.ps1` — UTF-8 **с BOM**
  (`npm run check:ps`). **Правя `.env` программно, сохранять BOM и CRLF.**
- Стенд скриншотов — скилл `yargram-screenshots`; **тесты и `npm run build` одновременно не гонять**.
  `vite build` чистит `apps/web/dist` и падает, если сервер держит файлы — повторить.
- ⚠️ **`npm run build` у агента падает на `SAFE_DELETE_BULK_CONFIRM_REQUIRED`** (в `dist` 48 картинок:
  16 фонов + 16 баннеров + 16 подложек, а песочница разрешает не больше 50 удалений за один ход).
  Лечение: `rm -rf apps/web/dist` вручную и повторить сборку. Ошибка выглядит как падение сборки, но
  **кода не касается** — не искать причину в исходниках.
- Аудит переводов (`yargram-i18n/scripts/audit.py`) ищет словарь по `../apps/web/src/lib/i18n.ts` —
  копировать в `.tmp-i18n/` **в корне** и запускать оттуда.
- 🔥 **`apps/web/tsconfig.app.json` не включает `exactOptionalPropertyTypes`** → `Partial<Props>` даёт
  `| undefined`: необязательные пропсы объявлять `prop?: T`, а не `prop: T`. `include` там только
  `src`, поэтому **`App.tsx` не типизируется** `tsc -b` (его собирает `vite build`).
- 🔥 **На обычном HTTP недоступны `crypto.randomUUID()` и `navigator.clipboard`** — нужны запасные
  пути (см. `memory/themes.md`).
- 🔥 **`<fieldset>` имеет браузерное `min-inline-size: min-content`** — поле не станет уже своего
  содержимого, поэтому широкая лента внутри (`overflow-x-auto`, галерея плиток) распирает форму до
  ширины ленты, и `overflow-x-hidden` карточки срезает её по краям («всё не ровно»). Сброс —
  `fieldset { min-inline-size: 0 }` в `index.css`, страж — `src/index.css.test.ts`. Диагноз: у
  карточки `scrollWidth` ≫ `clientWidth`, виновник ищется перебором (прятать детей по одному).
  Внутри такой формы широкое содержимое делать **сеткой**, а не лентой; картинку класть
  `absolute inset-0` (у файла своя ширина 1600 px, в потоке она задаёт плитке минимум).
- `src/vite-env.d.ts` — типы `vite/client`: без них импорт вида `./index.css?raw` не проходит
  `tsc -b` (`TS2307`).
- 🔥 **`Start-Process -RedirectStandardOutput` в Windows PowerShell 5.1 падает** с «Элемент уже
  добавлен. Ключ в словаре: "Path" Добавляемый ключ: 'PATH'» — если в окружении есть и `Path`, и
  `PATH`. Ошибка **не прерывает** вызывающий скрипт (если `$ErrorActionPreference` не `Stop`), поэтому
  выглядит как «процесс запущен, но журнал пустой»: файлы перенаправления создаются, а процесс не
  стартует. Не перенаправлять вывод — пусть процесс пишет свой журнал сам (`scripts/backup.mjs`).
  Проверять такие запуски по коду возврата и размеру файла, а не по факту «нет ошибки».
- ⚠️ **Тесты на `embedded-postgres` падают по таймауту хука `afterAll`** на забитом диске: остатки
  `/tmp/yargram-postgres-test-*` (по одному на прогон, `rm -rf` ~32 с каждый) копятся и душат IO.
  Лечение — снести остатки; после этого `tests/postgres.test.ts` проходит за 13 с.
- 🔥 **`embedded-postgres` — зависимость времени работы, а не сборки** (исправлено 03.10.2026, был в
  `devDependencies`): `scripts/local-postgres.mjs` импортирует его напрямую, а
  `scripts/ensure-postgres.mjs` (его systemd запускает через `ExecStartPre`) поднимает базу. На
  сервере `npm install --omit=dev` оставил бы приложение **без базы** — и без ошибки в установке.
  Сейчас пакет в `dependencies` `apps/server/package.json`. 🔥 Признак правильной классификации:
  пакет, который нужен **запущенному** приложению, никогда не бывает dev-зависимостью, даже если
  «используется только локально». Проверка: `node -e "console.log(require('./package-lock.json')
  .packages['apps/server'].dependencies['embedded-postgres'])"`.
