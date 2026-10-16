#!/usr/bin/env node
/**
 * Превращает копию базы (`yargram-backup/1`, tables с payload) в живую
 * JSON-базу Yargram (`version: 1`, списки на верхнем уровне).
 *
 * Зачем: чтобы перенести переписку на сервер, где работает JSON-драйвер
 * (без PostgreSQL). Копия и живая база хранят одни и те же записи: копия
 * раскладывает их по таблицам `{id, payload}`, живая — плоским списком.
 *
 * Порядок:
 *   node scripts/backup-to-json.mjs <копия-database.json> > yargram.json
 * Затем yargram.json положить в apps/server/data/ (или указать DATA_DIR).
 *
 * Внимание:
 *   * тексты сообщений в копии уже расшифрованы, а JSON-драйвер сам
 *     зашифрует их при первом сохранении (openStorage оборачивает хранилище
 *     в withEncryption) — отдельно шифровать не нужно;
 *   * поле `createdAt` у пользователей, которого нет в копии, не требуется;
 *   * связи по id между таблицами сохраняются, поэтому чаты, аватары и
 *     вложения оживут, если файлы uploads положены рядом.
 *
 * Формат стеков: users → conversations → messages → attachments → reports →
 * calls → favoriteNotes → drafts → folders → scheduledMessages → sessions →
 * stickerPacks → stickers → stickerInstalls.
 */
import { readFileSync } from "node:fs";

const CAMEL = {
  favorite_notes: "favoriteNotes",
  scheduled_messages: "scheduledMessages",
  sticker_installs: "stickerInstalls",
  sticker_packs: "stickerPacks",
};

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Укажите файл копии: node scripts/backup-to-json.mjs <database.json>");
    process.exit(1);
  }
  const parsed = JSON.parse(readFileSync(file, "utf8"));
  if (parsed.format !== "yargram-backup/1") {
    console.error(`Не формат копии: ${parsed.format ?? "нет format"}`);
    process.exit(1);
  }
  const state = {
    version: 1,
    users: [],
    conversations: [],
    messages: [],
    attachments: [],
    reports: [],
    calls: [],
    favoriteNotes: [],
    drafts: [],
    folders: [],
    scheduledMessages: [],
    sessions: [],
    stickerPacks: [],
    stickers: [],
    stickerInstalls: [],
  };
  for (const [table, rows] of Object.entries(parsed.tables)) {
    const key = CAMEL[table] ?? table;
    if (!(key in state)) continue;
    state[key] = rows.map((row) => row.payload);
  }
  process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
  const total = Object.values(state).reduce((sum, list) => sum + list.length, 0);
  console.error(`Готово: ${total} записей (users=${state.users.length}, messages=${state.messages.length}).`);
}

main();