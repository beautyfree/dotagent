import { z } from "zod";
export declare const MANIFEST_SCHEMA_VERSION: 1;
export declare const LOCKFILE_VERSION: 1;
export declare const dependencyReferenceSchema: z.ZodEffects<z.ZodObject<{
    url: z.ZodString;
    ref: z.ZodString;
    select: z.ZodOptional<z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">>;
}, "strict", z.ZodTypeAny, {
    url: string;
    ref: string;
    select?: string[] | undefined;
}, {
    url: string;
    ref: string;
    select?: string[] | undefined;
}>, {
    url: string;
    ref: string;
    select?: string[] | undefined;
}, {
    url: string;
    ref: string;
    select?: string[] | undefined;
}>;
export declare const libraryManifestSchema: z.ZodEffects<z.ZodObject<{
    schema_version: z.ZodLiteral<1>;
    name: z.ZodString;
    version: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    license: z.ZodOptional<z.ZodString>;
    skills: z.ZodDefault<z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">>;
    dependencies: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodEffects<z.ZodObject<{
        url: z.ZodString;
        ref: z.ZodString;
        select: z.ZodOptional<z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">>;
    }, "strict", z.ZodTypeAny, {
        url: string;
        ref: string;
        select?: string[] | undefined;
    }, {
        url: string;
        ref: string;
        select?: string[] | undefined;
    }>, {
        url: string;
        ref: string;
        select?: string[] | undefined;
    }, {
        url: string;
        ref: string;
        select?: string[] | undefined;
    }>>>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strict", z.ZodTypeAny, {
    skills: string[];
    schema_version: 1;
    name: string;
    version: string;
    dependencies: Record<string, {
        url: string;
        ref: string;
        select?: string[] | undefined;
    }>;
    description?: string | undefined;
    license?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}, {
    schema_version: 1;
    name: string;
    version: string;
    skills?: string[] | undefined;
    description?: string | undefined;
    license?: string | undefined;
    dependencies?: Record<string, {
        url: string;
        ref: string;
        select?: string[] | undefined;
    }> | undefined;
    metadata?: Record<string, unknown> | undefined;
}>, {
    skills: string[];
    schema_version: 1;
    name: string;
    version: string;
    dependencies: Record<string, {
        url: string;
        ref: string;
        select?: string[] | undefined;
    }>;
    description?: string | undefined;
    license?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}, {
    schema_version: 1;
    name: string;
    version: string;
    skills?: string[] | undefined;
    description?: string | undefined;
    license?: string | undefined;
    dependencies?: Record<string, {
        url: string;
        ref: string;
        select?: string[] | undefined;
    }> | undefined;
    metadata?: Record<string, unknown> | undefined;
}>;
export declare const resolvedPackageSchema: z.ZodObject<{
    url: z.ZodString;
    requested_ref: z.ZodString;
    commit: z.ZodString;
    integrity: z.ZodString;
    skills: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        path: z.ZodEffects<z.ZodString, string, string>;
    }, "strict", z.ZodTypeAny, {
        path: string;
        name: string;
    }, {
        path: string;
        name: string;
    }>, "many">;
}, "strict", z.ZodTypeAny, {
    skills: {
        path: string;
        name: string;
    }[];
    url: string;
    requested_ref: string;
    commit: string;
    integrity: string;
}, {
    skills: {
        path: string;
        name: string;
    }[];
    url: string;
    requested_ref: string;
    commit: string;
    integrity: string;
}>;
export declare const libraryLockSchema: z.ZodObject<{
    lockfile_version: z.ZodLiteral<1>;
    generated_by: z.ZodString;
    resolved: z.ZodRecord<z.ZodString, z.ZodObject<{
        url: z.ZodString;
        requested_ref: z.ZodString;
        commit: z.ZodString;
        integrity: z.ZodString;
        skills: z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            path: z.ZodEffects<z.ZodString, string, string>;
        }, "strict", z.ZodTypeAny, {
            path: string;
            name: string;
        }, {
            path: string;
            name: string;
        }>, "many">;
    }, "strict", z.ZodTypeAny, {
        skills: {
            path: string;
            name: string;
        }[];
        url: string;
        requested_ref: string;
        commit: string;
        integrity: string;
    }, {
        skills: {
            path: string;
            name: string;
        }[];
        url: string;
        requested_ref: string;
        commit: string;
        integrity: string;
    }>>;
}, "strict", z.ZodTypeAny, {
    lockfile_version: 1;
    generated_by: string;
    resolved: Record<string, {
        skills: {
            path: string;
            name: string;
        }[];
        url: string;
        requested_ref: string;
        commit: string;
        integrity: string;
    }>;
}, {
    lockfile_version: 1;
    generated_by: string;
    resolved: Record<string, {
        skills: {
            path: string;
            name: string;
        }[];
        url: string;
        requested_ref: string;
        commit: string;
        integrity: string;
    }>;
}>;
export type DependencyReference = z.infer<typeof dependencyReferenceSchema>;
export type LibraryManifest = z.infer<typeof libraryManifestSchema>;
export type ResolvedPackage = z.infer<typeof resolvedPackageSchema>;
export type LibraryLock = z.infer<typeof libraryLockSchema>;
//# sourceMappingURL=schema.d.ts.map