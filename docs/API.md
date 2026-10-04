# Yargram 0.2 — REST и Socket.IO API

Документ описывает действующий контракт сервера `apps/server`. Источник истины — код
`apps/server/src/http/routes.ts` и `apps/server/src/realtime/socket-server.ts`; при расхождении
верен код.

## Общее

- Базовый префикс REST — `/api`. Служебные проверки доступны и без префикса: `GET /health`, `GET /api/health`.
- В production один процесс Node слушает HTTP `PORT` (3000) и HTTPS `HTTPS_PORT` (3443). Один экземпляр
  Socket.IO подключён к обоим слушателям, поэтому realtime работает между обоими адресами.
- CORS ограничен списком `CORS_ORIGINS`.
- JSON-тело ограничено 1 МБ. Файлы передаются отдельным маршрутом `POST /api/uploads`.
- Заголовки безопасности ставит helmet. Директива `upgrade-insecure-requests` отключена намеренно:
  резервный HTTP-адрес должен оставаться рабочим.

### Аутентификация

Все маршруты, кроме `register`, `login` и `/health`, требуют заголовок:

```
Authorization: Bearer <accessToken>
```

Токен — JWT, выдаётся `POST /api/auth/register` и `POST /api/auth/login` в поле `accessToken`.
Срок жизни задаёт `JWT_EXPIRES_IN` (по умолчанию 7 дней), подпись — `JWT_SECRET`. Смена `JWT_SECRET`
завершает все существующие сессии. У каждого выданного токена свой `jti`, поэтому два входа подряд
дают разные токены и разные сеансы.

**Активные сеансы.** Сам токен stateless, но каждый выданный токен привязан к записи сеанса на
сервере (см. раздел «Активные сеансы»). В базе лежит только отпечаток токена —
`SHA-256` от его строки, — поэтому утечка базы не даёт готового пропуска.

Сеанс описывают два поля, и оба приходят из заголовков запроса:

- `site` — откуда вошли. Порядок: заголовок `Origin` → `Referer` → `Host` + протокол.
- `device` — браузер и система из `User-Agent` (например `Chrome, Windows`).

Повторный вход с той же пары «сайт + устройство» не заводит новый сеанс: токен добавляется в уже
существующий (один сеанс помнит до 20 отпечатков), поэтому список не пухнет от перезаходов.

Токен, выданный до появления сеансов, принимается и получает запись при первом же запросе — никого
не выкидывает обновлением.

При включённом `EMAIL_CONFIRMATION` вход и регистрация идут в два шага: `register` и `login`
токен не возвращают, а отвечают `{ "status": "code_sent", "email", "purpose", "expiresInSeconds" }`.
Токен выдаёт `POST /api/auth/confirm-code` после ввода кода из письма.

Для Socket.IO тот же токен передаётся в handshake: `io(url, { auth: { token } })`. Альтернативно
принимается заголовок `Authorization: Bearer <token>`.

### Ошибки

Единый формат:

```json
{ "error": { "code": "AUTH_REQUIRED", "message": "Bearer access token is required", "details": {} } }
```

| Код | HTTP | Когда |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Тело или параметры не прошли Zod-схему; в `details` — `flatten()` |
| `INVALID_JSON` | 400 | Тело запроса не является корректным JSON |
| `AUTH_REQUIRED` | 401 | Нет или просрочен Bearer-токен |
| `NOT_FOUND` | 404 | Маршрут или сущность не найдены |
| `PAYLOAD_TOO_LARGE` | 413 | Тело больше лимита |
| `AUTH_RATE_LIMITED` | 429 | Больше 30 попыток входа за 15 минут с одного адреса |
| `ACCOUNT_DELETED` | 403 | Аккаунт удалён владельцем: вход и запись закрыты |
| `EMAIL_TAKEN` | 409 | Почта занята другим аккаунтом |
| `EMAIL_RESERVED` | 409 | Почта осталась за удалённым или замороженным аккаунтом |
| `USERNAME_TAKEN` | 409 | Ник занят |
| `CODE_NOT_FOUND` | 400 | Действующего кода нет либо он выдан на другое назначение |
| `INVALID_CODE` | 400 | Код не совпал |
| `CODE_EXPIRED` | 400 | Срок действия кода истёк |
| `CODE_ATTEMPTS_EXCEEDED` | 429 | Больше пяти неверных попыток — код сгорел |
| `SESSION_ENDED` | 401 | Сеанс завершён владельцем или закрылся сам по сроку автозавершения |
| `SESSION_NOT_FOUND` | 404 | Сеанс не найден, уже завершён или принадлежит другому аккаунту |
| `SESSION_TOO_NEW` | 403 | Попытка завершить чужой сеанс раньше суток после собственного входа |
| `INTERNAL_ERROR` | 500 | Непредвиденная ошибка |

