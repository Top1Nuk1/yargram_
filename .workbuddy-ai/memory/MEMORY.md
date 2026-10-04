# Yargram — заметки о проекте

`0.1.0` (в UI «0.1.0 ЗБТ»; `package.json` не bump'аем). Док-я: `Функции Yargram.txt`, `ТЗ 0.2 —
Обновление Communication.txt`, `docs/API.md`, `docs/DEPLOY.md`. Сервер поднимает пользователь
(`Запустить Yargram.bat`). Перед коммитом `npm run verify` (typecheck + lint + test), затем
`npm run build`. Очередь: каналы → Web Push → устройства.

**Всё остальное вынесено в файлы** (читать при работе с темой вопроса):
архитектура/шифрование/запуск/сборка и **полный список граблей** — `memory/arch.md`;
темы, фон, баннер, картинки Yargram, ссылки оформления — `memory/themes.md`;
**лендинг и разводка двух сайтов** — `memory/landing.md`;
**семантика состояний, знаки владельца, админка** — `memory/semantics.md`;
почта — `memory/mail.md`; сеансы — `memory/sessions.md`; разборы и дневники — `memory/ДАТА.md`.

## 🔥 Хранилище (проверять ПЕРВЫМ делом)

Боевое — **PostgreSQL**: `.env` `DATABASE_DRIVER=postgres`, URL в `runtime/postgres/database.env`,
кластер `127.0.0.1:55432` (поднимает лаунчер). `apps/server/data/yargram.json` — **устаревший слепок,
никто не читает**. Схема: `id`, `payload` jsonb + генерируемые колонки `users.email_key`
(= `lower(payload->>'email')`, уникальная), `users.username_key`, `conversations.member_ids`
(`@> to_jsonb($1)`), `attachments.owner_id`, `drafts.user_id`, `messages.conversation_id`.
⚠️ Колонки `created_at` **НЕТ** → сортировать по `payload->>'createdAt'`. Миграции не нужны.
🔥 **JSON-драйвер валидирует записи Zod-схемой** (`storage/json-database.ts`) и **молча вырезает**
незнакомые поля: новое поле надо добавлять и туда, иначе оно «работает» и пропадает после чтения
(симптом — `400 VALIDATION_ERROR` при чтении истории). На Postgres этого нет (jsonb как есть).

## 🔥 Бот поддержки

Служебный аккаунт `@YargramSupport_Bot` (`isBot`, значок Yargram, вход закрыт → `403 BOT_ACCOUNT`;
в поиске/блокировке/жалобе не участвует). Меню кнопками (`Message.keyboard`), нажатие уходит
`POST /api/support/actions` кодом, а не сообщением. Обращение пересылается в **служебную группу**
(`Conversation.isSupportInbox`, вне поиска и статистики); ответ владельца **на сообщение бота**
возвращается человеку как «Ответ от <имя>» — адресат берётся из `Message.supportTicket`. Код:
`services/support-bot-service.ts`, `services/support-bot-texts.ts` (тексты русские, на сервере),
`ChatService.sendBotMessage`. Заводится `npm run bot:create`. Подробности — `2026-10-04.md`.

## 🔥 Доступ, копии, почта

- **Друг** заходит по HTTP `http://26.53.76.128:3000` (Radmin VPN); HTTPS `:3443` — только для звонков.
  **CORS пропускает любой публичный домен** (`isOriginAllowed` сравнивает hostname `Origin` с `Host`)
  → туннель работает без правок `.env`. `TRUST_PROXY` по умолчанию **false** и правильно:
  `X-Forwarded-For` подделывается, а по адресу работает ограничитель входа.
- **Копии** — `scripts/backup.mjs`: раз в сутки (лаунчер, шаг `[4/4]`) + кнопка `Сделать копию
  Yargram.bat` + `npm run backup`. Старше **7 дней** удаляются сами. 🔥 `pg_dump` нет → дамп логический;
  вложения — дополняемое зеркало `runtime/backups/uploads`. Рядом `КЛЮЧ.txt` (`DB_ENCRYPTION_KEY`) —
  без него копия нечитаема. ⚠️ Копии **на том же диске**, что данные: от ошибки и порчи базы спасают,
  **от смерти диска — нет**. Подробности — `arch.md`.
- **Почта** — `mail.accounts` (`yargram.support@gmail.com`, `yarikgram@gmail.com`). 🔥 Два разных
  отказа: **ящик отказал** — письмо уходит со следующего **в том же запросе**; **ящик принял, письмо не
  дошло** (спам) — **повтор** идёт со следующего ящика. Подробности — `mail.md`.
- ⚠️ `app.ts`: `upgrade-insecure-requests: null` в CSP включено **намеренно** — на публичном HTTPS это
  ослабление; пересмотреть при своих доменах.
- **Своя база умеет Linux** → VPS без замены БД. 🔥 **`runtime/` в `.gitignore`** → на чистом сервере
  `ensure-postgres.mjs` молча пропускается: нужен ручной `node scripts/local-postgres.mjs` при первом
  развёртывании. 🔥 `embedded-postgres` — **в `dependencies`** (был в dev): иначе `--omit=dev`
  оставил бы сервер без базы.
- 🔥 **Перенос на другой сервер: `DB_ENCRYPTION_KEY` переносить, не генерировать** (импорт кладёт
  `payload` как есть, без перешифровки; с новым ключом всё переедет, но не прочитается). Источник
  данных — копия `runtime/backups/<stamp>/database.json`, не `data/yargram.json`.
- 🔥 **У проекта нет `git remote`** — код на сервер уедет только после коммита и пуша.
- **Хостинг выбран — Raven Host, бесплатный apps-тариф** (03.10.2026, до этого
  рассматривался Oracle Cloud Always Free): адрес **`https://yargram.app.ravenhost.space`**
  (лендинг на `/`, приложение на `/app`). 🔥 Следствия выбора: **нет UDP → звонков не будет**;
  **нет PostgreSQL → `DATABASE_DRIVER=json`**; свой домен не привязать (нужен VPS $3.99/мес).
  Инструкция — `docs/ИНСТРУКЦИЯ_RAVEN.md`. Про Oracle (на случай возврата) — `docs/DEPLOY.md`:
  ARM 2 OCPU / 12 ГБ, 🔥 простаивающий инстанс могут забрать (7 дней, всё < 20 %), PAYG не
  отменяет; порты — в Security List **и** в `iptables` (`ufw` не перебивает).

## 🔥 Два сайта: лендинг и приложение

**`/`** — лендинг `apps/landing` (`@yargram/landing`, свой Vite/Tailwind, порт dev **5174**);
**`/app`** — приложение `apps/web` (`base: env.VITE_BASE || '/app/'` — иначе белый экран). 🔥 Порядок
маршрутов в Express — порядок разбора: `app.get("/app", …)` стоит **до** `app.use("/app",
express.static(…))`, иначе 301 на `/app/`. Без лендинга корень отдаёт приложение. 🔥 Знак Yargram —
**V на круге**, не Y (`components/Logo.tsx` по `logo-plate.svg`). 🔥 Тема лендинга — свои CSS-переменные
(`data-theme` на `<html>`), в Tailwind цвета **через `rgb(var(--…))`**. Код разводки, тесты, снимки,
грабли — **`memory/landing.md`**.

## Клиент и локализация

Мультиаккаунт (`lib/accounts.ts`), `MessengerScreen` с `key={token}`. **Предел аккаунтов** —
`accountLimit()`/`canAddAccount()`: 3 обычному, 4 с `badge`/`isVerified`, `Infinity` владельцу
(проверка только в `AppSidebar` — правило интерфейса, не защита). **Масштаб** 50–300 % —
`lib/uiScale.ts` (`zoom` на `<html>`, не `transform`), применяется в `main.tsx` до первого кадра.

`apps/web/src/lib/i18n.ts`: ключи `namespace.name`, `define(key,{ru,en,bg,uk,be,el?})`, хуки
`useLanguage()`/`useTranslation()`; язык — `localStorage['yargram.lang']`. **`uk` и `be` обязательны**
(иначе протечёт русский); `el` падает на `en`. 🔧 Скилл `yargram-i18n` (`uk`/`be` сгенерированы, **не
вычитаны носителем**). `t` мемоизирован — **немемоизированный переводчик даёт цикл эффектов**.
🔥 **Даты/числа переводит `Intl`** (локаль — `LANGUAGE_LOCALES`): в `lib/format.ts` два форматтера
захардкожены на `ru-RU`, `formatShortDate(value, locale?)` берёт локаль параметром;
`formatDayLabel`/`formatConversationTime` — **ещё нет**. 🔒 Приватность — только `showLastSeen`.

## Оговорки

- Защита от копирования текста SCAM — **не сокрытие** (видно во вкладке «Сеть»). Предел аккаунтов —
  правило интерфейса. `el` падает на `en`. `PeerProfileModal` в `MessengerModals.tsx` — мёртвый код.
- Остальные грабли (тихие Zod-фильтры, невакуозность, `<button>` в `<button>`, `<fieldset>`,
  `.bat`/`.ps1`, `SAFE_DELETE_BULK_CONFIRM_REQUIRED` при сборке) — в `memory/arch.md`, «Грабли».
- **Готовность к ЗБТ (разбор 03.10.2026)** — в `memory/2026-10-03.md`. Кратко: блокеры сняты (копии
  есть, инструкция честная); на 3–7 друзей можно открываться. Остаются риски: копия на том же диске,
  почта — единая точка отказа входа, Web Push нет.
