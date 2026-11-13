import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { ManifestHistory, BillingConfig, Folder, RecycleBinItem, ManifestOverride, ManualDocManifest } from '../types';

export interface QueuedScanImage {
  name: string;
  type: string;
  base64: string;
}

export interface OfflineQueuedScan {
  id: string;
  createdAt: number;
  status: 'offline_queued' | 'processing' | 'completed' | 'failed';
  instruction: string;
  targetFolderId?: string | null;
  pageCount: number;
  images: QueuedScanImage[];
  retryCount: number;
  lastError?: string;
  resultManifestNo?: string;
  resultManifestId?: string;
  completedAt?: number;
}

export interface CapturedPage {
  pageNumber: number;
  name: string;
  type: string;
  size: number;
  dataUrl: string;
  timestamp: number;
}

export interface CapturedManifestSession {
  id: string;
  sessionNumber: number;
  manifestName?: string;
  createdAt: number;
  updatedAt: number;
  folderId?: string | null;
  pageCount: number;
  pages: CapturedPage[];
  status: 'ready' | 'queued' | 'extracting' | 'success' | 'failed';
  extractionError?: string;
  resultManifestNo?: string;
  resultManifestId?: string;
  extractedAt?: number;
  cloudBackupTimestamp?: number;
  isCloudBackedUp?: boolean;
}

interface SmartBillingDB extends DBSchema {
  manifests: {
    key: string;
    value: ManifestHistory;
    indexes: { 'by-manifestNo': string; 'by-createdAt': number };
  };
  billing_data: {
    key: string;
    value: { key: string; data: any; updatedAt: number };
  };
  billing_rates: {
    key: string;
    value: { key: string; config: BillingConfig; updatedAt: number };
  };
  offline_scans_queue: {
    key: string;
    value: OfflineQueuedScan;
    indexes: { 'by-status': string; 'by-createdAt': number };
  };
  captured_manifest_sessions: {
    key: string;
    value: CapturedManifestSession;
    indexes: { 'by-status': string; 'by-createdAt': number };
  };
}

const DB_NAME = 'SmartBilling_OfflineDB_v1';
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<SmartBillingDB>> | null = null;

export function getOfflineDB(): Promise<IDBPDatabase<SmartBillingDB>> {
  if (!dbPromise) {
    dbPromise = openDB<SmartBillingDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // 1. Manifests store
        if (!db.objectStoreNames.contains('manifests')) {
          const manifestStore = db.createObjectStore('manifests', { keyPath: 'id' });
          manifestStore.createIndex('by-manifestNo', 'manifestNo');
          manifestStore.createIndex('by-createdAt', 'createdAt');
        }

        // 2. Generic Billing Data (overrides, manual doc entries, folders, trash)
        if (!db.objectStoreNames.contains('billing_data')) {
          db.createObjectStore('billing_data', { keyPath: 'key' });
        }

        // 3. Billing Rates & Global Config
        if (!db.objectStoreNames.contains('billing_rates')) {
          db.createObjectStore('billing_rates', { keyPath: 'key' });
        }

        // 4. Offline Camera Scans Queue
        if (!db.objectStoreNames.contains('offline_scans_queue')) {
          const scanQueue = db.createObjectStore('offline_scans_queue', { keyPath: 'id' });
          scanQueue.createIndex('by-status', 'status');
          scanQueue.createIndex('by-createdAt', 'createdAt');
        }

        // 5. Captured Manifest Pages Sessions Store
        if (!db.objectStoreNames.contains('captured_manifest_sessions')) {
          const capturedStore = db.createObjectStore('captured_manifest_sessions', { keyPath: 'id' });
          capturedStore.createIndex('by-status', 'status');
          capturedStore.createIndex('by-createdAt', 'createdAt');
        }
      },
    });
  }
  return dbPromise;
}

// -------------------------------------------------------------
// Manifests Persistence
// -------------------------------------------------------------
export async function saveManifestsToIDB(manifests: ManifestHistory[]): Promise<void> {
  try {
    const db = await getOfflineDB();
    const tx = db.transaction('manifests', 'readwrite');
    // Clear existing records so deleted manifests do not persist in IDB
    await tx.store.clear();
    for (const m of manifests) {
      await tx.store.put(m);
    }
    await tx.done;
  } catch (err) {
    console.warn('IDB saveManifestsToIDB error:', err);
  }
}

