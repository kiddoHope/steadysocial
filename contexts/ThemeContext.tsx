import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Theme } from '../types';
import { useAuth } from './AuthContext'; // To access current user
import * as userService from '../services/userService'; // To save/load theme

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setThemeExplicitly: (theme: Theme) => void;
  isLoadingTheme: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>('light'); // Default theme
  const [isLoadingTheme, setIsLoadingTheme] = useState(true);
  const { currentUser, updateUserProfile } = useAuth();

  // Load theme preference when currentUser changes or on initial load
  useEffect(() => {
    const loadTheme = async () => {
      setIsLoadingTheme(true);
      let newTheme: Theme = 'light'; // Default
      if (currentUser?.id) {
        // Try to get theme from currentUser object first (already includes theme)
        if (currentUser.theme) {
          newTheme = currentUser.theme;
        } else {
          // Fallback to fetch if not on currentUser (e.g., older user object structure)
          // This path might not be strictly necessary if updateUserProfile keeps currentUser.theme fresh
          const userTheme = await userService.dbGetUserTheme(currentUser.id);
          if (userTheme) {
            newTheme = userTheme;
          }
        }
      } else {
        // No user logged in, use system preference or default
        newTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      setTheme(newTheme);
      setIsLoadingTheme(false);
    };
    loadTheme();
  }, [currentUser]);


  // Apply theme to document and persist if user is logged in
  useEffect(() => {
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(theme);

    // Persist theme for logged-in user
    if (currentUser?.id && currentUser.theme !== theme && !isLoadingTheme) {
      updateUserProfile(currentUser.id, { theme })
        .catch(err => console.error("Failed to save theme preference:", err));
    }
  }, [theme, currentUser, updateUserProfile, isLoadingTheme]);

  const toggleTheme = () => {
    setTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light'));
  };
  
  const setThemeExplicitly = (newTheme: Theme) => {
    setTheme(newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setThemeExplicitly, isLoadingTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
