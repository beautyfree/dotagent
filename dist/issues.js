export class DotagentsError extends Error {
    issues;
    constructor(message, issues) {
        super(message);
        this.name = "DotagentsError";
        this.issues = issues;
    }
}
//# sourceMappingURL=issues.js.map