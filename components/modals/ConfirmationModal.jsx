
'use client'

import { useState, useEffect } from 'react'
import { AlertTriangle, X, Trash2, Loader2 } from 'lucide-react'

export default function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Account Deletion',
  description = 'This action is permanent and cannot be undone. All your health records, cycle logs, and profile data will be permanently removed.',
  keyword = 'DELETE',
  confirmText = 'Delete Account',
  cancelText = 'Cancel',
  inputPlaceholder = 'Type DELETE to confirm',
  isLoading = false,
  isDanger = true,
  requireKeyword = true,
}) {
  const [inputValue, setInputValue] = useState('')

  useEffect(() => {
    if (!isOpen) {
      setInputValue('')
    }
  }, [isOpen])

  if (!isOpen) return null

  const isMatched = requireKeyword ? inputValue.trim() === keyword : true

  const handleSubmit = (e) => {
    e?.preventDefault()
    if (isMatched && !isLoading) {
      onConfirm()
    }
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md"
      style={{ zIndex: 999999 }}
      onClick={() => { if (!isLoading) onClose() }}
    >
      <div
        className="relative w-full max-w-md bg-[#1a1a2e] text-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-red-500/20"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-5">
          <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2 text-red-400">
            <AlertTriangle className="w-6 h-6 text-red-400 shrink-0" />
            {title}
          </h2>
          <button
            disabled={isLoading}
            onClick={onClose}
            className="text-white/50 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-30"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <p className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl text-sm text-red-200/90 leading-relaxed">
            {description}
          </p>

          {requireKeyword && (
            <div className="space-y-2">
              <label htmlFor="confirm-keyword-input" className="block text-xs font-medium text-white/80 uppercase tracking-wider">
                To confirm, type <span className="font-mono text-red-400 font-bold select-all">{keyword}</span> below:
              </label>
              <input
                id="confirm-keyword-input"
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={inputPlaceholder}
                disabled={isLoading}
                autoComplete="off"
                className="w-full bg-white/5 border border-white/20 focus:border-red-400/80 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-red-500/30 transition-all font-mono tracking-wider text-sm disabled:opacity-50"
              />
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="w-full sm:w-auto bg-white/10 hover:bg-white/20 text-white font-medium px-5 py-2.5 rounded-xl transition-colors text-sm disabled:opacity-50"
            >
              {cancelText}
            </button>
            <button
              type="submit"
              disabled={!isMatched || isLoading}
              className={`w-full sm:w-auto font-medium px-5 py-2.5 rounded-xl transition-all text-sm flex items-center justify-center gap-2 ${
                isDanger
                  ? 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/20 disabled:bg-red-950/40 disabled:text-white/30 disabled:border disabled:border-red-500/20 disabled:shadow-none'
                  : 'bg-pink-600 hover:bg-pink-500 text-white disabled:bg-white/10 disabled:text-white/30'
              }`}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  <span>{confirmText}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
