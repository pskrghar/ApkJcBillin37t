import { useEffect, useRef, useState, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { App, RestoredListenerHandle } from '@capacitor/app';
import { optimizePhotoForOcr, NativeCameraPhoto } from '../components/NativeCameraShutter';

const DB_NAME = 'SmartBillingCameraSurvivalDB';
const DB_VERSION = 1;
const META_STORE = 'survival_meta';
const BLOBS_STORE = 'staged_blobs';
const PENDING_BLOB_STORE = 'pending_crop_blobs';

const SESSION_AWAITING_KEY = 'sb_awaiting_camera_capture';
const SESSION_META_KEY = 'sb_camera_survival_meta';

export interface StagedImageItem {
  file: File;
  preview: string;
}

export interface PendingCropperState {
  file: File;
  preview: string;
  pageIndex: number;
  replaceIndex?: number;
}

export interface RestoredSurvivalState {
  hasRestoredState: boolean;
  restoredStagedImages: StagedImageItem[];
  activeFolderId: string | null;
  isUploadModalOpen: boolean;
  pendingCropper: PendingCropperState | null;
}

/**
 * Opens or initializes the IndexedDB database for camera survival.
 */
function openSurvivalDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not available in this environment'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(BLOBS_STORE)) {
        db.createObjectStore(BLOBS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(PENDING_BLOB_STORE)) {
        db.createObjectStore(PENDING_BLOB_STORE, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open survival IndexedDB'));
  });
}

/**
 * Stores active batch state and all staged image Blobs directly in IndexedDB.
 * Low memory footprint: Blobs are written straight to storage.
 */
export async function persistActiveBatchState(params: {
  stagedFiles: File[];
  activeFolderId?: string | null;
  isUploadModalOpen?: boolean;
  awaitingCamera?: boolean;
  pendingCropper?: { file: File; pageIndex: number; replaceIndex?: number } | null;
}): Promise<void> {
  try {
    // 1. Write fast fallback flags to sessionStorage and localStorage
    if (typeof window !== 'undefined') {
      try {
        if (window.sessionStorage) {
          window.sessionStorage.setItem(
            SESSION_AWAITING_KEY,
            params.awaitingCamera ? 'true' : 'false'
          );
          window.sessionStorage.setItem(
            SESSION_META_KEY,
            JSON.stringify({
              activeFolderId: params.activeFolderId || null,
              isUploadModalOpen: params.isUploadModalOpen ?? true,
              filesCount: params.stagedFiles.length,
              timestamp: Date.now(),
            })
          );
        }
        if (window.localStorage) {
          window.localStorage.setItem(
            SESSION_AWAITING_KEY,
            params.awaitingCamera ? 'true' : 'false'
          );
          window.localStorage.setItem(
            SESSION_META_KEY,
            JSON.stringify({
              activeFolderId: params.activeFolderId || null,
              isUploadModalOpen: params.isUploadModalOpen ?? true,
              filesCount: params.stagedFiles.length,
              timestamp: Date.now(),
            })
          );
        }
      } catch (e) {
        // Ignore quota or security errors
      }
    }

    // 2. Open IndexedDB and perform atomic write
    const db = await openSurvivalDB();
    const tx = db.transaction([META_STORE, BLOBS_STORE, PENDING_BLOB_STORE], 'readwrite');
    const metaStore = tx.objectStore(META_STORE);
    const blobsStore = tx.objectStore(BLOBS_STORE);
    const pendingStore = tx.objectStore(PENDING_BLOB_STORE);

    // Clear old staged blobs
    blobsStore.clear();
    pendingStore.clear();

    // Store each staged file as a pure binary Blob
    for (let i = 0; i < params.stagedFiles.length; i++) {
      const f = params.stagedFiles[i];
      blobsStore.put({
        id: `page_${i}`,
        index: i,
        name: f.name || `manifest_page_${i + 1}.jpg`,
        type: f.type || 'image/jpeg',
        size: f.size,
        lastModified: f.lastModified || Date.now(),
        blob: f,
      });
    }

    // Store pending uncropped file if cropper was active
    if (params.pendingCropper && params.pendingCropper.file) {
      const pf = params.pendingCropper.file;
      pendingStore.put({
        id: 'current_pending',
        pageIndex: params.pendingCropper.pageIndex,
        replaceIndex: params.pendingCropper.replaceIndex,
        name: pf.name || `pending_page_${params.pendingCropper.pageIndex}.jpg`,
        type: pf.type || 'image/jpeg',
        size: pf.size,
        lastModified: pf.lastModified || Date.now(),
        blob: pf,
      });
    }

    // Save session metadata
    metaStore.put({
      key: 'session_state',
      awaitingCamera: !!params.awaitingCamera,
      activeFolderId: params.activeFolderId || null,
      isUploadModalOpen: params.isUploadModalOpen ?? true,
      hasPendingCropper: !!params.pendingCropper,
      timestamp: Date.now(),
    });

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('[useCameraSurvivalState] Failed to persist batch state to IndexedDB:', err);
  }
}

