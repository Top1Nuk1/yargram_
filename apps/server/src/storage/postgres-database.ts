import { Pool, type PoolClient, type PoolConfig } from "pg";
import type { DatabaseState } from "../domain/models.js";
import { databaseSchema } from "./json-database.js";

/** Entity payloads remain lossless; generated columns keep indexes in sync on every write. */
const entityTables = [
  ["users", "users"],
  ["conversations", "conversations"],
  ["messages", "messages"],
  ["attachments", "attachments"],
  ["reports", "reports"],
  ["favorite_notes", "favoriteNotes"],
  ["calls", "calls"],
  ["drafts", "drafts"],
  ["folders", "folders"],
  ["scheduled_messages", "scheduledMessages"],
  ["sessions", "sessions"],
] as const;

const columns: Record<(typeof entityTables)[number][0], string> = {
  users: `email_key text GENERATED ALWAYS AS (lower(payload->>'email')) STORED NOT NULL,
    username_key text GENERATED ALWAYS AS (lower(payload->>'username')) STORED,
    favorite_ids jsonb GENERATED ALWAYS AS (payload->'favoriteMessageIds') STORED`,
  conversations: `direct_key text GENERATED ALWAYS AS (payload->>'directKey') STORED NOT NULL,
    member_ids jsonb GENERATED ALWAYS AS (payload->'memberIds') STORED,
    invite_code text GENERATED ALWAYS AS (payload->>'inviteCode') STORED,
    updated_at text GENERATED ALWAYS AS (payload->>'updatedAt') STORED`,
  messages: `conversation_id text GENERATED ALWAYS AS (payload->>'conversationId') STORED NOT NULL,
    created_at text GENERATED ALWAYS AS (payload->>'createdAt') STORED NOT NULL,
    attachment_ids jsonb GENERATED ALWAYS AS (payload->'attachmentIds') STORED`,
  attachments: `owner_id text GENERATED ALWAYS AS (payload->>'ownerId') STORED`,
  reports: `created_at text GENERATED ALWAYS AS (payload->>'createdAt') STORED`,
  favorite_notes: `user_id text GENERATED ALWAYS AS (payload->>'userId') STORED NOT NULL`,
  calls: `conversation_id text GENERATED ALWAYS AS (payload->>'conversationId') STORED NOT NULL,
    started_at text GENERATED ALWAYS AS (payload->>'startedAt') STORED NOT NULL`,
  drafts: `user_id text GENERATED ALWAYS AS (payload->>'userId') STORED NOT NULL,
    conversation_id text GENERATED ALWAYS AS (payload->>'conversationId') STORED NOT NULL`,
  folders: `user_id text GENERATED ALWAYS AS (payload->>'userId') STORED NOT NULL`,
  scheduled_messages: `user_id text GENERATED ALWAYS AS (payload->>'userId') STORED NOT NULL,
    conversation_id text GENERATED ALWAYS AS (payload->>'conversationId') STORED NOT NULL,
    send_at text GENERATED ALWAYS AS (payload->>'sendAt') STORED NOT NULL,
    status text GENERATED ALWAYS AS (payload->>'status') STORED NOT NULL`,
  sessions: `user_id text GENERATED ALWAYS AS (payload->>'userId') STORED NOT NULL,
    last_seen_at text GENERATED ALWAYS AS (payload->>'lastSeenAt') STORED,
    token_hashes jsonb GENERATED ALWAYS AS (payload->'tokenHashes') STORED`,
};