Ограничитель попыток (`authLimiter`) стоит только на `POST /api/auth/register` и `POST /api/auth/login`:
30 запросов за 15 минут на экземпляр приложения.

## REST

### Аккаунт

| Метод | Путь | Назначение |
|---|---|---|
| POST | `/api/auth/register` | Регистрация. Принимает `email`, `password`, `displayName` (или `name`), `username`. Возвращает `accessToken` и пользователя, а при включённом `EMAIL_CONFIRMATION` — `code_sent` |
| POST | `/api/auth/login` | Вход по `email` и `password`. При включённом `EMAIL_CONFIRMATION` возвращает `code_sent` вместо токена |
| POST | `/api/auth/confirm-code` | Код из письма: `email`, `code` (шесть цифр), `purpose` (`register`, `login`, `reset`). Возвращает `accessToken` и пользователя |
| POST | `/api/auth/resend-code` | Выслать код заново: `email`, `purpose`. Прежний код при этом сгорает |
| POST | `/api/auth/reset-password/request` | Запрос сброса: `email`. Отвечает `code_sent` и тогда, когда такой почты в базе нет |
| POST | `/api/auth/reset-password/confirm` | Сброс по коду: `email`, `code`, `password`. Возвращает `accessToken` |
| GET | `/api/auth/me` | Текущий аккаунт |
| PATCH | `/api/users/me` | Профиль: `displayName`, `username`, `bio`, `showLastSeen`, `themeColor`, `wallpaperUrl`, `wallpaperMimeType`, `bannerUrl`, `bannerColor`, `wallpaperAttachmentId`, `notificationSoundEnabled`, `birthday`, `sessionAutoTerminateDays` |
| POST | `/api/users/me/avatar` | Загрузка аватара (multipart) |
| DELETE | `/api/users/me/avatar` | Удаление аватара |

`sessionAutoTerminateDays` — через сколько дней бездействия сеанс завершается сам: целое от 1 до 365
или `null` («никогда»). Ответ всегда содержит поле: `null` означает «никогда», а не «не задано».

### Активные сеансы

| Метод | Путь | Назначение |
|---|---|---|
| GET | `/api/sessions` | Список входов в аккаунт: `sessions`, `currentSessionId`, `canTerminateOthers`, `gateUntil`, `alert`, `autoTerminateDays` |
| POST | `/api/sessions/:sessionId/acknowledge` | Подтвердить вход с нового сайта: «это был я». Возвращает обновлённый обзор |
| DELETE | `/api/sessions/:sessionId` | Завершить указанный сеанс. Свой — всегда, чужой — через сутки после своего входа |
| DELETE | `/api/sessions` | Завершить все сеансы, кроме текущего. Раньше суток отвечает `SESSION_TOO_NEW` |

Элемент `sessions`: `id`, `site`, `device`, `createdAt`, `lastSeenAt`, `current` (это сеанс, с
которого смотрят список), `newDevice` (вход с незнакомого сайта), `acknowledged` (владелец подтвердил).
`alert` — тот же элемент для неподтверждённого нового входа: клиент показывает по нему окно «Новый вход».

Отметка `newDevice` ставится только тогда, когда в аккаунте уже был живой сеанс: самый первый вход
не помечается, иначе человек увидел бы окно про собственный вход.

