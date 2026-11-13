import React, { useState, useEffect } from 'react';
import { 
  OfflineQueuedScan, 
  getQueuedScans, 
  deleteQueuedScan, 
  clearCompletedScans 
} from '../services/offlineStore';
import { 
  addQueueChangeListener, 
  processOfflineScansQueue 
} from '../services/offlineSyncWorker';
import { BillingConfig } from '../types';
import { 
  CloudArrowUpIcon, 
  WifiIcon, 
  ArrowPathIcon, 
  CheckCircleIcon, 
  ExclamationCircleIcon,
  TrashIcon,
  XMarkIcon,
  ClockIcon
} from '@heroicons/react/24/outline';

interface OfflineQueueBannerProps {
  currentConfig: BillingConfig;
  customApiKey?: string;
  onManifestSynced?: (manifestNo: string) => void;
}

export const OfflineQueueBanner: React.FC<OfflineQueueBannerProps> = ({
  currentConfig,
  customApiKey,
  onManifestSynced
}) => {
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [scans, setScans] = useState<OfflineQueuedScan[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  const refreshScans = async () => {
    const list = await getQueuedScans();
    setScans(list);
  };

  useEffect(() => {
    refreshScans();

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    const unsubQueue = addQueueChangeListener(refreshScans);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubQueue();
    };
  }, []);

  const pendingCount = scans.filter(s => s.status === 'offline_queued').length;
  const processingCount = scans.filter(s => s.status === 'processing').length;
  const completedCount = scans.filter(s => s.status === 'completed').length;
  const totalCount = scans.length;

  const handleManualSync = async () => {
    if (!isOnline) {
      alert('Cannot sync while offline. Please connect to internet or WiFi.');
      return;
    }
    setIsSyncing(true);
    setStatusMessage('Connecting to Gemini AI...');
    try {
      const { processed } = await processOfflineScansQueue(
        currentConfig,
        customApiKey,
        (msg) => setStatusMessage(msg)
      );
      await refreshScans();
      if (processed > 0 && onManifestSynced) {
        onManifestSynced(`${processed} manifests`);
      }
    } finally {
      setIsSyncing(false);
      setStatusMessage('');
    }
  };

  const handleDeleteScan = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Delete this queued scan?')) {
      await deleteQueuedScan(id);
      await refreshScans();
    }
  };

  const handleClearCompleted = async () => {
    await clearCompletedScans();
    await refreshScans();
  };

  // If online and no queued items, stay hidden
  if (isOnline && totalCount === 0) {
    return null;
  }

  return (
    <>
      <div 
        id="offline-queue-statusbar"
        className={`w-full px-4 py-2 text-xs font-medium border-b flex flex-wrap items-center justify-between gap-3 transition-colors ${
          !isOnline 
            ? 'bg-amber-500/15 border-amber-500/30 text-amber-900 dark:text-amber-200' 
            : pendingCount > 0 
            ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-900 dark:text-indigo-200'
            : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-900 dark:text-emerald-200'
        }`}
      >
        <div className="flex items-center gap-2.5">
          {!isOnline ? (
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-700 dark:text-amber-300 font-semibold uppercase tracking-wider text-[10px]">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
              Offline Mode
            </span>
          ) : (
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-700 dark:text-emerald-300 font-semibold uppercase tracking-wider text-[10px]">
              <WifiIcon className="w-3 h-3" />
              Connected
            </span>
          )}

          <span>
            {!isOnline ? (
              pendingCount > 0 
                ? `${pendingCount} scan(s) saved in IndexedDB. Will auto-sync with Gemini when online.`
                : 'All manifests & billing rates stored locally. Camera scans will queue offline.'
            ) : processingCount > 0 ? (
              <span className="flex items-center gap-1.5">
                <ArrowPathIcon className="w-3.5 h-3.5 animate-spin text-indigo-600 dark:text-indigo-400" />
                {statusMessage || `Processing offline scan queue (${processingCount} running)...`}
              </span>
            ) : pendingCount > 0 ? (
              `${pendingCount} scan(s) waiting to sync with Gemini OCR.`
            ) : (
              `All offline scans synced successfully.`
            )}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {totalCount > 0 && (
            <button
              id="btn-view-queued-scans"
              onClick={() => setIsModalOpen(true)}
              className="px-2.5 py-1 rounded-lg bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 transition-colors font-medium flex items-center gap-1.5"
            >
              <ClockIcon className="w-3.5 h-3.5" />
              Queue ({totalCount})
            </button>
          )}

          {isOnline && pendingCount > 0 && (
            <button
              id="btn-sync-queued-scans"
              onClick={handleManualSync}
              disabled={isSyncing}
              className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-all shadow-sm flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
            >
              <CloudArrowUpIcon className={`w-3.5 h-3.5 ${isSyncing ? 'animate-bounce' : ''}`} />
              {isSyncing ? 'Syncing...' : 'Sync Now'}
            </button>
          )}
        </div>
      </div>

      {/* Queued Scans Details Modal */}
      {isModalOpen && (
        <div 
          id="modal-offline-scans-queue"
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
        >
          <div className="relative w-full max-w-xl max-h-[85vh] flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden text-slate-800 dark:text-slate-100">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl">
                  <ClockIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base">IndexedDB Offline Scans Queue</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {scans.length} total • {pendingCount} queued • {completedCount} synced
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
              {scans.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <CloudArrowUpIcon className="w-12 h-12 mx-auto mb-2 opacity-40 stroke-1" />
                  <p className="text-sm">No scans in the offline queue.</p>
                  <p className="text-xs mt-1">Photos captured while offline automatically appear here.</p>
                </div>
              ) : (
                scans.map((scan) => (
                  <div
                    key={scan.id}
                    className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {scan.images[0]?.base64 ? (
                        <img 
                          src={`data:${scan.images[0].type || 'image/jpeg'};base64,${scan.images[0].base64}`} 
                          alt="Thumb" 
                          className="w-12 h-12 rounded-lg object-cover border border-slate-200 dark:border-slate-700 flex-shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-400">
                          {scan.pageCount}p
                        </div>
                      )}

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900 dark:text-white truncate">
                            {scan.resultManifestNo || `Queue Item (${scan.pageCount} page${scan.pageCount > 1 ? 's' : ''})`}
                          </span>
                          <span className={`px-2 py-0.5 rounded-md font-medium text-[10px] ${
                            scan.status === 'completed'
                              ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                              : scan.status === 'processing'
                              ? 'bg-indigo-500/20 text-indigo-600 dark:text-indigo-400'
                              : scan.status === 'failed'
                              ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400'
                              : 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                          }`}>
                            {scan.status === 'offline_queued' ? 'Queued' : scan.status}
                          </span>
                        </div>

                        <p className="text-slate-500 dark:text-slate-400 text-[11px] mt-0.5">
                          {new Date(scan.createdAt).toLocaleString()}
                        </p>

                        {scan.lastError && (
                          <p className="text-rose-500 text-[11px] mt-1 truncate">
                            Error: {scan.lastError}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={(e) => handleDeleteScan(scan.id, e)}
                        className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                        title="Delete from queue"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
              {completedCount > 0 ? (
                <button
                  onClick={handleClearCompleted}
                  className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline"
                >
                  Clear completed ({completedCount})
                </button>
              ) : <div />}

              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                >
                  Close
                </button>

                {isOnline && pendingCount > 0 && (
                  <button
                    onClick={handleManualSync}
                    disabled={isSyncing}
                    className="px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                  >
                    <CloudArrowUpIcon className="w-4 h-4" />
                    {isSyncing ? 'Syncing...' : `Sync Pending (${pendingCount})`}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
