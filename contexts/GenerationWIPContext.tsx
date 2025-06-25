import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { WIPState, SocialPlatform, CaptionTone, ContentCanvas } from '../types';

// Initial state, files will always be null on fresh load.
const initialWIPState: WIPState = {
  canvasTitle: '',
  customPrompt: '',
  platformContext: SocialPlatform.General,
  tone: CaptionTone.Friendly,
  numberOfIdeas: 3,
  overallImagePreview: null,
  overallImageFile: null,       // Transient
  overallTextFileContent: null,
  overallTextFile: null,        // Transient
  parsedRawItems: null,
  activeCanvasIdForWIP: null, // ID of the ContentCanvas this WIP is for, or null for new
};

interface GenerationWIPContextType {
  wipState: WIPState;
  setWIPState: (newState: Partial<WIPState> | ((prevState: WIPState) => WIPState)) => void;
  initializeWIPFromCanvas: (canvas: ContentCanvas | null) => void; // Pass full canvas or null for new
  clearWIPState: () => void;
  setWIPOverallImage: (file: File | null, preview: string | null) => void;
  setWIPOverallTextFile: (file: File | null, content: string | null) => void;
  getWIPScreenshotForSave: () => Omit<WIPState, 'overallImageFile' | 'overallTextFile' | 'activeCanvasIdForWIP'>;
}

const GenerationWIPContext = createContext<GenerationWIPContextType | undefined>(undefined);

export const GenerationWIPProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [wipState, setWipStateInternal] = useState<WIPState>(initialWIPState);

  // Set WIP state, ensuring File objects are handled correctly (i.e., remain transient)
  const setWIPState = useCallback((newStateOrCallback: Partial<WIPState> | ((prevState: WIPState) => WIPState)) => {
    setWipStateInternal(prevState => {
      const stateUpdate = typeof newStateOrCallback === 'function' ? newStateOrCallback(prevState) : newStateOrCallback;
      
      // If updating specific file-related fields, allow them. Otherwise, preserve existing File objects or keep them null.
      const newOverallImageFile = ('overallImageFile' in stateUpdate)
        ? (stateUpdate.overallImageFile !== undefined ? stateUpdate.overallImageFile : null)
        : prevState.overallImageFile;
      const newOverallTextFile = ('overallTextFile' in stateUpdate)
        ? (stateUpdate.overallTextFile !== undefined ? stateUpdate.overallTextFile : null)
        : prevState.overallTextFile;

      return {
        ...prevState,
        ...stateUpdate,
        overallImageFile: newOverallImageFile,
        overallTextFile: newOverallTextFile,
      };
    });
  }, []);

  // Initializes WIP based on a loaded canvas or resets for a new one
  const initializeWIPFromCanvas = useCallback((canvas: ContentCanvas | null) => {
    if (canvas && canvas.wipStateSnapshot) { // If canvas has a persisted WIP snapshot
      setWipStateInternal({
        ...initialWIPState, // Start with defaults for files
        ...canvas.wipStateSnapshot, // Load persisted text/config data
        activeCanvasIdForWIP: canvas.id, // Link to this canvas
         // Explicitly ensure files are null unless re-added by user interaction
        overallImageFile: null,
        overallTextFile: null,
      });
    } else if (canvas) { // Canvas exists but no WIP snapshot (e.g. older canvas)
        setWipStateInternal({
            ...initialWIPState,
            canvasTitle: canvas.title || '',
            customPrompt: canvas.overallCustomPrompt,
            platformContext: canvas.overallPlatformContext,
            tone: canvas.overallTone,
            overallImagePreview: canvas.overallImagePreview ?? null,
            overallTextFileContent: canvas.overallTextFileContent ?? null,
            activeCanvasIdForWIP: canvas.id,
            overallImageFile: null, 
            overallTextFile: null,
        });
    }
     else { // No canvas provided, reset to initial state for a new canvas
      setWipStateInternal({ ...initialWIPState, activeCanvasIdForWIP: null });
    }
  }, []);
  
  const clearWIPState = useCallback(() => {
    setWipStateInternal(initialWIPState);
  }, []);

  // Specific setters for fields that include File objects, to manage their transience
  const setWIPOverallImage = useCallback((file: File | null, preview: string | null) => {
    setWIPState(prev => ({ ...prev, overallImageFile: file, overallImagePreview: preview }));
  }, [setWIPState]);

  const setWIPOverallTextFile = useCallback((file: File | null, content: string | null) => {
    setWIPState(prev => ({ ...prev, overallTextFile: file, overallTextFileContent: content }));
  }, [setWIPState]);

  // Utility to get a "snapshot" of WIP suitable for saving (without File objects)
  const getWIPScreenshotForSave = useCallback((): Omit<WIPState, 'overallImageFile' | 'overallTextFile' | 'activeCanvasIdForWIP'> => {
    const { overallImageFile, overallTextFile, activeCanvasIdForWIP, ...restForSave } = wipState;
    return restForSave;
  }, [wipState]);


  return (
    <GenerationWIPContext.Provider value={{ 
      wipState, 
      setWIPState, 
      initializeWIPFromCanvas,
      clearWIPState, 
      setWIPOverallImage, 
      setWIPOverallTextFile,
      getWIPScreenshotForSave
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
