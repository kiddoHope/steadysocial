import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { ContentCanvas, CanvasItem, CanvasStatus, SocialPlatform, WIPState } from '../types';
import * as canvasService from '../services/canvasService'; // Import new async service

interface CanvasContextType {
  canvases: ContentCanvas[];
  getCanvasById: (canvasId: string) => Promise<ContentCanvas | undefined>; // Now async
  createCanvas: (
    canvasData: Omit<ContentCanvas, 'id' | 'items' | 'status' | 'createdAt' | 'wipStateSnapshot'>, 
    initialItems: CanvasItem[],
    wipSnapshot?: Omit<WIPState, 'overallImageFile' | 'overallTextFile' | 'activeCanvasIdForWIP'>
  ) => Promise<ContentCanvas>; // Now async
  updateCanvas: (updatedCanvas: ContentCanvas) => Promise<ContentCanvas | undefined>; // Now async
  updateCanvasStatus: (canvasId: string, status: CanvasStatus, adminId?: string, adminFeedback?: string) => Promise<ContentCanvas | undefined>; // Now async
  addOrUpdateCanvasItemAdaptation: (canvasId: string, itemId: string, platform: SocialPlatform, adaptedText: string) => Promise<ContentCanvas | undefined>; // Now async
  updateCanvasItemNotes: (canvasId: string, itemId: string, notes: string) => Promise<ContentCanvas | undefined>; // Now async
  deleteCanvas: (canvasId: string) => Promise<void>; // Now async
  isLoadingCanvases: boolean;
  fetchCanvases: () => Promise<void>; // Added to explicitly fetch canvases
}

const CanvasContext = createContext<CanvasContextType | undefined>(undefined);

export const CanvasProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [canvases, setCanvases] = useState<ContentCanvas[]>([]);
  const [isLoadingCanvases, setIsLoadingCanvases] = useState(true);

  const fetchCanvases = useCallback(async () => {
    setIsLoadingCanvases(true);
    try {
      const fetchedCanvases = await canvasService.dbFetchCanvases();
      setCanvases(fetchedCanvases);
    } catch (error) {
      console.error("Failed to load canvases:", error);
      // Optionally set an error state
    } finally {
      setIsLoadingCanvases(false);
    }
  }, []);

  useEffect(() => {
    fetchCanvases();
  }, [fetchCanvases]);

  const getCanvasById = useCallback(async (canvasId: string): Promise<ContentCanvas | undefined> => {
    // First, check local state for minor optimization if data is fresh,
    // but typically this would always go to the service for fresh data.
    // For simulation, if it's in local state, return it, otherwise fetch.
    const localCanvas = canvases.find(c => c.id === canvasId);
    if (localCanvas) return localCanvas; // Could be slightly stale, real DB would fetch.
    
    // Simulate fetching if not immediately available or to ensure freshness
    setIsLoadingCanvases(true);
    try {
        const canvas = await canvasService.dbFetchCanvasById(canvasId);
        // Optionally update local 'canvases' array if fetched canvas is newer or not present
        if (canvas) {
            setCanvases(prev => {
                const index = prev.findIndex(c => c.id === canvas.id);
                if (index !== -1) {
                    const newCanvases = [...prev];
                    newCanvases[index] = canvas;
                    return newCanvases;
                }
                return [...prev, canvas]; // Add if new, though dbFetchCanvases should be primary source.
            });
        }
        return canvas;
    } catch (error) {
        console.error(`Failed to fetch canvas ${canvasId}:`, error);
        return undefined;
    } finally {
        setIsLoadingCanvases(false);
    }
  }, [canvases]);

  const createCanvas = async (
    canvasData: Omit<ContentCanvas, 'id' | 'items' | 'status' | 'createdAt' | 'wipStateSnapshot'>,
    initialItems: CanvasItem[],
    wipSnapshot?: Omit<WIPState, 'overallImageFile' | 'overallTextFile' | 'activeCanvasIdForWIP'>
  ): Promise<ContentCanvas> => {
    setIsLoadingCanvases(true);
    try {
      const newCanvas = await canvasService.dbCreateCanvas(canvasData, initialItems, wipSnapshot);
      setCanvases(prevCanvases => [newCanvas, ...prevCanvases]);
      return newCanvas;
    } finally {
      setIsLoadingCanvases(false);
    }
  };

  const updateCanvas = async (updatedCanvasData: ContentCanvas): Promise<ContentCanvas | undefined> => {
    setIsLoadingCanvases(true); // Or a different loading state for updates
    try {
      const updatedCanvas = await canvasService.dbUpdateCanvas(updatedCanvasData);
      if (updatedCanvas) {
        setCanvases(prevCanvases => prevCanvases.map(c => c.id === updatedCanvas.id ? updatedCanvas : c));
      }
      return updatedCanvas;
    } catch (error) {
      console.error(`Failed to update canvas ${updatedCanvasData.id}:`, error); // Log error for debugging
    } finally {
      setIsLoadingCanvases(false);
    }
  };
  
  const updateCanvasStatus = async (canvasId: string, status: CanvasStatus, adminId?: string, adminFeedback?: string): Promise<ContentCanvas | undefined> => {
    setIsLoadingCanvases(true);
    try {
        const updatedCanvas = await canvasService.dbUpdateCanvasStatus(canvasId, status, adminId, adminFeedback);
        if (updatedCanvas) {
            setCanvases(prev => prev.map(c => c.id === canvasId ? updatedCanvas : c));
        }
        return updatedCanvas;
    } finally {
        setIsLoadingCanvases(false);
    }
  };

  const addOrUpdateCanvasItemAdaptation = async (canvasId: string, itemId: string, platform: SocialPlatform, adaptedText: string): Promise<ContentCanvas | undefined> => {
    setIsLoadingCanvases(true); // Or a specific item update loading state
    try {
        const updatedCanvas = await canvasService.dbAddOrUpdateCanvasItemAdaptation(canvasId, itemId, platform, adaptedText);
        if (updatedCanvas) {
            setCanvases(prev => prev.map(c => c.id === canvasId ? updatedCanvas : c));
        }
        return updatedCanvas;
    } finally {
        setIsLoadingCanvases(false);
    }
  };
  
  const updateCanvasItemNotes = async (canvasId: string, itemId: string, notes: string): Promise<ContentCanvas | undefined> => {
    setIsLoadingCanvases(true); // Or a specific item update loading state
    try {
        const updatedCanvas = await canvasService.dbUpdateCanvasItemNotes(canvasId, itemId, notes);
        if (updatedCanvas) {
            setCanvases(prev => prev.map(c => c.id === canvasId ? updatedCanvas : c));
        }
        return updatedCanvas;
    } finally {
        setIsLoadingCanvases(false);
    }
  };

  const deleteCanvas = async (canvasId: string): Promise<void> => {
    setIsLoadingCanvases(true);
    try {
      await canvasService.dbDeleteCanvas(canvasId);
      setCanvases(prevCanvases => prevCanvases.filter(c => c.id !== canvasId));
    } finally {
      setIsLoadingCanvases(false);
    }
  };

  return (
    <CanvasContext.Provider value={{
      canvases,
      getCanvasById,
      createCanvas,
      updateCanvas,
      updateCanvasStatus,
      addOrUpdateCanvasItemAdaptation,
      updateCanvasItemNotes,
      deleteCanvas,
      isLoadingCanvases,
      fetchCanvases
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
