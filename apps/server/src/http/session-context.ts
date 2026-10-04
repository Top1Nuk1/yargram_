import type { Request } from "express";
import { describeUserAgent, siteFrom, type SessionContext } from "../lib/session-context.js";

/** Сайт и браузер запроса — по ним заводим (или узнаём) сеанс. */
export function sessionContext(request: Request): SessionContext {
  return {
    site: siteFrom(request.get("origin"), request.get("referer"), request.get("host"), request.protocol),
    device: describeUserAgent(request.get("user-agent")),
  };
}
