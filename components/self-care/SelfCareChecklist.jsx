'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Plus, Trash2, Pencil, X } from 'lucide-react';
import { getTodayISO } from '@/lib/date-utils';
import { readDailyRecord, writeDailyRecord } from '@/lib/daily-storage';
import useDailyReset from '@/lib/useDailyReset';

// ─── Constants ───────────────────────────────────────────────────────────────

const STORAGE_KEY = 'hercycle_selfcare_checklist';

const DEFAULT_TASK_DEFS = [
  { id: 'default-drink-water',  labelKey: 'checklistTask.drinkWater',  isDefault: true },
  { id: 'default-stretch',      labelKey: 'checklistTask.stretch',      isDefault: true },
  { id: 'default-healthy-meal', labelKey: 'checklistTask.healthyMeal',  isDefault: true },
  { id: 'default-sleep',        labelKey: 'checklistTask.sleep',        isDefault: true },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeDefaultTasks() {
  return DEFAULT_TASK_DEFS.map((def) => ({ ...def, completed: false }));
}

/** Most custom tasks a list may hold, so storage cannot grow without bound. */
const MAX_TASKS = 50;

/**
 * Turns a stored task list into one that is safe to render.
 *
 * The previous version accepted `saved.tasks` as long as it was an array, so a
 * malformed entry with no `id` produced duplicate React keys and a row that
 * could never be deleted -- `deleteTask` filters on `id`, and `undefined ===
 * undefined` matches every such row at once.
 */
function sanitizeTasks(stored) {
  const raw = Array.isArray(stored?.tasks) ? stored.tasks : [];
  const seen = new Set();
  const tasks = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    if (typeof entry.id !== 'string' || entry.id.trim() === '') continue;
    if (seen.has(entry.id)) continue;

    const isDefault = entry.isDefault === true;
    // A default task is rendered from `labelKey`; a custom one from `label`.
    // An entry carrying neither has nothing to show.
    if (isDefault && typeof entry.labelKey !== 'string') continue;
    if (!isDefault && (typeof entry.label !== 'string' || entry.label.trim() === '')) continue;

    seen.add(entry.id);
    tasks.push({
      id: entry.id,
      isDefault,
      labelKey: isDefault ? entry.labelKey : undefined,
      label: isDefault ? undefined : entry.label.trim().slice(0, 80),
      completed: entry.completed === true,
    });

    if (tasks.length >= MAX_TASKS) break;
  }

  return withDefaults(tasks);
}

/** Ensures every default task is present, in case new ones were added later. */
function withDefaults(tasks) {
  const existingIds = new Set(tasks.map((t) => t.id));
  const missing = DEFAULT_TASK_DEFS
    .filter((d) => !existingIds.has(d.id))
    .map((d) => ({ ...d, completed: false }));

  return missing.length > 0 ? [...missing, ...tasks] : tasks;
}

/** Keeps the list but clears every tick, which is what a new day means here. */
function clearCompletion(tasks) {
  return tasks.map((t) => ({ ...t, completed: false }));
}

function loadTasks() {
  const { value } = readDailyRecord(STORAGE_KEY, {
    sanitize: sanitizeTasks,
    fallback: makeDefaultTasks,
    onNewDay: clearCompletion,
  });

  return value;
}

