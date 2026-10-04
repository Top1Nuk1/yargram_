# Yargram — семантика состояний, знаки, админка

## Аккаунты и состояния

- **Блокировка** (как в Telegram): заблокированный пишет, но до блокирующего не доходит (ни сокет, ни
  история); блокирующий писать не может, звонки закрыты. Направления разделены (`blockedByMe` /
  `blockedByPeer`); после разблокировки старое не приходит.
- **Удалённый** — мягкое (`isDeleted`): почта и ник заняты, возврат `POST /api/admin/:id/restore`,
  403 `ACCOUNT_DELETED`; история и файлы живут, автор — заглушка.
  **Замороженный** — входит и читает, не пишет (`assertAuthorWritable`; сокет рвём только удалённому).
  Это **разные состояния**, не путать.
- 🔥 **`lastSeenAt` в хранилище — истина** (`lastSeenAt ?? createdAt`), обновляется при **каждом**
  обращении к API (`updateLastSeen`); правило `showLastSeen` живёт только в `toPublicUser`. Иначе
  `showLastSeen` вернул бы заглушку.
- **Дружба** — `friendIds` (взаимный) + `outgoing`/`incomingFriendRequestIds`; встречная заявка
  принимается сама. `FriendshipState = none|outgoing|incoming|friends`, `GET /users/:id` → `friendship`.
- **Поиск людей ≠ lookup админки.** `GET /users[?q=]` — подстрока по юзернеймам/алиасам, **исключает
  ищущего**; админка — `POST /api/admin/lookup` → `findByHandle()` (точный матч, себя не исключает).

## 🔥 Знаки владельца

- **SCAM / FAKE** — подмена описания на чтении (`toPublicUser`, `groupDescriptionFor`). Могут стоять
  разом; в описании побеждает SCAM (`scam ? … : fake ? … : bio`, так же у группы). Описание блокируется
  при **любой** отметке (`bioLocked`/`scamGuard`). Фразы: «**часто** жаловались» / «**выдаёт себя за
  официальный**»; клиент переводит по началу (`translateScamWarning`) — 🔥 групповую FAKE проверять
  **раньше** аккаунтной. SCAM красный, FAKE янтарный, латиницей.
- **Знаки группы** — владелец выдаёт галочку/значок/SCAM/FAKE группе; описание не редактируется, пока
  стоит отметка; со сменой владельца **не переезжают**. 🔥 Цепочка: `Conversation` →
  `UpdateConversationInput` → Zod `conversationSchema` → `update` **обоих** репозиториев →
  `AdminGroupView`/`AdminGroupMarksInput` → Zod ручки → `groupView` → `chatService` → `AdminGroup` в
  клиентских `types.ts`.
- **Знак «Yargram»** — `isApp` ставит только владелец (`POST /admin/:id/app`), затем аккаунт **сам**
  ставит/снимает `badge` (`POST /app/badge`, иначе 403 `NOT_APP`); снятие `isApp` снимает значок.
  🔥 Овнер значок автоматически НЕ получает.
- **Овнеров двое**: `Top1Nuk1`, `vaskaime_0001`. `node scripts/set-owner.mjs <ник> on|off` — по
  основному и доп. нику, значок не трогает; список — `list-owners.mjs`.

## Админка

- **Сводка** — `GET /api/admin/stats` → `{ stats: { totalUsers, groups } }`, только владелец.
  `totalUsers` — **все** записи `users` (удаление мягкое); `groups` — только `type="group"`; считают
  `UserRepository.count()` / `ConversationRepository.countGroups()`.
- **Список аккаунтов** — `GET /api/admin/accounts?q=&filter=&marks=&scope=` (владелец, лимит 200, свежие
  сверху). Удалённый/замороженный — настоящим ником и аватаром. **Три слоя:**
  - `filter`: `active` — ни удалён, ни заморожен; `frozen` **исключает** удалённых;
  - `marks` (И): `verified | badge | scam | fake | owner`; `badge` — ровно `"yargram"`;
  - `scope`: `name`, `handle` (все ники), `any` (имя+ники+почта).
  Строка: `isOwner`, `createdAt`, `deletedAt`, `lastSeenAt` (**никогда не null**, у старых =
  `createdAt`) — истинный даже при `showLastSeen:false`.
  Клиент: плитка «Аккаунтов» → `AccountList`, ник до 10 знаков, юзернеймы — первые 2 + «ещё N».
  🔥 Строка — `div role="button"`, не `<button>`.
- Админ-панель — окно `features/admin/AdminPanel.tsx`.

## Темы, оформление, прочее

- **Темы, фон, баннер, картинки Yargram, ссылки оформления** — `memory/themes.md` (сервер о темах не
  знает; картинок 8 цветов × 3 вида × 2 палитры, источник правды — `lib/yargramImages.ts`).
- **Прочее**: GIF только в баннере; опрос — `PollSettings.deadline` ISO (7 пресетов, «Навсегда» =
  `null`); юзернейм занят и основной, и любой доп.; день рождения без года (`MM-DD`); группы —
  `groupRoleFor` / `groupCan()`, мьют `null` = бессрочно; лимиты загрузки avatar 10 / image 20 /
  file 100 / banner 50 / wallpaper 50 МиБ (`upload-service.ts`); тик 15 с; вход — 30 попыток / 15 мин;
  `--brand: 51 144 236`.
