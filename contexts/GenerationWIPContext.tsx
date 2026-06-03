import React, { createContext, useContext, useState, ReactNode, useCallback, useEffect } from 'react';
import { WIPState, SocialPlatform, CaptionTone, ContentCanvas } from '../types';

const initialWIPState: WIPState = {
  canvasTitle: '',
  customPrompt: '',
  platformContext: SocialPlatform.General,
  tone: CaptionTone.Friendly,
  numberOfIdeas: 3,
  folderPath: null,
  numberOfGenerations: 1,
  imageMode: 'generate',
  overallImagePreview: null,
  overallImageFile: null,
  overallTextFileContent: null,
  overallTextFile: null,
  parsedRawItems: null,
  activeCanvasIdForWIP: null,
};

interface GenerationWIPContextType {
  wipState: WIPState;
  activePageId: string | null;
  setActivePageId: (pageId: string | null) => void;
  setWIPState: (newState: Partial<WIPState> | ((prevState: WIPState) => WIPState)) => void;
  initializeWIPFromCanvas: (canvas: ContentCanvas | null) => void;
  clearWIPState: () => void;
  setWIPOverallImage: (file: File | null, preview: string | null) => void;
  setWIPOverallTextFile: (file: File | null, content: string | null) => void;
  getWIPScreenshotForSave: () => Omit<WIPState, 'overallImageFile' | 'overallTextFile' | 'activeCanvasIdForWIP'>;
}

const GenerationWIPContext = createContext<GenerationWIPContextType | undefined>(undefined);

const WIP_ACTIVE_PAGE_STORAGE_KEY = 'steadysocial_generation_wip_active_page_id';

const normalizeId = (value?: string | null): string => String(value || '').trim();

const getCanvasPageId = (canvas?: ContentCanvas | null): string => {
  const item = canvas as any;
  return normalizeId(
    item?.facebookPageId ||
    item?.pageId ||
    item?.targetPageId ||
    item?.metaPageId ||
    item?.wipStateSnapshot?.facebookPageId ||
    item?.wipStateSnapshot?.pageId ||
    ''
  );
};

