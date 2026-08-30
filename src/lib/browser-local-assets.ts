const databaseName = "vibedesktop-local-assets";
const storeName = "assets";

export async function saveLocalAsset(key: string, file: File): Promise<string> {
  const database = await openDatabase();
  const payload = {
    type: file.type,
    name: file.name,
    bytes: await file.arrayBuffer()
  };

  await transaction(database, "readwrite", (store) => {
    store.put(payload, key);
  });

  return URL.createObjectURL(new Blob([payload.bytes], { type: payload.type }));
}

export async function loadLocalAsset(key: string): Promise<string | null> {
  const database = await openDatabase();
  const payload = await transaction<{
    type: string;
    name: string;
    bytes: ArrayBuffer;
  } | null>(database, "readonly", (store) => store.get(key));

  if (!payload) {
    return null;
  }

  return URL.createObjectURL(new Blob([payload.bytes], { type: payload.type }));
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);

    request.onupgradeneeded = () => {
      request.result.createObjectStore(storeName);
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function transaction<T>(
  database: IDBDatabase,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T> | void
): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
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
  });
}