/** Version-one schema is embedded so compiled deployments need no copied SQL asset. */
export const postgresSchemaSql = `${entityTables.map(([table]) => `
  CREATE TABLE IF NOT EXISTS ${table} (
    sequence bigserial UNIQUE NOT NULL,
    payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    id text GENERATED ALWAYS AS (payload->>'id') STORED PRIMARY KEY,
    ${columns[table]}
  );`).join("\n")}
  CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (email_key);
  CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique ON users (username_key);
  CREATE INDEX IF NOT EXISTS users_favorites_idx ON users USING gin (favorite_ids);
  ALTER TABLE conversations ADD COLUMN IF NOT EXISTS invite_code text GENERATED ALWAYS AS (payload->>'inviteCode') STORED;
  CREATE UNIQUE INDEX IF NOT EXISTS conversations_direct_key_unique ON conversations (direct_key);
  -- У личных диалогов и «Избранного» кода нет: пустые значения в индекс не попадают.
  CREATE UNIQUE INDEX IF NOT EXISTS conversations_invite_code_unique ON conversations (invite_code) WHERE invite_code IS NOT NULL AND invite_code <> '';
  CREATE INDEX IF NOT EXISTS conversations_members_idx ON conversations USING gin (member_ids);
  CREATE INDEX IF NOT EXISTS conversations_updated_idx ON conversations (updated_at DESC, sequence);
  CREATE INDEX IF NOT EXISTS messages_conversation_created_idx ON messages (conversation_id, created_at DESC, sequence);
  CREATE INDEX IF NOT EXISTS messages_attachments_idx ON messages USING gin (attachment_ids);
  CREATE INDEX IF NOT EXISTS attachments_owner_idx ON attachments (owner_id);
  CREATE INDEX IF NOT EXISTS reports_created_idx ON reports (created_at DESC, sequence);
  CREATE INDEX IF NOT EXISTS favorite_notes_user_idx ON favorite_notes (user_id, sequence);
  CREATE INDEX IF NOT EXISTS calls_conversation_started_idx ON calls (conversation_id, started_at DESC, sequence);
  CREATE UNIQUE INDEX IF NOT EXISTS drafts_user_conversation_unique ON drafts (user_id, conversation_id);
  CREATE INDEX IF NOT EXISTS folders_user_idx ON folders (user_id, sequence);
  CREATE INDEX IF NOT EXISTS scheduled_messages_user_idx ON scheduled_messages (user_id, send_at, sequence);
  CREATE INDEX IF NOT EXISTS scheduled_messages_due_idx ON scheduled_messages (status, send_at, sequence);
  -- Поиск сеанса по отпечатку токена: он нужен на каждом запросе.
  CREATE INDEX IF NOT EXISTS sessions_tokens_idx ON sessions USING gin (token_hashes);
  CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id, last_seen_at DESC, sequence);
`;

export class PostgresDatabase {
  readonly pool: Pool;

  constructor(config: string | PoolConfig | Pool) {
    this.pool = config instanceof Pool ? config : new Pool(typeof config === "string" ? { connectionString: config } : config);
    // 🔥 Пул без обработчика 'error' роняет процесс. pg-pool на ошибку клиента,
    // который простаивал в пуле (сервер базы перезапустился, сеть оборвалась),
    // делает pool.emit('error'), а необработанное событие 'error' в Node — это
    // падение всего сервера Yargram. Ошибка простаивающего соединения ничего не
    // ломает: следующий запрос возьмёт из пула живое соединение. Поэтому просто
    // сообщаем в журнал и живём дальше.
    this.pool.on("error", (error: Error) => {
      console.error("PostgreSQL: оборвалось соединение из пула —", error.message);
    });
  }

  async initialize(): Promise<void> {
    await this.transaction(async (client) => {
      // Serialize schema setup across processes, without serializing ordinary repository operations.
      await client.query("SELECT pg_advisory_xact_lock(1869750631, 1)");
      await client.query(postgresSchemaSql);
    });
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      try {
        const result = await operation(client);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    } finally {
      client.release();
    }
  }

  /** Import is all-or-nothing and never merges with or overwrites existing entities. */
  async importState(input: DatabaseState): Promise<void> {
    const state = databaseSchema.parse(input) as DatabaseState;
    await this.transaction(async (client) => {
      // Blocks inserts as well as updates/deletes, including another concurrent import.
      await client.query(`LOCK TABLE ${entityTables.map(([table]) => table).join(", ")} IN EXCLUSIVE MODE`);
      for (const [table] of entityTables) {
        const result = await client.query(`SELECT 1 FROM ${table} LIMIT 1`);
        if (result.rows.length) throw new Error("PostgreSQL import requires an empty database");
      }
      for (const [table, key] of entityTables) {
        for (const entity of state[key]) {
          await client.query(`INSERT INTO ${table} (payload) VALUES ($1::jsonb)`, [JSON.stringify(entity)]);
        }
      }
    });
  }
}