/**
 * Sets awaitingCamera flag immediately before launching the camera intent.
 */
export async function markAwaitingCamera(params: {
  stagedFiles: File[];
  activeFolderId?: string | null;
  isUploadModalOpen?: boolean;
  pageIndex?: number;
  replaceIndex?: number;
}): Promise<void> {
  if (typeof window !== 'undefined') {
    try {
      const metaPayload = JSON.stringify({
        activeFolderId: params.activeFolderId || null,
        isUploadModalOpen: params.isUploadModalOpen ?? true,
        filesCount: params.stagedFiles.length,
        timestamp: Date.now(),
      });
      if (window.sessionStorage) {
        window.sessionStorage.setItem(SESSION_AWAITING_KEY, 'true');
        window.sessionStorage.setItem(SESSION_META_KEY, metaPayload);
      }
      if (window.localStorage) {
        window.localStorage.setItem(SESSION_AWAITING_KEY, 'true');
        window.localStorage.setItem(SESSION_META_KEY, metaPayload);
      }
    } catch (e) {}
  }

  // Update lightweight session flag in IndexedDB without re-serializing all staged blobs
  try {
    const db = await openSurvivalDB();
    const tx = db.transaction([META_STORE], 'readwrite');
    tx.objectStore(META_STORE).put({
      key: 'session_state',
      awaitingCamera: true,
      activeFolderId: params.activeFolderId || null,
      isUploadModalOpen: params.isUploadModalOpen ?? true,
      hasPendingCropper: false,
      timestamp: Date.now(),
    });
  } catch (err) {
    console.warn('[useCameraSurvivalState] Lightweight awaiting flag warning:', err);
  }
}

/**
 * Completely clears the survival store (e.g. after successful upload or manual cancel).
 */
export async function clearCameraSurvivalState(): Promise<void> {
  try {
    if (typeof window !== 'undefined') {
      try {
        if (window.sessionStorage) {
          window.sessionStorage.removeItem(SESSION_AWAITING_KEY);
          window.sessionStorage.removeItem(SESSION_META_KEY);
        }
        if (window.localStorage) {
          window.localStorage.removeItem(SESSION_AWAITING_KEY);
          window.localStorage.removeItem(SESSION_META_KEY);
        }
      } catch (e) {}
    }

    const db = await openSurvivalDB();
    const tx = db.transaction([META_STORE, BLOBS_STORE, PENDING_BLOB_STORE], 'readwrite');
    tx.objectStore(META_STORE).clear();
    tx.objectStore(BLOBS_STORE).clear();
    tx.objectStore(PENDING_BLOB_STORE).clear();

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('[useCameraSurvivalState] Failed to clear survival state:', err);
  }
}

/**
 * Restores any surviving batch state from IndexedDB after OS-level process reload.
 */
