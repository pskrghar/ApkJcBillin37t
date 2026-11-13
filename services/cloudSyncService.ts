import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeFirestore,
  getFirestore,
  disableNetwork,
  enableNetwork,
  setLogLevel,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  writeBatch,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import {
  ManifestHistory,
  Folder,
  BillingConfig,
  CloudBackupFile,
  CloudSyncMeta,
  SyncedDevice,
  ManifestOverride,
  ManualDocManifest,
} from '../types';

// Suppress internal Firestore connection retry logs to prevent [code=unavailable] warning spam in browser console
try {
  setLogLevel('silent');
} catch {
  // Non-fatal if logger is already locked
}

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

const firestoreDbId =
  firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
    ? firebaseConfig.firestoreDatabaseId
    : undefined;

// Use standard, reliable Firestore instance for web
export const db = firestoreDbId ? getFirestore(app, firestoreDbId) : getFirestore(app);

// =========================================================================
// Reactive Network Status & Connection Lifecycle Management
// =========================================================================
let isNetworkOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
let isFirestoreNetworkActive = isNetworkOnline;
const networkStatusListeners = new Set<(online: boolean) => void>();

export function isOnlineStatus(): boolean {
  return isNetworkOnline;
}

export function isFirestoreActive(): boolean {
  return isFirestoreNetworkActive;
}

export function addConnectionStatusListener(listener: (online: boolean) => void): () => void {
  networkStatusListeners.add(listener);
  return () => networkStatusListeners.delete(listener);
}

function notifyNetworkStatus(online: boolean) {
  isNetworkOnline = online;
  isFirestoreNetworkActive = online;
  networkStatusListeners.forEach((fn) => {
    try {
      fn(online);
    } catch {
      // ignore
    }
  });
}

export async function disableFirestoreNetwork(): Promise<void> {
  isFirestoreNetworkActive = false;
}

export async function enableFirestoreNetwork(): Promise<void> {
  isFirestoreNetworkActive = true;
}

// Auto-wire browser online and offline event handlers
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    notifyNetworkStatus(true);
  });

  window.addEventListener('offline', () => {
    notifyNetworkStatus(false);
  });
}

/**
 * Helper to identify if an error is an expected offline or network unavailability condition.
 */
export function checkIsOfflineError(error: any): boolean {
  if (!error) return false;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  const code = (error.code || '').toString().toLowerCase();
  const msg = (error.message || '').toString().toLowerCase();
  return (
    code === 'unavailable' ||
    code === 'failed-precondition' ||
    msg.includes('offline') ||
    msg.includes('unavailable') ||
    msg.includes('could not reach') ||
    msg.includes('network') ||
    msg.includes('client is offline') ||
    msg.includes('the operation could not be completed')
  );
}

const BACKUPS_COLLECTION = 'cloud_backups';
const MANIFESTS_COLLECTION = 'cloud_manifests';
const FOLDERS_COLLECTION = 'cloud_folders';
const SETTINGS_COLLECTION = 'cloud_settings';
const DEVICES_COLLECTION = 'cloud_devices';

/**
 * Recursively strips undefined fields from an object so Firestore setDoc / updateDoc / writeBatch accepts it.
 */
export function sanitizeForFirestore<T>(data: T): T {
  if (data === undefined) {
    return null as unknown as T;
  }
  if (data === null || typeof data !== 'object') {
    return data;
  }
  if (data instanceof Date) {
    return data;
  }
  if (Array.isArray(data)) {
    return data
      .filter((item) => item !== undefined)
      .map((item) => sanitizeForFirestore(item)) as unknown as T;
  }
  const cleanObj: Record<string, any> = {};
  for (const [key, value] of Object.entries(data as Record<string, any>)) {
    if (value !== undefined) {
      cleanObj[key] = sanitizeForFirestore(value);
    }
  }
  return cleanObj as T;
}

/**
 * Test connectivity to Firebase Cloud Firestore.
 * Does not treat lack of internet as a code error.
 */
export async function testCloudConnection(): Promise<{ ok: boolean; message: string; isOffline?: boolean }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { ok: false, isOffline: true, message: 'Offline mode: Operating from local storage (auto-sync paused)' };
  }
  try {
    const testDocRef = doc(db, SETTINGS_COLLECTION, 'connection_ping');
    await setDoc(testDocRef, { ping: Date.now() }, { merge: true });
    return { ok: true, message: 'Connected to Firebase Firestore' };
  } catch (error: any) {
    if (checkIsOfflineError(error)) {
      return { ok: false, isOffline: true, message: 'Offline mode: Changes are saved in local cache' };
    }
    return { ok: false, message: error?.message || 'Operating in offline cache mode' };
  }
}

export type ManifestSectionType = 'P' | 'PD' | 'ALL';

/**
 * Determine if a manifest belongs to the "P Manifest" or "P + D Manifest" section.
 * - Checks edited P+D override (dCount > 0), attached pdOverride, Document rows, or manualDocCount > 0: 'PD'
 * - Otherwise parcel-only: 'P'
 */
export function getManifestSectionType(manifest: ManifestHistory, override?: ManifestOverride): 'P' | 'PD' {
  const effectiveOverride = override || manifest.pdOverride;
  if (effectiveOverride && typeof effectiveOverride.dCount === 'number') {
    if (effectiveOverride.dCount > 0) return 'PD';
  }
  const hasDocInRows =
    Boolean((manifest as any).isManualDoc) ||
    (manifest.rows && manifest.rows.some((r) => r.type === 'Document' || (r as any).docCount > 0)) ||
    Boolean((manifest as any).docCount && (manifest as any).docCount > 0);
  if (hasDocInRows) return 'PD';
  if (effectiveOverride && effectiveOverride.dCount === 0) return 'P';
  if (manifest.sectionType === 'PD' || (manifest as any).manifestCategory === 'PD') return 'PD';
  if (manifest.sectionType === 'P' || (manifest as any).manifestCategory === 'P') return 'P';
  return 'P';
}

/**
 * Deduplicates individual consignment rows inside a manifest by serialNo, description, weight, and rate.
 */
