import { ContentCanvas, CanvasItem, CanvasStatus, SocialPlatform } from '../types';
import { 
    getAllCanvasesDB, 
    getCanvasDB, 
    saveCanvasDB, 
    deleteCanvasDB 
} from '../utils/db'; // Import our new DB functions

// --- Public Service Functions ---

// Get all canvases, sorted by newest first
export const getCanvases = async (): Promise<ContentCanvas[]> => {
    return await getAllCanvasesDB();
};

export const getCanvasById = async (canvasId: string): Promise<ContentCanvas | undefined> => {
    return await getCanvasDB(canvasId);
};

export const createCanvas = async (
    canvasData: Omit<ContentCanvas, 'id' | 'items' | 'status' | 'createdAt'>, 
    initialItems: CanvasItem[]
): Promise<ContentCanvas> => {
    const newCanvas: ContentCanvas = {
        ...canvasData,
        id: `canvas-${Date.now()}`,
        items: initialItems,
        status: CanvasStatus.DRAFT,
        createdAt: Date.now(),
    };
    await saveCanvasDB(newCanvas);
    return newCanvas;
};

export const updateCanvas = async (updatedCanvas: ContentCanvas): Promise<ContentCanvas> => {
    await saveCanvasDB(updatedCanvas);
    return updatedCanvas;
};

export const updateCanvasStatus = async (
    canvasId: string, 
    status: CanvasStatus, 
    adminId?: string, 
    adminFeedback?: string
): Promise<ContentCanvas | undefined> => {
    const canvas = await getCanvasDB(canvasId);
    if (canvas) {
        canvas.status = status;
        canvas.reviewedAt = Date.now();
        if (adminId) {
            canvas.reviewedBy = adminId;
        }
        if (status === CanvasStatus.NEEDS_REVISION && adminFeedback) {
            canvas.adminFeedback = adminFeedback;
        }
        if (status === CanvasStatus.PENDING_REVIEW) {
            canvas.submittedAt = Date.now();
        }
        await saveCanvasDB(canvas);
        return canvas;
    }
    return undefined;
};

export const addOrUpdateCanvasItemAdaptation = async (
  canvasId: string, 
  itemId: string, 
  platform: SocialPlatform, 
  adaptedText: string
): Promise<ContentCanvas | undefined> => {
    const canvas = await getCanvasDB(canvasId);
    if (canvas) {
        const itemIndex = canvas.items.findIndex(item => item.id === itemId);
        if (itemIndex !== -1) {
            if (!canvas.items[itemIndex].adaptations) {
                canvas.items[itemIndex].adaptations = {};
            }
            canvas.items[itemIndex].adaptations[platform] = { text: adaptedText };
            await saveCanvasDB(canvas);
            return canvas;
        }
    }
    return undefined;
};

export const updateCanvasItemNotes = async (
    canvasId: string, 
    itemId: string, 
    notes: string
): Promise<ContentCanvas | undefined> => {
    const canvas = await getCanvasDB(canvasId);
    if (canvas) {
        const itemIndex = canvas.items.findIndex(item => item.id === itemId);
        if (itemIndex !== -1) {
            canvas.items[itemIndex].notesForAdmin = notes;
            await saveCanvasDB(canvas);
            return canvas;
        }
    }
    return undefined;
};

export const deleteCanvas = async (canvasId: string): Promise<void> => {
    await deleteCanvasDB(canvasId);
};