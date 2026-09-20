import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { z } from "zod";

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const serverRoot = resolve(moduleDirectory, "..");

const emptyStringToUndefined = (value: unknown): unknown =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    HOST: z.string().min(1).default("0.0.0.0"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    HTTPS_PORT: z.preprocess(
      emptyStringToUndefined,
      z.coerce.number().int().min(0).max(65_535).optional(),
    ),
    TLS_PFX_PATH: z.preprocess(emptyStringToUndefined, z.string().min(1).optional()),
    TLS_PFX_PASSWORD: z.preprocess(emptyStringToUndefined, z.string().min(1).optional()),
    JWT_SECRET: z.string().min(16).default("yargram-development-secret-change-me"),
    JWT_EXPIRES_IN: z.string().min(1).default("7d"),
    BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(14).default(10),
    MEDIA_TOKEN_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(60)
      .max(30 * 24 * 60 * 60)
      .default(24 * 60 * 60),
    CORS_ORIGINS: z
      .string()
      .default("http://26.236.251.44:5173,http://localhost:5173,http://127.0.0.1:5173"),
    DATA_DIR: z.string().min(1).default(resolve(serverRoot, "data")),
    DATABASE_DRIVER: z.enum(["json", "postgres"]).optional(),
    DATABASE_URL: z.preprocess(emptyStringToUndefined, z.string().url().optional()),
  })
  .superRefine((environment, context) => {
    if (!environment.HTTPS_PORT) return;
    if (!environment.TLS_PFX_PATH) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["TLS_PFX_PATH"],
        message: "TLS_PFX_PATH is required when HTTPS_PORT is enabled",
      });
    }
    if (!environment.TLS_PFX_PASSWORD) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["TLS_PFX_PASSWORD"],
        message: "TLS_PFX_PASSWORD is required when HTTPS_PORT is enabled",
      });
    }
  });

export type ServerConfig = {
  nodeEnv: "development" | "test" | "production";
  databaseDriver: "json" | "postgres";
  databaseUrl?: string;
  host: string;
  port: number;
  httpsPort?: number;
  tlsPfxPath?: string;
  tlsPfxPassword?: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  bcryptRounds: number;
  mediaTokenTtlSeconds: number;
  corsOrigins: string[];
  dataDirectory: string;
  dataFile: string;
  uploadDirectory: string;
  webDistPath: string;
};

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): ServerConfig {
  const parsed = environmentSchema.parse(environment);
  if (
    parsed.NODE_ENV === "production" &&
    parsed.JWT_SECRET === "yargram-development-secret-change-me"
  ) {
    throw new Error("JWT_SECRET must be changed before starting in production");
  }
  if (parsed.HTTPS_PORT && parsed.HTTPS_PORT === parsed.PORT) {
    throw new Error("HTTPS_PORT must be different from PORT");
  }

  const databaseDriver = parsed.DATABASE_DRIVER ?? (parsed.DATABASE_URL ? "postgres" : "json");
  if (databaseDriver === "postgres" && !parsed.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for PostgreSQL");
  }
  if (parsed.DATABASE_URL && !/^postgres(?:ql)?:\/\//.test(parsed.DATABASE_URL)) {
    throw new Error("DATABASE_URL must use postgres:// or postgresql://");
  }

  return {
    databaseDriver,
    ...(parsed.DATABASE_URL ? { databaseUrl: parsed.DATABASE_URL } : {}),
    nodeEnv: parsed.NODE_ENV,
    host: parsed.HOST,
    port: parsed.PORT,
    ...(parsed.HTTPS_PORT
      ? {
          httpsPort: parsed.HTTPS_PORT,
          tlsPfxPath: resolve(parsed.TLS_PFX_PATH as string),
          tlsPfxPassword: parsed.TLS_PFX_PASSWORD as string,
        }
      : {}),
    jwtSecret: parsed.JWT_SECRET,
    jwtExpiresIn: parsed.JWT_EXPIRES_IN,
    bcryptRounds: parsed.BCRYPT_ROUNDS,
    mediaTokenTtlSeconds: parsed.MEDIA_TOKEN_TTL_SECONDS,
    corsOrigins: parsed.CORS_ORIGINS.split(",")
      .map((origin) => origin.trim().replace(/\/$/, ""))
      .filter(Boolean),
    dataDirectory: resolve(parsed.DATA_DIR),
    dataFile: resolve(parsed.DATA_DIR, "yargram.json"),
    uploadDirectory: resolve(parsed.DATA_DIR, "uploads"),
    webDistPath: resolve(serverRoot, "..", "web", "dist"),
  };
}
