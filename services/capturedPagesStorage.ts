import { getOfflineDB, CapturedManifestSession, CapturedPage } from './offlineStore';
import { db } from './cloudSyncService';
import { 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  query, 
  where, 
  deleteDoc 
} from 'firebase/firestore';

export type { CapturedManifestSession, CapturedPage };

// Event listeners for UI reactivity
const sessionChangeListeners = new Set<() => void>();

export function addCapturedSessionsListener(listener: () => void): () => void {
  sessionChangeListeners.add(listener);
  return () => sessionChangeListeners.delete(listener);
}

function notifySessionChange(): void {
  sessionChangeListeners.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.warn('Session change listener error:', e);
    }
  });
}

/**
 * Converts a browser File object to a base64 Data URL for persistent storage in IndexedDB
 */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

/**
 * Reconstructs a browser File object from a base64 Data URL so it can be fed directly to AI models
 */
export function dataUrlToFile(dataUrl: string, filename: string, mimeType: string = 'image/jpeg'): File {
  try {
    const arr = dataUrl.split(',');
    const match = arr[0]?.match(/:(.*?);/);
    const mime = match ? match[1] : mimeType;
    const bstr = atob(arr[1] || '');
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mime });
  } catch (err) {
    console.error('Failed to reconstruct File from dataUrl:', err);
    // Fallback: create empty file with filename
    return new File([], filename, { type: mimeType });
  }
}

/**
 * Creates and persists a new sequential CapturedManifestSession from an array of File objects
 */
export async function createCapturedSession(
  files: File[],
  options?: {
    folderId?: string | null;
    manifestName?: string;
    initialStatus?: 'ready' | 'queued' | 'extracting';
  }
): Promise<CapturedManifestSession> {
  const dbInstance = await getOfflineDB();
  const existing = await dbInstance.getAll('captured_manifest_sessions');
  const sessionNumber = existing.length + 1;
  const now = Date.now();
  const sessionId = `session_${now}_${Math.random().toString(36).substring(2, 8)}`;

  // Convert each file sequentially into CapturedPage with Data URL
  const pages: CapturedPage[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const dataUrl = await fileToDataUrl(file);
    pages.push({
      pageNumber: i + 1,
      name: file.name || `manifest_page_${i + 1}.jpg`,
      type: file.type || 'image/jpeg',
      size: file.size,
      dataUrl,
      timestamp: now,
    });
  }

  const session: CapturedManifestSession = {
    id: sessionId,
    sessionNumber,
    manifestName: options?.manifestName || `Session #${sessionNumber} (${files.length} Pages)`,
    createdAt: now,
    updatedAt: now,
    folderId: options?.folderId || null,
    pageCount: pages.length,
    pages,
    status: options?.initialStatus || 'ready',
    isCloudBackedUp: false,
  };

  await dbInstance.put('captured_manifest_sessions', session);
  notifySessionChange();
  return session;
}

/**
 * Get all captured manifest sessions from local IndexedDB, sorted newest first
 */
export async function getAllCapturedSessions(): Promise<CapturedManifestSession[]> {
  try {
    const dbInstance = await getOfflineDB();
    const sessions = await dbInstance.getAll('captured_manifest_sessions');
    return sessions.sort((a, b) => b.createdAt - a.createdAt);
  } catch (err) {
    console.warn('Error fetching captured sessions:', err);
    return [];
  }
}

/**
 * Get a single captured session by ID
 */
export async function getCapturedSession(id: string): Promise<CapturedManifestSession | null> {
  try {
    const dbInstance = await getOfflineDB();
    const session = await dbInstance.get('captured_manifest_sessions', id);
    return session || null;
  } catch (err) {
    console.warn(`Error getting captured session ${id}:`, err);
    return null;
  }
}

/**
 * Update fields of a captured session in local storage
 */
export async function updateCapturedSession(
  id: string,
  updates: Partial<CapturedManifestSession>
): Promise<void> {
  try {
    const dbInstance = await getOfflineDB();
    const existing = await dbInstance.get('captured_manifest_sessions', id);
    if (!existing) return;

    const updated: CapturedManifestSession = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    };

    await dbInstance.put('captured_manifest_sessions', updated);
    notifySessionChange();
  } catch (err) {
    console.warn(`Error updating captured session ${id}:`, err);
  }
}

/**
 * Mark a session as queued for background batch extraction
 */
export async function markSessionQueued(id: string): Promise<void> {
  await updateCapturedSession(id, {
    status: 'queued',
    extractionError: undefined,
  });
}

/**
 * Mark a session as currently extracting in background
 */
export async function markSessionExtracting(id: string): Promise<void> {
  await updateCapturedSession(id, {
    status: 'extracting',
    extractionError: undefined,
  });
}

/**
 * Mark a session as failed with a short, user-facing error message
 */
export async function markSessionFailed(id: string, errorMessage: string): Promise<void> {
  await updateCapturedSession(id, {
    status: 'failed',
    extractionError: errorMessage,
  });
}

/**
 * Mark a session as successfully extracted with link to the created manifest
 */
