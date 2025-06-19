import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { ContentCanvas } from '../types'; // Adjust the import path if your types file is elsewhere

const DB_NAME = 'SteadySocialDB';
const DB_VERSION = 1;
const CANVAS_STORE_NAME = 'contentCanvases';

interface SteadySocialDB extends DBSchema {
  [CANVAS_STORE_NAME]: {
    key: string;
    value: ContentCanvas;
    indexes: { 'createdAt': number }; // Optional: Add index for sorting later
  };
}

let dbPromise: Promise<IDBPDatabase<SteadySocialDB>> | null = null;

const initDB = () => {
  if (dbPromise) {
    return dbPromise;
  }
  dbPromise = openDB<SteadySocialDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(CANVAS_STORE_NAME)) {
        const store = db.createObjectStore(CANVAS_STORE_NAME, { keyPath: 'id' });
        // Create an index to fetch canvases sorted by creation date
        store.createIndex('createdAt', 'createdAt');
      }
    },
  });
  return dbPromise;
};

// --- Database Functions for Canvases ---

export const getAllCanvasesDB = async (): Promise<ContentCanvas[]> => {
  const db = await initDB();
  // Get all canvases and sort them by creation date, newest first
  return (await db.getAllFromIndex(CANVAS_STORE_NAME, 'createdAt')).reverse();
};

export const getCanvasDB = async (id: string): Promise<ContentCanvas | undefined> => {
    const db = await initDB();
    return db.get(CANVAS_STORE_NAME, id);
};

export const saveCanvasDB = async (canvas: ContentCanvas): Promise<void> => {
  const db = await initDB();
  // 'put' will add the item if it's new or update it if the key already exists
  await db.put(CANVAS_STORE_NAME, canvas);
};

export const deleteCanvasDB = async (id: string): Promise<void> => {
    const db = await initDB();
    await db.delete(CANVAS_STORE_NAME, id);
};