export const GenerationWIPProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [wipState, setWipStateInternal] = useState<WIPState>(initialWIPState);
  const [activePageId, setActivePageIdInternal] = useState<string | null>(() => {
    try {
      return normalizeId(localStorage.getItem(WIP_ACTIVE_PAGE_STORAGE_KEY)) || null;
    } catch {
      return null;
    }
  });

  const setActivePageId = useCallback((pageId: string | null) => {
    const cleanPageId = normalizeId(pageId) || null;
    setActivePageIdInternal(cleanPageId);

    try {
      if (cleanPageId) {
        localStorage.setItem(WIP_ACTIVE_PAGE_STORAGE_KEY, cleanPageId);
      } else {
        localStorage.removeItem(WIP_ACTIVE_PAGE_STORAGE_KEY);
      }
    } catch (error) {
      console.warn('Could not persist active WIP page:', error);
    }
  }, []);

  useEffect(() => {
    setWipStateInternal(prev => ({
      ...(prev as any),
      facebookPageId: activePageId || undefined,
      pageId: activePageId || undefined,
    }));
  }, [activePageId]);

  const setWIPState = useCallback((newStateOrCallback: Partial<WIPState> | ((prevState: WIPState) => WIPState)) => {
    setWipStateInternal(prevState => {
      const stateUpdate = typeof newStateOrCallback === 'function' ? newStateOrCallback(prevState) : newStateOrCallback;
      const newOverallImageFile = ('overallImageFile' in stateUpdate)
        ? (stateUpdate.overallImageFile !== undefined ? stateUpdate.overallImageFile : null)
        : prevState.overallImageFile;
      const newOverallTextFile = ('overallTextFile' in stateUpdate)
        ? (stateUpdate.overallTextFile !== undefined ? stateUpdate.overallTextFile : null)
        : prevState.overallTextFile;

      return {
        ...(prevState as any),
        ...(stateUpdate as any),
        facebookPageId: activePageId || (stateUpdate as any)?.facebookPageId,
        pageId: activePageId || (stateUpdate as any)?.pageId,
        overallImageFile: newOverallImageFile,
        overallTextFile: newOverallTextFile,
      } as WIPState;
    });
  }, [activePageId]);

  const initializeWIPFromCanvas = useCallback((canvas: ContentCanvas | null) => {
    const canvasPageId = getCanvasPageId(canvas);
    if (canvasPageId) {
      setActivePageId(canvasPageId);
    }

    if (canvas && canvas.wipStateSnapshot) {
      setWipStateInternal({
        ...(initialWIPState as any),
        ...(canvas.wipStateSnapshot as any),
        facebookPageId: canvasPageId || activePageId || undefined,
        pageId: canvasPageId || activePageId || undefined,
        activeCanvasIdForWIP: canvas.id,
        overallImageFile: null,
        overallTextFile: null,
      } as WIPState);
    } else if (canvas) {
      setWipStateInternal({
        ...(initialWIPState as any),
        canvasTitle: canvas.title || '',
        customPrompt: canvas.overallCustomPrompt,
        platformContext: canvas.overallPlatformContext,
        tone: canvas.overallTone,
        overallImagePreview: canvas.overallImagePreview ?? null,
        overallTextFileContent: canvas.overallTextFileContent ?? null,
        facebookPageId: canvasPageId || activePageId || undefined,
        pageId: canvasPageId || activePageId || undefined,
        activeCanvasIdForWIP: canvas.id,
        overallImageFile: null,
        overallTextFile: null,
      } as WIPState);
    } else {
      setWipStateInternal({
        ...(initialWIPState as any),
        facebookPageId: activePageId || undefined,
        pageId: activePageId || undefined,
        activeCanvasIdForWIP: null,
      } as WIPState);
    }
  }, [activePageId, setActivePageId]);

  const clearWIPState = useCallback(() => {
    setWipStateInternal({
      ...(initialWIPState as any),
      facebookPageId: activePageId || undefined,
      pageId: activePageId || undefined,
    } as WIPState);
  }, [activePageId]);

  const setWIPOverallImage = useCallback((file: File | null, preview: string | null) => {
    setWIPState(prev => ({ ...prev, overallImageFile: file, overallImagePreview: preview }));
  }, [setWIPState]);

  const setWIPOverallTextFile = useCallback((file: File | null, content: string | null) => {
    setWIPState(prev => ({ ...prev, overallTextFile: file, overallTextFileContent: content }));
  }, [setWIPState]);

  const getWIPScreenshotForSave = useCallback((): Omit<WIPState, 'overallImageFile' | 'overallTextFile' | 'activeCanvasIdForWIP'> => {
    const { overallImageFile, overallTextFile, activeCanvasIdForWIP, ...restForSave } = wipState as any;
    return {
      ...restForSave,
      facebookPageId: activePageId || restForSave.facebookPageId,
      pageId: activePageId || restForSave.pageId,
    } as Omit<WIPState, 'overallImageFile' | 'overallTextFile' | 'activeCanvasIdForWIP'>;
  }, [wipState, activePageId]);

  return (
    <GenerationWIPContext.Provider value={{
      wipState,
      activePageId,
      setActivePageId,
      setWIPState,
      initializeWIPFromCanvas,
      clearWIPState,
      setWIPOverallImage,
      setWIPOverallTextFile,
      getWIPScreenshotForSave,
    }}>
      {children}
    </GenerationWIPContext.Provider>
  );
};

export const useGenerationWIP = (): GenerationWIPContextType => {
  const context = useContext(GenerationWIPContext);
  if (context === undefined) {
    throw new Error('useGenerationWIP must be used within a GenerationWIPProvider');
  }
  return context;
};
