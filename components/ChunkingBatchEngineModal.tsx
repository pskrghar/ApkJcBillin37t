import React, { useState, useEffect, useRef } from 'react';
import {
  CapturedManifestSession,
  getAllCapturedSessions,
  deleteCapturedSession,
  clearCapturedSessions,
  markSessionQueued,
  backupCapturedSessionsToCloud,
  restoreCapturedSessionsFromCloud,
  addCapturedSessionsListener,
  getSessionFiles
} from '../services/capturedPagesStorage';
import { Folder } from '../types';
import {
  XMarkIcon,
  CameraIcon,
  SparklesIcon,
  PhotoIcon,
  TrashIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ClockIcon,
  EyeIcon,
  DocumentDuplicateIcon,
  ArrowTopRightOnSquareIcon,
  AdjustmentsHorizontalIcon,
  CloudArrowUpIcon,
  CloudArrowDownIcon,
  BoltIcon,
  PlusIcon,
  FolderIcon,
  ChevronRightIcon,
  ScissorsIcon,
  ArrowRightIcon,
  StopIcon
} from '@heroicons/react/24/outline';

export interface ChunkingBatchEngineModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Current Tab 1 Staged Chunk Pages (1 to 5)
  stagedChunkPages: { file: File; preview: string }[];
  onAddFilesToChunk: (files: FileList | File[]) => void;
  onRemovePageFromChunk: (index: number) => void;
  onClearChunk: () => void;
  onRecropPage: (index: number) => void;
  // Camera Triggers
  onLaunchInAppCamera: () => void;
  onLaunchNativeCamera?: () => void;
  onLaunchCropScanner: () => void;
  // Batch Queue Actions
  onQueueChunkForBackgroundBatch: (chunkName?: string, targetFolderId?: string | null) => Promise<void>;
  onRetrySession: (session: CapturedManifestSession) => void;
  onStopExtraction?: (sessionId?: string) => void;
  onOpenManifest?: (manifestId: string) => void;
  onOpenCapturedSessionsVault?: () => void;
  // External context
  folders: Folder[];
  currentFolderId: string | null;
  channelKey?: string;
  isAiBusy: boolean;
  currentExtractingSessionId?: string | null;
  // Statement Chunking settings (retaining rows-per-page configuration)
  chunkRowsPerPage: number;
  onSaveChunkSize: (size: number) => void;
  // Initial tab
  initialTab?: 'capture' | 'queue' | 'statement';
}