Завершённый сеанс не стирается, а помечается (`terminatedAt`) — иначе его токен при следующем
запросе приняли бы за новый вход. Записи о завершённых сеансах удаляются через 30 дней.

### Люди, блокировки, жалобы

| Метод | Путь | Назначение |
|---|---|---|
| GET | `/api/users` | Список пользователей |
| GET | `/api/users/search` | Поиск по `@username` без учёта регистра |
| GET | `/api/users/:userId` | Публичный профиль |
| PUT | `/api/users/:userId/block` | Заблокировать |
| DELETE | `/api/users/:userId/block` | Разблокировать |
| GET | `/api/users/me/blocked` | Список заблокированных |
| POST | `/api/users/:userId/report` | Жалоба: `reason` (`spam`, `abuse`, `fraud`, `other`) и необязательный `details` |
| POST | `/api/users/:userId/reports` | То же самое; второй путь-алиас |

Служебный аккаунт бота (`isBot`) в поиске людей не показывается, а блокировка и жалоба на него
отвечают `400 BOT_NOT_BLOCKABLE` / `400 BOT_NOT_REPORTABLE`: это не человек, а адрес поддержки.

### Поддержка

| Метод | Путь | Назначение |
|---|---|---|
| GET | `/api/support` | Открыть переписку с ботом поддержки: находит или заводит её и один раз показывает меню |
| POST | `/api/support/actions` | Нажатие кнопки бота: `conversationId` и `action` |

Бот — служебный аккаунт `@YargramSupport_Bot` с меткой `isBot`: войти в него нельзя
(`403 BOT_ACCOUNT`), рядом с именем клиент рисует плашку «бот». Кнопки меню
(`cat:error`, `cat:idea`, `cat:other`, `err:*`, `menu`, `cancel`) уходят **кодом действия**, а не
сообщением, поэтому в истории не остаётся служебных «нажатий».

Когда человек описывает проблему, бот пересылает обращение в **служебную группу** (`isSupportInbox`,
участники — бот и владельцы Yargram). Ответ владельца **на сообщение бота** возвращается человеку в
переписку как «Ответ от <имя>»: адресат находится по привязке `supportTicket` в самом сообщении.
Служебная группа не показывается в поиске групп и не входит в статистику.

Заводится бот скриптом `npm run bot:create` (`scripts/create-support-bot.mjs`) — он создаёт и
аккаунт бота, и служебную группу, идемпотентно.

### Администрирование

| Метод | Путь | Назначение |
|---|---|---|
| GET | `/api/admin/users` | Пользователи, которыми управляет текущий администратор |
| GET | `/api/admin/stats` | Сводка по установке для админ-панели: `{ stats: { totalUsers, groups } }` |
| GET | `/api/admin/accounts` | Список аккаунтов: `?q=` (ник, @юзернейм, почта), `?filter=all\|active\|frozen\|deleted`, `?marks=` (знаки через запятую), `?scope=any\|name\|handle`; в строке время создания и последнего входа |
| POST | `/api/admin/:userId/grant` | Выдать права: `isVerified`, `isOwner`, `badge`, `usernames`, `adminUserIds` |
| PUT | `/api/admin/:userId/assign` | Назначить пользователя администратором |
| POST | `/api/admin/lookup` | Точный поиск аккаунта по основному или доп. нику (себя не исключает) |
| POST | `/api/admin/:userId/freeze` | Заморозка и разморозка аккаунта |
| POST | `/api/admin/:userId/scam` | Отметка SCAM |
| POST | `/api/admin/:userId/fake` | Отметка FAKE |
| POST | `/api/admin/:userId/app` | Пометить аккаунт приложением Yargram (снятие убирает значок) |
| POST | `/api/admin/:userId/restore` | Вернуть удалённый аккаунт |
| DELETE | `/api/admin/:userId` | Мягко удалить аккаунт |
| GET | `/api/admin/groups` | Поиск групп: по названию, коду ссылки-приглашения или id |
| POST | `/api/admin/groups/:groupId/marks` | Знаки группы: `isVerified`, `badge`, `scam`, `fake` |

