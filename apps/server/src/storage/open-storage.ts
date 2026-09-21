import type { ServerConfig } from "../config.js";
import { AtRestCrypto } from "../lib/crypto.js";
import { withEncryption } from "../repositories/encrypted-repositories.js";
import { createJsonRepositories } from "../repositories/json-repositories.js";
import { createPostgresRepositories } from "../repositories/postgres-repositories.js";
import { JsonDatabase } from "./json-database.js";
import { PostgresDatabase } from "./postgres-database.js";

/**
 * Открывает хранилище и сразу навешивает шифрование «в покое»: сообщения и
 * файлы лежат на диске зашифрованными, сервисы при этом работают с открытым
 * текстом. Ключ один на все данные — из DB_ENCRYPTION_KEY.
 */
export async function openStorage(config: ServerConfig) {
  const crypto = new AtRestCrypto(config.dbEncryptionKey);
  if (config.databaseDriver === "postgres") {
    const database = new PostgresDatabase(config.databaseUrl!);
    try {
      await database.initialize();
      return {
        repositories: withEncryption(createPostgresRepositories(database), crypto),
        crypto,
        close: () => database.close(),
      };
    } catch (error) {
      await database.close();
      throw error;
    }
  }
  const database = new JsonDatabase(config.dataFile);
  await database.initialize();
  return {
    repositories: withEncryption(createJsonRepositories(database), crypto),
    crypto,
    close: async () => {},
  };
}
