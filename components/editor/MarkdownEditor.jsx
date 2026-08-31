'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@clerk/nextjs';
import fetchWithTimeout from '@/lib/fetch-with-timeout';
import {
  LEGACY_STORAGE_KEY,
  MAX_CONTENT_LENGTH,
  MAX_TITLE_LENGTH,
  draftStorageKey,
  isDraftSaved,
  readDraftResponse,
  resolveDraftType,
} from '@/lib/draft-store';
import MarkdownRenderer from './MarkdownRenderer';
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code,
  Link as LinkIcon,
  Strikethrough,
  Table as TableIcon,
  Columns,
  Edit3,
  Eye,
  Cloud,
  Check,
  Loader2,
  RotateCcw,
  Trash2
} from 'lucide-react';

/**
 * Reads the locally cached draft for one type, migrating a draft written by the
 * previous version — which used a single unnamespaced key for every editor on
 * the site, so the local fallback collided exactly the way the table did.
 *
 * @param {string} draftType
 * @returns {object|null}
 */
function readLocalDraft(draftType) {
  const key = draftStorageKey(draftType);
  try {
    const saved = localStorage.getItem(key);
    if (saved) return JSON.parse(saved);

    // One-time migration off the shared key, so an in-progress draft is not
    // abandoned by the upgrade.
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      localStorage.setItem(key, legacy);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      return JSON.parse(legacy);
    }
  } catch (e) {
    console.error('Failed to load local draft:', e);
  }
  return null;
}

/**
 * @param {string} draftType
 * @param {object} draft
 */
function writeLocalDraft(draftType, draft) {
  try {
    localStorage.setItem(draftStorageKey(draftType), JSON.stringify(draft));
    return true;
  } catch (e) {
    console.error('Failed to save to localStorage:', e);
    return false;
  }
}

/**
 * @param {string} draftType
 */
