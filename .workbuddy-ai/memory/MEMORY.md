# Yargram — заметки о проекте

`0.0.1` (в UI «0.0.1 ЗБТ»; `package.json` не bump'аем). Док-я: `Функции Yargram.txt`, `ТЗ 0.2`, `docs/DEPLOY.md`. Сервер поднимает пользователь (`Запустить Yargram.bat`).
Перед коммитом `npm run verify`, затем `npm run build` (если падает на
`SAFE_DELETE_BULK_CONFIRM_REQUIRED` — перенести `apps/*/dist` в `runtime/`).
Очередь: каналы → Web Push → устройства.

**Боевой адрес — `https://yargram.site`** (свой домен на Raven, прокси Cloudflare).
HTTPS заканчивает Cloudflare, поэтому режим SSL/TLS обязан быть **Flexible**,
а `FORCE_HTTPS` в приложении — **false** (иначе цикл редиректов). Симптом ошибки:
502 на домене при живом origin → сравнить `http://147.124.213.50/` и
`https://147.124.213.50/` с `-H "Host: yargram.site"`.

**Тематические файлы** (читать по теме): архитектура, сборка, хостинг, хранилище, **все
грабли** — `arch.md`; стикеры, гифки, бот поддержки, клиент, локализация — `features.md`;
темы/фон/баннер — `themes.md`; лендинг — `landing.md`; состояния, знаки, админка — `semantics.md`;
почта — `mail.md`; сеансы — `sessions.md`; разборы — `ДАТА.md`.

## 🔥 Хранилище (проверять ПЕРВЫМ делом)

Боевое — **PostgreSQL**: `DATABASE_DRIVER=postgres`, URL в `runtime/postgres/database.env`,
кластер `127.0.0.1:55432` (поднимает лаунчер). `data/yargram.json` — устаревший слепок, никто не читает.
Колонки `created_at` **НЕТ** → сортировать по `payload->>'createdAt'`.
🔥 `direct_key` — **частичный** уникальный индекс (`WHERE direct_key <> ''`), в `ON CONFLICT`
повторять условие. 🔥 **JSON-драйвер валидирует Zod-схемой и молча вырезает незнакомые поля** —
новое поле добавлять и в `storage/json-database.ts`, иначе пропадает (400).

## 🔥 Ошибки сервера (оба исправлены 07.10.2026)

**«An unexpected server error occurred»** — две независимые причины. (1) percent-код в пути:
Express бросает `URIError` (400), старый `errorHandler` шёл в 500 → лечено в `lib/errors.ts`
(4xx отдаются своим кодом). (2) 500 на `/conversations`/`/favorites`/`/support`:
legacy-строки без `stickerIds` → `stickerIds.length` в `toMessageSnapshot` →
лечено нормализацией в `postgres-repositories.ts::select` (JSON спасал Zod),
регрессия — `postgres.test.ts`. Свипы `runtime/bug500/` + трассировка in-process. Разбор — `2026-10-07.md`.

## 🔥 Частые грабли (подробно — `arch.md`)

- Стенд: `NODE_ENV=production` обязателен; с дефолтными секретами не стартует; `dotenv` ищет `.env`
  от cwd (запускать из корня). `tsc -p tsconfig.json` у веба пуст — нужен `-p tsconfig.app.json`,
  у сервера ещё `-p tsconfig.test.json`.
- Новый знак аккаунта — **три места**: `toPublicUser`, `Participant`, `participantUser`
  (иначе не доезжает — `features.md`).
- `runtime/` и `dist/` в `.gitignore`; **remote `github.com/Yargram/yargram` есть, но ~118 файлов
  не закоммичено**; `npm run build` у агента рвётся на `SAFE_DELETE_BULK_CONFIRM_REQUIRED`
  (перенести папку); `DB_ENCRYPTION_KEY` при переносе — **переносить, не генерировать**.
- **Хостинг — Raven Host** (`yargram.app.ravenhost.space`): **владелец подтвердил звонки — UDP
  есть**, PostgreSQL тоже (пока `DATABASE_DRIVER=json`); свой домен нельзя; **08.10 — 502**;
  CSP `upgrade-insecure-requests: null` намеренно. Друг и Oracle — `arch.md`.
  🔥 **Панель = Pterodactyl**: SFTP `/` = корень сервера (команды `cd ~`, не `cd ~/yargram`);
  панель прокидывает `SERVER_PORT` (важнее `PORT` — слушать его, иначе 502);
  `TRUST_PROXY=true`, а не `loopback` (за wings-прокси иначе общий лимит входа на всех);
  переписку на json можно перенести через `scripts/backup-to-json.mjs` (копия → живой формат).
- 🔥 **ОПРОВЕРГНУТО 12.10.2026: свой домен на Raven РАБОТАЕТ.** `yargram.site` уже
  направлен на Raven (NS = Cloudflare, A = `147.124.213.50`), и nginx Raven имеет
  для него отдельный vhost (отдаёт `502`, а не общий `301`) → домен привязан в панели.
  Утверждение «свой домен нельзя» из доков Raven устарело. Тогда же: **приложение
  было ВЫКЛЮЧЕНО** (порт 19378 refused) — все 502 из-за этого, а не из-за домена.
  Разбор и команды проверки — `2026-10-12.md`.
- 🔥 **Прокси Cloudflare включён → HTTPS 502.** Причина: режим SSL/TLS **Full**
  стучится на origin:443, а он отдаёт **502 ЛЮБОМУ хосту** (даже родному
  поддомену Raven!) — TLS на origin не работает вообще, дело не в нашем домене.
  Поэтому рабочий режим тут только **Flexible** + «Always Use HTTPS».
  Наш `FORCE_HTTPS` при этом обязан остаться **false** — в Flexible Cloudflare
  всегда ходит по HTTP и включённый редирект зацикливает сайт. Вход не сломается:
  токен идёт заголовком `Bearer`, cookie в проекте нет. Проверка — `npm run check:host`.
  Разбор — `docs/ИНСТРУКЦИЯ_RAVEN.md`.
- **PWA-установка готова** (12.10): `useInstallPrompt` + `InstallScreen` +
  раздел в настройках; манифест и `sw.js` были и раньше.
- **Автонастройка Cloudflare и РФ (13.10):** `Настроить Cloudflare.bat` (скрипт `scripts/setup-cloudflare.mjs`, `npm run cf:setup`). Отключает ECH (`settings/ech: off`, снимая блокировку ТСПУ в РФ без VPN/запретов), отключает `http3` (QUIC), включает `min_tls_version: 1.2`, `websockets: on`, `ssl: flexible`, `always_use_https: on`, `brotli: on`, `early_hints: on`. Токен хранится локально в `runtime/cloudflare.token` (.gitignore).

## Оговорки

SCAM — защита от копирования, не сокрытие; предел аккаунтов — правило интерфейса; `el` → `en`.
Готовность к ЗБТ — `2026-10-03.md`: блокеры сняты; риски — копия на диске, почта — единая точка
входа, нет Web Push.
