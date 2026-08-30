'use client'

import React, { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Download, X, Sparkles } from 'lucide-react'

export default function InstallPrompt() {
  const t = useTranslations('InstallPrompt')
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [showPrompt, setShowPrompt] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Detect standalone PWA mode (desktop / mobile / iOS)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true

    if (isStandalone) return

    // Check if dismissed in current session
    const isDismissed = sessionStorage.getItem('pwa_install_dismissed') === 'true'

    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      if (!isDismissed) {
        setShowPrompt(true)
      }
    }

    const handleAppInstalled = () => {
      setShowPrompt(false)
      setDeferredPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const handleInstallClick = async () => {
    if (!deferredPrompt) return

    try {
      deferredPrompt.prompt()
      const choiceResult = await deferredPrompt.userChoice
      if (choiceResult?.outcome === 'accepted') {
        setShowPrompt(false)
      }
      setDeferredPrompt(null)
    } catch (err) {
      console.error('PWA install prompt error:', err)
      setShowPrompt(false)
    }
  }

  const handleDismiss = () => {
    try {
      sessionStorage.setItem('pwa_install_dismissed', 'true')
    } catch {
      // Ignore storage restrictions if private mode restricts sessionStorage
    }
    setShowPrompt(false)
  }

  if (!showPrompt || !deferredPrompt) return null

  return (
    <div
      role="region"
      aria-label={t('title') || 'Install HerCycle AI'}
      className="fixed bottom-4 right-4 left-4 sm:left-auto sm:max-w-md z-50 p-4 bg-slate-900/95 dark:bg-slate-900/95 text-white border border-pink-500/30 rounded-2xl shadow-2xl backdrop-blur-lg flex items-center justify-between gap-3 animate-fade-in"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="p-2.5 bg-gradient-to-br from-pink-500/20 to-purple-500/20 border border-pink-500/30 rounded-xl text-pink-400 shrink-0">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white truncate">
            {t('title') || 'Install HerCycle AI'}
          </h3>
          <p className="text-xs text-slate-300 dark:text-slate-300 line-clamp-1">
            {t('subtitle') || 'Get instant offline access and full-screen experience.'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={handleInstallClick}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-pink-500 hover:bg-pink-600 text-white rounded-xl text-xs font-medium transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-pink-400 focus:ring-offset-2 focus:ring-offset-slate-900"
          aria-label={t('install') || 'Install App'}
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{t('install') || 'Install'}</span>
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400"
          aria-label={t('dismiss') || 'Dismiss install prompt'}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