function clearLocalDraft(draftType) {
  try {
    localStorage.removeItem(draftStorageKey(draftType));
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch (e) {
    // Nothing to recover from; the cloud copy is authoritative.
  }
}

export default function MarkdownEditor({
  value = '',
  onChange,
  title = '',
  onTitleChange,
  categoryId = '',
  onCategoryChange,
  categories = [],
  placeholder = 'Write your blog post or community update in Markdown...',
  minHeight = '350px',
  draftType = 'forum_post',
}) {
  const [content, setContent] = useState(value);
  const [viewMode, setViewMode] = useState('split'); // 'split' | 'edit' | 'preview'
  const [saveStatus, setSaveStatus] = useState('idle'); // 'idle' | 'saving' | 'saved_cloud' | 'saved_local' | 'error'
  const [hasRestoredDraft, setHasRestoredDraft] = useState(false);
  const textareaRef = useRef(null);
  const saveTimeoutRef = useRef(null);
  const { getToken, isSignedIn } = useAuth();

  const type = resolveDraftType(draftType);

  /**
   * Cancels a queued cloud save.
   *
   * Nothing used to clear this ref — not `clearDraft`, and not unmount. Publish
   * within a second of typing and the sequence was: DELETE clears the draft →
   * the page navigates → the orphaned timer fires → POST writes the draft back.
   * Returning to the composer showed the post that had just been published,
   * restored from autosave.
   */
  const cancelQueuedSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => cancelQueuedSave, [cancelQueuedSave]);

  // Sync internal content when parent value updates externally
  useEffect(() => {
    if (value !== content && saveStatus !== 'saving') {
      setContent(value);
    }
  }, [value]);

  // Load draft on mount (from localStorage first, then Supabase if logged in)
  useEffect(() => {
    const loadDraft = async () => {
      // 1. Try local storage
      const localDraft = readLocalDraft(type);

      // 2. If logged in, fetch cloud draft — for *this* type. The request used
      // to carry no type at all, so whichever draft had been written last came
      // back and a half-typed comment could be restored into the post composer.
      if (isSignedIn) {
        try {
          const token = await getToken();
          const res = await fetchWithTimeout(`/api/drafts?type=${encodeURIComponent(type)}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const json = await res.json();
          const read = readDraftResponse(res, json);
          if (read.ok && read.draft) {
            const cloudDraft = read.draft;
            // Use whichever is newer or fallback to cloud draft
            if (!content && cloudDraft.content) {
              setContent(cloudDraft.content);
              if (onChange) onChange(cloudDraft.content);
              if (onTitleChange && cloudDraft.title) onTitleChange(cloudDraft.title);
              if (onCategoryChange && cloudDraft.category_id) onCategoryChange(cloudDraft.category_id);
              setSaveStatus('saved_cloud');
              setHasRestoredDraft(true);
              return;
            }
          }
        } catch (err) {
          console.error('Failed to fetch cloud draft:', err);
        }
      }

      // Fallback to local draft if cloud wasn't loaded
      if (localDraft && !content && (localDraft.content || localDraft.title)) {
        if (localDraft.content) {
          setContent(localDraft.content);
          if (onChange) onChange(localDraft.content);
        }
        if (localDraft.title && onTitleChange) onTitleChange(localDraft.title);
        if (localDraft.categoryId && onCategoryChange) onCategoryChange(localDraft.categoryId);
        setSaveStatus('saved_local');
        setHasRestoredDraft(true);
      }
    };

    loadDraft();
  }, [isSignedIn, type]);

  // Save function (saves to localStorage immediately, debounces to cloud)
  const triggerAutosave = useCallback(
    (newContent, newTitle = title, newCat = categoryId) => {
      // An over-long draft cannot be stored, and truncating it would mean the
      // draft handed back is not the draft that was written.
      if (newContent.length > MAX_CONTENT_LENGTH || newTitle.length > MAX_TITLE_LENGTH) {
        cancelQueuedSave();
        setSaveStatus('error');
        return;
      }

      // LocalStorage save, under this draft type's own key.
      if (writeLocalDraft(type, {
        content: newContent,
        title: newTitle,
        categoryId: newCat,
        updatedAt: new Date().toISOString(),
      })) {
        setSaveStatus('saved_local');
      }

      cancelQueuedSave();

      // Debounce Cloud Save (1000ms)
      if (isSignedIn) {
        setSaveStatus('saving');
        saveTimeoutRef.current = setTimeout(async () => {
          try {
            const token = await getToken();
            const res = await fetchWithTimeout('/api/drafts', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                title: newTitle,
                content: newContent,
                categoryId: newCat,
                draftType: type,
              }),
            });
            // `res.ok` alone reported "Saved to cloud" for a 200 that carried
            // `success: false`.
            const json = await res.json().catch(() => null);
            setSaveStatus(isDraftSaved(res, json) ? 'saved_cloud' : 'saved_local');
          } catch (err) {
            console.error('Cloud draft save error:', err);
            setSaveStatus('saved_local');
          }
        }, 1000);
      }
    },
    [isSignedIn, title, categoryId, type, getToken, cancelQueuedSave]
  );

  const handleContentChange = (e) => {
    const val = e.target.value;
    setContent(val);
    if (onChange) onChange(val);
    triggerAutosave(val, title, categoryId);
  };

  // Clear draft
  const clearDraft = async () => {
    // Before anything else: a queued save would otherwise land after the delete
    // and put the draft straight back.
    cancelQueuedSave();
    clearLocalDraft(type);

    setContent('');
    if (onChange) onChange('');
    if (onTitleChange) onTitleChange('');
    setSaveStatus('idle');
    setHasRestoredDraft(false);

    if (isSignedIn) {
      try {
        const token = await getToken();
        await fetchWithTimeout(`/api/drafts?type=${encodeURIComponent(type)}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (err) {
        console.error('Failed to delete cloud draft:', err);
      }
    }
  };

  // Formatting Toolbar Helper
  const applyFormat = (syntaxType) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = content.substring(start, end);
    let replacement = '';
    let newCursorPos = start;

    switch (syntaxType) {
      case 'bold':
        replacement = `**${selectedText || 'bold text'}**`;
        newCursorPos = start + 2;
        break;
      case 'italic':
        replacement = `*${selectedText || 'italic text'}*`;
        newCursorPos = start + 1;
        break;
      case 'h1':
        replacement = `# ${selectedText || 'Heading 1'}`;
        newCursorPos = start + 2;
        break;
      case 'h2':
        replacement = `## ${selectedText || 'Heading 2'}`;
        newCursorPos = start + 3;
        break;
      case 'h3':
        replacement = `### ${selectedText || 'Heading 3'}`;
        newCursorPos = start + 4;
        break;
      case 'bullet':
        replacement = selectedText
          ? selectedText.split('\n').map((line) => `- ${line}`).join('\n')
          : '- List item';
        newCursorPos = start + 2;
        break;
      case 'numbered':
        replacement = selectedText
          ? selectedText.split('\n').map((line, idx) => `${idx + 1}. ${line}`).join('\n')
          : '1. List item';
        newCursorPos = start + 3;
        break;
      case 'quote':
        replacement = selectedText
          ? selectedText.split('\n').map((line) => `> ${line}`).join('\n')
          : '> Blockquote';
        newCursorPos = start + 2;
        break;
      case 'code':
        if (selectedText.includes('\n')) {
          replacement = `\`\`\`javascript\n${selectedText || '// code here'}\n\`\`\``;
          newCursorPos = start + 13;
        } else {
          replacement = `\`${selectedText || 'code'}\``;
          newCursorPos = start + 1;
        }
        break;
      case 'link':
        replacement = `[${selectedText || 'Link Title'}](https://example.com)`;
        newCursorPos = start + 1;
        break;
      case 'strikethrough':
        replacement = `~~${selectedText || 'strikethrough text'}~~`;
        newCursorPos = start + 2;
        break;
      case 'table':
        replacement =
          '\n| Column 1 | Column 2 |\n| --- | --- |\n| Cell 1 | Cell 2 |\n';
        newCursorPos = start + 1;
        break;
      default:
        return;
    }

    const newContent =
      content.substring(0, start) + replacement + content.substring(end);
    setContent(newContent);
    if (onChange) onChange(newContent);
    triggerAutosave(newContent, title, categoryId);

    // Maintain focus and cursor selection position
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        selectedText ? start + replacement.length : newCursorPos,
        selectedText ? start + replacement.length : newCursorPos + (selectedText ? 0 : replacement.length)
      );
    }, 10);
  };

  return (
    <div className="w-full border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900 shadow-sm flex flex-col">
      {/* Editor Header & Control Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800">
        {/* Formatting Buttons */}
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => applyFormat('bold')}
            className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors"
            title="Bold (**text**)"
            aria-label="Format as bold"
          >
            <Bold size={16} />
          </button>
          <button
            type="button"
            onClick={() => applyFormat('italic')}
            className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors"
            title="Italic (*text*)"
            aria-label="Format as italic"
          >
            <Italic size={16} />
          </button>
          <button
            type="button"
            onClick={() => applyFormat('strikethrough')}
            className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors"
            title="Strikethrough (~~text~~)"
            aria-label="Format as strikethrough"
          >
            <Strikethrough size={16} />
          </button>

          <div className="h-4 w-[1px] bg-slate-300 dark:bg-slate-700 mx-1" />

          <button
            type="button"
            onClick={() => applyFormat('h1')}
            className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs transition-colors"
            title="Heading 1 (#)"
            aria-label="Heading level 1"
          >
            <Heading1 size={16} />
          </button>
          <button
            type="button"
            onClick={() => applyFormat('h2')}
            className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs transition-colors"
            title="Heading 2 (##)"
            aria-label="Heading level 2"
          >
            <Heading2 size={16} />
          </button>
          <button
            type="button"
            onClick={() => applyFormat('h3')}
            className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs transition-colors"
            title="Heading 3 (###)"
            aria-label="Heading level 3"
          >
            <Heading3 size={16} />
          </button>

          <div className="h-4 w-[1px] bg-slate-300 dark:bg-slate-700 mx-1" />

          <button
            type="button"
            onClick={() => applyFormat('bullet')}
            className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors"
            title="Bullet List (-)"
            aria-label="Insert bullet list"
          >
            <List size={16} />
          </button>
          <button
            type="button"
            onClick={() => applyFormat('numbered')}
            className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors"
            title="Numbered List (1.)"
            aria-label="Insert numbered list"
          >
            <ListOrdered size={16} />
          </button>
          <button
            type="button"
            onClick={() => applyFormat('quote')}
            className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors"
            title="Blockquote (>)"
            aria-label="Insert blockquote"
          >
            <Quote size={16} />
          </button>

          <div className="h-4 w-[1px] bg-slate-300 dark:bg-slate-700 mx-1" />

          <button
            type="button"
            onClick={() => applyFormat('code')}
            className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors"
            title="Code Block (```)"
            aria-label="Insert code block"
          >
            <Code size={16} />
          </button>
          <button
            type="button"
            onClick={() => applyFormat('link')}
            className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors"
            title="Insert Link ([title](url))"
            aria-label="Insert markdown link"
          >
            <LinkIcon size={16} />
          </button>
          <button
            type="button"
            onClick={() => applyFormat('table')}
            className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors"
            title="Insert Table"
            aria-label="Insert markdown table"
          >
            <TableIcon size={16} />
          </button>
        </div>

        {/* View Toggles & Status Pill */}
        <div className="flex items-center gap-3">
          {/* Status Indicator */}
          {saveStatus === 'saving' && (
            <span className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-medium">
              <Loader2 size={13} className="animate-spin" />
              Saving...
            </span>
          )}
          {saveStatus === 'saved_cloud' && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium" title="Draft saved to Supabase">
              <Cloud size={13} />
              Saved to Cloud
            </span>
          )}
          {saveStatus === 'saved_local' && (
            <span className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium" title="Draft saved to browser storage">
              <Check size={13} />
              Saved Locally
            </span>
          )}
          {/* The 'error' status was declared in this component's state comment
              and never rendered, so a draft that could not be autosaved looked
              identical to one that had been. */}
          {saveStatus === 'error' && (
            <span
              className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 font-medium"
              title={`Drafts are limited to ${MAX_CONTENT_LENGTH} characters`}
              role="status"
            >
              Too long to autosave
            </span>
          )}

          {/* Clear Draft */}
          {(content || title) && (
            <button
              type="button"
              onClick={clearDraft}
              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded transition-colors"
              title="Discard draft"
              aria-label="Discard draft"
            >
              <Trash2 size={15} />
            </button>
          )}

          <div className="h-4 w-[1px] bg-slate-300 dark:bg-slate-700" />

          {/* View Mode Toggle Buttons */}
          <div className="flex items-center bg-slate-200 dark:bg-slate-800 p-0.5 rounded-lg text-xs">
            <button
              type="button"
              onClick={() => setViewMode('edit')}
              className={`flex items-center gap-1 px-2 py-1 rounded-md font-medium transition-colors ${
                viewMode === 'edit'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Edit Mode"
              aria-label="Switch to edit mode"
            >
              <Edit3 size={13} />
              <span className="hidden sm:inline">Write</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('split')}
              className={`flex items-center gap-1 px-2 py-1 rounded-md font-medium transition-colors ${
                viewMode === 'split'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Side-by-side Live Preview"
              aria-label="Switch to split edit and preview mode"
            >
              <Columns size={13} />
              <span className="hidden sm:inline">Split</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('preview')}
              className={`flex items-center gap-1 px-2 py-1 rounded-md font-medium transition-colors ${
                viewMode === 'preview'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Preview Only"
              aria-label="Switch to preview only mode"
            >
              <Eye size={13} />
              <span className="hidden sm:inline">Preview</span>
            </button>
          </div>
        </div>
      </div>

      {/* Restored Banner Notice */}
      {hasRestoredDraft && (
        <div className="bg-pink-50 dark:bg-pink-950/40 border-b border-pink-100 dark:border-pink-900/50 px-4 py-2 flex items-center justify-between text-xs text-pink-700 dark:text-pink-300">
          <span className="flex items-center gap-1.5">
            <RotateCcw size={13} />
            Restored draft from autosave
          </span>
          <button
            type="button"
            onClick={() => setHasRestoredDraft(false)}
            className="hover:underline font-medium"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Workspace Area (Editor & Live Preview) */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-slate-800 min-h-[350px]">
        {/* Editor Pane */}
        {(viewMode === 'split' || viewMode === 'edit') && (
          <div className={`p-4 flex flex-col ${viewMode === 'edit' ? 'md:col-span-2' : ''}`}>
            <textarea
              ref={textareaRef}
              value={content}
              onChange={handleContentChange}
              placeholder={placeholder}
              className="w-full flex-1 bg-transparent text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none font-mono text-sm resize-y leading-relaxed min-h-[300px]"
              style={{ minHeight }}
            />
          </div>
        )}

        {/* Live Preview Pane */}
        {(viewMode === 'split' || viewMode === 'preview') && (
          <div
            className={`p-4 bg-slate-50/50 dark:bg-slate-900/40 overflow-y-auto max-h-[600px] ${
              viewMode === 'preview' ? 'md:col-span-2' : ''
            }`}
          >
            <div className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3 select-none flex items-center gap-1.5">
              <Eye size={13} /> Live Preview
            </div>
            <MarkdownRenderer content={content} />
          </div>
        )}
      </div>
    </div>
  );
}
