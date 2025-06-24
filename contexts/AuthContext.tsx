
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
const CURRENT_USER_SESSION_KEY = 'currentUser'; // Explicit key for session storage

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]); // This list might have pics in memory, but not from localStorage via getUsers()
  const [loading, setLoading] = useState(true);

  const initializeAuth = useCallback(() => {
    setLoading(true);
    let storedUsers = getUsers(); // These users from localStorage won't have profilePictureUrl

    if (storedUsers.length === 0) {
      // Create default users with profilePictureUrl for in-memory state
      const adminUserWithPic: User = { id: 'admin1', username: 'admin', role: UserRole.ADMIN, password: 'password', profilePictureUrl: '' };
      const creativeUserWithPic: User = { id: 'creative1', username: 'creative', role: UserRole.CREATIVE, password: 'password', profilePictureUrl: '' };
      
      // Save them (profilePictureUrl will be stripped by saveUsers for localStorage)
      saveUsers([adminUserWithPic, creativeUserWithPic]);
      // For the initial in-memory state of `users`, we can use the versions with pictures
      // However, subsequent calls to getUsers() will return pic-less users.
      // For consistency, we can reflect the stripped version or manage pics separately.
      // Let's use the pic-less versions from getUsers() to reflect what's stored.
      storedUsers = getUsers(); 
    }
    setUsers(storedUsers); // Users state now reflects what's in localStorage (no pics)

    const sessionUserJson = sessionStorage.getItem(CURRENT_USER_SESSION_KEY);
    if (sessionUserJson) {
      const sessionUser = JSON.parse(sessionUserJson);
      setCurrentUser(sessionUser); // currentUser from session has pic
      // Ensure local 'users' array has the currentUser with pic for consistency if they are in the list
      setUsers(prevUsers => prevUsers.map(u => u.id === sessionUser.id ? sessionUser : u));

    } else {
      const autoLoginUserId = localStorage.getItem(AUTO_LOGIN_USER_ID_KEY);
      if (autoLoginUserId) {
        // userToAutoLogin from storedUsers will not have profilePictureUrl
        const userToAutoLogin = storedUsers.find(u => u.id === autoLoginUserId);
        if (userToAutoLogin) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { password, ...userWithoutPassword } = userToAutoLogin;
          // currentUser will initially not have a picture from this path
          setCurrentUser(userWithoutPassword);
          sessionStorage.setItem(CURRENT_USER_SESSION_KEY, JSON.stringify(userWithoutPassword));
        } else {
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
    // Ensure users are loaded (these are from localStorage, pic-less)
    const currentUsersList = users.length > 0 ? users : getUsers(); 
    const user = currentUsersList.find(u => u.username === username_param && u.password === password_param);
    
    if (user) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password, ...userWithoutPassword } = user; 
      // userWithoutPassword does not have profilePictureUrl from the main list.
      // For display, profilePictureUrl on currentUser will be updated via updateUserProfile
      // or if it was already in session storage for this user.
      setCurrentUser(userWithoutPassword);
      sessionStorage.setItem(CURRENT_USER_SESSION_KEY, JSON.stringify(userWithoutPassword));
      localStorage.setItem(AUTO_LOGIN_USER_ID_KEY, user.id);
      
      // Update the in-memory 'users' array to reflect this newly logged-in user, potentially with a pic if we had it elsewhere
      setUsers(prevUsers => prevUsers.map(u => u.id === userWithoutPassword.id ? userWithoutPassword : u));

      setLoading(false);
      return true;
    }
    setLoading(false);
    return false;
  };

  const logout = () => {
    setCurrentUser(null);
    sessionStorage.removeItem(CURRENT_USER_SESSION_KEY);
    localStorage.removeItem(AUTO_LOGIN_USER_ID_KEY);
  };
  
  const hasRole = (role: UserRole): boolean => {
    return currentUser?.role === role;
  };

  const addUser = async (user: User): Promise<void> => {
    // Check against the in-memory 'users' state which might have more up-to-date usernames
    if (users.some(u => u.username === user.username)) {
        throw new Error("Username already exists.");
    }
    const newUser = { ...user, id: `user-${Date.now()}`}; // profilePictureUrl might be undefined or set
    const newUsers = [...users, newUser];
    setUsers(newUsers); // In-memory 'users' list updated
    saveUsers(newUsers); // Pics will be stripped for localStorage
  };

  const updateUserRole = async (userId: string, role: UserRole): Promise<void> => {
    const updatedUsers = users.map(u => u.id === userId ? { ...u, role } : u);
    setUsers(updatedUsers);
    saveUsers(updatedUsers); // Pics stripped for localStorage

    if (currentUser && currentUser.id === userId) {
        const updatedCurrentUser = { ...currentUser, role };
        setCurrentUser(updatedCurrentUser);
        sessionStorage.setItem(CURRENT_USER_SESSION_KEY, JSON.stringify(updatedCurrentUser)); // Save with pic if present
    }
  };

  const updateUserProfile = async (userId: string, updates: Partial<Pick<User, 'username' | 'profilePictureUrl'>>): Promise<{success: boolean, message?: string}> => {
    let message = '';
    // Check against the in-memory 'users' state for username uniqueness
    if (updates.username && users.some(u => u.username === updates.username && u.id !== userId)) {
      message = "Username already exists.";
      return { success: false, message };
    }

    const updatedUsers = users.map(u => {
      if (u.id === userId) {
        return { ...u, ...updates }; // This user in 'users' state gets the pic
      }
      return u;
    });
    setUsers(updatedUsers);
    saveUsers(updatedUsers); // Pics will be stripped for localStorage

    if (currentUser && currentUser.id === userId) {
      const updatedCurrentUser = { ...currentUser, ...updates }; // currentUser gets pic
      setCurrentUser(updatedCurrentUser);
      sessionStorage.setItem(CURRENT_USER_SESSION_KEY, JSON.stringify(updatedCurrentUser)); // Save with pic
    }
    message = "Profile updated successfully.";
    return { success: true, message };
  };

  const updateUserPassword = async (userId: string, newPassword: string):Promise<{success: boolean, message?: string}> => {
    // The password update logic doesn't directly involve profile pictures
    const updatedUsersWithNewPassword = users.map(u => {
      if (u.id === userId) {
        return { ...u, password: newPassword }; 
      }
      return u;
    });
    // This users array (with new passwords) is then passed to saveUsers.
    // saveUsers will handle stripping profile pictures before storing.
    // setUsers should also be called to update in-memory state if this is desired immediately.
    // For now, assume passwords are secure and not part of pic issue.
    // The current saveUsers will strip pics, which is fine.
    // Need to ensure the 'users' state (in-memory) is also updated if it contains passwords for some reason.
    // The current user.password is already omitted for currentUser state.
    
    // Create users for storage (with potentially sensitive passwords, but pics stripped)
    const usersForStorage = getUsers(); // Get current state from storage (no pics)
    const targetUser = usersForStorage.find(u=>u.id === userId);
    if(targetUser){
       targetUser.password = newPassword; // Update password on the pic-less user
       saveUsers(usersForStorage); // Save pic-less users with updated password
    }
    
    // Update in-memory 'users' state (which might have pics)
    setUsers(prevUsers => prevUsers.map(u => u.id === userId ? { ...u, password: newPassword } : u));

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
