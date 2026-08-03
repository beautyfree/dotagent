const secretRules = [
    { id: "private-key", pattern: /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/g },
    { id: "github-token", pattern: /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g },
    { id: "provider-token", pattern: /\b(?:sk-ant-|sk-(?:proj-)?)[A-Za-z0-9_-]{20,}\b/g },
    { id: "aws-access-key", pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
    { id: "connection-string", pattern: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^/\s:@]+:[^/\s@]+@/gi },
];
function isDocumentedConnectionExample(line) {
    return /(?:\b(?:placeholder|sample|replace(?:\s+me)?|your[_ -]?(?:database|password|url|credential)|real values?)\b|\be\.g\.)/i.test(line);
}
/** Returns locations and rule IDs only; matched values never cross the API boundary. */
export function scanTextForSecrets(text) {
    const findings = [];
    const lines = text.split(/\r?\n/);
    for (const [lineIndex, line] of lines.entries()) {
        for (const rule of secretRules) {
            rule.pattern.lastIndex = 0;
            let match;
            while ((match = rule.pattern.exec(line)) !== null) {
                if (rule.id === "connection-string" && isDocumentedConnectionExample(line))
                    continue;
                findings.push({ rule: rule.id, line: lineIndex + 1, column: match.index + 1 });
            }
        }
    }
    return findings;
}
//# sourceMappingURL=audit.js.map