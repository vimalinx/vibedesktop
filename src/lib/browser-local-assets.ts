const databaseName = "vibedesktop-local-assets";
const storeName = "assets";

export async function saveLocalAsset(key: string, file: File): Promise<string> {
  const payload = { type: file.type, name: file.name, bytes: await file.arrayBuffer() };
  const database = await openDatabase();
  try {
    await transaction(database, "readwrite", store => store.put(payload, key));
    return URL.createObjectURL(new Blob([payload.bytes], { type: payload.type }));
  } finally { database.close(); }
}

export async function loadLocalAsset(key: string): Promise<string | null> {
  const database = await openDatabase();
  try {
    const payload = await transaction<{ type: string; name: string; bytes: ArrayBuffer } | null>(
      database, "readonly", store => store.get(key));
    return payload ? URL.createObjectURL(new Blob([payload.bytes], { type: payload.type })) : null;
  } finally { database.close(); }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 2);

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName);
      if (!request.result.objectStoreNames.contains("recovery")) request.result.createObjectStore("recovery");
    };
    let blocked = false;
    request.onblocked = () => {
      blocked = true;
      reject(new Error("Close other Vibe Desktop tabs and retry / 请关闭其他 Vibe Desktop 标签页后重试"));
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      if (blocked) { request.result.close(); return; }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}

function transaction<T>(
  database: IDBDatabase,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T> | void,
  bucket = storeName
): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = database.transaction(bucket, mode);
    const store = tx.objectStore(bucket);
    const request = action(store);
    let result: T | undefined;

    if (request) {
      request.onsuccess = () => {
        result = request.result;
      };
      request.onerror = () => reject(request.error);
    }

    tx.oncomplete = () => resolve(result as T);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Asset transaction aborted"));
  });
}

export async function exportLocalAssets(): Promise<import("@/lib/desktop-backup-contract").AssetBackup[]> {
  const database = await openDatabase();
  try {
    const rows = await new Promise<Array<{ key: string; type: string; name: string; bytes: ArrayBuffer }>>((resolve, reject) => {
      const tx = database.transaction(storeName, "readonly");
      const rows: Array<{ key: string; type: string; name: string; bytes: ArrayBuffer }> = [];
      const request = tx.objectStore(storeName).openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) { rows.push({ key: String(cursor.key), ...cursor.value }); cursor.continue(); }
      };
      tx.oncomplete = () => resolve(rows);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error("Asset read aborted"));
    });
    return rows.map(({ key, type, name, bytes }) => {
      let binary = "";
      const data = new Uint8Array(bytes);
      for (let offset = 0; offset < data.length; offset += 8192) binary += String.fromCharCode(...data.subarray(offset, offset + 8192));
      return { key, type, name, base64: btoa(binary) };
    });
  } finally { database.close(); }
}

export async function replaceLocalAssets(assets: import("@/lib/desktop-backup-contract").AssetBackup[]): Promise<void> {
  const rows = assets.map(a => ({ ...a, bytes: Uint8Array.from(atob(a.base64), c => c.charCodeAt(0)).buffer }));
  const database = await openDatabase();
  try {
    await transaction(database, "readwrite", store => {
      store.clear();
      for (const { key, type, name, bytes } of rows) store.put({ type, name, bytes }, key);
    });
  } finally { database.close(); }
}


export async function saveRecoveryBackup(backup: import("@/lib/desktop-backup-contract").DesktopBackup): Promise<void> {
  const database = await openDatabase();
  try { await transaction(database, "readwrite", store => store.put(backup, "before-restore"), "recovery"); }
  finally { database.close(); }
}

export async function loadRecoveryBackup(): Promise<import("@/lib/desktop-backup-contract").DesktopBackup | null> {
  const database = await openDatabase();
  try { return await transaction(database, "readonly", store => store.get("before-restore"), "recovery") ?? null; }
  finally { database.close(); }
}

export type BackupHistoryEntry = { id: string; backup: import("@/lib/desktop-backup-contract").DesktopBackup };
export async function loadBackupHistory(): Promise<BackupHistoryEntry[]> {
  const database = await openDatabase();
  try { return await transaction<BackupHistoryEntry[]>(database, "readonly", store => store.get("history"), "recovery") ?? []; }
  finally { database.close(); }
}
export async function appendBackupHistory(backup: import("@/lib/desktop-backup-contract").DesktopBackup, retain: number): Promise<void> {
  const database = await openDatabase();
  try {
    await transaction(database, "readwrite", store => {
      const request = store.get("history");
      request.onsuccess = () => {
        const rows: BackupHistoryEntry[] = [{ id: crypto.randomUUID(), backup }, ...(request.result || [])];
        store.put(rows.slice(0, Math.max(1, Math.min(20, retain))), "history");
      };
    }, "recovery");
  } finally { database.close(); }
}
export async function deleteBackupHistory(id: string): Promise<void> {
  const database = await openDatabase();
  try {
    await transaction(database, "readwrite", store => {
      const request = store.get("history");
      request.onsuccess = () => store.put((request.result || []).filter((row: BackupHistoryEntry) => row.id !== id), "history");
    }, "recovery");
  } finally { database.close(); }
}
