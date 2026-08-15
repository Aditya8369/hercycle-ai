'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext({
  theme: 'light',
  setTheme: () => {},
  toggleTheme: () => {},
  mounted: false,
})

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState('light')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    try {
      const savedTheme = localStorage.getItem('hercycle-theme') || localStorage.getItem('theme')
      if (savedTheme === 'dark' || savedTheme === 'light') {
        setThemeState(savedTheme)
        applyTheme(savedTheme)
      } else {
        const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches
        const defaultTheme = prefersDark ? 'dark' : 'light'
        setThemeState(defaultTheme)
        applyTheme(defaultTheme)
      }
    } catch {
      applyTheme('light')
    }
  }, [])

  const applyTheme = (newTheme) => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    root.setAttribute('data-theme', newTheme)
    if (newTheme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
  }

  const setTheme = (newTheme) => {
    setThemeState(newTheme)
    applyTheme(newTheme)
    try {
      localStorage.setItem('hercycle-theme', newTheme)
      localStorage.setItem('theme', newTheme)
    } catch {
      // Storage unavailable
    }
  }

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark'
    setTheme(nextTheme)
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, mounted }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}

export default ThemeContext
