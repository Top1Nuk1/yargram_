import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const asyncHandler = (
  handler: (...args: Parameters<RequestHandler>) => Promise<unknown>,
): RequestHandler => {
  return (request, response, next) => {
    void handler(request, response, next).catch(next);
  };
};

/**
 * Отказ для замороженного аккаунта. Текст показывается пользователю прямо
 * в интерфейсе, поэтому живёт в одном месте: его используют и middleware,
 * и сервис переписки.
 */
export const FROZEN_READ_ONLY_MESSAGE =
  "Аккаунт заморожен: доступен только просмотр. Отправка сообщений, звонки и изменения недоступны.";

export const notFoundHandler: RequestHandler = (request, _response, next) => {
  next(new AppError(404, "NOT_FOUND", `Route ${request.method} ${request.path} was not found`));
};

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof ZodError) {
    response.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: error.flatten(),
      },
    });
    return;
  }

  if (
    error instanceof SyntaxError &&
    "status" in error &&
    (error as SyntaxError & { status?: number }).status === 400
  ) {
    response.status(400).json({
      error: { code: "INVALID_JSON", message: "Request body contains invalid JSON" },
    });
    return;
  }

  if (
    error instanceof Error &&
    "status" in error &&
    (error as Error & { status?: number }).status === 413
  ) {
    response.status(413).json({
      error: { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large" },
    });
    return;
  }

  if (error instanceof AppError) {
    response.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
    });
    return;
  }

  console.error(error);
  response.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected server error occurred",
    },
  });
};
