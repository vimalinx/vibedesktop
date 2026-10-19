"use client";

import { createContext, useContext } from "react";
import type { JsonObject, PackagePreferences } from "@/protocol/v1/types";
import type { SystemToolPresentation } from "@/protocol/shell/package";

export interface SystemToolsContextValue {
  presentation: SystemToolPresentation;
  packageId: string;
  userName: string;
  preferences: PackagePreferences;
  savePreferences(values: JsonObject): Promise<PackagePreferences>;
  patchPreferences(values: JsonObject): Promise<PackagePreferences>;
  managePackages(): void;
  wallpaper(): void;
}

export const SystemToolsContext = createContext<SystemToolsContextValue | null>(null);
export const useSystemTools = () => useContext(SystemToolsContext);
