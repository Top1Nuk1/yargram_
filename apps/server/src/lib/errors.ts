import { STATUS_CODES } from "node:http";
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

export const notFoundHandler: RequestHandler = (_request, _response, next) => {
  next(new AppError(404, "NOT_FOUND", "Route not found"));
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

  // Тело запроса больше лимита парсера (express.json и подобные). Проверяем
  // после AppError: у загрузчиков свой лимит и своё понятное сообщение, и
  // раньше эта ветка съедала его, подменяя общим «Request body is too large».
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

  // 🔥 Клиентские коды, которые уже знает сама ошибка.
  //
  // Express бросает `URIError: Failed to decode param` на кривом percent-коде
  // в пути (`/api/users/%`, `/app/%E0%A4%A`) и подписывает его `status: 400`;
  // статика — `Forbidden`/`Not Found` с 403/404. Раньше такие ошибки ни одна
  // ветка не распознавала, и человек на экране читал «An unexpected server
  // error occurred», хотя сервер знал настоящий код. Ошибки с готовым 4xx
  // отдаём под этим кодом и не пишем в консоль — это не сбой.
  const clientStatus = clientErrorStatus(error);
  if (clientStatus !== undefined) {
    response.status(clientStatus).json({
      error: { code: clientErrorCode(error, clientStatus), message: clientErrorMessage(clientStatus) },
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

/** Числовой 4xx, который уже проставлен на ошибке самим Express или статикой. */
function clientErrorStatus(error: unknown): number | undefined {
  if (!(error instanceof Error)) return undefined;
  const withStatus = error as Error & { status?: unknown; statusCode?: unknown };
  for (const candidate of [withStatus.status, withStatus.statusCode]) {
    if (typeof candidate === "number" && Number.isInteger(candidate) && candidate >= 400 && candidate < 500) {
      return candidate;
    }
  }
  return undefined;
}

function clientErrorCode(error: unknown, status: number): string {
  if (error instanceof URIError) return "INVALID_URL";
  switch (status) {
    case 400:
      return "BAD_REQUEST";
    case 403:
      return "FORBIDDEN";
    case 404:
      return "NOT_FOUND";
    case 429:
      return "TOO_MANY_REQUESTS";
    default:
      return `HTTP_${status}`;
  }
}

function clientErrorMessage(status: number): string {
  // Сообщения из самой ошибки не берём: у них на входе может быть что угодно,
  // вплоть до кусков внутренних путей. Стандартная формулировка кода достаточна.
  return STATUS_CODES[status] ?? "Request failed";
}
