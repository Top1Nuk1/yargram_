import type { ServerConfig } from "../config.js";
import { AtRestCrypto } from "../lib/crypto.js";
/**
 * Открывает хранилище и сразу навешивает шифрование «в покое»: сообщения и
 * файлы лежат на диске зашифрованными, сервисы при этом работают с открытым
 * текстом. Ключ один на все данные — из DB_ENCRYPTION_KEY.
 */
export declare function openStorage(config: ServerConfig): Promise<{
    repositories: import("../repositories/types.js").Repositories;
    crypto: AtRestCrypto;
    close: () => Promise<void>;
}>;
