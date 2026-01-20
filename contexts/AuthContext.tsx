
import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { User, UserRole } from '../types';
import * as userService from '../services/userService'; 

const SESSION_TOKEN_KEY = 'user_auth_token';

interface AuthContextType {
  currentUser: Omit<User, 'password'> | null;
  login: (username_param: string, password_param: string) => Promise<boolean>;
  logout: () => void;
  loading: boolean; 
  initialAuthCheckComplete: boolean; 
  hasRole: (role: UserRole) => boolean;
  users: Omit<User, 'password'>[];
  addUser: (user: Omit<User, 'id' | 'password'> & { password_param: string }) => Promise<void>;
  updateUserRole: (userId: string, role: UserRole) => Promise<void>;
  updateUserProfile: (userId: string, updates: Partial<Pick<User, 'username' | 'profilePictureUrl' | 'theme'>>) => Promise<{success: boolean, message?: string}>;
  updateUserPassword: (userId: string, newPassword: string) => Promise<{success: boolean, message?: string}>;
  fetchUsers: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<Omit<User, 'password'> | null>(null);
  const [users, setUsers] = useState<Omit<User, 'password'>[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialAuthCheckComplete, setInitialAuthCheckComplete] = useState(false);

  useEffect(() => {
    const checkInitialSession = async () => {
      setLoading(true);
      const token = localStorage.getItem(SESSION_TOKEN_KEY);
      if (token) {
        try {
          const userFromToken = await userService.dbGetUserByToken(token);
          if (userFromToken) {
            setCurrentUser(userFromToken);
          } else {
            localStorage.removeItem(SESSION_TOKEN_KEY); // Invalid token
          }
        } catch (error) {
          console.error("Error validating token:", error);
          localStorage.removeItem(SESSION_TOKEN_KEY);
        }
      }
      setInitialAuthCheckComplete(true);
      setLoading(false);
      
      // Fetch initial users list for admin pages etc.
      // This can be done regardless of login status for admin purposes.
      try {
        const fetchedUsers = await userService.dbFetchUsers();
        setUsers(fetchedUsers);
      } catch (error) {
        console.error("Failed to fetch initial users list:", error);
      }
    };
    checkInitialSession();
  }, []);

  const login = async (username_param: string, password_param: string): Promise<boolean> => {
    setLoading(true);
    setError(null); 
    try {
      const loginResult = await userService.dbVerifyUserCredentials(username_param, password_param);
      if (loginResult && loginResult.user && loginResult.token) {
        setCurrentUser(loginResult.user);
        localStorage.setItem(SESSION_TOKEN_KEY, loginResult.token);
        setLoading(false);
        return true;
      }
      setLoading(false);
      return false;
    } catch (error) {
      console.error("Login error:", error);
      // Ensure error is reported, perhaps via a state variable if needed by UI
      setError(error instanceof Error ? error.message : "Login failed");
      setLoading(false);
      return false;
    }
  };

  const logout = async () => { // Make logout async
    setLoading(true);
    const token = localStorage.getItem(SESSION_TOKEN_KEY);
    if (token) {
      try {
        await userService.dbInvalidateToken(token); // Invalidate on "backend"
      } catch (error) {
        console.error("Error invalidating token on backend (simulated):", error);
        // Continue with client-side logout anyway
      }
      localStorage.removeItem(SESSION_TOKEN_KEY);
    }
    setCurrentUser(null);
    setLoading(false);
  };
  
  const hasRole = (role: UserRole): boolean => {
    return currentUser?.role === role;
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const fetchedUsers = await userService.dbFetchUsers();
      setUsers(fetchedUsers);
    } catch (error) {
        console.error("Failed to fetch users:", error);
    } finally {
        setLoading(false);
    }
  };

  const addUser = async (userData: Omit<User, 'id' | 'password'> & { password_param: string }): Promise<void> => {
    setLoading(true);
    try {
      const { password_param, ...restUserData } = userData;
      const newUserForDb = { ...restUserData, password: password_param }; 
      
      await userService.dbAddUser(newUserForDb);
      await fetchUsers(); 
    } catch (error) {
      console.error("Add user error:", error);
      throw error; 
    } finally {
      setLoading(false);
    }
  };

  const updateUserRole = async (userId: string, role: UserRole): Promise<void> => {
    setLoading(true);
    try {
      const updatedUser = await userService.dbUpdateUserRole(userId, role);
      if (updatedUser) {
        setUsers(prevUsers => prevUsers.map(u => u.id === userId ? updatedUser : u));
        if (currentUser && currentUser.id === userId) {
          setCurrentUser(updatedUser);
        }
      }
    } catch (error) {
      console.error("Update user role error:", error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const updateUserProfile = async (userId: string, updates: Partial<Pick<User, 'username' | 'profilePictureUrl' | 'theme'>>): Promise<{success: boolean, message?: string}> => {
    setLoading(true);
    try {
      const updatedUser = await userService.dbUpdateUserProfile(userId, updates);
      if (updatedUser) {
        setUsers(prevUsers => prevUsers.map(u => u.id === userId ? updatedUser : u));
        if (currentUser && currentUser.id === userId) {
          setCurrentUser(updatedUser);
        }
        setLoading(false);
        return { success: true, message: "Profile updated successfully." };
      }
      setLoading(false);
      return { success: false, message: "User not found." };
    } catch (error: any) {
      console.error("Update profile error:", error);
      setLoading(false);
      return { success: false, message: error.message || "Failed to update profile." };
    }
  };

  const updateUserPassword = async (userId: string, newPassword: string): Promise<{success: boolean, message?: string}> => {
    setLoading(true);
    try {
      const success = await userService.dbUpdateUserPassword(userId, newPassword);
      if (success) {
        setLoading(false);
        return { success: true, message: "Password updated successfully." };
      }
      setLoading(false);
      return { success: false, message: "Failed to update password." };
    } catch (error: any) {
      console.error("Update password error:", error);
      setLoading(false);
      return { success: false, message: error.message || "An error occurred." };
    }
  };

  // Add an error state if you want to display login errors etc.
  const [error, setError] = React.useState<string | null>(null);


  return (
    <AuthContext.Provider value={{ 
      currentUser, 
      login, 
      logout, 
      loading, 
      initialAuthCheckComplete,
      hasRole, 
      users, 
      addUser, 
      updateUserRole, 
      updateUserProfile, 
      updateUserPassword,
      fetchUsers 
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export { UserRole };
