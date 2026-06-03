import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { ContentCanvas, CanvasItem, CanvasStatus, SocialPlatform, WIPState } from '../types';
import * as canvasService from '../services/canvasService';
import { dbGetFacebookSettings } from '../services/settingsService';
import {
  MultiPageFacebookSettings,
  getDefaultFacebookPage,
  normalizeFacebookPages,
} from '../utils/facebookPageUtils';

interface CanvasContextType {
  canvases: ContentCanvas[];
  activePageId: string | null;
  setActivePageId: (pageId: string | null) => void;
  getCanvasById: (canvasId: string, pageId?: string | null) => Promise<ContentCanvas | undefined>;
  createCanvas: (
    canvasData: Omit<ContentCanvas, 'id' | 'items' | 'status' | 'createdAt' | 'wipStateSnapshot'>,
    initialItems: CanvasItem[],
    wipSnapshot?: Omit<WIPState, 'overallImageFile' | 'overallTextFile' | 'activeCanvasIdForWIP'>,
    pageId?: string | null
  ) => Promise<ContentCanvas>;
  updateCanvas: (updatedCanvas: ContentCanvas, pageId?: string | null) => Promise<ContentCanvas | undefined>;
  updateCanvasStatus: (canvasId: string, status: CanvasStatus, adminId?: string, adminFeedback?: string, pageId?: string | null) => Promise<ContentCanvas | undefined>;
  addOrUpdateCanvasItemAdaptation: (canvasId: string, itemId: string, platform: SocialPlatform, adaptedText: string, pageId?: string | null) => Promise<ContentCanvas | undefined>;
  updateCanvasItemNotes: (canvasId: string, itemId: string, notes: string, pageId?: string | null) => Promise<ContentCanvas | undefined>;
  deleteCanvas: (canvasId: string, pageId?: string | null) => Promise<void>;
  isLoadingCanvases: boolean;
  fetchCanvases: (pageId?: string | null) => Promise<void>;
  activeCanvas: ContentCanvas | null;
  setActiveCanvas: (canvas: ContentCanvas | null) => void;
}

const CanvasContext = createContext<CanvasContextType | undefined>(undefined);

const CANVAS_ACTIVE_PAGE_STORAGE_KEY = 'steadysocial_active_canvas_page_id';

const normalizeId = (value?: string | null): string => String(value || '').trim();

const getCanvasPageId = (canvas?: ContentCanvas | null): string => {
  const item = canvas as any;
  return normalizeId(
    item?.facebookPageId ||
    item?.pageId ||
    item?.targetPageId ||
    item?.metaPageId ||
    ''
  );
};

const attachPageToCanvasData = <T extends Record<string, any>>(
  data: T,
  pageId?: string | null
): T => {
  const cleanPageId = normalizeId(pageId);
  if (!cleanPageId) return data;

  return {
    ...data,
    facebookPageId: cleanPageId,
    pageId: cleanPageId,
  } as T;
};

const filterCanvasesForPage = (
  items: ContentCanvas[],
  pageId?: string | null
): ContentCanvas[] => {
  const cleanPageId = normalizeId(pageId);
  if (!cleanPageId) return items;

  const scopedItems = items.filter(canvas => getCanvasPageId(canvas) === cleanPageId);

  // If the backend/service has not been migrated yet, keep legacy canvases visible
  // instead of showing an empty dashboard after the user selects a page.
  if (scopedItems.length > 0) return scopedItems;

  return items.filter(canvas => !getCanvasPageId(canvas));
};

