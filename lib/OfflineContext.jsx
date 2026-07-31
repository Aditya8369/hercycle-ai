
'use client'

import React, { createContext, useContext, useState, useEffect, useMemo, useRef } from 'react'
import { getAllFromStore, putIntoStore, deleteFromStore, queueSyncRequest, replaceAll } from './db'
import { predictNextPeriod, calculatePCODRisk } from './api-helpers'
import { useEncryption } from './EncryptionContext'
import fetchWithTimeout from './fetch-with-timeout'
import toast from 'react-hot-toast'

const OfflineContext = createContext({
  isOffline: false,
  pendingSyncCount: 0,
  isSyncing: false,
  syncData: async () => { },
  offlineClient: {}
})

/**
 * Resolves every record's `encrypted_data` into plain fields.
 *
 * This MUST complete before any IndexedDB write transaction is opened. An
 * IndexedDB transaction auto-commits as soon as control returns to the event
 * loop with no request pending, and `crypto.subtle.decrypt` settles in a later
 * task — so decrypting *inside* a write loop killed the transaction and made
 * every subsequent `put` throw `TransactionInactiveError`.
 *
 * A record that cannot be decrypted is kept in its original form rather than
 * dropped, so a single bad row never costs the user the rest of their history.
 *
 * @param {any[]} records
 * @param {(payload: any) => Promise<any>} decrypt
 * @param {string} label used only for logging
 * @returns {Promise<any[]>}
 */
async function decryptRecords(records, decrypt, label) {
  if (!Array.isArray(records)) return []

  const resolved = []
  for (const record of records) {
    if (!record) continue
    if (!record.encrypted_data) {
      resolved.push(record)
      continue
    }
    try {
      const decryptedFields = await decrypt(record.encrypted_data)
      resolved.push({ ...record, ...decryptedFields })
    } catch (e) {
      console.error(`Failed to decrypt ${label}`, e)
      resolved.push(record)
    }
  }
  return resolved
}

/**
 * Replaces a cache store's contents, treating a cache write failure as
 * non-fatal: the caller already holds fresh server data and should return it
 * even if the local mirror could not be refreshed.
 *
 * @param {string} storeName
 * @param {any[]} records
 * @returns {Promise<void>}
 */
async function cacheRecords(storeName, records) {
  try {
    await replaceAll(storeName, records)
  } catch (e) {
    console.error(`Failed to refresh the ${storeName} offline cache`, e)
  }
}

/**
 * Newest period first. Uses plain YYYY-MM-DD string ordering, which is exact
 * for ISO dates and needs no Date construction.
 *
 * @param {any[]} cycles
 * @returns {any[]} a new array; the input is not mutated
 */
function sortByStartDateDesc(cycles) {
  return [...(cycles || [])].sort((a, b) => {
    const left = String(a?.start_date || '')
    const right = String(b?.start_date || '')
    if (left === right) return 0
    return left < right ? 1 : -1
  })
}

// Helper to generate robust UUIDs client-side
const generateUUID = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