export function deduplicateManifestRows(rows: any[]): { cleanRows: any[]; removedCount: number } {
  if (!Array.isArray(rows)) return { cleanRows: [], removedCount: 0 };
  const seen = new Set<string>();
  const cleanRows: any[] = [];
  let removedCount = 0;

  for (const r of rows) {
    const sl = (r.serialNo || '').toString().trim().toLowerCase();
    const desc = (r.description || '').toString().trim().toLowerCase();
    const wt = (r.weight || 0).toString();
    const type = (r.type || '').toString();
    const key = `${sl}|${desc}|${wt}|${type}`;

    if (key !== '||0|' && seen.has(key)) {
      removedCount++;
    } else {
      if (key !== '||0|') seen.add(key);
      cleanRows.push(r);
    }
  }

  return { cleanRows, removedCount };
}

/**
 * Deduplicate an array of manifests.
 * If two manifests share the same manifestNo and manifestDate (or the same ID),
 * merge them by retaining the newer or richer manifest, avoiding repeating records.
 */
export function deduplicateManifestCollection(manifests: ManifestHistory[]): {
  dedupedManifests: ManifestHistory[];
  duplicatesFiltered: number;
} {
  const bySemanticKey = new Map<string, ManifestHistory>();
  let duplicatesFiltered = 0;

  for (const m of manifests) {
    const normNo = (m.manifestNo || '').trim().toLowerCase();
    const normDate = (m.manifestDate || '').trim();
    // Unique key combination: normalized number and date, or fallback to id
    const semKey = normNo && normDate ? `${normNo}___${normDate}` : m.id;

    const existing = bySemanticKey.get(semKey);
    if (!existing) {
      // Deduplicate rows inside
      const { cleanRows, removedCount } = deduplicateManifestRows(m.rows || []);
      duplicatesFiltered += removedCount > 0 ? 1 : 0;
      bySemanticKey.set(semKey, { ...m, rows: cleanRows, itemCount: cleanRows.length });
    } else {
      duplicatesFiltered++;
      // Choose the version with more rows or newer timestamp
      const existingRowsCount = existing.rows?.length || 0;
      const currentRowsCount = m.rows?.length || 0;
      const existingTime = existing.createdAt || 0;
      const currentTime = m.createdAt || 0;

      if (currentRowsCount > existingRowsCount || currentTime > existingTime) {
        const { cleanRows } = deduplicateManifestRows(m.rows || []);
        bySemanticKey.set(semKey, {
          ...m,
          id: existing.id, // preserve stable ID
          rows: cleanRows,
          itemCount: cleanRows.length,
          folderId: m.folderId || existing.folderId,
        });
      }
    }
  }

  return {
    dedupedManifests: Array.from(bySemanticKey.values()),
    duplicatesFiltered,
  };
}

/**
 * Fetch saved P+D Manifest state (finalBillOverrides & manualDocEntries) for a channel
 */
export async function fetchFinalPdState(channelKey?: string): Promise<{
  finalBillOverrides: Record<string, ManifestOverride>;
  manualDocEntries: ManualDocManifest[];
  updatedAt: number;
}> {
  const targetChannel = (channelKey || 'DEFAULT').trim().toUpperCase();
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { finalBillOverrides: {}, manualDocEntries: [], updatedAt: 0 };
  }
  try {
    const stateDocRef = doc(db, SETTINGS_COLLECTION, `final_pd_state_${targetChannel}`);
    const snap = await getDoc(stateDocRef);
    if (snap.exists()) {
      const data = snap.data() as any;
      return {
        finalBillOverrides: (data.finalBillOverrides && typeof data.finalBillOverrides === 'object') ? data.finalBillOverrides : {},
        manualDocEntries: Array.isArray(data.manualDocEntries) ? data.manualDocEntries : [],
        updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : 0,
      };
    }
    // Fallback: check legacy DEFAULT key if current channel has none yet
    if (targetChannel !== 'DEFAULT') {
      const legacyRef = doc(db, SETTINGS_COLLECTION, `final_pd_state_DEFAULT`);
      const legacySnap = await getDoc(legacyRef);
      if (legacySnap.exists()) {
        const data = legacySnap.data() as any;
        return {
          finalBillOverrides: (data.finalBillOverrides && typeof data.finalBillOverrides === 'object') ? data.finalBillOverrides : {},
          manualDocEntries: Array.isArray(data.manualDocEntries) ? data.manualDocEntries : [],
          updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : 0,
        };
      }
    }
    return { finalBillOverrides: {}, manualDocEntries: [], updatedAt: 0 };
  } catch (error) {
    if (!checkIsOfflineError(error)) {
      console.warn('Notice fetching P+D state from cloud:', error);
    }
    return { finalBillOverrides: {}, manualDocEntries: [], updatedAt: 0 };
  }
}

/**
 * Save P+D Manifest state (finalBillOverrides & manualDocEntries) to cloud settings
 */
export async function saveFinalPdState(params: {
  channelKey?: string;
  finalBillOverrides: Record<string, ManifestOverride>;
  manualDocEntries: ManualDocManifest[];
}): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  const targetChannel = (params.channelKey || 'DEFAULT').trim().toUpperCase();
  const stateDocRef = doc(db, SETTINGS_COLLECTION, `final_pd_state_${targetChannel}`);
  const payload = sanitizeForFirestore({
    channelKey: targetChannel,
    finalBillOverrides: params.finalBillOverrides || {},
    manualDocEntries: params.manualDocEntries || [],
    updatedAt: Date.now(),
  });
  await setDoc(stateDocRef, payload);
}

/**
 * Delete a standalone Manual Document Manifest entry from cloud P+D state
 */
export async function deleteManualDocEntryFromCloud(docId: string, channelKey?: string): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Cannot delete from cloud while offline. Please reconnect to internet.');
  }
  const targetChannel = (channelKey || 'DEFAULT').trim().toUpperCase();
  const current = await fetchFinalPdState(targetChannel);
  const nextDocs = current.manualDocEntries.filter((d) => d.id !== docId);
  const nextOverrides = { ...current.finalBillOverrides };
  delete nextOverrides[docId];
  await saveFinalPdState({
    channelKey: targetChannel,
    finalBillOverrides: nextOverrides,
    manualDocEntries: nextDocs,
  });
}

