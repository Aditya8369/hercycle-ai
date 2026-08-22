'use client'

import React from 'react';
import { useTheme } from './context/ThemeContext';
import { Sun, Moon, Eye } from 'lucide-react';

export function ThemeToggle() {
  const { theme, changeTheme } = useTheme();

  return (
    <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl border border-gray-200 dark:border-gray-700">
      <button
        type="button"
        onClick={() => changeTheme('light')}
        aria-label="Light Theme"
        className={`p-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
          theme === 'light' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
        }`}
      >
        <Sun className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => changeTheme('dark')}
        aria-label="Dark Theme"
        className={`p-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
          theme === 'dark' ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-400 hover:text-white'
        }`}
      >
        <Moon className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => changeTheme('high-contrast')}
        aria-label="High Contrast Theme"
        className={`p-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
          theme === 'high-contrast' ? 'bg-yellow-400 text-black font-bold shadow-sm' : 'text-gray-500 hover:text-yellow-400'
        }`}
      >
        <Eye className="w-4 h-4" />
      </button>
    </div>
  );
}
