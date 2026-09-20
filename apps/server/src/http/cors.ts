import type { Request } from "express";
import type { CorsOptions, CorsOptionsDelegate } from "cors";

function normalizeHostname(host: string | undefined): string | undefined {
  if (!host) return undefined;
  if (host.startsWith("[")) return host.slice(1, host.indexOf("]"));
  return host.split(":")[0]?.toLowerCase();
}

function isLocalOrPrivateHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  if (normalized === "localhost" || normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") {
    return true;
  }

  const octets = normalized.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false;
  }

  const [first, second] = octets as [number, number, number, number];
  return (
    first === 127 ||
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 100 && second >= 64 && second <= 127)
  );
}

function parseOrigin(origin: string): URL | null {
  try {
    const parsed = new URL(origin);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed : null;
  } catch {
    return null;
  }
}

export function isOriginAllowed(
  origin: string | undefined,
  allowedOrigins: readonly string[],
  requestHost?: string,
): boolean {
  if (!origin) return true;
  const normalizedOrigin = origin.replace(/\/$/, "");
  if (allowedOrigins.includes(normalizedOrigin)) return true;

  const parsed = parseOrigin(origin);
  if (!parsed) return false;
  const hostname = parsed.hostname.toLowerCase();
  if (isLocalOrPrivateHostname(hostname)) return true;

  const currentHostname = normalizeHostname(requestHost);
  if (currentHostname !== undefined && hostname === currentHostname) return true;

  return allowedOrigins.some((candidate) => parseOrigin(candidate)?.hostname.toLowerCase() === hostname);
}

export function createCorsOptions(
  allowedOrigins: readonly string[],
): CorsOptionsDelegate<Request> {
  return (request, callback) => {
    const origin = request.header("Origin");
    const allowed = isOriginAllowed(origin, allowedOrigins, request.header("Host"));
    const options: CorsOptions = {
      origin: allowed,
      credentials: true,
      methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Authorization", "Content-Type"],
    };
    callback(null, options);
  };
}

export function createSocketCorsOptions(allowedOrigins: readonly string[]) {
  return {
    credentials: true,
    origin(origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) {
      if (isOriginAllowed(origin, allowedOrigins)) {
        callback(null, true);
      } else {
        callback(new Error("Origin is not allowed"));
      }
    },
  };
}
