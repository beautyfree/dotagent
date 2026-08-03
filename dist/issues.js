export class DotagentError extends Error {
    issues;
    constructor(message, issues) {
        super(message);
        this.name = "DotagentError";
        this.issues = issues;
    }
}
//# sourceMappingURL=issues.js.map