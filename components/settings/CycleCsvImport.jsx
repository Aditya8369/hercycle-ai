'use client'

import React, { useState, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { Upload, Check, AlertCircle, FileText, RefreshCw, X, AlertTriangle } from 'lucide-react'
import { parseCsv } from '@/lib/csv'
import { useOffline } from '@/lib/OfflineContext'
import { isISODateString, compareDates, getTodayISO } from '@/lib/date-utils'
import { endsOnOrAfterStart } from '@/lib/date-schemas'

const MAX_ROWS = 500
const MAX_FILE_SIZE_BYTES = 1 * 1024 * 1024 // 1 MB
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const EARLIEST_DATE = '1900-01-01'

/**
 * Normalises column key to match start_date / end_date header variations
 */
function findColumnValue(rowObj, candidates) {
  for (const key of Object.keys(rowObj)) {
    const cleanKey = key.toLowerCase().replace(/[^a-z0-9]/g, '')
    for (const cand of candidates) {
      if (cleanKey === cand.toLowerCase().replace(/[^a-z0-9]/g, '')) {
        return rowObj[key]
      }
    }
  }
  return undefined
}

export default function CycleCsvImport() {
  const t = useTranslations('PrivacyData')
  const { offlineClient } = useOffline()

  const [file, setFile] = useState(null)
  const [isImporting, setIsImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [generalError, setGeneralError] = useState('')

  const fileInputRef = useRef(null)

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0]
    setGeneralError('')
    setImportResult(null)

    if (!selected) {
      setFile(null)
      return
    }

    if (selected.size > MAX_FILE_SIZE_BYTES) {
      setGeneralError(t('csvImport.errorFileTooLarge') || 'File size exceeds 1 MB limit.')
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    setFile(selected)
  }

  const handleClearFile = () => {
    setFile(null)
    setImportResult(null)
    setGeneralError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleImport = async () => {
    if (!file) return

    setIsImporting(true)
    setGeneralError('')
    setImportResult(null)

    try {
      const content = await file.text()
      const { headers, rows } = parseCsv(content)

      if (headers.length === 0 || rows.length === 0) {
        setGeneralError(t('csvImport.errorEmptyCsv') || 'The CSV file is empty or invalid.')
        setIsImporting(false)
        return
      }

      // Check header presence
      const sampleRow = rows[0]?.data || {}
      const hasStartHeader = findColumnValue(sampleRow, ['startDate', 'start_date', 'start']) !== undefined
      const hasEndHeader = findColumnValue(sampleRow, ['endDate', 'end_date', 'end']) !== undefined

      if (!hasStartHeader) {
        setGeneralError(
          t('csvImport.errorMissingHeaders') ||
            'CSV must contain a startDate column header (e.g. startDate,endDate).'
        )
        setIsImporting(false)
        return
      }

      if (rows.length > MAX_ROWS) {
        setGeneralError(
          t('csvImport.errorTooManyRows', { max: MAX_ROWS }) ||
            `CSV contains too many rows. Maximum limit is ${MAX_ROWS} rows.`
        )
        setIsImporting(false)
        return
      }

      // Fetch existing cycles for duplicate detection
      let existingStartDates = new Set()
      try {
        const fetchRes = await offlineClient.fetchCycles()
        if (fetchRes.success && fetchRes.data?.cycles) {
          fetchRes.data.cycles.forEach((c) => {
            const start = c.start_date || c.period_start
            if (start) existingStartDates.add(start)
          })
        }
      } catch (err) {
        console.warn('Could not fetch existing cycles for duplicate checking:', err)
      }

      const todayISO = getTodayISO()
      let successCount = 0
      let duplicateCount = 0
      const rowErrors = []

      for (const { rowNumber, data } of rows) {
        const rawStartDate = findColumnValue(data, ['startDate', 'start_date', 'start'])
        const rawEndDate = findColumnValue(data, ['endDate', 'end_date', 'end'])

        const startDate = typeof rawStartDate === 'string' ? rawStartDate.trim() : ''
        const endDate = typeof rawEndDate === 'string' ? rawEndDate.trim() : ''

        // 1. Validate startDate
        if (!startDate) {
          rowErrors.push({ rowNumber, message: t('csvImport.rowErrorMissingStartDate') || 'Missing start date' })
          continue
        }

        if (!ISO_DATE_RE.test(startDate) || !isISODateString(startDate)) {
          rowErrors.push({ rowNumber, message: t('csvImport.rowErrorInvalidStartDate') || `Invalid start date: ${startDate}` })
          continue
        }

        if (compareDates(startDate, EARLIEST_DATE) < 0) {
          rowErrors.push({ rowNumber, message: t('csvImport.rowErrorStartDateTooEarly') || `Start date cannot be earlier than ${EARLIEST_DATE}` })
          continue
        }

        if (compareDates(startDate, todayISO) > 0) {
          rowErrors.push({ rowNumber, message: t('csvImport.rowErrorFutureStartDate') || 'Start date cannot be in the future' })
          continue
        }

        // 2. Validate endDate (optional)
        if (endDate) {
          if (!ISO_DATE_RE.test(endDate) || !isISODateString(endDate)) {
            rowErrors.push({ rowNumber, message: t('csvImport.rowErrorInvalidEndDate') || `Invalid end date: ${endDate}` })
            continue
          }

          if (compareDates(endDate, EARLIEST_DATE) < 0) {
            rowErrors.push({ rowNumber, message: t('csvImport.rowErrorEndDateTooEarly') || `End date cannot be earlier than ${EARLIEST_DATE}` })
            continue
          }

          if (compareDates(endDate, todayISO) > 0) {
            rowErrors.push({ rowNumber, message: t('csvImport.rowErrorFutureEndDate') || 'End date cannot be in the future' })
            continue
          }

          if (!endsOnOrAfterStart(startDate, endDate)) {
            rowErrors.push({ rowNumber, message: t('csvImport.rowErrorEndBeforeStart') || 'End date cannot be before start date' })
            continue
          }
        }

        // 3. Duplicate check
        if (existingStartDates.has(startDate)) {
          duplicateCount++
          continue
        }

        // 4. Calculate cycle_length
        let cycleLength = 28
        if (startDate && endDate) {
          const diffMs = new Date(`${endDate}T00:00:00`) - new Date(`${startDate}T00:00:00`)
          const days = Math.max(1, Math.round(diffMs / 86400000) + 1)
          cycleLength = Math.min(90, Math.max(15, days))
        }

        // 5. Persist record
        const cyclePayload = {
          start_date: startDate,
          end_date: endDate || null,
          cycle_length: cycleLength,
        }

        try {
          await offlineClient.startPeriod(cyclePayload)
          existingStartDates.add(startDate)
          successCount++
        } catch (err) {
          console.error(`Error persisting cycle row ${rowNumber}:`, err)
          rowErrors.push({ rowNumber, message: t('csvImport.rowErrorSaveFailed') || 'Failed to save cycle record' })
        }
      }

      setImportResult({
        totalRows: rows.length,
        successCount,
        duplicateCount,
        errorCount: rowErrors.length,
        rowErrors,
      })
    } catch (err) {
      console.error('CSV Import Error:', err)
      setGeneralError(t('csvImport.errorParseFailed') || 'Failed to read CSV file. Please verify file format.')
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <section className="space-y-4 relative z-10">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold text-white">{t('csvImport.title')}</h2>
        <p className="text-white/70 text-sm">{t('csvImport.desc')}</p>
      </div>

      {/* Expected Format Helper */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-xs space-y-1">
        <div className="text-white/60 font-medium">{t('csvImport.expectedFormatLabel')}:</div>
        <code className="block bg-black/30 px-2 py-1.5 rounded text-pink-300 font-mono">
          startDate,endDate
          <br />
          2026-01-03,2026-01-07
          <br />
          2026-02-01,2026-02-05
        </code>
      </div>

      {/* File Upload Control */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 py-2.5 rounded-xl transition-colors font-medium cursor-pointer text-sm border border-white/15">
            <Upload className="w-4 h-4 text-pink-400" />
            <span>{t('csvImport.chooseFile')}</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              className="hidden"
            />
          </label>

          {file && (
            <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-lg border border-white/10 text-xs text-white/80">
              <FileText className="w-3.5 h-3.5 text-pink-300" />
              <span className="truncate max-w-[200px]">{file.name}</span>
              <button
                onClick={handleClearFile}
                className="text-white/40 hover:text-white transition-colors"
                aria-label={t('csvImport.clearFile')}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {file && (
          <button
            onClick={handleImport}
            disabled={isImporting}
            className="flex items-center gap-2 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white px-5 py-2.5 rounded-xl transition-all font-medium text-sm shadow-md disabled:opacity-50"
          >
            {isImporting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>{t('csvImport.importing')}</span>
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                <span>{t('csvImport.importBtn')}</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Error Message */}
      {generalError && (
        <div className="bg-rose-500/15 border border-rose-500/30 text-rose-300 text-sm p-3.5 rounded-xl flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{generalError}</span>
        </div>
      )}

      {/* Import Summary Results */}
      {importResult && (
        <div className="space-y-3 bg-white/5 border border-white/10 p-4 rounded-2xl">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-white">{t('csvImport.summaryTitle')}</h4>
            <button
              onClick={() => setImportResult(null)}
              className="text-xs text-white/40 hover:text-white"
            >
              {t('csvImport.dismiss')}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            <div className="bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 p-2.5 rounded-xl flex items-center gap-2 font-medium">
              <Check className="w-4 h-4 shrink-0" />
              <span>{t('csvImport.successCount', { count: importResult.successCount })}</span>
            </div>

            {importResult.duplicateCount > 0 && (
              <div className="bg-amber-500/15 border border-amber-500/30 text-amber-200 p-2.5 rounded-xl flex items-center gap-2 font-medium">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                <span>{t('csvImport.duplicateCount', { count: importResult.duplicateCount })}</span>
              </div>
            )}

            {importResult.errorCount > 0 && (
              <div className="bg-rose-500/15 border border-rose-500/30 text-rose-300 p-2.5 rounded-xl flex items-center gap-2 font-medium">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{t('csvImport.errorCount', { count: importResult.errorCount })}</span>
              </div>
            )}
          </div>

          {/* Row-by-Row Error List */}
          {importResult.rowErrors.length > 0 && (
            <div className="space-y-1.5 pt-2 border-t border-white/10">
              <div className="text-xs font-semibold text-rose-300">{t('csvImport.rowErrorsTitle')}:</div>
              <ul className="max-h-36 overflow-y-auto space-y-1 text-xs text-rose-200/90 pr-2">
                {importResult.rowErrors.map((err, idx) => (
                  <li key={idx} className="bg-rose-950/30 p-2 rounded border border-rose-500/20 font-mono">
                    <span className="font-semibold text-rose-300">
                      {t('csvImport.rowLabel', { row: err.rowNumber })}:
                    </span>{' '}
                    {err.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
