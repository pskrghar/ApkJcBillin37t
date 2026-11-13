import { 
  getQueuedScans, 
  updateQueuedScan, 
  saveManifestsToIDB, 
  getManifestsFromIDB, 
  OfflineQueuedScan,
  getBillingRatesFromIDB
} from './offlineStore';
import { extractManifestWithFallback, getEffectiveGeminiApiKey } from './manifestExtractor';
import { ManifestHistory, BillingConfig } from '../types';

export type SyncStatusCallback = (statusText: string, scanId?: string) => void;
export type ManifestSyncedCallback = (syncedManifest: ManifestHistory, scanId: string) => void;

let isSyncInProgress = false;
const syncListeners = new Set<() => void>();
const manifestSyncedListeners = new Set<ManifestSyncedCallback>();

export function addQueueChangeListener(fn: () => void): () => void {
  syncListeners.add(fn);
  return () => syncListeners.delete(fn);
}

export function addManifestSyncedListener(fn: ManifestSyncedCallback): () => void {
  manifestSyncedListeners.add(fn);
  return () => manifestSyncedListeners.delete(fn);
}

function notifyQueueChanged() {
  syncListeners.forEach(listener => {
    try { listener(); } catch (e) { console.warn(e); }
  });
}

function notifyManifestSynced(manifest: ManifestHistory, scanId: string) {
  manifestSyncedListeners.forEach(listener => {
    try { listener(manifest, scanId); } catch (e) { console.warn(e); }
  });
}

/**
 * Process all pending offline scans in queue using Gemini AI
 */
export async function processOfflineScansQueue(
  currentConfig: BillingConfig,
  customApiKey?: string,
  onStatusUpdate?: SyncStatusCallback
): Promise<{ processed: number; failed: number }> {
  if (isSyncInProgress) {
    console.log('[OfflineSyncWorker] Sync already in progress, skipping duplicate cycle');
    return { processed: 0, failed: 0 };
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    console.log('[OfflineSyncWorker] Still offline, queue processing deferred');
    if (onStatusUpdate) onStatusUpdate('Device is currently offline. Auto-sync will resume when connected.');
    return { processed: 0, failed: 0 };
  }

  const allScans = await getQueuedScans();
  const pendingScans = allScans.filter(s => s.status === 'offline_queued');

  if (pendingScans.length === 0) {
    return { processed: 0, failed: 0 };
  }

  isSyncInProgress = true;
  notifyQueueChanged();

  let processedCount = 0;
  let failedCount = 0;

  try {
    const effectiveRates = currentConfig || (await getBillingRatesFromIDB()) || {
      minRate: 40,
      baseWeight: 0.5,
      docAddRate: 35,
      parcelFirstKg: 80,
      parcelAddKg: 70,
      gstPercent: 18,
      docketCharge: 20,
      fuelPercent: 10,
    };

    const effectiveKey = customApiKey || getEffectiveGeminiApiKey();

    for (const scan of pendingScans) {
      try {
        await updateQueuedScan(scan.id, { status: 'processing' });
        notifyQueueChanged();

        if (onStatusUpdate) onStatusUpdate(`Syncing offline scan (${scan.images.length} pages)...`, scan.id);

        const inputs = scan.images.map(img => ({
          data: img.base64,
          mimeType: img.type || 'image/jpeg'
        }));

        const result = await extractManifestWithFallback(
          inputs,
          effectiveRates,
          effectiveKey || undefined,
          (msg) => {
            if (onStatusUpdate) onStatusUpdate(msg, scan.id);
          }
        );

        const calculatedRows = result.rows;
        const meta = {
          manifestNo: result.manifestNo || `MF-${Math.floor(Math.random() * 90000) + 10000}`,
          manifestDate: result.manifestDate || new Date().toLocaleDateString()
        };

        const newManifest: ManifestHistory = {
          id: `mf-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          manifestNo: meta.manifestNo,
          manifestDate: meta.manifestDate,
          rows: calculatedRows,
          config: effectiveRates,
          totalAmount: result.totalAmount || calculatedRows.reduce((sum: number, r: any) => sum + r.amount, 0),
          itemCount: calculatedRows.length,
          createdAt: Date.now(),
          folderId: scan.targetFolderId || undefined
        };

        // Persist new manifest into IndexedDB
        const existingManifests = await getManifestsFromIDB();
        const merged = [newManifest, ...existingManifests.filter(m => m.manifestNo !== newManifest.manifestNo)];
        await saveManifestsToIDB(merged);

        // Update queued scan record
        await updateQueuedScan(scan.id, {
          status: 'completed',
          resultManifestNo: newManifest.manifestNo,
          resultManifestId: newManifest.id,
          completedAt: Date.now()
        });

        processedCount++;
        notifyManifestSynced(newManifest, scan.id);
        notifyQueueChanged();
      } catch (err: any) {
        console.error(`[OfflineSyncWorker] Failed processing scan ${scan.id}:`, err);
        failedCount++;
        await updateQueuedScan(scan.id, {
          status: 'offline_queued', // Allow re-try next time
          lastError: err?.message || 'Extraction failed',
          retryCount: (scan.retryCount || 0) + 1
        });
        notifyQueueChanged();
      }
    }
  } finally {
    isSyncInProgress = false;
    notifyQueueChanged();
  }

  return { processed: processedCount, failed: failedCount };
}

/**
 * Initialize automatic listeners for 'online' event to trigger background queue sync
 */
export function initOfflineAutoSync(
  getConfig: () => BillingConfig,
  getApiKey: () => string,
  onStatusUpdate?: SyncStatusCallback
): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleOnline = async () => {
    console.log('[OfflineSyncWorker] Internet connection restored (online event). Auto-processing queued scans...');
    try {
      await processOfflineScansQueue(getConfig(), getApiKey(), onStatusUpdate);
    } catch (e) {
      console.warn('[OfflineSyncWorker] Auto-sync run error:', e);
    }
  };

  window.addEventListener('online', handleOnline);

  // If already online, trigger a check for any scans that were queued earlier
  if (navigator.onLine) {
    setTimeout(() => {
      getQueuedScans().then(scans => {
        if (scans.some(s => s.status === 'offline_queued')) {
          handleOnline();
        }
      });
    }, 2000);
  }

  return () => {
    window.removeEventListener('online', handleOnline);
  };
}