Права проверяются на сервере: администратор без флага `isOwner` может управлять только закреплёнными
за ним аккаунтами, а действия владельца (заморозка, знаки, удаление, сводка, группы) требуют
`isOwner` — иначе `403 NOT_OWNER`. Овнеров назначает `scripts/set-owner.mjs <ник> on|off`;
значок `yargram` овнеру автоматически **не** выдаётся — это отдельное право.

**Отметки SCAM и FAKE у группы.** Обе живут на самой группе, а не на её создателе, и обе подменяют
описание на чтении (`groupDescriptionFor`): снятие возвращает прежний текст, он не стирается.
🔥 **Обе могут стоять разом**, и тогда в описании побеждает SCAM — он строже; у названия видны оба
знака. Снятие SCAM возвращает предупреждение FAKE, а не исходное описание. Пока стоит любая из
отметок, описание группы не редактируется (название и аватар — свободно). Тексты:
`SCAM_GROUP_WARNING` («часто жаловались… мошенничеством») и `FAKE_GROUP_WARNING` («выдаёт себя за
официальную»).

**Сводка `GET /api/admin/stats`.** `totalUsers` считает **все** записи в таблице `users`, включая
удалённые и замороженные: удаление мягкое, и запись остаётся в базе, пока держит почту и ник
занятыми. `groups` считает только беседы типа `group` — личные диалоги и «Избранное» не входят.
Отдельная ручка нужна потому, что по спискам этого не узнать: `GET /users` — это поиск по подстроке
с пределом выдачи, а `GET /admin/groups` отдаёт лишь первые совпадения.

**Список аккаунтов `GET /api/admin/accounts`.** Отдаёт `{ accounts: [...] }` — свежие сверху, до 200
записей разом (список обзорный; точный поиск одного человека — `POST /admin/lookup`). В строке:
`displayName`, `username`, `usernames[]` (дополнительные ники), `avatarUrl`, знаки
(`isVerified` / `badge` / `scam` / `fake`), `isOwner`, `isFrozen`, `isDeleted`, `createdAt`,
`lastSeenAt` и `deletedAt`. Удалённый и замороженный аккаунт отдаётся **настоящим ником и аватаром**,
а не заглушкой «Удалённый аккаунт»: владелец как раз и ищет, кого удалил, по имени.

`lastSeenAt` — когда владелец последний раз заходил; **никогда не `null`** (у старых записей
хранилище подставляет `createdAt`). 🔥 Отдаётся **истинное** время, даже если аккаунт скрыл его от
других через `showLastSeen`: настройка приватности касается посторонних, админке нужен факт входа,
иначе владелец не отличит брошенный аккаунт от живого. Обновляется при каждом обращении к API
(`updateLastSeen` в middleware), поэтому запись «заходил» означает реальную активность, а не
только вход.

Отбор — **три независимых слоя**, каждый необязателен:
- `filter` — состояние: `deleted` берёт только удалённые, `frozen` — замороженные (но **не**
  удалённые: удалённый не «заморожен», это разные состояния), `active` — ни то ни другое, `all` — всё.
- `marks` — знаки через запятую (`verified`, `badge`, `scam`, `fake`, `owner`), складываются по
  **И**: `marks=verified,owner` = «овнер с галочкой». `badge` — именно значок «Yargram»
  (`badge === "yargram"`); неизвестные значения молча отбрасываются.
- `scope` — где искать `q`: `name` — только отображаемое имя, `handle` — только юзернеймы
  (основной и дополнительные), `any` — и то и другое плюс почта. Ведённый `@` срезается.

Слои комбинируются: «удалённые + SCAM» — это `filter=deleted&marks=scam`. Только владелец, иначе
`403 NOT_OWNER`.

### Диалоги и сообщения