export function OfflineProvider({ children }) {
  const [isOffline, setIsOffline] = useState(false)
  const [pendingSyncCount, setPendingSyncCount] = useState(0)
  const [isSyncing, setIsSyncing] = useState(false)

  const isSyncingRef = useRef(false)

  const { encrypt, decrypt, isUnlocked } = useEncryption()

  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then((reg) => {
          console.log('Service Worker registered successfully with scope:', reg.scope);
        })
        .catch((err) => {
          console.error('Service Worker registration failed:', err);
        });

      let refreshing = false;
      const handleControllerChange = () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      };

      navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

      return () => {
        navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      };
    }
  }, [])

  const updateSyncCount = async () => {
    try {
      const queue = await getAllFromStore('sync_queue');
      setPendingSyncCount(queue.length);
    } catch (e) {
      console.error('Failed to update sync count:', e);
    }
  }

  const syncData = async () => {
    if (!navigator.onLine || isSyncingRef.current) return;

    try {
      const queue = await getAllFromStore('sync_queue');
      if (queue.length === 0) {
        setPendingSyncCount(0);
        return;
      }

      isSyncingRef.current = true;
      setIsSyncing(true);

      const sortedQueue = [...queue].sort((a, b) => a.id - b.id);

      for (const item of sortedQueue) {
        try {
          const res = await fetchWithTimeout(item.url, {
            method: item.method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item.body)
          });

          if (res.ok || res.status === 400 || res.status === 401 || res.status === 403 || res.status === 422) {
            await deleteFromStore('sync_queue', item.id);
          } else {
            break;
          }
        } catch (fetchErr) {
          break;
        }
      }
    } catch (e) {
      console.error('Error in background sync:', e);
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
      updateSyncCount();
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => {
      setIsOffline(false);
      toast.success('📶 Back online! Syncing your data...');
      syncData();
    };

    const handleOffline = () => {
      setIsOffline(true);
      toast.error('⚠️ You are offline. Changes will be saved locally.');
    };

    setIsOffline(!navigator.onLine);
    updateSyncCount();

    if (navigator.onLine) {
      syncData();
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const interval = setInterval(() => {
      if (navigator.onLine) {
        syncData();
      } else {
        updateSyncCount();
      }
    }, 30000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);



  const offlineClient = useMemo(() => ({
    fetchCycles: async () => {
      const isOnline = navigator.onLine;
      if (isOnline) {
        try {
          const res = await fetchWithTimeout('/api/cycles');
          const data = await res.json();
          if (data.success) {
            // Decrypt everything FIRST. Awaiting inside a readwrite transaction
            // auto-commits it, after which every remaining put throws
            // TransactionInactiveError — which used to leave the store cleared
            // but never repopulated.
            const cycles = await decryptRecords(data.data.cycles, decrypt, 'cycle');

            // One atomic clear+repopulate, no interleaved awaits.
            await cacheRecords('cycles', cycles);

            const prediction = predictNextPeriod(sortByStartDateDesc(cycles));
            return {
              success: true,
              data: {
                cycles,
                nextPeriodDate: prediction.nextPeriodDate,
                confidence: prediction.confidence,
                averageCycleLength: prediction.averageCycleLength
              }
            };
          }
        } catch (e) {
          console.warn('Fetch cycles failed, falling back to IndexedDB', e);
        }
      }

      const cachedCycles = await getAllFromStore('cycles');
      const sortedCycles = sortByStartDateDesc(cachedCycles);
      const prediction = predictNextPeriod(sortedCycles);

      return {
        success: true,
        data: {
          cycles: sortedCycles,
          nextPeriodDate: prediction.nextPeriodDate,
          confidence: prediction.confidence,
          averageCycleLength: prediction.averageCycleLength
        }
      };
    },

    fetchTodayLog: async (date) => {
      const isOnline = navigator.onLine;
      if (isOnline) {
        try {
          const res = await fetchWithTimeout(`/api/log-day?date=${date}`);
          if (res.ok) {
            const data = await res.json();
            if (data.success && data.data) {
              let log = data.data;
              if (log.encrypted_data) {
                try {
                  const decryptedFields = await decrypt(log.encrypted_data);
                  log = { ...log, ...decryptedFields };
                } catch (e) {
                  console.error('Failed to decrypt daily log', e);
                }
              }
              await putIntoStore('daily_logs', log);
              return { success: true, data: log };
            }
            return { success: true, data: null };
          }
        } catch (e) {
          console.warn('Fetch today log failed, falling back to IndexedDB', e);
        }
      }

      const logs = await getAllFromStore('daily_logs');
      const log = logs.find(l => l.date === date) || null;
      return { success: true, data: log };
    },

    fetchAllLogs: async () => {
      const isOnline = navigator.onLine;
      if (isOnline) {
        try {
          const res = await fetchWithTimeout('/api/log-day/all');
          if (res.ok) {
            const data = await res.json();
            if (data.success && data.data) {
              // Same ordering rule as fetchCycles: decrypt fully, then write in
              // a single transaction that never yields.
              const logs = await decryptRecords(data.data, decrypt, 'daily log');
              await cacheRecords('daily_logs', logs);
              data.data = logs;
            }
            return data;
          }
        } catch (e) {
          console.warn('Fetch all logs failed, falling back to IndexedDB', e);
        }
      }

      const logs = await getAllFromStore('daily_logs');
      const sortedLogs = [...logs].sort((a, b) => new Date(b.date) - new Date(a.date));
      return { success: true, data: sortedLogs };
    },

    fetchPCODRisk: async () => {
      const isOnline = navigator.onLine;
      if (isOnline) {
        try {
          const res = await fetchWithTimeout('/api/pcod-risk');
          if (res.ok) {
            const data = await res.json();
            if (data.success) {
              localStorage.setItem('pcod_risk_cache', JSON.stringify(data.data));
            }
            return data;
          }
        } catch (e) {
          console.warn('Fetch PCOD risk failed, calculating locally/falling back to cache', e);
        }
      }

      try {
        const cachedCycles = await getAllFromStore('cycles');
        const cachedLogs = await getAllFromStore('daily_logs');
        const allSymptoms = cachedLogs.flatMap(log => log.symptoms || []);

        if (cachedCycles.length > 0) {
          const localRisk = calculatePCODRisk(cachedCycles, allSymptoms);
          return { success: true, data: localRisk };
        }
      } catch (e) {
        console.error('Local PCOD calculation failed:', e);
      }

      const cached = localStorage.getItem('pcod_risk_cache');
      if (cached) {
        return { success: true, data: JSON.parse(cached) };
      }

      return {
        success: false,
        error: 'Offline, no cached data',
        data: { score: 25, label: 'LOW RISK', factors: [], recommendation: 'Offline mode active.' }
      };
    },

    saveDailyLog: async (log) => {
      const localLog = {
        ...log,
        updated_at: new Date().toISOString()
      };
      await putIntoStore('daily_logs', localLog);

      let payload = { ...localLog };
      try {
        const encrypted = await encrypt({
          symptoms: payload.symptoms,
          mood: payload.mood,
          flow: payload.flow,
          cervical_discharge: payload.cervical_discharge
        });
        payload.encrypted_data = encrypted;
        delete payload.symptoms;
        delete payload.mood;
        delete payload.flow;
        delete payload.cervical_discharge;
      } catch (e) {
        console.error('Failed to encrypt daily log', e);
      }

      const isOnline = navigator.onLine;
      if (isOnline) {
        try {
          const res = await fetchWithTimeout('/api/log-day', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const data = await res.json();
          if (data.success) {
            return { success: true };
          }
          console.warn('Server rejected log, queuing for retry:', data.message);
        } catch (e) {
          console.warn('Save daily log network request failed, queuing', e);
        }
      }

      await queueSyncRequest('/api/log-day', 'POST', payload);
      updateSyncCount();
      return { success: true, offline: true };
    },

    startPeriod: async (cycle) => {
      const clientCycle = {
        ...cycle,
        id: cycle.id || generateUUID(),
        created_at: new Date().toISOString()
      };
      await putIntoStore('cycles', clientCycle);

      let payload = { ...clientCycle };
      try {
        const encrypted = await encrypt({
          start_date: payload.start_date,
          end_date: payload.end_date,
          cycle_length: payload.cycle_length
        });
        payload.encrypted_data = encrypted;
        delete payload.start_date;
        delete payload.end_date;
        delete payload.cycle_length;
      } catch (e) {
        console.error('Failed to encrypt cycle', e);
      }

      const isOnline = navigator.onLine;
      if (isOnline) {
        try {
          const res = await fetchWithTimeout('/api/cycles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const data = await res.json();
          if (data.success) {
            return { success: true };
          }
          return { success: false, error: data.error || 'Failed to start period' };
        } catch (e) {
          console.warn('Start period network request failed, queuing', e);
        }
      }

      await queueSyncRequest('/api/cycles', 'POST', payload);
      updateSyncCount();
      return { success: true, offline: true };
    },

    endPeriod: async (id, end_date) => {
      const cachedCycles = await getAllFromStore('cycles');
      const cycle = cachedCycles.find(c => c.id === id);
      if (cycle) {
        cycle.end_date = end_date;
        await putIntoStore('cycles', cycle);
      }

      const isOnline = navigator.onLine;
      let payload = { id, end_date };

      if (cycle) {
        try {
          const encrypted = await encrypt({
            start_date: cycle.start_date,
            end_date: cycle.end_date,
            cycle_length: cycle.cycle_length
          });
          payload.encrypted_data = encrypted;
          delete payload.end_date;
        } catch (e) {
          console.error('Failed to encrypt cycle ending', e);
        }
      }

      if (isOnline) {
        try {
          const res = await fetchWithTimeout('/api/cycles', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const data = await res.json();
          if (data.success) {
            return { success: true };
          }
          return { success: false, error: data.error || 'Failed to end period' };
        } catch (e) {
          console.warn('End period network request failed, queuing', e);
        }
      }

      await queueSyncRequest('/api/cycles', 'PATCH', payload);
      updateSyncCount();
      return { success: true, offline: true };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [encrypt, decrypt, isUnlocked]) // stable reference — methods close over navigator/fetch, not React state

  return (
    <OfflineContext.Provider value={{ isOffline, pendingSyncCount, isSyncing, syncData, offlineClient }}>
      {children}
    </OfflineContext.Provider>
  )
}

export function useOffline() {
  return useContext(OfflineContext)
}