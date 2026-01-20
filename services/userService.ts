import { User, UserRole, Theme } from '../types';
import { ResetPasswordPayload, VerifyResetCodePayload, VerifyCodePayload} from '../types'
import { signPayload } from '../utils/hashPayload';

// --- Configuration ---
const API_BASE_URL = process.env.VITE_API_KEY; 

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

const generateSecret = (head: string, content: string) => {
 const secret = [
    process.env.VITE_ENCRYPTED_KEY,
    head,
    content
 ];

 return secret;
}

// --- Service Functions ---

export const dbGetUserByToken = async (token: string): Promise<UserWithoutPassword | null> => {
    if (!token) {
        return null;
    }

    const secret = generateSecret(
        'autoLogin',
        'log-'+token
    )

    const signature = await signPayload(token, secret, {
        salt: 'auto-login',
        info: 'auto-login-request'
    })
    
    try {
        // This endpoint will check the JWT and return the user if it's valid
        return await apiRequest<UserWithoutPassword>('/users/autologin', {
            method: 'POST',
            body: JSON.stringify({ signature }),
        });
    } catch (error) {
        // An error (like 401 Unauthorized) means an invalid or expired token
        return null;
    }
};

export const dbFetchUsers = async (): Promise<UserWithoutPassword[]> => {
    return apiRequest<UserWithoutPassword[]>('/users');
};

export const dbVerifyUserCredentials = async (username: string, password_param: string): Promise<{ user: UserWithoutPassword, token: string } | null> => {
    try {
        const response = await apiRequest<{user: UserWithoutPassword, token: string}>('/users/login', {
            method: 'POST',
            body: JSON.stringify({ username, password: password_param }),
        });
        
        if (response.token && response.user) {
            return response;
        }
        return null;

    } catch (error) {
        // API returns 401 for invalid credentials, which apiRequest will throw.
        // We catch it and return null as per the function signature.
        return null;
    }
};

export const dbInvalidateToken = async (token: string): Promise<void> => {
    await apiRequest('/users/logout', {
        method: 'POST',
        body: JSON.stringify({ token }),
    });
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

export const dbForgotPassword = async (email: string): Promise<{ success: boolean; message: string }> => {
    const FORGOT_PASSWORD_URL = 'https://steadysocial.dropletsofnature.com/forgotpassword.php';
    try {
        const response = await fetch(FORGOT_PASSWORD_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({ email }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'An unknown API error occurred.' }));
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('API Request Failed for Forgot Password:', error);
        throw error; // Re-throw to be handled by the calling component
    }
};

export const dbVerifyPasswordResetCode = async (payload: VerifyResetCodePayload): Promise<{ success: boolean; message: string }> => {
    // This endpoint checks the code and its expiry, but does not change the password.
    // It's a precursor to the final reset step.
    return apiRequest<{ success: boolean; message: string }>('/users/verify-reset-code', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
};

export const dbResetPassword = async (payload: ResetPasswordPayload): Promise<{ success: boolean; message: string }> => {
    return apiRequest<{ success: boolean; message: string }>('/users/reset-password', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
};

export const dbVerifyCode = async (payload: VerifyCodePayload): Promise<{ success: boolean; message: string }> => {
    // This function corresponds to the `verify_code.php` script.
    // The path `/users/verify-code` assumes server-side routing maps this to the script.
    return apiRequest<{ success: boolean; message: string }>('/users/verify-code', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
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