import React, { useState, useEffect } from 'react';
import {
  CapturedManifestSession,
  getAllCapturedSessions,
  deleteCapturedSession,
  clearCapturedSessions,
  backupCapturedSessionsToCloud,
  restoreCapturedSessionsFromCloud,
  getSessionFiles,
  addCapturedSessionsListener,
  updateCapturedSession,
  deleteCloudCapturedSession
} from '../services/capturedPagesStorage';
import {
  XMarkIcon,
  ArrowPathIcon,
  CloudArrowUpIcon,
  CloudArrowDownIcon,
  TrashIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ClockIcon,
  EyeIcon,
  DocumentDuplicateIcon,
  ArrowTopRightOnSquareIcon,
  PhotoIcon,
  SparklesIcon,
  InformationCircleIcon,
  BoltIcon,
  StopIcon
} from '@heroicons/react/24/outline';

interface CapturedManifestSessionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  channelKey?: string;
  isAiBusy: boolean;
  currentExtractingSessionId?: string | null;
  onRetryExtraction: (files: File[], session: CapturedManifestSession) => void;
  onStopExtraction?: (sessionId?: string) => void;
  onOpenManifest?: (manifestId: string) => void;
  onOpenChunkingEngine?: () => void;
}

export const CapturedManifestSessionsModal: React.FC<CapturedManifestSessionsModalProps> = ({
  isOpen,
  onClose,
  channelKey,
  isAiBusy,
  currentExtractingSessionId,
  onRetryExtraction,
  onStopExtraction,
  onOpenManifest,
  onOpenChunkingEngine
}) => {
  const [sessions, setSessions] = useState<CapturedManifestSession[]>([]);
  const [selectedPreviewImage, setSelectedPreviewImage] = useState<{ src: string; title: string } | null>(null);
  const [isCloudSyncing, setIsCloudSyncing] = useState<boolean>(false);
  const [cloudSyncFeedback, setCloudSyncFeedback] = useState<string>('');
  const [filter, setFilter] = useState<'all' | 'failed' | 'ready' | 'success'>('all');

  // Delete & Clear Confirmation State (replaces blocked window.confirm)
  const [sessionToDelete, setSessionToDelete] = useState<CapturedManifestSession | null>(null);
  const [isConfirmingClearAll, setIsConfirmingClearAll] = useState<boolean>(false);
  const [isDeletingSessionId, setIsDeletingSessionId] = useState<string | null>(null);

  const loadSessions = async () => {
    const list = await getAllCapturedSessions();
    setSessions(list);
  };

  useEffect(() => {
    if (isOpen) {
      loadSessions();
    }
  }, [isOpen]);

  useEffect(() => {
    const unsubscribe = addCapturedSessionsListener(() => {
      loadSessions();
    });
    return () => unsubscribe();
  }, []);

  if (!isOpen) return null;

  const handleDeleteClick = (session: CapturedManifestSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setSessionToDelete(session);
  };

  const executeDeleteSession = async (session: CapturedManifestSession) => {
    try {
      setIsDeletingSessionId(session.id);
      await deleteCapturedSession(session.id);
      if (channelKey) {
        deleteCloudCapturedSession(channelKey, session.id).catch(() => {});
      }
      setSessionToDelete(null);
      await loadSessions();
      setCloudSyncFeedback(`✓ Session #${session.sessionNumber} permanently deleted from storage.`);
      setTimeout(() => setCloudSyncFeedback(''), 4000);
    } catch (err: any) {
      setCloudSyncFeedback(`Delete error: ${err?.message || 'Failed'}`);
    } finally {
      setIsDeletingSessionId(null);
    }
  };

  const executeClearSessions = async (onlySuccessful: boolean) => {
    try {
      const removed = await clearCapturedSessions(onlySuccessful);
      setIsConfirmingClearAll(false);
      await loadSessions();
      setCloudSyncFeedback(`✓ Cleared ${removed} captured session(s) from local storage.`);
      setTimeout(() => setCloudSyncFeedback(''), 4000);
    } catch (err: any) {
      setCloudSyncFeedback(`Clear error: ${err?.message || 'Failed'}`);
    }
  };

  const handleBackupToCloud = async () => {
    if (!channelKey) {
      setCloudSyncFeedback('No Cloud Channel Key found. Please connect to a Cloud Sync channel first in Settings.');
      setTimeout(() => setCloudSyncFeedback(''), 4000);
      return;
    }
    setIsCloudSyncing(true);
    setCloudSyncFeedback('Backing up captured sessions to Cloud Vault...');
    try {
      const res = await backupCapturedSessionsToCloud(channelKey);
      setCloudSyncFeedback(`✓ Backed up ${res.backedUpCount} captured session(s) to Cloud Storage.`);
      await loadSessions();
    } catch (err: any) {
      setCloudSyncFeedback(`Cloud backup error: ${err.message || 'Failed'}`);
    } finally {
      setIsCloudSyncing(false);
      setTimeout(() => setCloudSyncFeedback(''), 5000);
    }
  };

  const handleRestoreFromCloud = async () => {
    if (!channelKey) {
      setCloudSyncFeedback('No Cloud Channel Key found. Please connect to a Cloud Sync channel first in Settings.');
      setTimeout(() => setCloudSyncFeedback(''), 4000);
      return;
    }
    setIsCloudSyncing(true);
    setCloudSyncFeedback('Restoring captured sessions from Cloud Vault...');
    try {
      const res = await restoreCapturedSessionsFromCloud(channelKey);
      setCloudSyncFeedback(`✓ Restored ${res.restoredCount} session(s) from Cloud Storage.`);
      await loadSessions();
    } catch (err: any) {
      setCloudSyncFeedback(`Cloud restore error: ${err.message || 'Failed'}`);
    } finally {
      setIsCloudSyncing(false);
      setTimeout(() => setCloudSyncFeedback(''), 5000);
    }
  };

  const handleStartExtraction = (session: CapturedManifestSession) => {
    const files = getSessionFiles(session);
    if (files.length === 0) {
      alert('No pages found in this session.');
      return;
    }
    onRetryExtraction(files, session);
  };

  const handleStopExtraction = async (sessionId: string) => {
    if (onStopExtraction) {
      onStopExtraction(sessionId);
    } else {
      try {
        await updateCapturedSession(sessionId, {
          status: 'failed',
          extractionError: 'Extraction stopped by user.'
        });
      } catch (e) {}
    }
    await loadSessions();
  };

  const filteredSessions = sessions.filter(s => {
    if (filter === 'all') return true;
    return s.status === filter;
  });

  const failedCount = sessions.filter(s => s.status === 'failed').length;
  const readyCount = sessions.filter(s => s.status === 'ready').length;
  const successCount = sessions.filter(s => s.status === 'success').length;

  return (
    <div 
      id="captured-manifest-sessions-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-2 sm:p-4 animate-in fade-in duration-200"
    >
      <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl max-w-4xl w-full h-[90vh] max-h-[850px] flex flex-col overflow-hidden text-slate-100">
        
        {/* Header */}
        <header className="shrink-0 px-4 sm:px-6 py-4 bg-slate-850 border-b border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-indigo-600/90 text-white flex items-center justify-center shadow-lg shadow-indigo-900/40 shrink-0">
              <DocumentDuplicateIcon className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-black text-white">
                  Captured Manifest Pages (Local Storage)
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase tracking-wider">
                  IndexedDB Vault
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-400">
                Safe sequential page storage per camera session. Keeps work intact across crashes & extraction retries.
              </p>
            </div>
          </div>

          <button
            id="close-captured-sessions-modal-btn"
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Close Vault"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </header>

        {/* Toolbar & Separate Cloud Sync Controls */}
        <div className="shrink-0 px-4 sm:px-6 py-2.5 bg-slate-800/60 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2.5">
          {/* Filter Pills */}
          <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-slate-700/80 text-xs">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                filter === 'all'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              All ({sessions.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('failed')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1 ${
                filter === 'failed'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-rose-400 hover:text-rose-300'
              }`}
            >
              <span>Failed</span>
              {failedCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-rose-900/80 text-white text-[10px]">
                  {failedCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setFilter('ready')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1 ${
                filter === 'ready'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-amber-400 hover:text-amber-300'
              }`}
            >
              <span>Ready</span>
              {readyCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-900/80 text-white text-[10px]">
                  {readyCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setFilter('success')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1 ${
                filter === 'success'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-emerald-400 hover:text-emerald-300'
              }`}
            >
              <span>Success</span>
              {successCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-emerald-900/80 text-white text-[10px]">
                  {successCount}
                </span>
              )}
            </button>
          </div>

          {/* Cloud Actions (Separate, Manual Backup / Restore) */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {onOpenChunkingEngine && (
              <button
                type="button"
                onClick={onOpenChunkingEngine}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95"
                title="Open Chunking & Batch Engine Modal"
              >
                <BoltIcon className="h-4 w-4 text-amber-400" />
                <span className="hidden sm:inline">Chunking &amp; Batch Engine</span>
                <span className="sm:hidden">Chunking</span>
              </button>
            )}

            <button
              id="backup-captured-sessions-btn"
              type="button"
              disabled={isCloudSyncing || sessions.length === 0}
              onClick={handleBackupToCloud}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-700/80 hover:bg-slate-700 active:scale-95 disabled:opacity-40 text-xs font-bold text-slate-200 hover:text-white border border-slate-600/80 transition-all cursor-pointer shadow-xs"
              title="Manual cloud backup of captured page sessions to Cloud Vault"
            >
              <CloudArrowUpIcon className="h-4 w-4 text-indigo-400" />
              <span className="hidden sm:inline">Backup to Cloud</span>
              <span className="sm:hidden">Backup</span>
            </button>

            <button
              id="restore-captured-sessions-btn"
              type="button"
              disabled={isCloudSyncing}
              onClick={handleRestoreFromCloud}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-700/80 hover:bg-slate-700 active:scale-95 disabled:opacity-40 text-xs font-bold text-slate-200 hover:text-white border border-slate-600/80 transition-all cursor-pointer shadow-xs"
              title="Restore captured page sessions from Cloud Vault"
            >
              <CloudArrowDownIcon className="h-4 w-4 text-emerald-400" />
              <span className="hidden sm:inline">Restore from Cloud</span>
              <span className="sm:hidden">Restore</span>
            </button>

            {sessions.length > 0 && (
              <button
                id="clear-captured-sessions-btn"
                type="button"
                onClick={() => setIsConfirmingClearAll(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-950/60 hover:text-rose-300 text-xs font-bold text-slate-400 hover:border-rose-800/80 border border-slate-700/80 transition-all cursor-pointer shadow-xs"
                title="Remove captured sessions from local storage"
              >
                <TrashIcon className="h-3.5 w-3.5 text-slate-400" />
                <span className="hidden md:inline">
                  {successCount > 0 ? 'Clear Extracted' : 'Clear Sessions'}
                </span>
                <span className="md:hidden">Clear</span>
              </button>
            )}
          </div>
        </div>

        {/* Feedback Alert if Cloud Sync / Clear occurred */}
        {cloudSyncFeedback && (
          <div className="shrink-0 px-4 py-2 bg-indigo-950/70 border-b border-indigo-800/80 text-indigo-200 text-xs font-medium flex items-center gap-2 animate-in fade-in duration-150">
            <InformationCircleIcon className="h-4 w-4 text-indigo-400 shrink-0" />
            <span>{cloudSyncFeedback}</span>
          </div>
        )}

        {/* Main List of Sessions */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {filteredSessions.length === 0 ? (
            <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-slate-800 rounded-3xl bg-slate-900/40">
              <div className="h-16 w-16 rounded-3xl bg-slate-800 text-slate-500 flex items-center justify-center mb-3">
                <PhotoIcon className="h-8 w-8" />
              </div>
              <h4 className="text-base font-bold text-slate-200">
                {filter === 'all' 
                  ? 'No Captured Manifest Sessions Yet' 
                  : `No ${filter} sessions found`}
              </h4>
              <p className="text-xs text-slate-400 max-w-sm mt-1 mb-4 leading-relaxed">
                When you snap manifest pages using the in-app camera or choose photos, each session is automatically archived here sequentially. You can safely capture the next manifest even if extraction is busy or fails.
              </p>
            </div>
          ) : (
            filteredSessions.map((session) => {
              const formattedDate = new Date(session.createdAt).toLocaleTimeString([], {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });

              const isSuccess = session.status === 'success';
              const isFailed = session.status === 'failed';
              const isExtracting = session.status === 'extracting' || (isAiBusy && currentExtractingSessionId === session.id);
              const isReady = session.status === 'ready';

              return (
                <div
                  key={session.id}
                  className={`bg-slate-850 rounded-2xl border transition-all p-4 sm:p-5 space-y-3.5 shadow-md ${
                    isFailed
                      ? 'border-rose-800/70 hover:border-rose-600'
                      : isSuccess
                      ? 'border-emerald-800/60 hover:border-emerald-600'
                      : isExtracting
                      ? 'border-indigo-600 animate-pulse'
                      : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {/* Card Header: Session Title, Timestamp, Status Pill */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                    <div className="flex items-center gap-2.5">
                      <span className="flex items-center justify-center h-7 w-7 rounded-lg bg-indigo-950 border border-indigo-800/80 text-indigo-300 font-mono text-xs font-black">
                        #{session.sessionNumber}
                      </span>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm sm:text-base font-black text-white">
                            {session.manifestName || `Session #${session.sessionNumber}`}
                          </h4>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                            {session.pageCount} Sequential {session.pageCount === 1 ? 'Page' : 'Pages'}
                          </span>
                          {session.isCloudBackedUp && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800/80 inline-flex items-center gap-1">
                              <CloudArrowUpIcon className="h-3 w-3" />
                              <span>Cloud Backed Up</span>
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5">
                          <ClockIcon className="h-3 w-3 text-slate-500" />
                          <span>Captured {formattedDate}</span>
                        </p>
                      </div>
                    </div>

                    {/* Status Badge */}
                    <div className="flex items-center gap-2">
                      {isSuccess && (
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-700/80 text-xs font-bold shadow-xs">
                          <CheckCircleIcon className="h-4 w-4" />
                          <span>Extraction Successful</span>
                        </div>
                      )}
                      {isFailed && (
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-950/80 text-rose-400 border border-rose-700/80 text-xs font-bold shadow-xs">
                          <ExclamationCircleIcon className="h-4 w-4" />
                          <span>Extraction Failed</span>
                        </div>
                      )}
                      {isExtracting && (
                        <div className="flex items-center gap-1.5">
                          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-950/80 text-indigo-300 border border-indigo-700/80 text-xs font-bold shadow-xs">
                            <ArrowPathIcon className="h-4 w-4 animate-spin text-indigo-400" />
                            <span>Extracting in Progress...</span>
                          </div>
                          <button
                            id={`session-header-stop-btn-${session.id}`}
                            type="button"
                            onClick={() => handleStopExtraction(session.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-600 hover:bg-rose-500 active:scale-95 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
                            title="Stop ongoing extraction"
                          >
                            <StopIcon className="h-3.5 w-3.5" />
                            <span>Stop</span>
                          </button>
                        </div>
                      )}
                      {isReady && (
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-950/80 text-amber-400 border border-amber-700/80 text-xs font-bold shadow-xs">
                          <SparklesIcon className="h-4 w-4" />
                          <span>Ready for Extraction</span>
                        </div>
                      )}

                      <button
                        id={`delete-session-btn-${session.id}`}
                        type="button"
                        onClick={(e) => handleDeleteClick(session, e)}
                        className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                        title="Delete this captured session from storage"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Failure Message Section (as explicitly requested: "If failed then extraction failed issue or message will be shown in short for that session") */}
                  {isFailed && (
                    <div className="bg-rose-950/40 border border-rose-900/80 rounded-xl p-3 flex items-start gap-2.5">
                      <ExclamationCircleIcon className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-rose-300">
                          Extraction Failure Notice:
                        </p>
                        <p className="text-[11px] text-rose-200/90 font-mono leading-relaxed break-words">
                          {session.extractionError || 'Model timed out or consignment table could not be recognized.'}
                        </p>
                        <p className="text-[10px] text-rose-400/80">
                          All {session.pageCount} captured page(s) remain safely preserved below. Click Retry Extraction to re-run.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Success Result Link */}
                  {isSuccess && session.resultManifestNo && (
                    <div className="bg-emerald-950/30 border border-emerald-900/60 rounded-xl p-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <CheckCircleIcon className="h-4 w-4 text-emerald-400 shrink-0" />
                        <span className="text-xs text-emerald-200 font-medium">
                          Created Manifest: <strong>{session.resultManifestNo}</strong>
                        </span>
                      </div>
                      {onOpenManifest && session.resultManifestId && (
                        <button
                          type="button"
                          onClick={() => {
                            onOpenManifest(session.resultManifestId!);
                            onClose();
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95"
                        >
                          <span>Open Manifest</span>
                          <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Sequential Pages Filmstrip */}
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Sequential Captured Pages ({session.pages.length}):
                    </p>
                    <div className="flex items-center gap-2.5 overflow-x-auto pb-1 scrollbar-thin">
                      {session.pages.map((p) => (
                        <div
                          key={p.pageNumber}
                          onClick={() => setSelectedPreviewImage({ src: p.dataUrl, title: `Session #${session.sessionNumber} - Page ${p.pageNumber}` })}
                          className="relative shrink-0 w-20 h-26 rounded-xl bg-black/60 border border-slate-700/80 overflow-hidden group cursor-pointer hover:border-indigo-400 transition-all shadow-xs"
                          title={`Click to preview Page ${p.pageNumber}`}
                        >
                          <img
                            src={p.dataUrl}
                            alt={`Page ${p.pageNumber}`}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                          />
                          <div className="absolute top-1 left-1 bg-slate-900/90 text-white text-[9px] font-black px-1.5 py-0.5 rounded border border-slate-700">
                            P{p.pageNumber}
                          </div>
                          <div className="absolute inset-0 bg-indigo-950/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <EyeIcon className="h-5 w-5 text-white" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-wrap items-center justify-end gap-2 pt-1 border-t border-slate-800/60">
                    {/* Retry / Extract Button */}
                    <button
                      id={`session-retry-extract-btn-${session.id}`}
                      type="button"
                      disabled={isExtracting}
                      onClick={() => handleStartExtraction(session)}
                      className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer shadow-md active:scale-95 ${
                        isFailed
                          ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-950/50'
                          : isSuccess
                          ? 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                          : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-950/50'
                      }`}
                    >
                      <ArrowPathIcon className={`h-4 w-4 ${isExtracting ? 'animate-spin' : ''}`} />
                      <span>{isFailed ? 'Retry Extraction' : isSuccess ? 'Re-extract Data' : 'Extract Data Now'}</span>
                    </button>

                    {/* Stop Extraction Button - Placed right after Retry extraction button */}
                    <button
                      id={`session-stop-extract-btn-${session.id}`}
                      type="button"
                      disabled={!isExtracting && !(isAiBusy && currentExtractingSessionId === session.id)}
                      onClick={() => handleStopExtraction(session.id)}
                      className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer shadow-md active:scale-95 ${
                        isExtracting || (isAiBusy && currentExtractingSessionId === session.id)
                          ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-950/50 ring-2 ring-rose-400/50 animate-pulse'
                          : 'bg-slate-800/80 hover:bg-rose-950/40 text-slate-400 hover:text-rose-300 border border-slate-700 hover:border-rose-800/50 disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-slate-800/80 disabled:hover:text-slate-400 disabled:hover:border-slate-700'
                      }`}
                      title={
                        isExtracting || (isAiBusy && currentExtractingSessionId === session.id)
                          ? 'Stop extraction currently in progress'
                          : 'Stop extraction is active while AI is processing'
                      }
                    >
                      <StopIcon className="h-4 w-4 text-rose-300" />
                      <span>Stop Extraction</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info note */}
        <footer className="shrink-0 px-4 sm:px-6 py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
            <span>{sessions.length} Saved Manifest Session(s) in Local IndexedDB</span>
          </div>
          <span className="text-[11px] text-slate-500 hidden sm:inline">
            Local pages never auto-sync to cloud; use the manual Backup button above.
          </span>
        </footer>
      </div>

      {/* Full-Screen High-Res Preview Lightbox */}
      {selectedPreviewImage && (
        <div 
          className="fixed inset-0 z-60 bg-black/95 flex flex-col items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setSelectedPreviewImage(null)}
        >
          <div className="absolute top-4 right-4 flex items-center gap-3">
            <span className="text-xs font-bold text-slate-300">
              {selectedPreviewImage.title}
            </span>
            <button
              type="button"
              onClick={() => setSelectedPreviewImage(null)}
              className="p-2 rounded-full bg-slate-800 text-white hover:bg-slate-700 cursor-pointer"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
          <img
            src={selectedPreviewImage.src}
            alt={selectedPreviewImage.title}
            className="max-h-[85vh] max-w-[90vw] object-contain rounded-xl shadow-2xl border border-slate-800"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
      {/* In-App Confirmation Modal: Delete Single Session */}
      {sessionToDelete && (
        <div 
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150"
          onClick={() => setSessionToDelete(null)}
        >
          <div 
            className="bg-slate-900 border border-rose-800/80 rounded-2xl max-w-sm w-full p-5 shadow-2xl text-slate-100 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-rose-950/90 border border-rose-800 flex items-center justify-center text-rose-400 shrink-0">
                <TrashIcon className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">Delete Captured Session?</h4>
                <p className="text-xs text-slate-400">
                  {sessionToDelete.manifestName || `Session #${sessionToDelete.sessionNumber}`} ({sessionToDelete.pageCount} {sessionToDelete.pageCount === 1 ? 'page' : 'pages'})
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              This will permanently delete this captured manifest session and its photos from local storage.
            </p>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setSessionToDelete(null)}
                className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                id="confirm-delete-session-btn"
                type="button"
                disabled={isDeletingSessionId === sessionToDelete.id}
                onClick={() => executeDeleteSession(sessionToDelete)}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white transition-colors cursor-pointer shadow-xs disabled:opacity-50 active:scale-95"
              >
                <TrashIcon className="h-3.5 w-3.5" />
                <span>{isDeletingSessionId === sessionToDelete.id ? 'Deleting...' : 'Delete Session'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-App Confirmation Modal: Clear Sessions */}
      {isConfirmingClearAll && (
        <div 
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150"
          onClick={() => setIsConfirmingClearAll(false)}
        >
          <div 
            className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-5 shadow-2xl text-slate-100 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-rose-400 shrink-0">
                <TrashIcon className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-base font-bold text-white">Clear Captured Sessions</h4>
                <p className="text-xs text-slate-400">
                  Free up local IndexedDB storage
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Select which sequential manifest capture sessions you would like to remove:
            </p>
            <div className="space-y-2 pt-1">
              {successCount > 0 && (
                <button
                  type="button"
                  onClick={() => executeClearSessions(true)}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold flex items-center justify-between transition-colors cursor-pointer text-left"
                >
                  <span>Clear Extracted Sessions Only</span>
                  <span className="px-2 py-0.5 rounded-md bg-emerald-950 text-emerald-300 text-[10px] font-black border border-emerald-800">
                    {successCount} Sessions
                  </span>
                </button>
              )}
              <button
                type="button"
                onClick={() => executeClearSessions(false)}
                className="w-full py-2.5 px-4 rounded-xl bg-rose-950/50 hover:bg-rose-900/60 text-rose-200 border border-rose-800 text-xs font-bold flex items-center justify-between transition-colors cursor-pointer text-left"
              >
                <span>Clear All Sessions (Failed, Ready &amp; Success)</span>
                <span className="px-2 py-0.5 rounded-md bg-rose-900 text-rose-100 text-[10px] font-black border border-rose-700">
                  {sessions.length} Total
                </span>
              </button>
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setIsConfirmingClearAll(false)}
                className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
