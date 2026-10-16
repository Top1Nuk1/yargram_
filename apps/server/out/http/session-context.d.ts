import type { Request } from "express";
import { type SessionContext } from "../lib/session-context.js";
/** Сайт и браузер запроса — по ним заводим (или узнаём) сеанс. */
export declare function sessionContext(request: Request): SessionContext;
