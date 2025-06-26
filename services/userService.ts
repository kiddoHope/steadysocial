import { User, UserRole, Theme } from '../types';

// --- Configuration ---
const API_BASE_URL = 'https://pilot.sgcsystems.com/userAPI.php'; 
const JWT_STORAGE_KEY = 'user_auth_token';

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
            const errorData = await response.json().catch(() => ({ message: 'An unknown API error occurred.' }));
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }
        
        if (response.status === 204) {
            return {} as T;
        }

        return await response.json() as T;
    } catch (error) {
        console.error('API Request Failed:', error);
        throw error;
    }
};

type UserWithoutPassword = Omit<User, 'password'>;

// --- Service Functions ---

export const dbAutoLoginWithToken = async (): Promise<UserWithoutPassword | null> => {
    const token = localStorage.getItem(JWT_STORAGE_KEY);
    if (!token) {
        return null;
    }

    try {
        // This endpoint will check the JWT and return the user if it's valid
        return await apiRequest<UserWithoutPassword>('/users/autologin', {
            method: 'POST',
            body: JSON.stringify({ token }),
        });
    } catch (error) {
        // An error (like 401 Unauthorized) means an invalid or expired token
        localStorage.removeItem(JWT_STORAGE_KEY); // Clear the invalid token
        return null;
    }
};


export const dbFetchUsers = async (): Promise<UserWithoutPassword[]> => {
    return apiRequest<UserWithoutPassword[]>('/users');
};

export const dbVerifyUserCredentials = async (username: string, password_param: string): Promise<UserWithoutPassword | null> => {
    try {
        const response = await apiRequest<{user: UserWithoutPassword, token: string}>('/users/login', {
            method: 'POST',
            body: JSON.stringify({ username, password: password_param }),
        });
        
        if (response.token && response.user) {
            localStorage.setItem(JWT_STORAGE_KEY, response.token);
            return response.user;
        }
        return null;

    } catch (error) {
        // API returns 401 for invalid credentials, which apiRequest will throw.
        // We catch it and return null as per the function signature.
        return null;
    }
};

export const dbLogout = (): void => {
    localStorage.removeItem(JWT_STORAGE_KEY);
    // You may want to redirect the user or update the app state here
};


export const dbAddUser = async (userData: Omit<User, 'id'>): Promise<UserWithoutPassword> => {
    return apiRequest<UserWithoutPassword>('/users', {
        method: 'POST',
        body: JSON.stringify(userData),
    });
};

export const dbUpdateUserRole = async (userId: string, role: UserRole): Promise<UserWithoutPassword | null> => {
    return apiRequest<UserWithoutPassword>(`/users/${userId}/role`, {
        method: 'PUT',
        body: JSON.stringify({ role }),
    });
};

export const dbUpdateUserProfile = async (userId: string, updates: Partial<Pick<User, 'username' | 'profilePictureUrl' | 'theme'>>): Promise<UserWithoutPassword | null> => {
    return apiRequest<UserWithoutPassword>(`/users/${userId}/profile`, {
        method: 'PUT',
        body: JSON.stringify(updates),
    });
};

export const dbUpdateUserPassword = async (userId: string, newPassword_param: string): Promise<boolean> => {
    try {
        await apiRequest<{ success: boolean }>(`/users/${userId}/password`, {
            method: 'PUT',
            body: JSON.stringify({ password: newPassword_param }),
        });
        return true;
    } catch (error) {
        return false;
    }
};

export const dbGetUserTheme = async (userId: string): Promise<Theme | null> => {
    try {
        const result = await apiRequest<{ theme: Theme }>(`/users/${userId}/theme`);
        return result.theme;
    } catch (error) {
        return null;
    }
};

export const dbSetUserTheme = async (userId: string, theme: Theme): Promise<boolean> => {
    try {
        await apiRequest<{ success: boolean }>(`/users/${userId}/theme`, {
            method: 'PUT',
            body: JSON.stringify({ theme }),
        });
        return true;
    } catch (error) {
        return false;
    }
};

export const dbFetchUserById = async (userId: string): Promise<UserWithoutPassword | null> => {
     try {
        return await apiRequest<UserWithoutPassword>(`/users/${userId}`);
    } catch (error) {
        return null;
    }
};
export const dbDeleteUser = async (userId: string): Promise<boolean> => {
    try {
        await apiRequest(`/users/${userId}`, { method: 'DELETE' });
        return true;
    } catch (error) {
        return false;
    }
};