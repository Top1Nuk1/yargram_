import type { RequestHandler } from "express";
import type { UserRepository } from "../repositories/types.js";
import type { AuthService } from "../services/auth-service.js";
/**
 * Аутентификация плюс режим «только чтение» для замороженного аккаунта.
 *
 * Замороженного пускаем внутрь — он читает историю, — но любой небезопасный
 * метод отклоняем, кроме отметки о прочтении и «Избранного». Проверяем только
 * на записи: чтение истории не должно лишний раз ходить в базу за пользователем.
 */
export declare function createAuthMiddleware(authService: AuthService, users: UserRepository): RequestHandler;
