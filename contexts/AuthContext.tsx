
import React, { createContext, useContext, useState } from 'react';
import { User, UserRole } from '../types';
import { dbUpdateUserProfile as apiUpdateUserProfile } from '../services/userService';

interface AuthContextType {
  currentUser: User | null;
  updateUserProfile: (updates: Partial<User>) => Promise<void>;
  initialAuthCheckComplete: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Static System Admin - No Login Required
const SYSTEM_USER: User = {
  id: 'admin-1',
  userId: 'admin',
  username: 'System Admin',
  role: UserRole.ADMIN,
  email: 'admin@steadysocial.local',
  theme: 'light',
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(SYSTEM_USER);

  const updateUserProfile = async (updates: Partial<User>) => {
    if (!currentUser) return;
    try {
        const updatedUser = await apiUpdateUserProfile(currentUser.id, updates);
        setCurrentUser(updatedUser);
    } catch (error) {
        console.error("Failed to update profile:", error);
    }
  };

  return (
    <AuthContext.Provider value={{ 
        currentUser, 
        updateUserProfile,
        initialAuthCheckComplete: true 
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
