
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, UserRole } from '../types';
import { getUsers, saveUsers } from '../services/userService';

interface AuthContextType {
  currentUser: User | null;
  login: (username_param: string, password_param: string) => Promise<boolean>;
  logout: () => void;
  loading: boolean;
  hasRole: (role: UserRole) => boolean;
  users: User[];
  addUser: (user: User) => Promise<void>;
  updateUserRole: (userId: string, role: UserRole) => Promise<void>;
  updateUserProfile: (userId: string, updates: Partial<Pick<User, 'username' | 'profilePictureUrl'>>) => Promise<{success: boolean, message?: string}>;
  updateUserPassword: (userId: string, newPassword: string) => Promise<{success: boolean, message?: string}>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const AUTO_LOGIN_USER_ID_KEY = 'steadySocialAutoLoginUserId';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const initializeAuth = useCallback(() => {
    setLoading(true);
    let storedUsers = getUsers();
    if (storedUsers.length === 0) {
      const adminUser: User = { id: 'admin1', username: 'admin', role: UserRole.ADMIN, password: 'password', profilePictureUrl: '' };
      const creativeUser: User = { id: 'creative1', username: 'creative', role: UserRole.CREATIVE, password: 'password', profilePictureUrl: '' };
      saveUsers([adminUser, creativeUser]);
      storedUsers = [adminUser, creativeUser]; // Use the newly created users
    }
    setUsers(storedUsers);

    const sessionUserJson = sessionStorage.getItem('currentUser');
    if (sessionUserJson) {
      setCurrentUser(JSON.parse(sessionUserJson));
    } else {
      // Try auto-login from localStorage if no active session
      const autoLoginUserId = localStorage.getItem(AUTO_LOGIN_USER_ID_KEY);
      if (autoLoginUserId) {
        const userToAutoLogin = storedUsers.find(u => u.id === autoLoginUserId);
        if (userToAutoLogin) {
          const { password, ...userWithoutPassword } = userToAutoLogin;
          setCurrentUser(userWithoutPassword);
          sessionStorage.setItem('currentUser', JSON.stringify(userWithoutPassword));
        } else {
          // Clean up stale auto-login ID
          localStorage.removeItem(AUTO_LOGIN_USER_ID_KEY);
        }
      }
    }
    setLoading(false);
  }, []);
  
  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);


  const login = async (username_param: string, password_param: string): Promise<boolean> => {
    setLoading(true);
    // Ensure users are loaded before attempting login
    const currentUsers = users.length > 0 ? users : getUsers(); 
    const user = currentUsers.find(u => u.username === username_param && u.password === password_param);
    if (user) {
      const { password, ...userWithoutPassword } = user;
      setCurrentUser(userWithoutPassword);
      sessionStorage.setItem('currentUser', JSON.stringify(userWithoutPassword));
      localStorage.setItem(AUTO_LOGIN_USER_ID_KEY, user.id); // Save for auto-login
      setLoading(false);
      return true;
    }
    setLoading(false);
    return false;
  };

  const logout = () => {
    setCurrentUser(null);
    sessionStorage.removeItem('currentUser');
    localStorage.removeItem(AUTO_LOGIN_USER_ID_KEY); // Clear auto-login marker
  };
  
  const hasRole = (role: UserRole): boolean => {
    return currentUser?.role === role;
  };

  const addUser = async (user: User): Promise<void> => {
    if (users.some(u => u.username === user.username)) {
        throw new Error("Username already exists.");
    }
    const newUser = { ...user, id: `user-${Date.now()}`, profilePictureUrl: user.profilePictureUrl || '' };
    const newUsers = [...users, newUser];
    setUsers(newUsers);
    saveUsers(newUsers);
  };

  const updateUserRole = async (userId: string, role: UserRole): Promise<void> => {
    const updatedUsers = users.map(u => u.id === userId ? { ...u, role } : u);
    setUsers(updatedUsers);
    saveUsers(updatedUsers);
    if (currentUser && currentUser.id === userId) {
        const updatedCurrentUser = { ...currentUser, role };
        setCurrentUser(updatedCurrentUser);
        sessionStorage.setItem('currentUser', JSON.stringify(updatedCurrentUser));
    }
  };

  const updateUserProfile = async (userId: string, updates: Partial<Pick<User, 'username' | 'profilePictureUrl'>>): Promise<{success: boolean, message?: string}> => {
    let message = '';
    if (updates.username && users.some(u => u.username === updates.username && u.id !== userId)) {
      message = "Username already exists.";
      return { success: false, message };
    }

    const updatedUsers = users.map(u => {
      if (u.id === userId) {
        return { ...u, ...updates };
      }
      return u;
    });
    setUsers(updatedUsers);
    saveUsers(updatedUsers);

    if (currentUser && currentUser.id === userId) {
      const updatedCurrentUser = { ...currentUser, ...updates };
      setCurrentUser(updatedCurrentUser);
      sessionStorage.setItem('currentUser', JSON.stringify(updatedCurrentUser));
    }
    message = "Profile updated successfully.";
    return { success: true, message };
  };

  const updateUserPassword = async (userId: string, newPassword: string):Promise<{success: boolean, message?: string}> => {
    const updatedUsers = users.map(u => {
      if (u.id === userId) {
        return { ...u, password: newPassword }; 
      }
      return u;
    });
    setUsers(updatedUsers);
    saveUsers(updatedUsers);
    return { success: true, message: "Password updated successfully." };
  };


  return (
    <AuthContext.Provider value={{ currentUser, login, logout, loading, hasRole, users, addUser, updateUserRole, updateUserProfile, updateUserPassword }}>
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
