import type { AtRestCrypto } from "../lib/crypto.js";
import type { Repositories } from "./types.js";
export declare function withEncryption(repositories: Repositories, crypto: AtRestCrypto): Repositories;
