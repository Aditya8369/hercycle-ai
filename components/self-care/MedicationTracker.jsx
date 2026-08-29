'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Plus, Trash2, Pencil, Check, X, Clock, Bell, BellOff, AlertCircle } from 'lucide-react'
import { getTodayISO } from '@/lib/date-utils'
import { readDailyRecord, writeDailyRecord } from '@/lib/daily-storage'
import useDailyReset from '@/lib/useDailyReset'
import {
  requestNotificationPermission,
  sendDeviceNotification,
  getNotificationPermissionStatus,
} from '@/lib/utils/notifications'

// ─── Constants ───────────────────────────────────────────────────────────────

const STORAGE_KEY = 'hercycle_medication_tracker'
const MAX_ITEMS = 30

const DEFAULT_ITEM = {
  name: '',
  type: 'medication',
  dosage: '',
  preferredTime: '08:00',
  reminderEnabled: true,
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Format "HH:MM" 24h string to "HH:MM AM/PM" for display */
function formatTimeDisplay(timeStr) {
  if (!timeStr || typeof timeStr !== 'string' || !timeStr.includes(':')) return ''
  const [hStr, mStr] = timeStr.split(':')
  const h = parseInt(hStr, 10)
  const m = parseInt(mStr, 10)
  if (isNaN(h) || isNaN(m)) return timeStr

  const period = h < 12 ? 'AM' : 'PM'
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${String(hour12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`
}

/** Validates and sanitizes a single item */
function sanitizeItem(entry) {
  if (!entry || typeof entry !== 'object') return null
  if (typeof entry.id !== 'string' || entry.id.trim() === '') return null
  if (typeof entry.name !== 'string' || entry.name.trim() === '') return null

  const validTypes = ['medication', 'supplement']
  const type = validTypes.includes(entry.type) ? entry.type : 'medication'

  const validStatuses = ['taken', 'missed', 'pending']
  const status = validStatuses.includes(entry.status) ? entry.status : 'pending'

  // Validate HH:MM time format
  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/
  const preferredTime =
    typeof entry.preferredTime === 'string' && timeRegex.test(entry.preferredTime)
      ? entry.preferredTime
      : '08:00'

  return {
    id: entry.id.trim().slice(0, 100),
    name: entry.name.trim().slice(0, 100),
    type,
    dosage: typeof entry.dosage === 'string' ? entry.dosage.trim().slice(0, 50) : '',
    preferredTime,
    reminderEnabled: entry.reminderEnabled === true,
    status,
  }
}

/** Turns stored payload into safe array of items */
function sanitizeRecord(stored) {
  const raw = Array.isArray(stored?.items) ? stored.items : []
  const items = []
  const seenIds = new Set()

  for (const entry of raw) {
    const clean = sanitizeItem(entry)
    if (!clean) continue
    if (seenIds.has(clean.id)) continue

    seenIds.add(clean.id)
    items.push(clean)
    if (items.length >= MAX_ITEMS) break
  }

  return items
}

/** Resets daily status to 'pending' on a new day */
function clearDailyStatus(items) {
  if (!Array.isArray(items)) return []
  return items.map((item) => ({ ...item, status: 'pending' }))
}

function loadItems() {
  const { value } = readDailyRecord(STORAGE_KEY, {
    sanitize: sanitizeRecord,
    fallback: () => [],
    onNewDay: (record) => clearDailyStatus(record),
    today: getTodayISO(),
  })

  return value
}

function saveItems(items) {
  writeDailyRecord(STORAGE_KEY, { items }, { today: getTodayISO() })
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MedicationTracker() {
  const t = useTranslations('SelfCare')

  const [items, setItems] = useState([])
  const [mounted, setMounted] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)

  // Form State
  const [formData, setFormData] = useState(DEFAULT_ITEM)
  const [formError, setFormError] = useState('')
  const [permissionNotice, setPermissionNotice] = useState('')

  // Track sent notifications to avoid duplicate reminders in the same minute
  const sentRemindersRef = useRef(new Set())
  const nameInputRef = useRef(null)

  // Load from daily storage on mount
  useEffect(() => {
    setItems(loadItems())
    setMounted(true)
  }, [])

  // Auto-save items when updated
  const updateAndSave = useCallback((newItems) => {
    setItems(newItems)
    saveItems(newItems)
  }, [])

  // Handle midnight rollover or tab visibility changes
  useDailyReset(
    useCallback(() => {
      setItems(loadItems())
    }, []),
    { watchKeys: [STORAGE_KEY] }
  )

  // Notification Timer: check every 20s if reminder matches current time
  useEffect(() => {
    if (!mounted || items.length === 0) return

    const checkReminders = () => {
      const now = new Date()
      const currentHours = String(now.getHours()).padStart(2, '0')
      const currentMinutes = String(now.getMinutes()).padStart(2, '0')
      const currentTimeStr = `${currentHours}:${currentMinutes}`
      const todayISO = getTodayISO()

      if (getNotificationPermissionStatus() !== 'granted') return

      items.forEach((item) => {
        if (!item.reminderEnabled) return
        if (item.preferredTime !== currentTimeStr) return
        if (item.status === 'taken') return

        const reminderKey = `${item.id}-${todayISO}-${currentTimeStr}`
        if (sentRemindersRef.current.has(reminderKey)) return

        sentRemindersRef.current.add(reminderKey)

        const title = t('medicationTracker.reminderNotificationTitle') || 'Medication Reminder'
        const bodyTemplate =
          t('medicationTracker.reminderNotificationBody') || "It's time to take your {name}."
        const body = bodyTemplate.replace('{name}', item.name)

        sendDeviceNotification(title, body, '/self-care')
      })
    }

    checkReminders()
    const interval = setInterval(checkReminders, 20000)
    return () => clearInterval(interval)
  }, [mounted, items, t])

  // Form Handlers
  const handleOpenAddModal = () => {
    setEditingId(null)
    setFormData(DEFAULT_ITEM)
    setFormError('')
    setPermissionNotice('')
    setIsModalOpen(true)
    setTimeout(() => nameInputRef.current?.focus(), 100)
  }

  const handleOpenEditModal = (item) => {
    setEditingId(item.id)
    setFormData({
      name: item.name,
      type: item.type,
      dosage: item.dosage,
      preferredTime: item.preferredTime,
      reminderEnabled: item.reminderEnabled,
    })
    setFormError('')
    setPermissionNotice('')
    setIsModalOpen(true)
    setTimeout(() => nameInputRef.current?.focus(), 100)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setEditingId(null)
    setFormData(DEFAULT_ITEM)
    setFormError('')
    setPermissionNotice('')
  }

  const handleReminderToggle = async (e) => {
    const checked = e.target.checked
    setFormData((prev) => ({ ...prev, reminderEnabled: checked }))

    if (checked) {
      const currentPerm = getNotificationPermissionStatus()
      if (currentPerm === 'default') {
        const res = await requestNotificationPermission()
        if (res.permission === 'denied') {
          setPermissionNotice(t('medicationTracker.permissionDeniedNotice'))
        }
      } else if (currentPerm === 'denied') {
        setPermissionNotice(t('medicationTracker.permissionDeniedNotice'))
      } else {
        setPermissionNotice('')
      }
    } else {
      setPermissionNotice('')
    }
  }

  const handleSaveItem = (e) => {
    e.preventDefault()

    const name = formData.name.trim()
    if (!name) {
      setFormError(t('medicationTracker.errorNameRequired'))
      return
    }

    if (editingId) {
      // Edit existing item
      const updated = items.map((item) =>
        item.id === editingId
          ? {
              ...item,
              name: name.slice(0, 100),
              type: formData.type,
              dosage: formData.dosage.trim().slice(0, 50),
              preferredTime: formData.preferredTime,
              reminderEnabled: formData.reminderEnabled,
            }
          : item
      )
      updateAndSave(updated)
    } else {
      // Add new item
      if (items.length >= MAX_ITEMS) {
        setFormError(t('medicationTracker.errorMaxItems'))
        return
      }

      const newItem = {
        id: `med-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: name.slice(0, 100),
        type: formData.type,
        dosage: formData.dosage.trim().slice(0, 50),
        preferredTime: formData.preferredTime,
        reminderEnabled: formData.reminderEnabled,
        status: 'pending',
      }
      updateAndSave([...items, newItem])
    }

    handleCloseModal()
  }

  const handleDeleteItem = (id) => {
    updateAndSave(items.filter((item) => item.id !== id))
  }

  const handleSetStatus = (id, newStatus) => {
    const updated = items.map((item) =>
      item.id === id ? { ...item, status: item.status === newStatus ? 'pending' : newStatus } : item
    )
    updateAndSave(updated)
  }

  // Derived progress values
  const totalCount = items.length
  const takenCount = items.filter((item) => item.status === 'taken').length
  const progressPct = totalCount === 0 ? 0 : Math.round((takenCount / totalCount) * 100)

  return (
    <section className="bg-white/5 border border-white/10 rounded-3xl p-4 sm:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl" aria-hidden="true">💊</span>
          <div>
            <h2 className="text-2xl font-bold text-white tracking-tight">
              {t('medicationTracker.medicationTitle')}
            </h2>
            <p className="text-white/60 text-xs sm:text-sm">
              {t('medicationTracker.medicationSubtitle')}
            </p>
          </div>
        </div>

        {mounted && (
          <button
            onClick={handleOpenAddModal}
            className="flex items-center gap-2 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white font-medium text-sm px-4 py-2.5 rounded-full shadow-md hover:shadow-lg transition-all focus:outline-none focus:ring-2 focus:ring-pink-400/50"
            aria-label={t('medicationTracker.addMedicationSupplement')}
          >
            <Plus className="w-4 h-4" />
            <span>{t('medicationTracker.addItem')}</span>
          </button>
        )}
      </div>

      {/* Progress Bar (when items exist) */}
      {mounted && totalCount > 0 && (
        <div className="space-y-2 bg-white/5 p-4 rounded-2xl border border-white/5">
          <div className="flex justify-between items-center text-sm font-medium text-white/80">
            <span>{t('medicationTracker.adherenceProgress', { taken: takenCount, total: totalCount })}</span>
            <span className="tabular-nums text-pink-300 font-semibold">{progressPct}%</span>
          </div>
          <div
            className="w-full h-2.5 rounded-full overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.10)' }}
            role="progressbar"
            aria-valuenow={progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t('medicationTracker.adherenceProgress', { taken: takenCount, total: totalCount })}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${progressPct}%`,
                background: 'linear-gradient(90deg, #ec4899 0%, #a855f7 100%)',
                transition: 'width 0.4s ease',
              }}
            />
          </div>
        </div>
      )}

      {/* Empty State */}
      {mounted && totalCount === 0 && (
        <div className="text-center py-10 px-4 bg-white/5 border border-dashed border-white/15 rounded-2xl space-y-4">
          <div className="w-14 h-14 bg-pink-500/10 border border-pink-500/20 rounded-full flex items-center justify-center mx-auto text-2xl">
            💊
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <p className="text-white/80 text-sm sm:text-base">
              {t('medicationTracker.medicationEmpty')}
            </p>
          </div>
          <button
            onClick={handleOpenAddModal}
            className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-medium text-sm px-5 py-2.5 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-pink-400/50"
          >
            <Plus className="w-4 h-4 text-pink-400" />
            <span>{t('medicationTracker.addMedicationSupplement')}</span>
          </button>
        </div>
      )}

      {/* Item List */}
      {mounted && totalCount > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((item) => {
            const isTaken = item.status === 'taken'
            const isMissed = item.status === 'missed'
            const isSupplement = item.type === 'supplement'

            return (
              <div
                key={item.id}
                className={`p-4 sm:p-5 rounded-2xl border transition-all flex flex-col justify-between gap-4 ${
                  isTaken
                    ? 'bg-emerald-950/20 border-emerald-500/30'
                    : isMissed
                    ? 'bg-rose-950/20 border-rose-500/30'
                    : 'bg-white/5 border-white/10 hover:border-white/20'
                }`}
              >
                {/* Item Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-lg" aria-hidden="true">
                        {isSupplement ? '🌿' : '💊'}
                      </span>
                      <h3 className={`font-semibold text-base sm:text-lg ${isTaken ? 'line-through text-white/70' : 'text-white'}`}>
                        {item.name}
                      </h3>

                      {/* Type Badge */}
                      <span
                        className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                          isSupplement
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                            : 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
                        }`}
                      >
                        {isSupplement
                          ? t('medicationTracker.typeSupplement')
                          : t('medicationTracker.typeMedication')}
                      </span>
                    </div>

                    {/* Dosage & Preferred Time */}
                    <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm text-white/60 pt-1">
                      {item.dosage && (
                        <span className="font-medium text-white/80">{item.dosage}</span>
                      )}
                      {item.dosage && <span>•</span>}
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-white/40" />
                        {formatTimeDisplay(item.preferredTime)}
                      </span>
                      {item.reminderEnabled && (
                        <span className="flex items-center gap-1 text-pink-300/80 bg-pink-500/10 px-2 py-0.5 rounded-md text-xs">
                          <Bell className="w-3 h-3 text-pink-400" />
                          {t('medicationTracker.reminderToggle')}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Edit & Delete Action Buttons */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleOpenEditModal(item)}
                      className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
                      aria-label={`${t('medicationTracker.editItem')} ${item.name}`}
                      title={t('medicationTracker.editItem')}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteItem(item.id)}
                      className="p-1.5 rounded-lg text-white/50 hover:text-rose-400 hover:bg-white/10 transition-colors"
                      aria-label={`${t('medicationTracker.deleteItem')} ${item.name}`}
                      title={t('medicationTracker.deleteItem')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Adherence Action Bar */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/5">
                  <div className="text-xs font-medium">
                    {isTaken && (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" />
                        {t('medicationTracker.taken')}
                      </span>
                    )}
                    {isMissed && (
                      <span className="text-rose-400 flex items-center gap-1">
                        <X className="w-3.5 h-3.5" />
                        {t('medicationTracker.notTaken')}
                      </span>
                    )}
                    {!isTaken && !isMissed && (
                      <span className="text-white/40 font-normal">
                        {t('medicationTracker.pendingAdherence')}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleSetStatus(item.id, 'taken')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-all ${
                        isTaken
                          ? 'bg-emerald-500 text-white shadow-sm'
                          : 'bg-white/10 hover:bg-emerald-500/20 text-white/80 hover:text-emerald-300 border border-white/10'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{t('medicationTracker.markAsTaken')}</span>
                    </button>

                    <button
                      onClick={() => handleSetStatus(item.id, 'missed')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-all ${
                        isMissed
                          ? 'bg-rose-500 text-white shadow-sm'
                          : 'bg-white/10 hover:bg-rose-500/20 text-white/80 hover:text-rose-300 border border-white/10'
                      }`}
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>{t('medicationTracker.markAsMissed')}</span>
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add / Edit Modal Dialog */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn"
          onKeyDown={(e) => {
            if (e.key === 'Escape') handleCloseModal()
          }}
          tabIndex={-1}
        >
          <div
            className="bg-[#210c28] border border-white/15 rounded-3xl p-6 sm:p-8 w-full max-w-lg shadow-2xl space-y-6 text-white relative"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <h3 id="modal-title" className="text-xl font-bold text-white flex items-center gap-2">
                <span>{editingId ? '✏️' : '💊'}</span>
                {editingId
                  ? t('medicationTracker.editItem')
                  : t('medicationTracker.addMedicationSupplement')}
              </h3>
              <button
                onClick={handleCloseModal}
                className="p-1 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                aria-label={t('medicationTracker.cancel')}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="bg-rose-500/15 border border-rose-500/30 text-rose-300 text-sm p-3 rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {permissionNotice && (
              <div className="bg-amber-500/15 border border-amber-500/30 text-amber-200 text-xs p-3 rounded-xl flex items-center gap-2">
                <BellOff className="w-4 h-4 shrink-0 text-amber-400" />
                <span>{permissionNotice}</span>
              </div>
            )}

            <form onSubmit={handleSaveItem} className="space-y-4">
              {/* Name */}
              <div className="space-y-1.5">
                <label htmlFor="med-name" className="block text-xs font-semibold uppercase tracking-wider text-white/80">
                  {t('medicationTracker.name')} *
                </label>
                <input
                  id="med-name"
                  ref={nameInputRef}
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder={t('medicationTracker.namePlaceholder')}
                  maxLength={100}
                  className="w-full bg-white/10 border border-white/15 rounded-xl px-4 py-2.5 text-white placeholder-white/40 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400/50"
                  required
                />
              </div>

              {/* Type & Dosage Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="med-type" className="block text-xs font-semibold uppercase tracking-wider text-white/80">
                    {t('medicationTracker.type')}
                  </label>
                  <select
                    id="med-type"
                    value={formData.type}
                    onChange={(e) => setFormData((prev) => ({ ...prev, type: e.target.value }))}
                    className="w-full bg-[#34183d] border border-white/15 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-pink-400/50"
                  >
                    <option value="medication">{t('medicationTracker.typeMedication')}</option>
                    <option value="supplement">{t('medicationTracker.typeSupplement')}</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="med-dosage" className="block text-xs font-semibold uppercase tracking-wider text-white/80">
                    {t('medicationTracker.dosage')}
                  </label>
                  <input
                    id="med-dosage"
                    type="text"
                    value={formData.dosage}
                    onChange={(e) => setFormData((prev) => ({ ...prev, dosage: e.target.value }))}
                    placeholder={t('medicationTracker.dosagePlaceholder')}
                    maxLength={50}
                    className="w-full bg-white/10 border border-white/15 rounded-xl px-4 py-2.5 text-white placeholder-white/40 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400/50"
                  />
                </div>
              </div>

              {/* Preferred Intake Time */}
              <div className="space-y-1.5">
                <label htmlFor="med-time" className="block text-xs font-semibold uppercase tracking-wider text-white/80">
                  {t('medicationTracker.preferredTime')}
                </label>
                <input
                  id="med-time"
                  type="time"
                  value={formData.preferredTime}
                  onChange={(e) => setFormData((prev) => ({ ...prev, preferredTime: e.target.value }))}
                  className="w-full bg-[#34183d] border border-white/15 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-pink-400/50"
                  required
                />
              </div>

              {/* Reminder Toggle */}
              <div className="pt-2">
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={formData.reminderEnabled}
                    onChange={handleReminderToggle}
                    className="w-4 h-4 rounded border-white/20 text-pink-500 focus:ring-pink-400/50 bg-white/10 cursor-pointer"
                  />
                  <span className="text-sm font-medium text-white/90">
                    {t('medicationTracker.enableReminder')}
                  </span>
                </label>
              </div>

              {/* Form Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-5 py-2.5 rounded-full text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                >
                  {t('medicationTracker.cancel')}
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-full text-sm font-medium bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white shadow-md hover:shadow-lg transition-all focus:outline-none focus:ring-2 focus:ring-pink-400/50"
                >
                  {t('medicationTracker.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}
