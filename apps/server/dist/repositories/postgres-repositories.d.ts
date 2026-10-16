import type { PostgresDatabase } from "../storage/postgres-database.js";
import { type Repositories } from "./types.js";
export declare function createPostgresRepositories(database: PostgresDatabase): Repositories;
