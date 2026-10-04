import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { PostgresDatabase } from "../src/storage/postgres-database.js";

// 🔥 Сторож на грабли, из-за которых падала проверка на GitHub (и могла упасть
// боевая служба): pg-pool на ошибку простаивающего клиента делает
// pool.emit('error'), а необработанное событие 'error' в Node роняет процесс.
// Достаточно одного перезапуска базы под работающим сервером Yargram — и без
// обработчика процесс умирал целиком. Здесь проверяем, что обработчик есть.
describe("PostgreSQL: обрыв соединения из пула", () => {
  it("не роняет процесс, когда простаивающее соединение оборвалось", async () => {
    const pool = new Pool();
    const database = new PostgresDatabase(pool);
    expect(database.pool).toBe(pool);

    const failure = Object.assign(new Error("terminating connection due to administrator command"), { code: "57P01" });
    expect(() => pool.emit("error", failure)).not.toThrow();

    await pool.end();
  });
});
