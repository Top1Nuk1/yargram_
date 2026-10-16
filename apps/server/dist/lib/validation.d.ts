import type { Request } from "express";
import { type output, type ZodTypeAny } from "zod";
export declare function parseBody<T extends ZodTypeAny>(schema: T, request: Request): output<T>;
export declare function parseQuery<T extends ZodTypeAny>(schema: T, request: Request): output<T>;
export declare function parseParams<T extends ZodTypeAny>(schema: T, request: Request): output<T>;
