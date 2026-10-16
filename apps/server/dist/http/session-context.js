import { describeUserAgent, siteFrom } from "../lib/session-context.js";
/** Сайт и браузер запроса — по ним заводим (или узнаём) сеанс. */
export function sessionContext(request) {
    const rawDeviceId = request.get("x-device-id")?.trim();
    const rawDeviceName = request.get("x-device-name")?.trim();
    let customDeviceName = undefined;
    if (rawDeviceName) {
        try {
            customDeviceName = decodeURIComponent(rawDeviceName).trim() || undefined;
        }
        catch {
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
//# sourceMappingURL=session-context.js.map