/**
 * Creates a full cloud backup snapshot with title, description, optional section tag, and P+D Doc edits
 */
export async function createCloudBackup(params: {
  name: string;
  description?: string;
  sectionType?: ManifestSectionType;
  channelKey?: string;
  manifests: ManifestHistory[];
  folders: Folder[];
  globalConfig: BillingConfig;
  finalBillOverrides?: Record<string, ManifestOverride>;
  manualDocEntries?: ManualDocManifest[];
  appTheme?: 'light' | 'dark' | 'reading';
  appScale?: number;
  appZoom?: number;
}): Promise<CloudBackupFile> {
  const backupId = `backup_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = Date.now();
  const targetChannel = (params.channelKey || 'REMIX-CLOUD-SYNC').trim().toUpperCase();
  const allOverrides = params.finalBillOverrides || {};
  const allManualDocs = params.manualDocEntries || [];

  const section = params.sectionType || 'ALL';
  const filteredManifests = section === 'ALL'
    ? params.manifests
    : params.manifests.filter((m) => getManifestSectionType(m, allOverrides[m.id]) === section);

  const enrichedManifests = filteredManifests.map((m) => {
    const ov = allOverrides[m.id] || m.pdOverride;
    const secType = getManifestSectionType(m, ov);
    return {
      ...m,
      sectionType: secType,
      ...(ov ? { pdOverride: ov } : {}),
    };
  });

  const { dedupedManifests, duplicatesFiltered } = deduplicateManifestCollection(enrichedManifests);

  const backupManualDocs = section === 'P' ? [] : allManualDocs;
  const backupOverrides: Record<string, ManifestOverride> = {};
  if (section === 'ALL') {
    Object.assign(backupOverrides, allOverrides);
  } else {
    for (const m of dedupedManifests) {
      if (allOverrides[m.id]) backupOverrides[m.id] = allOverrides[m.id];
    }
    if (section === 'PD') {
      for (const d of backupManualDocs) {
        if (allOverrides[d.id]) backupOverrides[d.id] = allOverrides[d.id];
      }
    }
  }

  const manualDocTotal = backupManualDocs.reduce((sum, d) => {
    const ov = backupOverrides[d.id];
    const count = ov?.dCount ?? d.docCount ?? 0;
    const rate = d.documentRate ?? params.globalConfig.documentRate ?? 5;
    return sum + (count * rate);
  }, 0);
  const manualDocItems = backupManualDocs.reduce((sum, d) => {
    const ov = backupOverrides[d.id];
    return sum + (ov?.dCount ?? d.docCount ?? 0);
  }, 0);

  const totalAmount = dedupedManifests.reduce((sum, m) => sum + (m.totalAmount || 0), 0) + manualDocTotal;
  const itemCount = dedupedManifests.reduce((sum, m) => sum + (m.itemCount || 0), 0) + manualDocItems;

  const sectionLabel = section === 'P' ? ' [P Manifest]' : section === 'PD' ? ' [P + D Manifest]' : '';

  const backupRecord: CloudBackupFile = {
    id: backupId,
    cloudDocId: backupId,
    name: (params.name.trim() || `Backup_${new Date().toLocaleDateString()}`) + sectionLabel,
    type: 'full_backup',
    createdAt: now,
    updatedAt: now,
    manifestCount: dedupedManifests.length,
    folderCount: params.folders.length,
    totalAmount,
    itemCount,
    description: params.description || `Cloud backup (${section}) with ${dedupedManifests.length} manifests, ${backupManualDocs.length} doc entries, and ${params.folders.length} folders (${duplicatesFiltered} duplicates filtered)`,
    data: {
      manifests: dedupedManifests,
      folders: params.folders,
      globalConfig: params.globalConfig,
      finalBillOverrides: backupOverrides,
      manualDocEntries: backupManualDocs,
      appTheme: params.appTheme,
      appScale: params.appScale,
      appZoom: params.appZoom,
    },
  };

  try {
    backupRecord.sizeBytes = new TextEncoder().encode(JSON.stringify(backupRecord)).length;
  } catch {
    backupRecord.sizeBytes = (dedupedManifests.length * 1400) + (params.folders.length * 280) + 1200;
  }

  const backupDocRef = doc(db, BACKUPS_COLLECTION, backupId);
  const sanitized = sanitizeForFirestore({
    ...backupRecord,
    channelKey: targetChannel,
  });
  await setDoc(backupDocRef, sanitized);

  return backupRecord;
}

/**
 * List all cloud backups ordered by creation date
 */
export async function listCloudBackups(channelKey?: string): Promise<CloudBackupFile[]> {
  try {
    const normalizeBackupDoc = (dId: string, data: any): CloudBackupFile => {
      const manifests = Array.isArray(data.data?.manifests) ? data.data.manifests : [];
      const folders = Array.isArray(data.data?.folders) ? data.data.folders : [];
      const derivedTotal = manifests.reduce((sum: number, m: any) => sum + (Number(m?.totalAmount) || 0), 0);
      return {
        ...data,
        id: data.id || dId,
        cloudDocId: dId,
        name: data.name || 'Cloud Backup Snapshot',
        createdAt: typeof data.createdAt === 'number' ? data.createdAt : Date.now(),
        updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : (typeof data.createdAt === 'number' ? data.createdAt : Date.now()),
        manifestCount: typeof data.manifestCount === 'number' ? data.manifestCount : manifests.length,
        folderCount: typeof data.folderCount === 'number' ? data.folderCount : folders.length,
        totalAmount: typeof data.totalAmount === 'number' ? data.totalAmount : derivedTotal,
        itemCount: typeof data.itemCount === 'number' ? data.itemCount : manifests.reduce((sum: number, m: any) => sum + (Number(m?.itemCount) || 0), 0),
        data: data.data || { manifests, folders, globalConfig: data.data?.globalConfig },
      } as CloudBackupFile;
    };

    const backupsQuery = query(collection(db, BACKUPS_COLLECTION), orderBy('createdAt', 'desc'), limit(50));
    const snapshot = await getDocs(backupsQuery);

    const backups: CloudBackupFile[] = [];
    const targetChannel = (channelKey || 'DEFAULT').trim().toUpperCase();

    snapshot.forEach((d) => {
      const data = d.data() as any;
      if (data && (data.id || d.id)) {
        const docChannel = (data.channelKey || '').toString().trim().toUpperCase();
        if (!docChannel || docChannel === targetChannel || targetChannel === 'DEFAULT' || docChannel === 'REMIX-CLOUD-SYNC') {
          backups.push(normalizeBackupDoc(d.id, data));
        }
      }
    });

    return backups;
  } catch (error) {
    console.warn("Notice querying ordered backups, falling back to plain getDocs:", error);
    try {
      const snapshot = await getDocs(collection(db, BACKUPS_COLLECTION));
      const backups: CloudBackupFile[] = [];
      const targetChannel = (channelKey || 'DEFAULT').trim().toUpperCase();

      snapshot.forEach((d) => {
        const data = d.data() as any;
        if (data && (data.id || d.id)) {
          const docChannel = (data.channelKey || '').toString().trim().toUpperCase();
          if (!docChannel || docChannel === targetChannel || targetChannel === 'DEFAULT' || docChannel === 'REMIX-CLOUD-SYNC') {
            const manifests = Array.isArray(data.data?.manifests) ? data.data.manifests : [];
            const folders = Array.isArray(data.data?.folders) ? data.data.folders : [];
            const derivedTotal = manifests.reduce((sum: number, m: any) => sum + (Number(m?.totalAmount) || 0), 0);
            backups.push({
              ...data,
              id: data.id || d.id,
              cloudDocId: d.id,
              name: data.name || 'Cloud Backup Snapshot',
              createdAt: typeof data.createdAt === 'number' ? data.createdAt : Date.now(),
              updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : (typeof data.createdAt === 'number' ? data.createdAt : Date.now()),
              manifestCount: typeof data.manifestCount === 'number' ? data.manifestCount : manifests.length,
              folderCount: typeof data.folderCount === 'number' ? data.folderCount : folders.length,
              totalAmount: typeof data.totalAmount === 'number' ? data.totalAmount : derivedTotal,
              itemCount: typeof data.itemCount === 'number' ? data.itemCount : manifests.reduce((sum: number, m: any) => sum + (Number(m?.itemCount) || 0), 0),
              data: data.data || { manifests, folders, globalConfig: data.data?.globalConfig },
            } as CloudBackupFile);
          }
        }
      });
      return backups.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } catch (fallbackError) {
      console.warn("Notice reading backups from cloud:", fallbackError);
      return [];
    }
  }
}

/**
 * Delete a specific cloud backup
 */
export async function deleteCloudBackup(backupId: string, cloudDocId?: string): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Cannot delete cloud backup while offline. Please reconnect to internet.');
  }
  const primaryId = (cloudDocId || backupId).replace(/\//g, '_');
  await deleteDoc(doc(db, BACKUPS_COLLECTION, primaryId));
  if (backupId && backupId !== primaryId) {
    try {
      await deleteDoc(doc(db, BACKUPS_COLLECTION, backupId.replace(/\//g, '_')));
    } catch {
      // Ignore secondary cleanup
    }
  }
}

/**
 * Single manifest sync: Save or update a manifest directly to cloud
 */
export async function syncManifestToCloud(
  manifest: ManifestHistory,
  channelKey?: string,
  override?: ManifestOverride
): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return;
  }
  try {
    const safeDocId = (manifest.cloudDocId || manifest.id).replace(/\//g, '_');
    const docRef = doc(db, MANIFESTS_COLLECTION, safeDocId);
    const effectiveOv = override || manifest.pdOverride;
    const data = sanitizeForFirestore({
      ...manifest,
      id: safeDocId,
      ...(effectiveOv ? { pdOverride: effectiveOv } : {}),
      sectionType: getManifestSectionType(manifest, effectiveOv),
      updatedAt: manifest.updatedAt || manifest.createdAt || Date.now(),
      channelKey: channelKey || 'DEFAULT',
      cloudSyncedAt: Date.now(),
    });
    await setDoc(docRef, data, { merge: true });
  } catch (error) {
    if (!checkIsOfflineError(error)) {
      console.warn('Sync manifest notice (cached locally):', error);
    }
  }
}

/**
 * Single manifest delete: Remove from cloud when deleted locally or from Cloud Vault
 */
export async function deleteManifestFromCloud(manifestId: string, cloudDocId?: string): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Cannot delete from cloud vault while offline. Please reconnect to internet.');
  }
  const primaryId = (cloudDocId || manifestId).replace(/\//g, '_');
  await deleteDoc(doc(db, MANIFESTS_COLLECTION, primaryId));
  if (manifestId && manifestId.replace(/\//g, '_') !== primaryId) {
    try {
      await deleteDoc(doc(db, MANIFESTS_COLLECTION, manifestId.replace(/\//g, '_')));
    } catch {
      // Ignore secondary cleanup
    }
  }
}

/**
 * Single folder sync
 */
export async function syncFolderToCloud(folder: Folder, channelKey?: string): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return;
  }
  try {
    const docRef = doc(db, FOLDERS_COLLECTION, folder.id);
    const data = sanitizeForFirestore({
      ...folder,
      channelKey: channelKey || 'DEFAULT',
      cloudSyncedAt: Date.now(),
    });
    await setDoc(docRef, data, { merge: true });
  } catch (error) {
    if (!checkIsOfflineError(error)) {
      console.warn('Sync folder notice (cached locally):', error);
    }
  }
}

/**
 * Single folder delete
 */
export async function deleteFolderFromCloud(folderId: string): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  try {
    const docRef = doc(db, FOLDERS_COLLECTION, folderId);
    await deleteDoc(docRef);
  } catch (error) {
    if (!checkIsOfflineError(error)) {
      console.warn('Delete folder notice:', error);
    }
  }
}

/**
 * Register or update device presence in the common cloud storage
 */
export async function registerDevicePresence(device: SyncedDevice): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  try {
    const docId = `${device.channelKey || 'DEFAULT'}_${device.id}`;
    const docRef = doc(db, DEVICES_COLLECTION, docId);
    const data = sanitizeForFirestore({
      ...device,
      channelKey: device.channelKey || 'DEFAULT',
      lastActive: Date.now(),
    });
    await setDoc(docRef, data, { merge: true });
  } catch (error) {
    if (!checkIsOfflineError(error)) {
      console.warn('Register device presence notice:', error);
    }
  }
}

/**
 * Fetch list of connected devices for a channel
 */
export async function fetchConnectedDevices(channelKey: string, currentDeviceId?: string): Promise<SyncedDevice[]> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return [];
  try {
    const snapshot = await getDocs(collection(db, DEVICES_COLLECTION));
    const devices: SyncedDevice[] = [];
    const targetChannel = channelKey || 'DEFAULT';

    snapshot.forEach((d) => {
      const data = d.data() as SyncedDevice;
      if (data && (data.channelKey === targetChannel || (!data.channelKey && targetChannel === 'DEFAULT'))) {
        devices.push({
          ...data,
          isCurrentDevice: currentDeviceId ? data.id === currentDeviceId : false,
        });
      }
    });

    return devices.sort((a, b) => b.lastActive - a.lastActive);
  } catch (error) {
    if (!checkIsOfflineError(error)) {
      console.warn('Notice fetching connected devices:', error);
    }
    return [];
  }
}

/**
 * Listen to real-time connected devices updates
 */
export function listenToConnectedDevices(
  channelKey: string,
  currentDeviceId: string,
  onUpdate: (devices: SyncedDevice[]) => void
): Unsubscribe {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return () => {};
  }
  const targetChannel = channelKey || 'DEFAULT';

  return onSnapshot(
    collection(db, DEVICES_COLLECTION),
    (snapshot) => {
      const devices: SyncedDevice[] = [];
      snapshot.forEach((d) => {
        const data = d.data() as SyncedDevice;
        if (data && (data.channelKey === targetChannel || (!data.channelKey && targetChannel === 'DEFAULT'))) {
          devices.push({
            ...data,
            isCurrentDevice: data.id === currentDeviceId,
          });
        }
      });
      onUpdate(devices.sort((a, b) => b.lastActive - a.lastActive));
    },
    (error) => {
      if (!checkIsOfflineError(error)) {
        console.warn('Connected devices listener notice:', error);
      }
    }
  );
}

/**
 * Listen to real-time cloud manifest changes (for live cross-device sync)
 */
export function listenToCloudManifests(
  channelKey: string,
  onUpdate: (manifests: ManifestHistory[]) => void
): Unsubscribe {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return () => {};
  }
  const targetChannel = channelKey || 'DEFAULT';

  return onSnapshot(
    collection(db, MANIFESTS_COLLECTION),
    (snapshot) => {
      const manifests: ManifestHistory[] = [];
      snapshot.forEach((d) => {
        const data = d.data() as any;
        if (!data.channelKey || data.channelKey === targetChannel || targetChannel === 'DEFAULT') {
          manifests.push(data as ManifestHistory);
        }
      });
      onUpdate(manifests.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
    },
    (error) => {
      if (!checkIsOfflineError(error)) {
        console.warn('Real-time cloud manifests listener notice:', error);
      }
    }
  );
}

/**
 * Fetch all synced manifests from cloud
 */
export async function fetchCloudManifests(channelKey?: string): Promise<ManifestHistory[]> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return [];
  }
  try {
    const snapshot = await getDocs(collection(db, MANIFESTS_COLLECTION));
    const manifests: ManifestHistory[] = [];
    const targetChannel = (channelKey || 'DEFAULT').trim().toUpperCase();

    snapshot.forEach((d) => {
      const data = d.data() as any;
      const docChannel = (data.channelKey || '').toString().trim().toUpperCase();
      if (!docChannel || docChannel === targetChannel || targetChannel === 'DEFAULT' || docChannel === 'REMIX-CLOUD-SYNC') {
        manifests.push({ ...data, id: data.id || d.id, cloudDocId: d.id } as ManifestHistory);
      }
    });
    return manifests;
  } catch (error) {
    if (!checkIsOfflineError(error)) {
      console.warn('Notice fetching cloud manifests (offline cache active):', error);
    }
    return [];
  }
}

/**
 * Fetch all synced folders from cloud
 */
export async function fetchCloudFolders(channelKey?: string): Promise<Folder[]> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return [];
  }
  try {
    const snapshot = await getDocs(collection(db, FOLDERS_COLLECTION));
    const folders: Folder[] = [];
    const targetChannel = (channelKey || 'DEFAULT').trim().toUpperCase();

    snapshot.forEach((d) => {
      const data = d.data() as any;
      const docChannel = (data.channelKey || '').toString().trim().toUpperCase();
      if (!docChannel || docChannel === targetChannel || targetChannel === 'DEFAULT' || docChannel === 'REMIX-CLOUD-SYNC') {
        folders.push(data as Folder);
      }
    });
    return folders;
  } catch (error) {
    if (!checkIsOfflineError(error)) {
      console.warn('Notice fetching cloud folders (offline cache active):', error);
    }
    return [];
  }
}

/**
 * Perform a two-way smart sync between local state and cloud with automatic duplicate filtration:
 * - Unifies folders across local & cloud by name to keep manifests in the exact same place
 * - Filters out duplicate manifests and duplicate rows
 * - Supports filtering by section ('ALL', 'P', or 'PD')
 * - Returns merged clean state and detailed sync & deduplication metrics
 */
export async function performFullSync(
  localManifests: ManifestHistory[],
  localFolders: Folder[],
  globalConfig: BillingConfig,
  channelKey?: string,
  sectionFilter: ManifestSectionType = 'ALL',
  onProgress?: (percent: number, stepText: string) => void,
  options?: {
    localOverrides?: Record<string, ManifestOverride>;
    localManualDocEntries?: ManualDocManifest[];
    syncMode?: 'sync' | 'backup';
    deletedManualDocIds?: string[];
  }
): Promise<{
  mergedManifests: ManifestHistory[];
  mergedFolders: Folder[];
  mergedOverrides: Record<string, ManifestOverride>;
  mergedManualDocEntries: ManualDocManifest[];
  uploadedCount: number;
  downloadedCount: number;
  duplicatesFilteredCount: number;
  pManifestCount: number;
  pdManifestCount: number;
  syncTimestamp: number;
}> {
  const now = Date.now();
  const targetChannel = (channelKey || 'DEFAULT').trim().toUpperCase();
  const localOverrides = options?.localOverrides || {};
  const localManualDocs = options?.localManualDocEntries || [];
  const syncMode = options?.syncMode || 'sync';
  const deletedManualDocSet = new Set(options?.deletedManualDocIds || []);

  // If currently offline, keep local state intact and complete gracefully without network failure
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    onProgress?.(100, 'Operating offline: Changes preserved safely in local storage.');
    let pCount = 0;
    let pdCount = 0;
    for (const m of localManifests) {
      if (getManifestSectionType(m, localOverrides[m.id]) === 'P') pCount++;
      else pdCount++;
    }
    return {
      mergedManifests: localManifests,
      mergedFolders: localFolders,
      mergedOverrides: localOverrides,
      mergedManualDocEntries: localManualDocs,
      uploadedCount: 0,
      downloadedCount: 0,
      duplicatesFilteredCount: 0,
      pManifestCount: pCount,
      pdManifestCount: pdCount,
      syncTimestamp: now,
    };
  }

  onProgress?.(15, 'Connecting to Cloud Vault & fetching manifests...');

  // 1. Fetch remote manifests, folders, and P+D Doc edits state
  const [allRemoteManifests, allRemoteFolders, remotePdState] = await Promise.all([
    fetchCloudManifests(targetChannel),
    fetchCloudFolders(targetChannel),
    fetchFinalPdState(targetChannel),
  ]);

  onProgress?.(35, 'Unifying folder hierarchies & preserving structures...');

  // 2. Folder Unification: map cloud & local folders by name & ID so duplicate folders are prevented
  const folderNameMap = new Map<string, string>(); // normName -> canonicalId
  const canonicalFolderMap = new Map<string, Folder>(); // canonicalId -> Folder

  for (const f of localFolders) {
    const norm = f.name.trim().toLowerCase();
    folderNameMap.set(norm, f.id);
    canonicalFolderMap.set(f.id, f);
  }

  const remoteToCanonicalFolderId = new Map<string, string>();
  for (const rf of allRemoteFolders) {
    const norm = rf.name.trim().toLowerCase();
    const existingId = folderNameMap.get(norm);
    if (existingId) {
      remoteToCanonicalFolderId.set(rf.id, existingId);
    } else {
      folderNameMap.set(norm, rf.id);
      canonicalFolderMap.set(rf.id, rf);
      remoteToCanonicalFolderId.set(rf.id, rf.id);
    }
  }

  // Update folder references in remote manifests to canonical IDs
  const normalizedRemoteManifests = allRemoteManifests.map(m => {
    if (m.folderId && remoteToCanonicalFolderId.has(m.folderId)) {
      return { ...m, folderId: remoteToCanonicalFolderId.get(m.folderId) };
    }
    return m;
  });

  // Merge remote overrides from both cloud_settings/final_pd_state AND embedded manifest.pdOverride
  const remoteOverrides: Record<string, ManifestOverride> = {
    ...(remotePdState.finalBillOverrides || {}),
  };
  for (const rm of normalizedRemoteManifests) {
    if (rm.pdOverride) {
      const existingRemoteOv = remoteOverrides[rm.id];
      const existingTs = existingRemoteOv?.updatedAt || 0;
      const embeddedTs = rm.pdOverride.updatedAt || 0;
      if (!existingRemoteOv || embeddedTs >= existingTs) {
        remoteOverrides[rm.id] = rm.pdOverride;
      }
    }
  }

  // Build merged overrides dictionary (timestamp-aware; in backup mode local wins ties)
  const mergedOverrides: Record<string, ManifestOverride> = { ...remoteOverrides };
  for (const [id, localOv] of Object.entries(localOverrides)) {
    const remoteOv = remoteOverrides[id];
    if (!remoteOv) {
      mergedOverrides[id] = localOv;
    } else {
      const localTs = localOv.updatedAt || 0;
      const remoteTs = remoteOv.updatedAt || 0;
      if (localTs > remoteTs || (localTs === remoteTs && syncMode === 'backup')) {
        mergedOverrides[id] = { ...remoteOv, ...localOv };
      } else if (remoteTs > localTs) {
        mergedOverrides[id] = { ...localOv, ...remoteOv };
      } else {
        // Equal timestamps (e.g. both missing updatedAt): merge preferring defined edited fields
        mergedOverrides[id] = syncMode === 'backup' ? { ...remoteOv, ...localOv } : { ...localOv, ...remoteOv };
      }
    }
  }

  // 3. Filter by section if requested ('P' or 'PD' or 'ALL')
  let targetLocalManifests = localManifests;
  let targetRemoteManifests = normalizedRemoteManifests;

  if (sectionFilter !== 'ALL') {
    targetLocalManifests = localManifests.filter(
      (m) => getManifestSectionType(m, mergedOverrides[m.id] || localOverrides[m.id]) === sectionFilter
    );
    targetRemoteManifests = normalizedRemoteManifests.filter(
      (m) => getManifestSectionType(m, mergedOverrides[m.id] || remoteOverrides[m.id] || m.pdOverride) === sectionFilter
    );
  }

  // 4. Deduplicate local manifests before syncing
  onProgress?.(50, 'Deduplicating manifests & cross-checking consignments...');
  const { dedupedManifests: cleanLocal, duplicatesFiltered: localDups } = deduplicateManifestCollection(targetLocalManifests);

  // 5. Deduplicate remote manifests
  const { dedupedManifests: cleanRemote, duplicatesFiltered: remoteDups } = deduplicateManifestCollection(targetRemoteManifests);

  let totalDuplicatesFiltered = localDups + remoteDups;

  onProgress?.(65, 'Merging changes between cloud & local storage...');

  // 6. Two-way merge by semantic key (manifestNo + manifestDate or ID)
  const mergedManifestMap = new Map<string, ManifestHistory>();
  let uploadedCount = 0;
  let downloadedCount = 0;

  // Index clean remote by semantic key
  const remoteSemanticMap = new Map<string, ManifestHistory>();
  for (const rm of cleanRemote) {
    const normNo = (rm.manifestNo || '').trim().toLowerCase();
    const normDate = (rm.manifestDate || '').trim();
    const semKey = normNo && normDate ? `${normNo}___${normDate}` : rm.id;
    remoteSemanticMap.set(semKey, rm);
  }

  // Prepare local items to upload
  interface UploadItem {
    docRef: any;
    data: any;
    semKey: string;
    manifest: ManifestHistory;
  }
  const itemsToUpload: UploadItem[] = [];

  // Process Local -> Cloud
  for (const lm of cleanLocal) {
    const normNo = (lm.manifestNo || '').trim().toLowerCase();
    const normDate = (lm.manifestDate || '').trim();
    const semKey = normNo && normDate ? `${normNo}___${normDate}` : lm.id;
    const safeDocId = (lm.id || `m_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`).replace(/\//g, '_');

    const rm = remoteSemanticMap.get(semKey);
    if (!rm) {
      const effectiveOv = mergedOverrides[lm.id] || localOverrides[lm.id] || lm.pdOverride;
      if (effectiveOv && safeDocId !== lm.id) {
        mergedOverrides[safeDocId] = effectiveOv;
      }
      const secType = getManifestSectionType(lm, effectiveOv);
      // Local exists, remote doesn't -> upload to cloud
      const docRef = doc(db, MANIFESTS_COLLECTION, safeDocId);
      const data = sanitizeForFirestore({
        ...lm,
        id: safeDocId,
        ...(effectiveOv ? { pdOverride: effectiveOv } : {}),
        channelKey: targetChannel,
        sectionType: secType,
        updatedAt: lm.updatedAt || lm.createdAt || now,
        cloudSyncedAt: now,
      });
      const updatedManifest: ManifestHistory = {
        ...lm,
        id: safeDocId,
        sectionType: secType,
        ...(effectiveOv ? { pdOverride: effectiveOv } : {}),
      };
      itemsToUpload.push({ docRef, data, semKey, manifest: updatedManifest });
      mergedManifestMap.set(semKey, updatedManifest);
    } else {
      // Both exist: check if local or its P+D override is newer or richer
      totalDuplicatesFiltered++;
      const targetId = (rm.id || safeDocId).replace(/\//g, '_');

      // Reconcile overrides across local ID and remote targetId if semantic keys matched different UUIDs
      const localOv = localOverrides[lm.id] || lm.pdOverride;
      const remoteOv = remoteOverrides[rm.id] || rm.pdOverride;
      let resolvedOv: ManifestOverride | undefined = mergedOverrides[targetId] || mergedOverrides[lm.id];
      if (localOv && remoteOv) {
        const lOvTs = localOv.updatedAt || 0;
        const rOvTs = remoteOv.updatedAt || 0;
        resolvedOv = (lOvTs > rOvTs || (lOvTs === rOvTs && syncMode === 'backup'))
          ? { ...remoteOv, ...localOv }
          : { ...localOv, ...remoteOv };
      } else {
        resolvedOv = localOv || remoteOv || resolvedOv;
      }
      if (resolvedOv) {
        mergedOverrides[targetId] = resolvedOv;
        if (lm.id !== targetId) {
          mergedOverrides[lm.id] = resolvedOv;
        }
      }

      const localTime = Math.max(lm.updatedAt || lm.createdAt || 0, localOv?.updatedAt || 0);
      const remoteTime = Math.max(rm.updatedAt || rm.createdAt || 0, remoteOv?.updatedAt || 0);
      const localRows = lm.rows?.length || 0;
      const remoteRows = rm.rows?.length || 0;
      const ovChangedLocally = Boolean(
        localOv && (!remoteOv || JSON.stringify(localOv) !== JSON.stringify(remoteOv))
      );

      if (
        localRows > remoteRows ||
        localTime > remoteTime ||
        (syncMode === 'backup' && (ovChangedLocally || localTime >= remoteTime))
      ) {
        // Local is richer/newer (or explicit backup push with Doc edits) -> update remote
        const secType = getManifestSectionType(lm, resolvedOv);
        const docRef = doc(db, MANIFESTS_COLLECTION, targetId);
        const data = sanitizeForFirestore({
          ...lm,
          id: targetId,
          ...(resolvedOv ? { pdOverride: resolvedOv } : {}),
          channelKey: targetChannel,
          sectionType: secType,
          updatedAt: Math.max(localTime, now),
          cloudSyncedAt: now,
        });
        const updatedManifest: ManifestHistory = {
          ...lm,
          id: targetId,
          sectionType: secType,
          ...(resolvedOv ? { pdOverride: resolvedOv } : {}),
        };
        itemsToUpload.push({ docRef, data, semKey, manifest: updatedManifest });
        mergedManifestMap.set(semKey, updatedManifest);
      } else {
        // Remote is newer/richer -> keep remote AND carry resolved P+D override
        const secType = getManifestSectionType(rm, resolvedOv);
        downloadedCount++;
        mergedManifestMap.set(semKey, {
          ...rm,
          sectionType: secType,
          ...(resolvedOv ? { pdOverride: resolvedOv } : {}),
        });
      }
    }
  }

  // Process Remaining Remote -> Local
  for (const rm of cleanRemote) {
    const normNo = (rm.manifestNo || '').trim().toLowerCase();
    const normDate = (rm.manifestDate || '').trim();
    const semKey = normNo && normDate ? `${normNo}___${normDate}` : rm.id;

    if (!mergedManifestMap.has(semKey)) {
      const ov = mergedOverrides[rm.id] || rm.pdOverride;
      if (ov) {
        mergedOverrides[rm.id] = ov;
      }
      downloadedCount++;
      mergedManifestMap.set(semKey, {
        ...rm,
        sectionType: getManifestSectionType(rm, ov),
        ...(ov ? { pdOverride: ov } : {}),
      });
    }
  }

  // Merge Manual Document Manifest entries (P+D standalone Doc section entries)
  const mergedManualDocMap = new Map<string, ManualDocManifest>();
  const normalizedRemoteManualDocs = (remotePdState.manualDocEntries || [])
    .filter((d) => !deletedManualDocSet.has(d.id))
    .map((d) => ({
      ...d,
      folderId: (d.folderId && remoteToCanonicalFolderId.get(d.folderId)) || d.folderId,
    }));

  for (const rd of normalizedRemoteManualDocs) {
    mergedManualDocMap.set(rd.id, rd);
  }
  for (const ld of localManualDocs) {
    if (deletedManualDocSet.has(ld.id)) continue;
    const existingRd = mergedManualDocMap.get(ld.id);
    if (!existingRd) {
      mergedManualDocMap.set(ld.id, ld);
    } else {
      const lTime = ld.updatedAt || ld.createdAt || 0;
      const rTime = existingRd.updatedAt || existingRd.createdAt || 0;
      mergedManualDocMap.set(
        ld.id,
        (lTime > rTime || (lTime === rTime && syncMode === 'backup')) ? ld : existingRd
      );
    }
  }
  const mergedManualDocEntries = Array.from(mergedManualDocMap.values()).sort(
    (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
  );

  // Upload items to cloud with fallback for resilient saving
  if (itemsToUpload.length > 0) {
    onProgress?.(72, `Uploading ${itemsToUpload.length} manifests to Cloud Vault...`);
    let batchOk = false;
    try {
      const b = writeBatch(db);
      for (const item of itemsToUpload.slice(0, 400)) {
        b.set(item.docRef, item.data, { merge: true });
      }
      await b.commit();
      batchOk = true;
      uploadedCount = itemsToUpload.length;
    } catch (batchErr) {
      console.warn("Batch commit failed, falling back to individual document writes:", batchErr);
    }

    if (!batchOk) {
      for (const item of itemsToUpload) {
        try {
          await setDoc(item.docRef, item.data, { merge: true });
          uploadedCount++;
        } catch (itemErr) {
          console.error(`Failed to write manifest ${item.semKey} to cloud:`, itemErr);
        }
      }
    }
  }

  // 7. Sync unified folders to cloud
  for (const folder of canonicalFolderMap.values()) {
    try {
      const safeFolderId = (folder.id || `f_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`).replace(/\//g, '_');
      const docRef = doc(db, FOLDERS_COLLECTION, safeFolderId);
      await setDoc(
        docRef,
        sanitizeForFirestore({ ...folder, id: safeFolderId, channelKey: targetChannel, cloudSyncedAt: now }),
        { merge: true }
      );
    } catch (fErr) {
      console.warn("Folder sync notice:", fErr);
    }
  }

  // 8. Sync Global Settings & P+D Doc State (finalBillOverrides + manualDocEntries)
  try {
    const settingsDocRef = doc(db, SETTINGS_COLLECTION, `global_config_${targetChannel}`);
    await setDoc(
      settingsDocRef,
      sanitizeForFirestore({ globalConfig, channelKey: targetChannel, updatedAt: now }),
      { merge: true }
    );
  } catch (sErr) {
    console.warn("Settings sync notice:", sErr);
  }

  try {
    await saveFinalPdState({
      channelKey: targetChannel,
      finalBillOverrides: mergedOverrides,
      manualDocEntries: mergedManualDocEntries,
    });
  } catch (pdErr) {
    console.warn("P+D state sync notice:", pdErr);
  }

  onProgress?.(92, 'Finalizing local storage & IndexedDB synchronization...');

  // If sectionFilter was specific, preserve non-filtered local manifests
  let finalManifests: ManifestHistory[];
  if (sectionFilter !== 'ALL') {
    const untargetedLocal = localManifests.filter(
      (m) => getManifestSectionType(m, mergedOverrides[m.id]) !== sectionFilter
    );
    finalManifests = [...untargetedLocal, ...Array.from(mergedManifestMap.values())];
  } else {
    finalManifests = Array.from(mergedManifestMap.values());
  }

  finalManifests.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const finalFolders = Array.from(canonicalFolderMap.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  let pManifestCount = 0;
  let pdManifestCount = 0;
  for (const m of finalManifests) {
    if (getManifestSectionType(m, mergedOverrides[m.id]) === 'P') pManifestCount++;
    else pdManifestCount++;
  }

  return {
    mergedManifests: finalManifests,
    mergedFolders: finalFolders,
    mergedOverrides,
    mergedManualDocEntries,
    uploadedCount,
    downloadedCount,
    duplicatesFilteredCount: totalDuplicatesFiltered,
    pManifestCount,
    pdManifestCount,
    syncTimestamp: now,
  };
}

/**
 * Format bytes into human-readable storage string (B, KB, MB, GB)
 */
export function formatStorageBytes(bytes: number): string {
  if (!bytes || bytes <= 0 || isNaN(bytes)) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Compute the byte size of a cloud backup record
 */
export function computeBackupSizeBytes(backup: CloudBackupFile): number {
  if (typeof backup.sizeBytes === 'number' && backup.sizeBytes > 0) {
    return backup.sizeBytes;
  }
  try {
    return new TextEncoder().encode(JSON.stringify(backup)).length;
  } catch {
    const manifestsEstimate = (backup.manifestCount || 0) * 1400;
    const foldersEstimate = (backup.folderCount || 0) * 280;
    return Math.max(1024, manifestsEstimate + foldersEstimate + 1200);
  }
}

/**
 * Compute the byte size of a manifest history document
 */
export function computeManifestSizeBytes(manifest: ManifestHistory): number {
  try {
    return new TextEncoder().encode(JSON.stringify(manifest)).length;
  } catch {
    const rowsCount = manifest.rows?.length || manifest.itemCount || 0;
    return Math.max(512, (rowsCount * 220) + 400);
  }
}
