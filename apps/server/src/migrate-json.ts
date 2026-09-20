import "dotenv/config";
import { copyFile, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import { loadConfig } from "./config.js";
import { databaseSchema } from "./storage/json-database.js";
import { PostgresDatabase } from "./storage/postgres-database.js";
import type { DatabaseState } from "./domain/models.js";

async function main() {
  const config = loadConfig();
  if (!config.databaseUrl) throw new Error("Set DATABASE_URL before importing JSON");
  const source = resolve(process.argv[2] ?? config.dataFile);
  const state = databaseSchema.parse(JSON.parse(await readFile(source, "utf8"))) as DatabaseState;
  const backup = `${source}.backup-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  await copyFile(source, backup, constants.COPYFILE_EXCL);
  const database = new PostgresDatabase(config.databaseUrl);
  try {
    await database.initialize();
    await database.importState(state);
    console.log(`Import complete: ${state.users.length} users, ${state.conversations.length} conversations, ${state.messages.length} messages, ${state.attachments.length} attachments, ${state.favoriteNotes.length} notes, ${state.calls.length} calls.`);
    console.log(`Original JSON unchanged. Backup: ${backup}`);
    console.log("Keep DATA_DIR/uploads unchanged; uploaded files are not moved by this command.");
  } finally {
    await database.close();
  }
}
main().catch((error: unknown) => {
  console.error("JSON import failed:", error instanceof Error ? error.message : "Unknown error");
  process.exitCode = 1;
});
