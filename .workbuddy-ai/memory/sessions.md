# Yargram — активные сеансы

🔥 **У каждого токена обязан быть `jwtid`** (`randomUUID()` в `SignOptions`, `auth-service.ts`). JWT
подписывался по `sub` + время с точностью до секунды: два входа подряд дают **побайтово одинаковые**
токены — все входы выглядят одним сеансом, «новый вход» не показывается никогда. Симптом: пачка
падающих тестов сеансов, одинаковые `tokenHashes`.

Сеансы на сервере, ключ — **SHA-256 отпечаток токена** (`tokenFingerprint`,
`services/session-service.ts`), сам токен не хранится. Сеанс = пара **«сайт + устройство»** (`site` из
`origin`→`referer`→`host`, `device` из User-Agent: `describeUserAgent` в `lib/session-context.ts`,
Chrome раньше Safari).

- Повторный вход с той же пары переиспользует запись (`MAX_TOKEN_HASHES = 20`), список не дублируется.
- `newDevice` — только если живой сеанс уже был; окно `NewSessionAlert` («Это был я» → `acknowledge`,
  «Это не я» → `terminate`).
- ⏱ **Гейт 24 ч** (`SESSION_TERMINATION_GATE_MS`): чужие сеансы — только спустя сутки (403
  `SESSION_TOO_NEW`), свой — всегда. Завершённый сеанс — **тамбстоун** (не удаляется), иначе токен
  «усыновится»; sweep через 30 дней (`TOMBSTONE_TTL_MS`).
- `sessionAutoTerminateDays` на `User` (null = никогда) — по трём местам (`types.ts`, `update` обоих
  репозиториев, Zod `userSchema`); `toCurrentUser` отдаёт всегда (`?? null`).
- Ручки: `GET /api/sessions`, `POST /api/sessions/:id/acknowledge`, `DELETE /api/sessions[/:id]`.
  Ошибки `SESSION_NOT_FOUND` (404), `SESSION_TOO_NEW` (403), `SESSION_ENDED` (401). Сокеты:
  `socketTokens` + `publishSessionTerminated`.
- Клиент: `features/settings/SessionsScreen.tsx`, `NewSessionAlert.tsx`, ключи `sessions.*`.
  Тесты мокают `api/client` (иначе `api.sessions` тянет настоящий `fetch`).
