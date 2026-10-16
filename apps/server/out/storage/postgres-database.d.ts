import { Pool, type PoolClient, type PoolConfig } from "pg";
import type { DatabaseState } from "../domain/models.js";
/** Version-one schema is embedded so compiled deployments need no copied SQL asset. */
export declare const postgresSchemaSql: string;
export declare class PostgresDatabase {
    readonly pool: Pool;
    constructor(config: string | PoolConfig | Pool);
    initialize(): Promise<void>;
    close(): Promise<void>;
    transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T>;
    /** Import is all-or-nothing and never merges with or overwrites existing entities. */
    importState(input: DatabaseState): Promise<void>;
}
