import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import JSZip from "jszip";
import { 
  PlusIcon, 
  TrashIcon, 
  ArrowUpTrayIcon, 
  ArrowDownTrayIcon,
  Cog6ToothIcon, 
  ExclamationTriangleIcon, 
  CheckCircleIcon, 
  XMarkIcon, 
  ArrowsRightLeftIcon, 
  CalculatorIcon, 
  ListBulletIcon,
  ChevronDownIcon,
  CalendarDaysIcon,
  DocumentDuplicateIcon,
  DocumentTextIcon,
  DocumentIcon,
  ArchiveBoxIcon,
  ArrowLeftIcon,
  CodeBracketIcon,
  FolderIcon,
  FolderPlusIcon,
  PencilIcon,
  EllipsisVerticalIcon,
  ChevronRightIcon,
  ChartBarIcon,
  SparklesIcon,
  ClockIcon,
  MagnifyingGlassPlusIcon,
  MagnifyingGlassMinusIcon,
  PhotoIcon,
  CpuChipIcon,
  BoltIcon,
  ScaleIcon,
  Bars3Icon,
  PencilSquareIcon,
  SunIcon,
  MoonIcon,
  BookOpenIcon,
  ArrowDownOnSquareIcon,
  Square3Stack3DIcon,
  FolderArrowDownIcon,
  MagnifyingGlassIcon,
  Squares2X2Icon,
  TableCellsIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
  AdjustmentsHorizontalIcon,
  MinusIcon,
  ChevronUpIcon,
  ArrowTopRightOnSquareIcon,
  InformationCircleIcon,
  CameraIcon,
  ArrowPathIcon,
  CheckIcon,
  ArrowUturnLeftIcon,
  PrinterIcon,
  EyeIcon,
  LockClosedIcon,
  LockOpenIcon,
  CloudIcon,
  CloudArrowUpIcon,
  CloudArrowDownIcon,
  ServerStackIcon,
  StopIcon
} from '@heroicons/react/24/outline';
import { BillingRow, ItemType, BillingConfig, ParsingError, SlabSummary, ManifestHistory, ManifestMetadata, Folder, RecycleBinItem, CloudBackupFile, CloudSyncMeta, SyncedDevice, ManifestOverride, ManualDocManifest } from './types';
import { FinalManifestSection } from './components/FinalManifestSection';
import { parseBillingDocument } from './services/geminiService';
import { 
  extractManifestWithFallback, 
  getEffectiveGeminiApiKey, 
  saveCustomGeminiApiKey, 
  testGeminiApiKey, 
  CUSTOM_API_KEY_STORAGE,
  ExtractionDiagnosticReport,
  ExtractionDiagnosticError,
  ManifestImageInput,
  getExtractionModelPreference,
  saveExtractionModelPreference,
  AVAILABLE_EXTRACTION_MODELS,
  ExtractionModelPreference,
  ExtractionEngineMode
} from './services/manifestExtractor';
import { DocumentCropScanner, CapturedDocumentPage } from './components/DocumentCropScanner';
import { HighResInAppCamera, HighResInAppCameraPhoto } from './components/HighResInAppCamera';
import { NativeCameraShutter, NativeCameraShutterRef, NativeCameraPhoto } from './components/NativeCameraShutter';
import { PostCaptureCropper } from './components/PostCaptureCropper';
import { useCameraSurvivalState, RestoredSurvivalState } from './hooks/useCameraSurvivalState';
import { calculateRow, calculateParcelAmount, evaluateExpression } from './utils/billingLogic';
import { PdfViewerModal } from './src/components/PdfViewerModal';
import { reconcileImportedRows, analyzeSerialDiscrepancies, autoCorrectSequenceTopToBottom, DiagnosticItemSummary } from './utils/serialNumberManager';
import { SerialDiscrepancyBanner } from './components/SerialDiscrepancyBanner';
import { AttentionDiagnosticCenter } from './components/AttentionDiagnosticCenter';
import { ActiveTargetActionBanner } from './components/ActiveTargetActionBanner';
import { AiExtractionErrorModal } from './components/AiExtractionErrorModal';
import {
  createCloudBackup,
  listCloudBackups,
  deleteCloudBackup,
  performFullSync,
  fetchCloudManifests,
  fetchCloudFolders,
  syncManifestToCloud,
  deleteManifestFromCloud,
  deleteFolderFromCloud,
  registerDevicePresence,
  listenToConnectedDevices,
  listenToCloudManifests,
  ManifestSectionType,
  isOnlineStatus,
  addConnectionStatusListener,
  checkIsOfflineError,
  fetchFinalPdState,
  saveFinalPdState,
  deleteManualDocEntryFromCloud,
} from './services/cloudSyncService';
import {
  getCurrentDeviceInfo,
  getOrCreateSyncChannelKey,
  saveSyncChannelKey,
  saveDeviceCustomName,
  isCloudActivatedOnDevice,
  setCloudActivatedOnDevice,
} from './utils/deviceDetector';
import { MultiDeviceSyncCard } from './components/MultiDeviceSyncCard';
import { CloudManager } from './components/CloudManager';
import { PWAInstallButton } from './components/PWAInstallButton';
import { OfflineQueueBanner } from './components/OfflineQueueBanner';
import { CapturedManifestSessionsModal } from './components/CapturedManifestSessionsModal';
import { ChunkingBatchEngineModal } from './components/ChunkingBatchEngineModal';
import {
  createCapturedSession,
  updateCapturedSession,
  markSessionSuccess,
  markSessionFailed,
  markSessionQueued,
  markSessionExtracting,
  getSessionFiles,
  getAllCapturedSessions,
  addCapturedSessionsListener,
  CapturedManifestSession
} from './services/capturedPagesStorage';
import { 
  saveManifestsToIDB, 
  getManifestsFromIDB, 
  deleteManifestFromIDB,
  saveBillingRatesToIDB, 
  getBillingRatesFromIDB, 
  saveBillingDataToIDB,
  getBillingDataFromIDB,
  queueOfflineScan 
} from './services/offlineStore';
import { 
  initOfflineAutoSync, 
  addManifestSyncedListener 
} from './services/offlineSyncWorker';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import {
  exportAndShareFile,
  exportJsPdfDocument,
  syncNativeStatusBar,
  hideNativeSplashScreen,
  isNativePlatform,
} from './utils/nativeBridge';

const DEFAULT_CONFIG: BillingConfig = {
  parcelSlab1Rate: 3,
  parcelSlab2Rate: 2,
  parcelSlab3Rate: 1,
  documentRate: 5,
};

const STORAGE_KEY = 'smart_billing_manifest_history_v2';
const FOLDERS_KEY = 'smart_billing_folders_v2';
const RECYCLE_BIN_KEY = 'smart_billing_recycle_bin_v1';
const DELETED_MANIFESTS_KEY = 'smart_billing_deleted_manifest_ids_v1';
const GLOBAL_CONFIG_KEY = 'smart_billing_global_config';
const PREFS_KEY = 'smart_billing_user_prefs';
const CLOUD_META_KEY = 'smart_billing_cloud_meta';
const AUTO_SYNC_KEY = 'smart_billing_auto_sync';
const FINAL_OVERRIDES_KEY = 'smart_billing_final_manifest_overrides_v2';
const MANUAL_DOC_ENTRIES_KEY = 'smart_billing_manual_doc_entries_v1';
const DELETED_MANUAL_DOCS_KEY = 'smart_billing_deleted_manual_doc_ids_v1';

// Bulk Import Types
interface BulkImportStatus {
  fileName: string;
  status: 'success' | 'error' | 'warning';
  message: string;
}

/**
 * Parses a manifest date string (DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, YYYY-MM-DD, or standard date strings)
 * into a numeric timestamp for chronological sorting.
 */
function parseManifestDateTimestamp(dateStr?: string, fallbackTs: number = 0): number {
  if (!dateStr || typeof dateStr !== 'string') return fallbackTs;
  const trimmed = dateStr.trim();
  if (!trimmed) return fallbackTs;

  const numericMatch = trimmed.match(/^(\d{1,4})[/\-.](\d{1,2})[/\-.](\d{1,4})$/);
  if (numericMatch) {
    const p0 = numericMatch[1];
    const p1 = numericMatch[2];
    const p2 = numericMatch[3];
    let year: number;
    let month: number;
    let day: number;

    if (p0.length === 4) {
      // YYYY-MM-DD or YYYY/MM/DD
      year = parseInt(p0, 10);
      month = parseInt(p1, 10);
      day = parseInt(p2, 10);
    } else {
      // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY (with MM/DD fallback if month > 12)
      year = p2.length === 2 ? 2000 + parseInt(p2, 10) : parseInt(p2, 10);
      const first = parseInt(p0, 10);
      const second = parseInt(p1, 10);
      if (second > 12 && first <= 12) {
        month = first;
        day = second;
      } else {
        day = first;
        month = second;
      }
    }

    if (!isNaN(year) && !isNaN(month) && !isNaN(day) && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const ts = new Date(year, month - 1, day).getTime();
      if (!isNaN(ts)) return ts;
    }
  }

  const parsed = Date.parse(trimmed);
  if (!isNaN(parsed)) return parsed;

  return fallbackTs;
}

/**
 * Ascending chronological comparator for manifests (oldest date first),
 * with deterministic tie-breakers on createdAt and manifestNo.
 */
function compareManifestsByDateAsc(a: ManifestHistory, b: ManifestHistory): number {
  const tsA = parseManifestDateTimestamp(a.manifestDate, a.createdAt || 0);
  const tsB = parseManifestDateTimestamp(b.manifestDate, b.createdAt || 0);
  if (tsA !== tsB) return tsA - tsB;

  const createdA = a.createdAt || 0;
  const createdB = b.createdAt || 0;
  if (createdA !== createdB) return createdA - createdB;

  return (a.manifestNo || '').localeCompare(b.manifestNo || '', undefined, { numeric: true });
}

const App: React.FC = () => {
  // Navigation State
  const [view, setView] = useState<'dashboard' | 'billing'>('dashboard');
  const [dashboardTab, setDashboardTab] = useState<'history' | 'manifest' | 'final'>('history');
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [selectedFinalFolderIds, setSelectedFinalFolderIds] = useState<string[]>([]);
  const [isCloudManagerModalOpen, setIsCloudManagerModalOpen] = useState(false);
  const [cloudManagerInitialTab, setCloudManagerInitialTab] = useState<'backup_sync' | 'cloud_items' | 'connect_keys' | 'connected_users'>('backup_sync');
  
  // App History & Folders Data
  const [history, setHistory] = useState<ManifestHistory[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);

  // Cloud Integration State
  const [cloudBackups, setCloudBackups] = useState<CloudBackupFile[]>([]);
  const [cloudManifests, setCloudManifests] = useState<ManifestHistory[]>([]);
  const [cloudOverrides, setCloudOverrides] = useState<Record<string, ManifestOverride>>({});
  const [cloudManualDocEntries, setCloudManualDocEntries] = useState<ManualDocManifest[]>([]);
  const [pendingSettingsRestoreBackupId, setPendingSettingsRestoreBackupId] = useState<string | null>(null);
  const [cloudMeta, setCloudMeta] = useState<CloudSyncMeta>(() => {
    let initialAutoSync = false;
    try {
      const savedAutoSync = localStorage.getItem(AUTO_SYNC_KEY);
      if (savedAutoSync !== null) {
        initialAutoSync = JSON.parse(savedAutoSync) === true;
      }
    } catch (e) {}
    return {
      lastSyncTimestamp: null,
      autoSyncEnabled: initialAutoSync,
      isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
      status: 'idle',
      lastSyncMessage: ''
    };
  });
  const [isCloudLoading, setIsCloudLoading] = useState(false);
  const [cloudQuickOpProgress, setCloudQuickOpProgress] = useState<{
    mode: 'sync' | 'backup';
    percent: number;
    stageText: string;
  } | null>(null);

  // Multi-Device Common Cloud Sync State
  const [isCloudActivated, setIsCloudActivated] = useState<boolean>(() => isCloudActivatedOnDevice());
  const [currentDevice, setCurrentDevice] = useState<SyncedDevice>(() => getCurrentDeviceInfo());
  const [syncChannelKey, setSyncChannelKey] = useState<string>(() => getOrCreateSyncChannelKey());
  const [connectedDevices, setConnectedDevices] = useState<SyncedDevice[]>([]);
  
  // Active Billing State
  const [activeManifestId, setActiveManifestId] = useState<string | null>(null);
  const [rows, setRows] = useState<BillingRow[]>([]);
  const [config, setConfig] = useState<BillingConfig>(DEFAULT_CONFIG);
  const [manifestMeta, setManifestMeta] = useState<ManifestMetadata>({ manifestNo: '', manifestDate: '' });
  
  // Global Settings State
  const [globalConfig, setGlobalConfig] = useState<BillingConfig>(DEFAULT_CONFIG);
  const [isGlobalSettingsOpen, setIsGlobalSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'preferences' | 'ai' | 'cloud'>('preferences');
  const [appTheme, setAppTheme] = useState<'light' | 'dark' | 'reading'>('light');
  const [appScale, setAppScale] = useState(100);
  const [appZoom, setAppZoom] = useState(100);

  // Custom AI API Key State
  const [customApiKey, setCustomApiKey] = useState<string>(() => {
    try {
      return localStorage.getItem(CUSTOM_API_KEY_STORAGE) || '';
    } catch {
      return '';
    }
  });
  const [showApiKeyInput, setShowApiKeyInput] = useState<boolean>(false);
  const [apiKeyTestResult, setApiKeyTestResult] = useState<{ testing: boolean; message?: string; success?: boolean } | null>(null);

  // Extraction Engine Model Preference State (Auto, Single model, or Multiple selected models)
  const [extractionModelPref, setExtractionModelPref] = useState<ExtractionModelPreference>(() => {
    return getExtractionModelPreference();
  });

  const handleUpdateModelPreference = (newPref: ExtractionModelPreference) => {
    setExtractionModelPref(newPref);
    saveExtractionModelPreference(newPref);
    setStatus({
      type: 'info',
      message: newPref.mode === 'auto'
        ? 'Extraction Engine set to Auto Mode with full fallback chain.'
        : newPref.mode === 'single'
        ? `Extraction Engine set to Single Model (${newPref.selectedModels[0] || 'gemini-3.6-flash'}).`
        : `Extraction Engine set to Multiple Models (${newPref.selectedModels.length} selected in custom cascade).`,
    });
  };
  
  // Final Manifest & Final Bill Shared State (Two-Way Synced between Final Manifest & Final Bill)
  const [isFinalBillEditing, setIsFinalBillEditing] = useState(false);
  const [finalBillOverrides, setFinalBillOverrides] = useState<Record<string, ManifestOverride>>(() => {
    try {
      const saved = localStorage.getItem(FINAL_OVERRIDES_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [manualDocEntries, setManualDocEntries] = useState<ManualDocManifest[]>(() => {
    try {
      const saved = localStorage.getItem(MANUAL_DOC_ENTRIES_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(FINAL_OVERRIDES_KEY, JSON.stringify(finalBillOverrides));
    } catch (e) {
      console.warn('Failed to save final overrides', e);
    }
    saveBillingDataToIDB('final_overrides', finalBillOverrides);
  }, [finalBillOverrides]);

  useEffect(() => {
    try {
      localStorage.setItem(MANUAL_DOC_ENTRIES_KEY, JSON.stringify(manualDocEntries));
    } catch (e) {
      console.warn('Failed to save manual doc entries', e);
    }
    saveBillingDataToIDB('manual_doc_entries', manualDocEntries);
  }, [manualDocEntries]);

  const [reportMeta, setReportMeta] = useState({ month: '', agency: '', area: '' });

  // UI State
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isFinalExportOpen, setIsFinalExportOpen] = useState(false);
  const [isPdfPreviewOpen, setIsPdfPreviewOpen] = useState(false);
  const [pdfPreviewBytes, setPdfPreviewBytes] = useState<Uint8Array | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isAiMinimized, setIsAiMinimized] = useState(true); // Default hidden / minimized for seamless non-blocking background extraction
  const [loadingMessage, setLoadingMessage] = useState("Processing...");
  const [completedAiResult, setCompletedAiResult] = useState<{ manifestNo: string; itemCount: number; totalAmount: number; manifestId: string } | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadTab, setUploadTab] = useState<'doc' | 'img' | 'json'>('doc');
  const [stagedImages, setStagedImages] = useState<{ file: File; preview: string }[]>([]);
  const [isManifestQueueExpanded, setIsManifestQueueExpanded] = useState<boolean>(false);
  
  // Row Deletion Control & Confirmation Modal State
  const [isDeleteModeActive, setIsDeleteModeActive] = useState<boolean>(false);
  const [rowToDelete, setRowToDelete] = useState<BillingRow | null>(null);
  const [showMobileDescription, setShowMobileDescription] = useState<boolean>(false);

  // Attention Required & Diagnostic Jump-to-Action State
  const [activeTargetRowId, setActiveTargetRowId] = useState<string | null>(null);
  const [activeTargetField, setActiveTargetField] = useState<'awb' | 'weight' | 'slNo'>('awb');

  // AI Extraction Diagnostic & Error Modal State
  const [aiExtractionDiagnostic, setAiExtractionDiagnostic] = useState<ExtractionDiagnosticReport | null>(null);
  const [isAiExtractionErrorModalOpen, setIsAiExtractionErrorModalOpen] = useState<boolean>(false);
  const [isAiRetrying, setIsAiRetrying] = useState<boolean>(false);
  const cachedExtractionPayloadRef = useRef<{ files: File[]; inputs: ManifestImageInput[]; instruction: string } | null>(null);
  const activeAbortControllerRef = useRef<AbortController | null>(null);
  
  // Sequential Multi-Page Camera Scanner State
  const [isHighResCameraOpen, setIsHighResCameraOpen] = useState<boolean>(false);
  const [isDocumentCropScannerOpen, setIsDocumentCropScannerOpen] = useState<boolean>(false);
  const [isCameraScannerOpen, setIsCameraScannerOpen] = useState(false);
  const [scannerCapturedPhotos, setScannerCapturedPhotos] = useState<{ file: File; preview: string }[]>([]);
  const [scannerPendingPhoto, setScannerPendingPhoto] = useState<{ file: File; preview: string } | null>(null);
  const [isScannerPhotoMaximized, setIsScannerPhotoMaximized] = useState<boolean>(false);

  // Post-Capture Document Cropper & Native Camera Shutter State
  const [cameraMode, setCameraMode] = useState<'in-app' | 'native'>('in-app');
  const [postCaptureCropperState, setPostCaptureCropperState] = useState<{
    isOpen: boolean;
    imageSrc: string | null;
    rawFile: File | null;
    pageIndex: number;
    replaceIndex?: number;
    captureMode?: 'in-app' | 'native';
  }>({
    isOpen: false,
    imageSrc: null,
    rawFile: null,
    pageIndex: 1,
    captureMode: 'in-app',
  });
  const nativeCameraRef = useRef<NativeCameraShutterRef | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Manifest Comment Tooltip state & auto-fade timer (3 seconds)
  const [showManifestComment, setShowManifestComment] = useState(false);
  const manifestCommentTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Local Storage for Captured Manifest Pages
  const [isCapturedSessionsModalOpen, setIsCapturedSessionsModalOpen] = useState<boolean>(false);
  const [capturedSessionsStats, setCapturedSessionsStats] = useState<{ total: number; failed: number; ready: number }>({
    total: 0,
    failed: 0,
    ready: 0
  });

  const refreshCapturedSessionsStats = useCallback(async () => {
    try {
      const list = await getAllCapturedSessions();
      setCapturedSessionsStats({
        total: list.length,
        failed: list.filter(s => s.status === 'failed').length,
        ready: list.filter(s => s.status === 'ready').length
      });
    } catch (e) {
      // ignore
    }
  }, []);

  useEffect(() => {
    refreshCapturedSessionsStats();
    const unsub = addCapturedSessionsListener(refreshCapturedSessionsStats);
    return () => unsub();
  }, [refreshCapturedSessionsStats]);

  const triggerManifestComment = (e?: React.SyntheticEvent) => {
    if (e) {
      e.stopPropagation();
    }
    if (manifestCommentTimerRef.current) {
      clearTimeout(manifestCommentTimerRef.current);
    }
    setShowManifestComment(prev => {
      const next = !prev;
      if (next) {
        manifestCommentTimerRef.current = setTimeout(() => {
          setShowManifestComment(false);
        }, 4000);
      }
      return next;
    });
  };

  useEffect(() => {
    // Never auto-show comment on open; shown only when user explicitly taps
    if (!isUploadModalOpen) {
      setShowManifestComment(false);
      if (manifestCommentTimerRef.current) {
        clearTimeout(manifestCommentTimerRef.current);
      }
    }
    return () => {
      if (manifestCommentTimerRef.current) {
        clearTimeout(manifestCommentTimerRef.current);
      }
    };
  }, [isUploadModalOpen]);

  useEffect(() => {
    if (!isUploadModalOpen) {
      if (stagedImages.length > 0) {
        stagedImages.forEach(img => {
          if (img.preview && img.preview.startsWith('blob:')) {
            try { URL.revokeObjectURL(img.preview); } catch (e) {}
          }
        });
        setStagedImages([]);
      }
      if (scannerCapturedPhotos.length > 0) {
        scannerCapturedPhotos.forEach(img => {
          if (img.preview && img.preview.startsWith('blob:')) {
            try { URL.revokeObjectURL(img.preview); } catch (e) {}
          }
        });
        setScannerCapturedPhotos([]);
      }
      if (scannerPendingPhoto) {
        if (scannerPendingPhoto.preview && scannerPendingPhoto.preview.startsWith('blob:')) {
          try { URL.revokeObjectURL(scannerPendingPhoto.preview); } catch (e) {}
        }
        setScannerPendingPhoto(null);
      }
      setPostCaptureCropperState({
        isOpen: false,
        imageSrc: null,
        rawFile: null,
        pageIndex: 1,
      });
      setIsCameraScannerOpen(false);
    }
  }, [isUploadModalOpen]);
  
  // Recycle Bin State
  const [recycleBin, setRecycleBin] = useState<RecycleBinItem[]>([]);
  const [isRecycleBinOpen, setIsRecycleBinOpen] = useState(false);
  const [recycleBinFilter, setRecycleBinFilter] = useState<'all' | 'manifest' | 'folder'>('all');
  const [recycleBinSearch, setRecycleBinSearch] = useState('');
  const [selectedBinItemIds, setSelectedBinItemIds] = useState<string[]>([]);

  // Delete Confirmation Modal (Moving to Recycle Bin)
  interface DeleteConfirmTarget {
    itemType: 'manifest' | 'folder';
    id: string;
    name: string;
    date?: string;
    count?: number;
    amount?: number;
  }
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<DeleteConfirmTarget | null>(null);

  // Permanent Clear Confirmation Modal (Inside Recycle Bin)
  interface PermanentClearTarget {
    mode: 'all' | 'selected' | 'single';
    targetId?: string;
    count: number;
    name?: string;
  }
  const [permanentClearTarget, setPermanentClearTarget] = useState<PermanentClearTarget | null>(null);
  const [clearConfirmationText, setClearConfirmationText] = useState('');

  // Folder Export UI
  const [isFolderExportOpen, setIsFolderExportOpen] = useState(false);
  
  // Bulk Import UI
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [bulkImportTab, setBulkImportTab] = useState<'zip' | 'multi'>('zip');
  const [bulkImportFolderId, setBulkImportFolderId] = useState<string>('new');
  const [bulkImportNewFolderName, setBulkImportNewFolderName] = useState('');
  const [bulkImportResults, setBulkImportResults] = useState<BulkImportStatus[]>([]);

  // Processing Mode State
  const [processingMode, setProcessingMode] = useState<'default' | 'hybrid'>('default');
  
  const [errors, setErrors] = useState<ParsingError[]>([]);
  const [status, setStatus] = useState<{ type: 'success' | 'info' | 'error', message: string } | null>(null);
  
  // Import Conflict State
  const [importConflict, setImportConflict] = useState<{ existing: ManifestHistory, newCandidate: ManifestHistory } | null>(null);
  
  // Folder UI State
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [manifestToMoveId, setManifestToMoveId] = useState<string | null>(null);
  const [historySearch, setHistorySearch] = useState('');
  const [isMobileSearchExpanded, setIsMobileSearchExpanded] = useState(false);
  const [historyViewMode, setHistoryViewMode] = useState<'grid' | 'table'>('grid');

  // Chunking & Batch Pagination Engine State
  const [isChunkingModalOpen, setIsChunkingModalOpen] = useState(false);
  const [chunkingInitialTab, setChunkingInitialTab] = useState<'capture' | 'queue' | 'statement'>('capture');
  const [currentExtractingSessionId, setCurrentExtractingSessionId] = useState<string | null>(null);
  const isBackgroundBatchRunningRef = useRef<boolean>(false);
  const [chunkingTab, setChunkingTab] = useState<'settings' | 'splitter' | 'preview'>('settings');
  const [chunkRowsPerPage, setChunkRowsPerPage] = useState<number>(() => {
    const saved = localStorage.getItem('smartbilling_chunk_rows_per_page');
    return saved ? Math.max(4, parseInt(saved, 10) || 12) : 12;
  });
  const [selectedSplitManifestId, setSelectedSplitManifestId] = useState<string>('');
  const [splitBatchSize, setSplitBatchSize] = useState<number>(10);
  const [inlineNewFolderName, setInlineNewFolderName] = useState('');
  const [showInlineNewFolderInput, setShowInlineNewFolderInput] = useState(false);

  // Per-column font size state for Modern Report
  const [fontSizes, setFontSizes] = useState({
    date: 14,
    units: 11,
    weight: 10,
    amount: 10
  });

  // Built-in PDF Viewer proportional font scale (0.70x to 1.60x, default 1.0x)
  const [pdfFontScale, setPdfFontScale] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('smartbilling_pdf_font_scale');
      const parsed = saved ? parseFloat(saved) : 1.0;
      return !isNaN(parsed) && parsed >= 0.7 && parsed <= 1.6 ? parsed : 1.0;
    } catch {
      return 1.0;
    }
  });
  
  const exportRef = useRef<HTMLDivElement>(null);
  const finalExportRef = useRef<HTMLDivElement>(null);
  const mobileActionsMenuRef = useRef<HTMLDivElement>(null);
  const mobileToolbarMenuRef = useRef<HTMLDivElement>(null);
  const [isMobileActionsMenuOpen, setIsMobileActionsMenuOpen] = useState<boolean>(false);
  const [isMobileToolbarMenuOpen, setIsMobileToolbarMenuOpen] = useState<boolean>(false);

  // Close dropdowns on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(event.target as Node)) {
        setIsExportOpen(false);
      }
      if (finalExportRef.current && !finalExportRef.current.contains(event.target as Node)) {
        setIsFinalExportOpen(false);
      }
      if (mobileActionsMenuRef.current && !mobileActionsMenuRef.current.contains(event.target as Node)) {
        setIsMobileActionsMenuOpen(false);
      }
      if (mobileToolbarMenuRef.current && !mobileToolbarMenuRef.current.contains(event.target as Node)) {
        setIsMobileToolbarMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Load Data from LocalStorage and IndexedDB
  useEffect(() => {
    const savedHistory = localStorage.getItem(STORAGE_KEY);
    const savedFolders = localStorage.getItem(FOLDERS_KEY);
    const savedRecycleBin = localStorage.getItem(RECYCLE_BIN_KEY);
    const savedGlobalConfig = localStorage.getItem(GLOBAL_CONFIG_KEY);
    const savedPrefs = localStorage.getItem(PREFS_KEY);

    // Retrieve all binned or deleted manifest IDs to strictly prevent resurrection
    const excludedIds = new Set<string>();
    try {
      const rawDeleted = localStorage.getItem(DELETED_MANIFESTS_KEY);
      if (rawDeleted) {
        (JSON.parse(rawDeleted) as string[]).forEach(id => excludedIds.add(id));
      }
    } catch (e) {}

    if (savedRecycleBin) {
      try {
        const bin: RecycleBinItem[] = JSON.parse(savedRecycleBin);
        bin.forEach(b => {
          if (b.originalId) excludedIds.add(b.originalId);
          if (b.id) excludedIds.add(b.id);
          if (b.manifestData?.id) excludedIds.add(b.manifestData.id);
          if (b.associatedManifests) b.associatedManifests.forEach(m => excludedIds.add(m.id));
        });
        setRecycleBin(bin);
      } catch (e) { console.error("Failed to load recycle bin", e); }
    }

    let initialCleanHistory: ManifestHistory[] = [];
    if (savedHistory !== null) {
      try {
        const parsed: ManifestHistory[] = JSON.parse(savedHistory);
        initialCleanHistory = parsed.filter(m => !excludedIds.has(m.id)).sort(compareManifestsByDateAsc);
        setHistory(initialCleanHistory);
        if (initialCleanHistory.length !== parsed.length) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(initialCleanHistory));
        }
        saveManifestsToIDB(initialCleanHistory);
      } catch (e) { console.error("Failed to load history", e); }
    }

    if (savedFolders) {
      try { setFolders(JSON.parse(savedFolders)); } catch (e) { console.error("Failed to load folders", e); }
    }
    if (savedGlobalConfig) {
      try { setGlobalConfig(JSON.parse(savedGlobalConfig)); } catch (e) { console.error("Failed to load global config", e); }
    }
    if (savedPrefs) {
      try {
        const prefs = JSON.parse(savedPrefs);
        if (prefs.theme) setAppTheme(prefs.theme);
        if (prefs.scale) setAppScale(prefs.scale);
        if (prefs.zoom) setAppZoom(prefs.zoom);
      } catch(e) { console.error("Failed to load prefs", e); }
    }
    const savedCloudMeta = localStorage.getItem(CLOUD_META_KEY);
    const savedAutoSync = localStorage.getItem(AUTO_SYNC_KEY);
    if (savedCloudMeta || savedAutoSync !== null) {
      try {
        const meta = savedCloudMeta ? JSON.parse(savedCloudMeta) : {};
        const explicitAutoSync = savedAutoSync !== null ? JSON.parse(savedAutoSync) === true : false;
        setCloudMeta(prev => ({
          ...prev,
          lastSyncTimestamp: meta.lastSyncTimestamp ?? null,
          autoSyncEnabled: explicitAutoSync,
        }));
      } catch (e) { console.error("Failed to load cloud meta", e); }
    }

    // Offline Resilience: Hydrate from IndexedDB ONLY if localStorage was completely absent/wiped
    getManifestsFromIDB().then(idbManifests => {
      if (idbManifests && idbManifests.length > 0) {
        setHistory(prev => {
          const activeIdb = idbManifests.filter(m => !excludedIds.has(m.id)).sort(compareManifestsByDateAsc);
          if (savedHistory !== null) {
            // LocalStorage had authoritative state! Sync our clean state back to IDB so IDB never retains deleted items
            saveManifestsToIDB(prev);
            return prev;
          }
          // Only if localStorage was completely null (wiped), hydrate from IDB
          localStorage.setItem(STORAGE_KEY, JSON.stringify(activeIdb));
          return activeIdb;
        });
      }
    });

    getBillingRatesFromIDB().then(idbRates => {
      if (idbRates) {
        setGlobalConfig(prev => ({ ...prev, ...idbRates }));
      }
    });

    if (localStorage.getItem(FINAL_OVERRIDES_KEY) === null) {
      getBillingDataFromIDB<Record<string, ManifestOverride>>('final_overrides').then(idbOverrides => {
        if (idbOverrides && typeof idbOverrides === 'object') {
          setFinalBillOverrides(idbOverrides);
        }
      });
    }
    if (localStorage.getItem(MANUAL_DOC_ENTRIES_KEY) === null) {
      getBillingDataFromIDB<ManualDocManifest[]>('manual_doc_entries').then(idbManualDocs => {
        if (Array.isArray(idbManualDocs) && idbManualDocs.length > 0) {
          setManualDocEntries(idbManualDocs);
        }
      });
    }
  }, []);

  // Background Auto-Sync Worker for Offline Camera Scans
  useEffect(() => {
    const unsubAutoSync = initOfflineAutoSync(
      () => globalConfig,
      () => customApiKey || '',
      (msg) => {
        setLoadingMessage(msg);
      }
    );

    const unsubSynced = addManifestSyncedListener((syncedManifest) => {
      setHistory(prev => {
        if (prev.some(h => h.id === syncedManifest.id || h.manifestNo === syncedManifest.manifestNo)) {
          return prev;
        }
        return [syncedManifest, ...prev];
      });
      setStatus({
        type: 'success',
        message: `Offline scan auto-synced! Manifest #${syncedManifest.manifestNo} added to history.`
      });
    });

    return () => {
      unsubAutoSync();
      unsubSynced();
    };
  }, [globalConfig, customApiKey]);

  // Sync theme class to html documentElement, body, and native Android StatusBar
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark', 'reading');
    document.body.classList.remove('dark', 'reading');
    if (appTheme === 'dark') {
      root.classList.add('dark');
      document.body.classList.add('dark');
    } else if (appTheme === 'reading') {
      root.classList.add('reading');
      document.body.classList.add('reading');
    }
    syncNativeStatusBar(appTheme);
  }, [appTheme]);

  // Dismiss native Capacitor splash screen once mounted
  useEffect(() => {
    hideNativeSplashScreen();
  }, []);

  // Native Android Hardware Back Button stack controller (always reads fresh state via ref)
  const nativeBackActionRef = useRef<() => boolean>(() => false);
  const lastBackPressTimestampRef = useRef<number>(0);

  nativeBackActionRef.current = () => {
    if (isHighResCameraOpen) {
      setIsHighResCameraOpen(false);
      return true;
    }
    if (isDocumentCropScannerOpen) {
      setIsDocumentCropScannerOpen(false);
      return true;
    }
    if (postCaptureCropperState.isOpen) {
      setPostCaptureCropperState(prev => ({ ...prev, isOpen: false, imageSrc: null, rawFile: null }));
      return true;
    }
    if (isCameraScannerOpen) {
      setIsCameraScannerOpen(false);
      return true;
    }
    if (isAiExtractionErrorModalOpen) {
      setIsAiExtractionErrorModalOpen(false);
      return true;
    }
    if (deleteConfirmTarget) {
      setDeleteConfirmTarget(null);
      return true;
    }
    if (permanentClearTarget) {
      setPermanentClearTarget(null);
      return true;
    }
    if (rowToDelete) {
      setRowToDelete(null);
      return true;
    }
    if (importConflict) {
      setImportConflict(null);
      return true;
    }
    if (isPdfPreviewOpen) {
      setIsPdfPreviewOpen(false);
      setPdfPreviewBytes(null);
      return true;
    }
    if (isUploadModalOpen) {
      setIsUploadModalOpen(false);
      return true;
    }
    if (isChunkingModalOpen) {
      setIsChunkingModalOpen(false);
      return true;
    }
    if (isCapturedSessionsModalOpen) {
      setIsCapturedSessionsModalOpen(false);
      return true;
    }
    if (isCloudManagerModalOpen) {
      setIsCloudManagerModalOpen(false);
      return true;
    }
    if (isGlobalSettingsOpen) {
      setIsGlobalSettingsOpen(false);
      return true;
    }
    if (isRecycleBinOpen) {
      setIsRecycleBinOpen(false);
      return true;
    }
    if (isFolderExportOpen) {
      setIsFolderExportOpen(false);
      return true;
    }
    if (isBulkImportOpen) {
      setIsBulkImportOpen(false);
      return true;
    }
    if (isCreateFolderOpen) {
      setIsCreateFolderOpen(false);
      return true;
    }
    if (isConfigOpen) {
      setIsConfigOpen(false);
      return true;
    }
    if (manifestToMoveId) {
      setManifestToMoveId(null);
      return true;
    }
    if (isExportOpen) {
      setIsExportOpen(false);
      return true;
    }
    if (isFinalExportOpen) {
      setIsFinalExportOpen(false);
      return true;
    }
    if (view === 'billing') {
      setView('dashboard');
      return true;
    }
    if (dashboardTab !== 'history') {
      setDashboardTab('history');
      return true;
    }
    if (currentFolderId !== null) {
      setCurrentFolderId(null);
      return true;
    }
    return false;
  };

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let listenerHandle: { remove: () => Promise<void> } | null = null;
    let isDisposed = false;

    CapacitorApp.addListener('backButton', () => {
      const handled = nativeBackActionRef.current();
      if (handled) return;

      const now = Date.now();
      if (now - lastBackPressTimestampRef.current < 2000) {
        CapacitorApp.exitApp();
      } else {
        lastBackPressTimestampRef.current = now;
        setStatus({ type: 'info', message: 'Press Back again to exit JCBilling' });
      }
    })
      .then((handle) => {
        if (isDisposed) {
          handle.remove().catch(() => {});
        } else {
          listenerHandle = handle;
        }
      })
      .catch((err) => {
        console.warn('Capacitor backButton listener registration failed:', err);
      });

    return () => {
      isDisposed = true;
      if (listenerHandle) {
        listenerHandle.remove().catch(() => {});
      }
    };
  }, []);

  // Sync proportional overall app UI zoom to root
  useEffect(() => {
    try {
      (document.documentElement.style as any).zoom = `${appZoom}%`;
    } catch (e) {
      console.error("Failed to apply zoom to documentElement", e);
    }
  }, [appZoom]);

  const handleSetTheme = (newTheme: 'light' | 'dark' | 'reading') => {
    setAppTheme(newTheme);
    try {
      const savedPrefs = localStorage.getItem(PREFS_KEY);
      const parsed = savedPrefs ? JSON.parse(savedPrefs) : {};
      localStorage.setItem(PREFS_KEY, JSON.stringify({ ...parsed, theme: newTheme, scale: appScale, zoom: appZoom }));
    } catch (e) {
      console.error("Failed to save theme pref", e);
    }
  };

  const saveGlobalSettings = (newConfig: BillingConfig, newTheme: string, newScale: number, newZoom: number) => {
      setGlobalConfig(newConfig);
      handleSetTheme(newTheme as any);
      setAppScale(newScale);
      setAppZoom(newZoom);
      try { localStorage.setItem(GLOBAL_CONFIG_KEY, JSON.stringify(newConfig)); } catch (e) {}
      try { localStorage.setItem(PREFS_KEY, JSON.stringify({ theme: newTheme, scale: newScale, zoom: newZoom })); } catch (e) {}
      saveBillingRatesToIDB(newConfig);
  };

  // Recalculate everything when config changes (only when in billing mode)
  useEffect(() => {
    if (view === 'billing') {
      setRows(prevRows => prevRows.map(row => calculateRow(row, config)));
    }
  }, [config, view]);

  const totalAmount = useMemo(() => rows.reduce((sum, row) => sum + row.amount, 0), [rows]);

  // Derived state for active session summary
  const summary = useMemo(() => {
    const s = {
      slab1Weight: 0, slab2Weight: 0, slab3Weight: 0,
      parcelCountS1: 0, parcelCountS2Plus: 0,
      heavyParcelWeightsList: [] as number[],
      lightParcelsTotalWeight: 0, heavyParcelsTotalWeight: 0,
      docCount: 0, docTotal: 0, totalBillableWeight: 0,
      rawTotalWeight: 0,
      parcelCount: 0
    };
    rows.forEach(row => {
      s.rawTotalWeight += Number(row.weight) || 0;
      if (row.type === ItemType.DOCUMENT) { s.docCount++; s.docTotal += row.amount; } 
      else {
        s.parcelCount++;
        const rounded = Math.ceil(row.weight);
        s.totalBillableWeight += rounded;
        const calc = calculateParcelAmount(row.weight, config);
        s.slab1Weight += calc.s1w; s.slab2Weight += calc.s2w; s.slab3Weight += calc.s3w;
        if (rounded <= 10) { s.parcelCountS1++; s.lightParcelsTotalWeight += rounded; } 
        else { s.parcelCountS2Plus++; s.heavyParcelsTotalWeight += rounded; s.heavyParcelWeightsList.push(rounded); }
      }
    });
    return s;
  }, [rows, config]);

  const filteredFolders = useMemo(() => {
    if (!historySearch.trim()) return folders;
    const q = historySearch.toLowerCase().trim();
    return folders.filter(f => f.name.toLowerCase().includes(q));
  }, [folders, historySearch]);

  const filteredHistory = useMemo(() => {
    const baseList = currentFolderId 
      ? history.filter(h => h.folderId === currentFolderId)
      : history.filter(h => !h.folderId);
    const q = historySearch.toLowerCase().trim();
    const list = q
      ? baseList.filter(h => 
          h.manifestNo.toLowerCase().includes(q) || 
          h.manifestDate.toLowerCase().includes(q)
        )
      : baseList;
    return [...list].sort(compareManifestsByDateAsc);
  }, [history, currentFolderId, historySearch]);

  const currentFolder = useMemo(() => {
    return folders.find(f => f.id === currentFolderId) || null;
  }, [folders, currentFolderId]);

  const historyStats = useMemo(() => {
    const targetHistory = currentFolderId ? history.filter(h => h.folderId === currentFolderId) : history;
    const totalManifests = targetHistory.length;
    const totalAmount = targetHistory.reduce((sum, h) => sum + (h.totalAmount || 0), 0);
    const totalUnits = targetHistory.reduce((sum, h) => sum + (h.itemCount || 0), 0);
    const totalRawWeight = targetHistory.reduce((sum, h) => {
      return sum + (h.rows || []).reduce((rSum, r) => rSum + (Number(r.weight) || 0), 0);
    }, 0);
    const totalFolders = folders.length;
    return { totalManifests, totalAmount, totalUnits, totalRawWeight, totalFolders };
  }, [history, folders, currentFolderId]);

  const filteredBinItems = useMemo(() => {
    return recycleBin.filter(item => {
      const matchesType = recycleBinFilter === 'all' || item.itemType === recycleBinFilter;
      const q = recycleBinSearch.toLowerCase().trim();
      const matchesSearch = !q ||
        item.name.toLowerCase().includes(q) ||
        (item.manifestData?.manifestDate && item.manifestData.manifestDate.toLowerCase().includes(q));
      return matchesType && matchesSearch;
    });
  }, [recycleBin, recycleBinFilter, recycleBinSearch]);

  // Dynamic Page Title Logic
  const pageSubtitle = useMemo(() => {
    if (view === 'billing') return "Active Billing Session";
    if (dashboardTab === 'manifest') {
      return "P + D Manifest Consolidation";
    }
    if (dashboardTab === 'final') {
      return "Monthly Statement";
    }
    return "P Manifest Explorer";
  }, [view, dashboardTab]);

  // Notice Banner under h1 state & auto-fade timer (3s display then fade-up)
  const [isNoticeVisible, setIsNoticeVisible] = useState(false);
  const [isNoticeFadingUp, setIsNoticeFadingUp] = useState(false);
  const noticeTimerRef = useRef<any>(null);
  const noticeFadeTimerRef = useRef<any>(null);

  const triggerNoticeBanner = useCallback(() => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    if (noticeFadeTimerRef.current) clearTimeout(noticeFadeTimerRef.current);

    setIsNoticeVisible(prev => {
      const next = !prev;
      if (next) {
        setIsNoticeFadingUp(false);
        noticeTimerRef.current = setTimeout(() => {
          setIsNoticeFadingUp(true);
          noticeFadeTimerRef.current = setTimeout(() => {
            setIsNoticeVisible(false);
            setIsNoticeFadingUp(false);
          }, 500);
        }, 4000);
      } else {
        setIsNoticeFadingUp(false);
      }
      return next;
    });
  }, []);

  // Notice Banner is shown strictly on user tap/click; never auto-triggered on tab change or reload
  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      if (noticeFadeTimerRef.current) clearTimeout(noticeFadeTimerRef.current);
    };
  }, []);

  const getFolderBreadcrumb = () => {
    if (!currentFolderId) return null;
    const currentFolder = folders.find(f => f.id === currentFolderId);
    return (
      <div className="flex items-center gap-2 mb-6 no-print overflow-x-auto whitespace-nowrap pb-2">
        <button onClick={() => setCurrentFolderId(null)} className="text-indigo-600 font-bold hover:underline">Root History</button>
        <ChevronRightIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
        <span className="text-gray-900 font-black">{currentFolder?.name || 'Folder'}</span>
      </div>
    );
  };

  // Tombstone tracking for deleted/binned manifests to prevent resurrection across sessions
  const getDeletedManifestIds = (): Set<string> => {
    try {
      const raw = localStorage.getItem(DELETED_MANIFESTS_KEY);
      if (raw) return new Set<string>(JSON.parse(raw));
    } catch (e) {}
    return new Set<string>();
  };

  const recordDeletedManifestIds = (...ids: string[]) => {
    try {
      const current = getDeletedManifestIds();
      ids.forEach(id => { if (id) current.add(id); });
      localStorage.setItem(DELETED_MANIFESTS_KEY, JSON.stringify(Array.from(current)));
    } catch (e) {}
  };

  const unrecordDeletedManifestIds = (...ids: string[]) => {
    try {
      const current = getDeletedManifestIds();
      ids.forEach(id => { current.delete(id); });
      localStorage.setItem(DELETED_MANIFESTS_KEY, JSON.stringify(Array.from(current)));
    } catch (e) {}
  };

  const getDeletedManualDocIds = (): Set<string> => {
    try {
      const raw = localStorage.getItem(DELETED_MANUAL_DOCS_KEY);
      if (raw) return new Set<string>(JSON.parse(raw));
    } catch (e) {}
    return new Set<string>();
  };

  const recordDeletedManualDocIds = (...ids: string[]) => {
    try {
      const current = getDeletedManualDocIds();
      ids.forEach(id => { if (id) current.add(id); });
      localStorage.setItem(DELETED_MANUAL_DOCS_KEY, JSON.stringify(Array.from(current)));
    } catch (e) {}
  };

  const unrecordDeletedManualDocIds = (...ids: string[]) => {
    try {
      const current = getDeletedManualDocIds();
      ids.forEach(id => { current.delete(id); });
      localStorage.setItem(DELETED_MANUAL_DOCS_KEY, JSON.stringify(Array.from(current)));
    } catch (e) {}
  };

  // Data Persistence (LocalStorage + IndexedDB Multi-Tier Fallback)
  const saveHistory = (newHistory: ManifestHistory[]) => {
    const sorted = [...newHistory].sort(compareManifestsByDateAsc);
    setHistory(sorted);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(sorted)); } catch (e) {}
    saveManifestsToIDB(sorted);
  };

  const saveFolders = (newFolders: Folder[]) => {
    setFolders(newFolders);
    try { localStorage.setItem(FOLDERS_KEY, JSON.stringify(newFolders)); } catch (e) {}
    saveBillingDataToIDB('folders', newFolders);
  };

  const saveRecycleBin = (newBin: RecycleBinItem[]) => {
    setRecycleBin(newBin);
    try { localStorage.setItem(RECYCLE_BIN_KEY, JSON.stringify(newBin)); } catch (e) {}
    saveBillingDataToIDB('recycle_bin', newBin);
  };

  // Cloud Operations & Backup Handlers
  const refreshCloudData = useCallback(async (keyOverride?: string) => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setCloudMeta(prev => ({
        ...prev,
        isOnline: false,
        status: 'idle',
        lastSyncMessage: 'Offline mode: Operating from local storage (auto-sync paused)',
      }));
      return;
    }

    setIsCloudLoading(true);
    try {
      const activeKey = keyOverride || syncChannelKey;
      const [backups, remoteManifests, pdState] = await Promise.all([
        listCloudBackups(activeKey),
        fetchCloudManifests(activeKey),
        fetchFinalPdState(activeKey),
      ]);
      setCloudBackups(backups);
      setCloudManifests(remoteManifests);
      setCloudOverrides(pdState.finalBillOverrides || {});
      setCloudManualDocEntries(pdState.manualDocEntries || []);
      setCloudMeta(prev => ({ ...prev, isOnline: true, status: 'idle', lastSyncMessage: 'Cloud connected' }));
    } catch (err: any) {
      if (checkIsOfflineError(err)) {
        setCloudMeta(prev => ({
          ...prev,
          isOnline: false,
          status: 'idle',
          lastSyncMessage: 'Offline mode: Operating from local storage',
        }));
      } else {
        console.warn("Notice loading cloud data:", err);
        setCloudMeta(prev => ({
          ...prev,
          isOnline: false,
          status: 'idle',
          lastSyncMessage: err?.message || 'Cloud connection standby',
        }));
      }
    } finally {
      setIsCloudLoading(false);
    }
  }, [syncChannelKey]);

  useEffect(() => {
    refreshCloudData();
  }, [refreshCloudData]);

  // Reactive internet connection listener: auto-resumes cloud sync when internet returns
  useEffect(() => {
    const unsubscribe = addConnectionStatusListener((online) => {
      setCloudMeta(prev => ({
        ...prev,
        isOnline: online,
        lastSyncMessage: online ? 'Online: Auto-sync active' : 'Offline: Operating from local storage (auto-sync paused)',
      }));
      if (online) {
        // Automatically reconnect and refresh cloud manifests when device comes back online
        refreshCloudData();
      }
    });

    return unsubscribe;
  }, [refreshCloudData]);

  // Handle pairing syncKey from URL query parameter (e.g. from scanning QR code on phone/tab)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlSyncKey = params.get('syncKey');
      if (urlSyncKey && urlSyncKey.trim()) {
        const cleanKey = urlSyncKey.trim().toUpperCase();
        saveSyncChannelKey(cleanKey);
        setSyncChannelKey(cleanKey);
        setCloudActivatedOnDevice(true);
        setIsCloudActivated(true);
        const newUrl = window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
        setStatus({
          type: 'success',
          message: `Linked to Common Cloud Storage (${cleanKey})! Synchronizing devices...`,
        });
      }
    }
  }, []);

  // Register device presence & heartbeat (only when cloud is activated and online)
  useEffect(() => {
    if (!isCloudActivated || !cloudMeta.isOnline) return;

    const dev: SyncedDevice = {
      ...currentDevice,
      channelKey: syncChannelKey,
      manifestCount: history.length,
      lastActive: Date.now(),
    };
    registerDevicePresence(dev);

    const interval = setInterval(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        registerDevicePresence({
          ...dev,
          channelKey: syncChannelKey,
          manifestCount: history.length,
          lastActive: Date.now(),
        });
      }
    }, 45000); // 45s heartbeat

    return () => clearInterval(interval);
  }, [syncChannelKey, currentDevice, history.length, isCloudActivated, cloudMeta.isOnline]);

  // Listen for other connected devices on the same channel in real-time (only when cloud is activated and online)
  useEffect(() => {
    if (!isCloudActivated || !cloudMeta.isOnline) {
      setConnectedDevices([]);
      return;
    }

    const unsubscribeDevices = listenToConnectedDevices(
      syncChannelKey,
      currentDevice.id,
      (devices) => {
        setConnectedDevices(devices);
      }
    );

    return () => {
      unsubscribeDevices();
    };
  }, [syncChannelKey, currentDevice.id, isCloudActivated, cloudMeta.isOnline]);

  // Listen for cloud manifests in real-time (live cross-device sync when online)
  useEffect(() => {
    if (!isCloudActivated || !cloudMeta.autoSyncEnabled || !cloudMeta.isOnline) return;

    const unsubscribeManifests = listenToCloudManifests(syncChannelKey, (remoteManifests) => {
      if (!remoteManifests || remoteManifests.length === 0) return;

      const deletedIds = getDeletedManifestIds();
      const currentBinJson = localStorage.getItem(RECYCLE_BIN_KEY);
      if (currentBinJson) {
        try {
          const bin: RecycleBinItem[] = JSON.parse(currentBinJson);
          bin.forEach(b => {
            if (b.originalId) deletedIds.add(b.originalId);
            if (b.id) deletedIds.add(b.id);
            if (b.manifestData?.id) deletedIds.add(b.manifestData.id);
            if (b.associatedManifests) b.associatedManifests.forEach(m => deletedIds.add(m.id));
          });
        } catch (e) {}
      }

      const activeRemote = remoteManifests.filter(m => !deletedIds.has(m.id));
      setCloudManifests(activeRemote);

      setHistory((prevHistory) => {
        const localClean = prevHistory.filter(m => !deletedIds.has(m.id));
        const localMap = new Map<string, ManifestHistory>(localClean.map((m) => [m.id, m] as [string, ManifestHistory]));
        let hasNew = false;

        for (const remoteM of activeRemote) {
          const localM = localMap.get(remoteM.id);
          const remoteTs = remoteM.updatedAt || remoteM.createdAt || 0;
          const localTs = localM ? (localM.updatedAt || localM.createdAt || 0) : 0;
          if (!localM || remoteTs > localTs) {
            localMap.set(remoteM.id, remoteM);
            hasNew = true;
          }
          if (remoteM.pdOverride) {
            setFinalBillOverrides(prevOv => {
              const curOv = prevOv[remoteM.id];
              const remoteOvTs = remoteM.pdOverride?.updatedAt || 0;
              const curOvTs = curOv?.updatedAt || 0;
              if (!curOv || remoteOvTs > curOvTs) {
                return { ...prevOv, [remoteM.id]: remoteM.pdOverride! };
              }
              return prevOv;
            });
          }
        }

        if (hasNew || localClean.length !== prevHistory.length) {
          const merged = Array.from(localMap.values()).sort(compareManifestsByDateAsc);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
          saveManifestsToIDB(merged);
          return merged;
        }
        return prevHistory;
      });
    });

    return () => {
      unsubscribeManifests();
    };
  }, [syncChannelKey, cloudMeta.autoSyncEnabled, isCloudActivated, cloudMeta.isOnline]);

  const handleActivateCloud = async (initialKey?: string) => {
    const cleanKey = initialKey?.trim().toUpperCase() || syncChannelKey;
    saveSyncChannelKey(cleanKey);
    setSyncChannelKey(cleanKey);
    setCloudActivatedOnDevice(true);
    setIsCloudActivated(true);
    const updatedDevice: SyncedDevice = { ...currentDevice, channelKey: cleanKey };
    setCurrentDevice(updatedDevice);
    await registerDevicePresence(updatedDevice);
    setStatus({
      type: 'success',
      message: `Cloud Workspace Activated! Sync Key: ${cleanKey}`,
    });
    await handleSyncNow(cleanKey);
  };

  const handleLinkWithExistingCloud = async (existingKey: string) => {
    const cleanKey = existingKey.trim().toUpperCase();
    if (!cleanKey) return;
    saveSyncChannelKey(cleanKey);
    setSyncChannelKey(cleanKey);
    setCloudActivatedOnDevice(true);
    setIsCloudActivated(true);
    const updatedDevice: SyncedDevice = { ...currentDevice, channelKey: cleanKey };
    setCurrentDevice(updatedDevice);
    await registerDevicePresence(updatedDevice);
    setStatus({
      type: 'success',
      message: `Connected to Cloud Key: ${cleanKey}! Synchronizing manifests...`,
    });
    await handleSyncNow(cleanKey);
  };

  const handleDeactivateCloud = () => {
    setCloudActivatedOnDevice(false);
    setIsCloudActivated(false);
    setConnectedDevices([]);
    setStatus({
      type: 'info',
      message: 'Cloud Storage locked and disconnected on this device.',
    });
  };

  const handleUpdateChannelKey = async (newKey: string) => {
    const cleanKey = newKey.trim().toUpperCase();
    saveSyncChannelKey(cleanKey);
    setSyncChannelKey(cleanKey);
    const updatedDevice: SyncedDevice = { ...currentDevice, channelKey: cleanKey };
    setCurrentDevice(updatedDevice);
    await registerDevicePresence(updatedDevice);
    setStatus({
      type: 'success',
      message: `Connected to Cloud Storage Key: ${cleanKey}`,
    });
    await handleSyncNow(cleanKey);
  };

  const handleUpdateDeviceName = async (newName: string) => {
    saveDeviceCustomName(newName);
    const updated = { ...currentDevice, name: newName };
    setCurrentDevice(updated);
    await registerDevicePresence(updated);
    setStatus({
      type: 'success',
      message: `Device name updated to "${newName}".`,
    });
  };

  const handleCreateCloudBackup = async (name: string, description?: string, sectionType?: ManifestSectionType) => {
    setIsCloudLoading(true);
    try {
      const newBackup = await createCloudBackup({
        name,
        description,
        sectionType,
        channelKey: syncChannelKey,
        manifests: history,
        folders,
        globalConfig,
        finalBillOverrides,
        manualDocEntries,
        appTheme,
        appScale,
        appZoom,
      });
      setCloudBackups(prev => [newBackup, ...prev]);
      setStatus({ type: 'success', message: `Cloud backup "${newBackup.name}" created successfully!` });
    } catch (err: any) {
      console.error("Create cloud backup failed:", err);
      setStatus({ type: 'error', message: `Cloud backup failed: ${err?.message || 'Unknown error'}` });
      throw err;
    } finally {
      setIsCloudLoading(false);
    }
  };

  const handleDeleteCloudManifest = async (manifestId: string, cloudDocId?: string) => {
    try {
      await deleteManifestFromCloud(manifestId, cloudDocId);
      setCloudManifests(prev => prev.filter(m => m.id !== manifestId && (!cloudDocId || m.cloudDocId !== cloudDocId)));
      setStatus({ type: 'success', message: 'Manifest removed from cloud vault.' });
    } catch (err: any) {
      console.error("Delete manifest from cloud failed:", err);
      setStatus({ type: 'error', message: `Delete failed: ${err?.message || 'Unknown error'}` });
      throw err;
    }
  };

  const handleDeleteCloudManualDoc = async (docId: string) => {
    try {
      await deleteManualDocEntryFromCloud(docId, syncChannelKey);
      setCloudManualDocEntries(prev => prev.filter(d => d.id !== docId));
      setCloudOverrides(prev => {
        const next = { ...prev };
        delete next[docId];
        return next;
      });
      setStatus({ type: 'success', message: 'Document manifest removed from cloud vault.' });
    } catch (err: any) {
      console.error("Delete manual doc from cloud failed:", err);
      setStatus({ type: 'error', message: `Delete failed: ${err?.message || 'Unknown error'}` });
      throw err;
    }
  };

  const handleRestoreCloudBackup = async (backup: CloudBackupFile, mode: 'replace' | 'merge') => {
    setIsCloudLoading(true);
    try {
      const backupData = backup.data || ({} as CloudBackupFile['data']);
      const backupManifests = backupData.manifests || [];
      const backupFolders = backupData.folders || [];
      const backupOverrides: Record<string, ManifestOverride> = {
        ...(backupData.finalBillOverrides || {}),
      };
      for (const bm of backupManifests) {
        if (bm.pdOverride && !backupOverrides[bm.id]) {
          backupOverrides[bm.id] = bm.pdOverride;
        }
      }
      const backupManualDocs = backupData.manualDocEntries || [];

      unrecordDeletedManifestIds(...backupManifests.map(m => m.id));
      unrecordDeletedManualDocIds(...backupManualDocs.map(d => d.id));

      if (mode === 'replace') {
        saveHistory(backupManifests);
        saveFolders(backupFolders);
        setFinalBillOverrides(backupOverrides);
        setManualDocEntries(backupManualDocs);
        if (backupData.globalConfig) {
          setGlobalConfig(backupData.globalConfig);
          localStorage.setItem(GLOBAL_CONFIG_KEY, JSON.stringify(backupData.globalConfig));
        }
        if (backupData.appTheme) handleSetTheme(backupData.appTheme);
        if (backupData.appScale) setAppScale(backupData.appScale);
        if (backupData.appZoom) setAppZoom(backupData.appZoom);

        setStatus({
          type: 'success',
          message: `Workspace restored from cloud snapshot "${backup.name}" (${backupManifests.length} manifests, ${backupManualDocs.length} doc entries, ${backupFolders.length} folders).`,
        });
      } else {
        const existingMap = new Map<string, ManifestHistory>(history.map(m => [m.id, m] as [string, ManifestHistory]));
        let addedManifestCount = 0;
        for (const bm of backupManifests) {
          if (!existingMap.has(bm.id)) addedManifestCount++;
          existingMap.set(bm.id, bm);
        }
        const mergedManifests = Array.from(existingMap.values());

        const existingFolderIds = new Set(folders.map(f => f.id));
        const toAddFolders = backupFolders.filter(f => !existingFolderIds.has(f.id));
        const mergedFolders = [...toAddFolders, ...folders];

        saveHistory(mergedManifests);
        saveFolders(mergedFolders);

        setFinalBillOverrides(prev => {
          const next = { ...prev };
          for (const [id, ov] of Object.entries(backupOverrides)) {
            const cur = next[id];
            if (!cur || (ov.updatedAt || 0) >= (cur.updatedAt || 0)) {
              next[id] = ov;
            }
          }
          return next;
        });

        setManualDocEntries(prev => {
          const map = new Map<string, ManualDocManifest>(prev.map(d => [d.id, d] as [string, ManualDocManifest]));
          for (const d of backupManualDocs) {
            const cur = map.get(d.id);
            if (!cur || (d.updatedAt || d.createdAt || 0) >= (cur.updatedAt || cur.createdAt || 0)) {
              map.set(d.id, d);
            }
          }
          return Array.from(map.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        });

        setStatus({
          type: 'success',
          message: `Merged ${addedManifestCount} manifest(s), ${backupManualDocs.length} doc entry(ies), and ${toAddFolders.length} folder(s) from snapshot "${backup.name}".`,
        });
      }
    } catch (err: any) {
      console.error("Restore failed:", err);
      setStatus({ type: 'error', message: `Restore failed: ${err?.message || 'Unknown error'}` });
      throw err;
    } finally {
      setIsCloudLoading(false);
    }
  };

  const handleRestoreCloudManifests = async (
    manifestsToRestore: ManifestHistory[],
    options?: { openAfter?: boolean }
  ) => {
    if (!manifestsToRestore || manifestsToRestore.length === 0) return;
    unrecordDeletedManifestIds(...manifestsToRestore.map(m => m.id));

    const existingMap = new Map<string, ManifestHistory>(history.map(m => [m.id, m] as [string, ManifestHistory]));
    for (const cm of manifestsToRestore) {
      existingMap.set(cm.id, cm);
    }
    saveHistory(Array.from(existingMap.values()));

    // Restore any associated P+D overrides for these manifests
    setFinalBillOverrides(prev => {
      const next = { ...prev };
      for (const cm of manifestsToRestore) {
        const ov = cm.pdOverride || cloudOverrides[cm.id] || (cm.cloudDocId ? cloudOverrides[cm.cloudDocId] : undefined);
        if (ov) {
          next[cm.id] = { ...(next[cm.id] || {}), ...ov };
        }
      }
      return next;
    });

    // Ensure referenced folders exist locally
    const missingFolderIds = new Set<string>();
    const existingFolderIds = new Set(folders.map(f => f.id));
    for (const cm of manifestsToRestore) {
      if (cm.folderId && !existingFolderIds.has(cm.folderId)) {
        missingFolderIds.add(cm.folderId);
      }
    }
    if (missingFolderIds.size > 0) {
      try {
        const remoteFolders = await fetchCloudFolders(syncChannelKey);
        const foldersToAdd = remoteFolders.filter(rf => missingFolderIds.has(rf.id) && !existingFolderIds.has(rf.id));
        if (foldersToAdd.length > 0) {
          saveFolders([...folders, ...foldersToAdd]);
        }
      } catch {
        // Non-fatal if offline
      }
    }

    if (options?.openAfter && manifestsToRestore.length === 1) {
      openManifestFromHistory(manifestsToRestore[0]);
      setStatus({
        type: 'success',
        message: `Synced Manifest #${manifestsToRestore[0].manifestNo || 'Untitled'} (including P+D Doc edits) to device & opened editor.`,
      });
    } else {
      setStatus({
        type: 'success',
        message: `Synced ${manifestsToRestore.length} manifest(s) & P+D Doc edits to device storage.`,
      });
    }
  };

  const handleRestoreCloudManualDocs = async (docsToRestore: ManualDocManifest[]) => {
    if (!docsToRestore || docsToRestore.length === 0) return;
    unrecordDeletedManualDocIds(...docsToRestore.map(d => d.id));
    setManualDocEntries(prev => {
      const map = new Map<string, ManualDocManifest>(prev.map(d => [d.id, d] as [string, ManualDocManifest]));
      for (const d of docsToRestore) {
        map.set(d.id, d);
      }
      return Array.from(map.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    });
    setFinalBillOverrides(prev => {
      const next = { ...prev };
      for (const d of docsToRestore) {
        if (cloudOverrides[d.id]) {
          next[d.id] = cloudOverrides[d.id];
        }
      }
      return next;
    });
    setStatus({
      type: 'success',
      message: `Synced ${docsToRestore.length} Document Manifest entry(ies) to device P+D Manifest!`,
    });
  };

  const handleDeleteCloudBackup = async (backupId: string, cloudDocId?: string) => {
    setIsCloudLoading(true);
    try {
      await deleteCloudBackup(backupId, cloudDocId);
      setCloudBackups(prev => prev.filter(b => b.id !== backupId && (!cloudDocId || b.cloudDocId !== cloudDocId)));
      setStatus({ type: 'success', message: 'Cloud backup snapshot permanently removed.' });
    } catch (err: any) {
      console.error("Delete backup failed:", err);
      setStatus({ type: 'error', message: `Failed to delete cloud backup: ${err?.message}` });
      throw err;
    } finally {
      setIsCloudLoading(false);
    }
  };

  const handleSyncNow = async (
    channelKeyOverrideOrSection?: string | ManifestSectionType,
    maybeSectionOrMode?: ManifestSectionType | 'sync' | 'backup' | ((pct: number, step?: string) => void),
    backupModeOrProgress?: 'sync' | 'backup' | ((pct: number, step?: string) => void),
    maybeProgress?: (pct: number, step?: string) => void
  ) => {
    let activeKey = syncChannelKey;
    let activeSection: ManifestSectionType = 'ALL';
    let mode: 'sync' | 'backup' = 'sync';
    let callerOnProgress: ((pct: number, step?: string) => void) | undefined;

    if (typeof maybeProgress === 'function') {
      callerOnProgress = maybeProgress;
    } else if (typeof backupModeOrProgress === 'function') {
      callerOnProgress = backupModeOrProgress;
    } else if (typeof maybeSectionOrMode === 'function') {
      callerOnProgress = maybeSectionOrMode;
    }

    if (channelKeyOverrideOrSection === 'P' || channelKeyOverrideOrSection === 'PD' || channelKeyOverrideOrSection === 'ALL') {
      activeSection = channelKeyOverrideOrSection;
      if (maybeSectionOrMode === 'backup' || maybeSectionOrMode === 'sync') {
        mode = maybeSectionOrMode;
      }
    } else if (typeof channelKeyOverrideOrSection === 'string' && channelKeyOverrideOrSection.trim()) {
      activeKey = channelKeyOverrideOrSection.trim();
      if (maybeSectionOrMode === 'P' || maybeSectionOrMode === 'PD' || maybeSectionOrMode === 'ALL') {
        activeSection = maybeSectionOrMode;
      }
      if (backupModeOrProgress === 'backup' || backupModeOrProgress === 'sync') {
        mode = backupModeOrProgress;
      }
    }

    const reportProgress = (pct: number, step?: string) => {
      callerOnProgress?.(pct, step);
      setCloudQuickOpProgress({
        mode,
        percent: Math.min(100, Math.max(0, pct)),
        stageText: step || (mode === 'backup' ? 'Backing up...' : 'Syncing...'),
      });
    };

    setCloudMeta(prev => ({ ...prev, status: 'syncing' }));
    setIsCloudLoading(true);
    reportProgress(10, mode === 'backup' ? 'Preparing Cloud Backup...' : 'Connecting to Cloud Vault...');
    try {
      let createdBackup: CloudBackupFile | null = null;
      // If mode is backup, also auto-save a full cloud snapshot archive behind the scenes (including P+D Doc edits!)
      if (mode === 'backup') {
        reportProgress(20, 'Creating cloud backup snapshot...');
        const now = new Date();
        const autoName = `Cloud Backup ${now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        try {
          createdBackup = await createCloudBackup({
            name: autoName,
            description: `Full cloud backup (${activeSection}) containing ${history.length} manifest(s), ${manualDocEntries.length} doc entry(ies), and ${folders.length} folder(s)`,
            sectionType: activeSection,
            channelKey: activeKey,
            manifests: history,
            folders,
            globalConfig,
            finalBillOverrides,
            manualDocEntries,
            appTheme,
            appScale,
            appZoom,
          });
          if (createdBackup) {
            setCloudBackups(prev => [createdBackup!, ...prev.filter(b => b.id !== createdBackup!.id)]);
          }
        } catch (archiveErr) {
          console.warn("Auto backup archive notice:", archiveErr);
        }
      }

      reportProgress(38, 'Cross-referencing Cloud Vault manifests & P+D Doc edits...');
      const result = await performFullSync(
        history,
        folders,
        globalConfig,
        activeKey,
        activeSection,
        (innerPct, stepText) => {
          // Scale 15-95% from performFullSync to 40-88% in overall flow
          const scaled = 38 + (innerPct * 0.50);
          reportProgress(scaled, stepText);
        },
        {
          localOverrides: finalBillOverrides,
          localManualDocEntries: manualDocEntries,
          syncMode: mode,
          deletedManualDocIds: Array.from(getDeletedManualDocIds()),
        }
      );

      reportProgress(89, 'Updating local storage & IDB...');
      saveHistory(result.mergedManifests);
      saveFolders(result.mergedFolders);
      setFinalBillOverrides(result.mergedOverrides);
      setManualDocEntries(result.mergedManualDocEntries);

      // Refresh cloud lists
      reportProgress(94, 'Refreshing cloud vault indexes...');
      const [backups, remoteManifests, pdState] = await Promise.all([
        listCloudBackups(activeKey),
        fetchCloudManifests(activeKey),
        fetchFinalPdState(activeKey),
      ]);
      const finalBackups = createdBackup && !backups.some(b => b.id === createdBackup!.id)
        ? [createdBackup, ...backups]
        : backups;
      setCloudBackups(finalBackups);
      setCloudOverrides(pdState.finalBillOverrides || result.mergedOverrides || {});
      setCloudManualDocEntries(pdState.manualDocEntries || result.mergedManualDocEntries || []);

      // Ensure remote manifests also includes our newly merged manifests so Cloud Vault immediately reflects them
      const finalCloudManifests = remoteManifests.length > 0
        ? remoteManifests
        : (result.uploadedCount > 0 || mode === 'backup' ? result.mergedManifests : []);
      setCloudManifests(finalCloudManifests);

      reportProgress(100, mode === 'backup' ? '✓ Backup Complete!' : '✓ Sync Complete!');
      await new Promise(r => setTimeout(r, 600));

      const sectionTag = activeSection === 'P' ? 'P Manifest' : activeSection === 'PD' ? 'P + D Manifest' : 'Full Workspace';
      const dupsTag = result.duplicatesFilteredCount > 0 ? ` (${result.duplicatesFilteredCount} duplicates filtered)` : '';
      const actionTitle = mode === 'backup' ? 'Backup & Sync' : 'Sync';

      const newMeta: CloudSyncMeta = {
        lastSyncTimestamp: result.syncTimestamp,
        autoSyncEnabled: cloudMeta.autoSyncEnabled,
        isOnline: true,
        status: 'success',
        lastSyncMessage: `${sectionTag} ${actionTitle}: ${result.uploadedCount} uploaded, ${result.downloadedCount} downloaded${dupsTag}`,
      };
      setCloudMeta(newMeta);
      localStorage.setItem(CLOUD_META_KEY, JSON.stringify(newMeta));

      setStatus({
        type: 'success',
        message: `${sectionTag} Cloud ${actionTitle} complete! (${result.uploadedCount} uploaded to Cloud Vault, ${result.downloadedCount} downloaded${dupsTag})`,
      });
    } catch (err: any) {
      if (checkIsOfflineError(err) || (typeof navigator !== 'undefined' && !navigator.onLine)) {
        setCloudMeta(prev => ({
          ...prev,
          isOnline: false,
          status: 'idle',
          lastSyncMessage: 'Offline mode: Changes preserved in local storage',
        }));
        setStatus({
          type: 'info',
          message: 'Operating in offline mode. Records are safely stored locally and will sync automatically when internet is restored.',
        });
      } else {
        console.warn("Sync notice:", err);
        setCloudMeta(prev => ({
          ...prev,
          status: 'error',
          lastSyncMessage: err?.message || 'Sync standby',
        }));
        setStatus({ type: 'error', message: `Cloud sync notice: ${err?.message || 'Failed to sync'}` });
      }
    } finally {
      setIsCloudLoading(false);
      setCloudQuickOpProgress(null);
    }
  };

  // Folder Actions
  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return;
    const newFolder: Folder = { id: crypto.randomUUID(), name: newFolderName, createdAt: Date.now() };
    saveFolders([...folders, newFolder]);
    setNewFolderName('');
    setIsCreateFolderOpen(false);
  };

  const handleRenameFolder = (id: string, newName: string) => {
    saveFolders(folders.map(f => f.id === id ? { ...f, name: newName } : f));
    setEditingFolderId(null);
  };

  // Trigger delete pop-ups (moving to Recycle Bin)
  const promptDeleteManifest = (e: React.MouseEvent, manifest: ManifestHistory) => {
    e.stopPropagation();
    setDeleteConfirmTarget({
      itemType: 'manifest',
      id: manifest.id,
      name: manifest.manifestNo || 'Untitled Manifest',
      date: manifest.manifestDate,
      count: manifest.itemCount,
      amount: manifest.totalAmount,
    });
  };

  const promptDeleteFolder = (e: React.MouseEvent, folder: Folder) => {
    e.stopPropagation();
    const folderManifests = history.filter(h => h.folderId === folder.id);
    const folderAmount = folderManifests.reduce((sum, h) => sum + (h.totalAmount || 0), 0);
    setDeleteConfirmTarget({
      itemType: 'folder',
      id: folder.id,
      name: folder.name,
      count: folderManifests.length,
      amount: folderAmount,
    });
  };

  const handleDeleteFolder = (id: string) => {
    const folder = folders.find(f => f.id === id);
    if (folder) {
      const folderManifests = history.filter(h => h.folderId === folder.id);
      const folderAmount = folderManifests.reduce((sum, h) => sum + (h.totalAmount || 0), 0);
      setDeleteConfirmTarget({
        itemType: 'folder',
        id: folder.id,
        name: folder.name,
        count: folderManifests.length,
        amount: folderAmount,
      });
    }
  };

  // Move confirmed item to Recycle Bin
  const executeMoveToRecycleBin = () => {
    if (!deleteConfirmTarget) return;

    if (deleteConfirmTarget.itemType === 'manifest') {
      const manifest = history.find(h => h.id === deleteConfirmTarget.id);
      if (manifest) {
        const binItem: RecycleBinItem = {
          id: crypto.randomUUID(),
          originalId: manifest.id,
          itemType: 'manifest',
          name: manifest.manifestNo || 'Untitled Manifest',
          deletedAt: Date.now(),
          manifestData: manifest,
          itemCount: manifest.itemCount,
          totalAmount: manifest.totalAmount,
        };
        // Record deleted manifest ID so it can never be resurrected by IDB or cloud sync
        recordDeletedManifestIds(manifest.id);
        saveRecycleBin([binItem, ...recycleBin]);
        const updatedHistory = history.filter(h => h.id !== manifest.id);
        saveHistory(updatedHistory);
        deleteManifestFromIDB(manifest.id);
        deleteManifestFromCloud(manifest.id).catch(() => {});

        if (activeManifestId === manifest.id) {
          setActiveManifestId(null);
          setRows([]);
        }
        setStatus({
          type: 'info',
          message: `Moved manifest "${binItem.name}" to Recycle Bin.`
        });
      }
    } else if (deleteConfirmTarget.itemType === 'folder') {
      const folder = folders.find(f => f.id === deleteConfirmTarget.id);
      if (folder) {
        const associated = history.filter(h => h.folderId === folder.id);
        const folderAmount = associated.reduce((sum, h) => sum + (h.totalAmount || 0), 0);
        const binItem: RecycleBinItem = {
          id: crypto.randomUUID(),
          originalId: folder.id,
          itemType: 'folder',
          name: folder.name,
          deletedAt: Date.now(),
          folderData: folder,
          associatedManifests: associated,
          itemCount: associated.length,
          totalAmount: folderAmount,
        };
        associated.forEach(m => {
          recordDeletedManifestIds(m.id);
          deleteManifestFromIDB(m.id);
          deleteManifestFromCloud(m.id).catch(() => {});
        });
        deleteFolderFromCloud(folder.id).catch(() => {});

        saveRecycleBin([binItem, ...recycleBin]);
        saveFolders(folders.filter(f => f.id !== folder.id));
        saveHistory(history.filter(h => h.folderId !== folder.id));
        if (currentFolderId === folder.id) setCurrentFolderId(null);
        setStatus({
          type: 'info',
          message: `Moved folder "${folder.name}" and ${associated.length} manifest(s) to Recycle Bin.`
        });
      }
    }

    setDeleteConfirmTarget(null);
  };

  // Restore single item
  const restoreBinItem = (item: RecycleBinItem) => {
    if (item.itemType === 'manifest' && item.manifestData) {
      unrecordDeletedManifestIds(item.originalId || item.id, item.manifestData.id);
      const folderStillExists = item.manifestData.folderId && folders.some(f => f.id === item.manifestData!.folderId);
      const manifestToRestore: ManifestHistory = {
        ...item.manifestData,
        folderId: folderStillExists ? item.manifestData.folderId : undefined
      };
      saveHistory([manifestToRestore, ...history.filter(h => h.id !== manifestToRestore.id)]);
      saveRecycleBin(recycleBin.filter(b => b.id !== item.id));
      setSelectedBinItemIds(prev => prev.filter(id => id !== item.id));
      if (cloudMeta.autoSyncEnabled && cloudMeta.isOnline) {
        syncManifestToCloud(manifestToRestore, syncChannelKey).catch(() => {});
      }
      setStatus({ type: 'success', message: `Restored manifest "${item.name}".` });
    } else if (item.itemType === 'folder' && item.folderData) {
      const folderToRestore = item.folderData;
      const associatedToRestore = item.associatedManifests || [];
      const restoredIds: string[] = [item.originalId || item.id, folderToRestore.id];
      associatedToRestore.forEach(m => restoredIds.push(m.id));
      unrecordDeletedManifestIds(...restoredIds);

      const updatedFolders = folders.some(f => f.id === folderToRestore.id)
        ? folders
        : [...folders, folderToRestore];
      saveFolders(updatedFolders);
      saveHistory([...history.filter(h => !associatedToRestore.some(m => m.id === h.id)), ...associatedToRestore]);
      saveRecycleBin(recycleBin.filter(b => b.id !== item.id));
      setSelectedBinItemIds(prev => prev.filter(id => id !== item.id));
      if (cloudMeta.autoSyncEnabled && cloudMeta.isOnline) {
        associatedToRestore.forEach(m => syncManifestToCloud(m, syncChannelKey).catch(() => {}));
      }
      setStatus({ type: 'success', message: `Restored folder "${item.name}" and ${associatedToRestore.length} manifest(s).` });
    }
  };

  // Restore selected items
  const restoreSelectedBinItems = () => {
    if (selectedBinItemIds.length === 0) return;
    const itemsToRestore = recycleBin.filter(b => selectedBinItemIds.includes(b.id));

    const restoredIds: string[] = [];
    itemsToRestore.forEach(item => {
      if (item.originalId) restoredIds.push(item.originalId);
      if (item.id) restoredIds.push(item.id);
      if (item.manifestData?.id) restoredIds.push(item.manifestData.id);
      if (item.folderData?.id) restoredIds.push(item.folderData.id);
      if (item.associatedManifests) item.associatedManifests.forEach(m => restoredIds.push(m.id));
    });
    unrecordDeletedManifestIds(...restoredIds);

    let updatedFolders = [...folders];
    let updatedHistory = [...history];

    itemsToRestore.forEach(item => {
      if (item.itemType === 'folder' && item.folderData) {
        if (!updatedFolders.some(f => f.id === item.folderData!.id)) {
          updatedFolders.push(item.folderData);
        }
        if (item.associatedManifests) {
          item.associatedManifests.forEach(m => {
            if (!updatedHistory.some(h => h.id === m.id)) {
              updatedHistory.unshift(m);
            }
          });
        }
      } else if (item.itemType === 'manifest' && item.manifestData) {
        const folderExists = item.manifestData.folderId && updatedFolders.some(f => f.id === item.manifestData!.folderId);
        const restoredM: ManifestHistory = {
          ...item.manifestData,
          folderId: folderExists ? item.manifestData.folderId : undefined
        };
        if (!updatedHistory.some(h => h.id === restoredM.id)) {
          updatedHistory.unshift(restoredM);
        }
      }
    });

    saveFolders(updatedFolders);
    saveHistory(updatedHistory);
    saveRecycleBin(recycleBin.filter(b => !selectedBinItemIds.includes(b.id)));
    setSelectedBinItemIds([]);
    setStatus({ type: 'success', message: `Restored ${itemsToRestore.length} item(s) to workspace.` });
  };

  // Restore all items
  const restoreAllBinItems = () => {
    if (recycleBin.length === 0) return;
    const allRestoredIds: string[] = [];
    recycleBin.forEach(item => {
      if (item.originalId) allRestoredIds.push(item.originalId);
      if (item.id) allRestoredIds.push(item.id);
      if (item.manifestData?.id) allRestoredIds.push(item.manifestData.id);
      if (item.folderData?.id) allRestoredIds.push(item.folderData.id);
      if (item.associatedManifests) item.associatedManifests.forEach(m => allRestoredIds.push(m.id));
    });
    unrecordDeletedManifestIds(...allRestoredIds);

    let updatedFolders = [...folders];
    let updatedHistory = [...history];

    recycleBin.forEach(item => {
      if (item.itemType === 'folder' && item.folderData) {
        if (!updatedFolders.some(f => f.id === item.folderData!.id)) {
          updatedFolders.push(item.folderData);
        }
        if (item.associatedManifests) {
          item.associatedManifests.forEach(m => {
            if (!updatedHistory.some(h => h.id === m.id)) {
              updatedHistory.unshift(m);
            }
          });
        }
      } else if (item.itemType === 'manifest' && item.manifestData) {
        const folderExists = item.manifestData.folderId && updatedFolders.some(f => f.id === item.manifestData!.folderId);
        const restoredM: ManifestHistory = {
          ...item.manifestData,
          folderId: folderExists ? item.manifestData.folderId : undefined
        };
        if (!updatedHistory.some(h => h.id === restoredM.id)) {
          updatedHistory.unshift(restoredM);
        }
      }
    });

    saveFolders(updatedFolders);
    saveHistory(updatedHistory);
    saveRecycleBin([]);
    setSelectedBinItemIds([]);
    setStatus({ type: 'success', message: `Restored all items from Recycle Bin.` });
  };

  // Permanent clear prompts (requiring user to enter "Clear")
  const promptClearAll = () => {
    if (recycleBin.length === 0) return;
    setPermanentClearTarget({ mode: 'all', count: recycleBin.length });
    setClearConfirmationText('');
  };

  const promptClearSelected = () => {
    if (selectedBinItemIds.length === 0) return;
    setPermanentClearTarget({ mode: 'selected', count: selectedBinItemIds.length });
    setClearConfirmationText('');
  };

  const promptClearSingle = (item: RecycleBinItem) => {
    setPermanentClearTarget({ mode: 'single', targetId: item.id, count: 1, name: item.name });
    setClearConfirmationText('');
  };

  const executePermanentClear = () => {
    if (!permanentClearTarget) return;
    if (clearConfirmationText.trim().toLowerCase() !== 'clear') return;

    if (permanentClearTarget.mode === 'all') {
      recycleBin.forEach(item => {
        if (item.itemType === 'manifest') {
          const targetId = item.manifestData?.id || item.originalId || item.id;
          deleteManifestFromIDB(targetId);
          deleteManifestFromCloud(targetId).catch(() => {});
        } else if (item.itemType === 'folder') {
          if (item.associatedManifests) {
            item.associatedManifests.forEach(m => {
              deleteManifestFromIDB(m.id);
              deleteManifestFromCloud(m.id).catch(() => {});
            });
          }
          if (item.folderData) {
            deleteFolderFromCloud(item.folderData.id).catch(() => {});
          }
        }
      });
      saveRecycleBin([]);
      setSelectedBinItemIds([]);
      setStatus({ type: 'info', message: 'Recycle Bin emptied permanently.' });
    } else if (permanentClearTarget.mode === 'selected') {
      const itemsToPurge = recycleBin.filter(b => selectedBinItemIds.includes(b.id));
      itemsToPurge.forEach(item => {
        if (item.itemType === 'manifest') {
          const targetId = item.manifestData?.id || item.originalId || item.id;
          deleteManifestFromIDB(targetId);
          deleteManifestFromCloud(targetId).catch(() => {});
        } else if (item.itemType === 'folder') {
          if (item.associatedManifests) {
            item.associatedManifests.forEach(m => {
              deleteManifestFromIDB(m.id);
              deleteManifestFromCloud(m.id).catch(() => {});
            });
          }
          if (item.folderData) {
            deleteFolderFromCloud(item.folderData.id).catch(() => {});
          }
        }
      });
      saveRecycleBin(recycleBin.filter(b => !selectedBinItemIds.includes(b.id)));
      setSelectedBinItemIds([]);
      setStatus({ type: 'info', message: `Permanently removed ${permanentClearTarget.count} selected item(s).` });
    } else if (permanentClearTarget.mode === 'single' && permanentClearTarget.targetId) {
      const itemToPurge = recycleBin.find(b => b.id === permanentClearTarget.targetId);
      if (itemToPurge) {
        if (itemToPurge.itemType === 'manifest') {
          const targetId = itemToPurge.manifestData?.id || itemToPurge.originalId || itemToPurge.id;
          deleteManifestFromIDB(targetId);
          deleteManifestFromCloud(targetId).catch(() => {});
        } else if (itemToPurge.itemType === 'folder') {
          if (itemToPurge.associatedManifests) {
            itemToPurge.associatedManifests.forEach(m => {
              deleteManifestFromIDB(m.id);
              deleteManifestFromCloud(m.id).catch(() => {});
            });
          }
          if (itemToPurge.folderData) {
            deleteFolderFromCloud(itemToPurge.folderData.id).catch(() => {});
          }
        }
      }
      saveRecycleBin(recycleBin.filter(b => b.id !== permanentClearTarget.targetId));
      setSelectedBinItemIds(prev => prev.filter(id => id !== permanentClearTarget.targetId));
      setStatus({ type: 'info', message: `Permanently removed "${permanentClearTarget.name || 'item'}".` });
    }

    setPermanentClearTarget(null);
    setClearConfirmationText('');
  };

  const handleMoveManifest = (manifestId: string, folderId: string | null) => {
    saveHistory(history.map(h => h.id === manifestId ? { ...h, folderId: folderId || undefined } : h));
    setManifestToMoveId(null);
    setShowInlineNewFolderInput(false);
    setInlineNewFolderName('');
    setStatus({ type: 'success', message: 'Manifest moved successfully.' });
  };

  const handleCreateFolderAndMove = (manifestId: string) => {
    if (!inlineNewFolderName.trim()) return;
    const newFolder: Folder = { id: crypto.randomUUID(), name: inlineNewFolderName.trim(), createdAt: Date.now() };
    const updatedFolders = [...folders, newFolder];
    saveFolders(updatedFolders);
    handleMoveManifest(manifestId, newFolder.id);
  };

  const handleDuplicateManifest = (manifest: ManifestHistory) => {
    const copy: ManifestHistory = {
      ...manifest,
      id: crypto.randomUUID(),
      manifestNo: `${manifest.manifestNo}-COPY`,
      createdAt: Date.now()
    };
    saveHistory([copy, ...history]);
    setManifestToMoveId(null);
    setStatus({
      type: 'success',
      message: `Created duplicate copy "${copy.manifestNo}".`
    });
  };

  const handleExportSingleManifestJson = async (manifest: ManifestHistory) => {
    const fileName = `Manifest_${manifest.manifestNo.replace(/[^a-z0-9]/gi, '_')}.json`;
    try {
      const res = await exportAndShareFile({
        fileName,
        data: JSON.stringify(manifest, null, 2),
        mimeType: 'application/json',
        dialogTitle: `Share ${fileName}`,
      });
      setManifestToMoveId(null);
      if (!res.cancelled) {
        setStatus({
          type: 'success',
          message: res.nativeShare
            ? `Ready to share JSON for "${manifest.manifestNo}".`
            : `Exported JSON for "${manifest.manifestNo}".`,
        });
      }
    } catch (err) {
      console.error('JSON export failed:', err);
      setStatus({ type: 'error', message: 'Failed to export manifest JSON.' });
    }
  };

  const handleSaveChunkSize = (size: number) => {
    const validSize = Math.max(4, Math.min(100, size));
    setChunkRowsPerPage(validSize);
    localStorage.setItem('smartbilling_chunk_rows_per_page', validSize.toString());
    setStatus({
      type: 'success',
      message: `Statement chunk size updated to ${validSize} rows per page.`
    });
  };

  const handleSplitManifest = (manifestId: string, batchSize: number) => {
    const manifest = history.find(h => h.id === manifestId);
    if (!manifest || manifest.rows.length === 0) {
      alert("Please select a manifest with line items to split.");
      return;
    }
    if (manifest.rows.length <= batchSize) {
      alert(`This manifest has ${manifest.rows.length} rows, which is already ≤ batch size of ${batchSize}.`);
      return;
    }

    const totalChunks = Math.ceil(manifest.rows.length / batchSize);
    const newManifests: ManifestHistory[] = [];

    for (let i = 0; i < totalChunks; i++) {
      const start = i * batchSize;
      const end = start + batchSize;
      const chunkRows = manifest.rows.slice(start, end).map((r, idx) => ({
        ...r,
        slNo: idx + 1
      }));
      
      const chunkTotalAmount = chunkRows.reduce((s, r) => s + r.amount, 0);

      newManifests.push({
        id: crypto.randomUUID(),
        manifestNo: `${manifest.manifestNo}-Part${i + 1}`,
        manifestDate: manifest.manifestDate,
        rows: chunkRows,
        config: manifest.config,
        totalAmount: chunkTotalAmount,
        itemCount: chunkRows.length,
        createdAt: Date.now() + i,
        folderId: manifest.folderId
      });
    }

    // Add new chunks to history
    saveHistory([...newManifests, ...history]);
    setStatus({
      type: 'success',
      message: `Manifest "${manifest.manifestNo}" split into ${totalChunks} balanced batches.`
    });
    setIsChunkingModalOpen(false);
  };

  // --- FOLDER EXPORT FEATURE ---
  const exportFolderToZip = async (folderId: string) => {
    const folder = folders.find(f => f.id === folderId);
    if (!folder) return;

    const manifestsToExport = history.filter(h => h.folderId === folderId);
    
    if (manifestsToExport.length === 0) {
      alert("Folder is empty. Nothing to export.");
      return;
    }

    setLoadingMessage("Compressing folder...");
    setIsUploading(true);

    try {
      const zip = new JSZip();
      
      // Add Metadata
      const metadata = {
        folderName: folder.name,
        createdDate: new Date().toLocaleDateString(),
        createdTime: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
        totalManifests: manifestsToExport.length,
        version: "2.0"
      };
      zip.file("folder_info.json", JSON.stringify(metadata, null, 2));

      // Add Manifests
      manifestsToExport.forEach(manifest => {
        // Sanitize filename
        const safeName = manifest.manifestNo.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        zip.file(`${safeName}.json`, JSON.stringify(manifest, null, 2));
      });

      const content = await zip.generateAsync({ type: "blob" });
      const res = await exportAndShareFile({
        fileName: `${folder.name}_export.zip`,
        data: content,
        mimeType: 'application/zip',
        dialogTitle: `Share ${folder.name} Archive`,
      });
      setIsFolderExportOpen(false);
      if (!res.cancelled) {
        setStatus({
          type: 'success',
          message: res.nativeShare ? 'Folder archive ready to share or save.' : 'Folder exported successfully.',
        });
      }
    } catch (error) {
      console.error("Export failed", error);
      setStatus({ type: 'error', message: 'Export failed.' });
    } finally {
      setIsUploading(false);
    }
  };

  // --- BULK IMPORT HELPERS ---
  const processImportedManifest = (content: any, targetFolderId: string): BulkImportStatus => {
    try {
      if (!content.rows || !Array.isArray(content.rows)) {
        return { fileName: content.manifestNo || 'Unknown', status: 'error', message: 'Invalid format' };
      }

      // Check duplicates
      const exists = history.some(h => h.manifestNo === content.manifestNo);
      if (exists) {
        return { fileName: content.manifestNo, status: 'warning', message: 'Duplicate skipped' };
      }

      // Recalculate to ensure data integrity with current (or imported) config
      const configToUse = content.config || globalConfig;
      const rowsWithCalculations = content.rows.map((r: any) => calculateRow(r, configToUse));
      
      const newManifest: ManifestHistory = {
        id: crypto.randomUUID(),
        manifestNo: content.manifestNo || `IMP-${Date.now()}`,
        manifestDate: content.manifestDate || new Date().toLocaleDateString(),
        rows: rowsWithCalculations,
        config: configToUse,
        totalAmount: rowsWithCalculations.reduce((sum: number, r: any) => sum + r.amount, 0),
        itemCount: rowsWithCalculations.length,
        createdAt: Date.now(),
        folderId: targetFolderId
      };

      setHistory(prev => [newManifest, ...prev]);
      return { fileName: newManifest.manifestNo, status: 'success', message: 'Imported' };

    } catch (e) {
      return { fileName: 'Unknown File', status: 'error', message: 'Parse error' };
    }
  };

  const handleZipImport = async (file: File) => {
    setIsUploading(true);
    setLoadingMessage("Unzipping & Validating...");
    setBulkImportResults([]);

    try {
      const zip = await JSZip.loadAsync(file);
      
      // Check for folder info
      let folderName = file.name.replace('.zip', '');
      const infoFile = zip.file("folder_info.json");
      if (infoFile) {
        const infoText = await infoFile.async("text");
        const info = JSON.parse(infoText);
        if (info.folderName) folderName = info.folderName;
      }

      // Create new folder
      const newFolderId = crypto.randomUUID();
      const newFolder: Folder = { id: newFolderId, name: folderName, createdAt: Date.now() };
      setFolders(prev => [...prev, newFolder]);
      saveFolders([...folders, newFolder]); // Persist immediately

      const results: BulkImportStatus[] = [];
      const files = Object.keys(zip.files).filter(filename => filename.endsWith('.json') && filename !== 'folder_info.json');

      for (const filename of files) {
        const fileData = await zip.file(filename)?.async("text");
        if (fileData) {
          try {
            const json = JSON.parse(fileData);
            const result = processImportedManifest(json, newFolderId);
            results.push(result);
          } catch (e) {
            results.push({ fileName: filename, status: 'error', message: 'JSON Parse Error' });
          }
        }
      }
      
      setBulkImportResults(results);
      saveHistory([...history]); // Trigger persistence of history updates done in processImportedManifest logic (requires refactor to batch update usually, but here react state batching helps)
      // Actually, processImportedManifest calls setHistory multiple times which is bad. 
      // Refactoring to batch update:
      
    } catch (e) {
      console.error(e);
      setStatus({ type: 'error', message: 'Failed to read ZIP file.' });
    } finally {
      setIsUploading(false);
    }
  };

  // Refactored Batch Import Logic
  const executeBatchImport = (manifests: ManifestHistory[]) => {
    setHistory(prev => {
        const updated = [...manifests, ...prev];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        return updated;
    });
  };

  const handleBulkJsonImport = async (files: FileList) => {
    if (files.length > 30) {
      alert("Maximum 30 files allowed at once.");
      return;
    }

    // Determine target folder
    let targetId = bulkImportFolderId;
    if (bulkImportFolderId === 'new') {
      if (!bulkImportNewFolderName.trim()) {
        alert("Please enter a folder name.");
        return;
      }
      targetId = crypto.randomUUID();
      const newFolder = { id: targetId, name: bulkImportNewFolderName, createdAt: Date.now() };
      setFolders(prev => [...prev, newFolder]);
      saveFolders([...folders, newFolder]);
    }

    setLoadingMessage("Processing Bulk Import...");
    setIsUploading(true);
    
    const results: BulkImportStatus[] = [];
    const newManifests: ManifestHistory[] = [];

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
            const text = await file.text();
            const json = JSON.parse(text);
            
            // Check duplicate in existing history AND in current batch
            const exists = history.some(h => h.manifestNo === json.manifestNo) || newManifests.some(h => h.manifestNo === json.manifestNo);
            
            if (exists) {
                results.push({ fileName: file.name, status: 'warning', message: 'Duplicate skipped' });
                continue;
            }

            if (!json.rows) {
                 results.push({ fileName: file.name, status: 'error', message: 'Invalid structure' });
                 continue;
            }

            const configToUse = json.config || globalConfig;
            const rowsWithCalculations = json.rows.map((r: any) => calculateRow(r, configToUse));
            
            newManifests.push({
                id: crypto.randomUUID(),
                manifestNo: json.manifestNo || `IMP-${Date.now()}-${i}`,
                manifestDate: json.manifestDate || new Date().toLocaleDateString(),
                rows: rowsWithCalculations,
                config: configToUse,
                totalAmount: rowsWithCalculations.reduce((sum: number, r: any) => sum + r.amount, 0),
                itemCount: rowsWithCalculations.length,
                createdAt: Date.now(),
                folderId: targetId
            });
            
            results.push({ fileName: file.name, status: 'success', message: 'Ready to import' });

        } catch (e) {
            results.push({ fileName: file.name, status: 'error', message: 'Read failed' });
        }
    }

    executeBatchImport(newManifests);
    setBulkImportResults(results);
    setIsUploading(false);
  };

  const handleZipImportRefactored = async (file: File) => {
      setIsUploading(true);
      setLoadingMessage("Unzipping...");
      setBulkImportResults([]);

      try {
          const zip = await JSZip.loadAsync(file);
          
          let folderName = file.name.replace(/\.zip$/i, '');
          const infoFile = zip.file("folder_info.json");
          if (infoFile) {
              const infoText = await infoFile.async("text");
              try {
                  const info = JSON.parse(infoText);
                  if (info.folderName) folderName = info.folderName;
              } catch(e) {}
          }

          const newFolderId = crypto.randomUUID();
          const newFolder: Folder = { id: newFolderId, name: folderName, createdAt: Date.now() };
          
          const newManifests: ManifestHistory[] = [];
          const results: BulkImportStatus[] = [];
          
          const files = Object.keys(zip.files).filter(name => name.toLowerCase().endsWith('.json') && !name.includes('folder_info'));

          for (const filename of files) {
              const content = await zip.file(filename)?.async("text");
              if (!content) continue;
              try {
                  const json = JSON.parse(content);
                  const exists = history.some(h => h.manifestNo === json.manifestNo) || newManifests.some(h => h.manifestNo === json.manifestNo);
                  if (exists) {
                      results.push({ fileName: filename, status: 'warning', message: 'Duplicate' });
                      continue;
                  }
                  
                  // Process
                  const configToUse = json.config || globalConfig;
                  const rows = (json.rows || []).map((r: any) => calculateRow(r, configToUse));
                  newManifests.push({
                      id: crypto.randomUUID(),
                      manifestNo: json.manifestNo,
                      manifestDate: json.manifestDate,
                      rows: rows,
                      config: configToUse,
                      totalAmount: rows.reduce((s:number, r:any) => s + r.amount, 0),
                      itemCount: rows.length,
                      createdAt: Date.now(),
                      folderId: newFolderId
                  });
                  results.push({ fileName: filename, status: 'success', message: 'Valid' });
              } catch (e) {
                  results.push({ fileName: filename, status: 'error', message: 'Corrupt' });
              }
          }

          if (newManifests.length > 0) {
              setFolders(prev => {
                  const updated = [...prev, newFolder];
                  saveFolders(updated);
                  return updated;
              });
              executeBatchImport(newManifests);
          }
          setBulkImportResults(results);

      } catch (e) {
          alert("Invalid ZIP file");
      } finally {
          setIsUploading(false);
      }
  };


  const addRow = () => {
    setRows(prevRows => {
      const lastRow = prevRows[prevRows.length - 1];

      // Serial Number (Sl.No / #): must always increase by one from the previous row's serial number
      const lastSlNo = lastRow ? Number(lastRow.slNo) : 0;
      const nextSlNo = (lastSlNo && !isNaN(lastSlNo) && lastSlNo > 0) ? lastSlNo + 1 : prevRows.length + 1;

      const newRowBase: Omit<BillingRow, 'rate' | 'amount' | 'breakdown'> = {
        id: crypto.randomUUID(),
        slNo: nextSlNo,
        serialNo: '', // AWB is not auto-incremented or pre-filled; provided by the user
        description: '',
        type: lastRow ? lastRow.type : ItemType.PARCEL,
        weight: 0,
        isManualRate: false
      };
      const newRow = calculateRow(newRowBase, config);
      const updated = [...prevRows, newRow];
      // Normalize serial numbers sequentially so that every row has an increasing index
      return updated.map((r, i) => ({ ...r, slNo: i + 1 }));
    });
  };

  const updateRow = (id: string, updates: Partial<BillingRow>) => {
    setRows(prevRows => prevRows.map(row => {
      if (row.id === id) {
        // If user is filling missing placeholder data, automatically resolve the missing status
        let isMissingPlaceholder = row.isMissingPlaceholder;
        if (isMissingPlaceholder) {
          const hasAwb = updates.serialNo !== undefined ? Boolean(updates.serialNo.trim()) : Boolean(row.serialNo.trim());
          const hasDesc = updates.description !== undefined ? Boolean(updates.description.trim()) : Boolean(row.description.trim());
          const hasWeight = updates.weight !== undefined ? updates.weight > 0 : row.weight > 0;
          if (hasAwb || hasDesc || hasWeight) {
            isMissingPlaceholder = false;
          }
        }
        return calculateRow({ ...row, ...updates, isMissingPlaceholder }, config);
      }
      return row;
    }));
  };

  const handleSlNoChange = (id: string, newSlNo: number) => {
    setRows(prevRows => prevRows.map(row => {
      if (row.id === id) {
        return { ...row, slNo: newSlNo };
      }
      return row;
    }));
  };

  const handleSlNoBlurOrEnter = () => {
    // When user updates serial no, auto rearrange into clean sequence from top to bottom
    setRows(prevRows => autoCorrectSequenceTopToBottom(prevRows));
    setStatus({
      type: 'info',
      message: 'Serial numbers auto-corrected and rearranged in sequence top to bottom.'
    });
  };

  const handleAutoCorrectSequence = () => {
    setRows(prevRows => autoCorrectSequenceTopToBottom(prevRows));
    setStatus({
      type: 'success',
      message: `All serial numbers rearranged and auto-corrected into sequence 1 to ${rows.length}.`
    });
  };

  const handleRemoveUnfilledMissingRows = () => {
    setRows(prevRows => {
      const filtered = prevRows.filter(r => !(r.isMissingPlaceholder && !r.serialNo.trim() && !r.description.trim() && r.weight === 0));
      return autoCorrectSequenceTopToBottom(filtered);
    });
    setStatus({
      type: 'info',
      message: 'Unfilled missing placeholder rows removed and sequence updated.'
    });
  };

  const handleScrollToFirstIssue = () => {
    const firstIssueEl = document.querySelector('.missing-row-blinking, .duplicate-col-red, [id^="row-"]');
    if (firstIssueEl) {
      firstIssueEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      const banner = document.getElementById('attention-required-diagnostic-center');
      if (banner) banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const handleJumpToRow = (rowId: string, fieldToFocus: 'awb' | 'weight' | 'slNo' = 'awb') => {
    setActiveTargetRowId(rowId);
    setActiveTargetField(fieldToFocus);

    const rowEl = document.getElementById(`row-${rowId}`);
    if (rowEl) {
      rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    setTimeout(() => {
      const inputEl = document.getElementById(`input-${fieldToFocus}-${rowId}`) as HTMLInputElement | null;
      if (inputEl) {
        inputEl.focus();
        if (typeof inputEl.select === 'function') {
          inputEl.select();
        }
      }
    }, 250);
  };

  const handleNextDiagnosticIssue = (diagnosticItems: DiagnosticItemSummary[]) => {
    if (!diagnosticItems || diagnosticItems.length === 0) return;
    const currentIndex = diagnosticItems.findIndex(item => item.rowId === activeTargetRowId);
    const nextIndex = (currentIndex + 1) % diagnosticItems.length;
    const nextItem = diagnosticItems[nextIndex];
    handleJumpToRow(nextItem.rowId, nextItem.fieldToFocus);
  };

  const handleAcceptAllInferred = () => {
    setRows(prevRows => prevRows.map(r => r.isInferred ? { ...r, isInferred: false, inferenceReason: undefined } : r));
    setStatus({
      type: 'success',
      message: 'All inferred OCR rows verified and accepted.'
    });
  };

  const handleRetryAiExtraction = async () => {
    if (!cachedExtractionPayloadRef.current) {
      setStatus({ type: 'error', message: 'No cached document frames found to retry. Please select images again.' });
      return;
    }

    setIsAiRetrying(true);
    setIsUploading(true);
    setLoadingMessage('Retrying extraction with cached document frames...');

    try {
      const { inputs } = cachedExtractionPayloadRef.current;
      const result = await extractManifestWithFallback(
        inputs,
        globalConfig,
        customApiKey || undefined,
        (statusMsg) => setLoadingMessage(statusMsg),
        undefined,
        extractionModelPref
      );

      const calculatedRows = result.rows;
      const meta = {
        manifestNo: result.manifestNo || `MF-${Math.floor(Math.random() * 90000) + 10000}`,
        manifestDate: result.manifestDate || new Date().toLocaleDateString()
      };

      const newCandidate: ManifestHistory = {
        id: crypto.randomUUID(),
        manifestNo: meta.manifestNo,
        manifestDate: meta.manifestDate,
        rows: calculatedRows,
        config: globalConfig,
        totalAmount: result.totalAmount || calculatedRows.reduce((sum: number, r: any) => sum + r.amount, 0),
        itemCount: calculatedRows.length,
        createdAt: Date.now()
      };

      setRows(calculatedRows);
      setManifestMeta(meta);
      setErrors(result.errors || []);
      setConfig(globalConfig);
      const newId = autoSaveManifest(calculatedRows, meta, globalConfig);
      setActiveManifestId(newId);

      setIsAiExtractionErrorModalOpen(false);
      setAiExtractionDiagnostic(null);
      setIsUploading(false);
      setIsAiRetrying(false);

      setStatus({
        type: 'success',
        message: `Extraction successful on retry using ${result.modelUsed}!`
      });

      setCompletedAiResult({
        manifestNo: meta.manifestNo,
        itemCount: calculatedRows.length,
        totalAmount: newCandidate.totalAmount,
        manifestId: newId
      });

      setView('billing');
    } catch (err: any) {
      console.error('Retry extraction failed:', err);
      setIsAiRetrying(false);
      setIsUploading(false);

      const activePrimaryModel = extractionModelPref.selectedModels[0] || 'gemini-3.6-flash';
      if (err?.diagnostic) {
        setAiExtractionDiagnostic(err.diagnostic);
      } else {
        setAiExtractionDiagnostic({
          timestamp: Date.now(),
          primaryModel: activePrimaryModel,
          overallReason: err?.message || 'Extraction retry failed.',
          failureCategory: 'document_error',
          friendlyFailureReason: err?.message || 'Retry attempt was unsuccessful.',
          actionAdvice: 'Verify your API key or network connection, or try entering data manually.',
          fallbackProtocolTrace: [],
          cachedFramesCount: cachedExtractionPayloadRef.current?.inputs.length || 1,
          canRetry: true,
        });
      }
      setIsAiExtractionErrorModalOpen(true);
    }
  };

  const deleteRow = (id: string) => {
    setRows(prevRows => {
      const filtered = prevRows.filter(row => row.id !== id);
      return filtered.map((row, index) => ({ ...row, slNo: index + 1 }));
    });
  };

  const handleConfirmDeleteRow = () => {
    if (!rowToDelete) return;
    const targetId = rowToDelete.id;
    const targetRef = rowToDelete.serialNo ? `AWB "${rowToDelete.serialNo}"` : `Row #${rowToDelete.slNo}`;
    deleteRow(targetId);
    setStatus({
      type: 'success',
      message: `${targetRef} deleted successfully. Line items re-sequenced.`
    });
    setRowToDelete(null);
  };

  const applyGlobalType = (type: ItemType) => {
    setRows(prevRows => prevRows.map(row => calculateRow({ ...row, type }, config)));
  };

  const saveManifest = () => {
    const existing = activeManifestId ? history.find(h => h.id === activeManifestId) : undefined;
    const now = Date.now();
    const manifestData: ManifestHistory = {
      id: activeManifestId || crypto.randomUUID(),
      manifestNo: manifestMeta.manifestNo,
      manifestDate: manifestMeta.manifestDate,
      rows,
      config,
      totalAmount,
      itemCount: rows.length,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      folderId: currentFolderId || existing?.folderId || undefined
    };

    let newHistory;
    if (activeManifestId && existing) {
      newHistory = history.map(h => h.id === activeManifestId ? manifestData : h);
    } else {
      newHistory = [manifestData, ...history];
    }
    
    saveHistory(newHistory);
    setActiveManifestId(manifestData.id);
    setStatus({ type: 'success', message: 'Manifest saved successfully.' });
    if (cloudMeta.autoSyncEnabled && cloudMeta.isOnline) {
      syncManifestToCloud(manifestData, syncChannelKey, finalBillOverrides[manifestData.id]).catch(e => {
        if (!checkIsOfflineError(e)) {
          console.warn("Auto-sync notice:", e);
        }
      });
    }
  };

  const autoSaveManifest = (newRows: BillingRow[], meta: ManifestMetadata, currentConfig: BillingConfig) => {
    const newId = crypto.randomUUID();
    const manifestData: ManifestHistory = {
      id: newId,
      manifestNo: meta.manifestNo,
      manifestDate: meta.manifestDate,
      rows: newRows,
      config: currentConfig,
      totalAmount: newRows.reduce((sum, r) => sum + r.amount, 0),
      itemCount: newRows.length,
      createdAt: Date.now(),
      folderId: currentFolderId || undefined
    };
    const newHistory = [manifestData, ...history];
    saveHistory(newHistory);
    setActiveManifestId(newId);
    if (cloudMeta.autoSyncEnabled && cloudMeta.isOnline) {
      syncManifestToCloud(manifestData, syncChannelKey).catch(e => {
        if (!checkIsOfflineError(e)) {
          console.warn("Auto-sync notice:", e);
        }
      });
    }
    return newId;
  };

  const startBlankSession = () => {
    setActiveManifestId(null); setRows([]); setConfig(globalConfig); // Use global config for new sessions
    setManifestMeta({ manifestNo: '', manifestDate: '' }); setView('billing');
  };

  const openManifestFromHistory = (manifest: ManifestHistory) => {
    setActiveManifestId(manifest.id); setRows(manifest.rows); setConfig(manifest.config);
    setManifestMeta({ manifestNo: manifest.manifestNo, manifestDate: manifest.manifestDate }); setView('billing');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resolveConflict = (action: 'keep_both' | 'override' | 'discard') => {
    if (!importConflict) return;
    const { existing, newCandidate } = importConflict;

    if (action === 'discard') {
      setStatus({ type: 'info', message: 'Import cancelled by user.' });
    } else if (action === 'keep_both') {
      const candidateToSave = { ...newCandidate, id: crypto.randomUUID() };
      saveHistory([candidateToSave, ...history]);
      setActiveManifestId(candidateToSave.id);
      setRows(candidateToSave.rows);
      setManifestMeta({ manifestNo: candidateToSave.manifestNo, manifestDate: candidateToSave.manifestDate });
      setConfig(candidateToSave.config);
      setView('billing');
      setStatus({ type: 'success', message: 'Imported as a new copy.' });
    } else if (action === 'override') {
      const newHistory = history.filter(h => h.id !== existing.id);
      const candidateToSave = { ...newCandidate, id: crypto.randomUUID() };
      saveHistory([candidateToSave, ...newHistory]);
      setActiveManifestId(candidateToSave.id);
      setRows(candidateToSave.rows);
      setManifestMeta({ manifestNo: candidateToSave.manifestNo, manifestDate: candidateToSave.manifestDate });
      setConfig(candidateToSave.config);
      setView('billing');
      setStatus({ type: 'success', message: 'Existing record overwritten.' });
    }

    setImportConflict(null);
    setIsUploadModalOpen(false);
  };

  // --- Upload Handlers ---

  const handleJsonFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = JSON.parse(e.target?.result as string);
        if (content.rows && Array.isArray(content.rows)) {
          const meta = {
            manifestNo: content.manifestNo || `MF-${Date.now().toString().slice(-6)}`,
            manifestDate: content.manifestDate || new Date().toLocaleDateString()
          };
          const configToUse = content.config || globalConfig; // Prefer file config, else global
          const reconciled = reconcileImportedRows(content.rows, configToUse);
          const rowsWithCalculations = reconciled.rows;
          
          const newCandidate: ManifestHistory = {
            id: crypto.randomUUID(),
            manifestNo: meta.manifestNo,
            manifestDate: meta.manifestDate,
            rows: rowsWithCalculations,
            config: configToUse,
            totalAmount: rowsWithCalculations.reduce((sum: number, r: any) => sum + r.amount, 0),
            itemCount: rowsWithCalculations.length,
            createdAt: Date.now()
          };

          const existing = history.find(h => h.manifestNo === newCandidate.manifestNo);
          if (existing) {
            setImportConflict({ existing, newCandidate });
            return;
          }

          setRows(rowsWithCalculations);
          setManifestMeta(meta);
          setConfig(configToUse);
          const newId = autoSaveManifest(rowsWithCalculations, meta, configToUse);
          setActiveManifestId(newId);
          setView('billing');
          const issueMsg = reconciled.missingCount > 0 || reconciled.duplicateSlNoCount > 0 || reconciled.duplicateAwbCount > 0
            ? ` JSON Manifest imported. ${reconciled.missingCount > 0 ? `${reconciled.missingCount} missing rows inserted in blinking red. ` : ''}${reconciled.duplicateSlNoCount > 0 ? 'Repeated serial numbers highlighted in red.' : ''}`
            : 'JSON Manifest imported and saved to history.';
          setStatus({ type: 'success', message: issueMsg });
          setIsUploadModalOpen(false);
        } else { throw new Error("Invalid structure"); }
      } catch (err) { setStatus({ type: 'error', message: 'Failed to parse JSON manifest.' }); }
    };
    reader.readAsText(file);
  };

  const processFilesWithAI = async (
    files: File[], 
    instruction: string, 
    activeSessionId?: string, 
    options?: { forceExpand?: boolean; silentBackground?: boolean }
  ) => {
    setIsUploading(true);
    // If extraction is triggered from Batch Engine, Chunking Modal, or silentBackground, guarantee minimized
    const isFromBatch = Boolean(activeSessionId || isChunkingModalOpen || isBackgroundBatchRunningRef.current || options?.silentBackground);
    if (isFromBatch) {
      setIsAiMinimized(true);
    } else if (options?.forceExpand) {
      setIsAiMinimized(false);
    }
    // Note: By default isAiMinimized remains true as per user design
    setLoadingMessage("Initializing production extraction engine...");
    setStatus({ type: 'info', message: 'AI Analysis initiated in background...' });
    setErrors([]);

    // Offline Handling: If currently offline, queue camera scans directly into IndexedDB
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      try {
        const queuedImages = await Promise.all(files.map(async (file, idx) => {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve((reader.result as string).split(',')[1]);
            reader.onerror = reject;
          });
          return {
            name: file.name || `page_${idx + 1}.jpg`,
            type: file.type || 'image/jpeg',
            base64
          };
        }));

        await queueOfflineScan({
          images: queuedImages,
          instruction,
          targetFolderId: currentFolderId,
        });

        if (activeSessionId) {
          await updateCapturedSession(activeSessionId, {
            status: 'ready',
            extractionError: 'Device offline. Scans queued in local IndexedDB.'
          });
        }

        setIsUploading(false);
        setIsUploadModalOpen(false);
        setStatus({
          type: 'info',
          message: `Offline mode: Saved ${files.length} document scan(s) in IndexedDB. Will auto-process with Gemini once online.`
        });
        return;
      } catch (queueErr) {
        console.error("Failed to queue offline scans:", queueErr);
      }
    }

    try {
      if (activeSessionId) {
        await updateCapturedSession(activeSessionId, { status: 'extracting', extractionError: undefined });
      }

      const inputs = await Promise.all(files.map(async (file) => {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.onerror = reject;
        });
        return { data: base64, mimeType: file.type || 'image/jpeg' };
      }));

      // Cache document frames in memory so user can 1-click retry without re-capturing
      cachedExtractionPayloadRef.current = { files, inputs, instruction };

      const abortController = new AbortController();
      activeAbortControllerRef.current = abortController;

      const result = await extractManifestWithFallback(
        inputs,
        globalConfig,
        customApiKey || undefined,
        (statusMsg) => setLoadingMessage(statusMsg),
        abortController.signal,
        extractionModelPref
      );

      const calculatedRows = result.rows;
      const meta = {
        manifestNo: result.manifestNo || `MF-${Math.floor(Math.random() * 90000) + 10000}`,
        manifestDate: result.manifestDate || new Date().toLocaleDateString()
      };

      const newCandidate: ManifestHistory = {
        id: crypto.randomUUID(),
        manifestNo: meta.manifestNo,
        manifestDate: meta.manifestDate,
        rows: calculatedRows,
        config: globalConfig,
        totalAmount: result.totalAmount || calculatedRows.reduce((sum: number, r: any) => sum + r.amount, 0),
        itemCount: calculatedRows.length,
        createdAt: Date.now()
      };

      const existing = history.find(h => h.manifestNo === newCandidate.manifestNo);
      if (existing) {
        setIsUploading(false);
        setIsAiMinimized(false);
        setImportConflict({ existing, newCandidate });
        if (activeSessionId) {
          await markSessionSuccess(activeSessionId, meta.manifestNo, existing.id);
        }
        return;
      }

      setRows(calculatedRows);
      setManifestMeta(meta);
      setErrors(result.errors || []);
      setConfig(globalConfig);
      const newId = autoSaveManifest(calculatedRows, meta, globalConfig);
      setActiveManifestId(newId);
      
      // Update session in local storage as successfully extracted
      if (activeSessionId) {
        await markSessionSuccess(activeSessionId, meta.manifestNo, newId);
      }

      let successMsg = `Manifest ${meta.manifestNo} extracted via ${result.modelUsed}.`;
      if (result.missingCount > 0 || result.duplicateCount > 0) {
        successMsg = `Manifest ${meta.manifestNo} extracted (${result.modelUsed}). ${result.missingCount > 0 ? `${result.missingCount} missing serial row(s) inserted. ` : ''}${result.duplicateCount > 0 ? 'Repeated serial numbers highlighted.' : ''}`;
      }
      setStatus({ type: 'success', message: successMsg });
      setIsUploading(false); 
      setIsUploadModalOpen(false);

      // Trigger friendly popup notification with direct jump to extracted data
      setCompletedAiResult({
        manifestNo: meta.manifestNo,
        itemCount: calculatedRows.length,
        totalAmount: newCandidate.totalAmount,
        manifestId: newId
      });

      // Only automatically switch to billing view if user was not in chunking engine, not in background batch, and not minimized
      if (!isAiMinimized && !activeSessionId && !isChunkingModalOpen && !isBackgroundBatchRunningRef.current) {
        setView('billing');
      }
    } catch (err: any) {
      console.error(err);
      setIsUploading(false);

      if (err?.name === 'AbortError' || activeAbortControllerRef.current?.signal?.aborted) {
        setLoadingMessage('');
        activeAbortControllerRef.current = null;
        if (activeSessionId) {
          try {
            await updateCapturedSession(activeSessionId, {
              status: 'failed',
              extractionError: 'Extraction stopped by user.'
            });
          } catch (e) {}
        }
        setStatus({ type: 'info', message: 'AI Extraction stopped by user.' });
        return;
      }

      const errorMsg = err?.message || 'AI document extraction failed.';
      const isApiKeyError = errorMsg.includes('API key') || errorMsg.includes('403') || errorMsg.includes('unauthorized');
      const isRateLimit = errorMsg.includes('429') || errorMsg.includes('quota') || errorMsg.includes('ResourceExhausted');
      const isNetworkTimeout = !navigator.onLine || errorMsg.includes('fetch') || errorMsg.includes('Network') || errorMsg.includes('timeout') || errorMsg.includes('offline');

      const shortFailureReason = isApiKeyError
        ? 'Gemini API key invalid or unconfigured'
        : isRateLimit
        ? 'Gemini API quota rate limit reached'
        : isNetworkTimeout
        ? 'Internet disconnected or network timeout'
        : errorMsg.length > 90
        ? errorMsg.substring(0, 87) + '...'
        : errorMsg;

      // Mark session as failed with short reason in local storage
      if (activeSessionId) {
        markSessionFailed(activeSessionId, shortFailureReason);
      }

      if (err?.diagnostic) {
        setAiExtractionDiagnostic(err.diagnostic);
      } else {
        if (isNetworkTimeout) {
          try {
            const queuedImages = files.map((file, idx) => ({
              name: file.name || `page_${idx + 1}.jpg`,
              type: file.type || 'image/jpeg',
              base64: cachedExtractionPayloadRef.current?.inputs?.[idx]?.data || ''
            })).filter(img => !!img.base64);

            if (queuedImages.length > 0) {
              queueOfflineScan({
                images: queuedImages,
                instruction,
                targetFolderId: currentFolderId
              });
              setStatus({
                type: 'info',
                message: `Network offline: ${queuedImages.length} scan(s) safely saved in IndexedDB. Will auto-process when internet reconnects.`
              });
            }
          } catch (e) {
            console.error("Failed to auto-queue on network error:", e);
          }
        }

        setAiExtractionDiagnostic({
          timestamp: Date.now(),
          primaryModel: 'gemini-3.6-flash',
          overallReason: errorMsg,
          failureCategory: isApiKeyError ? 'api_key_status' : isRateLimit ? 'rate_limits' : isNetworkTimeout ? 'network_timeout' : 'document_error',
          friendlyFailureReason: isApiKeyError 
            ? 'API key validation failed or key is missing.'
            : isRateLimit
              ? 'Gemini API requests temporarily exceeded quota.'
              : errorMsg,
          actionAdvice: isApiKeyError
            ? 'Open AI Settings to configure or verify your Google Gemini API key.'
            : isRateLimit
              ? 'Wait a few moments, or click Retry Extraction below.'
              : 'Try clicking Retry Extraction or ensure images are well-lit and legible.',
          fallbackProtocolTrace: [],
          cachedFramesCount: files.length,
          canRetry: true,
        });
      }
      setIsAiExtractionErrorModalOpen(true);
      setStatus({ type: 'error', message: `AI Extraction failed: ${err.message || 'Please check your API key or connection'}` });
    }
  };

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if(!file) return;
    
    if(file.type === 'application/json' || file.name.endsWith('.json')) {
       handleJsonFile(file);
       return;
    }

    if (file.size > 5 * 1024 * 1024) {
        alert("File size too large. Please keep under 5MB for optimal AI processing.");
        return;
    }
    setIsUploadModalOpen(false);
    await processFilesWithAI([file], "Extract billing data.");
  };

  const handleAddImageFiles = (files: FileList | File[] | null) => {
    if (!files) return;
    const incoming = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (incoming.length === 0) return;

    setStagedImages(prev => {
      const remainingSlots = 5 - prev.length;
      if (remainingSlots <= 0) {
        alert("Maximum 5 photos allowed at a time for one manifest.");
        return prev;
      }
      const toAdd = incoming.slice(0, remainingSlots).map(file => ({
        file,
        preview: URL.createObjectURL(file)
      }));
      if (incoming.length > remainingSlots) {
        alert(`Only ${remainingSlots} photo(s) could be added (maximum 5 photos per manifest).`);
      }
      return [...prev, ...toAdd];
    });
  };

  const handleRemoveStagedImage = (index: number) => {
    setStagedImages(prev => {
      const item = prev[index];
      if (item?.preview) {
        URL.revokeObjectURL(item.preview);
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  // Camera Survival Hook to survive mobile Android OS process kills & background termination
  const handleRestoredCameraPhoto = useCallback((photo: NativeCameraPhoto) => {
    setCameraMode('native');
    // Open PostCaptureCropper immediately with the photo returned from native camera intent
    setPostCaptureCropperState({
      isOpen: true,
      imageSrc: photo.preview,
      rawFile: photo.file,
      pageIndex: stagedImages.length + 1,
      captureMode: 'native',
    });
    setIsUploadModalOpen(true);
    setUploadTab('img');
  }, [stagedImages.length]);

  const handleRestoredSurvivalState = useCallback((state: RestoredSurvivalState) => {
    if (state.hasRestoredState) {
      if (state.restoredStagedImages && state.restoredStagedImages.length > 0) {
        setStagedImages(state.restoredStagedImages);
      }
      if (state.activeFolderId) {
        setCurrentFolderId(state.activeFolderId);
      }
      if (state.isUploadModalOpen) {
        setIsUploadModalOpen(true);
        setUploadTab('img');
      }
      if (state.pendingCropper) {
        setPostCaptureCropperState({
          isOpen: true,
          imageSrc: state.pendingCropper.preview,
          rawFile: state.pendingCropper.file,
          pageIndex: state.pendingCropper.pageIndex,
          replaceIndex: state.pendingCropper.replaceIndex,
        });
        setIsUploadModalOpen(true);
        setUploadTab('img');
      }
      setStatus({
        type: 'info',
        message: `Restored ${state.restoredStagedImages.length} manifest page(s) after camera session.`,
      });
    }
  }, []);

  const { saveBatch, markAwaitingCamera: flagAwaitingCamera, clearBatch } = useCameraSurvivalState({
    onRestoredState: handleRestoredSurvivalState,
    onRestoredCameraPhoto: handleRestoredCameraPhoto,
  });

  // Sync active batch and cropper state to IndexedDB to survive OS process kills
  useEffect(() => {
    if (stagedImages.length > 0 || postCaptureCropperState.isOpen) {
      saveBatch({
        stagedImages,
        activeFolderId: currentFolderId,
        isUploadModalOpen,
        pendingCropper: (postCaptureCropperState.isOpen && postCaptureCropperState.rawFile) ? {
          file: postCaptureCropperState.rawFile,
          pageIndex: postCaptureCropperState.pageIndex,
          replaceIndex: postCaptureCropperState.replaceIndex,
        } : null,
      });
    }
  }, [stagedImages, postCaptureCropperState, currentFolderId, isUploadModalOpen, saveBatch]);

  const handleClearStagedImages = () => {
    stagedImages.forEach(img => {
      if (img.preview && img.preview.startsWith('blob:')) {
        try { URL.revokeObjectURL(img.preview); } catch (e) {}
      }
    });
    setStagedImages([]);
    clearBatch();

    scannerCapturedPhotos.forEach(img => {
      if (img.preview && img.preview.startsWith('blob:')) {
        try { URL.revokeObjectURL(img.preview); } catch (e) {}
      }
    });
    setScannerCapturedPhotos([]);

    if (scannerPendingPhoto) {
      if (scannerPendingPhoto.preview && scannerPendingPhoto.preview.startsWith('blob:')) {
        try { URL.revokeObjectURL(scannerPendingPhoto.preview); } catch (e) {}
      }
      setScannerPendingPhoto(null);
    }

    if (galleryInputRef.current) galleryInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';

    if (postCaptureCropperState.isOpen) {
      if (postCaptureCropperState.imageSrc && postCaptureCropperState.imageSrc.startsWith('blob:')) {
        try { URL.revokeObjectURL(postCaptureCropperState.imageSrc); } catch (e) {}
      }
      setPostCaptureCropperState({
        isOpen: false,
        imageSrc: null,
        rawFile: null,
        pageIndex: 1,
      });
    }
  };

  const handleSaveToCapturedSessionsOnly = async () => {
    if (stagedImages.length === 0) return;
    const filesToProcess = stagedImages.map(img => img.file);
    stagedImages.forEach(img => {
      if (img.preview && img.preview.startsWith('blob:')) {
        try { URL.revokeObjectURL(img.preview); } catch (e) {}
      }
    });
    setStagedImages([]);
    await clearBatch();

    try {
      const session = await createCapturedSession(filesToProcess, {
        folderId: currentFolderId,
        initialStatus: 'ready'
      });
      setStatus({
        type: 'success',
        message: `Saved Session #${session.sessionNumber} (${filesToProcess.length} sequential pages) to Local Storage! You can now capture the next manifest.`
      });
    } catch (err: any) {
      setStatus({
        type: 'error',
        message: `Failed to save session to local storage: ${err.message || 'Unknown error'}`
      });
    }
  };

  const handleRetryExtractionFromVault = async (files: File[], session: CapturedManifestSession) => {
    setStatus({
      type: 'info',
      message: `Retrying AI extraction for Session #${session.sessionNumber} (${files.length} pages)...`
    });
    await processFilesWithAI(files, "Extract billing data from these images. Treat them as sequential pages of one manifest.", session.id);
  };

  const handleStopExtraction = async (sessionId?: string) => {
    if (activeAbortControllerRef.current) {
      try {
        activeAbortControllerRef.current.abort();
      } catch (e) {}
      activeAbortControllerRef.current = null;
    }
    setIsUploading(false);
    setLoadingMessage('');
    isBackgroundBatchRunningRef.current = false;
    
    const targetSessionId = sessionId || currentExtractingSessionId;
    if (targetSessionId) {
      try {
        await updateCapturedSession(targetSessionId, {
          status: 'failed',
          extractionError: 'Extraction stopped by user.'
        });
      } catch (e) {
        console.error("Failed to update session after stopping:", e);
      }
    }
    setCurrentExtractingSessionId(null);
    setStatus({ type: 'info', message: 'AI Extraction stopped.' });
  };

  // =========================================================================
  // CHUNKING & BATCH ENGINE: BACKGROUND ASYNCHRONOUS PROCESSING RUNNER
  // =========================================================================
  const triggerBackgroundBatchProcessing = useCallback(async () => {
    if (isBackgroundBatchRunningRef.current || isUploading) {
      return;
    }

    try {
      const allSessions = await getAllCapturedSessions();
      // Find oldest session with status 'queued'
      const nextSession = allSessions.find(s => s.status === 'queued');
      if (!nextSession) {
        return;
      }

      isBackgroundBatchRunningRef.current = true;
      setCurrentExtractingSessionId(nextSession.id);
      await markSessionExtracting(nextSession.id);

      const files = getSessionFiles(nextSession);
      if (files.length === 0) {
        await markSessionFailed(nextSession.id, "No valid image pages found in this chunk");
        isBackgroundBatchRunningRef.current = false;
        setCurrentExtractingSessionId(null);
        setTimeout(triggerBackgroundBatchProcessing, 500);
        return;
      }

      setStatus({
        type: 'info',
        message: `Batch Engine: Extracting ${nextSession.manifestName || `Chunk #${nextSession.sessionNumber}`} (${files.length} pages) in background...`
      });

      await processFilesWithAI(
        files,
        "Extract billing data from these images. Treat them as sequential pages of one manifest.",
        nextSession.id
      );
    } catch (err: any) {
      console.error("Batch processing runner error:", err);
    } finally {
      isBackgroundBatchRunningRef.current = false;
      setCurrentExtractingSessionId(null);
      // Auto-continue to next queued chunk in batch
      setTimeout(async () => {
        try {
          const remaining = await getAllCapturedSessions();
          if (remaining.some(s => s.status === 'queued')) {
            triggerBackgroundBatchProcessing();
          }
        } catch (e) {}
      }, 1000);
    }
  }, [isUploading]);

  const handleQueueChunkForBackgroundBatch = async (chunkName?: string, targetFolderId?: string | null) => {
    if (stagedImages.length === 0) return;
    const filesToProcess = stagedImages.map(img => img.file);
    stagedImages.forEach(img => {
      if (img.preview && img.preview.startsWith('blob:')) {
        try { URL.revokeObjectURL(img.preview); } catch (e) {}
      }
    });
    setStagedImages([]);
    await clearBatch();

    const session = await createCapturedSession(filesToProcess, {
      folderId: targetFolderId !== undefined ? targetFolderId : currentFolderId,
      manifestName: chunkName || `Chunk #${filesToProcess.length}P`,
      initialStatus: 'queued'
    });

    setStatus({
      type: 'success',
      message: `✓ ${session.manifestName} (${filesToProcess.length} pages) queued in Batch Engine! Camera is ready for next chunk.`
    });

    // Start background processor
    setTimeout(triggerBackgroundBatchProcessing, 400);
  };

  const handleRetrySessionInBatch = async (session: CapturedManifestSession) => {
    await markSessionQueued(session.id);
    setStatus({
      type: 'info',
      message: `Re-queued ${session.manifestName || `Chunk #${session.sessionNumber}`} for batch extraction.`
    });
    setTimeout(triggerBackgroundBatchProcessing, 400);
  };

  const handleProcessStagedImages = async () => {
    if (stagedImages.length === 0) return;
    const filesToProcess = stagedImages.map(img => img.file);
    stagedImages.forEach(img => {
      if (img.preview && img.preview.startsWith('blob:')) {
        try { URL.revokeObjectURL(img.preview); } catch (e) {}
      }
    });
    setStagedImages([]);
    await clearBatch();

    // If AI is busy with another manifest, save to Local Storage immediately so user can continue capturing without waiting!
    if (isUploading) {
      try {
        const session = await createCapturedSession(filesToProcess, {
          folderId: currentFolderId,
          initialStatus: 'ready'
        });
        setStatus({
          type: 'info',
          message: `AI is busy with a previous extraction. Safely saved this manifest (${filesToProcess.length} pages) as Session #${session.sessionNumber} in Local Storage! Capture the next manifest anytime.`
        });
      } catch (err) {
        console.warn("Failed to save to local storage while AI busy:", err);
      }
      return;
    }

    setIsUploadModalOpen(false);

    // Persist to Local Storage first before extraction starts, guaranteeing zero data loss
    let sessionId: string | undefined;
    try {
      const session = await createCapturedSession(filesToProcess, {
        folderId: currentFolderId,
        initialStatus: 'extracting'
      });
      sessionId = session.id;
    } catch (err) {
      console.warn("Could not pre-save captured session:", err);
    }

    await processFilesWithAI(filesToProcess, "Extract billing data from these images. Treat them as sequential pages of one manifest.", sessionId);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    handleAddImageFiles(files);
  };

  const handleBeforeCameraCapture = useCallback(async () => {
    await flagAwaitingCamera({
      stagedImages,
      activeFolderId: currentFolderId,
      isUploadModalOpen: true,
      pageIndex: stagedImages.length + 1,
    });
  }, [flagAwaitingCamera, stagedImages, currentFolderId]);

  // --- Ultra-Sharp In-App High-Res Camera Handlers ---
  const handleHighResPhotoCaptured = (photo: HighResInAppCameraPhoto) => {
    setIsHighResCameraOpen(false);
    if (stagedImages.length >= 5) {
      alert("Maximum 5 photos already selected for this manifest.");
      return;
    }
    setCameraMode('in-app');
    // Launch interactive cropper modal immediately on return with ultra-sharp capture
    setPostCaptureCropperState({
      isOpen: true,
      imageSrc: photo.preview,
      rawFile: photo.file,
      pageIndex: stagedImages.length + 1,
      captureMode: 'in-app',
    });
    if (!isChunkingModalOpen) {
      setIsUploadModalOpen(true);
      setUploadTab('img');
    }
  };

  // --- Native Camera Shutter & Post-Capture Cropper Handlers ---
  const handleNativePhotoCaptured = (photo: NativeCameraPhoto) => {
    if (stagedImages.length >= 5) {
      alert("Maximum 5 photos already selected for this manifest.");
      return;
    }
    setCameraMode('native');
    // Launch interactive cropper modal immediately on return
    setPostCaptureCropperState({
      isOpen: true,
      imageSrc: photo.preview,
      rawFile: photo.file,
      pageIndex: stagedImages.length + 1,
      captureMode: 'native',
    });
  };

  const handleConfirmCroppedPage = (rectifiedFile: File, rectifiedPreview: string, andNext: boolean) => {
    const replaceIdx = postCaptureCropperState.replaceIndex;
    const currentMode = postCaptureCropperState.captureMode || cameraMode || 'in-app';

    if (typeof replaceIdx === 'number' && replaceIdx >= 0 && replaceIdx < stagedImages.length) {
      // Replaced existing photo from re-crop
      setStagedImages(prev => {
        const updated = [...prev];
        if (updated[replaceIdx]?.preview?.startsWith('blob:')) {
          try { URL.revokeObjectURL(updated[replaceIdx].preview); } catch (e) {}
        }
        updated[replaceIdx] = { file: rectifiedFile, preview: rectifiedPreview };
        return updated;
      });
    } else {
      // Appended new consecutive page
      setStagedImages(prev => [...prev, { file: rectifiedFile, preview: rectifiedPreview }].slice(0, 5));
    }

    // Revoke previous uncropped raw photo blob to free device RAM immediately
    if (postCaptureCropperState.imageSrc && postCaptureCropperState.imageSrc.startsWith('blob:')) {
      try { URL.revokeObjectURL(postCaptureCropperState.imageSrc); } catch (e) {}
    }

    setPostCaptureCropperState({
      isOpen: false,
      imageSrc: null,
      rawFile: null,
      pageIndex: 1,
      captureMode: currentMode,
    });

    setStatus({
      type: 'success',
      message: `Page ${typeof replaceIdx === 'number' ? replaceIdx + 1 : stagedImages.length + 1} cropped & rectified in full HDR.`,
    });

    if (andNext && stagedImages.length + 1 < 5 && typeof replaceIdx !== 'number') {
      setTimeout(() => {
        if (currentMode === 'native') {
          nativeCameraRef.current?.trigger();
        } else {
          setIsHighResCameraOpen(true);
        }
      }, 300);
    }
  };

  const handleRetakePostCapture = () => {
    const currentMode = postCaptureCropperState.captureMode || cameraMode || 'in-app';
    if (postCaptureCropperState.imageSrc && postCaptureCropperState.imageSrc.startsWith('blob:')) {
      try { URL.revokeObjectURL(postCaptureCropperState.imageSrc); } catch (e) {}
    }
    setPostCaptureCropperState({
      isOpen: false,
      imageSrc: null,
      rawFile: null,
      pageIndex: 1,
      captureMode: currentMode,
    });
    setTimeout(() => {
      if (currentMode === 'native') {
        nativeCameraRef.current?.trigger();
      } else {
        setIsHighResCameraOpen(true);
      }
    }, 200);
  };

  const handleRecropStagedImage = (index: number) => {
    const item = stagedImages[index];
    if (!item) return;
    setPostCaptureCropperState({
      isOpen: true,
      imageSrc: item.preview,
      rawFile: item.file,
      pageIndex: index + 1,
      replaceIndex: index,
    });
  };

  // --- Sequential Camera Scanner & Auto-Crop Handlers ---
  const startCameraScanner = () => {
    if (stagedImages.length >= 5) {
      alert("Maximum 5 photos already selected for this manifest.");
      return;
    }
    // Launch live in-app camera scanner directly (zero OS reload risk)
    setIsDocumentCropScannerOpen(true);
  };

  const handleDocumentCropScannerComplete = (capturedPages: CapturedDocumentPage[]) => {
    setIsDocumentCropScannerOpen(false);
    if (!capturedPages || capturedPages.length === 0) return;

    // Convert captured rectified document pages directly to staged items
    const newStaged = capturedPages.map(page => ({
      file: page.file,
      preview: page.preview || (page as any).previewUrl || (page.file ? URL.createObjectURL(page.file) : '')
    }));

    // Append to existing staged images up to max 5
    setStagedImages(prev => {
      const combined = [...prev, ...newStaged].slice(0, 5);
      return combined;
    });

    if (!isChunkingModalOpen) {
      setIsUploadModalOpen(true);
      setUploadTab('img');
    }

    setStatus({
      type: 'success',
      message: `${capturedPages.length} document page(s) auto-cropped, rectified & ready for AI extraction.`
    });
  };

  const handleCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (scannerPendingPhoto) {
      URL.revokeObjectURL(scannerPendingPhoto.preview);
    }

    const preview = URL.createObjectURL(file);
    setScannerPendingPhoto({ file, preview });
    setIsScannerPhotoMaximized(false);
    setIsCameraScannerOpen(true);
    e.target.value = '';
  };

  const handleCameraRetake = () => {
    if (scannerPendingPhoto) {
      URL.revokeObjectURL(scannerPendingPhoto.preview);
      setScannerPendingPhoto(null);
    }
    cameraInputRef.current?.click();
  };

  const handleCameraSaveAndNext = () => {
    if (!scannerPendingPhoto) return;

    const nextList = [...scannerCapturedPhotos, scannerPendingPhoto];
    setScannerPendingPhoto(null);

    if (nextList.length >= 5) {
      setStagedImages(nextList);
      setScannerCapturedPhotos([]);
      setIsCameraScannerOpen(false);
    } else {
      setScannerCapturedPhotos(nextList);
      cameraInputRef.current?.click();
    }
  };

  const handleCameraScannerDone = () => {
    let finalPhotos = [...scannerCapturedPhotos];
    if (scannerPendingPhoto) {
      finalPhotos.push(scannerPendingPhoto);
      setScannerPendingPhoto(null);
    }
    setStagedImages(finalPhotos);
    setScannerCapturedPhotos([]);
    setIsCameraScannerOpen(false);
  };

  const handleCameraScannerCancel = () => {
    if (scannerPendingPhoto) {
      URL.revokeObjectURL(scannerPendingPhoto.preview);
      setScannerPendingPhoto(null);
    }
    if (scannerCapturedPhotos.length > 0) {
      setStagedImages(scannerCapturedPhotos);
      setScannerCapturedPhotos([]);
    }
    setIsCameraScannerOpen(false);
  };

  const handleRemoveScannerCapturedPhoto = (index: number) => {
    setScannerCapturedPhotos(prev => {
      const removed = prev[index];
      if (removed?.preview) URL.revokeObjectURL(removed.preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleJsonUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if(!file) return;
    handleJsonFile(file);
  };

  // --- End Upload Handlers ---

  // Delete manifest helper
  const deleteManifest = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const manifest = history.find(h => h.id === id);
    if (manifest) {
      promptDeleteManifest(e, manifest);
    }
  };

  const handleExportExcel = async () => {
    const headers = ["Sl.No", "Serial/AWB", "Description", "Type", "Weight(kg)", "Slab Breakdown", "Amount(₹)"];
    const csvContent = [headers.join(","), ...rows.map(r => [r.slNo, `"${r.serialNo}"`, `"${r.description}"`, r.type, r.weight, `"${r.breakdown}"`, r.amount].join(","))].join("\n");
    try {
      await exportAndShareFile({
        fileName: `Manifest_${manifestMeta.manifestNo || 'Export'}.csv`,
        data: csvContent,
        mimeType: 'text/csv;charset=utf-8;',
        dialogTitle: `Share Manifest CSV`,
      });
    } catch (err) {
      console.error('CSV export failed:', err);
      setStatus({ type: 'error', message: 'Failed to export CSV.' });
    }
    setIsExportOpen(false);
  };

  const handleExportJson = async () => {
    const manifestData: ManifestHistory = {
      id: activeManifestId || crypto.randomUUID(),
      manifestNo: manifestMeta.manifestNo, manifestDate: manifestMeta.manifestDate,
      rows, config, totalAmount, itemCount: rows.length, createdAt: Date.now(),
      folderId: currentFolderId || undefined
    };
    try {
      await exportAndShareFile({
        fileName: `Manifest_${manifestMeta.manifestNo || 'Export'}.json`,
        data: JSON.stringify(manifestData, null, 2),
        mimeType: 'application/json',
        dialogTitle: `Share Manifest JSON`,
      });
    } catch (err) {
      console.error('JSON export failed:', err);
      setStatus({ type: 'error', message: 'Failed to export JSON.' });
    }
    setIsExportOpen(false);
  };

  const handleExportPdf = () => {
    if (isNativePlatform()) {
      setStatus({ type: 'info', message: 'Use Statement Preview or Export CSV/JSON to share directly on Android.' });
      setIsExportOpen(false);
      return;
    }
    window.print();
    setIsExportOpen(false);
  };

  const parseDateStr = (dateStr: string) => {
    return parseManifestDateTimestamp(dateStr, 0);
  };

  const calculateManifestSummary = (manifest: ManifestHistory) => {
    const s = { 
      slab1Total: 0, slab2Total: 0, slab3Total: 0, docTotal: 0, totalAmount: 0, 
      smallParcelCount: 0, bigParcelCount: 0, docCount: 0, 
      totalWeight: 0, smallParcelTotalWeight: 0,
      rawTotalWeight: 0,
      s1w: 0, s2w: 0, s3w: 0,
      heavyWeights: [] as number[],
      heavyTotal: 0
    };
    manifest.rows.forEach(row => {
      s.rawTotalWeight += Number(row.weight) || 0;
      if (row.type === ItemType.DOCUMENT) { 
        s.docCount++; s.docTotal += row.amount; 
      } else {
        const rounded = Math.ceil(row.weight);
        s.totalWeight += rounded;
        if (rounded > 10) {
          s.bigParcelCount++;
          s.heavyWeights.push(rounded);
          s.heavyTotal += rounded;
        } else {
          s.smallParcelCount++;
          s.smallParcelTotalWeight += rounded;
        }
        const calc = calculateParcelAmount(row.weight, manifest.config);
        s.s1w += calc.s1w; s.s2w += calc.s2w; s.s3w += calc.s3w;
        s.slab1Total += calc.s1w * manifest.config.parcelSlab1Rate;
        s.slab2Total += calc.s2w * manifest.config.parcelSlab2Rate;
        s.slab3Total += calc.s3w * manifest.config.parcelSlab3Rate;
      }
    });
    s.totalAmount = s.slab1Total + s.slab2Total + s.slab3Total + s.docTotal;
    return s;
  };

  // Helper to parse "15+20+25" into [15, 20, 25]
  const parsePDetail = (detail: string): number[] => {
    if (!detail) return [];
    return detail.split('+').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
  };

  const modernBillingReport = useMemo(() => {
    if (selectedFinalFolderIds.length === 0) return null;
    
    // 1. Explorer Manifests in selected folders
    const folderManifests = history
      .filter(h => h.folderId && selectedFinalFolderIds.includes(h.folderId))
      .map(m => {
        const originalSummary = calculateManifestSummary(m);
        const override = finalBillOverrides[m.id] || {};
        
        // Use overrides or fallback to original calculated values
        const finalDate = override.date ?? m.manifestDate;
        const finalNo = override.no ?? m.manifestNo;
        const finalPCount = override.pCount ?? originalSummary.smallParcelCount;
        const finalDCount = override.dCount ?? originalSummary.docCount;
        const finalPWt = override.pWeight ?? originalSummary.smallParcelTotalWeight;
        
        // Logic for Heavy Parcels (P)
        let finalHeavyWeights = originalSummary.heavyWeights;
        if (override.PDetail !== undefined) {
          finalHeavyWeights = parsePDetail(override.PDetail);
        }
        
        // Big Parcel Count (P): Use manual override OR derived from PDetail array length OR original
        const finalPBigCount = override.PCount ?? (override.PDetail !== undefined ? finalHeavyWeights.length : originalSummary.bigParcelCount);
        const finalHeavyTotal = finalHeavyWeights.reduce((a, b) => a + b, 0);
        
        // Slab 1 Weight: Small Parcel Total + (Big Parcel Count * 10)
        const finalS1w = finalPWt + (finalPBigCount * 10);
        const finalSlab1Total = finalS1w * m.config.parcelSlab1Rate;
        
        // Recalculate Slab 2 & 3 based on specific heavy weights
        let finalS2w = 0;
        let finalS3w = 0;
        let finalSlab2Total = 0;
        let finalSlab3Total = 0;
        
        finalHeavyWeights.forEach(weight => {
          const calc = calculateParcelAmount(weight, m.config);
          finalS2w += calc.s2w;
          finalS3w += calc.s3w;
          finalSlab2Total += calc.s2w * m.config.parcelSlab2Rate;
          finalSlab3Total += calc.s3w * m.config.parcelSlab3Rate;
        });
        
        const finalDocTotal = finalDCount * m.config.documentRate;
        const finalTotalAmount = finalSlab1Total + finalSlab2Total + finalSlab3Total + finalDocTotal;
        const finalTotalWeight = finalPWt + finalHeavyTotal;

        return {
          isManualDoc: false,
          manifest: { ...m, manifestDate: finalDate, manifestNo: finalNo },
          summary: {
            ...originalSummary,
            smallParcelCount: finalPCount,
            bigParcelCount: finalPBigCount,
            docCount: finalDCount,
            smallParcelTotalWeight: finalPWt,
            heavyWeights: finalHeavyWeights,
            heavyTotal: finalHeavyTotal,
            totalWeight: finalTotalWeight,
            s1w: finalS1w,
            s2w: finalS2w,
            s3w: finalS3w,
            slab1Total: finalSlab1Total,
            slab2Total: finalSlab2Total,
            slab3Total: finalSlab3Total,
            docTotal: finalDocTotal,
            totalAmount: finalTotalAmount
          },
          overrides: override
        };
      });

    // 2. Manual Document Manifest Entries (entered for dates in Final Manifest)
    const manualDocLines = manualDocEntries
      .filter(doc => selectedFinalFolderIds.includes(doc.folderId))
      .map(doc => {
        const override = finalBillOverrides[doc.id] || {};
        const finalDate = override.date ?? doc.manifestDate;
        const finalNo = override.no ?? (doc.manifestNo || 'Doc Only');
        const finalDCount = override.dCount ?? doc.docCount;
        const rate = doc.documentRate ?? globalConfig.documentRate;
        const docTotal = finalDCount * rate;

        return {
          isManualDoc: true,
          manifest: {
            id: doc.id,
            manifestDate: finalDate,
            manifestNo: finalNo,
            folderId: doc.folderId,
            rows: [],
            config: { ...globalConfig, documentRate: rate },
            totalAmount: docTotal,
            itemCount: finalDCount,
            createdAt: doc.createdAt
          } as ManifestHistory,
          summary: {
            smallParcelCount: 0,
            bigParcelCount: 0,
            docCount: finalDCount,
            smallParcelTotalWeight: 0,
            heavyWeights: [] as number[],
            heavyTotal: 0,
            totalWeight: 0,
            s1w: 0,
            s2w: 0,
            s3w: 0,
            slab1Total: 0,
            slab2Total: 0,
            slab3Total: 0,
            docTotal: docTotal,
            totalAmount: docTotal
          },
          overrides: override
        };
      });

    const lines = [...folderManifests, ...manualDocLines].sort((a, b) => parseDateStr(a.manifest.manifestDate) - parseDateStr(b.manifest.manifestDate));

    const totals = lines.reduce((acc, curr) => ({
      p_small: acc.p_small + curr.summary.smallParcelCount,
      P_big: acc.P_big + curr.summary.bigParcelCount,
      d: acc.d + curr.summary.docCount, 
      w: acc.w + curr.summary.totalWeight, 
      sw: acc.sw + curr.summary.smallParcelTotalWeight,
      s1: acc.s1 + curr.summary.slab1Total, 
      s2: acc.s2 + curr.summary.slab2Total, 
      s3: acc.s3 + curr.summary.slab3Total,
      dt: acc.dt + curr.summary.docTotal, 
      grand: acc.grand + curr.summary.totalAmount,
      hw: acc.hw + curr.summary.heavyTotal,
      s1w: acc.s1w + curr.summary.s1w, 
      s2w: acc.s2w + curr.summary.s2w, 
      s3w: acc.s3w + curr.summary.s3w
    }), { p_small: 0, P_big: 0, d: 0, w: 0, sw: 0, s1: 0, s2: 0, s3: 0, dt: 0, grand: 0, hw: 0, s1w: 0, s2w: 0, s3w: 0 });
    
    // Fix total weight calc in totals (sw might have changed)
    totals.w = totals.sw + totals.hw;

    return { lines, totals, folderName: folders.filter(f => selectedFinalFolderIds.includes(f.id)).map(f => f.name).join(' + ') || 'Consolidated Report' };
  }, [selectedFinalFolderIds, history, folders, finalBillOverrides, manualDocEntries, globalConfig]);

  const changeFontSize = (col: keyof typeof fontSizes, delta: number) => {
    setFontSizes(prev => ({ ...prev, [col]: Math.max(8, prev[col] + delta) }));
  };

  const handleExportModernJson = async () => {
    if (!modernBillingReport) return;
    try {
      await exportAndShareFile({
        fileName: `Statement_${modernBillingReport.folderName}_Export.json`,
        data: JSON.stringify(modernBillingReport, null, 2),
        mimeType: 'application/json',
        dialogTitle: `Share Statement JSON`,
      });
    } catch (err) {
      console.error('Statement JSON export failed:', err);
      setStatus({ type: 'error', message: 'Failed to export Statement JSON.' });
    }
    setIsFinalExportOpen(false);
  };

  const handleExportModernExcel = async () => {
    if (!modernBillingReport) return;
    const headers = ["#", "Date", "Manifest No", "Small Parcels (p)", "Big Parcels (P)", "Docs (D)", "p weight", "P detail", "Total Wt", "Amount Logic", "Net Amount"];
    const csvContent = [
      headers.join(","),
      ...modernBillingReport.lines.map((l, i) => [
        i + 1, l.manifest.manifestDate, l.manifest.manifestNo, l.summary.smallParcelCount, l.summary.bigParcelCount, l.summary.docCount,
        l.summary.smallParcelTotalWeight,
        l.summary.heavyWeights.length > 0 ? `"${l.summary.heavyWeights.join('+')}=${l.summary.heavyTotal}"` : "0",
        l.summary.totalWeight,
        `"S1:(${l.summary.s1w}kg@${l.manifest.config.parcelSlab1Rate}=₹${l.summary.slab1Total}) S2:(${l.summary.s2w}kg@${l.manifest.config.parcelSlab2Rate}=₹${l.summary.slab2Total}) S3:(${l.summary.s3w}kg@${l.manifest.config.parcelSlab3Rate}=₹${l.summary.slab3Total}) Doc:(${l.summary.docCount}*${l.manifest.config.documentRate}=₹${l.summary.docTotal})"`,
        l.summary.totalAmount
      ].join(",")),
      ["TOTALS", "", "", modernBillingReport.totals.p_small, modernBillingReport.totals.P_big, modernBillingReport.totals.d, modernBillingReport.totals.sw, modernBillingReport.totals.hw, modernBillingReport.totals.w, "", modernBillingReport.totals.grand].join(",")
    ].join("\n");
    try {
      await exportAndShareFile({
        fileName: `Statement_${modernBillingReport.folderName}_Export.csv`,
        data: csvContent,
        mimeType: 'text/csv;charset=utf-8;',
        dialogTitle: `Share Statement CSV`,
      });
    } catch (err) {
      console.error('Statement CSV export failed:', err);
      setStatus({ type: 'error', message: 'Failed to export Statement CSV.' });
    }
    setIsFinalExportOpen(false);
  };

  const generatePdfDocument = (overrideFontScale?: number) => {
    if (!modernBillingReport) return null;

    const fontScale = Math.min(1.6, Math.max(0.7, overrideFontScale ?? pdfFontScale ?? 1.0));

    const doc = new jsPDF({
      orientation: "portrait",
      unit: "in",
      format: "a4"
    });

    const margin = 0.28;
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    const headerScale = Math.max(0.88, fontScale);
    const metaY = margin + (0.65 * headerScale);
    const tableStartY = metaY + (0.20 * headerScale);
    const tableBottomMargin = margin + 0.16;
    const ROWS_PER_PAGE = Math.max(4, chunkRowsPerPage || 12);

    const drawHeader = (targetDoc: jsPDF = doc) => {
      const w = targetDoc.internal.pageSize.width;
      targetDoc.setFontSize(13.5 * fontScale);
      targetDoc.setFont("helvetica", "bold");
      const companyName = "JETLINE COURIERS PVT. LTD.";
      const textWidth = targetDoc.getTextWidth(companyName);
      const titleY = margin + (0.18 * headerScale);
      targetDoc.text(companyName, w / 2, titleY, { align: "center" });

      targetDoc.setLineWidth(0.01);
      targetDoc.line((w - textWidth) / 2, titleY + 0.025, (w + textWidth) / 2, titleY + 0.025);

      targetDoc.setFontSize(9.5 * fontScale);
      targetDoc.setFont("helvetica", "normal");
      targetDoc.text("PATNA (BIHAR)", w / 2, margin + (0.36 * headerScale), { align: "center" });

      targetDoc.line(margin, margin + (0.48 * headerScale), w - margin, margin + (0.48 * headerScale));

      targetDoc.setFontSize(8.5 * fontScale);
      targetDoc.setFont("helvetica", "bold");

      targetDoc.text(`MONTH: ${reportMeta.month || '____________'}`, margin, metaY);
      targetDoc.text(`AGENCY: ${reportMeta.agency || modernBillingReport.folderName}`, w / 2, metaY, { align: "center" });
      targetDoc.text(`AREA: ${reportMeta.area || '____________'}`, w - margin, metaY, { align: "right" });

      targetDoc.line(margin, metaY + (0.12 * headerScale), w - margin, metaY + (0.12 * headerScale));
    };

    const drawFooter = (pageNum: number, totalPages: number) => {
      const str = `Page ${pageNum} / ${totalPages}`;
      doc.setFontSize(8 * fontScale);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(30, 41, 59);
      doc.text(str, pageWidth - margin, margin + 0.1, { align: "right" });
    };

    // Scale fixed columns gently so numbers remain crisp without wrapping awkwardly at larger font sizes,
    // while keeping Weight Breakdown ('auto') generously wide.
    const widthFactor = fontScale >= 1
      ? Math.min(1.36, 1 + (fontScale - 1) * 0.75)
      : Math.max(0.84, 1 - (1 - fontScale) * 0.55);

    const tableHead = [['Sl', 'Date / Manifest', 'Parcel\n(p/P/D)', 'Weight Breakdown', 'Amount (Rs.)']];
    const tableColumnStyles: any = {
      0: { cellWidth: Number((0.28 * widthFactor).toFixed(3)), halign: 'center' },
      1: { cellWidth: Number((0.98 * widthFactor).toFixed(3)) },
      2: { cellWidth: Number((0.56 * widthFactor).toFixed(3)), halign: 'center' },
      3: { cellWidth: 'auto' },
      4: { cellWidth: Number((1.38 * widthFactor).toFixed(3)), halign: 'right' }
    };

    const formatPdfRow = (l: typeof modernBillingReport.lines[number], idx: number): string[] => {
      const slNo = idx + 1;
      const col2 = `${l.manifest.manifestDate}\n${l.manifest.manifestNo}`;
      const col3 = `p: ${l.summary.smallParcelCount}\nP: ${l.summary.bigParcelCount}\nD: ${l.summary.docCount}`;
      let col4 = `p = ${l.summary.smallParcelTotalWeight}kg`;
      if (l.summary.heavyWeights.length > 0) {
        col4 += `\nP detail: ${l.summary.heavyWeights.join('+')} = ${l.summary.heavyTotal}kg`;
      }
      col4 += `\nS1: (${l.summary.smallParcelTotalWeight} + ${l.summary.bigParcelCount}*10) = ${l.summary.s1w} kg | S2: ${l.summary.s2w} kg | S3: ${l.summary.s3w} kg`;

      const col5Lines: string[] = [];
      if (l.summary.s1w > 0) col5Lines.push(`S1: ${l.summary.s1w}kg * ${l.manifest.config.parcelSlab1Rate} = ${l.summary.slab1Total}`);
      if (l.summary.s2w > 0) col5Lines.push(`S2: ${l.summary.s2w}kg * ${l.manifest.config.parcelSlab2Rate} = ${l.summary.slab2Total}`);
      if (l.summary.s3w > 0) col5Lines.push(`S3: ${l.summary.s3w}kg * ${l.manifest.config.parcelSlab3Rate} = ${l.summary.slab3Total}`);
      if (l.summary.docCount > 0) col5Lines.push(`Doc: ${l.summary.docCount} no * ${l.manifest.config.documentRate} = ${l.summary.docTotal}`);
      col5Lines.push(`Total = Rs.${l.summary.totalAmount}`);

      return [slNo.toString(), col2, col3, col4, col5Lines.join('\n')];
    };

    const baseFontSize = Number((8.0 * fontScale).toFixed(2));
    const baseCellPadding = Number(Math.min(0.068, Math.max(0.026, 0.042 * fontScale)).toFixed(4));

    const testChunkFitsOnePage = (bodyRows: string[][], fontSize: number, cellPadding: number): boolean => {
      const scratch = new jsPDF({ orientation: "portrait", unit: "in", format: "a4" });
      autoTable(scratch, {
        head: tableHead,
        body: bodyRows,
        startY: tableStartY,
        margin: { top: tableStartY, right: margin, bottom: tableBottomMargin, left: margin },
        rowPageBreak: 'avoid',
        theme: 'grid',
        styles: {
          fontSize,
          cellPadding,
          textColor: 20,
          lineColor: 200,
          lineWidth: 0.005,
          valign: 'top',
          overflow: 'linebreak'
        },
        headStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: 'bold', halign: 'center' },
        columnStyles: tableColumnStyles
      });
      return scratch.getNumberOfPages() === 1;
    };

    // At user-adjusted fontScale !== 1.0, strictly preserve the requested font size and automatically
    // reduce rows per page (e.g., 12 -> 11 -> 10 -> 9...) so enlarged text stays readable without shrinking back.
    const allLines = modernBillingReport.lines;
    const allFormattedRows = allLines.map((l, idx) => formatPdfRow(l, idx));
    const scalePresets = Math.abs(fontScale - 1.0) < 0.01
      ? [
          { fontSize: 8.0, cellPadding: 0.042 },
          { fontSize: 7.5, cellPadding: 0.034 },
          { fontSize: 7.0, cellPadding: 0.026 }
        ]
      : [
          { fontSize: baseFontSize, cellPadding: baseCellPadding }
        ];

    const physicalPages: {
      rows: string[][];
      sum: number;
      fontSize: number;
      cellPadding: number;
    }[] = [];

    let cursor = 0;
    while (cursor < allLines.length) {
      let chosenCount = Math.min(ROWS_PER_PAGE, allLines.length - cursor);
      let chosenPreset = scalePresets[0];
      let matched = false;

      const fullSlice = allFormattedRows.slice(cursor, cursor + chosenCount);
      for (const preset of scalePresets) {
        if (testChunkFitsOnePage(fullSlice, preset.fontSize, preset.cellPadding)) {
          chosenPreset = preset;
          matched = true;
          break;
        }
      }

      if (!matched && chosenCount > 1) {
        for (let tryCount = chosenCount - 1; tryCount >= 1; tryCount--) {
          const subSlice = allFormattedRows.slice(cursor, cursor + tryCount);
          let subMatched = false;
          for (const preset of scalePresets) {
            if (testChunkFitsOnePage(subSlice, preset.fontSize, preset.cellPadding)) {
              chosenCount = tryCount;
              chosenPreset = preset;
              subMatched = true;
              break;
            }
          }
          if (subMatched) break;
        }
      }

      const pageLines = allLines.slice(cursor, cursor + chosenCount);
      const pageRows = allFormattedRows.slice(cursor, cursor + chosenCount);
      const pageSum = pageLines.reduce((sum, line) => sum + line.summary.totalAmount, 0);

      physicalPages.push({
        rows: pageRows,
        sum: pageSum,
        fontSize: chosenPreset.fontSize,
        cellPadding: chosenPreset.cellPadding
      });
      cursor += chosenCount;
    }

    const pageSums = physicalPages.map((p) => p.sum);
    let finalY = tableStartY;

    physicalPages.forEach((pageData, index) => {
      if (index > 0) doc.addPage();
      drawHeader(doc);

      autoTable(doc, {
        head: tableHead,
        body: pageData.rows,
        startY: tableStartY,
        margin: { top: tableStartY, right: margin, bottom: tableBottomMargin, left: margin },
        rowPageBreak: 'avoid',
        theme: 'grid',
        styles: {
          fontSize: pageData.fontSize,
          cellPadding: pageData.cellPadding,
          textColor: 20,
          lineColor: 200,
          lineWidth: 0.005,
          valign: 'top',
          overflow: 'linebreak'
        },
        headStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: 'bold', halign: 'center' },
        columnStyles: tableColumnStyles
      });

      finalY = (doc as any).lastAutoTable.finalY;
    });

    // Pre-calculate breakdown text height proportionally so Totals + Page Sums + Signatures never collide
    const footerScale = Math.max(0.9, fontScale);
    const totalsBoxHeight = Number((0.72 * footerScale).toFixed(3));
    let breakdownLines: string[] = [];
    if (pageSums.length > 0) {
      const breakdownParts = pageSums.map((sum, idx) => `Page ${idx + 1}(Rs.${sum.toLocaleString()})`);
      const breakdownStr = breakdownParts.join(' + ') + ` = Grand Total Rs.${modernBillingReport.totals.grand.toLocaleString()}`;
      doc.setFontSize(9.5 * fontScale);
      breakdownLines = doc.splitTextToSize(breakdownStr, pageWidth - (2 * margin));
    }
    const breakdownLineHeight = 0.18 * footerScale;
    const breakdownHeight = breakdownLines.length > 0 ? (breakdownLines.length * breakdownLineHeight) + 0.12 : 0;
    const signatureReserve = 0.55 * footerScale;
    const neededFooterHeight = 0.14 + totalsBoxHeight + 0.16 + breakdownHeight + signatureReserve;

    if (finalY + neededFooterHeight > pageHeight - margin) {
      doc.addPage();
      drawHeader(doc);
      finalY = tableStartY;
    } else {
      finalY += 0.14;
    }

    // Grand Total Section (proportionally scaled)
    doc.setFillColor(240, 245, 255);
    doc.rect(margin, finalY, pageWidth - (2 * margin), totalsBoxHeight, 'F');
    doc.setDrawColor(190, 205, 235);
    doc.rect(margin, finalY, pageWidth - (2 * margin), totalsBoxHeight, 'S');

    doc.setFontSize(13 * fontScale);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 41, 59);
    doc.text("TOTALS", margin + 0.2, finalY + (totalsBoxHeight * 0.59));

    const summaryOffsetX = margin + (fontScale > 1.1 ? 1.48 : 1.35);
    doc.setFontSize(8.5 * fontScale);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(51, 65, 85);
    doc.text(`p: ${modernBillingReport.totals.p_small}    P: ${modernBillingReport.totals.P_big}    D: ${modernBillingReport.totals.d}`, summaryOffsetX, finalY + (totalsBoxHeight * 0.38));

    doc.setFontSize(8.5 * fontScale);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(71, 85, 105);
    doc.text(`p wt sum: ${modernBillingReport.totals.sw}kg    P detail sum: ${modernBillingReport.totals.hw}kg    Total wt: ${modernBillingReport.totals.w}kg`, summaryOffsetX, finalY + (totalsBoxHeight * 0.70));

    doc.setFontSize(Math.min(20, 16 * fontScale));
    doc.setFont("helvetica", "bold");
    doc.setTextColor(24, 34, 77);
    doc.text(`Rs.${modernBillingReport.totals.grand.toLocaleString()}`, pageWidth - margin - 0.2, finalY + (totalsBoxHeight * 0.62), { align: "right" });

    // Page Breakdown Summary
    const breakdownY = finalY + totalsBoxHeight + (0.18 * footerScale);
    doc.setFontSize(9.5 * fontScale);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);

    if (breakdownLines.length > 0) {
      doc.text(breakdownLines, margin, breakdownY);
    }

    // Signatures at bottom of final page
    const bottomY = pageHeight - margin - 0.35;
    doc.setFontSize(10 * fontScale);
    doc.setFont("helvetica", "bold");
    doc.text("Prepared By", margin, bottomY);
    doc.text("Verified By", pageWidth / 2, bottomY, { align: "center" });
    doc.text("Authorized Signatory", pageWidth - margin, bottomY, { align: "right" });

    // Final Footer Loop matching actual PDF page count
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      drawFooter(i, totalPages);
    }

    return doc;
  };

  const handleChangePdfFontScale = (nextScale: number) => {
    const clamped = Math.min(1.6, Math.max(0.7, Math.round(nextScale * 100) / 100));
    setPdfFontScale(clamped);
    try {
      localStorage.setItem('smartbilling_pdf_font_scale', clamped.toString());
    } catch {}
    if (isPdfPreviewOpen) {
      const updatedDoc = generatePdfDocument(clamped);
      if (updatedDoc) {
        try {
          const arrayBuffer = updatedDoc.output('arraybuffer');
          setPdfPreviewBytes(new Uint8Array(arrayBuffer));
        } catch (e) {
          console.error("Error updating PDF preview font scale:", e);
        }
      }
    }
  };

  const handleDownloadPDF = async () => {
    const doc = generatePdfDocument();
    if (!doc || !modernBillingReport) return;
    const fileName = `Statement_${modernBillingReport.folderName}.pdf`;
    try {
      const res = await exportJsPdfDocument(doc, fileName, `Share Statement PDF`);
      if (!res.cancelled && res.nativeShare) {
        setStatus({ type: 'success', message: `Statement PDF ready to share or save.` });
      }
    } catch (err) {
      console.error('Statement PDF export failed:', err);
      setStatus({ type: 'error', message: 'Failed to export Statement PDF.' });
    }
    setIsFinalExportOpen(false);
  };

  const handleOpenPdfPreview = () => {
    const doc = generatePdfDocument();
    if (!doc) return;

    try {
      const arrayBuffer = doc.output('arraybuffer');
      const bytes = new Uint8Array(arrayBuffer);
      setPdfPreviewBytes(bytes);
      setIsPdfPreviewOpen(true);
      setIsFinalExportOpen(false);
    } catch (e) {
      console.error("Error preparing in-app PDF preview:", e);
    }
  };

  const handleClosePdfPreview = () => {
    setIsPdfPreviewOpen(false);
    setPdfPreviewBytes(null);
  };

  const handleExportModernPdf = handleOpenPdfPreview;

  const FontSizeControls = ({ col }: { col: keyof typeof fontSizes }) => (
    <div className="flex items-center gap-1 ml-2 opacity-0 group-hover/header:opacity-100 transition-opacity no-print">
      <button onClick={() => changeFontSize(col, 1)} className="p-0.5 hover:bg-indigo-100 dark:hover:bg-slate-700 rounded text-indigo-600 dark:text-indigo-400" title="Increase font size"><MagnifyingGlassPlusIcon className="h-3 w-3"/></button>
      <button onClick={() => changeFontSize(col, -1)} className="p-0.5 hover:bg-indigo-100 dark:hover:bg-slate-700 rounded text-indigo-600 dark:text-indigo-400" title="Decrease font size"><MagnifyingGlassMinusIcon className="h-3 w-3"/></button>
    </div>
  );

  const renderBillingHistorySection = () => {
    const isInsideFolder = Boolean(currentFolderId && currentFolder);
    const activeFolderManifests = isInsideFolder
      ? history.filter(h => h.folderId === currentFolderId)
      : history.filter(h => !h.folderId);

    return (
      <div id="manifest-history-section" data-mobile-view="manifest-history" className="space-y-3 sm:space-y-4 md:space-y-5 animate-in fade-in duration-300">
        {/* Top Control Bar */}
        <div id="manifest-top-toolbar" ref={mobileToolbarMenuRef} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/90 dark:border-slate-800 p-2.5 sm:p-4 shadow-xs relative">
          {/* --- MOBILE VIEW: Streamlined single-row bar with 3-line menu trigger --- */}
          <div id="mobile-control-bar" data-component="mobile-toolbar-header" className="sm:hidden flex flex-col gap-2">
            <div className="flex items-center justify-between gap-1.5">
              {/* Left: Folder context or Explorer title */}
              <div className="min-w-0 flex-1">
                {isInsideFolder ? (
                  <div className="flex items-center gap-1.5 min-w-0">
                    <button
                      onClick={() => { setCurrentFolderId(null); setHistorySearch(''); }}
                      className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors shrink-0"
                      title="Back to all records"
                      aria-label="Back"
                    >
                      <ArrowLeftIcon className="h-4 w-4" />
                    </button>
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200 truncate leading-tight">{currentFolder?.name}</p>
                      <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">
                        {filteredHistory.length} manifests
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <div className="p-1.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-lg shrink-0">
                      <FolderIcon className="h-4 w-4" />
                    </div>
                    <div>
                      <h2 className="text-sm font-black text-slate-900 dark:text-white leading-tight">Explorer</h2>
                      <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                        {history.length} records
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Right: Search, Import & 3-Line Menu */}
              <div className="flex items-center gap-1.5 shrink-0">
                {/* Collapsible Search */}
                {!isMobileSearchExpanded && !historySearch ? (
                  <button
                    type="button"
                    onClick={() => setIsMobileSearchExpanded(true)}
                    className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-all active:scale-95 flex items-center justify-center"
                    title="Search manifests"
                    aria-label="Open search"
                  >
                    <MagnifyingGlassIcon className="h-4 w-4" />
                  </button>
                ) : (
                  <div className="relative flex items-center w-36 sm:w-44 animate-in fade-in duration-150">
                    <MagnifyingGlassIcon className="h-3.5 w-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      autoFocus
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                      placeholder="Search..."
                      className="w-full pl-7 pr-6 py-1 bg-slate-50 hover:bg-white focus:bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-white dark:placeholder-slate-500 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all shadow-xs"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setHistorySearch('');
                        setIsMobileSearchExpanded(false);
                      }}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
                      title="Close search"
                      aria-label="Close search"
                    >
                      <XMarkIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

                {/* Captured Manifest Pages Vault Indicator */}
                <button
                  id="home-mobile-captured-sessions-btn"
                  type="button"
                  onClick={() => setIsCapturedSessionsModalOpen(true)}
                  className="inline-flex items-center gap-1 px-2 sm:px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold transition-all active:scale-95 border border-slate-200 dark:border-slate-700 shadow-xs cursor-pointer"
                  title="View Captured Manifest Pages (Local Storage Vault)"
                >
                  <DocumentDuplicateIcon className="h-3.5 w-3.5 text-indigo-500" />
                  <span className="hidden sm:inline">Captured</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-black ${
                      capturedSessionsStats.failed > 0
                        ? 'bg-rose-600 text-white'
                        : capturedSessionsStats.ready > 0
                        ? 'bg-amber-500 text-slate-950'
                        : capturedSessionsStats.total > 0
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {capturedSessionsStats.total}
                  </span>
                </button>

                {/* Import Button */}
                <button
                  onClick={() => setIsUploadModalOpen(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-xs transition-all active:scale-95"
                  title="Import manifest"
                >
                  <ArrowUpTrayIcon className="h-3.5 w-3.5" />
                  <span>Import</span>
                </button>

                {/* 3-Line Menu Button (Bars3Icon) */}
                <button
                  type="button"
                  onClick={() => setIsMobileToolbarMenuOpen(!isMobileToolbarMenuOpen)}
                  className={`p-2 rounded-lg border transition-all active:scale-95 flex items-center justify-center ${
                    isMobileToolbarMenuOpen
                      ? 'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 border-indigo-300 dark:border-indigo-700 ring-1 ring-indigo-400/30'
                      : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                  title="More actions & layout"
                  aria-label="Toggle explorer menu"
                  aria-expanded={isMobileToolbarMenuOpen}
                >
                  {isMobileToolbarMenuOpen ? (
                    <XMarkIcon className="h-4 w-4" />
                  ) : (
                    <Bars3Icon className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Collapsible Mobile Menu Content */}
            {isMobileToolbarMenuOpen && (
              <div className="mt-2 pt-2.5 border-t border-slate-100 dark:border-slate-800 animate-in fade-in slide-in-from-top-2 duration-200 flex flex-col gap-2">
                {/* View Switcher Pill */}
                <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/90 p-1.5 rounded-lg border border-slate-200/80 dark:border-slate-700">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 ml-1">View Layout:</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setHistoryViewMode('grid')}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                        historyViewMode === 'grid'
                          ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs ring-1 ring-slate-200 dark:ring-slate-700'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
                      }`}
                    >
                      <Squares2X2Icon className="h-3.5 w-3.5" />
                      <span>Grid</span>
                    </button>
                    <button
                      onClick={() => setHistoryViewMode('table')}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                        historyViewMode === 'table'
                          ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs ring-1 ring-slate-200 dark:ring-slate-700'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
                      }`}
                    >
                      <TableCellsIcon className="h-3.5 w-3.5" />
                      <span>Table</span>
                    </button>
                  </div>
                </div>

                {/* Action Buttons Grid in Mobile Menu */}
                <div className="grid grid-cols-2 gap-1.5">
                  {!isInsideFolder ? (
                    <button
                      onClick={() => {
                        setIsFolderExportOpen(true);
                        setIsMobileToolbarMenuOpen(false);
                      }}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold hover:bg-indigo-50/40 dark:hover:bg-slate-700 transition-all active:scale-95"
                    >
                      <ArrowDownOnSquareIcon className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                      <span>Export Records</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        if (currentFolder) exportFolderToZip(currentFolder.id);
                        setIsMobileToolbarMenuOpen(false);
                      }}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 rounded-lg text-xs font-semibold hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition-all active:scale-95"
                    >
                      <FolderArrowDownIcon className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                      <span>Export Folder ZIP</span>
                    </button>
                  )}

                  <button
                    onClick={() => {
                      setIsBulkImportOpen(true);
                      setIsMobileToolbarMenuOpen(false);
                    }}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold hover:bg-indigo-50/40 dark:hover:bg-slate-700 transition-all active:scale-95"
                  >
                    <Square3Stack3DIcon className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                    <span>Bulk ZIP</span>
                  </button>

                  {!isInsideFolder && (
                    <button
                      onClick={() => {
                        setIsCreateFolderOpen(true);
                        setIsMobileToolbarMenuOpen(false);
                      }}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold hover:bg-indigo-50/40 dark:hover:bg-slate-700 transition-all active:scale-95"
                    >
                      <FolderPlusIcon className="h-4 w-4 text-indigo-500 dark:text-indigo-400" />
                      <span>New Folder</span>
                    </button>
                  )}

                  <button
                    onClick={() => {
                      startBlankSession();
                      setIsMobileToolbarMenuOpen(false);
                    }}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold hover:bg-indigo-50/40 dark:hover:bg-slate-700 transition-all active:scale-95"
                  >
                    <PlusIcon className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                    <span>Manual Entry</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* --- DESKTOP / TABLET VIEW: Full horizontal expanded toolbar --- */}
          <div className="hidden sm:flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Title / Context & Direct Action Row */}
            <div className="flex items-center justify-between gap-2 w-full lg:w-auto">
              {isInsideFolder ? (
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 mb-0.5 sm:mb-1">
                    <button
                      onClick={() => { setCurrentFolderId(null); setHistorySearch(''); }}
                      className="hover:text-indigo-600 dark:hover:text-indigo-400 text-slate-600 dark:text-slate-400 flex items-center gap-1 transition-colors"
                    >
                      <ArrowLeftIcon className="h-3.5 w-3.5" /> All Records
                    </button>
                    <span>/</span>
                    <span className="text-slate-800 dark:text-slate-200 font-bold truncate">{currentFolder?.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 sm:p-2 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-lg shrink-0">
                      <FolderIcon className="h-4 w-4 sm:h-5 sm:w-5" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-base sm:text-lg md:text-xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2 truncate">
                        <span className="truncate">{currentFolder?.name}</span>
                        <span className="text-[11px] font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/50 px-2 py-0.5 rounded-full shrink-0">
                          {filteredHistory.length} manifests
                        </span>
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Manifest records in this folder</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="min-w-0">
                  <h2 className="text-base sm:text-lg md:text-xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                    <span>Explorer</span>
                    <span className="text-[11px] font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/50 px-2 py-0.5 rounded-full shrink-0">
                      {history.length} total
                    </span>
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Manage and organize billing manifests</p>
                </div>
              )}

              {/* Primary action buttons placed right beside h2 header in the same single horizontal line */}
              <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 ml-auto">
                {/* Captured Manifest Pages Local Vault Button */}
                <button
                  id="home-explorer-captured-sessions-btn"
                  type="button"
                  onClick={() => setIsCapturedSessionsModalOpen(true)}
                  className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold shadow-xs transition-all active:scale-95 cursor-pointer"
                  title="Open Local Storage Vault of Captured Manifest Pages"
                >
                  <DocumentDuplicateIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-indigo-500" />
                  <span className="hidden sm:inline">Captured Pages</span>
                  <span className="sm:hidden">Pages</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-black ${
                      capturedSessionsStats.failed > 0
                        ? 'bg-rose-600 text-white'
                        : capturedSessionsStats.ready > 0
                        ? 'bg-amber-500 text-slate-950'
                        : capturedSessionsStats.total > 0
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {capturedSessionsStats.total}
                  </span>
                </button>

                <button
                  onClick={() => setIsUploadModalOpen(true)}
                  className="inline-flex items-center gap-1 px-2 sm:px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-all active:scale-95"
                  title="Import manifest"
                >
                  <ArrowUpTrayIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  <span>Import</span>
                </button>

                {!isInsideFolder ? (
                  <button
                    onClick={() => setIsFolderExportOpen(true)}
                    className="inline-flex items-center gap-1 px-2 sm:px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600 text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg text-xs font-semibold hover:bg-indigo-50/40 dark:hover:bg-slate-700 transition-all active:scale-95"
                    title="Export records"
                  >
                    <ArrowDownOnSquareIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-slate-500 dark:text-slate-400" />
                    <span>Export</span>
                  </button>
                ) : (
                  <button
                    onClick={() => currentFolder && exportFolderToZip(currentFolder.id)}
                    className="inline-flex items-center gap-1 px-2 sm:px-3 py-1.5 bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded-lg text-xs font-semibold transition-all active:scale-95"
                    title="Export Folder ZIP"
                  >
                    <FolderArrowDownIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-indigo-600 dark:text-indigo-400" />
                    <span>Export Folder ZIP</span>
                  </button>
                )}

                <button
                  onClick={() => setIsBulkImportOpen(true)}
                  className="inline-flex items-center gap-1 px-2 sm:px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold transition-all active:scale-95"
                  title="Bulk ZIP import"
                >
                  <Square3Stack3DIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-slate-600 dark:text-slate-400" />
                  <span>Bulk ZIP</span>
                </button>
              </div>
            </div>

            {/* Desktop Controls: Search, View Switcher, and Secondary Actions */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Desktop search input */}
              <div className="relative block sm:w-48 md:w-56">
                <MagnifyingGlassIcon className="h-4 w-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="Search manifest or date..."
                  className="w-full pl-8 pr-7 py-1.5 bg-slate-50/80 hover:bg-white focus:bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-white dark:placeholder-slate-500 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                />
                {historySearch && (
                  <button
                    onClick={() => setHistorySearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
                    title="Clear search"
                  >
                    <XMarkIcon className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* View Toggle */}
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200/80 dark:border-slate-700">
                <button
                  onClick={() => setHistoryViewMode('grid')}
                  className={`p-1.5 rounded-md transition-all ${historyViewMode === 'grid' ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'}`}
                  title="Grid cards"
                >
                  <Squares2X2Icon className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setHistoryViewMode('table')}
                  className={`p-1.5 rounded-md transition-all ${historyViewMode === 'table' ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'}`}
                  title="Compact table"
                >
                  <TableCellsIcon className="h-4 w-4" />
                </button>
              </div>

              {/* Secondary Actions: New Folder & Manual */}
              {!isInsideFolder && (
                <button
                  onClick={() => setIsCreateFolderOpen(true)}
                  className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600 text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg text-xs font-semibold hover:bg-indigo-50/40 dark:hover:bg-slate-700 transition-all active:scale-95"
                >
                  <FolderPlusIcon className="h-4 w-4 text-indigo-500 dark:text-indigo-400" />
                  <span>New Folder</span>
                </button>
              )}

              <button
                onClick={startBlankSession}
                className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600 text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg text-xs font-semibold hover:bg-indigo-50/40 dark:hover:bg-slate-700 transition-all active:scale-95"
              >
                <PlusIcon className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                <span>Manual</span>
              </button>
            </div>
          </div>

          {/* Mini Stats Strip */}
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2 text-[10px] sm:text-xs">
            <div className="flex items-center gap-1 sm:gap-2 bg-slate-50 dark:bg-slate-800/80 px-1.5 sm:px-2.5 py-1 rounded-md min-w-0">
              <FolderIcon className="h-3.5 w-3.5 text-indigo-500 dark:text-indigo-400 shrink-0" />
              <span className="text-slate-500 dark:text-slate-400 font-medium truncate">Folders:</span>
              <span className="font-bold text-slate-800 dark:text-slate-100 shrink-0">{historyStats.totalFolders}</span>
            </div>
            <div className="flex items-center gap-1 sm:gap-2 bg-slate-50 dark:bg-slate-800/80 px-1.5 sm:px-2.5 py-1 rounded-md min-w-0">
              <DocumentTextIcon className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400 shrink-0" />
              <span className="text-slate-500 dark:text-slate-400 font-medium truncate">Manifests:</span>
              <span className="font-bold text-slate-800 dark:text-slate-100 shrink-0">{historyStats.totalManifests}</span>
            </div>
            <div className="flex items-center gap-1 sm:gap-2 bg-slate-50 dark:bg-slate-800/80 px-1.5 sm:px-2.5 py-1 rounded-md min-w-0">
              <ArchiveBoxIcon className="h-3.5 w-3.5 text-emerald-500 dark:text-emerald-400 shrink-0" />
              <span className="text-slate-500 dark:text-slate-400 font-medium truncate">Units:</span>
              <span className="font-bold text-slate-800 dark:text-slate-100 shrink-0">{historyStats.totalUnits}</span>
            </div>
            <div className="flex items-center gap-1 sm:gap-2 bg-slate-50 dark:bg-slate-800/80 px-1.5 sm:px-2.5 py-1 rounded-md min-w-0" title={`Total raw/original weight sum of all manifest items: ${historyStats.totalRawWeight} kg`}>
              <ScaleIcon className="h-3.5 w-3.5 text-indigo-500 dark:text-indigo-400 shrink-0" />
              <span className="text-slate-500 dark:text-slate-400 font-medium truncate">Raw Wt:</span>
              <span className="font-bold text-indigo-700 dark:text-indigo-300 shrink-0 font-mono">{parseFloat(historyStats.totalRawWeight.toFixed(2))} kg</span>
            </div>
            <div className="flex items-center gap-1 sm:gap-2 bg-slate-50 dark:bg-slate-800/80 px-1.5 sm:px-2.5 py-1 rounded-md min-w-0">
              <CalculatorIcon className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400 shrink-0" />
              <span className="text-slate-500 dark:text-slate-400 font-medium truncate">Billed:</span>
              <span className="font-bold text-indigo-900 dark:text-indigo-300 shrink-0 truncate">₹{historyStats.totalAmount.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Empty State */}
        {folders.length === 0 && history.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-8 text-center">
            <div className="mx-auto h-12 w-12 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center mb-3">
              <ArchiveBoxIcon className="h-6 w-6" />
            </div>
            <h3 className="text-base font-bold text-slate-800 dark:text-white mb-1">No Records Yet</h3>
            <p className="text-xs text-slate-400 dark:text-slate-400 max-w-sm mx-auto mb-4">
              Get started by uploading a manifest document, importing a ZIP archive, or adding an entry manually.
            </p>
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <button
                onClick={() => setIsUploadModalOpen(true)}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition-all inline-flex items-center gap-1.5"
              >
                <ArrowUpTrayIcon className="h-4 w-4" /> Import Manifest
              </button>
              <button
                type="button"
                onClick={() => setIsCapturedSessionsModalOpen(true)}
                className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-indigo-300 dark:hover:border-indigo-600 rounded-lg text-xs font-semibold transition-all inline-flex items-center gap-1.5"
                title="View local storage of captured manifest pages"
              >
                <DocumentDuplicateIcon className="h-4 w-4 text-indigo-500" /> Captured Pages ({capturedSessionsStats.total})
              </button>
              <button
                onClick={() => setIsCreateFolderOpen(true)}
                className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-indigo-300 dark:hover:border-indigo-600 rounded-lg text-xs font-semibold transition-all inline-flex items-center gap-1.5"
              >
                <FolderPlusIcon className="h-4 w-4" /> New Folder
              </button>
              <button
                onClick={startBlankSession}
                className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-indigo-300 dark:hover:border-indigo-600 rounded-lg text-xs font-semibold transition-all inline-flex items-center gap-1.5"
              >
                <PlusIcon className="h-4 w-4" /> Manual Entry
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Root Folders Section (Only shown when not inside a folder) */}
            {!isInsideFolder && filteredFolders.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <FolderIcon className="h-3.5 w-3.5 text-indigo-500 dark:text-indigo-400" />
                    Folders ({filteredFolders.length})
                  </span>
                  <button
                    onClick={() => setIsCreateFolderOpen(true)}
                    className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 inline-flex items-center gap-1"
                  >
                    <PlusIcon className="h-3 w-3" /> New
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
                  {filteredFolders.map((folder) => {
                    const count = history.filter(h => h.folderId === folder.id).length;
                    const folderAmount = history
                      .filter(h => h.folderId === folder.id)
                      .reduce((sum, h) => sum + (h.totalAmount || 0), 0);

                    return (
                      <div
                        key={folder.id}
                        onClick={() => { setCurrentFolderId(folder.id); setHistorySearch(''); }}
                        className="group bg-white dark:bg-slate-900 rounded-lg border border-slate-200/90 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-500 hover:shadow-xs p-2.5 transition-all cursor-pointer flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className="w-8 h-8 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center flex-shrink-0 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                            <FolderIcon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                              {folder.name}
                            </h4>
                            <p className="text-[10px] text-slate-400 dark:text-slate-400 font-medium">
                              {count} {count === 1 ? 'record' : 'records'} • ₹{folderAmount.toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-0.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => { setEditingFolderId(folder.id); setNewFolderName(folder.name); }}
                            className="p-1 text-slate-400 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-800 rounded transition-colors"
                            title="Rename folder"
                          >
                            <PencilIcon className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={(e) => promptDeleteFolder(e, folder)}
                            className="p-1 text-slate-400 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded transition-colors"
                            title="Move folder to Recycle Bin"
                            aria-label={`Move folder ${folder.name} to Recycle Bin`}
                          >
                            <TrashIcon className="h-3.5 w-3.5" />
                          </button>
                          <ChevronRightIcon className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600 group-hover:text-indigo-500 dark:group-hover:text-indigo-400 transition-colors" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Manifest Records Section */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <DocumentTextIcon className="h-3.5 w-3.5 text-indigo-500 dark:text-indigo-400" />
                  {isInsideFolder ? 'Folder Records' : 'Manifests'} ({filteredHistory.length})
                  {historySearch && (
                    <span className="text-slate-400 dark:text-slate-400 normal-case font-normal text-[11px]">
                      (filtered by "{historySearch}")
                    </span>
                  )}
                </span>
                {filteredHistory.length > 0 && (
                  <span className="text-xs text-slate-400 dark:text-slate-400 font-medium">
                    Total: ₹{filteredHistory.reduce((s, h) => s + (h.totalAmount || 0), 0).toLocaleString()}
                  </span>
                )}
              </div>

              {filteredHistory.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200/90 dark:border-slate-800 p-6 text-center">
                  <DocumentIcon className="h-8 w-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-200">No manifests found</p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-400 mt-0.5">
                    {historySearch ? 'Try a different search query' : 'Import or add manifests to see them here'}
                  </p>
                  {historySearch && (
                    <button
                      onClick={() => setHistorySearch('')}
                      className="mt-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                    >
                      Clear search
                    </button>
                  )}
                </div>
              ) : historyViewMode === 'grid' ? (
                /* Grid View - Shortened & Modern */
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filteredHistory.map((manifest) => {
                    const manifestRawWeight = (manifest.rows || []).reduce((sum, r) => sum + (Number(r.weight) || 0), 0);
                    return (
                    <div
                      key={manifest.id}
                      onClick={() => openManifestFromHistory(manifest)}
                      className="group bg-white dark:bg-slate-900 rounded-xl border border-slate-200/90 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-500/80 hover:shadow-xs p-3.5 transition-all cursor-pointer flex flex-col justify-between relative"
                    >
                      {/* Top row: Manifest ID, Date badge, Action menu */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0 flex-1">
                          <h4 className="text-sm font-black text-slate-900 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors flex items-center gap-1.5">
                            {manifest.manifestNo}
                          </h4>
                          <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            <CalendarDaysIcon className="h-3 w-3 text-slate-400 dark:text-slate-500" />
                            <span>{manifest.manifestDate}</span>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                          <div className="relative">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setManifestToMoveId(manifestToMoveId === manifest.id ? null : manifest.id);
                                setShowInlineNewFolderInput(false);
                                setInlineNewFolderName('');
                              }}
                              className={`p-1.5 rounded-lg transition-all ${
                                manifestToMoveId === manifest.id
                                  ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300 ring-2 ring-indigo-400'
                                  : 'text-slate-400 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-800'
                              }`}
                              title="Manifest actions & move"
                              aria-label={`Actions for manifest ${manifest.manifestNo}`}
                            >
                              <EllipsisVerticalIcon className="h-4 w-4" />
                            </button>
                            {manifestToMoveId === manifest.id && (
                              <>
                                <div 
                                  className="fixed inset-0 z-40" 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setManifestToMoveId(null);
                                    setShowInlineNewFolderInput(false);
                                  }} 
                                />
                                <div 
                                  className="absolute right-0 top-8 w-56 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 py-1.5 z-50 text-left animate-in fade-in zoom-in-95"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div className="px-3 py-1.5 border-b border-slate-100 dark:border-slate-800 text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center justify-between">
                                    <span>Manifest Actions</span>
                                    <span className="font-mono text-[9px] text-indigo-500 font-bold">{manifest.manifestNo}</span>
                                  </div>

                                  {/* Move to Folder Options */}
                                  <div className="py-1">
                                    <div className="px-3 py-1 text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                                      Move to Folder
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => handleMoveManifest(manifest.id, null)}
                                      className={`w-full px-3 py-1.5 text-left text-xs flex items-center justify-between transition-colors ${
                                        !manifest.folderId 
                                          ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-bold' 
                                          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                                      }`}
                                    >
                                      <span className="flex items-center gap-1.5">
                                        <ArchiveBoxIcon className="h-3.5 w-3.5" />
                                        Root / Unassigned
                                      </span>
                                      {!manifest.folderId && <CheckIcon className="h-3.5 w-3.5 text-indigo-600" />}
                                    </button>
                                    {folders.map((f) => (
                                      <button
                                        key={f.id}
                                        type="button"
                                        onClick={() => handleMoveManifest(manifest.id, f.id)}
                                        className={`w-full px-3 py-1.5 text-left text-xs flex items-center justify-between transition-colors truncate ${
                                          manifest.folderId === f.id
                                            ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-bold'
                                            : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                                        }`}
                                      >
                                        <span className="flex items-center gap-1.5 truncate">
                                          <FolderIcon className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
                                          <span className="truncate">{f.name}</span>
                                        </span>
                                        {manifest.folderId === f.id && <CheckIcon className="h-3.5 w-3.5 text-indigo-600 shrink-0" />}
                                      </button>
                                    ))}

                                    {/* Inline Create Folder */}
                                    {showInlineNewFolderInput ? (
                                      <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800/80 mt-1 border-t border-slate-100 dark:border-slate-800">
                                        <div className="flex items-center gap-1">
                                          <input
                                            type="text"
                                            value={inlineNewFolderName}
                                            onChange={(e) => setInlineNewFolderName(e.target.value)}
                                            onKeyDown={(e) => {
                                              if (e.key === 'Enter') handleCreateFolderAndMove(manifest.id);
                                            }}
                                            placeholder="Folder name..."
                                            className="flex-1 px-2 py-1 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:border-indigo-500"
                                            autoFocus
                                          />
                                          <button
                                            type="button"
                                            onClick={() => handleCreateFolderAndMove(manifest.id)}
                                            className="p-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-xs"
                                            title="Save & Move"
                                          >
                                            <CheckIcon className="h-3 w-3" />
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => setShowInlineNewFolderInput(true)}
                                        className="w-full px-3 py-1.5 text-left text-xs text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-800 flex items-center gap-1.5 font-medium transition-colors"
                                      >
                                        <PlusIcon className="h-3.5 w-3.5" />
                                        <span>New Folder & Move</span>
                                      </button>
                                    )}
                                  </div>

                                  {/* Quick Operations */}
                                  <div className="pt-1 border-t border-slate-100 dark:border-slate-800">
                                    <button
                                      type="button"
                                      onClick={() => handleDuplicateManifest(manifest)}
                                      className="w-full px-3 py-1.5 text-left text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 transition-colors"
                                    >
                                      <DocumentDuplicateIcon className="h-3.5 w-3.5 text-slate-400" />
                                      <span>Duplicate Manifest</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedSplitManifestId(manifest.id);
                                        setChunkingTab('splitter');
                                        setIsChunkingModalOpen(true);
                                        setManifestToMoveId(null);
                                      }}
                                      className="w-full px-3 py-1.5 text-left text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 transition-colors"
                                    >
                                      <BoltIcon className="h-3.5 w-3.5 text-amber-500" />
                                      <span>Split / Chunk Manifest</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleExportSingleManifestJson(manifest)}
                                      className="w-full px-3 py-1.5 text-left text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 transition-colors"
                                    >
                                      <ArrowDownTrayIcon className="h-3.5 w-3.5 text-slate-400" />
                                      <span>Export JSON</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        setManifestToMoveId(null);
                                        promptDeleteManifest(e, manifest);
                                      }}
                                      className="w-full px-3 py-1.5 text-left text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 flex items-center gap-2 transition-colors"
                                    >
                                      <TrashIcon className="h-3.5 w-3.5" />
                                      <span>Move to Recycle Bin</span>
                                    </button>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                          <button
                            onClick={(e) => promptDeleteManifest(e, manifest)}
                            className="p-1.5 text-slate-400 dark:text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 dark:hover:text-red-400 rounded-lg transition-all duration-150 active:scale-90 border border-transparent hover:border-red-200/80 dark:hover:border-red-900/60 shadow-none hover:shadow-xs group/del"
                            title="Move to Recycle Bin"
                            aria-label={`Move manifest ${manifest.manifestNo} to Recycle Bin`}
                          >
                            <TrashIcon className="h-4 w-4 transition-transform group-hover/del:scale-110" />
                          </button>
                        </div>
                      </div>

                      {/* Middle row: Units Badge & Folder tag */}
                      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                        <span className="inline-flex items-center text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-md border border-transparent dark:border-emerald-800/40">
                          {manifest.itemCount} Units
                        </span>
                        <span 
                          className="inline-flex items-center gap-1 text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-md border border-indigo-100/60 dark:border-indigo-800/40 font-mono"
                          title={`Raw or original total weight sum of all manifest items: ${manifestRawWeight} kg`}
                        >
                          <ScaleIcon className="h-2.5 w-2.5 text-indigo-500 dark:text-indigo-400 shrink-0" />
                          <span>{parseFloat(manifestRawWeight.toFixed(3))} kg Raw</span>
                        </span>
                        {!isInsideFolder && manifest.folderId && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-md border border-transparent dark:border-slate-700">
                            <FolderIcon className="h-2.5 w-2.5 text-slate-400 dark:text-slate-400" />
                            {folders.find(f => f.id === manifest.folderId)?.name || 'Folder'}
                          </span>
                        )}
                      </div>

                      {/* Bottom row: Total Amount & Open action */}
                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block leading-tight">Total</span>
                          <span className="text-base font-black text-indigo-950 dark:text-indigo-300">₹{manifest.totalAmount.toLocaleString()}</span>
                        </div>
                        <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                          Open <ChevronRightIcon className="h-3 w-3" />
                        </span>
                      </div>
                    </div>
                  );
                })}
                </div>
              ) : (
                /* Table View - Compact & Dense */
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/90 dark:border-slate-800 overflow-hidden shadow-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          <th className="py-2.5 px-3 w-10 text-center">#</th>
                          <th className="py-2.5 px-3">Manifest ID</th>
                          <th className="py-2.5 px-3">Date</th>
                          {!isInsideFolder && <th className="py-2.5 px-3">Folder</th>}
                          <th className="py-2.5 px-3 text-center">Units &amp; Raw Wt</th>
                          <th className="py-2.5 px-3 text-right">Total Amount</th>
                          <th className="py-2.5 px-3 text-center w-28">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {filteredHistory.map((manifest, idx) => {
                          const manifestRawWeight = (manifest.rows || []).reduce((sum, r) => sum + (Number(r.weight) || 0), 0);
                          return (
                          <tr
                            key={manifest.id}
                            onClick={() => openManifestFromHistory(manifest)}
                            className="hover:bg-indigo-50/40 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                          >
                            <td className="py-2 px-3 text-center text-slate-400 dark:text-slate-500 font-mono text-[11px]">{idx + 1}</td>
                            <td className="py-2 px-3 font-bold text-slate-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                              {manifest.manifestNo}
                            </td>
                            <td className="py-2 px-3 text-slate-500 dark:text-slate-400">{manifest.manifestDate}</td>
                            {!isInsideFolder && (
                              <td className="py-2 px-3">
                                {manifest.folderId ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-transparent dark:border-slate-700">
                                    <FolderIcon className="h-2.5 w-2.5 text-slate-400 dark:text-slate-400" />
                                    {folders.find(f => f.id === manifest.folderId)?.name || 'Folder'}
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-slate-400 dark:text-slate-500 italic">Root</span>
                                )}
                              </td>
                            )}
                            <td className="py-2 px-3 text-center">
                              <div className="inline-flex items-center justify-center gap-1">
                                <span className="text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full border border-transparent dark:border-emerald-800/40">
                                  {manifest.itemCount}
                                </span>
                                <span className="text-[10px] font-bold font-mono text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 px-1.5 py-0.5 rounded-full border border-transparent dark:border-indigo-800/40" title={`Raw or original total weight: ${manifestRawWeight} kg`}>
                                  {parseFloat(manifestRawWeight.toFixed(2))}kg raw
                                </span>
                              </div>
                            </td>
                            <td className="py-2 px-3 text-right font-black text-indigo-950 dark:text-indigo-300 font-mono">
                              ₹{manifest.totalAmount.toLocaleString()}
                            </td>
                            <td className="py-2 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-center gap-1 relative">
                                <button
                                  onClick={() => openManifestFromHistory(manifest)}
                                  className="px-2 py-0.5 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded transition-colors"
                                >
                                  Open
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setManifestToMoveId(manifestToMoveId === manifest.id ? null : manifest.id);
                                    setShowInlineNewFolderInput(false);
                                    setInlineNewFolderName('');
                                  }}
                                  className={`p-1 rounded transition-colors ${
                                    manifestToMoveId === manifest.id
                                      ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300 ring-2 ring-indigo-400'
                                      : 'text-slate-400 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-800'
                                  }`}
                                  title="Manifest actions & move"
                                  aria-label={`Actions for manifest ${manifest.manifestNo}`}
                                >
                                  <EllipsisVerticalIcon className="h-3.5 w-3.5" />
                                </button>
                                {manifestToMoveId === manifest.id && (
                                  <>
                                    <div 
                                      className="fixed inset-0 z-40" 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setManifestToMoveId(null);
                                        setShowInlineNewFolderInput(false);
                                      }} 
                                    />
                                    <div 
                                      className="absolute right-0 top-7 w-56 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 py-1.5 z-50 text-left animate-in fade-in zoom-in-95"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <div className="px-3 py-1.5 border-b border-slate-100 dark:border-slate-800 text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center justify-between">
                                        <span>Manifest Actions</span>
                                        <span className="font-mono text-[9px] text-indigo-500 font-bold">{manifest.manifestNo}</span>
                                      </div>
                                      <div className="py-1">
                                        <div className="px-3 py-1 text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                                          Move to Folder
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => handleMoveManifest(manifest.id, null)}
                                          className={`w-full px-3 py-1.5 text-left text-xs flex items-center justify-between transition-colors ${
                                            !manifest.folderId 
                                              ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-bold' 
                                              : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                                          }`}
                                        >
                                          <span className="flex items-center gap-1.5">
                                            <ArchiveBoxIcon className="h-3.5 w-3.5" />
                                            Root / Unassigned
                                          </span>
                                          {!manifest.folderId && <CheckIcon className="h-3.5 w-3.5 text-indigo-600" />}
                                        </button>
                                        {folders.map((f) => (
                                          <button
                                            key={f.id}
                                            type="button"
                                            onClick={() => handleMoveManifest(manifest.id, f.id)}
                                            className={`w-full px-3 py-1.5 text-left text-xs flex items-center justify-between transition-colors truncate ${
                                              manifest.folderId === f.id
                                                ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-bold'
                                                : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                                            }`}
                                          >
                                            <span className="flex items-center gap-1.5 truncate">
                                              <FolderIcon className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
                                              <span className="truncate">{f.name}</span>
                                            </span>
                                            {manifest.folderId === f.id && <CheckIcon className="h-3.5 w-3.5 text-indigo-600 shrink-0" />}
                                          </button>
                                        ))}

                                        {/* Inline Create Folder */}
                                        {showInlineNewFolderInput ? (
                                          <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800/80 mt-1 border-t border-slate-100 dark:border-slate-800">
                                            <div className="flex items-center gap-1">
                                              <input
                                                type="text"
                                                value={inlineNewFolderName}
                                                onChange={(e) => setInlineNewFolderName(e.target.value)}
                                                onKeyDown={(e) => {
                                                  if (e.key === 'Enter') handleCreateFolderAndMove(manifest.id);
                                                }}
                                                placeholder="Folder name..."
                                                className="flex-1 px-2 py-1 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:border-indigo-500"
                                                autoFocus
                                              />
                                              <button
                                                type="button"
                                                onClick={() => handleCreateFolderAndMove(manifest.id)}
                                                className="p-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-xs"
                                                title="Save & Move"
                                              >
                                                <CheckIcon className="h-3 w-3" />
                                              </button>
                                            </div>
                                          </div>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => setShowInlineNewFolderInput(true)}
                                            className="w-full px-3 py-1.5 text-left text-xs text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-800 flex items-center gap-1.5 font-medium transition-colors"
                                          >
                                            <PlusIcon className="h-3.5 w-3.5" />
                                            <span>New Folder & Move</span>
                                          </button>
                                        )}
                                      </div>

                                      <div className="pt-1 border-t border-slate-100 dark:border-slate-800">
                                        <button
                                          type="button"
                                          onClick={() => handleDuplicateManifest(manifest)}
                                          className="w-full px-3 py-1.5 text-left text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 transition-colors"
                                        >
                                          <DocumentDuplicateIcon className="h-3.5 w-3.5 text-slate-400" />
                                          <span>Duplicate Manifest</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setSelectedSplitManifestId(manifest.id);
                                            setChunkingTab('splitter');
                                            setIsChunkingModalOpen(true);
                                            setManifestToMoveId(null);
                                          }}
                                          className="w-full px-3 py-1.5 text-left text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 transition-colors"
                                        >
                                          <BoltIcon className="h-3.5 w-3.5 text-amber-500" />
                                          <span>Split / Chunk Manifest</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleExportSingleManifestJson(manifest)}
                                          className="w-full px-3 py-1.5 text-left text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 transition-colors"
                                        >
                                          <ArrowDownTrayIcon className="h-3.5 w-3.5 text-slate-400" />
                                          <span>Export JSON</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            setManifestToMoveId(null);
                                            promptDeleteManifest(e, manifest);
                                          }}
                                          className="w-full px-3 py-1.5 text-left text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 flex items-center gap-2 transition-colors"
                                        >
                                          <TrashIcon className="h-3.5 w-3.5" />
                                          <span>Move to Recycle Bin</span>
                                        </button>
                                      </div>
                                    </div>
                                  </>
                                )}
                                <button
                                  onClick={(e) => promptDeleteManifest(e, manifest)}
                                  className="p-1.5 text-slate-400 dark:text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 dark:hover:text-red-400 rounded-lg transition-all duration-150 active:scale-90 border border-transparent hover:border-red-200/80 dark:hover:border-red-900/60"
                                  title="Move to Recycle Bin"
                                  aria-label={`Move manifest ${manifest.manifestNo} to Recycle Bin`}
                                >
                                  <TrashIcon className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderBillingEditor = () => {
    const discrepancyReport = analyzeSerialDiscrepancies(rows);
    const activeTargetItem = discrepancyReport.diagnosticItems.find(item => item.rowId === activeTargetRowId) || null;

    return (
    <div className="w-full max-w-7xl mx-auto p-4 md:p-8 animate-in slide-in-from-bottom-4 duration-500">
      {/* Header with Meta */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl md:rounded-[2rem] shadow-sm border border-gray-100 dark:border-slate-700 p-4 sm:p-6 md:p-8 mb-6 md:mb-8">
         <div className="mb-6 md:mb-8">
            <div className="flex items-center justify-between gap-3">
               <h2 className="text-xl sm:text-2xl md:text-3xl font-black text-gray-900 dark:text-white truncate">Manifest Editor</h2>
               <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                   <button onClick={() => setIsConfigOpen(true)} title="Pricing & Rule Config" className="p-2 sm:p-2.5 md:p-3 rounded-xl bg-gray-50 dark:bg-slate-700/60 text-gray-400 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-700 transition-all cursor-pointer"><Cog6ToothIcon className="h-5 w-5 sm:h-6 sm:w-6" /></button>
                   <button onClick={saveManifest} className="py-2 sm:py-2.5 md:py-3 px-3.5 sm:px-6 md:px-8 bg-indigo-600 text-white rounded-xl font-black text-xs sm:text-sm hover:bg-indigo-700 transition-all shadow-md sm:shadow-xl shadow-indigo-100 dark:shadow-none active:scale-95 cursor-pointer whitespace-nowrap">Save Changes</button>
               </div>
            </div>
            <div className="flex items-center gap-2 mt-2 flex-nowrap overflow-x-auto no-scrollbar">
               <span className="bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 px-2.5 sm:px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest whitespace-nowrap shrink-0">{rows.length} Items</span>
               {status && <span className={`px-2.5 sm:px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest whitespace-nowrap shrink-0 ${status.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400' : 'bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400'}`}>{status.message}</span>}
            </div>
         </div>
         
         <div className="grid grid-cols-2 gap-3 sm:gap-6">
            <div className="min-w-0">
              <label className="text-[10px] font-black text-gray-400 dark:text-slate-400 uppercase tracking-widest mb-1.5 sm:mb-2 block ml-1 truncate">Manifest Number</label>
              <input type="text" value={manifestMeta.manifestNo} onChange={(e) => setManifestMeta({...manifestMeta, manifestNo: e.target.value})} className="w-full px-3 sm:px-5 py-2 sm:py-3 bg-gray-50 dark:bg-slate-900 border-2 border-gray-100 dark:border-slate-700 rounded-xl font-bold text-gray-900 dark:text-white focus:border-indigo-500 focus:ring-0 transition-all text-xs sm:text-base" placeholder="e.g. MF-2024-001" />
            </div>
            <div className="min-w-0">
              <label className="text-[10px] font-black text-gray-400 dark:text-slate-400 uppercase tracking-widest mb-1.5 sm:mb-2 block ml-1 truncate">Manifest Date</label>
              <input type="text" value={manifestMeta.manifestDate} onChange={(e) => setManifestMeta({...manifestMeta, manifestDate: e.target.value})} className="w-full px-3 sm:px-5 py-2 sm:py-3 bg-gray-50 dark:bg-slate-900 border-2 border-gray-100 dark:border-slate-700 rounded-xl font-bold text-gray-900 dark:text-white focus:border-indigo-500 focus:ring-0 transition-all text-xs sm:text-base" placeholder="DD/MM/YYYY" />
            </div>
         </div>
      </div>

      {/* Stats Grid */}
      <div id="stats-summary-grid" className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 md:gap-4 mb-6 md:mb-8">
         {/* 1st & 2nd: Grouped Parcels & Documents Container */}
         <div id="stats-summary-card-parcels-documents" className="col-span-2 bg-white dark:bg-slate-800 rounded-xl sm:rounded-2xl p-2.5 sm:p-4 md:p-5 border border-gray-100 dark:border-slate-700 shadow-xs sm:shadow-sm min-w-0 flex flex-col justify-between">
            {/* Small sub heading counted to Total parcel + total documents */}
            <div className="flex items-center justify-between pb-1.5 sm:pb-2 mb-2 border-b border-gray-100 dark:border-slate-700/60">
               <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-gray-400 dark:text-slate-400">
                  Total Parcels + Documents
               </span>
               <span className="text-[10px] sm:text-xs font-black text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded-md border border-indigo-100 dark:border-indigo-900/40">
                  {summary.parcelCount + summary.docCount} Total
               </span>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:gap-4 divide-x divide-gray-100 dark:divide-slate-700">
               {/* 1st: Parcel */}
               <div id="stats-item-parcels" className="pr-1 sm:pr-2">
                  <div className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-gray-400 dark:text-slate-400 truncate mb-0.5 sm:mb-1">
                     Parcels
                  </div>
                  <div className="text-sm sm:text-xl md:text-3xl font-black text-gray-900 dark:text-white truncate">
                     {summary.parcelCount}
                  </div>
               </div>

               {/* 2nd: Documents */}
               <div id="stats-item-documents" className="pl-2 sm:pl-4">
                  <div className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-gray-400 dark:text-slate-400 truncate mb-0.5 sm:mb-1">
                     Documents
                  </div>
                  <div className="text-sm sm:text-xl md:text-3xl font-black text-gray-900 dark:text-white truncate">
                     {summary.docCount}
                  </div>
               </div>
            </div>
         </div>

         {/* 3rd: Total Weight */}
         <div id="stats-summary-card-total-weight" className="col-span-1 bg-white dark:bg-slate-800 rounded-xl sm:rounded-2xl p-2.5 sm:p-4 md:p-5 border border-gray-100 dark:border-slate-700 shadow-xs sm:shadow-sm min-w-0 flex flex-col justify-between">
            <div>
               <div className="flex items-center justify-between gap-1 mb-0.5 sm:mb-1">
                  <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-gray-400 dark:text-slate-400 truncate">
                     Total Weight
                  </span>
                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50">
                     Billable
                  </span>
               </div>
               <div className="text-sm sm:text-xl md:text-3xl font-black text-gray-900 dark:text-white truncate">
                  {summary.totalBillableWeight} <span className="text-[10px] sm:text-xs md:text-sm text-gray-400 font-bold">kg</span>
               </div>
            </div>

            {/* Small display of Raw total weight */}
            <div className="mt-1.5 sm:mt-2 pt-1.5 sm:pt-2 border-t border-gray-100 dark:border-slate-700/60 flex items-center justify-between gap-1">
               <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-gray-400 dark:text-slate-400 truncate" title="Raw total weight is the sum of all individual original weights available in the manifest">
                  Raw Total:
               </span>
               <span className="text-xs sm:text-sm font-black text-slate-700 dark:text-slate-200 font-mono truncate" title={`Exact raw original weight: ${summary.rawTotalWeight} kg`}>
                  {parseFloat(summary.rawTotalWeight.toFixed(3))} <span className="text-[9px] sm:text-[10px] text-gray-400 font-bold">kg</span>
               </span>
            </div>
         </div>

         {/* 4th: Total Amount */}
         <div id="stats-summary-card-total-amount" className="col-span-1 bg-indigo-600 rounded-xl sm:rounded-2xl p-2.5 sm:p-4 md:p-5 text-white shadow-md sm:shadow-xl shadow-indigo-200 dark:shadow-none min-w-0 flex flex-col justify-between">
            <div className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider opacity-75 truncate mb-0.5 sm:mb-1">
               Total Amount
            </div>
            <div className="text-sm sm:text-xl md:text-3xl font-black truncate">
               ₹{totalAmount.toLocaleString()}
            </div>
         </div>
      </div>

      {/* Errors Area */}
      {errors.length > 0 && (
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-6 mb-8">
           <h3 className="text-amber-800 font-bold flex items-center mb-4"><ExclamationTriangleIcon className="h-5 w-5 mr-2"/> Attention Required</h3>
           <ul className="space-y-2">
             {errors.map((err, idx) => (
               <li key={idx} className="text-sm text-amber-700 bg-white/50 px-4 py-2 rounded-lg flex items-start">
                 <span className="font-bold mr-2 uppercase text-[10px] bg-amber-200 px-2 py-0.5 rounded text-amber-800 mt-0.5">{err.type}</span>
                 {err.message}
               </li>
             ))}
           </ul>
        </div>
      )}

      {/* Attention Required Diagnostic Center with categorized badges and jump-to-action */}
      <AttentionDiagnosticCenter 
        report={discrepancyReport}
        activeTargetRowId={activeTargetRowId}
        onJumpToRow={handleJumpToRow}
        onAutoCorrectSequence={handleAutoCorrectSequence}
        onRemoveUnfilledMissingRows={handleRemoveUnfilledMissingRows}
        onAcceptAllInferred={handleAcceptAllInferred}
      />

      {/* Active Target Correction Banner */}
      <ActiveTargetActionBanner 
        targetItem={activeTargetItem}
        onNextIssue={() => handleNextDiagnosticIssue(discrepancyReport.diagnosticItems)}
        onDismiss={() => setActiveTargetRowId(null)}
      />

      {/* Table */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl md:rounded-[2rem] shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
        {/* Mobile View Toggle Bar */}
        <div className="sm:hidden px-3.5 py-2 bg-slate-50/80 dark:bg-slate-900/60 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between text-xs">
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
            {rows.length} items • Mobile View
          </span>
          <button
            type="button"
            onClick={() => setShowMobileDescription(prev => !prev)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shadow-xs active:scale-95 transition-all"
          >
            {showMobileDescription ? 'Hide Description' : 'Show Description'}
          </button>
        </div>
         <div className="overflow-x-auto">
           <table className="w-full text-left border-collapse sm:min-w-[760px] md:min-w-[860px]">
             <thead>
               <tr className="bg-gray-50/50 dark:bg-slate-900/50 border-b border-gray-100 dark:border-slate-700">
                 <th className="px-1.5 sm:px-3 py-3 sm:py-4 text-[10px] font-black text-gray-400 dark:text-slate-400 uppercase tracking-widest w-8 sm:w-16 text-center sm:text-left">#</th>
                 <th className="px-2 sm:px-3 py-3 sm:py-4 text-[10px] font-black text-gray-400 dark:text-slate-400 uppercase tracking-widest w-36 sm:w-44 min-w-[130px] sm:min-w-[165px]">Reference / AWB</th>
                 <th className={`px-2 sm:px-4 py-3 sm:py-4 text-[10px] font-black text-gray-400 dark:text-slate-400 uppercase tracking-widest ${showMobileDescription ? 'table-cell min-w-[120px]' : 'hidden sm:table-cell sm:min-w-[140px] sm:w-44'}`}>Description</th>
                 <th className="px-1 sm:px-2.5 py-3 sm:py-4 text-[10px] font-black text-gray-400 dark:text-slate-400 uppercase tracking-widest w-9 sm:w-24 text-center sm:text-left">Type</th>
                 <th className="px-1 sm:px-3 py-3 sm:py-4 text-[10px] font-black text-gray-400 dark:text-slate-400 uppercase tracking-widest w-14 sm:w-24 text-right">Weight</th>
                 <th className="px-1 sm:px-3 py-3 sm:py-4 text-[10px] font-black text-gray-400 dark:text-slate-400 uppercase tracking-widest text-right w-12 sm:w-24">Rate</th>
                 <th className="px-1 sm:px-3 py-3 sm:py-4 text-[10px] font-black text-gray-400 dark:text-slate-400 uppercase tracking-widest text-right w-14 sm:w-24">Amount</th>
                 <th className="px-1 sm:px-3 py-3 sm:py-4 text-right w-8 sm:w-24">
                   <button
                     type="button"
                     onClick={() => setIsDeleteModeActive(prev => !prev)}
                     title={isDeleteModeActive ? "Delete mode is active. Click to lock / deactivate." : "Delete mode is locked. Click to activate delete buttons."}
                     aria-label={isDeleteModeActive ? "Deactivate delete mode" : "Activate delete mode"}
                     className={`inline-flex items-center justify-center gap-1.5 p-1.5 sm:px-3 sm:py-1.5 rounded-lg sm:rounded-xl text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer shadow-xs border select-none active:scale-95 ${
                       isDeleteModeActive
                         ? "bg-rose-600 hover:bg-rose-700 text-white border-rose-500 shadow-rose-500/20 reading-delete-btn"
                         : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 reading-locked-btn"
                     }`}
                   >
                     {isDeleteModeActive ? (
                       <>
                         <LockOpenIcon className="h-3.5 w-3.5 text-white" />
                         <span className="hidden sm:inline">Active</span>
                       </>
                     ) : (
                       <>
                         <LockClosedIcon className="h-3.5 w-3.5 text-slate-400 dark:text-slate-400" />
                         <span className="hidden sm:inline">Locked</span>
                       </>
                     )}
                   </button>
                 </th>
               </tr>
             </thead>
             <tbody className="divide-y divide-gray-50 dark:divide-slate-700/50">
               {rows.map((row, index) => {
                 const isMissingPlaceholder = Boolean(row.isMissingPlaceholder);
                 const isMissingBlankAwb = !row.serialNo?.trim();
                 const isMissing = isMissingPlaceholder || isMissingBlankAwb;
                 const isDuplicateSlNo = discrepancyReport.duplicateSlNos.has(row.slNo);
                 const isDuplicateAwb = Boolean(row.serialNo && discrepancyReport.duplicateAwbs.has(row.serialNo.trim().toUpperCase()));
                 const isInferred = Boolean(row.isInferred);
                 const isIncompleteWeight = row.weight <= 0 && row.type === ItemType.PARCEL && !isMissing;
                 const isActiveTarget = activeTargetRowId === row.id;

                 let rowStyleClass = 'hover:bg-indigo-50/30 dark:hover:bg-slate-700/30';
                 if (isActiveTarget) {
                   rowStyleClass = 'ring-4 ring-amber-400 dark:ring-amber-500 ring-offset-2 ring-offset-white dark:ring-offset-slate-900 shadow-xl shadow-amber-500/25 bg-amber-50/80 dark:bg-amber-950/40 relative z-10 transition-all duration-300';
                 } else if (isMissingPlaceholder) {
                   rowStyleClass = 'missing-row-blinking border-2 border-dashed border-rose-400 dark:border-rose-600 bg-rose-50/40 dark:bg-rose-950/30';
                 } else if (isInferred) {
                   rowStyleClass = 'border-2 border-dashed border-sky-400 dark:border-sky-500 bg-sky-50/40 dark:bg-sky-950/20';
                 } else if (isDuplicateAwb || isDuplicateSlNo) {
                   rowStyleClass = 'bg-orange-50/40 dark:bg-orange-950/30 border border-orange-300 dark:border-orange-800';
                 } else if (isIncompleteWeight) {
                   rowStyleClass = 'bg-amber-50/30 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-800';
                 }

                 return (
                   <tr 
                     key={row.id} 
                     id={`row-${row.id}`}
                     className={`group transition-colors ${rowStyleClass}`}
                   >
                     <td className="px-1.5 sm:px-3 py-2 sm:py-3.5 w-8 sm:w-16">
                       <div className="flex items-center justify-center sm:justify-start gap-1">
                         <input 
                           id={`input-slno-${row.id}`}
                           type="number" 
                           min="1"
                           value={row.slNo || (index + 1)}
                           onChange={(e) => handleSlNoChange(row.id, parseInt(e.target.value, 10) || 0)}
                           onFocus={() => {
                             setActiveTargetRowId(row.id);
                             setActiveTargetField('slNo');
                           }}
                           onBlur={handleSlNoBlurOrEnter}
                           onKeyDown={(e) => {
                             if (e.key === 'Enter') {
                               handleSlNoBlurOrEnter();
                             }
                           }}
                           title={isDuplicateSlNo ? `Repeated Serial No #${row.slNo} - Click or edit to auto-correct sequence` : `Serial No #${row.slNo}`}
                           className={`w-7 sm:w-12 px-0.5 sm:px-1.5 py-0.5 sm:py-1 text-center font-bold text-[11px] sm:text-xs rounded-md sm:rounded-lg transition-all tabular-nums ${
                             isDuplicateSlNo
                               ? 'duplicate-col-red font-black ring-1 sm:ring-2 ring-rose-500/20'
                               : isMissing
                                 ? 'bg-rose-100 dark:bg-rose-900/60 border border-rose-400 dark:border-rose-600 text-rose-800 dark:text-rose-200 font-black'
                                 : 'bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-transparent hover:border-slate-300 dark:hover:border-slate-600 focus:bg-white dark:focus:bg-slate-900 focus:border-indigo-500 focus:ring-1 sm:focus:ring-2 focus:ring-indigo-500/20'
                           }`}
                         />
                         {isMissing && (
                           <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-rose-600 text-white shrink-0 shadow-xs animate-pulse">
                             Missing
                           </span>
                         )}
                         {isDuplicateSlNo && (
                           <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-amber-600 text-white shrink-0 shadow-xs">
                             Dupe
                           </span>
                         )}
                       </div>
                     </td>
                     <td className="px-2 sm:px-3 py-2 sm:py-3.5 w-36 sm:w-44 min-w-[130px] sm:min-w-[165px]">
                        <div className="relative flex items-center w-full">
                          <input 
                            id={`input-awb-${row.id}`}
                            type="text" 
                            value={row.serialNo} 
                            onChange={(e) => updateRow(row.id, { serialNo: e.target.value })} 
                            onFocus={() => {
                              setActiveTargetRowId(row.id);
                              setActiveTargetField('awb');
                            }}
                            className={`w-full rounded-lg pl-2 sm:pl-2.5 py-1 sm:py-1.5 font-mono text-xs sm:text-[13px] font-bold tracking-tight sm:tracking-normal transition-all focus:outline-none ${
                              (isInferred && isDuplicateAwb)
                                ? 'pr-12 sm:pr-20'
                                : (isInferred || isDuplicateAwb)
                                  ? 'pr-7 sm:pr-14'
                                  : 'pr-2'
                            } ${
                              isActiveTarget
                                ? 'ring-2 ring-amber-500 border-amber-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white'
                                : isDuplicateAwb
                                  ? 'duplicate-col-red ring-2 ring-orange-500/30 placeholder:text-rose-400'
                                  : isMissing
                                    ? 'bg-white/90 dark:bg-slate-900/90 border-2 border-dashed border-rose-400 dark:border-rose-500 text-rose-900 dark:text-rose-100 placeholder:text-rose-400 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-600 font-bold'
                                    : isInferred
                                      ? 'bg-sky-50/50 dark:bg-slate-900 border border-sky-300 dark:border-sky-700 text-sky-950 dark:text-sky-100 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20'
                                      : 'bg-slate-50/70 dark:bg-slate-800/50 hover:bg-slate-100/90 dark:hover:bg-slate-800/80 focus:bg-white dark:focus:bg-slate-900 border border-slate-200/80 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600 focus:border-indigo-500 dark:focus:border-indigo-400 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 placeholder:text-gray-400 dark:placeholder:text-slate-500'
                            }`}
                            placeholder={isMissing ? "Enter AWB..." : "AWB..."}
                          />
                          <div className="absolute right-1.5 sm:right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-auto">
                            {isInferred && (
                              <span 
                                className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[8px] sm:text-[9px] font-black uppercase tracking-wider bg-sky-600 text-white shadow-xs cursor-help shrink-0"
                                title={row.inferenceReason || "Low visibility scan: characters inferred based on document context"}
                              >
                                <EyeIcon className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                                <span className="hidden sm:inline">Inferred</span>
                              </span>
                            )}
                            {isDuplicateAwb && (
                              <span className="inline-flex items-center px-1 py-0.5 rounded text-[8px] sm:text-[9px] font-black uppercase tracking-wider bg-orange-600 text-white shrink-0 shadow-xs" title="Duplicate AWB">
                                <span className="hidden sm:inline">Dup</span>
                                <span className="sm:hidden">!</span>
                              </span>
                            )}
                          </div>
                        </div>
                     </td>
                     <td className={`px-2 sm:px-4 py-2 sm:py-4 ${showMobileDescription ? 'table-cell min-w-[120px]' : 'hidden sm:table-cell sm:min-w-[140px] sm:w-44'}`}>
                        <input 
                          type="text" 
                          value={row.description} 
                          onChange={(e) => updateRow(row.id, { description: e.target.value })} 
                          className={`w-full bg-transparent font-medium text-xs sm:text-sm focus:outline-none transition-colors ${
                            isMissing 
                              ? 'text-rose-900 dark:text-rose-200 placeholder:text-rose-400/80 font-bold' 
                              : 'text-gray-600 dark:text-slate-300 focus:text-indigo-600 dark:focus:text-indigo-400 placeholder-gray-300 dark:placeholder-slate-500'
                          }`} 
                          placeholder={isMissing ? "Enter description..." : "Description..."} 
                        />
                     </td>
                     <td className="px-1 sm:px-2.5 py-2 sm:py-4 w-9 sm:w-24">
                        <div className="flex items-center justify-center sm:justify-start">
                          {/* Mobile: compact P / D toggle button */}
                          <button
                            type="button"
                            onClick={() => updateRow(row.id, { type: row.type === ItemType.PARCEL ? ItemType.DOCUMENT : ItemType.PARCEL })}
                            className={`sm:hidden w-7 h-7 rounded-lg text-xs font-black flex items-center justify-center transition-all active:scale-90 shadow-xs ${
                              row.type === ItemType.PARCEL 
                                ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700' 
                                : 'bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-200 border border-blue-300 dark:border-blue-700'
                            }`}
                            title={`Tap to switch type (Current: ${row.type === ItemType.PARCEL ? 'Parcel (P)' : 'Document (D)'})`}
                            aria-label={`Switch type: ${row.type}`}
                          >
                            {row.type === ItemType.PARCEL ? 'P' : 'D'}
                          </button>

                          {/* Desktop: dropdown */}
                          <select 
                            value={row.type} 
                            onChange={(e) => updateRow(row.id, { type: e.target.value as ItemType })} 
                            className="hidden sm:block bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-200 rounded-lg px-2 py-1 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
                          >
                            <option value={ItemType.PARCEL}>Parcel</option>
                            <option value={ItemType.DOCUMENT}>Document</option>
                          </select>
                        </div>
                     </td>
                     <td className="px-1 sm:px-3 py-2 sm:py-4 text-right w-14 sm:w-24">
                       <div className="flex items-center justify-end">
                         <input 
                           id={`input-weight-${row.id}`}
                           type="number" step="0.01"
                           value={row.weight || ''} 
                           onChange={(e) => updateRow(row.id, { weight: parseFloat(e.target.value) || 0 })} 
                           onFocus={() => {
                             setActiveTargetRowId(row.id);
                             setActiveTargetField('weight');
                           }}
                           className={`w-10 sm:w-16 text-right bg-transparent font-bold text-xs sm:text-sm focus:outline-none transition-colors ${
                             isMissing 
                               ? 'text-rose-900 dark:text-rose-200 placeholder:text-rose-400' 
                               : isIncompleteWeight 
                                 ? 'text-amber-700 dark:text-amber-300 font-black' 
                                 : 'text-gray-900 dark:text-white focus:text-indigo-600 dark:focus:text-indigo-400 placeholder-gray-300 dark:placeholder-slate-500'
                           }`} 
                           placeholder="0"
                         />
                         <span className="text-[10px] sm:text-xs text-gray-400 dark:text-slate-400 font-bold ml-0.5 sm:ml-1">kg</span>
                         {isIncompleteWeight && (
                           <span 
                             className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-amber-600 text-white shrink-0 shadow-xs ml-1.5"
                             title="Parcel missing weight"
                           >
                             Missing Wt
                           </span>
                         )}
                       </div>
                     </td>
                     <td className="px-1 sm:px-3 py-2 sm:py-4 text-right w-12 sm:w-24">
                        <div className="flex flex-col items-end">
                          <div className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white">₹{row.rate.toFixed(2)}</div>
                          <div className="hidden sm:block text-[10px] text-gray-400 dark:text-slate-400 font-medium truncate max-w-[150px]">{row.breakdown}</div>
                        </div>
                     </td>
                     <td className="px-1 sm:px-3 py-2 sm:py-4 text-right w-14 sm:w-24">
                        <div className="text-xs sm:text-sm font-black text-indigo-900 dark:text-indigo-300">₹{row.amount.toFixed(2)}</div>
                     </td>
                     <td className="px-1 sm:px-3 py-2 sm:py-4 text-right w-8 sm:w-24">
                        {isDeleteModeActive ? (
                          <button 
                            type="button"
                            onClick={() => setRowToDelete(row)} 
                            title={`Delete row #${row.slNo} (${row.serialNo || 'Line item'})`}
                            aria-label={`Delete row #${row.slNo}`}
                            className="inline-flex items-center justify-center p-1.5 sm:p-2 rounded-lg sm:rounded-xl text-rose-500 bg-rose-50/80 hover:bg-rose-100 hover:text-rose-700 border border-rose-200/70 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900/60 dark:hover:bg-rose-900/60 dark:hover:text-rose-200 reading-delete-btn transition-all cursor-pointer shadow-xs active:scale-95 hover:scale-105"
                          >
                            <TrashIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setIsDeleteModeActive(true);
                              setStatus({
                                type: 'info',
                                message: 'Delete mode activated. You can now click any row delete button.'
                              });
                            }}
                            title="Delete mode is locked. Click to activate delete mode"
                            aria-label="Delete mode is locked. Click to activate delete mode"
                            className="inline-flex items-center justify-center p-1.5 sm:p-2 rounded-lg sm:rounded-xl text-slate-400 dark:text-slate-500 bg-slate-100/70 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 reading-locked-btn transition-all cursor-pointer hover:border-slate-300 dark:hover:border-slate-600 hover:text-slate-600 dark:hover:text-slate-300 opacity-70 hover:opacity-100"
                          >
                            <LockClosedIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                          </button>
                        )}
                     </td>
                   </tr>
                 );
               })}
             </tbody>
           </table>
         </div>
         <button onClick={addRow} className="w-full py-4 bg-gray-50 dark:bg-slate-800/80 text-gray-500 dark:text-slate-400 font-bold hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all flex items-center justify-center gap-2 text-sm border-t border-gray-100 dark:border-slate-700 cursor-pointer"><PlusIcon className="h-5 w-5"/> Add Line Item</button>
      </div>
    </div>
  );
};

  const themeClasses = {
    light: 'bg-slate-50 text-slate-900',
    dark: 'dark bg-slate-950 text-slate-100',
    reading: 'reading bg-amber-50/60 text-slate-800'
  };

  const toggleFolderSelection = (folderId: string) => {
    setSelectedFinalFolderIds(prev => 
      prev.includes(folderId) ? prev.filter(id => id !== folderId) : [...prev, folderId]
    );
  };

  const handleAddManualDocEntry = (entry: Omit<ManualDocManifest, 'id' | 'createdAt'>) => {
    const now = Date.now();
    const newDoc: ManualDocManifest = {
      ...entry,
      id: `doc-manual-${now}-${Math.random().toString(36).substring(2, 7)}`,
      createdAt: now,
      updatedAt: now
    };
    const nextDocs = [newDoc, ...manualDocEntries];
    setManualDocEntries(nextDocs);
    if (cloudMeta.autoSyncEnabled && cloudMeta.isOnline) {
      saveFinalPdState({
        channelKey: syncChannelKey,
        finalBillOverrides,
        manualDocEntries: nextDocs,
      }).catch(() => {});
    }
    setStatus({
      type: 'success',
      message: `Document Manifest added for ${entry.manifestDate} (${entry.docCount} docs).`
    });
  };

  const handleDeleteManualDocEntry = (id: string) => {
    recordDeletedManualDocIds(id);
    const nextDocs = manualDocEntries.filter(d => d.id !== id);
    setManualDocEntries(nextDocs);
    const nextOverrides = { ...finalBillOverrides };
    delete nextOverrides[id];
    setFinalBillOverrides(nextOverrides);
    if (cloudMeta.autoSyncEnabled && cloudMeta.isOnline) {
      saveFinalPdState({
        channelKey: syncChannelKey,
        finalBillOverrides: nextOverrides,
        manualDocEntries: nextDocs,
      }).catch(() => {});
    }
    setStatus({
      type: 'info',
      message: 'Document Manifest entry removed.'
    });
  };

  const handleUpdateManualDocEntry = (id: string, updates: Partial<ManualDocManifest>) => {
    const now = Date.now();
    const nextDocs = manualDocEntries.map(d => d.id === id ? { ...d, ...updates, updatedAt: now } : d);
    setManualDocEntries(nextDocs);
    if (cloudMeta.autoSyncEnabled && cloudMeta.isOnline) {
      saveFinalPdState({
        channelKey: syncChannelKey,
        finalBillOverrides,
        manualDocEntries: nextDocs,
      }).catch(() => {});
    }
  };

  const handleUpdateOverride = (manifestId: string, override: ManifestOverride) => {
    const now = Date.now();
    setFinalBillOverrides(prev => {
      const next = {
        ...prev,
        [manifestId]: {
          ...(prev[manifestId] || {}),
          ...override,
          updatedAt: now
        }
      };
      if (cloudMeta.autoSyncEnabled && cloudMeta.isOnline) {
        saveFinalPdState({
          channelKey: syncChannelKey,
          finalBillOverrides: next,
          manualDocEntries,
        }).catch(() => {});
      }
      return next;
    });
  };

  const handleResetOverride = (manifestId: string) => {
    setFinalBillOverrides(prev => {
      const next = { ...prev };
      delete next[manifestId];
      if (cloudMeta.autoSyncEnabled && cloudMeta.isOnline) {
        saveFinalPdState({
          channelKey: syncChannelKey,
          finalBillOverrides: next,
          manualDocEntries,
        }).catch(() => {});
      }
      return next;
    });
    setStatus({
      type: 'info',
      message: 'Reverted to original P Manifest values.'
    });
  };

  const renderFinalManifestSection = () => {
    return (
      <FinalManifestSection
        folders={folders}
        selectedFolderIds={selectedFinalFolderIds}
        onToggleFolder={toggleFolderSelection}
        report={modernBillingReport}
        overrides={finalBillOverrides}
        onUpdateOverride={handleUpdateOverride}
        onResetOverride={handleResetOverride}
        manualDocEntries={manualDocEntries}
        onAddManualDocEntry={handleAddManualDocEntry}
        onDeleteManualDocEntry={handleDeleteManualDocEntry}
        onUpdateManualDocEntry={handleUpdateManualDocEntry}
        config={globalConfig}
        onNavigateToFinalBill={() => setDashboardTab('final')}
      />
    );
  };

  const renderFinalBillingSection = () => {
    return (
      <div className="p-4 md:p-8 animate-in fade-in duration-500">
        {/* Folder Selection Grid */}
        <div className="mb-8">
           <h3 className="text-sm font-black text-gray-500 dark:text-slate-400 uppercase tracking-widest mb-4">Available Folders</h3>
           <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {folders.map(folder => {
                 const isSelected = selectedFinalFolderIds.includes(folder.id);
                 return (
                    <button 
                       key={folder.id} 
                       onClick={() => toggleFolderSelection(folder.id)}
                       className={`p-4 rounded-xl border-2 text-left transition-all ${isSelected ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 ring-2 ring-indigo-200 dark:ring-indigo-900' : 'border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-indigo-200 dark:hover:border-slate-700'}`}
                    >
                       <div className={`flex items-center justify-between mb-2 ${isSelected ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-300 dark:text-slate-600'}`}>
                          <FolderIcon className="h-5 w-5" />
                          {isSelected && <CheckCircleIcon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />}
                       </div>
                       <div className={`font-bold text-sm truncate ${isSelected ? 'text-indigo-900 dark:text-indigo-200' : 'text-gray-600 dark:text-slate-300'}`}>{folder.name}</div>
                    </button>
                 )
              })}
           </div>
           {folders.length === 0 && <div className="text-gray-400 dark:text-slate-500 text-sm italic">No folders created yet.</div>}
        </div>

        {/* Report View */}
        {modernBillingReport ? (
           <div className="bg-white dark:bg-slate-900 rounded-[2rem] shadow-xl border border-gray-100 dark:border-slate-800 overflow-hidden relative">
              {/* Toolbar */}
              <div className="p-4 sm:p-5 md:p-6 border-b border-gray-100 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 bg-gray-50/50 dark:bg-slate-800/40 flex-wrap md:flex-nowrap">
                 <div className="flex gap-2.5 sm:gap-3 md:gap-4 items-end flex-nowrap shrink-0 overflow-x-auto max-w-full pb-1 sm:pb-0">
                    <div className="shrink-0">
                       <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-400 block mb-1">Month</label>
                       <input className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-2.5 sm:px-3 py-1 text-xs sm:text-sm font-bold w-24 sm:w-28 md:w-32 focus:outline-none focus:border-indigo-500" placeholder="e.g. October" value={reportMeta.month} onChange={e => setReportMeta({...reportMeta, month: e.target.value})} />
                    </div>
                    <div className="shrink-0">
                       <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-400 block mb-1">Agency</label>
                       <input className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-2.5 sm:px-3 py-1 text-xs sm:text-sm font-bold w-28 sm:w-32 md:w-36 focus:outline-none focus:border-indigo-500" placeholder="Agency Name" value={reportMeta.agency} onChange={e => setReportMeta({...reportMeta, agency: e.target.value})} />
                    </div>
                    <div className="shrink-0">
                       <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-400 block mb-1">Area</label>
                       <input className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-2.5 sm:px-3 py-1 text-xs sm:text-sm font-bold w-24 sm:w-28 md:w-32 focus:outline-none focus:border-indigo-500" placeholder="Area" value={reportMeta.area} onChange={e => setReportMeta({...reportMeta, area: e.target.value})} />
                    </div>
                 </div>
                 
                 <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 flex-nowrap">
                    <button
                       onClick={handleOpenPdfPreview}
                       className="bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/80 text-indigo-700 dark:text-indigo-300 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg font-black text-xs flex items-center shadow-xs hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-all cursor-pointer whitespace-nowrap shrink-0"
                       title="Open native in-app PDF preview viewer"
                    >
                       <EyeIcon className="h-4 w-4 mr-1 sm:mr-1.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                       <span>PDF Preview</span>
                    </button>
                    <button 
                       onClick={() => setIsFinalBillEditing(!isFinalBillEditing)} 
                       className={`px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg font-bold text-xs flex items-center gap-1.5 sm:gap-2 transition-all whitespace-nowrap shrink-0 ${isFinalBillEditing ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300' : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700'}`}
                    >
                       <PencilSquareIcon className="h-4 w-4 shrink-0" /> 
                       <span>{isFinalBillEditing ? 'Done Editing' : 'Edit Values'}</span>
                    </button>
                    <div className="relative shrink-0" ref={finalExportRef}>
                        <button onClick={() => setIsFinalExportOpen(!isFinalExportOpen)} className="bg-indigo-600 text-white px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-black text-xs flex items-center shadow-lg shadow-indigo-100 dark:shadow-none hover:bg-indigo-700 transition-all whitespace-nowrap"><ArrowDownTrayIcon className="h-4 w-4 mr-1 sm:mr-2 shrink-0" /> Export Report</button>
                        {isFinalExportOpen && (
                            <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-gray-100 dark:border-slate-700 py-2 z-50">
                                <button onClick={handleExportModernExcel} className="w-full px-4 py-2 text-left text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center"><DocumentTextIcon className="h-4 w-4 mr-2 text-emerald-500"/> Excel (CSV)</button>
                                <button onClick={handleExportModernJson} className="w-full px-4 py-2 text-left text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center"><CodeBracketIcon className="h-4 w-4 mr-2 text-indigo-500"/> JSON Data</button>
                                <button onClick={handleDownloadPDF} className="w-full px-4 py-2 text-left text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center"><DocumentIcon className="h-4 w-4 mr-2 text-red-500"/> Download PDF</button>
                                <button 
                                  onClick={handleOpenPdfPreview} 
                                  className="w-full px-4 py-2.5 text-left text-xs font-bold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 flex items-center justify-between border-t border-gray-100 dark:border-slate-700/80 transition-colors group cursor-pointer"
                                  title="Preview exact PDF statement inside the app before downloading or printing"
                                >
                                  <div className="flex items-center">
                                    <PrinterIcon className="h-4 w-4 mr-2 text-indigo-600 dark:text-indigo-400 group-hover:scale-110 transition-transform"/>
                                    <span>Print / PDF Preview</span>
                                  </div>
                                  <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-mono">View</span>
                                </button>
                            </div>
                        )}
                    </div>
                 </div>
              </div>

              {/* Modern Table */}
              <div className="overflow-x-auto">
                 <table className="w-full text-left border-collapse">
                    <thead>
                       <tr className="bg-gray-50 dark:bg-slate-800/80 border-b border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400">
                          <th className="p-3 text-[10px] font-black uppercase tracking-widest text-center w-12">#</th>
                          <th className="p-3 text-[10px] font-black uppercase tracking-widest group/header hover:bg-gray-100 dark:hover:bg-slate-700/50 transition-colors w-32">
                              <div className="flex items-center">Date / Ref <FontSizeControls col="date" /></div>
                          </th>
                          <th className="p-3 text-[10px] font-black uppercase tracking-widest text-center group/header hover:bg-gray-100 dark:hover:bg-slate-700/50 transition-colors w-24">
                              <div className="flex items-center justify-center">Units <FontSizeControls col="units" /></div>
                          </th>
                          <th className="p-3 text-[10px] font-black uppercase tracking-widest w-40 group/header hover:bg-gray-100 dark:hover:bg-slate-700/50 transition-colors text-slate-600 dark:text-slate-300">
                              <div className="flex items-center">Weight Detail <FontSizeControls col="weight" /></div>
                          </th>
                          <th className="p-3 text-[10px] font-black uppercase tracking-widest group/header hover:bg-gray-100 dark:hover:bg-slate-700/50 transition-colors text-slate-600 dark:text-slate-300">
                              <div className="flex items-center">Calculation Logic <FontSizeControls col="amount" /></div>
                          </th>
                          <th className="p-3 text-[10px] font-black uppercase tracking-widest text-right w-24">Total</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                       {modernBillingReport.lines.map((line, idx) => {
                           const override = line.overrides || {};
                           return (
                               <tr key={line.manifest.id} className="hover:bg-indigo-50/10 dark:hover:bg-slate-800/30 transition-colors">
                                  <td className="p-3 text-center text-xs font-bold text-gray-400 dark:text-slate-500 border-r border-gray-100 dark:border-slate-800">{idx + 1}</td>
                                  <td className="p-3 border-r border-gray-100 dark:border-slate-800 align-top" style={{ fontSize: `${fontSizes.date}px` }}>
                                     {isFinalBillEditing ? (
                                         <div className="space-y-1">
                                             <input className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-slate-900 dark:text-white rounded px-1 text-xs" value={line.manifest.manifestDate} onChange={(e) => handleUpdateOverride(line.manifest.id, { date: e.target.value })} />
                                             <input className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-slate-900 dark:text-white rounded px-1 text-xs" value={line.manifest.manifestNo} onChange={(e) => handleUpdateOverride(line.manifest.id, { no: e.target.value })} />
                                         </div>
                                     ) : (
                                         <div>
                                            <div className="font-bold text-gray-900 dark:text-white">{line.manifest.manifestDate}</div>
                                            <div className="font-medium text-gray-500 dark:text-slate-400">{line.manifest.manifestNo}</div>
                                         </div>
                                     )}
                                  </td>
                                  <td className="p-3 border-r border-gray-100 dark:border-slate-800 text-center align-top" style={{ fontSize: `${fontSizes.units}px` }}>
                                     {isFinalBillEditing ? (
                                         <div className="grid grid-cols-2 gap-1">
                                             <div className="text-[9px] text-gray-400 dark:text-slate-400 text-right pr-1">p</div>
                                             <input type="number" className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-slate-900 dark:text-white rounded px-1 text-xs" value={line.summary.smallParcelCount} onChange={(e) => handleUpdateOverride(line.manifest.id, { pCount: parseInt(e.target.value) || 0 })} />
                                             <div className="text-[9px] text-gray-400 dark:text-slate-400 text-right pr-1">P</div>
                                             <input type="number" className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-slate-900 dark:text-white rounded px-1 text-xs" value={line.summary.bigParcelCount} onChange={(e) => handleUpdateOverride(line.manifest.id, { PCount: parseInt(e.target.value) || 0 })} />
                                             <div className="text-[9px] text-gray-400 dark:text-slate-400 text-right pr-1">D</div>
                                             <input type="number" className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-slate-900 dark:text-white rounded px-1 text-xs" value={line.summary.docCount} onChange={(e) => handleUpdateOverride(line.manifest.id, { dCount: parseInt(e.target.value) || 0 })} />
                                         </div>
                                     ) : (
                                         <div className="space-y-0.5 font-bold text-gray-600 dark:text-slate-300">
                                            <div title="Small Parcels"><span className="text-gray-400 dark:text-slate-500 text-[10px] mr-1">p:</span>{line.summary.smallParcelCount}</div>
                                            <div title="Big Parcels"><span className="text-gray-400 dark:text-slate-500 text-[10px] mr-1">P:</span>{line.summary.bigParcelCount}</div>
                                            <div title="Documents"><span className="text-gray-400 dark:text-slate-500 text-[10px] mr-1">D:</span>{line.summary.docCount}</div>
                                         </div>
                                     )}
                                  </td>
                                  <td className="p-3 border-r border-gray-100 dark:border-slate-800 align-top text-slate-800 dark:text-slate-200" style={{ fontSize: `${fontSizes.weight}px` }}>
                                     <div className="space-y-1">
                                        <div className="flex justify-between items-center">
                                            <span className="text-gray-500 dark:text-slate-400 font-bold mr-2">p:</span>
                                            {isFinalBillEditing ? (
                                                <input type="number" className="w-16 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-slate-900 dark:text-white rounded px-1 text-xs font-semibold" value={line.summary.smallParcelTotalWeight} onChange={(e) => handleUpdateOverride(line.manifest.id, { pWeight: parseFloat(e.target.value) || 0 })} />
                                            ) : (
                                                <span className="font-bold text-gray-900 dark:text-slate-100">{line.summary.smallParcelTotalWeight} kg</span>
                                            )}
                                        </div>
                                        {line.summary.heavyWeights.length > 0 || isFinalBillEditing ? (
                                            <div className="bg-amber-50/90 dark:bg-amber-950/40 rounded p-1.5 border border-amber-200/90 dark:border-amber-800/50">
                                                <div className="text-[9px] text-amber-800 dark:text-amber-300 font-bold mb-0.5">Heavy (P) Detail</div>
                                                {isFinalBillEditing ? (
                                                    <input 
                                                        type="text" 
                                                        className="w-full bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-700 text-slate-900 dark:text-white rounded px-1 text-xs font-mono" 
                                                        placeholder="e.g. 15+20+30"
                                                        value={override.PDetail !== undefined ? override.PDetail : line.summary.heavyWeights.join('+')}
                                                        onChange={(e) => handleUpdateOverride(line.manifest.id, { PDetail: e.target.value })}
                                                    />
                                                ) : (
                                                    <div className="text-amber-950 dark:text-amber-200 font-mono text-xs break-all font-medium">
                                                        {line.summary.heavyWeights.join('+')} = <strong className="text-amber-950 dark:text-amber-100 font-bold">{line.summary.heavyTotal}kg</strong>
                                                    </div>
                                                )}
                                            </div>
                                        ) : null}
                                        <div className="text-[10px] text-gray-500 dark:text-slate-400 font-bold border-t border-gray-100 dark:border-slate-800 pt-1 mt-1">
                                            Total: <span className="text-slate-800 dark:text-slate-200 font-semibold">{line.summary.totalWeight} kg</span>
                                        </div>
                                     </div>
                                  </td>
                                  <td className="p-3 border-r border-gray-100 dark:border-slate-800 align-top" style={{ fontSize: `${fontSizes.amount}px` }}>
                                      <div className="space-y-1 font-medium">
                                          {line.summary.slab1Total > 0 && (
                                              <div className="flex justify-between items-center text-indigo-950 dark:text-indigo-200 bg-indigo-50/80 dark:bg-indigo-950/60 border border-indigo-100/80 dark:border-indigo-800/50 px-1.5 py-0.5 rounded transition-colors">
                                                  <span><span className="font-bold text-indigo-600 dark:text-indigo-400 mr-1">S1:</span>{line.summary.s1w}kg * {line.manifest.config.parcelSlab1Rate}</span>
                                                  <span className="font-black text-indigo-950 dark:text-indigo-100">₹{line.summary.slab1Total}</span>
                                              </div>
                                          )}
                                          {line.summary.slab2Total > 0 && (
                                              <div className="flex justify-between items-center text-indigo-950 dark:text-indigo-200 bg-indigo-50/80 dark:bg-indigo-950/60 border border-indigo-100/80 dark:border-indigo-800/50 px-1.5 py-0.5 rounded transition-colors">
                                                  <span><span className="font-bold text-indigo-600 dark:text-indigo-400 mr-1">S2:</span>{line.summary.s2w}kg * {line.manifest.config.parcelSlab2Rate}</span>
                                                  <span className="font-black text-indigo-950 dark:text-indigo-100">₹{line.summary.slab2Total}</span>
                                              </div>
                                          )}
                                          {line.summary.slab3Total > 0 && (
                                              <div className="flex justify-between items-center text-indigo-950 dark:text-indigo-200 bg-indigo-50/80 dark:bg-indigo-950/60 border border-indigo-100/80 dark:border-indigo-800/50 px-1.5 py-0.5 rounded transition-colors">
                                                  <span><span className="font-bold text-indigo-600 dark:text-indigo-400 mr-1">S3:</span>{line.summary.s3w}kg * {line.manifest.config.parcelSlab3Rate}</span>
                                                  <span className="font-black text-indigo-950 dark:text-indigo-100">₹{line.summary.slab3Total}</span>
                                              </div>
                                          )}
                                          {line.summary.docTotal > 0 && (
                                              <div className="flex justify-between items-center text-emerald-950 dark:text-emerald-200 bg-emerald-50/80 dark:bg-emerald-950/60 border border-emerald-100/80 dark:border-emerald-800/50 px-1.5 py-0.5 rounded transition-colors">
                                                  <span><span className="font-bold text-emerald-600 dark:text-emerald-400 mr-1">Doc:</span>{line.summary.docCount} * {line.manifest.config.documentRate}</span>
                                                  <span className="font-black text-emerald-950 dark:text-emerald-100">₹{line.summary.docTotal}</span>
                                              </div>
                                          )}
                                      </div>
                                  </td>
                                  <td className="p-3 align-top text-right">
                                      <div className="text-sm font-black text-gray-900 dark:text-white">₹{line.summary.totalAmount.toLocaleString()}</div>
                                  </td>
                               </tr>
                           )
                       })}
                    </tbody>
                    <tfoot className="bg-slate-900 dark:bg-slate-950 text-white border-t border-slate-700">
                        <tr>
                            <td colSpan={2} className="py-2 px-3 font-bold text-right uppercase tracking-widest text-xs text-slate-300">Grand Totals</td>
                            <td className="py-2 px-3 text-center text-xs font-bold">
                                <div className="text-indigo-300">p: {modernBillingReport.totals.p_small}</div>
                                <div className="text-indigo-300">P: {modernBillingReport.totals.P_big}</div>
                                <div className="text-emerald-300">D: {modernBillingReport.totals.d}</div>
                            </td>
                            <td className="py-2 px-3 text-xs">
                                <div className="font-bold text-white">Total Wt: {modernBillingReport.totals.w} kg</div>
                                <div className="text-[11px] text-slate-300">p wt: {modernBillingReport.totals.sw}</div>
                                <div className="text-[11px] text-slate-300">P wt: {modernBillingReport.totals.hw}</div>
                            </td>
                            <td className="py-2 px-3 text-xs text-right text-slate-300 space-y-0.5">
                                <div>Slab 1 Sum: <span className="text-white font-semibold">₹{modernBillingReport.totals.s1}</span></div>
                                <div>Slab 2 Sum: <span className="text-white font-semibold">₹{modernBillingReport.totals.s2}</span></div>
                                <div>Slab 3 Sum: <span className="text-white font-semibold">₹{modernBillingReport.totals.s3}</span></div>
                                <div>Doc Sum: <span className="text-white font-semibold">₹{modernBillingReport.totals.dt}</span></div>
                            </td>
                            <td className="py-2 px-3 text-right text-lg font-black text-white">
                                ₹{modernBillingReport.totals.grand.toLocaleString()}
                            </td>
                        </tr>
                    </tfoot>
                 </table>
              </div>
           </div>
        ) : (
           <div className="text-center py-20 bg-gray-50 dark:bg-slate-900/50 border-2 border-dashed border-gray-200 dark:border-slate-800 rounded-[2rem]">
              <ChartBarIcon className="h-16 w-16 text-gray-300 dark:text-slate-600 mx-auto mb-4" />
              <h3 className="text-xl font-black text-gray-400 dark:text-slate-400">No Data Selected</h3>
              <p className="text-gray-400 dark:text-slate-500 mt-2">Select folders above to generate report</p>
           </div>
        )}

        {/* Native In-App PDF Viewer Modal */}
        <PdfViewerModal
          isOpen={isPdfPreviewOpen && !!pdfPreviewBytes && !!modernBillingReport}
          onClose={handleClosePdfPreview}
          pdfData={pdfPreviewBytes}
          fileName={`Statement_${modernBillingReport?.folderName || 'Billing'}.pdf`}
          onDownload={handleDownloadPDF}
          onEdit={() => {
            handleClosePdfPreview();
            setIsFinalBillEditing(true);
          }}
          fontScale={pdfFontScale}
          onChangeFontScale={handleChangePdfFontScale}
        />
      </div>
    );
  };

  return (
    <div className={`min-h-screen flex flex-col font-inter transition-colors duration-300 safe-area-bottom ${themeClasses[appTheme]}`} style={{ fontSize: `${appScale}%` }}>
      <nav id="app-navbar" data-component="navbar" className="sticky top-0 z-40 safe-area-top px-2 sm:px-4 md:px-6 lg:px-8 py-1.5 sm:py-2.5 md:py-3 flex flex-row items-center justify-between gap-1 sm:gap-3 md:gap-4 shadow-xs backdrop-blur-xl bg-white/95 dark:bg-slate-900/95 border-b border-slate-200/80 dark:border-slate-800 transition-all no-print select-none">
        {/* Component 1 (Left): Small App Icon with 'JC' written in short below it */}
        <div id="nav-brand-logo" className="flex flex-col items-center justify-center shrink-0 relative group">
           <div 
             className="bg-gradient-to-br from-indigo-500 to-indigo-700 hover:from-indigo-600 hover:to-indigo-800 p-1.5 sm:p-2 rounded-xl shadow-xs shadow-indigo-300/40 dark:shadow-none active:scale-95 hover:scale-105 transition-all cursor-pointer flex items-center justify-center ring-1 ring-indigo-400/30"
             onClick={() => { setView('dashboard'); setCurrentFolderId(null); setSelectedFinalFolderIds([]); }}
             title="JC - Home / Dashboard"
             role="button"
             tabIndex={0}
           >
             <CalculatorIcon className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
           </div>
           <span 
             onClick={(e) => {
               e.stopPropagation();
               triggerNoticeBanner();
             }}
             className="text-[9px] sm:text-[10px] font-black text-slate-700 dark:text-slate-300 tracking-wider leading-none mt-1 cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 p-1 -m-0.5 rounded"
             title="JC - Tap to show or hide guidance"
             role="button"
             tabIndex={0}
           >
             JC
           </span>

           {/* Instruction Notice Banner / Comment - Displayed ONLY on user tap */}
           {isNoticeVisible && (
             <div 
               className={`absolute left-0 top-full mt-2 z-50 transition-all duration-500 ease-out transform ${
                 isNoticeFadingUp 
                   ? 'opacity-0 -translate-y-2 pointer-events-none' 
                   : 'opacity-100 translate-y-0'
               }`}
             >
               <div 
                 onClick={() => {
                   setIsNoticeVisible(false);
                   setIsNoticeFadingUp(false);
                 }}
                 className="relative flex items-center gap-2 px-3 py-1.5 bg-slate-900/95 dark:bg-slate-800/95 text-white rounded-xl shadow-xl shadow-slate-900/25 border border-indigo-500/40 backdrop-blur-md max-w-[calc(100vw-2rem)] sm:max-w-none cursor-pointer"
                 title="Tap to dismiss"
               >
                 {/* Comment pointer notch directed up */}
                 <div className="absolute -top-1 left-3.5 w-2.5 h-2.5 bg-slate-900/95 dark:bg-slate-800/95 border-t border-l border-indigo-500/40 rotate-45 pointer-events-none" />
                 
                 <span className="relative flex h-2 w-2 shrink-0">
                   <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                   <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                 </span>
                 <div className="flex items-center gap-1.5 text-xs whitespace-nowrap overflow-hidden text-ellipsis mr-1">
                   <span className="font-black text-indigo-300">Consolidated Billing:</span>
                   <span className="text-slate-200 font-medium text-[11px] sm:text-xs">Select folders to generate a combined monthly report</span>
                 </div>
                 <button
                   type="button"
                   onClick={(e) => {
                     e.stopPropagation();
                     setIsNoticeVisible(false);
                     setIsNoticeFadingUp(false);
                   }}
                   className="text-slate-400 hover:text-white p-0.5 rounded transition-colors shrink-0 ml-1"
                   aria-label="Close guidance comment"
                 >
                   <XMarkIcon className="h-3.5 w-3.5" />
                 </button>
               </div>
             </div>
           )}
        </div>

        {/* Component 2 (Center): Switch Button (P Manifest / P + D Manifest / Final Bill tab switcher) in same horizontal row */}
        {view === 'dashboard' ? (
           <div id="nav-tabs-switcher" data-component="nav-switcher" className="flex items-center justify-center bg-slate-100/95 dark:bg-slate-800/95 rounded-full p-0.5 sm:p-1 border border-slate-200/90 dark:border-slate-700/90 shadow-inner gap-0.5 sm:gap-1 shrink-0">
              <button 
                id="nav-tab-p-manifest"
                data-tab="p-manifest"
                data-active={dashboardTab === 'history'}
                onClick={() => setDashboardTab('history')} 
                className={`rounded-full text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all duration-200 cursor-pointer whitespace-nowrap ${
                  dashboardTab === 'history' 
                    ? 'px-2.5 sm:px-4 py-1 sm:py-1.5 bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm ring-1 ring-slate-200/80 dark:ring-slate-700' 
                    : 'px-1.5 sm:px-4 py-1 sm:py-1.5 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-white hover:bg-white/40 dark:hover:bg-slate-750'
                }`}
                title="P Manifest"
              >
                <span className="sm:hidden">
                  {dashboardTab === 'history' ? 'P Manifest' : 'P Man'}
                </span>
                <span className="hidden sm:inline">
                  P Manifest
                </span>
              </button>
              <button 
                id="nav-tab-pd-manifest"
                data-tab="pd-manifest"
                data-active={dashboardTab === 'manifest'}
                onClick={() => setDashboardTab('manifest')} 
                className={`rounded-full text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all duration-200 cursor-pointer whitespace-nowrap ${
                  dashboardTab === 'manifest' 
                    ? 'px-2.5 sm:px-4 py-1 sm:py-1.5 bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm ring-1 ring-slate-200/80 dark:ring-slate-700' 
                    : 'px-1.5 sm:px-4 py-1 sm:py-1.5 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-white hover:bg-white/40 dark:hover:bg-slate-750'
                }`}
                title="P + D Manifest"
              >
                <span className="sm:hidden">
                  {dashboardTab === 'manifest' ? 'P + D Manifest' : 'P + D'}
                </span>
                <span className="hidden sm:inline">
                  P + D Manifest
                </span>
              </button>
              <button 
                id="nav-tab-final-bill"
                data-tab="final-bill"
                data-active={dashboardTab === 'final'}
                onClick={() => setDashboardTab('final')} 
                className={`rounded-full text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all duration-200 cursor-pointer whitespace-nowrap ${
                  dashboardTab === 'final' 
                    ? 'px-2.5 sm:px-4 py-1 sm:py-1.5 bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm ring-1 ring-slate-200/80 dark:ring-slate-700' 
                    : 'px-1.5 sm:px-4 py-1 sm:py-1.5 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-white hover:bg-white/40 dark:hover:bg-slate-750'
                }`}
                title="Final Bill"
              >
                <span className="sm:hidden">
                  {dashboardTab === 'final' ? 'Final Bill' : 'F Bill'}
                </span>
                <span className="hidden sm:inline">
                  Final Bill
                </span>
              </button>
           </div>
        ) : (
           <div className="flex items-center justify-center">
             <span className="text-xs sm:text-sm font-black text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800/80 px-3 py-1.5 rounded-full border border-slate-200/70 dark:border-slate-700/70 truncate max-w-[140px] sm:max-w-[220px]">
               {manifestMeta.manifestNo ? `Manifest #${manifestMeta.manifestNo}` : 'Billing Editor'}
             </span>
           </div>
        )}

        {/* Component 3 (Right): Action buttons in same horizontal row */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Minimized AI Extraction Status Pill in Navbar */}
          {isUploading && (
            <div 
              onClick={() => {
                if (isChunkingModalOpen) {
                  setChunkingInitialTab('queue');
                } else {
                  setIsAiMinimized(!isAiMinimized);
                }
              }}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-500/40 rounded-full cursor-pointer hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-all shadow-xs shrink-0 active:scale-95 group"
              title={isChunkingModalOpen ? "Batch extraction running in background. Click to view Tab 2 Queue." : "AI Extracting in background. Click to toggle full screen."}
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-600"></span>
              </span>
              <div className="flex items-center gap-1">
                <SparklesIcon className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 animate-spin" style={{ animationDuration: '3s' }} />
                <span className="text-[10px] sm:text-xs font-black text-indigo-700 dark:text-indigo-300 max-w-[70px] sm:max-w-[130px] truncate">
                  {loadingMessage}
                </span>
              </div>
              <ChevronUpIcon className={`h-3 w-3 text-indigo-500 group-hover:-translate-y-0.5 transition-transform ${isAiMinimized ? '' : 'rotate-180'}`} />
            </div>
          )}

          {/* Quick Stop Extraction Button in Navbar when AI is uploading */}
          {isUploading && (
            <button
              id="navbar-stop-extraction-btn"
              type="button"
              onClick={() => handleStopExtraction(currentExtractingSessionId || undefined)}
              className="flex items-center gap-1 px-2 sm:px-2.5 py-1 sm:py-1.5 bg-rose-50 dark:bg-rose-950/70 border border-rose-500/40 text-rose-600 dark:text-rose-400 rounded-full hover:bg-rose-100 dark:hover:bg-rose-900/60 text-[10px] sm:text-xs font-black cursor-pointer transition-all active:scale-95 shadow-xs shrink-0"
              title="Stop ongoing AI extraction"
            >
              <StopIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              <span>Stop</span>
            </button>
          )}

          {view === 'billing' ? (
            <div className="relative" ref={exportRef}>
              <button onClick={() => setIsExportOpen(!isExportOpen)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 md:px-5 py-2 md:py-2.5 rounded-xl md:rounded-full font-black text-xs md:text-sm flex items-center transition-all shadow-md shadow-indigo-100 dark:shadow-none active:scale-95">
                <ArrowDownTrayIcon className="h-4 w-4 mr-1 md:mr-2" />Export
              </button>
              {isExportOpen && (
                <div className="absolute right-0 mt-2 w-52 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-700 py-2 z-50 animate-in fade-in slide-in-from-top-2">
                  <button onClick={handleExportExcel} className="w-full px-5 py-3 text-left text-xs font-black text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-slate-700 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center transition-colors"><DocumentTextIcon className="h-4 w-4 mr-3 text-emerald-500" />Excel (CSV)</button>
                  <button onClick={handleExportJson} className="w-full px-5 py-3 text-left text-xs font-black text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-slate-700 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center transition-colors"><CodeBracketIcon className="h-4 w-4 mr-3 text-indigo-500" />JSON</button>
                  <button onClick={handleExportPdf} className="w-full px-5 py-3 text-left text-xs font-black text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-slate-700 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center transition-colors"><DocumentIcon className="h-4 w-4 mr-3 text-rose-500" />PDF</button>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Desktop view: clean horizontal action bar */}
              <div className="hidden md:flex items-center gap-1.5 sm:gap-2">
                {/* Theme Switch Button (Light / Dark Mode) */}
                <button 
                  onClick={() => handleSetTheme(appTheme === 'dark' ? 'light' : 'dark')}
                  className={`p-2 sm:p-2.5 rounded-full border-2 transition-all active:scale-95 shadow-xs ${
                    appTheme === 'dark' 
                      ? 'bg-slate-800 border-indigo-500/50 text-amber-300 hover:bg-slate-700 hover:border-indigo-400' 
                      : 'bg-white border-slate-200 text-slate-600 hover:text-indigo-600 hover:border-indigo-200'
                  }`}
                  title={appTheme === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
                  aria-label={appTheme === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
                >
                  {appTheme === 'dark' ? <SunIcon className="h-4 w-4 sm:h-5 sm:w-5" /> : <MoonIcon className="h-4 w-4 sm:h-5 sm:w-5" />}
                </button>

                {/* Recycle Bin Button */}
                <button 
                  onClick={() => setIsRecycleBinOpen(true)}
                  className={`relative p-2 sm:p-2.5 rounded-full border-2 transition-all active:scale-95 shadow-xs ${
                    recycleBin.length > 0 
                      ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-900/70 text-rose-600 dark:text-rose-400 hover:bg-rose-100 hover:border-rose-400 shadow-rose-100/50' 
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:border-rose-300'
                  }`}
                  title={`Recycle Bin (${recycleBin.length} items)`}
                  aria-label={`Recycle Bin (${recycleBin.length} items)`}
                >
                  <TrashIcon className="h-4 w-4 sm:h-5 sm:w-5" />
                  {recycleBin.length > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-rose-600 text-[10px] font-black text-white shadow-xs border-2 border-white dark:border-slate-900 pointer-events-none">
                      {recycleBin.length > 99 ? '99+' : recycleBin.length}
                    </span>
                  )}
                </button>

                {/* Chunking / Batch Pagination Button */}
                <button 
                  type="button"
                  onClick={() => setIsChunkingModalOpen(true)} 
                  className="relative p-2 sm:p-2.5 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white rounded-full shadow-md shadow-amber-200 dark:shadow-none transition-all hover:scale-105 cursor-pointer" 
                  title={`Chunking & Statement Pagination (${chunkRowsPerPage} rows/page)`} 
                  aria-label="Chunking & Statement Pagination"
                >
                  <BoltIcon className="h-4 w-4 sm:h-5 sm:w-5" />
                  <span className="absolute -top-1.5 -right-1.5 min-w-[17px] h-[17px] px-0.5 flex items-center justify-center rounded-full bg-slate-900 dark:bg-white text-[9px] font-black text-white dark:text-slate-900 shadow-xs border border-amber-400 pointer-events-none">
                    {chunkRowsPerPage}
                  </span>
                </button>

                {/* Captured Manifest Pages (Local Storage) Button */}
                <button 
                  id="home-navbar-captured-sessions-btn"
                  type="button"
                  onClick={() => setIsCapturedSessionsModalOpen(true)} 
                  className="relative p-2 sm:p-2.5 bg-indigo-50/80 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border-2 border-indigo-200/90 dark:border-indigo-800/80 text-indigo-600 dark:text-indigo-400 hover:border-indigo-300 dark:hover:border-indigo-500 rounded-full shadow-xs transition-all hover:scale-105 active:scale-95 cursor-pointer" 
                  title={`Captured Manifest Pages (Local Storage Vault) (${capturedSessionsStats.total} sessions)`} 
                  aria-label="Captured Manifest Pages (Local Storage Vault)"
                >
                  <DocumentDuplicateIcon className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-600 dark:text-indigo-400" />
                  {capturedSessionsStats.total > 0 && (
                    <span className={`absolute -top-1.5 -right-1.5 min-w-[17px] h-[17px] px-1 flex items-center justify-center rounded-full text-[9px] font-black text-white shadow-xs border-2 border-white dark:border-slate-900 pointer-events-none ${
                      capturedSessionsStats.failed > 0
                        ? 'bg-rose-600'
                        : capturedSessionsStats.ready > 0
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-indigo-600'
                    }`}>
                      {capturedSessionsStats.total > 99 ? '99+' : capturedSessionsStats.total}
                    </span>
                  )}
                  {capturedSessionsStats.failed > 0 && (
                    <span className="h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-900 absolute -top-0.5 -right-0.5 animate-ping" />
                  )}
                </button>

                {/* Dedicated Cloud Vault List Button */}
                <button 
                  type="button"
                  onClick={() => {
                    setCloudManagerInitialTab('cloud_items');
                    setIsCloudManagerModalOpen(true);
                  }} 
                  className="relative p-2 sm:p-2.5 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-300 dark:hover:border-indigo-500 rounded-full shadow-xs transition-all hover:scale-105 active:scale-95 cursor-pointer" 
                  title={`Dedicated Cloud Vault List (${cloudManifests.length} manifests, ${cloudBackups.length} backups)`} 
                  aria-label="Dedicated Cloud Vault List"
                >
                  <CloudIcon className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-600 dark:text-indigo-400" />
                  {(cloudManifests.length > 0 || cloudBackups.length > 0) && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[17px] h-[17px] px-1 flex items-center justify-center rounded-full bg-indigo-600 text-[9px] font-black text-white shadow-xs border-2 border-white dark:border-slate-900 pointer-events-none">
                      {cloudManifests.length + cloudBackups.length > 99 ? '99+' : cloudManifests.length + cloudBackups.length}
                    </span>
                  )}
                </button>

                {/* 1-Click PWA Desktop Install Button */}
                <PWAInstallButton variant="navbar" />

                {/* Settings Button */}
                <button onClick={() => setIsGlobalSettingsOpen(true)} className="p-2 sm:p-2.5 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-300 dark:hover:border-indigo-500 rounded-full shadow-xs transition-all hover:rotate-45 active:scale-95" title="App Settings" aria-label="App Settings">
                  <Cog6ToothIcon className="h-4 w-4 sm:h-5 sm:w-5" />
                </button>
              </div>

              {/* Mobile view: Compact PWA Install & Collapsible Div Component trigger */}
              <div id="mobile-nav-actions" data-component="mobile-actions-bar" className="md:hidden relative flex items-center gap-1.5" ref={mobileActionsMenuRef}>
                {/* 1-Click PWA Mobile Install Button */}
                <PWAInstallButton variant="compact" />

                {/* Trigger Div Component: Tapping toggles open and hide */}
                <div 
                  id="mobile-quick-actions-trigger"
                  data-component="mobile-actions-toggle"
                  onClick={() => setIsMobileActionsMenuOpen(!isMobileActionsMenuOpen)}
                  className={`p-2 sm:p-2.5 rounded-xl border-2 cursor-pointer select-none transition-all active:scale-95 shadow-xs flex items-center justify-center ${
                    isMobileActionsMenuOpen
                      ? 'bg-indigo-600 border-indigo-600 text-white shadow-indigo-200 dark:shadow-none'
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-indigo-300 dark:hover:border-indigo-600'
                  }`}
                  title="Toggle Quick Actions"
                  role="button"
                  tabIndex={0}
                  aria-expanded={isMobileActionsMenuOpen}
                >
                  <div className="relative flex items-center justify-center">
                    <Bars3Icon className="h-5 w-5" />
                    {recycleBin.length > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 w-2.5 h-2.5 bg-rose-500 rounded-full border-2 border-white dark:border-slate-900" />
                    )}
                  </div>
                </div>

                {/* Collapsible top-to-bottom list view */}
                {isMobileActionsMenuOpen && (
                  <div className="absolute right-0 mt-2 top-full w-68 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200/90 dark:border-slate-700/90 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150 backdrop-blur-md">
                    <div className="px-3.5 py-1.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">Quick Actions</span>
                      <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">Mobile Menu</span>
                    </div>

                    <div className="p-1.5 space-y-1">
                      {/* PWA Install Banner inside Mobile Menu */}
                      <div className="px-1 pt-1 pb-1.5 border-b border-slate-100 dark:border-slate-800/80">
                        <PWAInstallButton variant="full" />
                      </div>
                      {/* 1. Theme Switch Button in vertical list */}
                      <button
                        type="button"
                        onClick={() => {
                          handleSetTheme(appTheme === 'dark' ? 'light' : 'dark');
                          setIsMobileActionsMenuOpen(false);
                        }}
                        className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors group cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${appTheme === 'dark' ? 'bg-amber-500/10 text-amber-400' : 'bg-indigo-50 text-indigo-600'}`}>
                            {appTheme === 'dark' ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
                          </div>
                          <div>
                            <p className="text-xs font-black text-slate-800 dark:text-white">Appearance</p>
                            <p className="text-[11px] text-slate-400 dark:text-slate-400">Switch to {appTheme === 'dark' ? 'Light' : 'Dark'} Mode</p>
                          </div>
                        </div>
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                          appTheme === 'dark' 
                            ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300' 
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                        }`}>
                          {appTheme === 'dark' ? 'Dark' : 'Light'}
                        </span>
                      </button>

                      {/* 2. Recycle Bin Button in vertical list */}
                      <button
                        type="button"
                        onClick={() => {
                          setIsRecycleBinOpen(true);
                          setIsMobileActionsMenuOpen(false);
                        }}
                        className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/30 text-left transition-colors group cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
                            <TrashIcon className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="text-xs font-black text-slate-800 dark:text-white">Recycle Bin</p>
                            <p className="text-[11px] text-slate-400 dark:text-slate-400">Restore or delete files</p>
                          </div>
                        </div>
                        {recycleBin.length > 0 ? (
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-600 text-white shadow-xs">
                            {recycleBin.length}
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">
                            Empty
                          </span>
                        )}
                      </button>

                      {/* 3. Chunking / Statement Pagination Button in vertical list */}
                      <button
                        type="button"
                        onClick={() => {
                          setIsChunkingModalOpen(true);
                          setIsMobileActionsMenuOpen(false);
                        }}
                        className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-amber-50 dark:hover:bg-amber-950/30 text-left transition-colors group cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                            <BoltIcon className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="text-xs font-black text-slate-800 dark:text-white">Statement Chunking</p>
                            <p className="text-[11px] text-slate-400 dark:text-slate-400">Batch pagination setup</p>
                          </div>
                        </div>
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">
                          {chunkRowsPerPage}/page
                        </span>
                      </button>

                      {/* 4. Dedicated Cloud Vault List Button in vertical list */}
                      <button
                        type="button"
                        onClick={() => {
                          setCloudManagerInitialTab('cloud_items');
                          setIsCloudManagerModalOpen(true);
                          setIsMobileActionsMenuOpen(false);
                        }}
                        className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-left transition-colors group cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                            <CloudIcon className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="text-xs font-black text-slate-800 dark:text-white">Cloud Storage & Vault</p>
                            <p className="text-[11px] text-slate-400 dark:text-slate-400">Dedicated cloud file list & sync</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {cloudManifests.length > 0 ? (
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-indigo-600 text-white shadow-xs">
                              {cloudManifests.length}
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">
                              Empty
                            </span>
                          )}
                          <ChevronRightIcon className="h-4 w-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                        </div>
                      </button>

                      {/* 4.5 Captured Manifest Pages Local Vault in Mobile Menu */}
                      <button
                        id="mobile-menu-captured-sessions-btn"
                        type="button"
                        onClick={() => {
                          setIsCapturedSessionsModalOpen(true);
                          setIsMobileActionsMenuOpen(false);
                        }}
                        className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-left transition-colors group cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                            <DocumentDuplicateIcon className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="text-xs font-black text-slate-800 dark:text-white">Captured Pages Vault</p>
                            <p className="text-[11px] text-slate-400 dark:text-slate-400">Local storage manifest pages & retry</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                            capturedSessionsStats.failed > 0
                              ? 'bg-rose-600 text-white'
                              : capturedSessionsStats.ready > 0
                              ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                              : capturedSessionsStats.total > 0
                              ? 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                          }`}>
                            {capturedSessionsStats.total}
                          </span>
                          <ChevronRightIcon className="h-4 w-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                        </div>
                      </button>

                      {/* 5. App Settings Button in vertical list */}
                      <button
                        type="button"
                        onClick={() => {
                          setIsGlobalSettingsOpen(true);
                          setIsMobileActionsMenuOpen(false);
                        }}
                        className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors group cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 group-hover:rotate-45 transition-transform">
                            <Cog6ToothIcon className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="text-xs font-black text-slate-800 dark:text-white">App Settings</p>
                            <p className="text-[11px] text-slate-400 dark:text-slate-400">Rates, Prefs & Cloud Sync</p>
                          </div>
                        </div>
                        <ChevronRightIcon className="h-4 w-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </nav>
      {/* Offline Queue & Background Sync Monitor Banner */}
      <OfflineQueueBanner
        currentConfig={globalConfig}
        customApiKey={customApiKey}
        onManifestSynced={(syncedManifestNo) => {
          setStatus({
            type: 'success',
            message: `Offline scan auto-synced into Manifest #${syncedManifestNo}!`
          });
        }}
      />
      <main id="app-main-content" data-component="main-container" className="flex-1 flex flex-col pb-20 w-full max-w-7xl mx-auto">
         {view === 'billing' ? renderBillingEditor() : (
           <div id="dashboard-view-container" className="flex-1 w-full">
             {dashboardTab === 'history' ? (
               <div id="dashboard-history-view-wrapper" data-component="mobile-dashboard-history" className="p-2 sm:p-4 md:p-6">{renderBillingHistorySection()}</div>
             ) : dashboardTab === 'manifest' ? (
               renderFinalManifestSection()
             ) : (
               renderFinalBillingSection()
             )}
           </div>
         )}
      </main>

      {/* Global Settings Modal */}
      {isGlobalSettingsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-2.5 sm:p-4 md:p-6 animate-in fade-in duration-200 no-print">
             <div className="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl max-w-xl w-full max-h-[92vh] sm:max-h-[88vh] flex flex-col overflow-hidden border border-slate-200/90 dark:border-slate-800 transform transition-all">
                <div className="px-4 sm:px-6 py-3.5 sm:py-4 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 flex justify-between items-center text-white shrink-0">
                   <div>
                      <h2 className="text-base sm:text-lg font-black tracking-tight flex items-center gap-2">
                         <Cog6ToothIcon className="h-5 w-5 text-indigo-400" />
                         <span>App Settings</span>
                      </h2>
                      <p className="text-slate-400 text-[11px] font-medium tracking-wide mt-0.5">Preferences, AI Vision & Cloud Sync</p>
                   </div>
                   <button 
                      type="button"
                      onClick={() => setIsGlobalSettingsOpen(false)} 
                      className="min-h-[40px] min-w-[40px] p-2 bg-white/10 hover:bg-white/20 active:scale-95 rounded-xl transition-all text-white flex items-center justify-center cursor-pointer"
                      title="Close Settings"
                      aria-label="Close Settings"
                   >
                      <XMarkIcon className="h-5 w-5" />
                   </button>
                </div>
                
                {/* Short Tabs under Setting */}
                <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-100/90 dark:bg-slate-800/80 px-2 sm:px-4 pt-2 gap-1 overflow-x-auto no-scrollbar shrink-0">
                   <button
                      type="button"
                      onClick={() => setSettingsTab('preferences')}
                      className={`pb-2.5 px-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                         settingsTab === 'preferences'
                            ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                            : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                   >
                      Preferences & Rates
                   </button>
                   <button
                      type="button"
                      onClick={() => setSettingsTab('ai')}
                      className={`pb-2.5 px-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                         settingsTab === 'ai'
                            ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                            : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                   >
                      <SparklesIcon className="h-4 w-4 text-purple-500" />
                      <span>AI Engine</span>
                      {customApiKey && <span className="h-2 w-2 rounded-full bg-indigo-500"></span>}
                   </button>
                   <button
                      type="button"
                      onClick={() => setSettingsTab('cloud')}
                      className={`pb-2.5 px-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                         settingsTab === 'cloud'
                            ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                            : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                   >
                      <CloudIcon className="h-4 w-4 text-indigo-500" />
                      <span>Cloud Backup & Sync</span>
                      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                   </button>
                </div>

                <div className="p-4 sm:p-6 space-y-6 bg-slate-50/80 dark:bg-slate-900/60 overflow-y-auto flex-1">
                   {settingsTab === 'preferences' ? (
                     <>
                        {/* Appearance Section */}
                        <div className="space-y-4">
                           <div className="flex items-center gap-2 text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 pb-2">
                              <SparklesIcon className="h-5 w-5 text-indigo-500" />
                              <span className="font-black text-sm uppercase tracking-wider">Appearance</span>
                           </div>
                           
                           <div className="grid grid-cols-3 gap-3">
                               <button 
                                   id="theme-btn-light"
                                   onClick={() => handleSetTheme('light')} 
                                   className={`relative p-4 rounded-2xl border-2 flex flex-col items-center justify-center gap-2 transition-all cursor-pointer ${
                                       appTheme === 'light' 
                                           ? 'border-indigo-500 bg-white dark:bg-slate-800 text-indigo-600 shadow-md ring-2 ring-indigo-500/20 font-black' 
                                           : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 text-gray-500 dark:text-slate-400 hover:border-indigo-300'
                                   }`}
                               >
                                   <SunIcon className="h-6 w-6 text-amber-500" />
                                   <span className="text-[10px] font-bold uppercase tracking-wider">Light</span>
                                   {appTheme === 'light' && <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-indigo-600"></span>}
                               </button>
                               <button 
                                   id="theme-btn-dark"
                                   onClick={() => handleSetTheme('dark')} 
                                   className={`relative p-4 rounded-2xl border-2 flex flex-col items-center justify-center gap-2 transition-all cursor-pointer ${
                                       appTheme === 'dark' 
                                           ? 'border-indigo-500 bg-slate-900 text-white shadow-lg ring-2 ring-indigo-500/40 font-black' 
                                           : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 text-gray-500 dark:text-slate-400 hover:border-indigo-300'
                                   }`}
                               >
                                   <MoonIcon className="h-6 w-6 text-indigo-400" />
                                   <span className="text-[10px] font-bold uppercase tracking-wider">Dark</span>
                                   {appTheme === 'dark' && <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-indigo-400 animate-pulse"></span>}
                               </button>
                               <button 
                                   id="theme-btn-reading"
                                   onClick={() => handleSetTheme('reading')} 
                                   className={`relative p-4 rounded-2xl border-2 flex flex-col items-center justify-center gap-2 transition-all cursor-pointer ${
                                       appTheme === 'reading' 
                                           ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 shadow-md ring-2 ring-amber-500/30 font-black' 
                                           : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 text-gray-500 dark:text-slate-400 hover:border-amber-300'
                                   }`}
                               >
                                   <BookOpenIcon className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                                   <span className="text-[10px] font-bold uppercase tracking-wider">Reading</span>
                                   {appTheme === 'reading' && <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-amber-600"></span>}
                               </button>
                           </div>

                            {/* Overall App Size (Proportional Zoom) */}
                            <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-xs space-y-2.5">
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-2">
                                        <ArrowsPointingOutIcon className="h-4 w-4 text-indigo-500" />
                                        <div>
                                            <span className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wide">Overall App Size</span>
                                            <p className="text-[10px] text-gray-400 dark:text-slate-400 font-medium">Scales buttons, text & UI proportionally</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {appZoom !== 100 && (
                                            <button 
                                                type="button"
                                                onClick={() => setAppZoom(100)} 
                                                className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                                            >
                                                Reset
                                            </button>
                                        )}
                                        <span className="text-xs font-black text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 px-2.5 py-0.5 rounded-lg ring-1 ring-indigo-500/20">{appZoom}%</span>
                                    </div>
                                </div>
                                <input 
                                    type="range" 
                                    min="75" 
                                    max="125" 
                                    step="5" 
                                    value={appZoom} 
                                    onChange={(e) => setAppZoom(parseInt(e.target.value))} 
                                    className="w-full h-2 bg-gray-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-600" 
                                />
                                <div className="flex justify-between text-[10px] text-gray-400 dark:text-slate-500 font-bold">
                                    <span>75% (Compact)</span>
                                    <span>100% (Default)</span>
                                    <span>125% (Large)</span>
                                </div>
                            </div>

                            {/* Text Size (Font Scale) */}
                            <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-xs space-y-2.5">
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-2">
                                        <AdjustmentsHorizontalIcon className="h-4 w-4 text-indigo-500" />
                                        <div>
                                            <span className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wide">Text Size</span>
                                            <p className="text-[10px] text-gray-400 dark:text-slate-400 font-medium">Adjust font readability across records</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {appScale !== 100 && (
                                            <button 
                                                type="button"
                                                onClick={() => setAppScale(100)} 
                                                className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                                            >
                                                Reset
                                            </button>
                                        )}
                                        <span className="text-xs font-black text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 px-2.5 py-0.5 rounded-lg ring-1 ring-indigo-500/20">{appScale}%</span>
                                    </div>
                                </div>
                                <input 
                                    type="range" 
                                    min="75" 
                                    max="125" 
                                    step="5" 
                                    value={appScale} 
                                    onChange={(e) => setAppScale(parseInt(e.target.value))} 
                                    className="w-full h-2 bg-gray-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-600" 
                                />
                                <div className="flex justify-between text-[10px] text-gray-400 dark:text-slate-500 font-bold">
                                    <span>A- (Smaller)</span>
                                    <span>Default</span>
                                    <span>A+ (Larger)</span>
                                </div>
                            </div>
                        </div>

                        {/* Pricing Engine Section (Reused Logic) */}
                        <div className="space-y-4">
                           <div className="flex items-center gap-2 text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 pb-2">
                              <ScaleIcon className="h-5 w-5 text-emerald-500" />
                              <span className="font-black text-sm uppercase tracking-wider">Default Slab Rates</span>
                           </div>
                           <p className="text-[10px] text-gray-400 dark:text-slate-400 font-medium">These rates will apply to all new imports automatically.</p>
                           
                           <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm space-y-4">
                              <div className="grid grid-cols-2 gap-4">
                                 <div className="col-span-2">
                                    <label className="text-[10px] font-bold text-gray-400 dark:text-slate-400 uppercase tracking-wider block mb-1">Slab 1 (0-10kg)</label>
                                    <div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₹</span><input type="number" className="w-full pl-8 pr-4 py-2 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 outline-none" value={globalConfig.parcelSlab1Rate} onChange={(e) => setGlobalConfig({ ...globalConfig, parcelSlab1Rate: parseFloat(e.target.value) || 0 })} /></div>
                                 </div>
                                 <div>
                                    <label className="text-[10px] font-bold text-gray-400 dark:text-slate-400 uppercase tracking-wider block mb-1">Slab 2 (10-100kg)</label>
                                    <div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₹</span><input type="number" className="w-full pl-8 pr-4 py-2 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 outline-none" value={globalConfig.parcelSlab2Rate} onChange={(e) => setGlobalConfig({ ...globalConfig, parcelSlab2Rate: parseFloat(e.target.value) || 0 })} /></div>
                                 </div>
                                 <div>
                                    <label className="text-[10px] font-bold text-gray-400 dark:text-slate-400 uppercase tracking-wider block mb-1">Slab 3 (&gt;100kg)</label>
                                    <div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₹</span><input type="number" className="w-full pl-8 pr-4 py-2 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 outline-none" value={globalConfig.parcelSlab3Rate} onChange={(e) => setGlobalConfig({ ...globalConfig, parcelSlab3Rate: parseFloat(e.target.value) || 0 })} /></div>
                                 </div>
                                 <div className="col-span-2 pt-2 border-t border-gray-100 dark:border-slate-700 mt-2">
                                    <label className="text-[10px] font-bold text-gray-400 dark:text-slate-400 uppercase tracking-wider block mb-1">Document Flat Rate</label>
                                    <div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₹</span><input type="number" className="w-full pl-8 pr-4 py-2 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500/20 outline-none" value={globalConfig.documentRate} onChange={(e) => setGlobalConfig({ ...globalConfig, documentRate: parseFloat(e.target.value) || 0 })} /></div>
                                 </div>
                              </div>
                           </div>
                        </div>
                        
                        <button onClick={() => { saveGlobalSettings(globalConfig, appTheme, appScale, appZoom); setIsGlobalSettingsOpen(false); }} className="w-full py-4 bg-slate-900 dark:bg-indigo-600 text-white font-black rounded-xl hover:bg-black dark:hover:bg-indigo-500 transition-all shadow-xl active:scale-95 flex items-center justify-center gap-2 cursor-pointer">
                           <CheckCircleIcon className="h-5 w-5 text-emerald-400" />
                           Save Preferences
                        </button>
                      </>
                   ) : settingsTab === 'ai' ? (
                     /* AI Engine & API Key Tab Content */
                     <div className="space-y-6">
                        {/* API Key Configuration Card */}
                        <div className="space-y-4">
                           <div className="flex items-center gap-2 text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 pb-2">
                              <SparklesIcon className="h-5 w-5 text-purple-500" />
                              <span className="font-black text-sm uppercase tracking-wider">Google AI Studio API Key</span>
                           </div>
                           <p className="text-[11px] text-gray-500 dark:text-slate-400 leading-relaxed">
                              Supply your custom Google AI Studio API Key to increase quota and rate limits. If left blank, the app will use the built-in system API key.
                           </p>

                           <div className="bg-white dark:bg-slate-800 p-4 sm:p-5 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-xs space-y-4">
                              <div>
                                 <label className="text-[10px] font-bold text-gray-400 dark:text-slate-400 uppercase tracking-wider block mb-1.5">
                                    Gemini API Key
                                 </label>
                                 <div className="relative flex items-center">
                                    <input 
                                       type={showApiKeyInput ? "text" : "password"}
                                       value={customApiKey}
                                       onChange={(e) => {
                                          setCustomApiKey(e.target.value);
                                          setApiKeyTestResult(null);
                                       }}
                                       placeholder="AIzaSy... (leave blank to use default)"
                                       className="w-full pr-20 pl-4 py-2.5 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl font-mono text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500/20 outline-none"
                                    />
                                    <button
                                       type="button"
                                       onClick={() => setShowApiKeyInput(!showApiKeyInput)}
                                       className="absolute right-2 px-2.5 py-1 text-[11px] font-bold text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white cursor-pointer"
                                    >
                                       {showApiKeyInput ? "Hide" : "Show"}
                                    </button>
                                 </div>
                              </div>

                              {apiKeyTestResult && (
                                 <div className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
                                    apiKeyTestResult.success 
                                       ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' 
                                       : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                                 }`}>
                                    {apiKeyTestResult.success ? <CheckCircleIcon className="h-4 w-4 shrink-0" /> : <ExclamationTriangleIcon className="h-4 w-4 shrink-0" />}
                                    <span className="truncate">{apiKeyTestResult.message}</span>
                                 </div>
                              )}

                              <div className="flex flex-wrap items-center gap-2 pt-1">
                                 <button
                                    type="button"
                                    disabled={apiKeyTestResult?.testing}
                                    onClick={async () => {
                                       setApiKeyTestResult({ testing: true });
                                       const res = await testGeminiApiKey(customApiKey || undefined);
                                       setApiKeyTestResult({
                                          testing: false,
                                          success: res.success,
                                          message: res.success ? `Connection verified! Model: ${res.model}` : `Error: ${res.error}`
                                       });
                                    }}
                                    className="px-3.5 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
                                 >
                                    <BoltIcon className="h-3.5 w-3.5" />
                                    <span>{apiKeyTestResult?.testing ? "Testing..." : "Test Connection"}</span>
                                 </button>

                                 <button
                                    type="button"
                                    onClick={() => {
                                       saveCustomGeminiApiKey(customApiKey);
                                       setStatus({
                                          type: 'success',
                                          message: customApiKey.trim() ? 'Custom API key saved.' : 'Using default system key.'
                                       });
                                    }}
                                    className="px-3.5 py-2 bg-slate-900 dark:bg-slate-700 hover:bg-black dark:hover:bg-slate-600 text-white text-xs font-bold rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
                                 >
                                    <CheckIcon className="h-3.5 w-3.5 text-emerald-400" />
                                    <span>Save Key</span>
                                 </button>

                                 {customApiKey && (
                                    <button
                                       type="button"
                                       onClick={() => {
                                          setCustomApiKey('');
                                          saveCustomGeminiApiKey('');
                                          setApiKeyTestResult(null);
                                          setStatus({ type: 'info', message: 'Reverted to default AI Studio key.' });
                                       }}
                                       className="px-3 py-2 text-xs font-bold text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition-all cursor-pointer"
                                    >
                                       Reset to Default
                                    </button>
                                 )}
                              </div>
                           </div>
                        </div>

                        {/* Extraction Engine Architecture Details & Model Selection */}
                        <div className="space-y-3">
                           <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                              <div className="flex items-center gap-2 text-slate-900 dark:text-white">
                                 <CpuChipIcon className="h-5 w-5 text-indigo-500" />
                                 <span className="font-black text-sm uppercase tracking-wider">Active Extraction Engine</span>
                              </div>
                              <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${
                                extractionModelPref.mode === 'auto'
                                  ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                                  : extractionModelPref.mode === 'single'
                                  ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-700'
                                  : 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-700'
                              }`}>
                                {extractionModelPref.mode === 'auto' ? 'Auto Dynamic Fallback' : extractionModelPref.mode === 'single' ? 'Single Dedicated Model' : `Multiple Models (${extractionModelPref.selectedModels.length})`}
                              </span>
                           </div>

                           <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-xs space-y-4 text-xs">
                              {/* Engine Mode Tabs (Auto vs Single vs Multiple) */}
                              <div>
                                 <label className="text-[10px] font-bold text-gray-400 dark:text-slate-400 uppercase tracking-wider block mb-2">
                                    Extraction Mode Selection
                                 </label>
                                 <div className="grid grid-cols-3 gap-1.5 p-1 bg-gray-100 dark:bg-slate-900/80 rounded-xl border border-gray-200 dark:border-slate-700">
                                    <button
                                       type="button"
                                       onClick={() => handleUpdateModelPreference({
                                          mode: 'auto',
                                          selectedModels: ['gemini-3.6-flash', 'gemini-3.8-flash', 'gemini-flash-latest', 'gemini-2.5-flash']
                                       })}
                                       className={`py-2 px-2.5 rounded-lg font-bold text-xs flex flex-col sm:flex-row items-center justify-center gap-1 transition-all cursor-pointer ${
                                          extractionModelPref.mode === 'auto'
                                             ? 'bg-white dark:bg-indigo-600 text-indigo-600 dark:text-white shadow-xs font-black'
                                             : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
                                       }`}
                                    >
                                       <span>⚡ Auto Mode</span>
                                    </button>

                                    <button
                                       type="button"
                                       onClick={() => {
                                          const defaultSingle = extractionModelPref.selectedModels[0] || 'gemini-3.6-flash';
                                          handleUpdateModelPreference({
                                             mode: 'single',
                                             selectedModels: [defaultSingle]
                                          });
                                       }}
                                       className={`py-2 px-2.5 rounded-lg font-bold text-xs flex flex-col sm:flex-row items-center justify-center gap-1 transition-all cursor-pointer ${
                                          extractionModelPref.mode === 'single'
                                             ? 'bg-white dark:bg-indigo-600 text-indigo-600 dark:text-white shadow-xs font-black'
                                             : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
                                       }`}
                                    >
                                       <span>🎯 Single Model</span>
                                    </button>

                                    <button
                                       type="button"
                                       onClick={() => {
                                          const current = extractionModelPref.selectedModels.length > 0 
                                             ? extractionModelPref.selectedModels 
                                             : ['gemini-3.6-flash', 'gemini-3.8-flash'];
                                          handleUpdateModelPreference({
                                             mode: 'multiple',
                                             selectedModels: current
                                          });
                                       }}
                                       className={`py-2 px-2.5 rounded-lg font-bold text-xs flex flex-col sm:flex-row items-center justify-center gap-1 transition-all cursor-pointer ${
                                          extractionModelPref.mode === 'multiple'
                                             ? 'bg-white dark:bg-indigo-600 text-indigo-600 dark:text-white shadow-xs font-black'
                                             : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
                                       }`}
                                    >
                                       <span>🔀 Multi Models</span>
                                    </button>
                                 </div>
                              </div>

                              {/* Available Models List & Selector */}
                              <div className="space-y-2 pt-1">
                                 <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-gray-400 dark:text-slate-400 uppercase tracking-wider">
                                       {extractionModelPref.mode === 'auto'
                                          ? 'Cascade Priority (Automated Fallback Sequence)'
                                          : extractionModelPref.mode === 'single'
                                          ? 'Choose Dedicated Vision Model'
                                          : 'Select Models for Custom Cascade (Click to toggle)'}
                                    </span>
                                    <span className="text-[10px] font-semibold text-gray-500 dark:text-slate-400">
                                       {extractionModelPref.mode === 'auto'
                                          ? '4/4 Active'
                                          : extractionModelPref.mode === 'single'
                                          ? '1 Selected'
                                          : `${extractionModelPref.selectedModels.length}/${AVAILABLE_EXTRACTION_MODELS.length} Selected`}
                                    </span>
                                 </div>

                                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {AVAILABLE_EXTRACTION_MODELS.map((model, idx) => {
                                       const isSingleSelected = extractionModelPref.mode === 'single' && (extractionModelPref.selectedModels[0] === model.name);
                                       const isMultiSelected = extractionModelPref.mode === 'multiple' && extractionModelPref.selectedModels.includes(model.name);
                                       const isAutoActive = extractionModelPref.mode === 'auto';
                                       const isSelected = isAutoActive || isSingleSelected || isMultiSelected;
                                       const sequenceIdx = extractionModelPref.selectedModels.indexOf(model.name);

                                       return (
                                          <div
                                             key={model.name}
                                             onClick={() => {
                                                if (extractionModelPref.mode === 'auto') {
                                                   // Switch to single model on direct model card click
                                                   handleUpdateModelPreference({
                                                      mode: 'single',
                                                      selectedModels: [model.name]
                                                   });
                                                } else if (extractionModelPref.mode === 'single') {
                                                   handleUpdateModelPreference({
                                                      mode: 'single',
                                                      selectedModels: [model.name]
                                                   });
                                                } else if (extractionModelPref.mode === 'multiple') {
                                                   let nextModels: string[];
                                                   if (extractionModelPref.selectedModels.includes(model.name)) {
                                                      if (extractionModelPref.selectedModels.length <= 1) {
                                                         setStatus({ type: 'warning', message: 'At least one model must remain selected.' });
                                                         return;
                                                      }
                                                      nextModels = extractionModelPref.selectedModels.filter(m => m !== model.name);
                                                   } else {
                                                      nextModels = [...extractionModelPref.selectedModels, model.name];
                                                   }
                                                   handleUpdateModelPreference({
                                                      mode: 'multiple',
                                                      selectedModels: nextModels
                                                   });
                                                }
                                             }}
                                             className={`p-3 rounded-xl border text-left transition-all cursor-pointer relative overflow-hidden select-none ${
                                                isSelected
                                                   ? 'bg-indigo-50/50 dark:bg-indigo-950/30 border-indigo-300 dark:border-indigo-600 shadow-xs'
                                                   : 'bg-gray-50/70 dark:bg-slate-900/50 border-gray-200 dark:border-slate-800 opacity-60 hover:opacity-100'
                                             }`}
                                          >
                                             <div className="flex items-start justify-between gap-2 mb-1">
                                                <div className="flex items-center gap-1.5 min-w-0">
                                                   {/* Selection Indicator */}
                                                   {extractionModelPref.mode === 'single' ? (
                                                      <span className={`h-4 w-4 rounded-full border flex items-center justify-center shrink-0 ${
                                                         isSingleSelected 
                                                            ? 'bg-indigo-600 border-indigo-600 text-white' 
                                                            : 'border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                                                      }`}>
                                                         {isSingleSelected && <span className="h-1.5 w-1.5 rounded-full bg-white"></span>}
                                                      </span>
                                                   ) : extractionModelPref.mode === 'multiple' ? (
                                                      <span className={`h-4 w-4 rounded-md border flex items-center justify-center shrink-0 text-[10px] font-black ${
                                                         isMultiSelected 
                                                            ? 'bg-indigo-600 border-indigo-600 text-white' 
                                                            : 'border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                                                      }`}>
                                                         {isMultiSelected ? (sequenceIdx >= 0 ? sequenceIdx + 1 : '✓') : ''}
                                                      </span>
                                                   ) : (
                                                      <span className="h-4 w-4 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0 text-[9px] font-black">
                                                         {idx + 1}
                                                      </span>
                                                   )}

                                                   <span className="font-mono font-bold text-xs text-slate-900 dark:text-white truncate">
                                                      {model.name}
                                                   </span>
                                                </div>

                                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md border shrink-0 ${model.badgeColor}`}>
                                                   {model.badge}
                                                </span>
                                             </div>

                                             <p className="text-[10px] text-gray-500 dark:text-slate-400 line-clamp-2 leading-tight pl-5">
                                                {model.description}
                                             </p>

                                             <div className="flex items-center justify-between text-[10px] text-gray-400 dark:text-slate-500 pt-1.5 pl-5">
                                                <span>Speed: <strong className="text-slate-700 dark:text-slate-300 font-semibold">{model.speed}</strong></span>
                                                {model.recommended && (
                                                   <span className="text-indigo-600 dark:text-indigo-400 font-bold text-[9px]">★ Primary default</span>
                                                )}
                                             </div>
                                          </div>
                                       );
                                    })}
                                 </div>
                              </div>

                              {/* Technical Status & Architecture Summary */}
                              <div className="pt-2 border-t border-gray-100 dark:border-slate-700 space-y-2">
                                 <div className="flex items-center justify-between">
                                    <span className="text-gray-500 dark:text-gray-400 font-medium">Active Model Configuration:</span>
                                    <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 px-2 py-0.5 rounded-md text-[11px]">
                                       {extractionModelPref.mode === 'auto'
                                          ? 'gemini-3.6-flash (Auto Cascading)'
                                          : extractionModelPref.mode === 'single'
                                          ? extractionModelPref.selectedModels[0] || 'gemini-3.6-flash'
                                          : `${extractionModelPref.selectedModels.join(' ➔ ')}`}
                                    </span>
                                 </div>

                                 <div className="flex items-center justify-between">
                                    <span className="text-gray-500 dark:text-gray-400 font-medium">Temperature & Zero-Hallucination:</span>
                                    <span className="font-mono font-bold text-slate-700 dark:text-slate-300">0.1 (Strict Factuality)</span>
                                 </div>

                                 <div className="flex items-center justify-between">
                                    <span className="text-gray-500 dark:text-gray-400 font-medium">Matrix Token Compression:</span>
                                    <span className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                       <CheckCircleIcon className="h-3.5 w-3.5" /> 60% Token Reduction Active
                                    </span>
                                 </div>
                              </div>
                           </div>
                        </div>
                     </div>
                   ) : (
                     /* Cloud Settings Tab Content */
                     <div className="space-y-6">
                        {/* Multi-Device Common Cloud Storage Card */}
                        <MultiDeviceSyncCard
                           currentDevice={currentDevice}
                           connectedDevices={connectedDevices}
                           channelKey={syncChannelKey}
                           isCloudActivated={isCloudActivated}
                           isOnline={cloudMeta.isOnline}
                           onActivateCloud={handleActivateCloud}
                           onLinkWithExistingCloud={handleLinkWithExistingCloud}
                           onDeactivateCloud={handleDeactivateCloud}
                           onUpdateChannelKey={handleUpdateChannelKey}
                           onUpdateDeviceName={handleUpdateDeviceName}
                           onSyncNow={() => handleSyncNow('ALL', 'sync')}
                           isSyncing={isCloudLoading}
                           lastSyncTimestamp={cloudMeta.lastSyncTimestamp}
                           lastSyncMessage={cloudMeta.lastSyncMessage}
                           autoSyncEnabled={cloudMeta.autoSyncEnabled}
                           onToggleAutoSync={(enabled) => {
                              setCloudMeta(prev => {
                                const updated = { ...prev, autoSyncEnabled: enabled };
                                try {
                                  localStorage.setItem(AUTO_SYNC_KEY, JSON.stringify(enabled));
                                  localStorage.setItem(CLOUD_META_KEY, JSON.stringify(updated));
                                } catch (e) {}
                                return updated;
                              });
                           }}
                           manifestCount={history.length}
                        />

                        {/* Quick Direct Actions: Backup to Cloud & Sync from Cloud (Independent of Snapshot prompts) */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                           <button
                              type="button"
                              onClick={() => handleSyncNow('ALL', 'backup')}
                              disabled={isCloudLoading}
                              className={`relative overflow-hidden py-3.5 px-4 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer min-h-[46px] ${
                                cloudQuickOpProgress?.mode === 'backup'
                                  ? 'bg-slate-950 border border-indigo-500 text-white'
                                  : 'bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-700 hover:from-indigo-500 hover:to-purple-600 text-white active:scale-95 disabled:opacity-50'
                              }`}
                           >
                              {cloudQuickOpProgress?.mode === 'backup' ? (
                                <>
                                  <div
                                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500 transition-all duration-200 ease-out z-0"
                                    style={{ width: `${cloudQuickOpProgress.percent}%` }}
                                  >
                                    <div className="absolute inset-0 animate-progress-stripes opacity-35" />
                                    <div className="absolute top-0 right-0 bottom-0 w-1.5 bg-white shadow-[0_0_8px_rgba(255,255,255,0.9)]" />
                                  </div>
                                  <div className="relative z-10 flex items-center justify-between w-full">
                                    <div className="flex items-center gap-2 truncate text-left">
                                      <CloudArrowUpIcon className="h-4 w-4 text-emerald-300 animate-bounce shrink-0" />
                                      <span className="truncate">{cloudQuickOpProgress.stageText || 'Backing up...'}</span>
                                    </div>
                                    <span className="px-1.5 py-0.5 rounded bg-black/60 font-mono font-black text-[11px] border border-white/20 shrink-0 ml-1">
                                      {Math.round(cloudQuickOpProgress.percent)}%
                                    </span>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <CloudArrowUpIcon className="h-4 w-4 text-emerald-300" />
                                  <span>{isCloudLoading ? 'Backing up...' : 'Backup to Cloud Vault'}</span>
                                </>
                              )}
                           </button>

                           <button
                              type="button"
                              onClick={() => handleSyncNow('ALL', 'sync')}
                              disabled={isCloudLoading}
                              className={`relative overflow-hidden py-3.5 px-4 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer min-h-[46px] ${
                                cloudQuickOpProgress?.mode === 'sync'
                                  ? 'bg-slate-950 border border-emerald-500 text-white'
                                  : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white active:scale-95 disabled:opacity-50'
                              }`}
                           >
                              {cloudQuickOpProgress?.mode === 'sync' ? (
                                <>
                                  <div
                                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-400 transition-all duration-200 ease-out z-0"
                                    style={{ width: `${cloudQuickOpProgress.percent}%` }}
                                  >
                                    <div className="absolute inset-0 animate-progress-stripes opacity-35" />
                                    <div className="absolute top-0 right-0 bottom-0 w-1.5 bg-white shadow-[0_0_8px_rgba(255,255,255,0.9)]" />
                                  </div>
                                  <div className="relative z-10 flex items-center justify-between w-full">
                                    <div className="flex items-center gap-2 truncate text-left">
                                      <ArrowPathIcon className="h-4 w-4 text-white animate-spin shrink-0" />
                                      <span className="truncate">{cloudQuickOpProgress.stageText || 'Syncing...'}</span>
                                    </div>
                                    <span className="px-1.5 py-0.5 rounded bg-black/60 font-mono font-black text-[11px] border border-white/20 shrink-0 ml-1">
                                      {Math.round(cloudQuickOpProgress.percent)}%
                                    </span>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <ArrowPathIcon className={`h-4 w-4 ${isCloudLoading ? 'animate-spin' : ''}`} />
                                  <span>{isCloudLoading ? 'Syncing...' : 'Sync from Cloud'}</span>
                                </>
                              )}
                           </button>
                        </div>

                        {/* Overview Metrics */}
                        <div className="grid grid-cols-2 gap-3">
                           <div className="bg-emerald-50/80 dark:bg-emerald-950/40 p-3 sm:p-4 rounded-xl border border-emerald-100 dark:border-emerald-900/50">
                              <span className="text-[10px] font-black text-emerald-700 dark:text-emerald-300 uppercase tracking-wider block">Cloud Vault Items</span>
                              <span className="text-xl sm:text-2xl font-black text-emerald-900 dark:text-white mt-1 block">{cloudManifests.length}</span>
                              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">Synced in cloud database</span>
                           </div>
                           <div className="bg-indigo-50/80 dark:bg-indigo-950/40 p-3 sm:p-4 rounded-xl border border-indigo-100 dark:border-indigo-900/50">
                              <span className="text-[10px] font-black text-indigo-700 dark:text-indigo-300 uppercase tracking-wider block">Cloud Archives</span>
                              <span className="text-xl sm:text-2xl font-black text-indigo-900 dark:text-white mt-1 block">{cloudBackups.length}</span>
                              <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium">Independent cloud backups</span>
                           </div>
                        </div>

                        {/* Recent Cloud Backups list (if any exist) */}
                        {cloudBackups.length > 0 && (
                           <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                 <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Available Cloud Backups</span>
                                 <span className="text-[10px] text-slate-400">{cloudBackups.length} total</span>
                              </div>
                              <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                                 {cloudBackups.slice(0, 4).map(backup => (
                                    <div key={backup.id} className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs">
                                       <div>
                                          <div className="font-bold text-slate-900 dark:text-white">{backup.name || 'Cloud Backup Snapshot'}</div>
                                          <div className="text-[10px] text-slate-400">
                                             {backup.createdAt ? new Date(backup.createdAt).toLocaleDateString() : 'Snapshot'} • {backup.manifestCount ?? backup.data?.manifests?.length ?? 0} manifests • ₹{Number(backup.totalAmount ?? 0).toLocaleString('en-IN')}
                                          </div>
                                       </div>
                                       {pendingSettingsRestoreBackupId === backup.id ? (
                                         <div className="flex items-center gap-1.5 shrink-0">
                                            <button
                                               type="button"
                                               onClick={async () => {
                                                  setPendingSettingsRestoreBackupId(null);
                                                  await handleRestoreCloudBackup(backup, 'replace');
                                                  setIsGlobalSettingsOpen(false);
                                               }}
                                               className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer"
                                            >
                                               Confirm Restore
                                            </button>
                                            <button
                                               type="button"
                                               onClick={() => setPendingSettingsRestoreBackupId(null)}
                                               className="px-2 py-1.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-[10px] font-bold cursor-pointer"
                                            >
                                               Cancel
                                            </button>
                                         </div>
                                       ) : (
                                         <button
                                            type="button"
                                            onClick={() => setPendingSettingsRestoreBackupId(backup.id)}
                                            className="px-2.5 py-1.5 bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer"
                                         >
                                            Restore
                                         </button>
                                       )}
                                    </div>
                                 ))}
                              </div>
                           </div>
                        )}

                        {/* Open Dedicated Cloud Section Link */}
                        <button
                           type="button"
                           onClick={() => {
                              setIsGlobalSettingsOpen(false);
                              setCloudManagerInitialTab('cloud_items');
                              setIsCloudManagerModalOpen(true);
                           }}
                           className="w-full py-3.5 px-4 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 cursor-pointer min-h-[46px]"
                        >
                           <ServerStackIcon className="h-4 w-4" />
                           <span>Open Dedicated Cloud File List & Vault</span>
                           <ChevronRightIcon className="h-4 w-4" />
                        </button>
                     </div>
                   )}
                </div>
             </div>
          </div>
      )}

      {/* Dedicated Cloud File Manager Modal */}
      {isCloudManagerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-2 sm:p-4 md:p-6 animate-in fade-in duration-200 no-print">
          <div className="bg-[#070b14] rounded-2xl sm:rounded-3xl shadow-2xl max-w-6xl w-full max-h-[95vh] overflow-y-auto border border-slate-800 p-2 sm:p-5">
            <CloudManager
              initialTab={cloudManagerInitialTab}
              cloudBackups={cloudBackups}
              cloudManifests={cloudManifests}
              cloudMeta={cloudMeta}
              localManifests={history}
              localFolders={folders}
              localOverrides={finalBillOverrides}
              localManualDocEntries={manualDocEntries}
              cloudOverrides={cloudOverrides}
              cloudManualDocEntries={cloudManualDocEntries}
              globalConfig={globalConfig}
              isLoading={isCloudLoading}
              channelKey={syncChannelKey}
              currentDevice={currentDevice}
              connectedDevices={connectedDevices}
              onSyncNow={handleSyncNow}
              onCreateBackup={handleCreateCloudBackup}
              onRestoreBackup={handleRestoreCloudBackup}
              onDeleteBackup={handleDeleteCloudBackup}
              onOpenManifest={(m) => {
                setIsCloudManagerModalOpen(false);
                openManifestFromHistory(m);
              }}
              onRestoreCloudManifests={handleRestoreCloudManifests}
              onRestoreCloudManualDocs={handleRestoreCloudManualDocs}
              onDeleteCloudManualDoc={handleDeleteCloudManualDoc}
              onToggleAutoSync={(enabled) => {
                setCloudMeta(prev => {
                  const updated = { ...prev, autoSyncEnabled: enabled };
                  try {
                    localStorage.setItem(AUTO_SYNC_KEY, JSON.stringify(enabled));
                    localStorage.setItem(CLOUD_META_KEY, JSON.stringify(updated));
                  } catch (e) {}
                  return updated;
                });
              }}
              onRefreshCloudData={refreshCloudData}
              onClose={() => setIsCloudManagerModalOpen(false)}
              onUpdateChannelKey={handleLinkWithExistingCloud}
              onDeleteCloudManifest={handleDeleteCloudManifest}
            />
          </div>
        </div>
      )}

      {/* Folder Export Modal */}
      {isFolderExportOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-indigo-950/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
             <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-gray-100 transform transition-all">
                <div className="px-8 py-6 bg-gradient-to-r from-blue-600 to-indigo-600 flex justify-between items-center text-white">
                   <div>
                      <h2 className="text-xl font-black tracking-tight">Export Folder</h2>
                      <p className="text-indigo-100 text-xs font-medium uppercase tracking-widest mt-1">Create Backup Package (ZIP)</p>
                   </div>
                   <button onClick={() => setIsFolderExportOpen(false)} className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-all text-white"><XMarkIcon className="h-5 w-5" /></button>
                </div>
                
                <div className="p-8 space-y-6 bg-slate-50 max-h-[70vh] overflow-y-auto">
                   <p className="text-sm text-gray-500 font-medium">Select a folder to export all its manifests as a single ZIP file.</p>
                   
                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {folders.map(folder => {
                          const count = history.filter(h => h.folderId === folder.id).length;
                          return (
                              <button 
                                  key={folder.id} 
                                  onClick={() => exportFolderToZip(folder.id)}
                                  className="group flex flex-col p-4 bg-white border border-gray-200 rounded-2xl hover:border-indigo-500 hover:shadow-lg transition-all text-left"
                              >
                                  <div className="flex items-center justify-between mb-2">
                                      <FolderIcon className="h-6 w-6 text-indigo-300 group-hover:text-indigo-600" />
                                      <span className="text-[10px] font-black bg-gray-100 text-gray-500 px-2 py-1 rounded-full">{count} Items</span>
                                  </div>
                                  <span className="font-bold text-gray-900 group-hover:text-indigo-900 truncate w-full">{folder.name}</span>
                              </button>
                          )
                      })}
                   </div>
                   {folders.length === 0 && <div className="text-center py-8 text-gray-400 font-bold text-sm">No folders available to export.</div>}
                </div>
             </div>
          </div>
      )}

      {/* Bulk Import Modal */}
      {isBulkImportOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-indigo-950/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
             <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden border border-gray-100 transform transition-all flex flex-col max-h-[90vh]">
                <div className="px-8 py-6 bg-gradient-to-r from-emerald-600 to-teal-600 flex justify-between items-center text-white flex-shrink-0">
                   <div>
                      <h2 className="text-xl font-black tracking-tight">Bulk Import</h2>
                      <p className="text-emerald-100 text-xs font-medium uppercase tracking-widest mt-1">Multiple Files & Folders</p>
                   </div>
                   <button onClick={() => {setIsBulkImportOpen(false); setBulkImportResults([]);}} className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-all text-white"><XMarkIcon className="h-5 w-5" /></button>
                </div>
                
                <div className="flex border-b border-gray-100 bg-gray-50/50 flex-shrink-0">
                    <button onClick={() => setBulkImportTab('zip')} className={`flex-1 py-4 text-sm font-black uppercase tracking-wider transition-all ${bulkImportTab === 'zip' ? 'text-emerald-600 border-b-2 border-emerald-600 bg-emerald-50/30' : 'text-gray-400 hover:text-gray-600'}`}>
                        Folder Import (ZIP)
                    </button>
                    <button onClick={() => setBulkImportTab('multi')} className={`flex-1 py-4 text-sm font-black uppercase tracking-wider transition-all ${bulkImportTab === 'multi' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/30' : 'text-gray-400 hover:text-gray-600'}`}>
                        Import Multiple (JSON)
                    </button>
                </div>

                <div className="p-8 overflow-y-auto flex-1 bg-white">
                    {bulkImportTab === 'zip' ? (
                        <div className="space-y-6">
                            <div className="border-2 border-dashed border-emerald-100 rounded-2xl p-10 text-center hover:bg-emerald-50/20 transition-all relative group">
                                <input type="file" accept=".zip" onChange={(e) => e.target.files?.[0] && handleZipImportRefactored(e.target.files[0])} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                                <div className="bg-emerald-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                                    <ArchiveBoxIcon className="h-8 w-8 text-emerald-600" />
                                </div>
                                <h3 className="text-lg font-black text-gray-900 mb-1">Upload ZIP Archive</h3>
                                <p className="text-xs text-gray-400 font-medium">Restores an entire folder with original metadata</p>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Target Folder</label>
                                <select 
                                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-indigo-500/20 mb-3"
                                    value={bulkImportFolderId}
                                    onChange={(e) => setBulkImportFolderId(e.target.value)}
                                >
                                    <option value="new">+ Create New Folder</option>
                                    {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                                </select>
                                {bulkImportFolderId === 'new' && (
                                    <input 
                                        type="text" 
                                        placeholder="Enter Folder Name..." 
                                        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-gray-900 outline-none focus:ring-2 focus:ring-indigo-500/20"
                                        value={bulkImportNewFolderName}
                                        onChange={(e) => setBulkImportNewFolderName(e.target.value)}
                                    />
                                )}
                            </div>

                            <div className="border-2 border-dashed border-indigo-100 rounded-2xl p-8 text-center hover:bg-indigo-50/20 transition-all relative group">
                                <input type="file" accept=".json" multiple onChange={(e) => e.target.files && handleBulkJsonImport(e.target.files)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                                <div className="bg-indigo-100 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                                    <DocumentDuplicateIcon className="h-6 w-6 text-indigo-600" />
                                </div>
                                <h3 className="text-base font-black text-gray-900">Select JSON Files</h3>
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Max 30 Files</p>
                            </div>
                        </div>
                    )}

                    {/* Import Results List */}
                    {bulkImportResults.length > 0 && (
                        <div className="mt-8">
                            <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3 border-b border-gray-100 pb-2">Import Results ({bulkImportResults.length})</h4>
                            <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
                                {bulkImportResults.map((res, idx) => (
                                    <div key={idx} className={`flex items-center justify-between p-2 rounded-lg text-xs font-medium border ${res.status === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-100' : res.status === 'warning' ? 'bg-amber-50 text-amber-800 border-amber-100' : 'bg-red-50 text-red-800 border-red-100'}`}>
                                        <div className="truncate flex-1 mr-2">{res.fileName}</div>
                                        <div className="font-bold uppercase tracking-wider text-[10px]">{res.message}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
             </div>
          </div>
      )}

      {/* Local Config Modal (For Active Manifest) - Existing */}
      {isConfigOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-indigo-950/80 backdrop-blur-md p-4 animate-in fade-in duration-300 no-print">
             <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-gray-100 transform transition-all">
                {/* Header */}
                <div className="px-8 py-6 bg-gradient-to-r from-indigo-600 to-indigo-700 flex justify-between items-center text-white">
                   <div>
                      <h2 className="text-xl font-black tracking-tight">Active Rates</h2>
                      <p className="text-indigo-200 text-xs font-medium uppercase tracking-widest mt-1">For this manifest only</p>
                   </div>
                   <button onClick={() => setIsConfigOpen(false)} className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-all text-white"><XMarkIcon className="h-5 w-5" /></button>
                </div>
                
                <div className="p-8 space-y-6 bg-slate-50">
                   {/* Parcel Section */}
                   <div className="space-y-4">
                      <div className="flex items-center gap-2 text-indigo-900 mb-2">
                         <ScaleIcon className="h-5 w-5 text-indigo-500" />
                         <span className="font-black text-sm uppercase tracking-wider">Parcel Slabs</span>
                      </div>
                      
                      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm space-y-4">
                         <div className="grid grid-cols-2 gap-4">
                            <div className="col-span-2">
                               <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Slab 1 (0-10kg)</label>
                               <div className="relative">
                                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₹</span>
                                  <input type="number" className="w-full pl-8 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-black text-gray-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none" value={config.parcelSlab1Rate} onChange={(e) => setConfig({ ...config, parcelSlab1Rate: parseFloat(e.target.value) || 0 })} />
                               </div>
                            </div>
                            <div>
                               <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Slab 2 (10-100kg)</label>
                               <div className="relative">
                                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₹</span>
                                  <input type="number" className="w-full pl-8 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-black text-gray-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none" value={config.parcelSlab2Rate} onChange={(e) => setConfig({ ...config, parcelSlab2Rate: parseFloat(e.target.value) || 0 })} />
                               </div>
                            </div>
                            <div>
                               <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Slab 3 (&gt;100kg)</label>
                               <div className="relative">
                                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₹</span>
                                  <input type="number" className="w-full pl-8 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-black text-gray-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none" value={config.parcelSlab3Rate} onChange={(e) => setConfig({ ...config, parcelSlab3Rate: parseFloat(e.target.value) || 0 })} />
                               </div>
                            </div>
                         </div>
                      </div>
                   </div>

                   {/* Document Section */}
                   <div className="space-y-4">
                      <div className="flex items-center gap-2 text-indigo-900 mb-2">
                         <DocumentTextIcon className="h-5 w-5 text-emerald-500" />
                         <span className="font-black text-sm uppercase tracking-wider">Documents</span>
                      </div>
                      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
                          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Flat Rate</label>
                           <div className="relative">
                              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₹</span>
                              <input type="number" className="w-full pl-8 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-black text-gray-900 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none" value={config.documentRate} onChange={(e) => setConfig({ ...config, documentRate: parseFloat(e.target.value) || 0 })} />
                           </div>
                      </div>
                   </div>
                   
                   <button onClick={() => setIsConfigOpen(false)} className="w-full py-4 bg-indigo-900 text-white font-black rounded-xl hover:bg-black transition-all shadow-xl shadow-indigo-200 active:scale-95 flex items-center justify-center gap-2">
                      <CheckCircleIcon className="h-5 w-5 text-indigo-400" />
                      Save Configuration
                   </button>
                </div>
             </div>
          </div>
      )}
      
      {/* Import Conflict Modal */}
      {importConflict && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-indigo-950/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-2xl md:rounded-[2.5rem] shadow-2xl max-w-3xl w-full overflow-hidden border border-gray-100 flex flex-col max-h-[85vh] overflow-y-auto">
             <div className="px-6 md:px-8 py-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 sticky top-0 z-10 backdrop-blur-md">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-100 text-amber-600 rounded-xl"><ExclamationTriangleIcon className="h-6 w-6"/></div>
                  <div><h2 className="text-lg md:text-xl font-black text-gray-900">Duplicate Manifest Found</h2><p className="text-[10px] md:text-xs text-gray-400 font-bold uppercase tracking-widest">Manifest <span className="text-indigo-600">{importConflict.newCandidate.manifestNo}</span> exists.</p></div>
                </div>
                <button onClick={() => resolveConflict('discard')} className="p-2 bg-white rounded-xl shadow-sm text-gray-400 hover:text-gray-900 transition-all"><XMarkIcon className="h-5 w-5" /></button>
             </div>
             
             <div className="p-6 md:p-8 grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                {/* Existing Record */}
                <div className="bg-gray-50 p-6 rounded-2xl md:rounded-3xl border border-gray-200">
                   <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Existing Record</div>
                   <div className="space-y-4">
                      <div><div className="text-xs text-gray-500 font-medium">Manifest Date</div><div className="text-lg font-black text-gray-900">{importConflict.existing.manifestDate}</div></div>
                      <div className="flex justify-between">
                         <div><div className="text-xs text-gray-500 font-medium">Total Items</div><div className="text-lg font-black text-gray-900">{importConflict.existing.itemCount}</div></div>
                         <div className="text-right">
                            <div className="text-xs text-gray-500 font-medium">Total Amount</div>
                            <div className="text-xl font-black text-indigo-600">₹{importConflict.existing.totalAmount.toLocaleString()}</div>
                         </div>
                      </div>
                      <div className="text-xs text-gray-400 font-medium pt-2 border-t border-gray-200">Created: {new Date(importConflict.existing.createdAt).toLocaleString()}</div>
                   </div>
                </div>

                {/* New Import */}
                <div className="bg-indigo-50 p-6 rounded-2xl md:rounded-3xl border border-indigo-200 relative overflow-hidden">
                   <div className="absolute top-0 right-0 p-4 opacity-10"><BoltIcon className="h-24 w-24 text-indigo-600"/></div>
                   <div className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-4 relative z-10">New Import</div>
                   <div className="space-y-4 relative z-10">
                      <div><div className="text-xs text-indigo-400 font-medium">Manifest Date</div><div className="text-lg font-black text-indigo-900">{importConflict.newCandidate.manifestDate}</div></div>
                      <div className="flex justify-between">
                         <div><div className="text-xs text-indigo-400 font-medium">Total Items</div><div className="text-lg font-black text-indigo-900">{importConflict.newCandidate.itemCount}</div></div>
                         <div className="text-right">
                            <div className="text-xs text-indigo-400 font-medium">Total Amount</div>
                            <div className="text-xl font-black text-indigo-700">₹{importConflict.newCandidate.totalAmount.toLocaleString()}</div>
                         </div>
                      </div>
                      <div className="text-xs text-indigo-400/60 font-medium pt-2 border-t border-indigo-200">Source: File Import</div>
                   </div>
                </div>
             </div>

             <div className="bg-gray-50 px-6 md:px-8 py-6 flex flex-col md:flex-row gap-4 sticky bottom-0 z-10 border-t border-gray-100">
                <button onClick={() => resolveConflict('keep_both')} className="flex-1 py-3 md:py-4 bg-white border-2 border-indigo-100 text-indigo-600 rounded-xl md:rounded-2xl font-black text-sm hover:bg-indigo-50 hover:border-indigo-200 transition-all flex items-center justify-center gap-2 shadow-sm"><DocumentDuplicateIcon className="h-5 w-5"/> Keep Both</button>
                <button onClick={() => resolveConflict('override')} className="flex-1 py-3 md:py-4 bg-indigo-600 text-white rounded-xl md:rounded-2xl font-black text-sm hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 flex items-center justify-center gap-2"><ScaleIcon className="h-5 w-5"/> Override</button>
                <button onClick={() => resolveConflict('discard')} className="px-6 py-4 text-gray-400 font-black text-sm hover:text-red-500 transition-colors">Discard</button>
             </div>
          </div>
        </div>
      )}

      {/* AI Extraction: Full Screen Modal or Minimized Floating Background Progress Bar */}
      {/* Default hidden / never displayed if user is using Chunking and Batch Engine or background batch runner */}
      {isUploading && !isAiMinimized && !isChunkingModalOpen && !isBackgroundBatchRunningRef.current && (
          <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-indigo-950/90 backdrop-blur-2xl animate-in fade-in duration-500 no-print p-4">
            {/* Top Bar with Minimize Action */}
            <div className="absolute top-4 right-4 sm:top-6 sm:right-6 flex items-center gap-2">
               <button
                  type="button"
                  onClick={() => setIsAiMinimized(true)}
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-white/10 hover:bg-white/20 active:scale-95 text-white rounded-xl text-xs sm:text-sm font-black border border-white/20 transition-all backdrop-blur-md cursor-pointer shadow-lg"
                  title="Minimize to background and continue using app"
               >
                  <MinusIcon className="h-4 w-4" />
                  <span>Minimize to Background</span>
               </button>
            </div>

            <div className="relative text-center p-4 max-w-lg w-full">
                <div className="mx-auto h-24 w-24 md:h-32 md:w-32 bg-indigo-600 rounded-[3rem] md:rounded-[3.5rem] animate-bounce shadow-[0_0_80px_rgba(79,70,229,0.5)] flex items-center justify-center mb-8 md:mb-10">
                   <CalculatorIcon className="h-12 w-12 md:h-16 md:w-16 text-white" />
                </div>
                <h2 className="text-2xl md:text-4xl font-black text-white tracking-tight mb-2">Neural Data Extraction</h2>
                <p className="text-xs sm:text-sm text-indigo-200/80 mb-6 font-medium">Extracting consignment rows and rates with AI</p>

                <div className="flex flex-col items-center space-y-3 bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-5 backdrop-blur-sm">
                   <div className="flex items-center gap-2 text-indigo-300 font-bold uppercase tracking-wider text-xs animate-pulse">
                      <SparklesIcon className="h-4 w-4 shrink-0 text-indigo-400" />
                      <span>{loadingMessage}</span>
                   </div>
                   {processingMode === 'hybrid' && (
                       <div className="flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full border border-white/15">
                           <BoltIcon className="h-3.5 w-3.5 text-yellow-400" />
                           <span className="text-[10px] text-white font-black uppercase tracking-wider">Hybrid High-Accuracy Mode</span>
                       </div>
                   )}
                   <button
                      type="button"
                      onClick={() => setIsAiMinimized(true)}
                      className="mt-2 text-xs font-black text-indigo-300 hover:text-white underline underline-offset-4 decoration-indigo-400/50 cursor-pointer transition-colors"
                   >
                      Work on other records while AI finishes in background →
                   </button>
                </div>
            </div>
          </div>
      )}

      {/* Friendly Completed Notification Popup with Direct Switch (suppressed while in chunking modal so capture is never interrupted) */}
      {completedAiResult && !isChunkingModalOpen && (
          <div className="fixed top-5 right-5 sm:top-6 sm:right-6 z-[110] max-w-md w-[calc(100vw-2.5rem)] bg-white dark:bg-slate-900 border-2 border-emerald-500/50 rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-2xl backdrop-blur-xl animate-in slide-in-from-top-4 duration-400 no-print">
             <div className="flex items-start gap-3.5">
                <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-lg shadow-emerald-500/30">
                   <CheckCircleIcon className="h-6 w-6" />
                </div>
                <div className="flex-1 min-w-0">
                   <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-0.5 rounded-md">
                         AI Extraction Complete
                      </span>
                      <button 
                         type="button" 
                         onClick={() => setCompletedAiResult(null)}
                         className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 p-1 rounded-lg transition-colors cursor-pointer"
                         title="Dismiss"
                      >
                         <XMarkIcon className="h-4 w-4" />
                      </button>
                   </div>
                   <h3 className="text-sm sm:text-base font-black text-gray-900 dark:text-white truncate">
                      {completedAiResult.manifestNo}
                   </h3>
                   <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                      Successfully extracted <span className="font-bold text-gray-800 dark:text-slate-200">{completedAiResult.itemCount} items</span> (₹{completedAiResult.totalAmount.toLocaleString()}).
                   </p>
                   
                   <div className="flex items-center gap-2 mt-3.5">
                      <button
                         type="button"
                         onClick={() => {
                            // Directly switch to the extracted data screen to proceed with app workflow
                            setActiveManifestId(completedAiResult.manifestId);
                            setView('billing');
                            setCompletedAiResult(null);
                         }}
                         className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs sm:text-sm font-black transition-all shadow-md shadow-emerald-600/20 flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                         <span>Open Extracted Data</span>
                         <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                      </button>
                      <button
                         type="button"
                         onClick={() => setCompletedAiResult(null)}
                         className="py-2.5 px-3 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-600 dark:text-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
                      >
                         Dismiss
                      </button>
                   </div>
                </div>
             </div>
          </div>
      )}
      {(isCreateFolderOpen || editingFolderId) && (<div className="fixed inset-0 z-50 flex items-center justify-center bg-indigo-950/80 backdrop-blur-md p-4 animate-in fade-in duration-300"><div className="bg-white rounded-2xl md:rounded-[3rem] shadow-2xl max-w-lg w-full overflow-hidden border border-gray-100 p-8 md:p-12"><h2 className="text-2xl md:text-3xl font-black text-gray-900 mb-2">{editingFolderId ? 'Rename Folder' : 'New Folder'}</h2><p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-8">Organize your billing history</p><input autoFocus className="w-full px-6 py-4 md:px-8 md:py-5 bg-gray-50 border border-gray-200 rounded-xl md:rounded-[2rem] font-black text-lg md:text-xl mb-8 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none" placeholder="Folder Name..." value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (editingFolderId ? handleRenameFolder(editingFolderId, newFolderName) : handleCreateFolder())} /><div className="flex gap-4"><button onClick={() => { setIsCreateFolderOpen(false); setEditingFolderId(null); setNewFolderName(''); }} className="flex-1 py-3 md:py-4 font-black text-gray-400 bg-gray-50 rounded-xl md:rounded-[2rem] hover:bg-gray-100 transition-all">Cancel</button><button onClick={() => editingFolderId ? handleRenameFolder(editingFolderId, newFolderName) : handleCreateFolder()} className="flex-1 py-3 md:py-4 font-black text-white bg-indigo-600 rounded-xl md:rounded-[2rem] hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-200">{editingFolderId ? 'Update' : 'Create'}</button></div></div></div>)}
      {/* Upload Modal & Full-Page Images Capture Studio */}
      {isUploadModalOpen && !importConflict && (
        uploadTab === 'img' ? (
          /* ============================================================ */
          /* DEDICATED FULL-PAGE IMAGE CAPTURE STUDIO                     */
          /* ============================================================ */
          <div
            id="image-capture-studio-page"
            className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-slate-100 animate-in fade-in duration-200 overflow-hidden"
          >
            {/* Streamlined Studio Header (Responsive for Mobile, Tablet & PC) */}
            <header className="shrink-0 flex items-center justify-between px-3 sm:px-5 md:px-6 py-2.5 sm:py-3 bg-slate-900/95 backdrop-blur-md border-b border-slate-800/90 z-30 gap-2 sm:gap-4">
              <div className="flex items-center gap-1.5 sm:gap-2.5 md:gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => setIsUploadModalOpen(false)}
                  className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-750 text-slate-300 hover:text-white text-xs font-bold transition-all active:scale-95 cursor-pointer shrink-0 border border-slate-700/60 shadow-xs"
                  title="Back to workspace"
                >
                  <ArrowLeftIcon className="h-4 w-4" />
                  <span className="hidden sm:inline">Back</span>
                </button>

                {/* Studio Brand Title (Tablet & PC) */}
                <div className="hidden lg:flex items-center gap-2 pr-2.5 border-r border-slate-800 shrink-0">
                  <div className="h-7 w-7 rounded-lg bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center shadow-md shadow-indigo-900/40">
                    <CameraIcon className="h-3.5 w-3.5 text-white" />
                  </div>
                  <div className="text-left">
                    <h2 className="text-xs font-black text-white leading-tight">
                      Capture Studio
                    </h2>
                    <span className="text-[9px] font-bold text-indigo-400 block -mt-0.5">
                      Multi-Page Manifest
                    </span>
                  </div>
                </div>

                {/* Mode / Tab Switcher Pill */}
                <div className="flex items-center p-0.5 sm:p-1 bg-slate-800/90 rounded-xl border border-slate-700/80 gap-0.5 sm:gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setUploadTab('doc')}
                    className="px-2 sm:px-2.5 py-1 rounded-lg text-[11px] sm:text-xs font-bold text-slate-400 hover:text-white transition-all cursor-pointer"
                  >
                    Document
                  </button>
                  <button
                    type="button"
                    onClick={() => setUploadTab('img')}
                    className="px-2 sm:px-2.5 py-1 rounded-lg text-[11px] sm:text-xs font-bold bg-indigo-600 text-white shadow-xs transition-all cursor-pointer"
                  >
                    Images
                  </button>
                  <button
                    type="button"
                    onClick={() => setUploadTab('json')}
                    className="px-2 sm:px-2.5 py-1 rounded-lg text-[11px] sm:text-xs font-bold text-slate-400 hover:text-emerald-400 transition-all cursor-pointer"
                  >
                    JSON
                  </button>
                </div>

                {/* Manifest Wise Badge with Tap Guidance */}
                <div className="relative inline-block shrink-0">
                  <span
                    onClick={triggerManifestComment}
                    onTouchStart={triggerManifestComment}
                    className="text-[10px] font-black bg-indigo-950/70 hover:bg-indigo-900/90 text-indigo-300 border border-indigo-800/80 px-2 sm:px-2.5 py-1 rounded-full cursor-pointer transition-all inline-flex items-center gap-1 select-none active:scale-95 shadow-xs"
                    title="Touch to view guidance"
                  >
                    <span className="hidden sm:inline">Manifest Wise</span>
                    <span className="sm:hidden">1 Manifest</span>
                    <InformationCircleIcon className="h-3 w-3 text-indigo-400" />
                  </span>

                  {/* Comment Bubble pointing directly to Span */}
                  <div
                    className={`absolute top-full left-0 mt-2.5 z-50 w-72 sm:w-80 p-3.5 bg-slate-900/95 backdrop-blur-md text-white rounded-2xl shadow-2xl border border-slate-700/80 transition-all duration-300 ease-out origin-top-left ${
                      showManifestComment
                        ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto'
                        : 'opacity-0 scale-95 -translate-y-1.5 pointer-events-none'
                    }`}
                  >
                    <div className="absolute -top-1.5 left-5 w-3 h-3 bg-slate-900 border-t border-l border-slate-700/80 rotate-45" />
                    <div className="relative z-10 flex items-start gap-2.5">
                      <div className="p-1.5 rounded-lg bg-indigo-600/40 text-indigo-300 shrink-0 mt-0.5">
                        <InformationCircleIcon className="h-4 w-4" />
                      </div>
                      <div className="space-y-1 text-left">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-black text-white">Manifest Wise Import</span>
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 uppercase tracking-wide">
                            One Manifest
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-300 leading-relaxed font-normal">
                          Please upload all documents, slips, or pages for <strong>one complete manifest</strong> per upload session. Do not mix consignments from multiple different manifests in a single import.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: Captured Pages Vault, AI Mode Toggle & Close Button */}
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                {/* Captured Manifest Pages Local Vault Button */}
                <button
                  id="open-captured-sessions-vault-btn"
                  type="button"
                  onClick={() => setIsCapturedSessionsModalOpen(true)}
                  className="relative inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-750 text-slate-200 hover:text-white border border-slate-700/90 text-xs font-bold transition-all active:scale-95 cursor-pointer shadow-xs"
                  title="Open Local Storage of Captured Manifest Pages"
                >
                  <DocumentDuplicateIcon className="h-4 w-4 text-indigo-400" />
                  <span className="hidden md:inline">Captured Pages</span>
                  <span className="hidden sm:inline md:hidden">Vault</span>
                  {capturedSessionsStats.total > 0 && (
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-black ${
                        capturedSessionsStats.failed > 0
                          ? 'bg-rose-600 text-white'
                          : capturedSessionsStats.ready > 0
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-emerald-600 text-white'
                      }`}
                    >
                      {capturedSessionsStats.total}
                    </span>
                  )}
                  {capturedSessionsStats.failed > 0 && (
                    <span className="h-2 w-2 rounded-full bg-rose-500 ring-2 ring-slate-900 absolute -top-0.5 -right-0.5 animate-ping" />
                  )}
                </button>

                {/* AI Mode Toggle */}
                <div className="flex items-center p-0.5 sm:p-1 bg-slate-800/90 rounded-xl border border-slate-700 text-xs gap-0.5 sm:gap-1">
                  <button
                    type="button"
                    onClick={() => setProcessingMode('default')}
                    className={`px-2 sm:px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                      processingMode === 'default'
                        ? 'bg-indigo-600 text-white shadow-xs font-black'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title="Standard AI Processing"
                  >
                    <CpuChipIcon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Default AI</span>
                    <span className="sm:hidden">Default</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setProcessingMode('hybrid')}
                    className={`px-2 sm:px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                      processingMode === 'hybrid'
                        ? 'bg-indigo-600 text-white shadow-xs font-black'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title="Hybrid OCR + AI Processing"
                  >
                    <BoltIcon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Hybrid AI</span>
                    <span className="sm:hidden">Hybrid</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setIsUploadModalOpen(false)}
                  className="p-1.5 sm:p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                  title="Close Studio"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>
            </header>

            {/* Studio Main Workspace (Optimized for Mobile, Tablet & PC) */}
            <main className="flex-1 overflow-y-auto px-2.5 sm:px-4 md:px-6 py-2 sm:py-3 md:py-4 flex flex-col items-center justify-start md:justify-center relative min-h-0">
              {/* Headless Native Camera Shutter Ref & Inputs */}
              <NativeCameraShutter
                ref={nativeCameraRef}
                onPhotoCaptured={handleNativePhotoCaptured}
                onBeforeCapture={handleBeforeCameraCapture}
                headless
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => handleCameraCapture(e)}
              />
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  handleImageUpload(e);
                  e.target.value = '';
                }}
              />

              {isCameraScannerOpen ? (
                /* CASE 1: Sequential Camera Scanner View with Full Screen Space */
                <div className="w-full max-w-2xl bg-slate-900 text-white rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 md:p-6 border border-slate-800 shadow-2xl space-y-2.5 sm:space-y-3.5 animate-in fade-in zoom-in-95 duration-200 my-auto shrink-0">
                  {/* Header */}
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                    <div className="flex items-center gap-2 sm:gap-2.5">
                      <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-900/50 shrink-0">
                        <CameraIcon className="h-4 w-4 sm:h-5 sm:w-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 sm:gap-2">
                          <h4 className="text-xs sm:text-base font-black text-white">
                            Multi-Page Camera Scanner
                          </h4>
                          <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider px-1.5 sm:px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                            One Manifest
                          </span>
                        </div>
                        <p className="text-[10px] sm:text-[11px] text-slate-400">
                          Capturing sequential pages (up to 5) for single manifest
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleCameraScannerCancel}
                      className="p-1 sm:p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                      title="Exit Scanner"
                    >
                      <XMarkIcon className="h-4 w-4 sm:h-5 sm:w-5" />
                    </button>
                  </div>

                  {/* Sequential Step Progress Tracker (1 to 5) */}
                  <div className="flex items-center justify-between gap-1 sm:gap-2 px-1 py-0.5">
                    {[0, 1, 2, 3, 4].map((stepIdx) => {
                      const isSaved = stepIdx < scannerCapturedPhotos.length;
                      const isCurrent = stepIdx === scannerCapturedPhotos.length && !!scannerPendingPhoto;
                      const isNextUp = stepIdx === scannerCapturedPhotos.length && !scannerPendingPhoto;

                      return (
                        <div key={stepIdx} className="flex-1 flex flex-col items-center gap-1">
                          <div
                            className={`h-1.5 sm:h-2 w-full rounded-full transition-all ${
                              isSaved
                                ? 'bg-emerald-500'
                                : isCurrent
                                ? 'bg-indigo-500 ring-2 ring-indigo-400/50 animate-pulse'
                                : isNextUp
                                ? 'bg-indigo-900/80 border border-indigo-700'
                                : 'bg-slate-800'
                            }`}
                          />
                          <span
                            className={`text-[9px] sm:text-[11px] font-bold ${
                              isSaved
                                ? 'text-emerald-400'
                                : isCurrent
                                ? 'text-indigo-300'
                                : 'text-slate-500'
                            }`}
                          >
                            P{stepIdx + 1} {isSaved ? '✓' : ''}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Center Area: Photo Preview OR Prompt */}
                  {scannerPendingPhoto ? (
                    <div className="space-y-3">
                      <div
                        id="scanner-photo-preview-container"
                        role="button"
                        tabIndex={0}
                        onClick={() => setIsScannerPhotoMaximized((prev) => !prev)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setIsScannerPhotoMaximized((prev) => !prev);
                          }
                        }}
                        className={`relative bg-black rounded-xl sm:rounded-2xl overflow-hidden border transition-all duration-300 flex items-center justify-center group shadow-inner cursor-pointer select-none ${
                          isScannerPhotoMaximized
                            ? 'border-indigo-500/80 ring-2 ring-indigo-500/40 max-h-[55vh] sm:max-h-[500px] min-h-48'
                            : 'border-slate-800 hover:border-indigo-500/60 max-h-36 sm:max-h-48 min-h-24'
                        }`}
                        title={isScannerPhotoMaximized ? 'Click or tap photo to minimize' : 'Click or tap photo to maximize'}
                      >
                        <img
                          id="scanner-photo-preview-img"
                          src={scannerPendingPhoto.preview}
                          alt={`Page ${scannerCapturedPhotos.length + 1} Preview`}
                          className={`w-full object-contain transition-all duration-300 ${
                            isScannerPhotoMaximized ? 'max-h-[55vh] sm:max-h-[500px]' : 'max-h-36 sm:max-h-48'
                          }`}
                        />
                        <div className="absolute top-2 left-2 bg-slate-900/90 backdrop-blur-md text-white text-[10px] sm:text-xs font-black px-2 py-0.5 rounded-full border border-slate-700 shadow-md flex items-center gap-1.5 pointer-events-none">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                          Page {scannerCapturedPhotos.length + 1} of 5
                        </div>
                        <div className="absolute top-2 right-2 flex items-center gap-1">
                          <div className="bg-slate-900/80 backdrop-blur-xs text-slate-300 text-[9px] font-mono px-1.5 py-0.5 rounded-full border border-slate-700 pointer-events-none">
                            {(scannerPendingPhoto.file.size / 1024).toFixed(0)} KB
                          </div>
                          <button
                            id="scanner-preview-toggle-btn"
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsScannerPhotoMaximized((prev) => !prev);
                            }}
                            className="p-1 rounded-full bg-indigo-600/90 hover:bg-indigo-500 text-white border border-indigo-400/50 shadow-md transition-all active:scale-95 cursor-pointer flex items-center justify-center"
                            title={isScannerPhotoMaximized ? 'Minimize preview' : 'Maximize preview'}
                          >
                            {isScannerPhotoMaximized ? (
                              <ArrowsPointingInIcon className="h-3 w-3" />
                            ) : (
                              <ArrowsPointingOutIcon className="h-3 w-3" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* 3 Key Action Buttons */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-0.5">
                        <button
                          type="button"
                          onClick={handleCameraRetake}
                          className="w-full py-2 sm:py-2.5 px-2 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 hover:text-white border border-slate-700 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs"
                        >
                          <ArrowPathIcon className="h-3.5 w-3.5 text-amber-400" />
                          <span>Retake</span>
                        </button>

                        {scannerCapturedPhotos.length + 1 < 5 && (
                          <button
                            type="button"
                            onClick={handleCameraSaveAndNext}
                            className="w-full py-2 sm:py-2.5 px-2 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-black text-xs rounded-xl shadow-md shadow-indigo-900/50 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                          >
                            <CameraIcon className="h-3.5 w-3.5" />
                            <span>Save & Next (P{scannerCapturedPhotos.length + 2})</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={handleCameraScannerDone}
                          className={`w-full py-2 sm:py-2.5 px-2 ${
                            scannerCapturedPhotos.length + 1 >= 5 ? 'sm:col-span-2' : ''
                          } bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-black text-xs rounded-xl shadow-md shadow-emerald-900/50 flex items-center justify-center gap-1.5 transition-all cursor-pointer`}
                        >
                          <CheckIcon className="h-3.5 w-3.5" />
                          <span>
                            {scannerCapturedPhotos.length + 1 >= 5
                              ? 'Done (All 5 Pages)'
                              : `Done (${scannerCapturedPhotos.length + 1} Pages)`}
                          </span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Waiting to snap next consecutive page */
                    <div className="space-y-3 py-2">
                      <button
                        type="button"
                        onClick={() => cameraInputRef.current?.click()}
                        className="w-full py-6 sm:py-8 px-4 border-2 border-dashed border-indigo-500/60 rounded-2xl bg-indigo-950/30 hover:bg-indigo-950/60 text-indigo-300 flex flex-col items-center justify-center gap-2 transition-all cursor-pointer group"
                      >
                        <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-900/60 group-hover:scale-105 transition-transform">
                          <CameraIcon className="h-6 w-6 sm:h-7 sm:w-7" />
                        </div>
                        <div className="text-center">
                          <p className="font-black text-white text-sm sm:text-base">
                            Open Camera for Page {scannerCapturedPhotos.length + 1} of 5
                          </p>
                          <p className="text-[11px] text-indigo-400 mt-0.5">
                            Snap the next consecutive page of this manifest
                          </p>
                        </div>
                      </button>

                      {scannerCapturedPhotos.length > 0 && (
                        <div className="flex items-center justify-between pt-0.5">
                          <span className="text-[11px] text-slate-400">
                            {scannerCapturedPhotos.length} page(s) already saved
                          </span>
                          <button
                            type="button"
                            onClick={handleCameraScannerDone}
                            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
                          >
                            <CheckIcon className="h-3.5 w-3.5" />
                            <span>Done ({scannerCapturedPhotos.length}P)</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Filmstrip of already captured pages */}
                  {scannerCapturedPhotos.length > 0 && (
                    <div className="border-t border-slate-800 pt-2">
                      <p className="text-[10px] font-bold text-slate-400 mb-1.5">
                        Saved Manifest Pages in Sequence:
                      </p>
                      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                        {scannerCapturedPhotos.map((item, idx) => (
                          <div
                            key={idx}
                            className="relative shrink-0 w-14 h-18 sm:w-16 sm:h-20 rounded-lg bg-slate-800 border border-slate-700 overflow-hidden group shadow-xs"
                          >
                            <img
                              src={item.preview}
                              alt={`Page ${idx + 1}`}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute top-0.5 left-0.5 bg-black/80 text-white text-[8px] font-black px-1 rounded">
                              P{idx + 1}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveScannerCapturedPhoto(idx)}
                              className="absolute top-0.5 right-0.5 p-0.5 bg-red-600/90 text-white rounded hover:bg-red-600 cursor-pointer"
                              title="Remove this page"
                            >
                              <XMarkIcon className="h-2 w-2" />
                            </button>
                          </div>
                        ))}
                        {scannerCapturedPhotos.length < 5 && (
                          <div className="shrink-0 w-14 h-18 sm:w-16 sm:h-20 rounded-lg border border-dashed border-slate-700 flex flex-col items-center justify-center text-slate-500 text-[9px] font-bold">
                            <span>Slot {scannerCapturedPhotos.length + 1}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* CASE 2: Adaptive Multi-Device Capture Studio (Mobile Stack, Tablet/PC 2x2 Grid) */
                <div className="w-full max-w-3xl lg:max-w-4xl flex flex-col items-center gap-2 sm:gap-3 md:gap-3.5 my-auto shrink-0 animate-in fade-in zoom-in-95 duration-200">
                  {/* Studio Hero Header & Quick Guidance */}
                  <div className="w-full text-center space-y-0.5 sm:space-y-1 px-1 shrink-0">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-[10px] sm:text-xs font-semibold">
                      <SparklesIcon className="h-3 w-3 text-indigo-400 shrink-0" />
                      <span>One Manifest Session • Up to 5 Sequential Pages</span>
                    </div>
                    <h2 className="text-base sm:text-lg md:text-xl font-black text-white tracking-tight leading-snug">
                      Capture & Upload Manifest
                    </h2>
                    <p className="text-[11px] sm:text-xs text-slate-400 max-w-md mx-auto font-normal hidden sm:block">
                      Scan consecutive physical pages or import clear digital files for AI extraction.
                    </p>
                  </div>

                  {/* Dynamic Action Grid: 1 Column on Mobile, 2 Columns on Tablet & PC */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-2.5 md:gap-3 w-full">
                    {/* Primary Trigger: Live In-App Camera */}
                    <button
                      id="live-in-app-scanner-btn"
                      type="button"
                      onClick={() => {
                        setCameraMode('in-app');
                        setIsHighResCameraOpen(true);
                      }}
                      className="w-full p-2.5 sm:p-3 md:p-3.5 bg-gradient-to-br from-slate-900 via-indigo-950/40 to-slate-900 border border-slate-700/80 hover:border-indigo-400 active:scale-[0.99] rounded-xl sm:rounded-2xl shadow-lg flex items-center justify-between gap-2.5 sm:gap-3 transition-all cursor-pointer group text-left"
                    >
                      <div className="flex items-center gap-2.5 sm:gap-3 text-left min-w-0">
                        <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center shrink-0 group-hover:scale-105 group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-xs">
                          <CameraIcon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h4 className="text-xs sm:text-sm font-black text-white">
                              Live In-App Camera
                            </h4>
                            <span className="text-[9px] font-black uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-1.5 py-0.2 rounded">
                              1080p FHD
                            </span>
                          </div>
                          <p className="text-[10px] sm:text-[11px] text-slate-400 truncate sm:whitespace-normal mt-0.5">
                            Live scanner with auto-edge detection in browser.
                          </p>
                        </div>
                      </div>

                      <span className="shrink-0 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] sm:text-xs font-bold transition-colors flex items-center gap-1 shadow-md shadow-indigo-900/30">
                        <SparklesIcon className="h-3 w-3" />
                        <span className="hidden sm:inline">Open Live</span>
                        <span className="sm:hidden">Live</span>
                      </span>
                    </button>

                    {/* Mode Option 2: Native Device Camera */}
                    <button
                      id="launch-native-camera-btn"
                      type="button"
                      onClick={() => {
                        setCameraMode('native');
                        nativeCameraRef.current?.trigger();
                      }}
                      className="w-full p-2.5 sm:p-3 md:p-3.5 bg-gradient-to-br from-slate-900 via-purple-950/40 to-slate-900 border border-slate-700/80 hover:border-purple-400 active:scale-[0.99] rounded-xl sm:rounded-2xl shadow-lg flex items-center justify-between gap-2.5 sm:gap-3 transition-all cursor-pointer group text-left"
                    >
                      <div className="flex items-center gap-2.5 sm:gap-3 text-left min-w-0">
                        <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-purple-600/20 text-purple-400 border border-purple-500/30 flex items-center justify-center shrink-0 group-hover:scale-105 group-hover:bg-purple-600 group-hover:text-white transition-all shadow-xs">
                          <CameraIcon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h4 className="text-xs sm:text-sm font-black text-white">
                              Native Device Camera
                            </h4>
                            <span className="text-[9px] font-black uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/30 px-1.5 py-0.2 rounded">
                              Full HDR
                            </span>
                          </div>
                          <p className="text-[10px] sm:text-[11px] text-slate-400 truncate sm:whitespace-normal mt-0.5">
                            Opens phone's actual camera app with hardware HDR.
                          </p>
                        </div>
                      </div>
                      <span className="shrink-0 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-[11px] sm:text-xs font-bold transition-colors shadow-md shadow-purple-900/30">
                        <span className="hidden sm:inline">Open Native</span>
                        <span className="sm:hidden">Native</span>
                      </span>
                    </button>

                    {/* Secondary Trigger: Choose from Gallery / Files */}
                    <button
                      id="choose-from-gallery-btn"
                      type="button"
                      onClick={() => galleryInputRef.current?.click()}
                      className="w-full p-2.5 sm:p-3 md:p-3.5 bg-gradient-to-br from-slate-900 via-sky-950/40 to-slate-900 border border-slate-700/80 hover:border-sky-400 active:scale-[0.99] rounded-xl sm:rounded-2xl shadow-lg flex items-center justify-between gap-2.5 sm:gap-3 transition-all cursor-pointer group text-left"
                    >
                      <div className="flex items-center gap-2.5 sm:gap-3 text-left min-w-0">
                        <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-sky-600/20 text-sky-400 border border-sky-500/30 flex items-center justify-center shrink-0 group-hover:scale-105 group-hover:bg-sky-600 group-hover:text-white transition-all shadow-xs">
                          <PhotoIcon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h4 className="text-xs sm:text-sm font-black text-white">
                              Gallery & Local Files
                            </h4>
                            <span className="text-[9px] font-black uppercase tracking-wider bg-sky-500/20 text-sky-300 border border-sky-500/30 px-1.5 py-0.2 rounded">
                              Max 5 Pages
                            </span>
                          </div>
                          <p className="text-[10px] sm:text-[11px] text-slate-400 truncate sm:whitespace-normal mt-0.5">
                            Choose photos or saved digital scans from storage.
                          </p>
                        </div>
                      </div>
                      <span className="shrink-0 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-[11px] sm:text-xs font-bold transition-colors shadow-md shadow-sky-900/30">
                        <span className="hidden sm:inline">Choose Files</span>
                        <span className="sm:hidden">Files</span>
                      </span>
                    </button>

                    {/* Chunking & Batch Engine Direct Trigger */}
                    <button
                      id="open-chunking-batch-engine-btn"
                      type="button"
                      onClick={() => {
                        setIsUploadModalOpen(false);
                        setChunkingInitialTab('capture');
                        setIsChunkingModalOpen(true);
                      }}
                      className="w-full p-2.5 sm:p-3 md:p-3.5 bg-gradient-to-br from-slate-900 via-amber-950/30 to-slate-900 border border-amber-500/30 hover:border-amber-400 active:scale-[0.99] rounded-xl sm:rounded-2xl shadow-lg flex items-center justify-between gap-2.5 sm:gap-3 transition-all cursor-pointer group text-left"
                    >
                      <div className="flex items-center gap-2.5 sm:gap-3 text-left min-w-0">
                        <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-amber-600/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0 group-hover:scale-105 group-hover:bg-amber-600 group-hover:text-white transition-all shadow-xs">
                          <BoltIcon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h4 className="text-xs sm:text-sm font-black text-white">
                              Chunking & Batch Engine
                            </h4>
                            <span className="text-[9px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.2 rounded">
                              Batch Mode
                            </span>
                          </div>
                          <p className="text-[10px] sm:text-[11px] text-slate-400 truncate sm:whitespace-normal mt-0.5">
                            Sequential pipeline for multi-manifest sessions.
                          </p>
                        </div>
                      </div>
                      <span className="shrink-0 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 text-[11px] sm:text-xs font-black transition-colors shadow-md shadow-amber-900/30">
                        <span className="hidden sm:inline">Open Engine</span>
                        <span className="sm:hidden">Engine</span>
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </main>

            {/* Collapsible Bottom Manifest Queue */}
            {stagedImages.length > 0 && (
              <div className="shrink-0 z-40 transition-all">
                {!isManifestQueueExpanded ? (
                  /* Minimized Docked Bar (Mobile, Tablet & PC Adaptive) */
                  <div
                    onClick={() => setIsManifestQueueExpanded(true)}
                    className="bg-slate-900/95 backdrop-blur-md border-t border-slate-800 px-3 sm:px-6 py-2.5 sm:py-3.5 shadow-2xl cursor-pointer hover:bg-slate-850 transition-all select-none"
                  >
                    <div className="max-w-5xl mx-auto flex items-center justify-between gap-2 sm:gap-4">
                      {/* Mini stacked preview thumbnails */}
                      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                        <div className="flex items-center -space-x-2 overflow-hidden shrink-0">
                          {stagedImages.slice(0, 4).map((item, i) => (
                            <img
                              key={i}
                              src={item.preview}
                              alt=""
                              className="inline-block h-8 w-8 rounded-lg object-cover ring-2 ring-slate-900 shadow-sm"
                            />
                          ))}
                        </div>
                        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                          <span className="text-xs sm:text-sm font-black text-white truncate">
                            Manifest Queue
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shrink-0">
                            {stagedImages.length}/5 Pages
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
                        <div className="hidden md:flex items-center gap-1 text-xs font-bold text-indigo-300 bg-indigo-950/60 px-3 py-1 rounded-full border border-indigo-800/60">
                          <ChevronUpIcon className="h-3.5 w-3.5" />
                          <span>Tap to Review</span>
                        </div>

                        <button
                          id="quick-save-local-queue-btn"
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSaveToCapturedSessionsOnly();
                          }}
                          className="px-2.5 sm:px-3 py-1.5 sm:py-2 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 hover:text-white font-bold text-xs rounded-xl border border-slate-700 shadow-xs flex items-center gap-1 transition-all cursor-pointer"
                          title="Save to local storage without extracting now (capture next manifest immediately)"
                        >
                          <DocumentDuplicateIcon className="h-3.5 w-3.5 text-indigo-400" />
                          <span className="hidden sm:inline">Save & Next</span>
                          <span className="sm:hidden">Save</span>
                        </button>

                        <button
                          id="quick-commit-ai-queue-btn"
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleProcessStagedImages();
                          }}
                          className="px-3 sm:px-4 py-1.5 sm:py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-black text-xs sm:text-sm rounded-xl shadow-lg shadow-emerald-900/50 flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                          <SparklesIcon className="h-4 w-4" />
                          <span>Extract ({stagedImages.length}P)</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Expanded Review Drawer (Mobile, Tablet & PC Adaptive) */
                  <div className="bg-slate-900 border-t border-slate-700/90 shadow-2xl rounded-t-3xl p-3.5 sm:p-5 md:p-6 flex flex-col gap-4 max-h-[75vh] sm:max-h-[65vh] overflow-y-auto animate-in slide-in-from-bottom-4 duration-200">
                    <div className="max-w-5xl mx-auto w-full flex flex-col gap-3.5 sm:gap-4">
                      {/* Header: Tap to Collapse */}
                      <div
                        onClick={() => setIsManifestQueueExpanded(false)}
                        className="cursor-pointer flex items-center justify-between pb-3 border-b border-slate-800 select-none"
                      >
                        <div className="flex items-center gap-2">
                          <div className="p-1 rounded-lg bg-indigo-600/30 text-indigo-400">
                            <ChevronDownIcon className="h-4 w-4" />
                          </div>
                          <h4 className="text-sm sm:text-base font-black text-white">
                            Captured Manifest Pages ({stagedImages.length} of 5)
                          </h4>
                          <span className="text-[10px] text-slate-400 hidden sm:inline">
                            (Tap to minimize)
                          </span>
                        </div>

                        <div className="flex items-center gap-3">
                          <button
                            id="clear-all-staged-manifest-btn"
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleClearStagedImages();
                            }}
                            className="text-xs font-bold text-red-400 hover:text-red-300 hover:underline cursor-pointer"
                          >
                            Clear all
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsManifestQueueExpanded(false)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                            title="Collapse drawer"
                          >
                            <ChevronDownIcon className="h-5 w-5" />
                          </button>
                        </div>
                      </div>

                      {/* Multi-Page Continuous Prompt Banner */}
                      <div className="bg-gradient-to-r from-indigo-950/60 via-slate-900 to-purple-950/40 border border-indigo-800/60 rounded-2xl p-3 sm:p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                        <div className="text-center sm:text-left">
                          <p className="text-xs sm:text-sm font-black text-indigo-200 flex items-center justify-center sm:justify-start gap-1.5">
                            <SparklesIcon className="h-4 w-4 text-indigo-400" />
                            <span>Page {stagedImages.length} ready in batch queue!</span>
                          </p>
                          <p className="text-[11px] text-indigo-300/80 font-medium mt-0.5">
                            {stagedImages.length < 5
                              ? `Snap consecutive pages for this manifest (${5 - stagedImages.length} slots left) or commit to AI extraction.`
                              : 'All 5 pages captured! Ready to commit manifest to AI extraction queue.'}
                          </p>
                        </div>
                        {stagedImages.length < 5 && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              type="button"
                              onClick={() => {
                                setCameraMode('in-app');
                                setIsHighResCameraOpen(true);
                              }}
                              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
                              title="Capture next page using live in-app 1080p camera"
                            >
                              <CameraIcon className="h-3.5 w-3.5" />
                              <span>+ Page {stagedImages.length + 1} (In-App)</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setCameraMode('native');
                                nativeCameraRef.current?.trigger();
                              }}
                              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
                              title="Capture next page using phone's native HDR camera"
                            >
                              <CameraIcon className="h-3.5 w-3.5" />
                              <span>+ Page {stagedImages.length + 1} (Native)</span>
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Grid of Captured Pages (Responsive: 2 on mobile, 3-4 on tablet, 5 on desktop) */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5 sm:gap-3.5">
                      {stagedImages.map((item, idx) => (
                        <div
                          key={idx}
                          className="relative group bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden shadow-xs flex flex-col"
                        >
                          <div className="relative h-28 w-full bg-slate-950 overflow-hidden">
                            <img
                              src={item.preview}
                              alt={`Manifest Page ${idx + 1}`}
                              className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-200"
                            />
                            <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-slate-900/85 backdrop-blur-xs text-white text-[10px] font-black rounded-md shadow-xs">
                              Page {idx + 1}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveStagedImage(idx)}
                              className="absolute top-1.5 right-1.5 p-1 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors cursor-pointer shadow-xs"
                              title="Remove photo"
                            >
                              <XMarkIcon className="h-3 w-3" />
                            </button>
                          </div>
                          <div className="p-2 bg-slate-800/90 border-t border-slate-700 flex items-center justify-between gap-1">
                            <span className="text-[10px] text-slate-400 font-semibold truncate">
                              {(item.file.size / 1024).toFixed(0)} KB
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRecropStagedImage(idx)}
                              className="text-[10px] text-indigo-400 font-bold hover:underline flex items-center gap-0.5 cursor-pointer"
                              title="Re-adjust crop & perspective corners"
                            >
                              <span>Re-crop</span>
                            </button>
                          </div>
                        </div>
                      ))}

                      {stagedImages.length < 5 && (
                        <div className="flex flex-col items-center justify-center h-full min-h-[140px] border-2 border-dashed border-indigo-800 rounded-2xl p-2 text-center bg-indigo-950/30 gap-2">
                          <span className="text-[11px] font-black text-indigo-300">
                            Slot {stagedImages.length + 1} of 5
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setCameraMode('in-app');
                                setIsHighResCameraOpen(true);
                              }}
                              className="p-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-xl transition-all cursor-pointer shadow-xs"
                              title="Open Live In-App Camera for this slot"
                            >
                              <CameraIcon className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setCameraMode('native');
                                nativeCameraRef.current?.trigger();
                              }}
                              className="p-2 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white rounded-xl transition-all cursor-pointer shadow-xs"
                              title="Open Native Camera (Full HDR) for this slot"
                            >
                              <SparklesIcon className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => galleryInputRef.current?.click()}
                              className="p-2 bg-slate-800 text-slate-200 border border-slate-700 rounded-xl hover:bg-slate-700 transition-all cursor-pointer shadow-xs"
                              title="Choose from gallery for this slot"
                            >
                              <PhotoIcon className="h-4 w-4 text-indigo-400" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Extract Manifest Button Footer */}
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-800">
                      <p className="text-[11px] text-slate-400 font-medium text-center sm:text-left">
                        {stagedImages.length} high-res manifest page{stagedImages.length > 1 ? 's' : ''} ready to process in sequence
                      </p>
                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        <button
                          id="save-manifest-local-storage-btn"
                          type="button"
                          onClick={handleSaveToCapturedSessionsOnly}
                          className="flex-1 sm:flex-initial px-4 py-2.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 hover:text-white font-bold text-xs sm:text-sm rounded-xl border border-slate-700 shadow-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
                          title="Store these pages in local storage and start capturing next manifest"
                        >
                          <DocumentDuplicateIcon className="h-4 w-4 text-indigo-400" />
                          <span>Save & Capture Next</span>
                        </button>
                        <button
                          id="extract-manifest-ai-footer-btn"
                          type="button"
                          onClick={handleProcessStagedImages}
                          className="flex-1 sm:flex-initial px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 active:scale-95 text-white font-black text-xs sm:text-sm rounded-xl shadow-lg shadow-indigo-900/50 flex items-center justify-center gap-2 transition-all cursor-pointer"
                        >
                          <SparklesIcon className="h-4 w-4 text-indigo-200" />
                          <span>
                            Extract Manifest with AI ({stagedImages.length}{' '}
                            {stagedImages.length === 1 ? 'Page' : 'Pages'})
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                )}
              </div>
            )}
          </div>
        ) : (
          /* ============================================================ */
          /* STANDARD MODAL FOR DOCUMENT (PDF) & JSON BACKUP              */
          /* ============================================================ */
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-indigo-950/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
            <div className="bg-white dark:bg-slate-900 rounded-2xl md:rounded-[2.5rem] shadow-2xl max-w-2xl w-full overflow-hidden border border-gray-100 dark:border-slate-800 flex flex-col max-h-[90vh]">
              <div className="px-6 md:px-8 py-5 sm:py-6 border-b border-gray-100 dark:border-slate-800 flex justify-between items-center bg-gray-50/50 dark:bg-slate-850/50">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl md:text-2xl font-black text-gray-900 dark:text-white">Import Data</h2>
                    <div className="relative inline-block">
                      <span
                        onClick={triggerManifestComment}
                        onTouchStart={triggerManifestComment}
                        className="text-[10px] md:text-xs font-black bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800 px-2.5 py-0.5 rounded-full cursor-pointer transition-all inline-flex items-center gap-1 select-none active:scale-95 shadow-xs"
                        title="Touch to view guidance"
                      >
                        <span>Manifest Wise Import</span>
                        <InformationCircleIcon className="h-3 w-3 text-indigo-500/80" />
                      </span>

                      {/* Comment Bubble pointing directly to Span */}
                      <div
                        className={`absolute top-full left-0 mt-2.5 z-50 w-72 sm:w-80 p-3.5 bg-slate-900/95 dark:bg-slate-950/95 backdrop-blur-md text-white rounded-2xl shadow-2xl border border-slate-700/80 transition-all duration-300 ease-out origin-top-left ${
                          showManifestComment
                            ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto'
                            : 'opacity-0 scale-95 -translate-y-1.5 pointer-events-none'
                        }`}
                      >
                        <div className="absolute -top-1.5 left-5 w-3 h-3 bg-slate-900 dark:bg-slate-950 border-t border-l border-slate-700/80 rotate-45" />

                        <div className="relative z-10 flex items-start gap-2.5">
                          <div className="p-1.5 rounded-lg bg-indigo-600/40 text-indigo-300 shrink-0 mt-0.5">
                            <InformationCircleIcon className="h-4 w-4" />
                          </div>
                          <div className="space-y-1 text-left">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-black text-white">Manifest Wise Import</span>
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 uppercase tracking-wide">
                                One Manifest
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-300 leading-relaxed font-normal">
                              Please upload all documents, slips, or pages for <strong>one complete manifest</strong> per upload session. Do not mix consignments from multiple different manifests in a single import.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                    One whole Manifest at one time
                  </p>
                </div>
                <button
                  onClick={() => setIsUploadModalOpen(false)}
                  className="p-2 bg-white dark:bg-slate-850 rounded-xl shadow-sm text-gray-400 hover:text-gray-900 dark:hover:text-white transition-all cursor-pointer"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>

              {/* AI Mode Selector */}
              {uploadTab === 'doc' && (
                <div className="px-6 md:px-8 pt-5 md:pt-6">
                  <span className="text-[10px] font-black text-indigo-500 dark:text-indigo-400 uppercase tracking-widest mb-2.5 block ml-1">
                    AI Processing Model
                  </span>
                  <div className="flex flex-row items-center gap-1.5 p-1 bg-gray-100 dark:bg-slate-800 rounded-2xl border border-gray-200/80 dark:border-slate-700">
                    <button
                      onClick={() => setProcessingMode('default')}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl transition-all cursor-pointer ${
                        processingMode === 'default'
                          ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm ring-1 ring-black/5 font-black'
                          : 'text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white font-bold'
                      }`}
                    >
                      <CpuChipIcon className="h-4 w-4 md:h-5 md:w-5 shrink-0" />
                      <div className="text-left leading-tight">
                        <div className="text-xs uppercase tracking-tight">Default AI</div>
                        <div className="text-[9px] opacity-70 hidden sm:block">Fast • Balanced</div>
                      </div>
                    </button>
                    <button
                      onClick={() => setProcessingMode('hybrid')}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl transition-all cursor-pointer ${
                        processingMode === 'hybrid'
                          ? 'bg-indigo-600 text-white shadow-sm font-black'
                          : 'text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white font-bold'
                      }`}
                    >
                      <BoltIcon className="h-4 w-4 md:h-5 md:w-5 shrink-0" />
                      <div className="text-left leading-tight">
                        <div className="text-xs uppercase tracking-tight">Hybrid AI</div>
                        <div className="text-[9px] opacity-80 hidden sm:block">High Accuracy</div>
                      </div>
                    </button>
                  </div>
                  {processingMode === 'hybrid' && (
                    <p className="text-[10px] text-gray-400 dark:text-slate-400 font-medium mt-2 px-1">
                      Hybrid mode prioritizes column accuracy (Sl No, AWB, Weight).
                    </p>
                  )}
                </div>
              )}

              {/* Tab Selector */}
              <div className="px-6 md:px-8 mt-4 md:mt-5">
                <div className="flex flex-row items-center p-1 bg-gray-100 dark:bg-slate-800 rounded-2xl border border-gray-200/80 dark:border-slate-700 gap-1">
                  <button
                    onClick={() => setUploadTab('doc')}
                    className={`flex-1 py-2.5 px-2 text-center rounded-xl text-xs font-black uppercase tracking-wider transition-all truncate cursor-pointer ${
                      uploadTab === 'doc'
                        ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm ring-1 ring-black/5'
                        : 'text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    Document (PDF)
                  </button>
                  <button
                    onClick={() => setUploadTab('img')}
                    className={`flex-1 py-2.5 px-2 text-center rounded-xl text-xs font-black uppercase tracking-wider transition-all truncate cursor-pointer ${
                      uploadTab === 'img'
                        ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm ring-1 ring-black/5'
                        : 'text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    Images
                  </button>
                  <button
                    onClick={() => setUploadTab('json')}
                    className={`flex-1 py-2.5 px-2 text-center rounded-xl text-xs font-black uppercase tracking-wider transition-all truncate cursor-pointer ${
                      uploadTab === 'json'
                        ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm ring-1 ring-black/5'
                        : 'text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    JSON Backup
                  </button>
                </div>
              </div>

              <div className="p-6 md:p-8 overflow-y-auto">
                {uploadTab === 'doc' && (
                  <div className="space-y-6">
                    <div className="border-2 border-dashed border-gray-200 dark:border-slate-700 rounded-3xl p-8 text-center hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20 transition-colors relative">
                      <input
                        type="file"
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        accept=".pdf,.xlsx,.xls,.doc,.docx"
                        onChange={(e) => handleDocUpload(e)}
                      />
                      <DocumentTextIcon className="h-12 w-12 text-indigo-300 dark:text-indigo-500 mx-auto mb-4" />
                      <p className="text-indigo-950 dark:text-white font-bold">Click to select PDF, Excel, or Word</p>
                      <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium mt-1.5">
                        One whole Manifest at one time • Max 5 Pages / 5MB
                      </p>
                    </div>
                  </div>
                )}

                {uploadTab === 'json' && (
                  <div className="space-y-6">
                    <div className="border-2 border-dashed border-emerald-200 dark:border-emerald-800 rounded-3xl p-8 text-center hover:bg-emerald-50/30 dark:hover:bg-emerald-950/20 transition-colors relative">
                      <input
                        type="file"
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        accept=".json"
                        onChange={(e) => handleJsonUpload(e)}
                      />
                      <CodeBracketIcon className="h-12 w-12 text-emerald-400 mx-auto mb-4" />
                      <p className="text-emerald-950 dark:text-white font-bold">Select JSON Backup File</p>
                      <p className="text-xs text-emerald-500 dark:text-emerald-400 mt-2">
                        Direct restore, no AI processing
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL 1: Move to Recycle Bin Confirmation Dialog               */}
      {/* ------------------------------------------------------------- */}
      {deleteConfirmTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 animate-in fade-in duration-200 no-print">
          <div className="bg-white dark:bg-slate-900 rounded-2xl md:rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 dark:border-slate-800 p-6 md:p-7 animate-in zoom-in-95 duration-200">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 border border-rose-100 dark:border-rose-900/40 shadow-xs">
                <TrashIcon className="h-6 w-6" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300">
                    Move to Recycle Bin
                  </span>
                </div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white truncate">
                  Delete {deleteConfirmTarget.itemType === 'folder' ? 'Folder' : 'Manifest'}?
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  Are you sure you want to move <strong className="text-slate-800 dark:text-slate-200 font-bold">"{deleteConfirmTarget.name}"</strong> to the Recycle Bin?
                </p>
              </div>
            </div>

            {/* Item details card */}
            <div className="mt-4 p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/70 dark:border-slate-700/60 text-xs space-y-1.5">
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                <span className="text-slate-400 font-medium">Name:</span>
                <span className="font-bold text-slate-800 dark:text-white truncate max-w-[200px]">{deleteConfirmTarget.name}</span>
              </div>
              {deleteConfirmTarget.date && (
                <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                  <span className="text-slate-400 font-medium">Manifest Date:</span>
                  <span className="font-medium text-slate-700 dark:text-slate-200">{deleteConfirmTarget.date}</span>
                </div>
              )}
              {deleteConfirmTarget.count !== undefined && (
                <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                  <span className="text-slate-400 font-medium">{deleteConfirmTarget.itemType === 'folder' ? 'Associated Records:' : 'Units Count:'}</span>
                  <span className="font-bold text-indigo-600 dark:text-indigo-400">{deleteConfirmTarget.count} {deleteConfirmTarget.itemType === 'folder' ? 'manifest(s)' : 'units'}</span>
                </div>
              )}
              {deleteConfirmTarget.amount !== undefined && (
                <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                  <span className="text-slate-400 font-medium">Total Billed:</span>
                  <span className="font-black text-slate-900 dark:text-white">₹{deleteConfirmTarget.amount.toLocaleString()}</span>
                </div>
              )}
            </div>

            <div className="mt-3.5 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-900/40 rounded-xl flex items-start gap-2 text-[11px] text-amber-800 dark:text-amber-200 leading-tight">
              <InformationCircleIcon className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <span>Items are safely stored in the <strong>Recycle Bin</strong> and can be restored anytime or permanently cleared.</span>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setDeleteConfirmTarget(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeMoveToRecycleBin}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-95 text-xs font-black text-white shadow-md shadow-rose-200 dark:shadow-none transition-all inline-flex items-center gap-2"
              >
                <TrashIcon className="h-4 w-4" />
                <span>Move to Bin</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL 2: Full Recycle Bin Manager Modal                        */}
      {/* ------------------------------------------------------------- */}
      {isRecycleBinOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-3 sm:p-6 animate-in fade-in duration-200 no-print">
          <div className="bg-white dark:bg-slate-900 rounded-2xl md:rounded-3xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-5 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 bg-slate-50/70 dark:bg-slate-800/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 border border-rose-200/60 dark:border-rose-900/60">
                  <TrashIcon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <span>Recycle Bin</span>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300">
                      {recycleBin.length} {recycleBin.length === 1 ? 'item' : 'items'}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Restore deleted items or permanently purge them</p>
                </div>
              </div>

              <button
                onClick={() => {
                  setIsRecycleBinOpen(false);
                  setSelectedBinItemIds([]);
                }}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Close"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            {/* Filter & Search Bar */}
            <div className="p-4 sm:px-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              {/* Filter Tabs */}
              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400">
                <button
                  type="button"
                  onClick={() => setRecycleBinFilter('all')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    recycleBinFilter === 'all'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-black'
                      : 'hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  All ({recycleBin.length})
                </button>
                <button
                  type="button"
                  onClick={() => setRecycleBinFilter('manifest')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    recycleBinFilter === 'manifest'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-black'
                      : 'hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Manifests ({recycleBin.filter(i => i.itemType === 'manifest').length})
                </button>
                <button
                  type="button"
                  onClick={() => setRecycleBinFilter('folder')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    recycleBinFilter === 'folder'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-black'
                      : 'hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Folders ({recycleBin.filter(i => i.itemType === 'folder').length})
                </button>
              </div>

              {/* Search Box */}
              <div className="relative flex-1 sm:max-w-xs">
                <MagnifyingGlassIcon className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={recycleBinSearch}
                  onChange={(e) => setRecycleBinSearch(e.target.value)}
                  placeholder="Search in bin..."
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            {/* Batch Controls Toolbar */}
            {recycleBin.length > 0 && (
              <div className="px-5 sm:px-6 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={filteredBinItems.length > 0 && filteredBinItems.every(i => selectedBinItemIds.includes(i.id))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          const allFilteredIds = filteredBinItems.map(i => i.id);
                          setSelectedBinItemIds(Array.from(new Set([...selectedBinItemIds, ...allFilteredIds])));
                        } else {
                          const filteredSet = new Set(filteredBinItems.map(i => i.id));
                          setSelectedBinItemIds(selectedBinItemIds.filter(id => !filteredSet.has(id)));
                        }
                      }}
                      className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4 border-slate-300 dark:border-slate-700 cursor-pointer"
                    />
                    <span>Select All</span>
                  </label>

                  {selectedBinItemIds.length > 0 && (
                    <span className="font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded-full text-[11px]">
                      {selectedBinItemIds.length} selected
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {selectedBinItemIds.length > 0 ? (
                    <>
                      <button
                        type="button"
                        onClick={restoreSelectedBinItems}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-lg font-bold text-xs shadow-xs transition-all cursor-pointer"
                      >
                        <ArrowUturnLeftIcon className="h-3.5 w-3.5" />
                        <span>Restore Selected ({selectedBinItemIds.length})</span>
                      </button>
                      <button
                        type="button"
                        onClick={promptClearSelected}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:hover:bg-rose-900/60 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60 rounded-lg font-bold text-xs transition-all cursor-pointer"
                      >
                        <TrashIcon className="h-3.5 w-3.5 text-rose-600" />
                        <span>Clear Selected</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={restoreAllBinItems}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-300 text-slate-700 dark:text-slate-300 hover:text-indigo-600 rounded-lg font-bold text-xs transition-all cursor-pointer"
                      >
                        <ArrowUturnLeftIcon className="h-3.5 w-3.5" />
                        <span>Restore All</span>
                      </button>
                      <button
                        type="button"
                        onClick={promptClearAll}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white rounded-lg font-bold text-xs shadow-xs transition-all cursor-pointer"
                      >
                        <TrashIcon className="h-3.5 w-3.5" />
                        <span>Clear All</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Bin Items List */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-2.5">
              {recycleBin.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="w-16 h-16 rounded-3xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto mb-3">
                    <TrashIcon className="h-8 w-8" />
                  </div>
                  <h4 className="text-base font-bold text-slate-800 dark:text-white">Recycle Bin is Empty</h4>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                    When you delete manifests or folders, they will appear here first and can be restored anytime.
                  </p>
                </div>
              ) : filteredBinItems.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <DocumentIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-xs font-semibold">No items match your filter or search.</p>
                  <button
                    type="button"
                    onClick={() => { setRecycleBinFilter('all'); setRecycleBinSearch(''); }}
                    className="mt-2 text-xs font-bold text-indigo-600 hover:underline"
                  >
                    Reset Filters
                  </button>
                </div>
              ) : (
                filteredBinItems.map((item) => {
                  const isSelected = selectedBinItemIds.includes(item.id);
                  const isFolder = item.itemType === 'folder';

                  return (
                    <div
                      key={item.id}
                      className={`p-3.5 sm:p-4 rounded-xl border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                        isSelected
                          ? 'bg-indigo-50/50 dark:bg-indigo-950/30 border-indigo-300 dark:border-indigo-800 shadow-xs'
                          : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedBinItemIds([...selectedBinItemIds, item.id]);
                            } else {
                              setSelectedBinItemIds(selectedBinItemIds.filter(id => id !== item.id));
                            }
                          }}
                          className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4 border-slate-300 dark:border-slate-700 cursor-pointer"
                        />

                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          isFolder
                            ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-200/60 dark:border-amber-900/60'
                            : 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-900/60'
                        }`}>
                          {isFolder ? <FolderIcon className="h-5 w-5" /> : <DocumentTextIcon className="h-5 w-5" />}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            <h4 className="text-sm font-black text-slate-900 dark:text-white truncate">
                              {item.name}
                            </h4>
                            <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                              isFolder
                                ? 'bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300'
                                : 'bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300'
                            }`}>
                              {isFolder ? 'Folder' : 'Manifest'}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 sm:gap-3 text-[11px] text-slate-500 dark:text-slate-400 flex-wrap">
                            <span>
                              Deleted: {new Date(item.deletedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {item.itemCount !== undefined && (
                              <span>• {item.itemCount} {isFolder ? 'manifest(s)' : 'units'}</span>
                            )}
                            {item.totalAmount !== undefined && (
                              <span className="font-bold text-slate-700 dark:text-slate-300">• ₹{item.totalAmount.toLocaleString()}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Item Actions */}
                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        <button
                          type="button"
                          onClick={() => restoreBinItem(item)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/70 text-indigo-700 dark:text-indigo-300 rounded-lg text-xs font-bold transition-all active:scale-95 cursor-pointer"
                          title="Restore item to active workspace"
                        >
                          <ArrowUturnLeftIcon className="h-3.5 w-3.5" />
                          <span>Restore</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => promptClearSingle(item)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors cursor-pointer"
                          title="Permanently delete from bin"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="px-5 sm:px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>{filteredBinItems.length} of {recycleBin.length} items shown</span>
              <button
                type="button"
                onClick={() => setIsRecycleBinOpen(false)}
                className="px-4 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL 3: Permanent Clear Confirmation ("Enter Clear" Prompt)   */}
      {/* ------------------------------------------------------------- */}
      {permanentClearTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-4 animate-in fade-in duration-200 no-print">
          <div className="bg-white dark:bg-slate-900 rounded-2xl md:rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-rose-200/80 dark:border-rose-900/60 p-6 md:p-7 animate-in zoom-in-95 duration-200">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 border border-rose-200 dark:border-rose-900 shadow-xs">
                <TrashIcon className="h-6 w-6" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-600 text-white">
                    Permanent Deletion
                  </span>
                </div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">
                  {permanentClearTarget.mode === 'all'
                    ? 'Empty Entire Recycle Bin?'
                    : permanentClearTarget.mode === 'selected'
                    ? `Delete ${permanentClearTarget.count} Selected Items?`
                    : `Delete "${permanentClearTarget.name}"?`}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  {permanentClearTarget.mode === 'all'
                    ? `This will permanently remove all ${permanentClearTarget.count} item(s) currently inside the Recycle Bin.`
                    : permanentClearTarget.mode === 'selected'
                    ? `This will permanently delete the ${permanentClearTarget.count} selected item(s) from your storage.`
                    : `This will permanently delete "${permanentClearTarget.name}" from your storage.`}
                </p>
              </div>
            </div>

            {/* Warning Callout */}
            <div className="mt-4 p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl text-xs text-rose-800 dark:text-rose-200 space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-rose-700 dark:text-rose-300">
                <span>⚠️ Warning: Irreversible Action</span>
              </div>
              <p className="text-[11px] leading-relaxed text-rose-600 dark:text-rose-300">
                Once permanently deleted, these records cannot be restored.
              </p>
            </div>

            {/* "Type Clear to confirm" Input as specifically required */}
            <div className="mt-4 space-y-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                To confirm permanent deletion, please type <span className="font-black text-rose-600 underline">Clear</span> below:
              </label>
              <input
                type="text"
                autoFocus
                value={clearConfirmationText}
                onChange={(e) => setClearConfirmationText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && clearConfirmationText.trim().toLowerCase() === 'clear') {
                    executePermanentClear();
                  }
                }}
                placeholder='Type "Clear" to confirm...'
                className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-300 dark:border-slate-700 focus:border-rose-500 dark:focus:border-rose-500 focus:outline-hidden text-sm font-semibold bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 transition-colors"
              />
            </div>

            {/* Actions */}
            <div className="mt-6 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setPermanentClearTarget(null);
                  setClearConfirmationText('');
                }}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={clearConfirmationText.trim().toLowerCase() !== 'clear'}
                onClick={executePermanentClear}
                className={`px-5 py-2.5 rounded-xl text-xs font-black shadow-md transition-all inline-flex items-center gap-2 ${
                  clearConfirmationText.trim().toLowerCase() === 'clear'
                    ? 'bg-rose-600 hover:bg-rose-700 active:scale-95 text-white cursor-pointer shadow-rose-200 dark:shadow-none'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed shadow-none'
                }`}
              >
                <TrashIcon className="h-4 w-4" />
                <span>Permanently Clear</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL 5: Redesigned Chunking & Batch Pagination Engine Modal  */}
      {/* ------------------------------------------------------------- */}
      <ChunkingBatchEngineModal
        isOpen={isChunkingModalOpen}
        onClose={() => setIsChunkingModalOpen(false)}
        initialTab={chunkingInitialTab}
        stagedChunkPages={stagedImages}
        onAddFilesToChunk={handleAddImageFiles}
        onRemovePageFromChunk={handleRemoveStagedImage}
        onClearChunk={() => {
          stagedImages.forEach(img => {
            if (img.preview && img.preview.startsWith('blob:')) {
              try { URL.revokeObjectURL(img.preview); } catch (e) {}
            }
          });
          setStagedImages([]);
        }}
        onRecropPage={handleRecropStagedImage}
        onLaunchInAppCamera={() => {
          setCameraMode('in-app');
          setIsHighResCameraOpen(true);
        }}
        onLaunchNativeCamera={() => {
          setCameraMode('native');
          nativeCameraRef.current?.trigger();
        }}
        onLaunchCropScanner={() => {
          setIsDocumentCropScannerOpen(true);
        }}
        onQueueChunkForBackgroundBatch={handleQueueChunkForBackgroundBatch}
        onRetrySession={handleRetrySessionInBatch}
        onOpenManifest={(manifestId) => {
          setActiveManifestId(manifestId);
          setView('billing');
        }}
        onOpenCapturedSessionsVault={() => {
          setIsChunkingModalOpen(false);
          setIsCapturedSessionsModalOpen(true);
        }}
        onStopExtraction={handleStopExtraction}
        folders={folders}
        currentFolderId={currentFolderId}
        channelKey={cloudMeta.channelKey}
        isAiBusy={isUploading}
        currentExtractingSessionId={currentExtractingSessionId}
        chunkRowsPerPage={chunkRowsPerPage}
        onSaveChunkSize={handleSaveChunkSize}
      />

      {/* ------------------------------------------------------------- */}
      {/* MODAL 11: Captured Manifest Pages (Local Storage Vault)       */}
      {/* ------------------------------------------------------------- */}
      <CapturedManifestSessionsModal
        isOpen={isCapturedSessionsModalOpen}
        onClose={() => setIsCapturedSessionsModalOpen(false)}
        channelKey={cloudMeta.channelKey}
        isAiBusy={isUploading}
        currentExtractingSessionId={currentExtractingSessionId}
        onRetryExtraction={handleRetryExtractionFromVault}
        onStopExtraction={handleStopExtraction}
        onOpenManifest={(manifestId) => {
          setActiveManifestId(manifestId);
          setView('billing');
        }}
        onOpenChunkingEngine={() => {
          setIsCapturedSessionsModalOpen(false);
          setChunkingInitialTab('capture');
          setIsChunkingModalOpen(true);
        }}
      />

      {/* ------------------------------------------------------------- */}
      {/* MODAL 6: Line Item Deletion Confirmation Modal               */}
      {/* ------------------------------------------------------------- */}
      {rowToDelete && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-4 animate-in fade-in duration-200 no-print"
          onClick={() => setRowToDelete(null)}
        >
          <div 
            className="bg-white dark:bg-slate-900 rounded-2xl md:rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-rose-200/80 dark:border-rose-900/60 p-6 md:p-7 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 border border-rose-200 dark:border-rose-900 shadow-xs">
                <TrashIcon className="h-6 w-6" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-600 text-white">
                    Confirm Deletion
                  </span>
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    Row #{rowToDelete.slNo}
                  </span>
                </div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">
                  Delete this line item?
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  Are you sure you want to delete this row? Serial numbers (#) will be automatically re-sequenced after deletion.
                </p>
              </div>
            </div>

            {/* Row Item Details Card */}
            <div className="mt-4 p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700/80 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Reference / AWB:</span>
                <span className="font-bold text-slate-900 dark:text-white font-mono">{rowToDelete.serialNo || '—'}</span>
              </div>
              {rowToDelete.description && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 dark:text-slate-400 font-medium">Description:</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300 truncate max-w-[200px]">{rowToDelete.description}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Type / Weight:</span>
                <span className="font-semibold text-slate-700 dark:text-slate-300">{rowToDelete.type} • {rowToDelete.weight} kg</span>
              </div>
              <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-200/80 dark:border-slate-700/80">
                <span className="font-bold text-slate-600 dark:text-slate-400">Total Amount:</span>
                <span className="font-black text-indigo-600 dark:text-indigo-400 text-sm">₹{rowToDelete.amount.toFixed(2)}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setRowToDelete(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteRow}
                className="px-5 py-2.5 rounded-xl text-xs font-black shadow-md bg-rose-600 hover:bg-rose-700 active:scale-95 text-white cursor-pointer shadow-rose-200 dark:shadow-none inline-flex items-center gap-2 transition-all"
              >
                <TrashIcon className="h-4 w-4" />
                <span>Confirm Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL 7: Ultra-Sharp In-App 4K Hardware Camera Viewfinder     */}
      {/* ------------------------------------------------------------- */}
      <HighResInAppCamera
        isOpen={isHighResCameraOpen}
        pageIndex={stagedImages.length + 1}
        maxPages={5}
        stagedCount={stagedImages.length}
        onPhotoCaptured={handleHighResPhotoCaptured}
        onClose={() => setIsHighResCameraOpen(false)}
      />

      {/* ------------------------------------------------------------- */}
      {/* MODAL 8: Sequential Document Camera Scanner & Auto-Crop      */}
      {/* ------------------------------------------------------------- */}
      <DocumentCropScanner
        isOpen={isDocumentCropScannerOpen}
        onClose={() => setIsDocumentCropScannerOpen(false)}
        onComplete={handleDocumentCropScannerComplete}
        maxPages={5}
      />

      {/* ------------------------------------------------------------- */}
      {/* MODAL 9: Post-Capture Interactive Document Cropper & Align   */}
      {/* ------------------------------------------------------------- */}
      <PostCaptureCropper
        isOpen={postCaptureCropperState.isOpen}
        imageSrc={postCaptureCropperState.imageSrc}
        rawFile={postCaptureCropperState.rawFile}
        pageIndex={postCaptureCropperState.pageIndex}
        totalCapturedPages={stagedImages.length}
        maxPages={5}
        captureMode={postCaptureCropperState.captureMode || cameraMode}
        onChangeCaptureMode={(mode) => {
          setCameraMode(mode);
          setPostCaptureCropperState(prev => ({ ...prev, captureMode: mode }));
        }}
        onConfirmCrop={handleConfirmCroppedPage}
        onRetake={handleRetakePostCapture}
        onClose={() => {
          if (postCaptureCropperState.imageSrc && postCaptureCropperState.imageSrc.startsWith('blob:')) {
            try { URL.revokeObjectURL(postCaptureCropperState.imageSrc); } catch (e) {}
          }
          setPostCaptureCropperState({
            isOpen: false,
            imageSrc: null,
            rawFile: null,
            pageIndex: 1,
            captureMode: cameraMode,
          });
        }}
      />

      {/* ------------------------------------------------------------- */}
      {/* MODAL 10: Actionable AI OCR Diagnostic & Error Modal          */}
      {/* ------------------------------------------------------------- */}
      <AiExtractionErrorModal
        isOpen={isAiExtractionErrorModalOpen}
        diagnostic={aiExtractionDiagnostic}
        onRetry={handleRetryAiExtraction}
        onOpenAiSettings={() => {
          setIsAiExtractionErrorModalOpen(false);
          setIsGlobalSettingsOpen(true);
          setSettingsTab('ai');
        }}
        onClose={() => setIsAiExtractionErrorModalOpen(false)}
        isRetrying={isAiRetrying}
      />


    </div>
  );
};

export default App;