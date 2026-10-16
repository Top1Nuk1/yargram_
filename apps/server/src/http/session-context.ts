import type { Request } from "express";
import { describeUserAgent, siteFrom, type SessionContext } from "../lib/session-context.js";

/** Сайт и браузер запроса — по ним заводим (или узнаём) сеанс. */
export function sessionContext(request: Request): SessionContext {
  const rawDeviceId = request.get("x-device-id")?.trim();
  const rawDeviceName = request.get("x-device-name")?.trim();
  let customDeviceName: string | undefined = undefined;
  if (rawDeviceName) {
    try {
      customDeviceName = decodeURIComponent(rawDeviceName).trim() || undefined;
    } catch {
      customDeviceName = rawDeviceName;
    }
  }

  return {
    site: siteFrom(request.get("origin"), request.get("referer"), request.get("host"), request.protocol),
    device: describeUserAgent(request.get("user-agent")),
    ...(rawDeviceId ? { deviceId: rawDeviceId } : {}),
    ...(customDeviceName ? { customDeviceName } : {}),
  };
}