export const CanvasProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [canvases, setCanvases] = useState<ContentCanvas[]>([]);
  const [activeCanvas, setActiveCanvas] = useState<ContentCanvas | null>(null);
  const [isLoadingCanvases, setIsLoadingCanvases] = useState(true);
  const [activePageIdState, setActivePageIdState] = useState<string | null>(() => {
    try {
      return normalizeId(localStorage.getItem(CANVAS_ACTIVE_PAGE_STORAGE_KEY)) || null;
    } catch {
      return null;
    }
  });

  const activePageId = activePageIdState;

  const resolvePageId = useCallback(
    (pageId?: string | null): string | null => {
      if (pageId !== undefined) {
        return normalizeId(pageId) || null;
      }

      return normalizeId(activePageId) || null;
    },
    [activePageId]
  );

  const setActivePageId = useCallback((pageId: string | null) => {
    const cleanPageId = normalizeId(pageId) || null;
    setActivePageIdState(cleanPageId);
    setActiveCanvas(null);

    try {
      if (cleanPageId) {
        localStorage.setItem(CANVAS_ACTIVE_PAGE_STORAGE_KEY, cleanPageId);
      } else {
        localStorage.removeItem(CANVAS_ACTIVE_PAGE_STORAGE_KEY);
      }
    } catch (error) {
      console.warn('Could not persist active canvas page:', error);
    }
  }, []);

  useEffect(() => {
    const loadDefaultPage = async () => {
      if (activePageId) return;

      try {
        const settings = (await dbGetFacebookSettings()) as MultiPageFacebookSettings;
        const pages = normalizeFacebookPages(settings);
        const defaultPage = getDefaultFacebookPage(pages, settings);

        if (defaultPage?.id) {
          setActivePageId(defaultPage.id);
        }
      } catch (error) {
        console.warn('CanvasContext: could not load default Facebook page.', error);
      }
    };

    loadDefaultPage();
  }, [activePageId, setActivePageId]);

  const fetchCanvases = useCallback(async (pageId?: string | null) => {
    const scopedPageId = resolvePageId(pageId);
    setIsLoadingCanvases(true);

    try {
      const fetchedCanvases = await (canvasService.dbFetchCanvases as any)(scopedPageId || undefined);
      const normalizedCanvases = Array.isArray(fetchedCanvases) ? fetchedCanvases : [];
      setCanvases(filterCanvasesForPage(normalizedCanvases, scopedPageId));
    } catch (error) {
      console.error('Failed to load canvases:', error);
      setCanvases([]);
    } finally {
      setIsLoadingCanvases(false);
    }
  }, [resolvePageId]);

  useEffect(() => {
    fetchCanvases(activePageId);
  }, [activePageId, fetchCanvases]);

  const getCanvasById = useCallback(async (canvasId: string, pageId?: string | null): Promise<ContentCanvas | undefined> => {
    const scopedPageId = resolvePageId(pageId);
    const localCanvas = canvases.find(c => c.id === canvasId && (!scopedPageId || !getCanvasPageId(c) || getCanvasPageId(c) === scopedPageId));
    if (localCanvas) return localCanvas;

    setIsLoadingCanvases(true);
    try {
      const canvas = await (canvasService.dbFetchCanvasById as any)(canvasId, scopedPageId || undefined);
      if (canvas) {
        setCanvases(prev => {
          const index = prev.findIndex(c => c.id === canvas.id);
          if (index !== -1) {
            const newCanvases = [...prev];
            newCanvases[index] = canvas;
            return filterCanvasesForPage(newCanvases, scopedPageId);
          }
          return filterCanvasesForPage([...prev, canvas], scopedPageId);
        });
      }
      return canvas;
    } catch (error) {
      console.error(`Failed to fetch canvas ${canvasId}:`, error);
      return undefined;
    } finally {
      setIsLoadingCanvases(false);
    }
  }, [canvases, resolvePageId]);

  const createCanvas = async (
    canvasData: Omit<ContentCanvas, 'id' | 'items' | 'status' | 'createdAt' | 'wipStateSnapshot'>,
    initialItems: CanvasItem[],
    wipSnapshot?: Omit<WIPState, 'overallImageFile' | 'overallTextFile' | 'activeCanvasIdForWIP'>,
    pageId?: string | null
  ): Promise<ContentCanvas> => {
    const scopedPageId = resolvePageId(pageId);
    setIsLoadingCanvases(true);

    try {
      const scopedCanvasData = attachPageToCanvasData(canvasData as any, scopedPageId);
      const scopedWipSnapshot = attachPageToCanvasData((wipSnapshot || {}) as any, scopedPageId);
      const newCanvas = await (canvasService.dbCreateCanvas as any)(scopedCanvasData, initialItems, scopedWipSnapshot, scopedPageId || undefined);
      const normalizedNewCanvas = attachPageToCanvasData(newCanvas as any, scopedPageId) as ContentCanvas;
      setCanvases(prevCanvases => filterCanvasesForPage([normalizedNewCanvas, ...prevCanvases], scopedPageId));
      return normalizedNewCanvas;
    } finally {
      setIsLoadingCanvases(false);
    }
  };

  const updateCanvas = async (updatedCanvasData: ContentCanvas, pageId?: string | null): Promise<ContentCanvas | undefined> => {
    const scopedPageId = resolvePageId(pageId || getCanvasPageId(updatedCanvasData));
    setIsLoadingCanvases(true);

    try {
      const scopedCanvas = attachPageToCanvasData(updatedCanvasData as any, scopedPageId) as ContentCanvas;
      const updatedCanvas = await (canvasService.dbUpdateCanvas as any)(scopedCanvas, scopedPageId || undefined);
      if (updatedCanvas) {
        const normalizedUpdatedCanvas = attachPageToCanvasData(updatedCanvas as any, scopedPageId) as ContentCanvas;
        setCanvases(prevCanvases => filterCanvasesForPage(prevCanvases.map(c => c.id === normalizedUpdatedCanvas.id ? normalizedUpdatedCanvas : c), scopedPageId));
        return normalizedUpdatedCanvas;
      }
      return undefined;
    } catch (error) {
      console.error(`Failed to update canvas ${updatedCanvasData.id}:`, error);
      return undefined;
    } finally {
      setIsLoadingCanvases(false);
    }
  };

  const updateCanvasStatus = async (canvasId: string, status: CanvasStatus, adminId?: string, adminFeedback?: string, pageId?: string | null): Promise<ContentCanvas | undefined> => {
    const scopedPageId = resolvePageId(pageId);
    setIsLoadingCanvases(true);

    try {
      const updatedCanvas = await (canvasService.dbUpdateCanvasStatus as any)(canvasId, status, adminId, adminFeedback, scopedPageId || undefined);
      if (updatedCanvas) {
        const normalizedUpdatedCanvas = attachPageToCanvasData(updatedCanvas as any, scopedPageId) as ContentCanvas;
        setCanvases(prev => filterCanvasesForPage(prev.map(c => c.id === canvasId ? normalizedUpdatedCanvas : c), scopedPageId));
        return normalizedUpdatedCanvas;
      }
      return undefined;
    } finally {
      setIsLoadingCanvases(false);
    }
  };

  const addOrUpdateCanvasItemAdaptation = async (canvasId: string, itemId: string, platform: SocialPlatform, adaptedText: string, pageId?: string | null): Promise<ContentCanvas | undefined> => {
    const scopedPageId = resolvePageId(pageId);
    setIsLoadingCanvases(true);

    try {
      const updatedCanvas = await (canvasService.dbAddOrUpdateCanvasItemAdaptation as any)(canvasId, itemId, platform, adaptedText, scopedPageId || undefined);
      if (updatedCanvas) {
        const normalizedUpdatedCanvas = attachPageToCanvasData(updatedCanvas as any, scopedPageId) as ContentCanvas;
        setCanvases(prev => filterCanvasesForPage(prev.map(c => c.id === canvasId ? normalizedUpdatedCanvas : c), scopedPageId));
        return normalizedUpdatedCanvas;
      }
      return undefined;
    } finally {
      setIsLoadingCanvases(false);
    }
  };

  const updateCanvasItemNotes = async (canvasId: string, itemId: string, notes: string, pageId?: string | null): Promise<ContentCanvas | undefined> => {
    const scopedPageId = resolvePageId(pageId);
    setIsLoadingCanvases(true);

    try {
      const updatedCanvas = await (canvasService.dbUpdateCanvasItemNotes as any)(canvasId, itemId, notes, scopedPageId || undefined);
      if (updatedCanvas) {
        const normalizedUpdatedCanvas = attachPageToCanvasData(updatedCanvas as any, scopedPageId) as ContentCanvas;
        setCanvases(prev => filterCanvasesForPage(prev.map(c => c.id === canvasId ? normalizedUpdatedCanvas : c), scopedPageId));
        return normalizedUpdatedCanvas;
      }
      return undefined;
    } finally {
      setIsLoadingCanvases(false);
    }
  };

  const deleteCanvas = async (canvasId: string, pageId?: string | null): Promise<void> => {
    const scopedPageId = resolvePageId(pageId);
    setIsLoadingCanvases(true);

    try {
      await (canvasService.dbDeleteCanvas as any)(canvasId, scopedPageId || undefined);
      setCanvases(prevCanvases => prevCanvases.filter(c => c.id !== canvasId));
    } finally {
      setIsLoadingCanvases(false);
    }
  };

  return (
    <CanvasContext.Provider value={{
      canvases,
      activePageId,
      setActivePageId,
      getCanvasById,
      createCanvas,
      updateCanvas,
      updateCanvasStatus,
      addOrUpdateCanvasItemAdaptation,
      updateCanvasItemNotes,
      deleteCanvas,
      isLoadingCanvases,
      fetchCanvases,
      activeCanvas,
      setActiveCanvas,
    }}>
      {children}
    </CanvasContext.Provider>
  );
};

export const useCanvas = (): CanvasContextType => {
  const context = useContext(CanvasContext);
  if (context === undefined) {
    throw new Error('useCanvas must be used within a CanvasProvider');
  }
  return context;
};
