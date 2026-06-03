import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { ContentCanvas } from '../types'; // Adjust the import path if your types file is elsewhere

const DB_NAME = 'SteadySocialDB';
const DB_VERSION = 2;
const CANVAS_STORE_NAME = 'contentCanvases';
const PAGE_CANVAS_SEPARATOR = '::';

type PageScopedCanvasRecord = ContentCanvas & {
  pageId?: string;
  rawCanvasId?: string;
};

interface SteadySocialDB extends DBSchema {
  [CANVAS_STORE_NAME]: {
    key: string;
    value: PageScopedCanvasRecord;
    indexes: {
      createdAt: number;
      pageId: string;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<SteadySocialDB>> | null = null;

const normalizeId = (value?: string | null): string => String(value || '').trim();

const getScopedCanvasId = (canvasId: string, pageId?: string | null): string => {
  const cleanCanvasId = normalizeId(canvasId);
  const cleanPageId = normalizeId(pageId);

  if (!cleanPageId || cleanCanvasId.includes(PAGE_CANVAS_SEPARATOR)) {
    return cleanCanvasId;
  }

  return `${cleanPageId}${PAGE_CANVAS_SEPARATOR}${cleanCanvasId}`;
};

const stripScopedCanvasId = (scopedCanvasId: string, pageId?: string | null): string => {
  const cleanPageId = normalizeId(pageId);
  const prefix = cleanPageId ? `${cleanPageId}${PAGE_CANVAS_SEPARATOR}` : '';

  if (prefix && scopedCanvasId.startsWith(prefix)) {
    return scopedCanvasId.slice(prefix.length);
  }

  const separatorIndex = scopedCanvasId.indexOf(PAGE_CANVAS_SEPARATOR);
  if (!cleanPageId && separatorIndex >= 0) {
    return scopedCanvasId.slice(separatorIndex + PAGE_CANVAS_SEPARATOR.length);
  }

  return scopedCanvasId;
};

const toPublicCanvas = (
  record: PageScopedCanvasRecord | undefined,
  pageId?: string | null
): ContentCanvas | undefined => {
  if (!record) return undefined;

  const publicId = record.rawCanvasId || stripScopedCanvasId(record.id, pageId);
  const { rawCanvasId: _rawCanvasId, ...canvas } = record as PageScopedCanvasRecord & { id: string };

  return {
    ...canvas,
    id: publicId,
  } as ContentCanvas;
};

const isScopedToPage = (record: PageScopedCanvasRecord, pageId: string): boolean => {
  return (
    normalizeId(record.pageId) === pageId ||
    normalizeId(record.id).startsWith(`${pageId}${PAGE_CANVAS_SEPARATOR}`)
  );
};

const isLegacyCanvas = (record: PageScopedCanvasRecord): boolean => {
  return !record.pageId && !normalizeId(record.id).includes(PAGE_CANVAS_SEPARATOR);
};

const sortCanvasesNewestFirst = (items: PageScopedCanvasRecord[]): PageScopedCanvasRecord[] => {
  return [...items].sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
};

const initDB = () => {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = openDB<SteadySocialDB>(DB_NAME, DB_VERSION, {
    upgrade(db, _oldVersion, _newVersion, transaction) {
      const store = db.objectStoreNames.contains(CANVAS_STORE_NAME)
        ? transaction.objectStore(CANVAS_STORE_NAME)
        : db.createObjectStore(CANVAS_STORE_NAME, { keyPath: 'id' });

      if (!store.indexNames.contains('createdAt')) {
        store.createIndex('createdAt', 'createdAt');
      }

      if (!store.indexNames.contains('pageId')) {
        store.createIndex('pageId', 'pageId');
      }
    },
  });

  return dbPromise;
};

// --- Database Functions for Canvases ---
// pageId is optional so old CanvasContext calls keep working.
// When pageId is provided, canvases are isolated per Facebook page.

export const getAllCanvasesDB = async (pageId?: string | null): Promise<ContentCanvas[]> => {
  const db = await initDB();
  const cleanPageId = normalizeId(pageId);
  const allRecords = await db.getAll(CANVAS_STORE_NAME);

  if (cleanPageId) {
    const pageRecords = allRecords.filter(record => isScopedToPage(record, cleanPageId));

    // Backward compatibility: if no page-scoped canvases exist yet, show old legacy canvases.
    const recordsToUse = pageRecords.length > 0
      ? pageRecords
      : allRecords.filter(isLegacyCanvas);

    return sortCanvasesNewestFirst(recordsToUse)
      .map(record => toPublicCanvas(record, cleanPageId))
      .filter((canvas): canvas is ContentCanvas => Boolean(canvas));
  }

  return sortCanvasesNewestFirst(allRecords.filter(isLegacyCanvas))
    .map(record => toPublicCanvas(record))
    .filter((canvas): canvas is ContentCanvas => Boolean(canvas));
};

export const getCanvasDB = async (
  id: string,
  pageId?: string | null
): Promise<ContentCanvas | undefined> => {
  const db = await initDB();
  const cleanPageId = normalizeId(pageId);
  const scopedId = getScopedCanvasId(id, cleanPageId);

  const scopedRecord = await db.get(CANVAS_STORE_NAME, scopedId);
  if (scopedRecord) {
    return toPublicCanvas(scopedRecord, cleanPageId);
  }

  if (cleanPageId) {
    // Backward compatibility for canvases saved before page scoping.
    const legacyRecord = await db.get(CANVAS_STORE_NAME, id);
    return toPublicCanvas(legacyRecord);
  }

  return undefined;
};

export const saveCanvasDB = async (
  canvas: ContentCanvas,
  pageId?: string | null
): Promise<void> => {
  const db = await initDB();
  const cleanPageId = normalizeId(pageId);
  const rawCanvasId = normalizeId(canvas.id);
  const scopedId = getScopedCanvasId(rawCanvasId, cleanPageId);

  const record: PageScopedCanvasRecord = {
    ...(canvas as PageScopedCanvasRecord),
    id: scopedId,
    rawCanvasId,
    pageId: cleanPageId || undefined,
  };

  await db.put(CANVAS_STORE_NAME, record);
};

export const deleteCanvasDB = async (
  id: string,
  pageId?: string | null
): Promise<void> => {
  const db = await initDB();
  const cleanPageId = normalizeId(pageId);

  if (cleanPageId) {
    await db.delete(CANVAS_STORE_NAME, getScopedCanvasId(id, cleanPageId));
    return;
  }

  await db.delete(CANVAS_STORE_NAME, id);
};

export const getCanvasStorageKey = (
  id: string,
  pageId?: string | null
): string => getScopedCanvasId(id, pageId);