export async function getManifestsFromIDB(): Promise<ManifestHistory[]> {
  try {
    const db = await getOfflineDB();
    return await db.getAll('manifests');
  } catch (err) {
    console.warn('IDB getManifestsFromIDB error:', err);
    return [];
  }
}

export async function deleteManifestFromIDB(id: string): Promise<void> {
  try {
    const db = await getOfflineDB();
    await db.delete('manifests', id);
  } catch (err) {
    console.warn('IDB deleteManifestFromIDB error:', err);
  }
}

// -------------------------------------------------------------
// Billing Data Persistence (Overrides, Folders, Manual Entries)
// -------------------------------------------------------------
export async function saveBillingDataToIDB(key: string, data: any): Promise<void> {
  try {
    const db = await getOfflineDB();
    await db.put('billing_data', { key, data, updatedAt: Date.now() });
  } catch (err) {
    console.warn(`IDB saveBillingDataToIDB (${key}) error:`, err);
  }
}

export async function getBillingDataFromIDB<T>(key: string): Promise<T | null> {
  try {
    const db = await getOfflineDB();
    const item = await db.get('billing_data', key);
    return item ? (item.data as T) : null;
  } catch (err) {
    console.warn(`IDB getBillingDataFromIDB (${key}) error:`, err);
    return null;
  }
}

// -------------------------------------------------------------
// Billing Rates Persistence
// -------------------------------------------------------------
export async function saveBillingRatesToIDB(config: BillingConfig): Promise<void> {
  try {
    const db = await getOfflineDB();
    await db.put('billing_rates', { key: 'active_rates', config, updatedAt: Date.now() });
  } catch (err) {
    console.warn('IDB saveBillingRatesToIDB error:', err);
  }
}

export async function getBillingRatesFromIDB(): Promise<BillingConfig | null> {
  try {
    const db = await getOfflineDB();
    const item = await db.get('billing_rates', 'active_rates');
    return item ? item.config : null;
  } catch (err) {
    console.warn('IDB getBillingRatesFromIDB error:', err);
    return null;
  }
}

// -------------------------------------------------------------
// Offline Camera Scans Queue Management
// -------------------------------------------------------------
export async function queueOfflineScan(payload: {
  images: QueuedScanImage[];
  instruction?: string;
  targetFolderId?: string | null;
}): Promise<OfflineQueuedScan> {
  const db = await getOfflineDB();
  const newScan: OfflineQueuedScan = {
    id: `offline-scan-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    createdAt: Date.now(),
    status: 'offline_queued',
    instruction: payload.instruction || 'Extract billing data from these images. Treat them as sequential pages of one manifest.',
    targetFolderId: payload.targetFolderId || null,
    pageCount: payload.images.length,
    images: payload.images,
    retryCount: 0,
  };

  await db.put('offline_scans_queue', newScan);
  return newScan;
}

export async function getQueuedScans(): Promise<OfflineQueuedScan[]> {
  try {
    const db = await getOfflineDB();
    return await db.getAll('offline_scans_queue');
  } catch (err) {
    console.warn('IDB getQueuedScans error:', err);
    return [];
  }
}

export async function updateQueuedScan(id: string, updates: Partial<OfflineQueuedScan>): Promise<void> {
  try {
    const db = await getOfflineDB();
    const existing = await db.get('offline_scans_queue', id);
    if (!existing) return;
    const updated = { ...existing, ...updates };
    await db.put('offline_scans_queue', updated);
  } catch (err) {
    console.warn(`IDB updateQueuedScan (${id}) error:`, err);
  }
}

export async function deleteQueuedScan(id: string): Promise<void> {
  try {
    const db = await getOfflineDB();
    await db.delete('offline_scans_queue', id);
  } catch (err) {
    console.warn(`IDB deleteQueuedScan (${id}) error:`, err);
  }
}

export async function clearCompletedScans(): Promise<void> {
  try {
    const db = await getOfflineDB();
    const all = await db.getAll('offline_scans_queue');
    const tx = db.transaction('offline_scans_queue', 'readwrite');
    for (const scan of all) {
      if (scan.status === 'completed') {
        await tx.store.delete(scan.id);
      }
    }
    await tx.done;
  } catch (err) {
    console.warn('IDB clearCompletedScans error:', err);
  }
}
