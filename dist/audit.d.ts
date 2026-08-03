export type SecretFinding = {
    rule: "private-key" | "github-token" | "provider-token" | "aws-access-key" | "connection-string" | "credential-assignment";
    line: number;
    column: number;
};
/** Returns locations and rule IDs only; matched values never cross the API boundary. */
export declare function scanTextForSecrets(text: string): SecretFinding[];
//# sourceMappingURL=audit.d.ts.map