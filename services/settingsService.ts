import { FacebookSettings } from '../types';

const baseURL = "https://steadysocial.dropletsofnature.com/userAPI.php";

// --- Configuration ---
// IMPORTANT: Replace this URL with the actual path to your api.php file on your server.

// --- Helper for API Requests ---
// This helper can be shared across your API service files.
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
            const errorData = await response.json().catch(() => ({ message: 'An unknown API error occurred.' }));
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }

        return await response.json() as T;
    } catch (error) {
        console.error('API Request Failed:', error);
        throw error;
    }
};

// --- Service Functions ---

export const dbGetFacebookSettings = async (): Promise<FacebookSettings> => {
    return apiRequest<FacebookSettings>('/settings/facebook');
};

export const dbSaveFacebookSettings = async (newSettings: Partial<FacebookSettings>): Promise<FacebookSettings> => {
    return apiRequest<FacebookSettings>('/settings/facebook', {
        method: 'PUT',
        body: JSON.stringify(newSettings),
    });
};
