import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, UserRole } from '../types';
import { 
    dbVerifyUserCredentials, 
    dbLogout, 
    dbFetchUsers, 
    dbAddUser, 
    dbUpdateUserRole, 
    dbUpdateUserProfile, 
    dbUpdateUserPassword,
    dbAutoLoginWithToken // Import the autologin function
} from '../services/userService';

interface AuthContextType {
  currentUser: Omit<User, 'password'> | null;
  login: (username: string, password_param: string) => Promise<boolean>;
  logout: () => void;
  loading: boolean;
  initialAuthCheckComplete: boolean;
  setInitialAuthCheckComplete: (isComplete: boolean) => void; // Expose setter for App.tsx
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

  // Effect to run once on component mount to check for an existing token
  useEffect(() => {
    const checkAuthStatus = async () => {
        try {
            // Attempt to log in using a token from localStorage
            const user = await dbAutoLoginWithToken();
            if (user) {
                setCurrentUser(user);
            }
        } catch (error) {
            console.error("Autologin failed:", error);
            // It's okay to fail silently, the user just won't be logged in.
        } finally {
            // This is crucial. It signals to App.tsx that the check is done and the app can render.
            setInitialAuthCheckComplete(true);
        }
    };

    checkAuthStatus();
  }, []); // The empty dependency array ensures this runs only once.

  // Effect to fetch users list when an admin logs in
  useEffect(() => {
    if (currentUser?.role === UserRole.ADMIN) {
        fetchUsers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  const login = async (username: string, password_param: string): Promise<boolean> => {
    setLoading(true);
    try {
      const user = await dbVerifyUserCredentials(username, password_param);
      if (user) {
        setCurrentUser(user);
        return true;
      }
      return false;
    } catch (error) {
      console.error("Login error:", error);
      return false;
    } finally {
        setLoading(false);
    }
  };

  const logout = () => {
    dbLogout(); // Clear the JWT from localStorage
    setCurrentUser(null);
  };
  
  const hasRole = (role: UserRole): boolean => {
    return currentUser?.role === role;
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const fetchedUsers = await dbFetchUsers();
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
      
      await dbAddUser(newUserForDb);
      await fetchUsers(); // Refresh users list
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
      const updatedUser = await dbUpdateUserRole(userId, role);
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
      const updatedUser = await dbUpdateUserProfile(userId, updates);
      if (updatedUser) {
        setUsers(prevUsers => prevUsers.map(u => u.id === userId ? updatedUser : u));
        if (currentUser && currentUser.id === userId) {
          setCurrentUser(updatedUser);
        }
        return { success: true, message: "Profile updated successfully." };
      }
      return { success: false, message: "User not found." };
    } catch (error: any) {
      console.error("Update profile error:", error);
      return { success: false, message: error.message || "Failed to update profile." };
    } finally {
      setLoading(false);
    }
  };

  const updateUserPassword = async (userId: string, newPassword: string): Promise<{success: boolean, message?: string}> => {
    setLoading(true);
    try {
      const success = await dbUpdateUserPassword(userId, newPassword);
      if (success) {
        return { success: true, message: "Password updated successfully." };
      }
      return { success: false, message: "Failed to update password." };
    } catch (error: any) {
      console.error("Update password error:", error);
      return { success: false, message: error.message || "An error occurred." };
    } finally {
        setLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ 
      currentUser, 
      login,
      logout, 
      loading, 
      initialAuthCheckComplete,
      setInitialAuthCheckComplete,
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
