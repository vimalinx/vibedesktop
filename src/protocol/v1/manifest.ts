import { capabilityIds, operations } from "./operations";
export const protocolName = "vibedesktop";
export const protocolVersion = { major: 1, minor: 1 } as const;
export const protocolHeader = "x-vibe-protocol";
export const protocolVersionString = "1.1";
export const protocolManifest = {
  protocol: protocolName,
  version: protocolVersion,
  basePath: "/api/v1",
  capabilities: capabilityIds,
  operations,
  transport: { scope: "local-single-user", mutations: "same-origin", automaticMutationRetry: false },
  limits: { requestBytes: 8 * 1024 * 1024, packagePreferencesBytes: 64 * 1024, packagesPerDesktop: 32 },
} as const;
export type ProtocolManifest = typeof protocolManifest;
