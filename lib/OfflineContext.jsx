
'use client'

import React, { createContext, useContext, useState, useEffect, useMemo, useRef } from 'react'
import { initDB, getAllFromStore, putIntoStore, deleteFromStore, queueSyncRequest } from './db'
import { predictNextPeriod, calculatePCODRisk } from './api-helpers'
import { useEncryption } from './EncryptionContext'
import {
  DEAD_LETTER_STORE,
  classifyResponse,
  describeQueueItem,
  isDue,
  orderForDrain,
  planNextAttempt,
} from './sync-queue'
import fetchWithTimeout from './fetch-with-timeout'
import toast from 'react-hot-toast'

const OfflineContext = createContext({
  isOffline: false,
  pendingSyncCount: 0,
  failedSyncItems: [],
  isSyncing: false,
  syncData: async () => { },
  retryFailedSync: async () => { },
  discardFailedSync: async () => { },
  offlineClient: {}
})

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
  // Operations that will not be retried again, kept so the user can review,
  // retry or discard them instead of losing them silently.
  const [failedSyncItems, setFailedSyncItems] = useState([])

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

    try {
      const failed = await getAllFromStore(DEAD_LETTER_STORE);
      setFailedSyncItems(failed.map(item => ({ ...item, description: describeQueueItem(item) })));
    } catch (e) {
      console.error('Failed to read dead-lettered sync operations:', e);
    }
  }

  /**
   * Puts a dead-lettered operation back on the queue for another try — the
   * manual recovery path the old code had no equivalent of.
   */
  const retryFailedSync = async (deadLetterId) => {
    try {
      const failed = await getAllFromStore(DEAD_LETTER_STORE);
      const candidates = deadLetterId === undefined
        ? failed
        : failed.filter(item => item.id === deadLetterId);

      for (const item of candidates) {
        // Requeue as a fresh operation: drop the dead-letter bookkeeping and
        // reset the attempt counter so it is retried immediately.
        await queueSyncRequest(item.url, item.method, item.body);
        await deleteFromStore(DEAD_LETTER_STORE, item.id);
      }
    } catch (e) {
      console.error('Failed to requeue a dead-lettered operation:', e);
    } finally {
      await updateSyncCount();
    }
    syncData();
  }

  /** Permanently discards a dead-lettered operation at the user's request. */
  const discardFailedSync = async (deadLetterId) => {
    try {
      await deleteFromStore(DEAD_LETTER_STORE, deadLetterId);
    } catch (e) {
      console.error('Failed to discard a dead-lettered operation:', e);
    } finally {
      await updateSyncCount();
    }
  }

  /**
   * Moves an operation out of the retry queue and into the dead-letter store,
   * so it stays visible to the user instead of being silently dropped or
   * retried forever.
   */
  const deadLetter = async (item, reason) => {
    const { id, ...rest } = item;
    try {
      await putIntoStore(DEAD_LETTER_STORE, { ...rest, reason, deadLetteredAt: Date.now() });
    } catch (e) {
      console.error('Failed to record a dead-lettered sync operation:', e);
    }
    await deleteFromStore('sync_queue', id);
  };

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

      const now = Date.now();
      let gaveUpCount = 0;

      for (const item of orderForDrain(queue, now)) {
        // Not due yet — its backoff has not elapsed. Skip to the next item
        // rather than abandoning the whole queue.
        if (!isDue(item, now)) continue;

        let response = null;
        let errorMessage = null;

        try {
          response = await fetchWithTimeout(item.url, {
            method: item.method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item.body)
          });
        } catch (fetchErr) {
          errorMessage = fetchErr?.message || 'Network request failed';
        }

        const classification = classifyResponse(response);
        const plan = planNextAttempt({
          item,
          classification,
          now: Date.now(),
          errorMessage: errorMessage || (response ? `Server responded ${response.status}` : null)
        });

        if (plan.action === 'remove') {
          await deleteFromStore('sync_queue', item.id);
          continue;
        }

        if (plan.action === 'pause') {
          // The session expired. Stop draining so the rest of the queue is not
          // burned against a dead session — but keep every item, including this
          // one. The old code DELETED on 401, destroying queued health logs.
          console.warn('Sync paused: authentication required. Queued changes are preserved.');
          break;
        }

        if (plan.action === 'dead-letter') {
          await deadLetter(plan.item, plan.reason);
          gaveUpCount += 1;
          continue;
        }

        // Transient: record the attempt and its backoff, then move on to the
        // next item. A failing operation no longer blocks its siblings.
        await putIntoStore('sync_queue', plan.item);
      }

      if (gaveUpCount > 0) {
        toast.error(
          gaveUpCount === 1
            ? '⚠️ 1 offline change could not be saved and needs your attention.'
            : `⚠️ ${gaveUpCount} offline changes could not be saved and need your attention.`
        );
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
            const db = await initDB();
            const tx = db.transaction('cycles', 'readwrite');
            const store = tx.objectStore('cycles');
            await store.clear();

            for (const c of data.data.cycles) {
              if (c.encrypted_data) {
                try {
                  const decryptedFields = await decrypt(c.encrypted_data);
                  const fullyDecrypted = { ...c, ...decryptedFields };
                  await store.put(fullyDecrypted);
                  data.data.cycles[data.data.cycles.indexOf(c)] = fullyDecrypted;
                } catch (e) {
                  console.error('Failed to decrypt cycle', e);
                  await store.put(c);
                }
              } else {
                await store.put(c);
              }
            }

            const sortedCycles = [...data.data.cycles].sort((a, b) => new Date(b.start_date) - new Date(a.start_date));
            const prediction = predictNextPeriod(sortedCycles);
            return {
              success: true,
              data: {
                cycles: data.data.cycles,
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
      const sortedCycles = [...cachedCycles].sort((a, b) => new Date(b.start_date) - new Date(a.start_date));
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
              const db = await initDB();
              const tx = db.transaction('daily_logs', 'readwrite');
              const store = tx.objectStore('daily_logs');
              await store.clear();
              const decryptedLogs = [];
              for (const log of data.data) {
                let decryptedLog = log;
                if (log.encrypted_data) {
                  try {
                    const decryptedFields = await decrypt(log.encrypted_data);
                    decryptedLog = { ...log, ...decryptedFields };
                  } catch (e) {
                    console.error('Failed to decrypt log in fetchAll', e);
                  }
                }
                decryptedLogs.push(decryptedLog);
                await store.put(decryptedLog);
              }
              data.data = decryptedLogs;
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
    <OfflineContext.Provider value={{
      isOffline,
      pendingSyncCount,
      failedSyncItems,
      isSyncing,
      syncData,
      retryFailedSync,
      discardFailedSync,
      offlineClient
    }}>
      {children}
    </OfflineContext.Provider>
  )
}

export function useOffline() {
  return useContext(OfflineContext)
}