export async function markSessionSuccess(
  id: string,
  resultManifestNo: string,
  resultManifestId?: string
): Promise<void> {
  await updateCapturedSession(id, {
    status: 'success',
    resultManifestNo,
    resultManifestId,
    extractedAt: Date.now(),
    extractionError: undefined,
  });
}

/**
 * Delete a session from local storage
 */
export async function deleteCapturedSession(id: string): Promise<void> {
  try {
    const dbInstance = await getOfflineDB();
    await dbInstance.delete('captured_manifest_sessions', id);
    notifySessionChange();
  } catch (err) {
    console.warn(`Error deleting captured session ${id}:`, err);
  }
}

/**
 * Clear captured sessions (all or only successfully extracted ones)
 */
export async function clearCapturedSessions(onlySuccessful: boolean = false): Promise<number> {
  try {
    const dbInstance = await getOfflineDB();
    const all = await dbInstance.getAll('captured_manifest_sessions');
    const tx = dbInstance.transaction('captured_manifest_sessions', 'readwrite');
    let removed = 0;
    for (const s of all) {
      if (!onlySuccessful || s.status === 'success') {
        await tx.store.delete(s.id);
        removed++;
      }
    }
    await tx.done;
    notifySessionChange();
    return removed;
  } catch (err) {
    console.warn('Error clearing captured sessions:', err);
    return 0;
  }
}

/**
 * Reconstruct File array for a session to retry or start AI extraction
 */
export function getSessionFiles(session: CapturedManifestSession): File[] {
  return session.pages.map((p, idx) => {
    const name = p.name || `page_${idx + 1}.jpg`;
    return dataUrlToFile(p.dataUrl, name, p.type);
  });
}

// =========================================================================
// Separate Cloud Backup & Sync for Local Captured Storage
// Does NOT auto-sync. Backed up or restored separately on demand only.
// Uses the same cloud storage instance & channelKey.
// =========================================================================

export async function backupCapturedSessionsToCloud(
  channelKey: string
): Promise<{ backedUpCount: number; timestamp: number }> {
  if (!channelKey) throw new Error('Cloud Channel Key required for backup');
  const sessions = await getAllCapturedSessions();
  if (sessions.length === 0) return { backedUpCount: 0, timestamp: Date.now() };

  const now = Date.now();
  let backedUpCount = 0;

  for (const session of sessions) {
    try {
      const docId = `${channelKey}_${session.id}`;
      const docRef = doc(collection(db, 'cloud_captured_sessions'), docId);
      
      await setDoc(docRef, {
        id: session.id,
        sessionNumber: session.sessionNumber,
        manifestName: session.manifestName || '',
        channelKey,
        createdAt: session.createdAt,
        updatedAt: now,
        folderId: session.folderId || null,
        pageCount: session.pageCount,
        status: session.status,
        extractionError: session.extractionError || null,
        resultManifestNo: session.resultManifestNo || null,
        resultManifestId: session.resultManifestId || null,
        pages: session.pages, // contains base64 Data URLs
      });

      // Mark locally as backed up
      await updateCapturedSession(session.id, {
        isCloudBackedUp: true,
        cloudBackupTimestamp: now,
      });

      backedUpCount++;
    } catch (err) {
      console.warn(`Failed to back up session ${session.id} to cloud:`, err);
    }
  }

  return { backedUpCount, timestamp: now };
}

export async function restoreCapturedSessionsFromCloud(
  channelKey: string
): Promise<{ restoredCount: number }> {
  if (!channelKey) throw new Error('Cloud Channel Key required for restore');
  const q = query(
    collection(db, 'cloud_captured_sessions'),
    where('channelKey', '==', channelKey)
  );

  const snapshot = await getDocs(q);
  const dbInstance = await getOfflineDB();
  let restoredCount = 0;

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    if (data && data.id && data.pages) {
      const restoredSession: CapturedManifestSession = {
        id: data.id,
        sessionNumber: data.sessionNumber || 1,
        manifestName: data.manifestName || `Restored Session #${data.sessionNumber || 1}`,
        createdAt: data.createdAt || Date.now(),
        updatedAt: data.updatedAt || Date.now(),
        folderId: data.folderId || null,
        pageCount: data.pageCount || data.pages.length,
        pages: data.pages || [],
        status: data.status || 'ready',
        extractionError: data.extractionError || undefined,
        resultManifestNo: data.resultManifestNo || undefined,
        resultManifestId: data.resultManifestId || undefined,
        isCloudBackedUp: true,
        cloudBackupTimestamp: Date.now(),
      };

      await dbInstance.put('captured_manifest_sessions', restoredSession);
      restoredCount++;
    }
  }

  notifySessionChange();
  return { restoredCount };
}

export async function deleteCloudCapturedSession(
  channelKey: string,
  sessionId: string
): Promise<void> {
  if (!channelKey || !sessionId) return;
  try {
    const docId = `${channelKey}_${sessionId}`;
    const docRef = doc(collection(db, 'cloud_captured_sessions'), docId);
    await deleteDoc(docRef);
  } catch (err) {
    console.warn(`Error deleting cloud captured session ${sessionId}:`, err);
  }
}
