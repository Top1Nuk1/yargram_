import type { RequestHandler } from "express";
import { AppError, asyncHandler } from "../lib/errors.js";
import type { AuthService } from "../services/auth-service.js";

export function createAuthMiddleware(authService: AuthService): RequestHandler {
  return asyncHandler(async (request, _response, next) => {
    const authorization = request.header("Authorization");
    if (!authorization?.startsWith("Bearer ")) {
      throw new AppError(401, "AUTH_REQUIRED", "Bearer access token is required");
    }

    const token = authorization.slice("Bearer ".length).trim();
    if (!token) throw new AppError(401, "AUTH_REQUIRED", "Bearer access token is required");
    request.auth = { userId: await authService.authenticateToken(token) };
    next();
  });
}
