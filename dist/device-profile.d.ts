import { z } from "zod";
import { type ProviderKind } from "./providers.js";
declare const connectionSchema: z.ZodObject<{
    id: z.ZodString;
    label: z.ZodString;
    provider: z.ZodEnum<["github", "gitlab", "generic"]>;
    remote: z.ZodString;
    library: z.ZodString;
    created_at: z.ZodString;
    last_used_at: z.ZodString;
}, "strict", z.ZodTypeAny, {
    library: string;
    id: string;
    remote: string;
    provider: "github" | "gitlab" | "generic";
    label: string;
    created_at: string;
    last_used_at: string;
}, {
    library: string;
    id: string;
    remote: string;
    provider: "github" | "gitlab" | "generic";
    label: string;
    created_at: string;
    last_used_at: string;
}>;
declare const storeSchema: z.ZodEffects<z.ZodObject<{
    schema_version: z.ZodLiteral<1>;
    active_connection_id: z.ZodNullable<z.ZodString>;
    connections: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        label: z.ZodString;
        provider: z.ZodEnum<["github", "gitlab", "generic"]>;
        remote: z.ZodString;
        library: z.ZodString;
        created_at: z.ZodString;
        last_used_at: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        library: string;
        id: string;
        remote: string;
        provider: "github" | "gitlab" | "generic";
        label: string;
        created_at: string;
        last_used_at: string;
    }, {
        library: string;
        id: string;
        remote: string;
        provider: "github" | "gitlab" | "generic";
        label: string;
        created_at: string;
        last_used_at: string;
    }>, "many">;
}, "strict", z.ZodTypeAny, {
    schema_version: 1;
    active_connection_id: string | null;
    connections: {
        library: string;
        id: string;
        remote: string;
        provider: "github" | "gitlab" | "generic";
        label: string;
        created_at: string;
        last_used_at: string;
    }[];
}, {
    schema_version: 1;
    active_connection_id: string | null;
    connections: {
        library: string;
        id: string;
        remote: string;
        provider: "github" | "gitlab" | "generic";
        label: string;
        created_at: string;
        last_used_at: string;
    }[];
}>, {
    schema_version: 1;
    active_connection_id: string | null;
    connections: {
        library: string;
        id: string;
        remote: string;
        provider: "github" | "gitlab" | "generic";
        label: string;
        created_at: string;
        last_used_at: string;
    }[];
}, {
    schema_version: 1;
    active_connection_id: string | null;
    connections: {
        library: string;
        id: string;
        remote: string;
        provider: "github" | "gitlab" | "generic";
        label: string;
        created_at: string;
        last_used_at: string;
    }[];
}>;
export type DeviceConnection = z.infer<typeof connectionSchema>;
export type DeviceProfileStore = z.infer<typeof storeSchema>;
export type DeviceProfile = DeviceConnection;
export declare function deviceProfilePath(environment?: NodeJS.ProcessEnv, home?: string, platform?: NodeJS.Platform): string;
export declare function loadDeviceProfileStore(file?: string): Promise<DeviceProfileStore>;
/** Adds or updates a local machine connection. Credentials are never stored here. */
export declare function saveDeviceProfile(profile: Omit<DeviceConnection, "id" | "created_at" | "last_used_at"> & Partial<Pick<DeviceConnection, "id" | "created_at" | "last_used_at">>, file?: string): Promise<DeviceConnection>;
export declare function loadDeviceProfile(file?: string): Promise<DeviceProfile | null>;
export declare function selectDeviceProfile(id: string, file?: string): Promise<DeviceConnection>;
export declare function providerFromRemote(remote: string): ProviderKind;
export {};
//# sourceMappingURL=device-profile.d.ts.map