| Метод | Путь | Назначение |
|---|---|---|
| GET | `/api/conversations` | Список диалогов с последним сообщением, счётчиком непрочитанных, архивом и мьютом |
| POST | `/api/conversations/direct` | Создать или получить личный диалог |
| POST | `/api/conversations/saved` | Диалог «Избранное» (переписка с самим собой) |
| GET | `/api/conversations/:conversationId/messages` | История с постраничной загрузкой |
| POST | `/api/conversations/:conversationId/messages` | Отправить сообщение |
| PATCH | `/api/conversations/:conversationId/messages/:messageId` | Изменить текст |
| DELETE | `/api/conversations/:conversationId/messages/:messageId` | Удалить у обоих участников |
| POST | `/api/conversations/:conversationId/read` | Отметить прочитанным |
| PATCH | `/api/conversations/:conversationId/settings` | Архив и отключение уведомлений (`mutedUntil`) |

### Реакции, закрепления, пересылка, избранное

| Метод | Путь | Назначение |
|---|---|---|
| POST | `/api/conversations/:conversationId/messages/:messageId/reactions` | Поставить или заменить реакцию |
| DELETE | `/api/conversations/:conversationId/messages/:messageId/reactions` | Убрать реакцию |
| POST | `/api/conversations/:conversationId/messages/:messageId/forward` | Переслать в другой диалог |
| PUT | `/api/conversations/:conversationId/pin` | Закрепить сообщение |
| DELETE | `/api/conversations/:conversationId/pin` | Снять закрепление |
| PUT | `/api/conversations/:conversationId/pins/:messageId` | Добавить в список закреплённых |
| DELETE | `/api/conversations/:conversationId/pins/:messageId` | Убрать из списка закреплённых |
| PUT | `/api/conversations/:conversationId/messages/:messageId/favorite` | Добавить сообщение в Избранное |
| DELETE | `/api/conversations/:conversationId/messages/:messageId/favorite` | Убрать из Избранного |
| GET | `/api/favorites` | Все избранные сообщения |

Допустимые эмодзи реакций: 👍 ❤️ 😂 😎 🔥 😢 😮 🍓 🍷 (константа `allowedReactionEmojis`).

### Заметки, черновики, папки, отложенные сообщения

| Метод | Путь | Назначение |
|---|---|---|
| GET | `/api/favorites/notes` | Текстовые заметки пользователя |
| POST | `/api/favorites/notes` | Создать заметку |
| PUT | `/api/favorites/notes/:noteId` | Изменить заметку |
| DELETE | `/api/favorites/notes/:noteId` | Удалить заметку |
| GET | `/api/drafts` | Черновики |
| PUT | `/api/drafts/:conversationId` | Сохранить черновик (текст, вложения, ответ) |
| DELETE | `/api/drafts/:conversationId` | Удалить черновик |
| GET | `/api/folders` | Папки чатов |
| POST | `/api/folders` | Создать папку |
| PATCH | `/api/folders/:folderId` | Изменить папку |
| DELETE | `/api/folders/:folderId` | Удалить папку |
| GET | `/api/scheduled` | Очередь отложенных сообщений пользователя |
| POST | `/api/conversations/:conversationId/scheduled` | Запланировать отправку |
| PATCH | `/api/scheduled/:scheduledId` | Изменить запланированное |
| DELETE | `/api/scheduled/:scheduledId` | Отменить |

Правила планировщика: время отправки не раньше чем через 5 секунд и не дальше 30 дней; текст до 4000
символов, до 10 вложений. Фоновая задача просыпается каждые 15 секунд, атомарно «забирает» строку перед
отправкой (поэтому перезапуск сервера или повторный тик не приводят к двойной доставке), за один проход
обрабатывает до 20 сообщений.

### Вложения

| Метод | Путь | Назначение |
|---|---|---|
| POST | `/api/uploads` | Загрузка (multipart). `kind=image` — до 20 МБ, `kind=file` — до 100 МБ, `kind=wallpaper` — до 50 МБ |
| POST | `/api/users/me/avatar` | Аватар: до 10 МБ, GIF запрещён |
| POST | `/api/users/me/banner` | Баннер профиля: до 50 МБ, GIF разрешён, видео MP4/WebM разрешено |
| GET | `/api/uploads/:uploadId` | Отдача файла по временной подписанной ссылке |

У фона чата (`kind=wallpaper`) свой предел, а не общий с фото: фон ставят
анимированным GIF и он тянет на десятки мегабайт, тогда как предел обычного
фото в переписке — обещание интерфейса (20 МБ) и его менять нельзя.

