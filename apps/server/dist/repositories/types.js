export class RepositoryConflictError extends Error {
    field;
    constructor(field) {
        super(`A user with this ${field} already exists`);
        this.field = field;
        this.name = "RepositoryConflictError";
    }
}
//# sourceMappingURL=types.js.map