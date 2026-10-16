import type { ErrorRequestHandler, RequestHandler } from "express";
export declare class AppError extends Error {
    readonly status: number;
    readonly code: string;
    readonly details?: unknown | undefined;
    constructor(status: number, code: string, message: string, details?: unknown | undefined);
}
export declare const asyncHandler: (handler: (...args: Parameters<RequestHandler>) => Promise<unknown>) => RequestHandler;
/**
 * Отказ для замороженного аккаунта. Текст показывается пользователю прямо
 * в интерфейсе, поэтому живёт в одном месте: его используют и middleware,
 * и сервис переписки.
 */
export declare const FROZEN_READ_ONLY_MESSAGE = "\u0410\u043A\u043A\u0430\u0443\u043D\u0442 \u0437\u0430\u043C\u043E\u0440\u043E\u0436\u0435\u043D: \u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440. \u041E\u0442\u043F\u0440\u0430\u0432\u043A\u0430 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0439, \u0437\u0432\u043E\u043D\u043A\u0438 \u0438 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B.";
export declare const notFoundHandler: RequestHandler;
export declare const errorHandler: ErrorRequestHandler;