export async function restoreCameraSurvivalState(): Promise<RestoredSurvivalState> {
  const emptyResult: RestoredSurvivalState = {
    hasRestoredState: false,
    restoredStagedImages: [],
    activeFolderId: null,
    isUploadModalOpen: false,
    pendingCropper: null,
  };

  try {
    const isAwaitingSession =
      typeof window !== 'undefined' &&
      ((window.sessionStorage && window.sessionStorage.getItem(SESSION_AWAITING_KEY) === 'true') ||
       (window.localStorage && window.localStorage.getItem(SESSION_AWAITING_KEY) === 'true'));

    const db = await openSurvivalDB();
    const tx = db.transaction([META_STORE, BLOBS_STORE, PENDING_BLOB_STORE], 'readonly');
    const metaStore = tx.objectStore(META_STORE);
    const blobsStore = tx.objectStore(BLOBS_STORE);
    const pendingStore = tx.objectStore(PENDING_BLOB_STORE);

    const metaReq = metaStore.get('session_state');
    const allBlobsReq = blobsStore.getAll();
    const pendingReq = pendingStore.get('current_pending');

    const [metaRecord, blobRecords, pendingRecord] = await Promise.all([
      new Promise<any>((res) => {
        metaReq.onsuccess = () => res(metaReq.result);
        metaReq.onerror = () => res(null);
      }),
      new Promise<any[]>((res) => {
        allBlobsReq.onsuccess = () => res(allBlobsReq.result || []);
        allBlobsReq.onerror = () => res([]);
      }),
      new Promise<any>((res) => {
        pendingReq.onsuccess = () => res(pendingReq.result);
        pendingReq.onerror = () => res(null);
      }),
    ]);

    const isAwaitingDB = metaRecord?.awaitingCamera;
    const hasStaged = blobRecords && blobRecords.length > 0;
    const hasPending = !!pendingRecord;

    // Check if session is recent (under 6 hours)
    const isRecent = metaRecord?.timestamp && Date.now() - metaRecord.timestamp < 6 * 60 * 60 * 1000;

    if (!isAwaitingSession && !isAwaitingDB && !hasStaged && !hasPending) {
      return emptyResult;
    }

    if (metaRecord?.timestamp && !isRecent) {
      await clearCameraSurvivalState();
      return emptyResult;
    }

    // Sort stored blobs by sequential index
    blobRecords.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

    const restoredStagedImages: StagedImageItem[] = blobRecords.map((item) => {
      const blob: Blob = item.blob;
      const file = new File([blob], item.name, {
        type: item.type || 'image/jpeg',
        lastModified: item.lastModified || Date.now(),
      });
      const preview = URL.createObjectURL(blob);
      return { file, preview };
    });

    let pendingCropper: PendingCropperState | null = null;
    if (pendingRecord && pendingRecord.blob) {
      const blob: Blob = pendingRecord.blob;
      const file = new File([blob], pendingRecord.name, {
        type: pendingRecord.type || 'image/jpeg',
        lastModified: pendingRecord.lastModified || Date.now(),
      });
      const preview = URL.createObjectURL(blob);
      pendingCropper = {
        file,
        preview,
        pageIndex: pendingRecord.pageIndex || restoredStagedImages.length + 1,
        replaceIndex: pendingRecord.replaceIndex,
      };
    }

    const activeFolderId = metaRecord?.activeFolderId || null;
    const isUploadModalOpen = metaRecord?.isUploadModalOpen ?? (restoredStagedImages.length > 0 || !!pendingCropper);

    // Reset awaiting flag now that state is recovered
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.removeItem(SESSION_AWAITING_KEY);
    }
    const updateTx = db.transaction([META_STORE], 'readwrite');
    updateTx.objectStore(META_STORE).put({
      ...(metaRecord || {}),
      key: 'session_state',
      awaitingCamera: false,
    });

    return {
      hasRestoredState: restoredStagedImages.length > 0 || !!pendingCropper || isAwaitingSession || isAwaitingDB,
      restoredStagedImages,
      activeFolderId,
      isUploadModalOpen,
      pendingCropper,
    };
  } catch (err) {
    console.warn('[useCameraSurvivalState] Failed to restore state from IndexedDB:', err);
    return emptyResult;
  }
}

export interface UseCameraSurvivalOptions {
  onRestoredState?: (state: RestoredSurvivalState) => void;
  onRestoredCameraPhoto?: (photo: NativeCameraPhoto) => void;
}

/**
 * Primary React hook for camera survival across OS process kills and APK background termination.
 */
