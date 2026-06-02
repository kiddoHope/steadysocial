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

export const getBoards = async (): Promise<string[]> => {
    const res = await apiRequest<{ success: boolean; boards: string[] }>('/boards');
    return res.boards;
};

export const getBoardState = async (name: string): Promise<any> => {
    return apiRequest<any>(`/boards/${encodeURIComponent(name)}`);
};

export const updateBoardState = async (name: string, state: any): Promise<void> => {
    await apiRequest<void>(`/boards/${encodeURIComponent(name)}`, {
        method: 'PUT',
        body: JSON.stringify(state),
    });
};

export const deleteBoard = async (name: string): Promise<void> => {
    await apiRequest<void>(`/boards/${encodeURIComponent(name)}`, {
        method: 'DELETE',
    });
};

export const renameBoard = async (name: string, newName: string): Promise<void> => {
    await apiRequest<void>(`/boards/${encodeURIComponent(name)}/rename`, {
        method: 'POST',
        body: JSON.stringify({ newName }),
    });
};
