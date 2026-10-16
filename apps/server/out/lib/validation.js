export function parseBody(schema, request) {
    return schema.parse(request.body);
}
export function parseQuery(schema, request) {
    return schema.parse(request.query);
}
export function parseParams(schema, request) {
    return schema.parse(request.params);
}
//# sourceMappingURL=validation.js.map