export function useCameraSurvivalState(options: UseCameraSurvivalOptions = {}) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [restoredState, setRestoredState] = useState<RestoredSurvivalState | null>(null);
  const restoredResultHandleRef = useRef<RestoredListenerHandle | null>(null);

  // 1. Listen for Capacitor App 'appRestoredResult' when returning from OS camera intent
  useEffect(() => {
    let isMounted = true;

    async function registerCapacitorRestoredListener() {
      if (!Capacitor.isNativePlatform()) return;

      try {
        const handle = await App.addListener('appRestoredResult', async (data: any) => {
          console.log('[useCameraSurvivalState] Capacitor appRestoredResult event received:', data);

          if (data && data.pluginId === 'Camera' && data.methodName === 'getPhoto' && data.data) {
            const photoResult = data.data;
            const pathUri = photoResult.webPath || photoResult.path;

            if (pathUri) {
              if (isMounted) {
                options.onRestoredCameraPhoto?.({
                  file: null,
                  preview: pathUri,
                  width: 0,
                  height: 0,
                  sizeBytes: 0,
                  isDirectUri: true,
                });
              }
            } else if (photoResult.base64String) {
              try {
                const byteCharacters = atob(photoResult.base64String);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                  byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: 'image/jpeg' });
                const optimized = await optimizePhotoForOcr(blob, 'manifest_restored_hdr');
                if (isMounted) {
                  options.onRestoredCameraPhoto?.(optimized);
                }
              } catch (b64Err) {
                console.error('[useCameraSurvivalState] Error parsing restored base64 photo:', b64Err);
              }
            }
          }
        });

        restoredResultHandleRef.current = handle;
      } catch (e) {
        console.warn('[useCameraSurvivalState] Capacitor App listener registration failed:', e);
      }
    }

    registerCapacitorRestoredListener();

    return () => {
      isMounted = false;
      if (restoredResultHandleRef.current) {
        try {
          restoredResultHandleRef.current.remove();
        } catch (e) {}
      }
    };
  }, [options.onRestoredCameraPhoto]);

  // 2. Perform initial restoration check on app mount
  useEffect(() => {
    let isMounted = true;

    async function checkAndRestore() {
      try {
        const state = await restoreCameraSurvivalState();
        if (isMounted) {
          setRestoredState(state);
          setIsInitialized(true);
          if (state.hasRestoredState) {
            options.onRestoredState?.(state);
          }
        }
      } catch (err) {
        if (isMounted) {
          setIsInitialized(true);
        }
      }
    }

    checkAndRestore();

    return () => {
      isMounted = false;
    };
  }, []);

  const saveBatch = useCallback(
    async (params: {
      stagedImages: StagedImageItem[];
      activeFolderId?: string | null;
      isUploadModalOpen?: boolean;
      pendingCropper?: { file: File; pageIndex: number; replaceIndex?: number } | null;
    }) => {
      const files = params.stagedImages.map((item) => item.file);
      await persistActiveBatchState({
        stagedFiles: files,
        activeFolderId: params.activeFolderId,
        isUploadModalOpen: params.isUploadModalOpen,
        awaitingCamera: false,
        pendingCropper: params.pendingCropper,
      });
    },
    []
  );

  const triggerMarkAwaitingCamera = useCallback(
    async (params: {
      stagedImages: StagedImageItem[];
      activeFolderId?: string | null;
      isUploadModalOpen?: boolean;
      pageIndex?: number;
      replaceIndex?: number;
    }) => {
      const files = params.stagedImages.map((item) => item.file);
      await markAwaitingCamera({
        stagedFiles: files,
        activeFolderId: params.activeFolderId,
        isUploadModalOpen: params.isUploadModalOpen,
        pageIndex: params.pageIndex,
        replaceIndex: params.replaceIndex,
      });
    },
    []
  );

  const clearBatch = useCallback(async () => {
    await clearCameraSurvivalState();
  }, []);

  return {
    isInitialized,
    restoredState,
    saveBatch,
    markAwaitingCamera: triggerMarkAwaitingCamera,
    clearBatch,
  };
}