function saveTasks(tasks) {
  writeDailyRecord(STORAGE_KEY, { tasks }, { today: getTodayISO() });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SelfCareChecklist() {
  const t = useTranslations('SelfCare');

  const [tasks, setTasks] = useState([]);
  const [mounted, setMounted] = useState(false);
  const [newTaskLabel, setNewTaskLabel] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingLabel, setEditingLabel] = useState('');

  const addInputRef = useRef(null);
  const editInputRef = useRef(null);

  // Load from localStorage on mount (client only — avoids SSR hydration mismatch)
  useEffect(() => {
    setTasks(loadTasks());
    setMounted(true);
  }, []);

  // The list stays on screen across midnight on a tab nobody closed, so the
  // ticks have to be cleared while the page is open rather than only on the
  // next mount. Without this the next interaction saved yesterday's ticks
  // under today's date.
  useDailyReset(
    useCallback(() => {
      setTasks((current) => {
        const rolled = clearCompletion(current);
        saveTasks(rolled);
        return rolled;
      });
    }, []),
    { watchKeys: [STORAGE_KEY] }
  );

  // Auto-focus the edit input whenever editing starts
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  // ── State helpers ──────────────────────────────────────────────────────────

  const updateAndSave = (updatedTasks) => {
    setTasks(updatedTasks);
    saveTasks(updatedTasks);
  };

  const toggleTask = (id) => {
    updateAndSave(tasks.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)));
  };

  const addTask = () => {
    const label = newTaskLabel.trim();
    if (!label) return;
    if (tasks.length >= MAX_TASKS) return;

    // `custom-${Date.now()}` collides for two tasks added inside the same
    // millisecond, and a duplicate id makes both rows share a React key and
    // both disappear when either is deleted.
    const newTask = {
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      label: label.slice(0, 80),
      isDefault: false,
      completed: false,
    };
    updateAndSave([...tasks, newTask]);
    setNewTaskLabel('');
    addInputRef.current?.focus();
  };

  const startEdit = (task) => {
    setEditingId(task.id);
    setEditingLabel(task.label);
  };

  const saveEdit = () => {
    const label = editingLabel.trim();
    if (!label) {
      cancelEdit();
      return;
    }
    updateAndSave(tasks.map((t) => (t.id === editingId ? { ...t, label } : t)));
    setEditingId(null);
    setEditingLabel('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingLabel('');
  };

  const deleteTask = (id) => {
    updateAndSave(tasks.filter((t) => t.id !== id));
  };

  // ── Derived values ─────────────────────────────────────────────────────────

  const doneCount = tasks.filter((t) => t.completed).length;
  const totalCount = tasks.length;
  const progressPct = totalCount === 0 ? 0 : Math.round((doneCount / totalCount) * 100);
  const allDone = totalCount > 0 && doneCount === totalCount;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <section className="bg-white/5 border border-white/10 rounded-3xl p-4 sm:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl" aria-hidden="true">📋</span>
          <h2 className="text-2xl font-bold text-white tracking-tight">
            {t('checklistTitle')}
          </h2>
        </div>
        {mounted && (
          <span className="text-sm font-semibold text-white/50 tabular-nums" aria-hidden="true">
            {doneCount}/{totalCount}
          </span>
        )}
      </div>

      {/* Progress bar */}
      {mounted && (
        <div className="space-y-2">
          <p className="text-white/70 text-sm" aria-live="polite">
            {t('checklistProgress', { done: doneCount, total: totalCount })}
          </p>
          <div
            className="w-full h-2.5 rounded-full overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.10)' }}
            role="progressbar"
            aria-valuenow={progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t('checklistProgress', { done: doneCount, total: totalCount })}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${progressPct}%`,
                background: 'linear-gradient(90deg, var(--rose-mid) 0%, var(--lavender) 100%)',
                transition: 'width 0.4s ease',
              }}
            />
          </div>
          {allDone && (
            <p className="text-white/90 text-sm font-medium">
              {t('checklistAllDone')}
            </p>
          )}
        </div>
      )}

      {/* Task list */}
      {mounted && (
        <ul className="space-y-2" role="list" aria-label={t('checklistTitle')}>
          {tasks.map((task) => {
            const label = task.isDefault ? t(task.labelKey) : task.label;
            const isEditing = editingId === task.id;

            return (
              <li
                key={task.id}
                className="flex items-center gap-3 group rounded-2xl px-3 py-2.5 transition-colors"
                style={{
                  background: task.completed
                    ? 'rgba(255,255,255,0.06)'
                    : 'rgba(255,255,255,0.03)',
                }}
              >
                {/* Toggle checkbox */}
                <button
                  type="button"
                  onClick={() => toggleTask(task.id)}
                  aria-pressed={task.completed}
                  aria-label={t('checklistToggle', { label })}
                  className="shrink-0 w-6 h-6 rounded-md border transition-all duration-200 active:scale-90 focus:outline-none focus:ring-2 focus:ring-pink-400/50 flex items-center justify-center"
                  style={{
                    background: task.completed
                      ? 'linear-gradient(135deg, var(--rose-mid) 0%, var(--lavender) 100%)'
                      : 'rgba(255,255,255,0.08)',
                    borderColor: task.completed
                      ? 'transparent'
                      : 'rgba(255,255,255,0.20)',
                  }}
                >
                  {task.completed && (
                    <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                  )}
                </button>

                {/* Label or inline edit input */}
                {isEditing ? (
                  <input
                    ref={editInputRef}
                    type="text"
                    value={editingLabel}
                    onChange={(e) => setEditingLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveEdit();
                      if (e.key === 'Escape') cancelEdit();
                    }}
                    maxLength={80}
                    className="flex-1 min-w-0 bg-white/10 border border-white/20 rounded-lg px-2 py-1 text-white text-sm focus:outline-none focus:ring-2 focus:ring-pink-400/50"
                    style={{ WebkitUserSelect: 'text', userSelect: 'text' }}
                  />
                ) : (
                  <span
                    className="flex-1 min-w-0 text-sm break-words"
                    style={{
                      color: task.completed
                        ? 'rgba(255,255,255,0.40)'
                        : 'rgba(255,255,255,0.85)',
                      textDecoration: task.completed ? 'line-through' : 'none',
                      transition: 'color 0.2s',
                    }}
                  >
                    {label}
                  </span>
                )}

                {/* Edit / Delete actions — custom tasks only */}
                {!task.isDefault && (
                  <div className="flex items-center gap-1 shrink-0">
                    {isEditing ? (
                      <>
                        <button
                          type="button"
                          onClick={saveEdit}
                          aria-label={t('checklistSave')}
                          className="px-2 py-1 rounded-lg text-xs font-semibold text-white bg-white/15 hover:bg-white/25 transition-colors focus:outline-none focus:ring-2 focus:ring-pink-400/50"
                        >
                          {t('checklistSave')}
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          aria-label={t('checklistCancel')}
                          className="w-6 h-6 rounded-lg flex items-center justify-center text-white/50 hover:text-white/80 hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-pink-400/50"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => startEdit(task)}
                          aria-label={t('checklistEdit')}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/10 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all focus:outline-none focus:ring-2 focus:ring-pink-400/50"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteTask(task.id)}
                          aria-label={t('checklistDelete')}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-rose-400 hover:bg-white/10 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all focus:outline-none focus:ring-2 focus:ring-pink-400/50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Add custom task */}
      <div className="flex items-center gap-2">
        <input
          ref={addInputRef}
          type="text"
          value={newTaskLabel}
          onChange={(e) => setNewTaskLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addTask(); }}
          placeholder={t('checklistAddPlaceholder')}
          maxLength={80}
          className="flex-1 min-w-0 bg-white/10 border border-white/15 rounded-xl px-3 sm:px-4 py-2.5 text-white placeholder-white/40 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400/50"
          style={{ WebkitUserSelect: 'text', userSelect: 'text' }}
        />
        <button
          type="button"
          onClick={addTask}
          disabled={!newTaskLabel.trim() || tasks.length >= MAX_TASKS}
          aria-label={t('checklistAdd')}
          className="btn-pill px-3 sm:px-4 py-2.5 text-sm disabled:opacity-40 disabled:cursor-not-allowed shrink-0 flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{t('checklistAdd')}</span>
        </button>
      </div>
    </section>
  );
}