export const ChunkingBatchEngineModal: React.FC<ChunkingBatchEngineModalProps> = ({
  isOpen,
  onClose,
  stagedChunkPages,
  onAddFilesToChunk,
  onRemovePageFromChunk,
  onClearChunk,
  onRecropPage,
  onLaunchInAppCamera,
  onLaunchNativeCamera,
  onLaunchCropScanner,
  onQueueChunkForBackgroundBatch,
  onRetrySession,
  onStopExtraction,
  onOpenManifest,
  onOpenCapturedSessionsVault,
  folders,
  currentFolderId,
  channelKey,
  isAiBusy,
  currentExtractingSessionId,
  chunkRowsPerPage,
  onSaveChunkSize,
  initialTab = 'capture'
}) => {
  const [activeTab, setActiveTab] = useState<'capture' | 'queue' | 'statement'>(initialTab);
  const [sessions, setSessions] = useState<CapturedManifestSession[]>([]);
  const [queueFilter, setQueueFilter] = useState<'all' | 'extracting' | 'queued' | 'success' | 'failed'>('all');
  
  // Tab 1 Chunk metadata
  const [chunkName, setChunkName] = useState<string>('');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(currentFolderId);
  const [isSubmittingChunk, setIsSubmittingChunk] = useState<boolean>(false);
  const [lastSubmissionNotice, setLastSubmissionNotice] = useState<string>('');

  // Image preview lightbox
  const [previewImage, setPreviewImage] = useState<{ src: string; title: string } | null>(null);

  // Cloud sync feedback
  const [cloudSyncFeedback, setCloudSyncFeedback] = useState<string>('');
  const [isCloudSyncing, setIsCloudSyncing] = useState<boolean>(false);

  // File gallery input ref
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Load sessions from local storage
  const loadSessions = async () => {
    try {
      const list = await getAllCapturedSessions();
      setSessions(list);
    } catch (e) {
      console.warn('Error loading sessions in Chunking & Batch Engine:', e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadSessions();
      if (initialTab) {
        setActiveTab(initialTab);
      }
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    const unsubscribe = addCapturedSessionsListener(() => {
      loadSessions();
    });
    return () => unsubscribe();
  }, []);

  // Sync selectedFolderId with currentFolderId when opened
  useEffect(() => {
    setSelectedFolderId(currentFolderId);
  }, [currentFolderId]);

  if (!isOpen) return null;

  // Counts for queue badges
  const extractingCount = sessions.filter(s => s.status === 'extracting').length;
  const queuedCount = sessions.filter(s => s.status === 'queued').length;
  const failedCount = sessions.filter(s => s.status === 'failed').length;
  const successCount = sessions.filter(s => s.status === 'success').length;
  const totalChunksCount = sessions.length;

  // Handle gallery file selection
  const handleGalleryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onAddFilesToChunk(files);
    }
    e.target.value = '';
  };

  // Submit current chunk to background queue
  const handleSubmitCurrentChunk = async (switchTabToQueue: boolean = false) => {
    if (stagedChunkPages.length === 0) {
      alert('Please capture at least 1 page for this manifest chunk before queueing.');
      return;
    }

    setIsSubmittingChunk(true);
    try {
      const defaultName = chunkName.trim() || `Chunk #${totalChunksCount + 1} (${stagedChunkPages.length} Pages)`;
      await onQueueChunkForBackgroundBatch(defaultName, selectedFolderId);
      
      setLastSubmissionNotice(`✓ ${defaultName} queued for background extraction! Camera is ready for next chunk.`);
      setChunkName(''); // Reset for next chunk
      setTimeout(() => setLastSubmissionNotice(''), 5000);

      if (switchTabToQueue) {
        setActiveTab('queue');
      }
    } catch (err: any) {
      alert(`Failed to queue chunk: ${err?.message || err}`);
    } finally {
      setIsSubmittingChunk(false);
    }
  };

  // Retry failed chunk
  const handleRetryFailedChunk = async (session: CapturedManifestSession) => {
    await markSessionQueued(session.id);
    onRetrySession(session);
    loadSessions();
  };

  // Delete chunk session
  const handleDeleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Delete this captured manifest chunk from local storage?')) {
      await deleteCapturedSession(id);
      loadSessions();
    }
  };

  // Clear completed sessions
  const handleClearCompleted = async () => {
    if (confirm('Remove all successfully extracted manifest chunks from local storage?')) {
      const removed = await clearCapturedSessions(true);
      setCloudSyncFeedback(`Cleared ${removed} completed chunk(s).`);
      setTimeout(() => setCloudSyncFeedback(''), 4000);
      loadSessions();
    }
  };

  // Cloud backup & restore
  const handleBackupToCloud = async () => {
    if (!channelKey) {
      alert('No Cloud Channel Key found. Please connect to a Cloud Sync channel first in Settings.');
      return;
    }
    setIsCloudSyncing(true);
    setCloudSyncFeedback('Backing up chunks to Cloud Vault...');
    try {
      const res = await backupCapturedSessionsToCloud(channelKey);
      setCloudSyncFeedback(`✓ Backed up ${res.backedUpCount} chunk(s) to Cloud Storage.`);
      loadSessions();
    } catch (err: any) {
      setCloudSyncFeedback(`Cloud backup error: ${err.message || 'Failed'}`);
    } finally {
      setIsCloudSyncing(false);
      setTimeout(() => setCloudSyncFeedback(''), 5000);
    }
  };

  const handleRestoreFromCloud = async () => {
    if (!channelKey) {
      alert('No Cloud Channel Key found. Please connect to a Cloud Sync channel first in Settings.');
      return;
    }
    if (!confirm('Download and restore captured chunks stored in Cloud Vault for this channel?')) {
      return;
    }
    setIsCloudSyncing(true);
    setCloudSyncFeedback('Restoring chunks from Cloud Vault...');
    try {
      const res = await restoreCapturedSessionsFromCloud(channelKey);
      setCloudSyncFeedback(`✓ Restored ${res.restoredCount} chunk(s) from Cloud Storage.`);
      loadSessions();
    } catch (err: any) {
      setCloudSyncFeedback(`Cloud restore error: ${err.message || 'Failed'}`);
    } finally {
      setIsCloudSyncing(false);
      setTimeout(() => setCloudSyncFeedback(''), 5000);
    }
  };

  // Filtered queue sessions
  const filteredSessions = sessions.filter(s => {
    if (queueFilter === 'all') return true;
    return s.status === queueFilter;
  });

  return (
    <div 
      id="chunking-batch-engine-modal"
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-2 sm:p-4 animate-in fade-in duration-200 no-print"
      onClick={onClose}
    >
      <div 
        className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-5xl w-full h-[92vh] max-h-[900px] border border-amber-300/80 dark:border-amber-900/60 flex flex-col overflow-hidden text-slate-900 dark:text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Hidden File Input for Gallery / Files */}
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleGalleryChange}
        />

        {/* Modal Header */}
        <header className="shrink-0 px-4 sm:px-6 py-4 bg-gradient-to-r from-amber-600 via-amber-700 to-indigo-900 text-white flex items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0 border border-white/30 shadow-xs">
              <BoltIcon className="h-6 w-6 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-black tracking-tight text-white">
                  Chunking &amp; Batch Engine
                </h3>
                {(extractingCount > 0 || isAiBusy) && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-500/40 text-indigo-100 border border-indigo-400/50 animate-pulse">
                    <ArrowPathIcon className="h-3 w-3 animate-spin" />
                    <span>AI Extracting</span>
                  </span>
                )}
                {queuedCount > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-400/30 text-amber-100 border border-amber-300/40">
                    <ClockIcon className="h-3 w-3" />
                    <span>{queuedCount} Queued</span>
                  </span>
                )}
                {failedCount > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-500 text-white shadow-xs">
                    <ExclamationCircleIcon className="h-3 w-3" />
                    <span>{failedCount} Failed</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-amber-100/90 font-medium truncate">
                Continuous manifest chunk capture with asynchronous background batch extraction.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              id="chunking-engine-close-btn"
              type="button"
              onClick={onClose}
              className="p-2 rounded-full hover:bg-white/20 text-white transition-colors cursor-pointer"
              aria-label="Close Chunking & Batch Engine"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* Tab Switcher */}
        <div className="shrink-0 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 px-3 sm:px-6 gap-1 overflow-x-auto">
          <div className="flex items-center gap-1 sm:gap-2 pt-2">
            {/* Tab 1: Capture Manifest Chunk */}
            <button
              id="chunking-tab-capture-btn"
              type="button"
              onClick={() => setActiveTab('capture')}
              className={`py-2.5 px-3 sm:px-4 font-bold text-xs sm:text-sm border-b-2 transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
                activeTab === 'capture'
                  ? 'border-amber-600 dark:border-amber-500 text-amber-700 dark:text-amber-400 bg-white dark:bg-slate-800 rounded-t-xl'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <CameraIcon className="h-4 w-4 text-amber-500" />
              <span>Tab 1: Capture Chunk (1-5 Pages)</span>
              {stagedChunkPages.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[10px] font-black">
                  {stagedChunkPages.length}/5
                </span>
              )}
            </button>

            {/* Tab 2: Batch Extraction Queue */}
            <button
              id="chunking-tab-queue-btn"
              type="button"
              onClick={() => setActiveTab('queue')}
              className={`py-2.5 px-3 sm:px-4 font-bold text-xs sm:text-sm border-b-2 transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
                activeTab === 'queue'
                  ? 'border-indigo-600 dark:border-indigo-500 text-indigo-700 dark:text-indigo-400 bg-white dark:bg-slate-800 rounded-t-xl'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <SparklesIcon className="h-4 w-4 text-indigo-500" />
              <span>Tab 2: Batch Processing Queue</span>
              {extractingCount + queuedCount > 0 ? (
                <span className="px-1.5 py-0.2 rounded-full bg-indigo-600 text-white text-[10px] font-black animate-pulse">
                  {extractingCount + queuedCount}
                </span>
              ) : failedCount > 0 ? (
                <span className="px-1.5 py-0.2 rounded-full bg-rose-600 text-white text-[10px] font-black">
                  {failedCount}
                </span>
              ) : (
                <span className="px-1.5 py-0.2 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-[10px] font-bold">
                  {totalChunksCount}
                </span>
              )}
            </button>

            {/* Tab 3: Statement Rows per Page (Settings) */}
            <button
              id="chunking-tab-statement-btn"
              type="button"
              onClick={() => setActiveTab('statement')}
              className={`py-2.5 px-3 font-bold text-xs border-b-2 transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                activeTab === 'statement'
                  ? 'border-slate-500 text-slate-900 dark:text-slate-200 bg-white dark:bg-slate-800 rounded-t-xl'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700'
              }`}
              title="Configure rows per page for statement printing"
            >
              <AdjustmentsHorizontalIcon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Statement Rows</span>
              <span>({chunkRowsPerPage}/pg)</span>
            </button>
          </div>
        </div>

        {/* Modal Body Container */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50/50 dark:bg-slate-950/40">
          {/* ========================================================================= */}
          {/* TAB 1: CAPTURE MANIFEST CHUNK (PAGES 1 TO 5)                              */}
          {/* ========================================================================= */}
          {activeTab === 'capture' && (
            <div className="space-y-5 max-w-4xl mx-auto animate-in fade-in duration-150">
              {/* Submission confirmation banner */}
              {lastSubmissionNotice && (
                <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 flex items-center justify-between text-xs font-bold shadow-xs">
                  <div className="flex items-center gap-2">
                    <CheckCircleIcon className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>{lastSubmissionNotice}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('queue')}
                    className="underline text-emerald-700 dark:text-emerald-300 hover:text-emerald-900 cursor-pointer ml-2"
                  >
                    View in Tab 2 &rarr;
                  </button>
                </div>
              )}

              {/* Active Background Batch Engine Progress Strip (Shows user that background extraction is working silently) */}
              {(extractingCount > 0 || isAiBusy || queuedCount > 0) && (
                <div className="px-3.5 py-2.5 rounded-2xl bg-indigo-50/90 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/60 flex items-center justify-between gap-3 text-xs shadow-xs">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="relative flex h-2.5 w-2.5 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-600"></span>
                    </span>
                    <span className="font-bold text-indigo-900 dark:text-indigo-200 truncate">
                      {extractingCount > 0 
                        ? 'Background Batch Engine: Extracting manifest silently with AI...' 
                        : `${queuedCount} manifest chunk(s) queued for background extraction.`}
                    </span>
                    {queuedCount > 0 && extractingCount > 0 && (
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-indigo-200 dark:bg-indigo-800 text-indigo-800 dark:text-indigo-200 shrink-0">
                        +{queuedCount} in queue
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('queue')}
                    className="text-[11px] font-black text-indigo-700 dark:text-indigo-300 hover:underline shrink-0 cursor-pointer flex items-center gap-1"
                  >
                    <span>View Tab 2</span>
                    <ArrowRightIcon className="h-3 w-3" />
                  </button>
                </div>
              )}

              {/* Compact Manifest Chunk Controls & Metadata Bar */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 sm:p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-black text-sm shrink-0 border border-amber-500/20">
                    #{totalChunksCount + 1}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                        Manifest Chunk #{totalChunksCount + 1}
                      </h4>
                      <span className="px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 font-bold text-[10px] border border-amber-300/60 dark:border-amber-700/60">
                        {stagedChunkPages.length}/5 Pages Staged
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                      Snap pages 1 to 5 &rarr; Tap &ldquo;Queue Chunk &amp; Capture Next&rdquo; to continuously scan multiple manifests.
                    </p>
                  </div>
                </div>

                {/* Chunk Meta Inputs: Compact inline */}
                <div className="flex items-center gap-2 flex-wrap md:flex-nowrap shrink-0">
                  <div className="flex-1 md:w-52">
                    <input
                      type="text"
                      placeholder={`Label: Chunk #${totalChunksCount + 1}`}
                      value={chunkName}
                      onChange={(e) => setChunkName(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-850 text-slate-800 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-amber-500 placeholder:text-slate-400"
                    />
                  </div>
                  {folders.length > 0 && (
                    <div className="flex-1 md:w-44">
                      <select
                        value={selectedFolderId || ''}
                        onChange={(e) => setSelectedFolderId(e.target.value || null)}
                        className="w-full px-2.5 py-1.5 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-850 text-slate-800 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                      >
                        <option value="">(All Folders)</option>
                        {folders.map(f => (
                          <option key={f.id} value={f.id}>{f.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>

              {/* Camera Launchers & Triggers */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* 1. Live In-App Camera (1080p FHD with pre & post capturization) */}
                <button
                  id="chunking-launch-inapp-camera-btn"
                  type="button"
                  onClick={onLaunchInAppCamera}
                  disabled={stagedChunkPages.length >= 5}
                  className={`p-4 rounded-2xl border flex flex-col items-center text-center gap-2 transition-all cursor-pointer shadow-xs ${
                    stagedChunkPages.length >= 5
                      ? 'opacity-50 cursor-not-allowed bg-slate-100 dark:bg-slate-850 border-slate-200 dark:border-slate-800 text-slate-400'
                      : 'bg-gradient-to-br from-indigo-900/90 via-indigo-950 to-slate-900 text-white border-indigo-500/50 hover:border-indigo-400 active:scale-[0.98] hover:shadow-lg shadow-indigo-950/50'
                  }`}
                >
                  <div className="h-11 w-11 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/40">
                    <CameraIcon className="h-6 w-6" />
                  </div>
                  <div>
                    <span className="text-xs sm:text-sm font-black block">Live In-App Camera</span>
                    <span className="text-[11px] text-indigo-200/80 font-medium">1080p FHD &amp; Auto-Align</span>
                  </div>
                  <div className="mt-1 px-2.5 py-1 rounded-lg bg-indigo-500/30 text-indigo-200 text-[10px] font-black border border-indigo-400/40">
                    + Snap Page {stagedChunkPages.length + 1}
                  </div>
                </button>

                {/* 2. Native Device Camera (Full HDR / Hardware Shutter) */}
                <button
                  id="chunking-launch-native-camera-btn"
                  type="button"
                  onClick={onLaunchNativeCamera}
                  disabled={stagedChunkPages.length >= 5}
                  className={`p-4 rounded-2xl border flex flex-col items-center text-center gap-2 transition-all cursor-pointer shadow-xs ${
                    stagedChunkPages.length >= 5
                      ? 'opacity-50 cursor-not-allowed bg-slate-100 dark:bg-slate-850 border-slate-200 dark:border-slate-800 text-slate-400'
                      : 'bg-gradient-to-br from-purple-900/80 via-indigo-950 to-slate-900 text-white border-purple-500/50 hover:border-purple-400 active:scale-[0.98] hover:shadow-lg shadow-purple-950/50'
                  }`}
                >
                  <div className="h-11 w-11 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-md shadow-purple-600/40">
                    <CameraIcon className="h-6 w-6" />
                  </div>
                  <div>
                    <span className="text-xs sm:text-sm font-black block">Native Camera</span>
                    <span className="text-[11px] text-purple-200/80 font-medium">Full Hardware HDR &amp; Macro</span>
                  </div>
                  <div className="mt-1 px-2.5 py-1 rounded-lg bg-purple-500/30 text-purple-200 text-[10px] font-black border border-purple-400/40">
                    + Snap Page {stagedChunkPages.length + 1}
                  </div>
                </button>

                {/* 3. Sequential Document Auto-Crop Scanner */}
                <button
                  id="chunking-launch-crop-scanner-btn"
                  type="button"
                  onClick={onLaunchCropScanner}
                  disabled={stagedChunkPages.length >= 5}
                  className={`p-4 rounded-2xl border flex flex-col items-center text-center gap-2 transition-all cursor-pointer shadow-xs ${
                    stagedChunkPages.length >= 5
                      ? 'opacity-50 cursor-not-allowed bg-slate-100 dark:bg-slate-850 border-slate-200 dark:border-slate-800 text-slate-400'
                      : 'bg-gradient-to-br from-amber-900/80 via-amber-950 to-slate-900 text-white border-amber-500/50 hover:border-amber-400 active:scale-[0.98] hover:shadow-lg shadow-amber-950/50'
                  }`}
                >
                  <div className="h-11 w-11 rounded-xl bg-amber-600 text-white flex items-center justify-center shadow-md shadow-amber-600/40">
                    <SparklesIcon className="h-6 w-6" />
                  </div>
                  <div>
                    <span className="text-xs sm:text-sm font-black block">Sequential Crop Scanner</span>
                    <span className="text-[11px] text-amber-200/80 font-medium">Auto-Edge Straightener</span>
                  </div>
                  <div className="mt-1 px-2.5 py-1 rounded-lg bg-amber-500/30 text-amber-200 text-[10px] font-black border border-amber-400/40">
                    Multi-Page Mode
                  </div>
                </button>

                {/* 4. Choose from Gallery / Files */}
                <button
                  id="chunking-choose-gallery-btn"
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  disabled={stagedChunkPages.length >= 5}
                  className={`p-4 rounded-2xl border flex flex-col items-center text-center gap-2 transition-all cursor-pointer shadow-xs ${
                    stagedChunkPages.length >= 5
                      ? 'opacity-50 cursor-not-allowed bg-slate-100 dark:bg-slate-850 border-slate-200 dark:border-slate-800 text-slate-400'
                      : 'bg-white dark:bg-slate-850 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700 active:scale-[0.98]'
                  }`}
                >
                  <div className="h-11 w-11 rounded-xl bg-slate-100 dark:bg-slate-750 text-indigo-500 dark:text-indigo-400 flex items-center justify-center border border-slate-200 dark:border-slate-700">
                    <PhotoIcon className="h-6 w-6" />
                  </div>
                  <div>
                    <span className="text-xs sm:text-sm font-black block">Choose from Gallery</span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Select scans/photos from disk</span>
                  </div>
                  <div className="mt-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-750 text-slate-600 dark:text-slate-300 text-[10px] font-bold">
                    Select Images
                  </div>
                </button>
              </div>

              {/* 5-Page Sequential Chunk Staging Tray */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 sm:p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center font-black text-xs">
                      {stagedChunkPages.length}
                    </div>
                    <div>
                      <h5 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">
                        Manifest Chunk Pages ({stagedChunkPages.length} of 5)
                      </h5>
                      <span className="text-[10px] text-slate-400">
                        {stagedChunkPages.length === 0
                          ? 'Empty chunk. Tap camera above to snap page 1.'
                          : stagedChunkPages.length < 5
                          ? `Ready for page ${stagedChunkPages.length + 1} or queue this chunk now.`
                          : 'All 5 pages captured for this chunk!'}
                      </span>
                    </div>
                  </div>

                  {stagedChunkPages.length > 0 && (
                    <button
                      type="button"
                      onClick={onClearChunk}
                      className="text-xs font-bold text-red-500 hover:text-red-600 hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                      <span>Clear Chunk</span>
                    </button>
                  )}
                </div>

                {/* 5 Slots Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                  {[0, 1, 2, 3, 4].map((slotIdx) => {
                    const item = stagedChunkPages[slotIdx];
                    const pageNum = slotIdx + 1;

                    if (item) {
                      return (
                        <div
                          key={slotIdx}
                          className="group relative rounded-2xl overflow-hidden border-2 border-amber-400 dark:border-amber-600/80 bg-slate-950 aspect-[3/4] shadow-md flex flex-col justify-between"
                        >
                          <img
                            src={item.preview}
                            alt={`Page ${pageNum}`}
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-transparent to-slate-950/60 pointer-events-none" />

                          {/* Top Badges */}
                          <div className="relative z-10 p-2 flex items-center justify-between">
                            <span className="px-2 py-0.5 rounded-md bg-amber-500 text-slate-950 font-black text-[10px] shadow-xs">
                              P{pageNum}
                            </span>
                            <button
                              type="button"
                              onClick={() => onRemovePageFromChunk(slotIdx)}
                              className="p-1 rounded-md bg-slate-900/80 text-rose-300 hover:text-rose-100 hover:bg-rose-600 transition-colors cursor-pointer"
                              title="Delete this page"
                            >
                              <TrashIcon className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          {/* Bottom Controls */}
                          <div className="relative z-10 p-2 flex items-center gap-1.5 justify-between">
                            <button
                              type="button"
                              onClick={() => onRecropPage(slotIdx)}
                              className="flex-1 py-1 px-1.5 rounded-lg bg-white/90 hover:bg-white text-slate-900 text-[10px] font-bold flex items-center justify-center gap-1 shadow-xs cursor-pointer"
                              title="Re-crop and straighten corners"
                            >
                              <ScissorsIcon className="h-3 w-3 text-amber-600" />
                              <span>Re-Crop</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setPreviewImage({ src: item.preview, title: `Page ${pageNum} Preview` })}
                              className="p-1 rounded-lg bg-slate-900/80 text-white hover:bg-slate-800 transition-colors cursor-pointer"
                              title="View full image"
                            >
                              <EyeIcon className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    }

                    // Empty Slot
                    const isNextToCapture = slotIdx === stagedChunkPages.length;
                    return (
                      <div
                        key={slotIdx}
                        onClick={() => {
                          if (isNextToCapture) {
                            onLaunchInAppCamera();
                          }
                        }}
                        className={`rounded-2xl border-2 border-dashed aspect-[3/4] flex flex-col items-center justify-center p-3 text-center transition-all ${
                          isNextToCapture
                            ? 'border-amber-400 dark:border-amber-500/80 bg-amber-500/5 hover:bg-amber-500/10 cursor-pointer shadow-xs group'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 text-slate-300 dark:text-slate-600 cursor-not-allowed'
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-1 text-xs font-black ${
                          isNextToCapture
                            ? 'bg-amber-500 text-white group-hover:scale-110 transition-transform shadow-xs'
                            : 'bg-slate-200 dark:bg-slate-800 text-slate-400'
                        }`}>
                          {isNextToCapture ? <PlusIcon className="h-4 w-4" /> : pageNum}
                        </div>
                        <span className={`text-[11px] font-bold block ${isNextToCapture ? 'text-amber-700 dark:text-amber-400' : 'text-slate-400 dark:text-slate-600'}`}>
                          Page {pageNum}
                        </span>
                        <span className="text-[9px] text-slate-400 mt-0.5">
                          {isNextToCapture ? 'Tap to snap' : 'Empty'}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Primary Action Buttons Bar */}
                <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <DocumentDuplicateIcon className="h-4 w-4 text-amber-500" />
                    <span>
                      {stagedChunkPages.length > 0
                        ? `Chunk contains ${stagedChunkPages.length} sequential page(s). Ready to queue.`
                        : 'Capture up to 5 pages using In-App Camera above.'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2.5 w-full sm:w-auto">
                    {/* Secondary: Queue and Switch to Tab 2 to Watch */}
                    <button
                      id="chunking-queue-view-btn"
                      type="button"
                      onClick={() => handleSubmitCurrentChunk(true)}
                      disabled={stagedChunkPages.length === 0 || isSubmittingChunk}
                      className={`px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm border transition-all cursor-pointer flex items-center justify-center gap-2 ${
                        stagedChunkPages.length === 0 || isSubmittingChunk
                          ? 'opacity-40 cursor-not-allowed bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400'
                          : 'bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-600 active:scale-95 shadow-xs'
                      }`}
                      title="Save this chunk and open Tab 2 queue to watch processing"
                    >
                      <span>Queue &amp; View Tab 2</span>
                      <ArrowRightIcon className="h-4 w-4 text-indigo-500" />
                    </button>

                    {/* Primary: Queue & Capture Next (The core user request) */}
                    <button
                      id="chunking-queue-and-next-btn"
                      type="button"
                      onClick={() => handleSubmitCurrentChunk(false)}
                      disabled={stagedChunkPages.length === 0 || isSubmittingChunk}
                      className={`flex-1 sm:flex-initial px-6 py-2.5 rounded-xl font-black text-xs sm:text-sm transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg ${
                        stagedChunkPages.length === 0 || isSubmittingChunk
                          ? 'opacity-40 cursor-not-allowed bg-slate-300 dark:bg-slate-700 text-slate-500 shadow-none'
                          : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 active:scale-95 text-white shadow-amber-500/30'
                      }`}
                      title="Send this chunk to background AI batch extraction and immediately capture the next chunk!"
                    >
                      <SparklesIcon className="h-4 w-4 text-white" />
                      <span>
                        {isSubmittingChunk
                          ? 'Queueing Chunk...'
                          : `Queue Chunk & Capture Next (${stagedChunkPages.length}P)`}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 2: BATCH PROCESSING & EXTRACTION QUEUE                                */}
          {/* ========================================================================= */}
          {activeTab === 'queue' && (
            <div className="space-y-4 max-w-4xl mx-auto animate-in fade-in duration-150">
              {/* Feedback toast */}
              {cloudSyncFeedback && (
                <div className="p-3 rounded-xl bg-indigo-900/50 border border-indigo-700/60 text-indigo-200 text-xs font-bold flex items-center justify-between shadow-xs">
                  <span>{cloudSyncFeedback}</span>
                  <button type="button" onClick={() => setCloudSyncFeedback('')} className="text-slate-400 hover:text-white">
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                </div>
              )}

              {/* Status Pills & Queue Toolbar */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 sm:p-4 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                {/* Filter Pills */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setQueueFilter('all')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      queueFilter === 'all'
                        ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                    }`}
                  >
                    All Chunks ({totalChunksCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setQueueFilter('extracting')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      queueFilter === 'extracting'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100'
                    }`}
                  >
                    <ArrowPathIcon className={`h-3 w-3 ${extractingCount > 0 ? 'animate-spin' : ''}`} />
                    <span>Extracting ({extractingCount})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setQueueFilter('queued')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      queueFilter === 'queued'
                        ? 'bg-amber-500 text-white shadow-xs'
                        : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100'
                    }`}
                  >
                    <ClockIcon className="h-3 w-3" />
                    <span>Queued ({queuedCount})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setQueueFilter('success')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      queueFilter === 'success'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100'
                    }`}
                  >
                    <CheckCircleIcon className="h-3 w-3" />
                    <span>Success ({successCount})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setQueueFilter('failed')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      queueFilter === 'failed'
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100'
                    }`}
                  >
                    <ExclamationCircleIcon className="h-3 w-3" />
                    <span>Failed ({failedCount})</span>
                  </button>
                </div>

                {/* Right Side Batch Actions */}
                <div className="flex items-center gap-2 shrink-0 ml-auto flex-wrap">
                  {onOpenCapturedSessionsVault && (
                    <button
                      type="button"
                      onClick={onOpenCapturedSessionsVault}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-xs font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors cursor-pointer"
                      title="Open Captured Manifest Pages (Local Storage Vault)"
                    >
                      <DocumentDuplicateIcon className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                      <span>Captured Pages Vault</span>
                    </button>
                  )}
                  {successCount > 0 && (
                    <button
                      type="button"
                      onClick={handleClearCompleted}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                      title="Clear completed chunks to save storage"
                    >
                      Clear Completed
                    </button>
                  )}
                  {channelKey && (
                    <div className="flex items-center gap-1 border-l border-slate-200 dark:border-slate-800 pl-2">
                      <button
                        type="button"
                        onClick={handleBackupToCloud}
                        disabled={isCloudSyncing}
                        className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition-colors cursor-pointer"
                        title="Back up all chunks to Cloud Vault"
                      >
                        <CloudArrowUpIcon className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={handleRestoreFromCloud}
                        disabled={isCloudSyncing}
                        className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition-colors cursor-pointer"
                        title="Restore chunks from Cloud Vault"
                      >
                        <CloudArrowDownIcon className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={loadSessions}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    title="Refresh queue list"
                  >
                    <ArrowPathIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* List of Chunks */}
              {filteredSessions.length === 0 ? (
                <div className="py-16 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 space-y-3 shadow-xs">
                  <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                    <BoltIcon className="h-8 w-8" />
                  </div>
                  <h4 className="text-base font-black text-slate-800 dark:text-slate-200">
                    No Manifest Chunks in this View
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                    {queueFilter === 'all'
                      ? 'No manifest chunks have been captured yet. Switch to Tab 1 to start capturing chunks.'
                      : `No chunks currently with status "${queueFilter}".`}
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('capture')}
                    className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-black text-xs shadow-md shadow-amber-500/20 active:scale-95 cursor-pointer"
                  >
                    <CameraIcon className="h-4 w-4" />
                    <span>Go to Tab 1: Capture Chunk</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredSessions.map((session, idx) => {
                    const isExtracting = session.status === 'extracting' || currentExtractingSessionId === session.id;
                    const isQueued = session.status === 'queued';
                    const isFailed = session.status === 'failed';
                    const isSuccess = session.status === 'success';

                    return (
                      <div
                        key={session.id}
                        className={`rounded-2xl border p-4 sm:p-5 transition-all shadow-xs flex flex-col gap-3 ${
                          isExtracting
                            ? 'bg-indigo-50/60 dark:bg-indigo-950/30 border-indigo-300 dark:border-indigo-700/80 ring-2 ring-indigo-500/30'
                            : isFailed
                            ? 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/60'
                            : isQueued
                            ? 'bg-amber-50/40 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/60'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                        }`}
                      >
                        {/* Top Info Header */}
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-black text-slate-900 dark:text-white">
                                {session.manifestName || `Chunk #${session.sessionNumber}`}
                              </span>
                              <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-600 dark:text-slate-300">
                                {session.pageCount || session.pages?.length || 0} Pages
                              </span>
                              {session.folderId && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
                                  <FolderIcon className="h-3 w-3" />
                                  <span>{folders.find(f => f.id === session.folderId)?.name || 'Folder'}</span>
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-400">
                              Captured {new Date(session.createdAt).toLocaleTimeString()} • {new Date(session.createdAt).toLocaleDateString()}
                            </p>
                          </div>

                          {/* Status Badge */}
                          <div className="flex items-center gap-2">
                            {isExtracting && (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-indigo-600 text-white shadow-xs animate-pulse">
                                <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />
                                <span>Processing with AI...</span>
                              </span>
                            )}
                            {isQueued && (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-amber-500 text-slate-950 shadow-xs">
                                <ClockIcon className="h-3.5 w-3.5" />
                                <span>Queued in Batch</span>
                              </span>
                            )}
                            {isSuccess && (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-600 text-white shadow-xs">
                                <CheckCircleIcon className="h-3.5 w-3.5" />
                                <span>Extracted ✓</span>
                              </span>
                            )}
                            {isFailed && (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-rose-600 text-white shadow-xs">
                                <ExclamationCircleIcon className="h-3.5 w-3.5" />
                                <span>Extraction Failed</span>
                              </span>
                            )}

                            {/* Delete button */}
                            <button
                              type="button"
                              onClick={(e) => handleDeleteSession(session.id, e)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                              title="Delete chunk from storage"
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        {/* Middle Status Notice Banner */}
                        {isExtracting && (
                          <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-300 dark:border-indigo-700/60 text-xs text-indigo-700 dark:text-indigo-300 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <ArrowPathIcon className="h-4 w-4 animate-spin shrink-0" />
                              <span className="font-medium">
                                Gemini OCR model is actively parsing line items, parcels, documents and rates for this chunk in the background. You can continue capturing more chunks!
                              </span>
                            </div>
                            {onStopExtraction && (
                              <button
                                type="button"
                                onClick={() => {
                                  onStopExtraction(session.id);
                                  loadSessions();
                                }}
                                className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 active:scale-95 text-white font-bold text-xs shrink-0 flex items-center gap-1 shadow-xs cursor-pointer transition-all"
                                title="Stop extraction for this chunk"
                              >
                                <StopIcon className="h-3.5 w-3.5" />
                                <span>Stop</span>
                              </button>
                            )}
                          </div>
                        )}

                        {isQueued && (
                          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-300 dark:border-amber-700/60 text-xs text-amber-700 dark:text-amber-300 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <ClockIcon className="h-4 w-4 shrink-0" />
                              <span className="font-medium">
                                Waiting in queue. Will automatically begin processing as soon as previous chunks complete.
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRetryFailedChunk(session)}
                              className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold cursor-pointer shrink-0"
                            >
                              Process Now
                            </button>
                          </div>
                        )}

                        {isSuccess && (
                          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-2">
                              <CheckCircleIcon className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                              <div>
                                <span className="text-xs font-black text-slate-800 dark:text-white block">
                                  Manifest: {session.resultManifestNo || 'Generated'}
                                </span>
                                <span className="text-[11px] text-emerald-700 dark:text-emerald-300 font-medium">
                                  Successfully extracted and saved into manifest records.
                                </span>
                              </div>
                            </div>
                            {session.resultManifestId && onOpenManifest && (
                              <button
                                type="button"
                                onClick={() => {
                                  onOpenManifest(session.resultManifestId!);
                                  onClose();
                                }}
                                className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
                              >
                                <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                                <span>Open Manifest</span>
                              </button>
                            )}
                          </div>
                        )}

                        {/* FAILED CHUNK SECTION (Explicitly requested by user: short failure message + retry button) */}
                        {isFailed && (
                          <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                            <div className="flex items-start gap-2.5">
                              <ExclamationCircleIcon className="h-5 w-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                              <div>
                                <span className="text-xs font-black text-rose-800 dark:text-rose-200 block">
                                  Extraction Error:
                                </span>
                                <p className="text-xs text-rose-700 dark:text-rose-300 font-medium">
                                  {session.extractionError || 'AI OCR extraction did not return results. Tap retry below.'}
                                </p>
                              </div>
                            </div>

                            {/* Prominent Retry Button */}
                            <button
                              id={`retry-failed-chunk-${session.id}`}
                              type="button"
                              onClick={() => handleRetryFailedChunk(session)}
                              className="w-full sm:w-auto px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 active:scale-95 text-white font-black text-xs shadow-md shadow-rose-900/30 flex items-center justify-center gap-2 cursor-pointer shrink-0 transition-all"
                              title="Re-extract this failed chunk with AI"
                            >
                              <ArrowPathIcon className="h-4 w-4" />
                              <span>Retry Extraction</span>
                            </button>

                            {onStopExtraction && (
                              <button
                                id={`stop-failed-chunk-${session.id}`}
                                type="button"
                                onClick={() => {
                                  onStopExtraction(session.id);
                                  loadSessions();
                                }}
                                className="w-full sm:w-auto px-4 py-2 rounded-xl bg-slate-800 hover:bg-rose-900/60 active:scale-95 text-slate-300 hover:text-rose-200 border border-slate-700 hover:border-rose-700 font-bold text-xs shadow-md flex items-center justify-center gap-1.5 cursor-pointer shrink-0 transition-all"
                                title="Stop extraction for this chunk"
                              >
                                <StopIcon className="h-4 w-4 text-rose-400" />
                                <span>Stop Extraction</span>
                              </button>
                            )}
                          </div>
                        )}

                        {/* Page Thumbnails Preview Strip */}
                        {session.pages && session.pages.length > 0 && (
                          <div className="pt-2 flex items-center gap-2 overflow-x-auto pb-1">
                            {session.pages.map((p, pIdx) => (
                              <div
                                key={pIdx}
                                onClick={() => setPreviewImage({ src: p.dataUrl, title: `${session.manifestName} - Page ${p.pageNumber}` })}
                                className="relative h-14 w-11 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-900 shrink-0 cursor-pointer hover:ring-2 hover:ring-amber-500 transition-all shadow-xs group"
                                title={`Page ${p.pageNumber} (Tap to enlarge)`}
                              >
                                <img
                                  src={p.dataUrl}
                                  alt={`P${p.pageNumber}`}
                                  className="h-full w-full object-cover"
                                />
                                <span className="absolute bottom-0 inset-x-0 bg-slate-950/80 text-white text-[9px] font-black text-center py-0.2">
                                  P{p.pageNumber}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 3: STATEMENT PAGINATION SETTINGS                                      */}
          {/* ========================================================================= */}
          {activeTab === 'statement' && (
            <div className="space-y-5 max-w-2xl mx-auto animate-in fade-in duration-150">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xs space-y-5">
                <div>
                  <h4 className="text-sm sm:text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <AdjustmentsHorizontalIcon className="h-5 w-5 text-amber-500" />
                    <span>Statement Chunk Size (Rows per Page)</span>
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Controls how many line items or manifests are printed per statement page for PDF reports and billings.
                  </p>
                </div>

                {/* Quick Presets */}
                <div>
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-wider block mb-2">
                    Quick Presets
                  </label>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {[8, 10, 11, 12, 15, 20].map((size) => (
                      <button
                        key={size}
                        type="button"
                        onClick={() => onSaveChunkSize(size)}
                        className={`py-3 px-2 rounded-xl text-center border font-bold text-xs transition-all cursor-pointer ${
                          chunkRowsPerPage === size
                            ? 'bg-amber-500 text-white border-amber-600 shadow-md shadow-amber-200 dark:shadow-none'
                            : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-amber-400'
                        }`}
                      >
                        <div className="text-lg font-black">{size}</div>
                        <div className="text-[10px] opacity-80">{size === 12 ? 'Default' : 'Rows'}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom Input */}
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <span className="text-xs font-bold text-slate-800 dark:text-white block">Custom Chunk Size</span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">Enter custom row count (between 4 and 100)</span>
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <input
                      type="number"
                      min="4"
                      max="100"
                      value={chunkRowsPerPage}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val) && val >= 4 && val <= 100) {
                          onSaveChunkSize(val);
                        }
                      }}
                      className="w-24 px-3 py-1.5 text-center text-sm font-bold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                    />
                    <span className="text-xs font-semibold text-slate-500">rows/page</span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-900/60 text-xs text-amber-900 dark:text-amber-200 space-y-1.5">
                  <p className="leading-relaxed text-[11px]">
                    • When generating PDF statements, Jetline statements are broken into chunks of <strong>{chunkRowsPerPage}</strong> rows per sheet.
                  </p>
                  <p className="leading-relaxed text-[11px]">
                    • Each printed chunk displays running page indices (e.g. <em>Page 1 / 4</em>) and individual chunk sub-totals along with the final grand total on the last chunk.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <footer className="shrink-0 px-4 sm:px-6 py-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span>Local IndexedDB Vault Active</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold transition-colors cursor-pointer"
          >
            Close
          </button>
        </footer>
      </div>

      {/* Lightbox Full Preview Modal */}
      {previewImage && (
        <div 
          className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/95 p-4 animate-in fade-in"
          onClick={() => setPreviewImage(null)}
        >
          <div 
            className="relative max-w-3xl max-h-[90vh] flex flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full flex items-center justify-between text-white px-2">
              <span className="text-xs font-bold">{previewImage.title}</span>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-white cursor-pointer"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
            <img
              src={previewImage.src}
              alt="Preview"
              className="max-h-[80vh] w-auto object-contain rounded-2xl shadow-2xl border border-slate-800"
            />
          </div>
        </div>
      )}
    </div>
  );
};
