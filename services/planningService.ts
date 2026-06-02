const baseURL = "http://localhost:3001";

const apiRequest = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
    try {
        const response = await fetch(`${baseURL}${path}`, {
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                ...options.headers,
            },
            ...options,
        });

        if (!response.ok) {
            const errorData = await response
                .json()
                .catch(() => ({ message: 'An unknown API error occurred.' }));

            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }

        if (response.status === 204 || options.method === 'DELETE') {
            return undefined as T;
        }

        const text = await response.text();

        if (!text) {
            return undefined as T;
        }

        return JSON.parse(text) as T;
    } catch (error) {
        console.error('API Request Failed:', error);
        throw error;
    }
};

export interface PlanningItem {
    name: string;
    path: string;
    type: 'directory' | 'file';
    fileType?: 'md' | 'docx' | 'xlsx' | 'csv' | 'html' | 'pdf' | string;
    size?: number;
    updatedAt?: number;
}

export interface PlanningFileContent {
    success: boolean;
    fileType: string;
    content?: string;
    html?: string;
    sheets?: Record<string, any[][]>;
    data?: any[][];
}

export const getPlanningFiles = async (subPath: string = ''): Promise<PlanningItem[]> => {
    const res = await apiRequest<{ success: boolean; files: PlanningItem[] }>(`/planning/files?path=${encodeURIComponent(subPath)}`);
    return res.files;
};

export const createPlanningFolder = async (folderPath: string): Promise<void> => {
    await apiRequest<void>('/planning/folder', {
      method: 'POST',
      body: JSON.stringify({ path: folderPath }),
    });
};

export const createPlanningFile = async (
    filePath: string,
    type: 'md' | 'docx' | 'xlsx' | 'csv' | 'html' | 'pdf',
    content: any,
    isBase64: boolean = false
): Promise<void> => {
    await apiRequest<void>('/planning/file', {
      method: 'POST',
      body: JSON.stringify({ path: filePath, type, content, isBase64 }),
    });
};

export const getPlanningFileContent = async (filePath: string): Promise<PlanningFileContent> => {
    return apiRequest<PlanningFileContent>(`/planning/file/content?path=${encodeURIComponent(filePath)}`);
};

export const getPlanningFileRawUrl = (filePath: string): string => {
    return `${baseURL}/planning/file/content?path=${encodeURIComponent(filePath)}`;
};

export const deletePlanningItem = async (itemPath: string): Promise<void> => {
    await apiRequest<void>('/planning/item', {
      method: 'DELETE',
      body: JSON.stringify({ path: itemPath }),
    });
};

export const renamePlanningItem = async (oldPath: string, newPath: string): Promise<void> => {
    await apiRequest<void>('/planning/rename', {
      method: 'POST',
      body: JSON.stringify({ oldPath, newPath }),
    });
};

export interface SearchResult {
    path: string;
    name: string;
    snippet: string;
    tags: string[];
    links: string[];
}

export const searchPlanningWorkspace = async (query: string): Promise<SearchResult[]> => {
    if (!query) return [];
    const res = await apiRequest<{ success: boolean; results: SearchResult[] }>('/planning/search', {
        method: 'POST',
        body: JSON.stringify({ query })
    });
    return res.results || [];
};
