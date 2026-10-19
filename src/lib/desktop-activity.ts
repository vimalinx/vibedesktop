import { useSyncExternalStore } from "react";

export type Activity = {
  id: string;
  title: string;
  state: "running" | "success" | "error";
  detail: string;
  at: string;
};
const key = "vd:activity:v1";
let items: Activity[] = [];
let loaded = false;
const listeners = new Set<() => void>();
const retries = new Map<string, () => Promise<unknown>>();
const empty: Activity[] = [];
function publish() {
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch {
    /* Keep the in-memory history when storage is full. */
  }
  listeners.forEach((fn) => fn());
}
function hydrate() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(key) || "[]");
    if (Array.isArray(saved))
      items = saved
        .filter(
          (x) =>
            x &&
            typeof x.id === "string" &&
            typeof x.title === "string" &&
            typeof x.detail === "string" &&
            typeof x.at === "string" &&
            ["running", "success", "error"].includes(x.state),
        )
        .slice(0, 60)
        .map((x) =>
          x.state === "running" &&
          !x.id.startsWith("catalog:") &&
          x.id !== "version-update"
            ? {
                ...x,
                state: "error",
                detail:
                  "页面已重新载入，请核对实际结果 / Page reloaded; check the actual result.",
              }
            : x,
        );
  } catch {
    items = [];
  }
}
export function activity(
  title: string,
  state: Activity["state"],
  detail = "",
  id = crypto.randomUUID(),
) {
  hydrate();
  const current = items.find((item) => item.id === id);
  if (
    current?.title === title &&
    current.state === state &&
    current.detail === detail
  )
    return id;
  items = [
    { id, title, state, detail, at: new Date().toISOString() },
    ...items.filter((x) => x.id !== id),
  ].slice(0, 60);
  publish();
  return id;
}
export async function runActivity<T>(
  title: string,
  work: () => Promise<T>,
  retryable = false,
): Promise<T> {
  const id = activity(title, "running");
  if (retryable) retries.set(id, () => runActivity(title, work, true));
  try {
    const result = await work();
    activity(title, "success", "", id);
    retries.delete(id);
    return result;
  } catch (error) {
    activity(
      title,
      "error",
      error instanceof Error ? error.message : String(error),
      id,
    );
    throw error;
  }
}
export function retryActivity(id: string) {
  return retries.get(id)?.();
}
export function canRetryActivity(id: string) {
  return retries.has(id);
}
export function clearActivities() {
  items = items.filter((x) => x.state === "running");
  retries.clear();
  publish();
}
export function useActivities() {
  return useSyncExternalStore(
    (fn) => {
      hydrate();
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => items,
    () => empty,
  );
}
