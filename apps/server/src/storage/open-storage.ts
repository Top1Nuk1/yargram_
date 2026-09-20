import type { ServerConfig } from "../config.js";
import { createJsonRepositories } from "../repositories/json-repositories.js";
import { createPostgresRepositories } from "../repositories/postgres-repositories.js";
import { JsonDatabase } from "./json-database.js";
import { PostgresDatabase } from "./postgres-database.js";

export async function openStorage(config: ServerConfig) {
  if (config.databaseDriver === "postgres") {
    const database = new PostgresDatabase(config.databaseUrl!);
    try {
      await database.initialize();
      return { repositories: createPostgresRepositories(database), close: () => database.close() };
    } catch (error) {
      await database.close();
      throw error;
    }
  }
  const database = new JsonDatabase(config.dataFile);
  await database.initialize();
  return { repositories: createJsonRepositories(database), close: async () => {} };
}
