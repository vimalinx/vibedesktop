/** Frontend session types, independent of rendering and backend storage. */
import type { DesktopApp } from "../v1/types";

export type WindowMode = "open" | "minimized";

export interface AppWindowState {
  id: string;
  app: DesktopApp;
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
  mode: WindowMode;
  maximized?: boolean;
  tiled?: boolean;
}

