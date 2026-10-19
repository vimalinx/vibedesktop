/** Public v1 SDK entry point. No Next.js, React, filesystem, daemon or application implementation imports. */
export { createDesktopClient } from "./client";
export type { DesktopClientOptions } from "./client";
export { DesktopDataError, reasonFor } from "./data-source";
export type * from "./data-source";
export type * from "./types";
export { protocolManifest, protocolVersion } from "./manifest";
export type { ProtocolManifest } from "./manifest";
export { validatePackageManifest, packageCompatibility } from "./package";
export type { DesktopPackageManifest } from "./package";
