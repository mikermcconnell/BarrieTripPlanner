import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, COLORS_DARK } from '../config/theme';

const ThemeContext = createContext(null);

const THEME_STORAGE_KEY = '@bttp_theme_preference';

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export const ThemeProvider = ({ children }) => {
  const systemScheme = useColorScheme();
  const [preference, setPreference] = useState('system');
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY).then(stored => {
      if (stored) setPreference(stored);
      setIsLoaded(true);
    }).catch(() => setIsLoaded(true));
  }, []);

  const isDark = preference === 'system'
    ? systemScheme === 'dark'
    : preference === 'dark';

  const colors = isDark ? COLORS_DARK : COLORS;

  const setThemePreference = useCallback(async (pref) => {
    setPreference(pref);
    await AsyncStorage.setItem(THEME_STORAGE_KEY, pref);
  }, []);

  const value = {
    isDark,
    colors,
    preference,
    setThemePreference,
  };

  if (!isLoaded) return null;

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};
