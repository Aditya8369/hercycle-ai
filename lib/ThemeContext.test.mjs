import assert from 'node:assert'
import { test, describe } from 'node:test'

// Mock DOM element for node environment tests
class MockElement {
  constructor() {
    this.attributes = {}
    this.classList = new Set()
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value)
  }

  getAttribute(name) {
    return this.attributes[name] || null
  }
}

// Simulates ThemeProvider logic
function createThemeManager(initialStoredTheme = null, systemPrefersDark = false) {
  let theme = 'light'
  const mockStorage = new Map()
  const mockRoot = new MockElement()

  // Storage mock setup
  if (initialStoredTheme) {
    mockStorage.set('hercycle-theme', initialStoredTheme)
  }

  // Initialization logic
  const saved = mockStorage.get('hercycle-theme')
  if (saved === 'dark' || saved === 'light') {
    theme = saved
  } else if (systemPrefersDark) {
    theme = 'dark'
  } else {
    theme = 'light'
  }

  // Apply function
  const applyTheme = (targetTheme) => {
    mockRoot.setAttribute('data-theme', targetTheme)
    if (targetTheme === 'dark') {
      mockRoot.classList.add('dark')
    } else {
      mockRoot.classList.delete('dark')
    }
  }

  applyTheme(theme)

  return {
    getTheme: () => theme,
    setTheme: (newTheme) => {
      theme = newTheme
      mockStorage.set('hercycle-theme', newTheme)
      applyTheme(newTheme)
    },
    toggleTheme: () => {
      const next = theme === 'dark' ? 'light' : 'dark'
      theme = next
      mockStorage.set('hercycle-theme', next)
      applyTheme(next)
    },
    getStorage: (key) => mockStorage.get(key),
    getDomAttribute: (attr) => mockRoot.getAttribute(attr),
    hasDomClass: (cls) => mockRoot.classList.has(cls),
  }
}

describe('ThemeContext & ThemeProvider Manager Tests', () => {
  test('defaults to light mode when no storage or system preference is present', () => {
    const manager = createThemeManager()
    assert.strictEqual(manager.getTheme(), 'light')
    assert.strictEqual(manager.getDomAttribute('data-theme'), 'light')
    assert.strictEqual(manager.hasDomClass('dark'), false)
  })

  test('respects system dark mode preference when storage is empty', () => {
    const manager = createThemeManager(null, true)
    assert.strictEqual(manager.getTheme(), 'dark')
    assert.strictEqual(manager.getDomAttribute('data-theme'), 'dark')
    assert.strictEqual(manager.hasDomClass('dark'), true)
  })

  test('prioritizes saved localStorage theme over system preference', () => {
    const manager = createThemeManager('light', true) // Saved light, system dark
    assert.strictEqual(manager.getTheme(), 'light')
    assert.strictEqual(manager.getDomAttribute('data-theme'), 'light')
    assert.strictEqual(manager.hasDomClass('dark'), false)
  })

  test('toggles theme correctly and updates DOM and storage', () => {
    const manager = createThemeManager('light')
    assert.strictEqual(manager.getTheme(), 'light')

    manager.toggleTheme()
    assert.strictEqual(manager.getTheme(), 'dark')
    assert.strictEqual(manager.getDomAttribute('data-theme'), 'dark')
    assert.strictEqual(manager.hasDomClass('dark'), true)
    assert.strictEqual(manager.getStorage('hercycle-theme'), 'dark')

    manager.toggleTheme()
    assert.strictEqual(manager.getTheme(), 'light')
    assert.strictEqual(manager.getDomAttribute('data-theme'), 'light')
    assert.strictEqual(manager.hasDomClass('dark'), false)
    assert.strictEqual(manager.getStorage('hercycle-theme'), 'light')
  })

  test('setTheme explicitly sets target theme', () => {
    const manager = createThemeManager('light')
    manager.setTheme('dark')
    assert.strictEqual(manager.getTheme(), 'dark')
    assert.strictEqual(manager.getDomAttribute('data-theme'), 'dark')
    assert.strictEqual(manager.hasDomClass('dark'), true)
  })
})