Оформление профиля — единственное место, где принимается видео: фон
(`kind=wallpaper`) и баннер (`POST /api/users/me/banner`) могут быть роликом MP4
или WebM. Формат проверяется по подписи, а не по расширению, поэтому
переименованная картинка видео не станет; MOV (`ftypqt  `) отклоняется — его
играют не все браузеры. Такое видео отдаётся инлайном, с `Accept-Ranges`, и
играет само: по кругу, без панели управления. Тип фона хранится рядом со ссылкой
(`wallpaperMimeType` в `PATCH /api/users/me`) — по самой ссылке не видно, видео
это или картинка.

Ссылки на медиа подписываются секретом и живут `MEDIA_TOKEN_TTL_SECONDS` (по умолчанию 24 часа).
При запросе сервер заново проверяет, что аккаунт из ссылки по-прежнему владеет файлом или участвует
в диалоге, к сообщению которого файл прикреплён. Удаление сообщения отзывает доступ у собеседника.
Путь без подписи отклоняется.

## Socket.IO

### Клиент → сервер

| Событие | Назначение |
|---|---|
| `message:send` | Отправить сообщение; поддерживает подтверждение (ack) |
| `typing:start` / `typing:stop` | Статус «Печатает…» |
| `call:offer` | Начать звонок |
| `call:answer` | Принять звонок |
| `call:decline` | Отклонить звонок |
| `call:end` | Завершить звонок |
| `call:mode` | Переключение аудио ↔ видео без переподключения |
| `call:ice`, `call:ice-candidate` | Обмен ICE-кандидатами |
| `call:invite`, `call:join`, `call:join-offer`, `call:join-answer` | Подключение дополнительных участников и повторный вход |
| `disconnect` | Разрыв соединения: сервер помечает пользователя офлайн с задержкой и завершает его звонки |

### Сервер → клиент

| Событие | Назначение |
|---|---|
| `presence:updated` | Онлайн/офлайн, время последнего посещения и категория приватности |
| `typing:updated` | Кто печатает |
| `message:new`, `message:updated`, `message:deleted` | Изменения сообщений |
| `message:reaction` | Изменения реакций |
| `message:pinned`, `conversation:pins` | Закрепления |
| `messages:read` | Квитанции прочтения |
| `profile:updated` | Изменения профиля и аватара |
| `conversation:settings` | Архив и отключение уведомлений |
| `draft:updated`, `folders:updated`, `scheduled:updated` | Личные данные, приходят только владельцу |
| `call:incoming`, `call:answered`, `call:ended`, `call:mode` | Ход звонка |
| `call:invite-incoming`, `call:participant-joined`, `call:participant-left` | Участники звонка |
| `call:ice` | ICE-кандидаты |
| `call:error`, `typing:error` | Ошибки |
| `session:terminated` | Сеанс завершён: сервер отключает сокеты, привязанные к его токену |

### Приватность статусов

`GET /api/users/:userId` и `presence:updated` возвращают `lastSeenAt` и `lastSeenStatus` только при
включённом `showLastSeen`. Скрытые значения — `recently` (до 3 дней), `within_week` (до 7),
`within_month` (до 30), `long_ago`. Точная дата и признак онлайна в публичный ответ не попадают.

## Ограничения текущей версии

- Presence и сессии звонков живут в памяти одного процесса: запуск второго экземпляра сервера их не
  синхронизирует. Записи же активных сеансов хранятся в базе и переживают перезапуск.
- Устройство сеанса определяется по `User-Agent`, а сайт — по заголовкам. За прокси или при
  отключённых `Origin`/`Referer` сайт может определиться как сам сервер, а не как страница входа.
- TURN не развёрнут. Звонки рассчитаны на участников одной сети Radmin VPN, медиапоток WebRTC идёт
  напрямую между браузерами.
- Внешних ключей между таблицами PostgreSQL нет, целостность связей проверяет прикладной слой.
- Внешний push (Web Push, APNs, FCM) не реализован: уведомления приходят только при открытой вкладке.
