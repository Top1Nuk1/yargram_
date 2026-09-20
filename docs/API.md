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
завершает все существующие сессии.

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
| `INTERNAL_ERROR` | 500 | Непредвиденная ошибка |

Ограничитель попыток (`authLimiter`) стоит только на `POST /api/auth/register` и `POST /api/auth/login`:
30 запросов за 15 минут на экземпляр приложения.

## REST

### Аккаунт

| Метод | Путь | Назначение |
|---|---|---|
| POST | `/api/auth/register` | Регистрация. Принимает `email`, `password`, `displayName` (или `name`), `username`. Возвращает `accessToken` и пользователя |
| POST | `/api/auth/login` | Вход по `email` и `password` |
| GET | `/api/auth/me` | Текущий аккаунт |
| PATCH | `/api/users/me` | Профиль: `displayName`, `username`, `bio`, `showLastSeen`, `themeColor`, `wallpaperUrl`, `wallpaperAttachmentId`, `notificationSoundEnabled` |
| POST | `/api/users/me/avatar` | Загрузка аватара (multipart) |
| DELETE | `/api/users/me/avatar` | Удаление аватара |

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

### Администрирование

| Метод | Путь | Назначение |
|---|---|---|
| GET | `/api/admin/users` | Пользователи, которыми управляет текущий администратор |
| POST | `/api/admin/:userId/grant` | Выдать права: `isVerified`, `isOwner`, `badge`, `usernames`, `adminUserIds` |
| PUT | `/api/admin/:userId/assign` | Назначить пользователя администратором |

Права проверяются на сервере: администратор без флага `isOwner` может управлять только закреплёнными
за ним аккаунтами, а `isOwner: true` автоматически выставляет бейдж `yargram`. Первый владелец создаётся
скриптом `scripts/grant-owner.mjs`, бейджи — `scripts/grant-badges.mjs`.

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

Допустимые эмодзи реакций: 👍 ❤️ 😂 😎 🔥 😢 😮 (константа `allowedReactionEmojis`).

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
| POST | `/api/uploads` | Загрузка (multipart). Фото до 20 МБ, файлы до 100 МБ, аватары до 10 МБ |
| GET | `/api/uploads/:uploadId` | Отдача файла по временной подписанной ссылке |

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

### Приватность статусов

`GET /api/users/:userId` и `presence:updated` возвращают `lastSeenAt` и `lastSeenStatus` только при
включённом `showLastSeen`. Скрытые значения — `recently` (до 3 дней), `within_week` (до 7),
`within_month` (до 30), `long_ago`. Точная дата и признак онлайна в публичный ответ не попадают.

## Ограничения текущей версии

- Presence и сессии звонков живут в памяти одного процесса: запуск второго экземпляра сервера их не
  синхронизирует.
- TURN не развёрнут. Звонки рассчитаны на участников одной сети Radmin VPN, медиапоток WebRTC идёт
  напрямую между браузерами.
- Внешних ключей между таблицами PostgreSQL нет, целостность связей проверяет прикладной слой.
- Внешний push (Web Push, APNs, FCM) не реализован: уведомления приходят только при открытой вкладке.
