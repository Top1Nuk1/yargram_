import type { Request } from "express";
import { type output, type ZodTypeAny } from "zod";

export function parseBody<T extends ZodTypeAny>(schema: T, request: Request): output<T> {
  return schema.parse(request.body);
}

export function parseQuery<T extends ZodTypeAny>(schema: T, request: Request): output<T> {
  return schema.parse(request.query);
}

export function parseParams<T extends ZodTypeAny>(schema: T, request: Request): output<T> {
  return schema.parse(request.params);
}
