import type { Request, RequestHandler } from "express";
import { AppError, FROZEN_READ_ONLY_MESSAGE, asyncHandler } from "../lib/errors.js";
import type { UserRepository } from "../repositories/types.js";
import type { AuthService } from "../services/auth-service.js";
import { sessionContext } from "./session-context.js";

/** Безопасные методы: замороженному они разрешены всегда. */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Записи, которые замороженному всё же нужны: это часть чтения, а не общение.
 * Отметка о прочтении — его собственное состояние, «Избранное» — чат с самим собой.
 */
const FROZEN_ALLOWED_WRITES = [
  /^(?:\/api)?\/conversations\/[^/]+\/read$/,
  /^(?:\/api)?\/conversations\/saved$/,
];

function isFrozenAllowedWrite(request: Request): boolean {
  const path = (request.originalUrl || request.url).split("?")[0] ?? "";
  return FROZEN_ALLOWED_WRITES.some((pattern) => pattern.test(path));
}

/**
 * Аутентификация плюс режим «только чтение» для замороженного аккаунта.
 *
 * Замороженного пускаем внутрь — он читает историю, — но любой небезопасный
 * метод отклоняем, кроме отметки о прочтении и «Избранного». Проверяем только
 * на записи: чтение истории не должно лишний раз ходить в базу за пользователем.
 */
export function createAuthMiddleware(
  authService: AuthService,
  users: UserRepository,
): RequestHandler {
  return asyncHandler(async (request, _response, next) => {
    const authorization = request.header("Authorization");
    if (!authorization?.startsWith("Bearer ")) {
      throw new AppError(401, "AUTH_REQUIRED", "Bearer access token is required");
    }

    const token = authorization.slice("Bearer ".length).trim();
    if (!token) throw new AppError(401, "AUTH_REQUIRED", "Bearer access token is required");
    // Сайт и браузер запроса: по ним токен находит (или заводит) свой сеанс.
    const userId = await authService.authenticateToken(token, sessionContext(request));
    request.auth = { userId };

    if (!SAFE_METHODS.has(request.method) && !isFrozenAllowedWrite(request)) {
      const user = await users.findById(userId);
      if (user?.isFrozen) throw new AppError(403, "ACCOUNT_FROZEN", FROZEN_READ_ONLY_MESSAGE);
    }
    next();
  });
}
