import React, { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('light'); // 'light' | 'dark' | 'high-contrast'

  useEffect(() => {
    const savedTheme = localStorage.getItem('hercycle-theme') || 'light';
    setTheme(savedTheme);
    applyThemeClass(savedTheme);
  }, []);

  const applyThemeClass = (newTheme) => {
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
    localStorage.setItem('hercycle-theme', newTheme);
    applyThemeClass(newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, changeTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
