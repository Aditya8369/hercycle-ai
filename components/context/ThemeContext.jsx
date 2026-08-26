'use client'

import React, { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext({
  theme: 'light',
  changeTheme: () => {}
});

function getStoredTheme() {
  if (typeof window === 'undefined') return 'light';
  try {
    const savedTheme = localStorage.getItem('hercycle-theme');
    if (savedTheme === 'dark' || savedTheme === 'high-contrast' || savedTheme === 'light') {
      return savedTheme;
    }
    return 'light';
  } catch (e) {
    console.warn('Could not read theme from localStorage:', e);
    return 'light';
  }
}

function setStoredTheme(newTheme) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('hercycle-theme', newTheme);
  } catch (e) {
    console.warn('Could not write theme to localStorage:', e);
  }
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('light'); // 'light' | 'dark' | 'high-contrast'

  useEffect(() => {
    const savedTheme = getStoredTheme();
    setTheme(savedTheme);
    applyThemeClass(savedTheme);
  }, []);

  const applyThemeClass = (newTheme) => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.classList.remove('dark', 'high-contrast');
    if (newTheme === 'dark') {
      root.classList.add('dark');
    } else if (newTheme === 'high-contrast') {
      root.classList.add('high-contrast');
    }
  };

  const changeTheme = (newTheme) => {
    setTheme(newTheme);
    setStoredTheme(newTheme);
    applyThemeClass(newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, changeTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    return {
      theme: 'light',
      changeTheme: () => {}
    };
  }
  return context;
};

