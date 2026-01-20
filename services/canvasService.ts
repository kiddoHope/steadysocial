import { ContentCanvas, CanvasItem, CanvasStatus, SocialPlatform, WIPState } from '../types';

// --- Configuration ---
// IMPORTANT: Replace this URL with the actual path to your api.php file on your server.
const API_BASE_URL = 'https://steadysocial.dropletsofnature.com/canvasAPI.php'; 


// --- Helper for API Requests ---
const apiRequest = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
    try {
        const response = await fetch(`${API_BASE_URL}${path}`, {
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                ...options.headers,
            },
            ...options,
        });

        if (!response.ok) {
            // Try to get a meaningful error message from the API response
            const errorData = await response.json().catch(() => ({ message: 'An unknown API error occurred.' }));
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }
        
        // For DELETE requests that might not return a body but are successful
        if (response.status === 204 || options.method === 'DELETE') {
            return {} as T;
        }

        return await response.json() as T;
    } catch (error) {
        console.error('API Request Failed:', error);
        throw error; // Re-throw the error to be handled by the calling function
    }
};


// --- Service Functions (Connected to PHP Backend) ---

export const dbFetchCanvases = async (): Promise<ContentCanvas[]> => {
    return apiRequest<ContentCanvas[]>('/canvases');
};

export const dbFetchCanvasById = async (canvasId: string): Promise<ContentCanvas | undefined> => {
    return apiRequest<ContentCanvas>(`/canvases/${canvasId}`);
};

export const dbCreateCanvas = async (
    canvasData: Omit<ContentCanvas, 'id' | 'items' | 'status' | 'createdAt' | 'wipStateSnapshot'>,
    initialItems: CanvasItem[],
    wipSnapshot?: Omit<WIPState, 'overallImageFile' | 'overallTextFile' | 'activeCanvasIdForWIP'>
): Promise<ContentCanvas> => {
    const body = { ...canvasData, initialItems, wipSnapshot: wipSnapshot?.parsedRawItems };
    
    return apiRequest<ContentCanvas>('/canvases', {
        method: 'POST',
        body: JSON.stringify(body),
    });
};

export const dbUpdateCanvas = async (updatedCanvasData: ContentCanvas): Promise<ContentCanvas | undefined> => {
    return apiRequest<ContentCanvas>(`/canvases/${updatedCanvasData.id}`, {
        method: 'PUT',
        body: JSON.stringify(updatedCanvasData),
    });
};

export const dbDeleteCanvas = async (canvasId: string): Promise<boolean> => {
    try {
        await apiRequest<any>(`/canvases/${canvasId}`, { method: 'DELETE' });
        return true;
    } catch (error) {
        console.error(`Failed to delete canvas ${canvasId}`, error);
        return false;
    }
};

export const dbUpdateCanvasStatus = async (
    canvasId: string,
    status: CanvasStatus,
    adminId?: string,
    adminFeedback?: string
): Promise<ContentCanvas | undefined> => {
    const body = { status, adminId, adminFeedback };
    return apiRequest<ContentCanvas>(`/canvases/${canvasId}/status`, {
        method: 'PUT',
        body: JSON.stringify(body),
    });
};

export const dbAddOrUpdateCanvasItemAdaptation = async (
    canvasId: string,
    itemId: string,
    platform: SocialPlatform,
    adaptedText: string
): Promise<ContentCanvas | undefined> => {
    const body = { platform, adaptedText };
    return apiRequest<ContentCanvas>(`/canvases/${canvasId}/items/${itemId}/adaptations`, {
        method: 'PUT',
        body: JSON.stringify(body),
    });
};

export const dbUpdateCanvasItemNotes = async (
    canvasId: string,
    itemId: string,
    notes: string
): Promise<ContentCanvas | undefined> => {
    const body = { notes };
    return apiRequest<ContentCanvas>(`/canvases/${canvasId}/items/${itemId}/notes`, {
        method: 'PUT',
        body: JSON.stringify(body),
    });
};
