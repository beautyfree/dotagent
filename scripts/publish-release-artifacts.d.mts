export interface ReleaseCommandResult {
  status: number;
  stdout: string;
  stderr: string;
}

export interface ReleasePublicationOptions {
  artifactRoot?: string;
  packageManifest?: Record<string, unknown>;
  releaseManifest?: Record<string, unknown>;
  env?: Record<string, string | undefined>;
  exec?: (file: string, args: string[], options?: { env?: Record<string, string | undefined>; cwd?: string }) => ReleaseCommandResult;
  log?: (message: string) => void;
}

export interface ReleasePublicationResult {
  package: string;
  version: string;
  tag: string;
  url: string;
}

export function publishReleaseArtifacts(options?: ReleasePublicationOptions): ReleasePublicationResult;
