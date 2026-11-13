import React, { useState, useMemo, useEffect } from 'react';
import QRCode from 'qrcode';
import {
  CloudIcon,
  CloudArrowUpIcon,
  CloudArrowDownIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  TrashIcon,
  ArrowDownTrayIcon,
  EyeIcon,
  FolderIcon,
  DocumentTextIcon,
  SparklesIcon,
  XMarkIcon,
  MagnifyingGlassIcon,
  InformationCircleIcon,
  ShieldCheckIcon,
  PlusIcon,
  ClockIcon,
  ServerStackIcon,
  DevicePhoneMobileIcon,
  ComputerDesktopIcon,
  DeviceTabletIcon,
  QrCodeIcon,
  LinkIcon,
  KeyIcon,
  DocumentDuplicateIcon,
  CheckIcon,
  LockClosedIcon,
  ArrowRightOnRectangleIcon,
  ChevronRightIcon,
  FunnelIcon,
  BuildingOffice2Icon,
  CircleStackIcon
} from '@heroicons/react/24/outline';
import {
  CloudBackupFile,
  ManifestHistory,
  Folder,
  BillingConfig,
  CloudSyncMeta,
  SyncedDevice,
  ManifestOverride,
  ManualDocManifest
} from '../types';
import {
  getManifestSectionType,
  ManifestSectionType,
  formatStorageBytes,
  computeBackupSizeBytes,
  computeManifestSizeBytes
} from '../services/cloudSyncService';
import { QrScannerModal } from './QrScannerModal';

interface CloudManagerProps {
  initialTab?: 'backup_sync' | 'cloud_items' | 'connect_keys' | 'connected_users';
  cloudBackups?: CloudBackupFile[];
  cloudManifests: ManifestHistory[];
  cloudMeta: CloudSyncMeta;
  localManifests: ManifestHistory[];
  localFolders: Folder[];
  localOverrides?: Record<string, ManifestOverride>;
  localManualDocEntries?: ManualDocManifest[];
  cloudOverrides?: Record<string, ManifestOverride>;
  cloudManualDocEntries?: ManualDocManifest[];
  globalConfig: BillingConfig;
  isLoading: boolean;
  channelKey?: string;
  currentDevice?: SyncedDevice;
  connectedDevices?: SyncedDevice[];
  onSyncNow: (
    section?: ManifestSectionType,
    mode?: 'sync' | 'backup',
    onProgress?: (percent: number, stepText?: string) => void
  ) => Promise<void>;
  onCreateBackup?: (name: string, description?: string, section?: ManifestSectionType) => Promise<void>;
  onRestoreBackup?: (backup: CloudBackupFile, mode: 'replace' | 'merge') => Promise<void>;
  onDeleteBackup?: (backupId: string, cloudDocId?: string) => Promise<void>;
  onOpenManifest: (manifest: ManifestHistory) => void;
  onRestoreCloudManifests?: (manifests: ManifestHistory[], openAfter?: boolean) => Promise<void>;
  onRestoreCloudManualDocs?: (docs: ManualDocManifest[]) => Promise<void>;
  onDeleteCloudManualDoc?: (docId: string) => Promise<void>;
  onToggleAutoSync: (enabled: boolean) => void;
  onRefreshCloudData: () => Promise<void>;
  onClose?: () => void;
  onUpdateChannelKey?: (newKey: string) => Promise<void>;
  onDeleteCloudManifest?: (manifestId: string, cloudDocId?: string) => Promise<void>;
}

export const CloudManager: React.FC<CloudManagerProps> = ({
  initialTab,
  cloudBackups = [],
  cloudManifests,
  cloudMeta,
  localManifests,
  localFolders,
  localOverrides = {},
  localManualDocEntries = [],
  cloudOverrides = {},
  cloudManualDocEntries = [],
  globalConfig,
  isLoading,
  channelKey = 'REMIX-CLOUD-SYNC',
  currentDevice,
  connectedDevices = [],
  onSyncNow,
  onCreateBackup,
  onRestoreBackup,
  onDeleteBackup,
  onOpenManifest,
  onRestoreCloudManifests,
  onRestoreCloudManualDocs,
  onDeleteCloudManualDoc,
  onToggleAutoSync,
  onRefreshCloudData,
  onClose,
  onUpdateChannelKey,
  onDeleteCloudManifest,
}) => {
  // Main Top-level Tabs: matching the screenshots
  const [activeTab, setActiveTab] = useState<'backup_sync' | 'cloud_items' | 'connect_keys' | 'connected_users'>(initialTab || 'backup_sync');

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Search & Filters in Cloud Items
  const [searchQuery, setSearchQuery] = useState('');
  const [itemSectionFilter, setItemSectionFilter] = useState<'all' | 'P' | 'PD' | 'backups'>('all');
  const [selectedCloudItemIds, setSelectedCloudItemIds] = useState<string[]>([]);

  // In-app Confirmation Modal State (replaces browser confirm() which is blocked in iframes)
  const [pendingAction, setPendingAction] = useState<{
    type: 'restore_backup' | 'delete_backup' | 'delete_manifest' | 'delete_manual_doc' | 'batch_delete';
    title: string;
    message: string;
    backup?: CloudBackupFile;
    manifest?: ManifestHistory;
    manualDoc?: ManualDocManifest;
  } | null>(null);
  const [isActionRunning, setIsActionRunning] = useState(false);

  // Key & Connect Modal States
  const [copiedKey, setCopiedKey] = useState(false);
  const [isChangeKeyModalOpen, setIsChangeKeyModalOpen] = useState(false);
  const [newKeyInput, setNewKeyInput] = useState(channelKey);
  const [isQrScannerOpen, setIsQrScannerOpen] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');

  // Notification Banner
  const [notificationMsg, setNotificationMsg] = useState<{ type: 'success' | 'info' | 'error'; text: string } | null>(null);

  // Button Progression Filler State for Cloud Operations
  const [activeSyncOp, setActiveSyncOp] = useState<{
    section: ManifestSectionType;
    mode: 'sync' | 'backup';
    percent: number;
    stageText: string;
    isComplete?: boolean;
  } | null>(null);

  const progressTimerRef = React.useRef<any>(null);
  const targetPercentRef = React.useRef<number>(0);

  useEffect(() => {
    return () => {
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
      }
    };
  }, []);

  const showNotification = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setNotificationMsg({ type, text });
    setTimeout(() => {
      setNotificationMsg(null);
    }, 4500);
  };

  // Generate QR code for channel key
  useEffect(() => {
    let isMounted = true;
    const pairingUrl = typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}?syncKey=${encodeURIComponent(channelKey)}`
      : `?syncKey=${channelKey}`;

    QRCode.toDataURL(pairingUrl, {
      width: 240,
      margin: 2,
      color: {
        dark: '#1e1b4b',
        light: '#ffffff'
      }
    }).then(url => {
      if (isMounted) setQrCodeDataUrl(url);
    }).catch(err => {
      console.warn('QR code gen error:', err);
    });

    return () => {
      isMounted = false;
    };
  }, [channelKey]);

  // Section Breakdown: Local Device
  const localSectionStats = useMemo(() => {
    let pCount = 0;
    let pdCount = 0;
    let pItems = 0;
    let pdItems = 0;
    let pAmount = 0;
    let pdAmount = 0;

    const pFolderIds = new Set<string>();
    const pdFolderIds = new Set<string>();

    for (const m of localManifests) {
      const ov = localOverrides[m.id];
      const type = getManifestSectionType(m, ov);
      if (type === 'P') {
        pCount++;
        pItems += (m.itemCount || m.rows?.length || 0);
        pAmount += (m.totalAmount || 0);
        if (m.folderId) pFolderIds.add(m.folderId);
      } else {
        pdCount++;
        const docExtraCount = ov?.dCount ?? 0;
        const rowsDocCount = (m.rows || []).filter(r => r.type === 'Document').length;
        const extraDocDelta = Math.max(0, docExtraCount - rowsDocCount);
        pdItems += (m.itemCount || m.rows?.length || 0) + extraDocDelta;
        pdAmount += (m.totalAmount || 0) + (extraDocDelta * (m.config?.documentRate ?? globalConfig.documentRate ?? 5));
        if (m.folderId) pdFolderIds.add(m.folderId);
      }
    }

    for (const d of localManualDocEntries) {
      const ov = localOverrides[d.id];
      const dCount = ov?.dCount ?? d.docCount ?? 0;
      const dRate = d.documentRate ?? globalConfig.documentRate ?? 5;
      pdCount++;
      pdItems += dCount;
      pdAmount += dCount * dRate;
      if (d.folderId) pdFolderIds.add(d.folderId);
    }

    const totalConsignments = pItems + pdItems;
    const totalAmount = pAmount + pdAmount;

    return {
      pCount,
      pdCount,
      pItems,
      pdItems,
      pAmount,
      pdAmount,
      pFolderCount: pFolderIds.size,
      pdFolderCount: pdFolderIds.size,
      totalFolders: localFolders.length,
      totalManifests: localManifests.length + localManualDocEntries.length,
      totalConsignments,
      totalAmount,
    };
  }, [localManifests, localFolders, localOverrides, localManualDocEntries, globalConfig.documentRate]);

  // Section Breakdown: Cloud Vault
  const cloudSectionStats = useMemo(() => {
    let pCount = 0;
    let pdCount = 0;
    let pItems = 0;
    let pdItems = 0;
    let pAmount = 0;
    let pdAmount = 0;

    const pFolderIds = new Set<string>();
    const pdFolderIds = new Set<string>();

    for (const m of cloudManifests) {
      const ov = cloudOverrides[m.id] || m.pdOverride;
      const type = getManifestSectionType(m, ov);
      if (type === 'P') {
        pCount++;
        pItems += (m.itemCount || m.rows?.length || 0);
        pAmount += (m.totalAmount || 0);
        if (m.folderId) pFolderIds.add(m.folderId);
      } else {
        pdCount++;
        const docExtraCount = ov?.dCount ?? 0;
        const rowsDocCount = (m.rows || []).filter(r => r.type === 'Document').length;
        const extraDocDelta = Math.max(0, docExtraCount - rowsDocCount);
        pdItems += (m.itemCount || m.rows?.length || 0) + extraDocDelta;
        pdAmount += (m.totalAmount || 0) + (extraDocDelta * (m.config?.documentRate ?? globalConfig.documentRate ?? 5));
        if (m.folderId) pdFolderIds.add(m.folderId);
      }
    }

    for (const d of cloudManualDocEntries) {
      const ov = cloudOverrides[d.id];
      const dCount = ov?.dCount ?? d.docCount ?? 0;
      const dRate = d.documentRate ?? globalConfig.documentRate ?? 5;
      pdCount++;
      pdItems += dCount;
      pdAmount += dCount * dRate;
      if (d.folderId) pdFolderIds.add(d.folderId);
    }

    return {
      pCount,
      pdCount,
      pItems,
      pdItems,
      pAmount,
      pdAmount,
      pFolderCount: pFolderIds.size,
      pdFolderCount: pdFolderIds.size,
      totalManifests: cloudManifests.length + cloudManualDocEntries.length,
      totalItems: pItems + pdItems,
    };
  }, [cloudManifests, cloudOverrides, cloudManualDocEntries, globalConfig.documentRate]);

  // Overall and granular Cloud Storage Calculations
  const storageStats = useMemo(() => {
    let pManifestsBytes = 0;
    let pdManifestsBytes = 0;
    let totalManifestsBytes = 0;

    for (const m of cloudManifests) {
      const ov = cloudOverrides[m.id] || m.pdOverride;
      const bytes = computeManifestSizeBytes(m);
      totalManifestsBytes += bytes;
      if (getManifestSectionType(m, ov) === 'PD') {
        pdManifestsBytes += bytes;
      } else {
        pManifestsBytes += bytes;
      }
    }

    for (const d of cloudManualDocEntries) {
      let bytes = 256;
      try {
        bytes = new TextEncoder().encode(JSON.stringify(d)).length;
      } catch {}
      totalManifestsBytes += bytes;
      pdManifestsBytes += bytes;
    }

    let totalBackupsBytes = 0;
    const backupSizeMap: Record<string, number> = {};
    for (const b of cloudBackups) {
      const bytes = computeBackupSizeBytes(b);
      backupSizeMap[b.id] = bytes;
      totalBackupsBytes += bytes;
    }

    const totalFoldersBytes = localFolders.reduce((sum, f) => {
      try {
        return sum + new TextEncoder().encode(JSON.stringify(f)).length;
      } catch {
        return sum + 250;
      }
    }, 0);

    const overallCloudStorageBytes = totalManifestsBytes + totalBackupsBytes + totalFoldersBytes;
    const quotaBytes = 100 * 1024 * 1024; // 100 MB free cloud tier
    const percentUsedOfQuota = Math.min(100, Math.max(0.01, (overallCloudStorageBytes / quotaBytes) * 100));

    return {
      pManifestsBytes,
      pdManifestsBytes,
      totalManifestsBytes,
      totalBackupsBytes,
      totalFoldersBytes,
      overallCloudStorageBytes,
      backupSizeMap,
      quotaBytes,
      percentUsedOfQuota,
      formattedOverall: formatStorageBytes(overallCloudStorageBytes),
      formattedManifests: formatStorageBytes(totalManifestsBytes),
      formattedBackups: formatStorageBytes(totalBackupsBytes),
      formattedP: formatStorageBytes(pManifestsBytes),
      formattedPD: formatStorageBytes(pdManifestsBytes),
      formattedFolders: formatStorageBytes(totalFoldersBytes),
    };
  }, [cloudManifests, cloudBackups, localFolders, cloudOverrides, cloudManualDocEntries]);

  // Folder map for quick name resolution
  const folderNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of localFolders) {
      map.set(f.id, f.name);
    }
    return map;
  }, [localFolders]);

  // Filtered Cloud Items for Vault list
  const filteredCloudManifests = useMemo(() => {
    return cloudManifests.filter((m) => {
      const ov = cloudOverrides[m.id] || m.pdOverride;
      const section = getManifestSectionType(m, ov);
      if (itemSectionFilter === 'P' && section !== 'P') return false;
      if (itemSectionFilter === 'PD' && section !== 'PD') return false;

      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;
      const folderName = m.folderId ? (folderNameById.get(m.folderId) || '') : '';
      return (
        (m.manifestNo && m.manifestNo.toLowerCase().includes(q)) ||
        (m.manifestDate && m.manifestDate.toLowerCase().includes(q)) ||
        folderName.toLowerCase().includes(q)
      );
    });
  }, [cloudManifests, cloudOverrides, itemSectionFilter, searchQuery, folderNameById]);

  const filteredCloudManualDocs = useMemo(() => {
    if (itemSectionFilter === 'P' || itemSectionFilter === 'backups') return [];
    const q = searchQuery.toLowerCase().trim();
    return cloudManualDocEntries.filter((d) => {
      if (!q) return true;
      const folderName = d.folderId ? (folderNameById.get(d.folderId) || '') : '';
      return (
        (d.manifestNo && d.manifestNo.toLowerCase().includes(q)) ||
        (d.manifestDate && d.manifestDate.toLowerCase().includes(q)) ||
        (d.remarks && d.remarks.toLowerCase().includes(q)) ||
        folderName.toLowerCase().includes(q)
      );
    });
  }, [cloudManualDocEntries, itemSectionFilter, searchQuery, folderNameById]);

  const totalVaultCount = cloudManifests.length + cloudManualDocEntries.length;

  const handleCopyKey = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(channelKey);
      setCopiedKey(true);
      showNotification('Sync Channel Key copied to clipboard!');
      setTimeout(() => setCopiedKey(false), 2500);
    }
  };

  const handleExecuteSync = async (section: ManifestSectionType = 'ALL', mode: 'sync' | 'backup' = 'sync') => {
    if (activeSyncOp) return;

    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }

    const startText = mode === 'backup'
      ? (section === 'ALL' ? 'Connecting to Cloud Vault...' : `Connecting: Backing up ${section}...`)
      : (section === 'ALL' ? 'Connecting to Cloud Vault...' : `Connecting: Syncing ${section}...`);

    setActiveSyncOp({
      section,
      mode,
      percent: 8,
      stageText: startText,
      isComplete: false,
    });
    targetPercentRef.current = 24;

    // Smooth monotonic filler tick
    const interval = setInterval(() => {
      setActiveSyncOp((prev) => {
        if (!prev) return null;
        const target = targetPercentRef.current;
        if (prev.percent < target) {
          const delta = Math.max(0.8, (target - prev.percent) * 0.18);
          const nextVal = Math.min(target, prev.percent + delta);
          return { ...prev, percent: nextVal };
        }
        return prev;
      });
    }, 35);
    progressTimerRef.current = interval;

    // Phased simulated progression checkpoints for ultra-smooth optical feedback
    const timer1 = setTimeout(() => {
      targetPercentRef.current = Math.max(targetPercentRef.current, 54);
      setActiveSyncOp(prev => prev ? {
        ...prev,
        stageText: mode === 'backup' ? 'Uploading manifests to Cloud Vault...' : 'Downloading manifests from Cloud...'
      } : null);
    }, 400);

    const timer2 = setTimeout(() => {
      targetPercentRef.current = Math.max(targetPercentRef.current, 78);
      setActiveSyncOp(prev => prev ? {
        ...prev,
        stageText: mode === 'backup' ? 'Preserving folder hierarchy & snapshots...' : 'Deduplicating & merging local storage...'
      } : null);
    }, 850);

    const timer3 = setTimeout(() => {
      targetPercentRef.current = Math.max(targetPercentRef.current, 92);
      setActiveSyncOp(prev => prev ? {
        ...prev,
        stageText: mode === 'backup' ? 'Verifying cloud vault consistency...' : 'Updating local storage & IDB...'
      } : null);
    }, 1300);

    const onProgressCallback = (pct: number, step?: string) => {
      targetPercentRef.current = Math.max(targetPercentRef.current, pct);
      if (step) {
        setActiveSyncOp(prev => prev ? { ...prev, stageText: step } : null);
      }
    };

    try {
      await onSyncNow(section, mode, onProgressCallback);
      await onRefreshCloudData();

      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);

      targetPercentRef.current = 100;
      setActiveSyncOp(prev => prev ? {
        ...prev,
        percent: 100,
        isComplete: true,
        stageText: mode === 'backup' ? '✓ Backup Complete!' : '✓ Sync Complete!'
      } : null);

      await new Promise(r => setTimeout(r, 650));

      const label = section === 'P' ? 'P Manifest' : section === 'PD' ? 'P + D Manifest' : 'Entire Workspace';
      const actionText = mode === 'backup' ? 'backed up to cloud vault' : 'synchronized from cloud';
      showNotification(`✓ ${label} successfully ${actionText} with duplicate filtration!`);
    } catch (err: any) {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      showNotification(err?.message || 'Cloud operation error', 'error');
    } finally {
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      setActiveSyncOp(null);
    }
  };

  const handleBatchRestoreSelected = async () => {
    const selectedManifests = cloudManifests.filter(m => selectedCloudItemIds.includes(m.id));
    const selectedManualDocs = cloudManualDocEntries.filter(d => selectedCloudItemIds.includes(d.id));
    const totalCount = selectedManifests.length + selectedManualDocs.length;
    if (totalCount === 0) return;

    try {
      if (selectedManifests.length > 0) {
        if (onRestoreCloudManifests) {
          await onRestoreCloudManifests(selectedManifests, false);
        } else {
          onOpenManifest(selectedManifests[0]);
        }
      }
      if (selectedManualDocs.length > 0 && onRestoreCloudManualDocs) {
        await onRestoreCloudManualDocs(selectedManualDocs);
      }
      showNotification(`✓ Restored ${totalCount} item(s) & P+D Doc edits to local device storage!`);
      setSelectedCloudItemIds([]);
    } catch (e: any) {
      showNotification(e?.message || 'Failed to restore selected items', 'error');
    }
  };

  const handleBatchDeleteSelected = () => {
    if (selectedCloudItemIds.length === 0) return;
    setPendingAction({
      type: 'batch_delete',
      title: `Delete ${selectedCloudItemIds.length} Cloud Item(s)?`,
      message: `This will permanently remove the ${selectedCloudItemIds.length} selected item(s) from your Cloud Vault. Local copies on this device will remain untouched.`,
    });
  };

  const executePendingAction = async (backupRestoreMode?: 'merge' | 'replace') => {
    if (!pendingAction || isActionRunning) return;
    setIsActionRunning(true);
    try {
      if (pendingAction.type === 'restore_backup' && pendingAction.backup && onRestoreBackup) {
        const mode = backupRestoreMode || 'replace';
        await onRestoreBackup(pendingAction.backup, mode);
        showNotification(
          mode === 'merge'
            ? `✓ Merged workspace & P+D Doc edits from "${pendingAction.backup.name}"!`
            : `✓ Restored full workspace & P+D Doc edits from "${pendingAction.backup.name}"!`
        );
      } else if (pendingAction.type === 'delete_backup' && pendingAction.backup && onDeleteBackup) {
        await onDeleteBackup(pendingAction.backup.id, pendingAction.backup.cloudDocId);
        await onRefreshCloudData();
        showNotification(`✓ Deleted cloud backup "${pendingAction.backup.name}".`);
      } else if (pendingAction.type === 'delete_manifest' && pendingAction.manifest && onDeleteCloudManifest) {
        await onDeleteCloudManifest(pendingAction.manifest.id, pendingAction.manifest.cloudDocId);
        setSelectedCloudItemIds(prev => prev.filter(id => id !== pendingAction.manifest!.id));
        await onRefreshCloudData();
        showNotification(`✓ Removed Manifest #${pendingAction.manifest.manifestNo || 'Untitled'} from Cloud Vault.`);
      } else if (pendingAction.type === 'delete_manual_doc' && pendingAction.manualDoc && onDeleteCloudManualDoc) {
        await onDeleteCloudManualDoc(pendingAction.manualDoc.id);
        setSelectedCloudItemIds(prev => prev.filter(id => id !== pendingAction.manualDoc!.id));
        await onRefreshCloudData();
        showNotification(`✓ Removed Document Manifest (${pendingAction.manualDoc.manifestDate}) from Cloud Vault.`);
      } else if (pendingAction.type === 'batch_delete') {
        const manifestIdsToDelete = cloudManifests.filter(m => selectedCloudItemIds.includes(m.id));
        const manualDocIdsToDelete = cloudManualDocEntries.filter(d => selectedCloudItemIds.includes(d.id));
        for (const m of manifestIdsToDelete) {
          if (onDeleteCloudManifest) {
            await onDeleteCloudManifest(m.id, m.cloudDocId);
          }
        }
        for (const d of manualDocIdsToDelete) {
          if (onDeleteCloudManualDoc) {
            await onDeleteCloudManualDoc(d.id);
          }
        }
        const deletedTotal = manifestIdsToDelete.length + manualDocIdsToDelete.length;
        setSelectedCloudItemIds([]);
        await onRefreshCloudData();
        showNotification(`✓ Permanently deleted ${deletedTotal} item(s) from Cloud Vault.`);
      }
      setPendingAction(null);
    } catch (e: any) {
      showNotification(e?.message || 'Cloud operation failed. Please check connection and try again.', 'error');
    } finally {
      setIsActionRunning(false);
    }
  };

  const formatLastSync = (ts: number | null) => {
    if (!ts) return 'Never';
    const diff = Date.now() - ts;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-5 animate-in fade-in duration-300 font-inter">
      {/* Toast Notification */}
      {notificationMsg && (
        <div className="fixed top-5 right-5 z-50 animate-in slide-in-from-top-4 fade-in duration-200">
          <div className={`px-4 py-3 rounded-2xl shadow-2xl border flex items-center gap-3 text-xs font-bold ${
            notificationMsg.type === 'error'
              ? 'bg-rose-950 text-rose-200 border-rose-800'
              : notificationMsg.type === 'info'
              ? 'bg-indigo-950 text-indigo-200 border-indigo-800'
              : 'bg-emerald-950 text-emerald-200 border-emerald-700/70'
          }`}>
            <CheckCircleIcon className="h-4 w-4 shrink-0 text-emerald-400" />
            <span>{notificationMsg.text}</span>
            <button
              onClick={() => setNotificationMsg(null)}
              className="p-1 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white"
            >
              <XMarkIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Top Header matching Screenshot 1 */}
      <div className="bg-[#0b101e] dark:bg-[#090d19] border border-slate-800 rounded-3xl p-5 sm:p-7 text-white shadow-2xl relative overflow-hidden">
        {/* Glow accents */}
        <div className="absolute -top-12 -right-12 w-64 h-64 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-12 w-72 h-72 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            {/* Rounded Purple Squircle Icon */}
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-700 flex items-center justify-center shadow-lg shadow-indigo-600/30 shrink-0 border border-indigo-400/30">
              <CloudIcon className="h-7 w-7 text-white" />
            </div>

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-xl sm:text-2xl md:text-3xl font-black tracking-tight text-white">
                  Cloud Backup & Sync
                </h1>
                {/* Pill badge: Online / Offline status */}
                {cloudMeta.isOnline ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-950/80 text-emerald-400 border border-emerald-500/30">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
                    </span>
                    <span>Cloud Connected</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-950/80 text-amber-300 border border-amber-500/30" title="Auto-sync will resume when internet is restored">
                    <span className="h-2 w-2 rounded-full bg-amber-400"></span>
                    <span>Offline Mode (Local Storage Active)</span>
                  </span>
                )}

                {/* Pill badge: CLOUD STORAGE USED */}
                <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-950/90 text-indigo-300 border border-indigo-500/40 shadow-xs shadow-indigo-950/50">
                  <CircleStackIcon className="h-3 w-3 text-indigo-400 shrink-0" />
                  <span>Cloud Storage: {storageStats.formattedOverall}</span>
                </span>
              </div>

              <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
                {cloudMeta.isOnline
                  ? 'Safe storage and seamless cross-device synchronization with automatic duplicate filtration and exact folder preservation.'
                  : 'Internet is currently unavailable. All records are safely saved locally and will automatically sync to Cloud Vault once reconnected.'}
              </p>
            </div>
          </div>

          {onClose && (
            <button
              onClick={onClose}
              className="self-start md:self-center p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/10 transition-all cursor-pointer"
              aria-label="Close Cloud Manager"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* User Connection Bar (matching screenshot 1) */}
        <div className="relative z-10 mt-5 pt-4 border-t border-slate-800/90 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            {cloudMeta.isOnline ? (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
              </span>
            ) : (
              <span className="h-2 w-2 rounded-full bg-amber-400"></span>
            )}
            <span className="text-slate-400 font-medium">
              {cloudMeta.isOnline ? 'Connected with Cloud Channel:' : 'Cloud Channel (Offline):'}
            </span>
            <span className="font-mono font-black text-indigo-300 bg-slate-900/90 px-2.5 py-1 rounded-lg border border-slate-700 tracking-wider">
              {channelKey}
            </span>
            <div className="flex items-center gap-1.5 text-slate-300 bg-slate-900/90 px-2.5 py-1 rounded-lg border border-slate-700">
              <CircleStackIcon className="h-3 w-3 text-indigo-400" />
              <span className="text-slate-400">Storage Used:</span>
              <span className="font-mono font-black text-indigo-300">{storageStats.formattedOverall}</span>
              <span className="text-[10px] text-slate-400">({storageStats.percentUsedOfQuota.toFixed(1)}% of 100MB)</span>
            </div>
            <button
              type="button"
              onClick={() => setIsChangeKeyModalOpen(true)}
              className="px-2.5 py-1 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white rounded-lg border border-white/10 text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1"
            >
              <ArrowRightOnRectangleIcon className="h-3 w-3" />
              <span>Switch Channel</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyKey}
              className="px-3 py-1 bg-slate-800/80 hover:bg-slate-700 text-indigo-300 rounded-lg border border-slate-700 text-[11px] font-bold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
              title="Copy Sync Key"
            >
              <LockClosedIcon className="h-3.5 w-3.5 text-indigo-400" />
              <span className="font-mono">{channelKey.slice(0, 10)}...</span>
              {copiedKey ? <CheckIcon className="h-3.5 w-3.5 text-emerald-400" /> : <DocumentDuplicateIcon className="h-3.5 w-3.5" />}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('connect_keys')}
              className="px-3 py-1 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 rounded-lg border border-indigo-500/40 text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <LinkIcon className="h-3.5 w-3.5" />
              <span>Connect Code</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Tab Navigation Bar matching Screenshot 1 */}
      <div className="bg-[#0e1424] dark:bg-[#0b101c] border border-slate-800 rounded-2xl p-1.5 flex items-center gap-1 overflow-x-auto shadow-md select-none">
        <button
          type="button"
          onClick={() => setActiveTab('backup_sync')}
          className={`flex-1 min-w-[140px] py-2.5 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 ${
            activeTab === 'backup_sync'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <ArrowPathIcon className="h-4 w-4" />
          <span>Backup & Sync</span>
          <span className="px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold bg-black/40 text-indigo-200 border border-indigo-400/30 ml-0.5">
            {storageStats.formattedOverall}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('cloud_items')}
          className={`flex-1 min-w-[140px] py-2.5 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 ${
            activeTab === 'cloud_items'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <ServerStackIcon className="h-4 w-4" />
          <span>Cloud Items ({totalVaultCount})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('connect_keys')}
          className={`flex-1 min-w-[140px] py-2.5 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 ${
            activeTab === 'connect_keys'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <KeyIcon className="h-4 w-4" />
          <span>Sync Keys & Connect</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('connected_users')}
          className={`flex-1 min-w-[140px] py-2.5 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 ${
            activeTab === 'connected_users'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <ComputerDesktopIcon className="h-4 w-4" />
          <span>Connected Devices ({connectedDevices.length || 1})</span>
        </button>
      </div>

      {/* TAB 1: BACKUP & SYNC */}
      {activeTab === 'backup_sync' && (
        <div className="space-y-6">
          {/* Dual Overview Cards: LOCAL DEVICE vs CLOUD VAULT (Screenshot 1) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Card 1: LOCAL DEVICE */}
            <div className="bg-[#0b101e] dark:bg-[#090d19] border border-slate-800 rounded-3xl p-5 text-white shadow-xl flex flex-col justify-between relative overflow-hidden">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
                <div className="flex items-center gap-2.5">
                  <ComputerDesktopIcon className="h-5 w-5 text-indigo-400" />
                  <h3 className="text-sm font-black uppercase tracking-wider text-slate-200">Local Device</h3>
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-950 text-indigo-300 border border-indigo-800">
                  Current
                </span>
              </div>

              {/* 4 Stat Boxes */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 my-4">
                <div className="bg-[#060a14] p-3 rounded-2xl border border-slate-800/90 text-center">
                  <div className="text-xl sm:text-2xl font-black text-white">{localSectionStats.pCount}</div>
                  <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">P Manifests</div>
                </div>
                <div className="bg-[#060a14] p-3 rounded-2xl border border-slate-800/90 text-center">
                  <div className="text-xl sm:text-2xl font-black text-amber-400">{localSectionStats.pdCount}</div>
                  <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">P+D Manifests</div>
                </div>
                <div className="bg-[#060a14] p-3 rounded-2xl border border-slate-800/90 text-center">
                  <div className="text-xl sm:text-2xl font-black text-white">{localSectionStats.totalFolders}</div>
                  <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Folders</div>
                </div>
                <div className="bg-[#060a14] p-3 rounded-2xl border border-slate-800/90 text-center">
                  <div className="text-xl sm:text-2xl font-black text-emerald-400">{localSectionStats.totalConsignments}</div>
                  <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Consignments</div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between flex-wrap gap-2">
                <span>P: {localSectionStats.pItems} items • P+D: {localSectionStats.pdItems} items</span>
                <span className="font-bold text-slate-200">Total: ₹{(localSectionStats.totalAmount ?? 0).toLocaleString('en-IN')}</span>
              </div>
            </div>

            {/* Card 2: CLOUD VAULT */}
            <div className="bg-[#0b101e] dark:bg-[#090d19] border border-slate-800 rounded-3xl p-5 text-white shadow-xl flex flex-col justify-between relative overflow-hidden">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
                <div className="flex items-center gap-2.5">
                  <CloudIcon className="h-5 w-5 text-indigo-400" />
                  <h3 className="text-sm font-black uppercase tracking-wider text-slate-200">Cloud Vault</h3>
                </div>
                <button
                  type="button"
                  onClick={onRefreshCloudData}
                  className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/10 transition-colors cursor-pointer"
                  title="Refresh Cloud Vault"
                >
                  <ArrowPathIcon className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {/* 4 Stat Boxes */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 my-4">
                <div className="bg-[#060a14] p-3 rounded-2xl border border-slate-800/90 text-center">
                  <div className="text-xl sm:text-2xl font-black text-white">{cloudSectionStats.pCount}</div>
                  <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">P Manifests</div>
                </div>
                <div className="bg-[#060a14] p-3 rounded-2xl border border-slate-800/90 text-center">
                  <div className="text-xl sm:text-2xl font-black text-amber-400">{cloudSectionStats.pdCount}</div>
                  <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">P+D Manifests</div>
                </div>
                <div className="bg-[#060a14] p-3 rounded-2xl border border-slate-800/90 text-center">
                  <div className="text-xl sm:text-2xl font-black text-white">{localFolders.length}</div>
                  <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Folders</div>
                </div>
                <div className="bg-[#060a14] p-3 rounded-2xl border border-slate-800/90 text-center">
                  <div className="text-xl sm:text-2xl font-black text-indigo-400">{cloudSectionStats.totalItems}</div>
                  <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Consignments</div>
                </div>
              </div>

              {/* Dedicated Cloud Storage in Vault Card */}
              <div className="p-2.5 rounded-2xl bg-[#060a14] border border-indigo-900/60 flex items-center justify-between gap-3 text-xs mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-300 shrink-0">
                    <CircleStackIcon className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block tracking-wider leading-none">Cloud Storage Consumed</span>
                    <span className="text-sm font-black font-mono text-indigo-300">{storageStats.formattedOverall}</span>
                  </div>
                </div>
                <div className="text-[10px] text-slate-400 flex items-center gap-1.5 font-medium bg-slate-900/80 px-2.5 py-1 rounded-lg border border-slate-800">
                  <span>Vault: <strong className="text-white font-mono">{storageStats.formattedManifests}</strong></span>
                  <span>•</span>
                  <span>Backups: <strong className="text-purple-300 font-mono">{storageStats.formattedBackups}</strong></span>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between flex-wrap gap-2">
                <span>Total Vault Manifests: {cloudSectionStats.totalManifests}</span>
                <span className="flex items-center gap-1 font-medium">
                  <ClockIcon className="h-3.5 w-3.5 text-indigo-400" />
                  <span>Synced: {formatLastSync(cloudMeta.lastSyncTimestamp)}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Primary Action Buttons (matching Screenshot 1) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              type="button"
              disabled={isLoading || (activeSyncOp !== null)}
              onClick={() => handleExecuteSync('ALL', 'backup')}
              className={`relative overflow-hidden py-4 px-6 rounded-2xl font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2.5 shadow-xl transition-all cursor-pointer disabled:cursor-not-allowed min-h-[58px] ${
                activeSyncOp?.section === 'ALL' && activeSyncOp?.mode === 'backup'
                  ? 'bg-slate-900 dark:bg-slate-950 border-2 border-indigo-500 shadow-indigo-500/30'
                  : 'bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-700 hover:from-indigo-500 hover:to-purple-600 active:scale-98 text-white shadow-indigo-600/25 disabled:opacity-50'
              }`}
            >
              {activeSyncOp?.section === 'ALL' && activeSyncOp?.mode === 'backup' ? (
                <>
                  {/* Progression Filler Bar */}
                  <div
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500 transition-all duration-200 ease-out z-0"
                    style={{ width: `${Math.min(100, Math.max(0, activeSyncOp.percent))}%` }}
                  >
                    <div className="absolute inset-0 animate-progress-stripes opacity-35" />
                    <div className="absolute top-0 right-0 bottom-0 w-2 bg-white/80 shadow-[0_0_12px_rgba(255,255,255,0.9)]" />
                  </div>
                  {/* Progression Contents */}
                  <div className="relative z-10 flex items-center justify-between w-full">
                    <div className="flex items-center gap-2.5 text-left">
                      {activeSyncOp.isComplete ? (
                        <CheckCircleIcon className="h-5 w-5 text-emerald-300 shrink-0" />
                      ) : (
                        <CloudArrowUpIcon className="h-5 w-5 text-white animate-bounce shrink-0" />
                      )}
                      <div className="flex flex-col">
                        <span className="font-black text-xs sm:text-sm tracking-wide text-white drop-shadow-xs">
                          {activeSyncOp.isComplete ? 'Backup Complete!' : 'Backing up to Cloud...'}
                        </span>
                        <span className="text-[10px] font-medium text-white/90 normal-case drop-shadow-xs tracking-normal">
                          {activeSyncOp.stageText || 'Local Storage ➔ Cloud Vault'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="px-2.5 py-1 rounded-xl bg-black/60 backdrop-blur-md text-white font-mono font-black text-xs sm:text-sm border border-white/20 shadow-inner">
                        {Math.round(activeSyncOp.percent)}%
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <CloudArrowUpIcon className="h-5 w-5" />
                  <span>Backup to Cloud</span>
                </>
              )}
            </button>

            <button
              type="button"
              disabled={isLoading || (activeSyncOp !== null)}
              onClick={() => handleExecuteSync('ALL', 'sync')}
              className={`relative overflow-hidden py-4 px-6 rounded-2xl font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2.5 shadow-xl transition-all cursor-pointer disabled:cursor-not-allowed min-h-[58px] ${
                activeSyncOp?.section === 'ALL' && activeSyncOp?.mode === 'sync'
                  ? 'bg-slate-900 dark:bg-slate-950 border-2 border-emerald-500 shadow-emerald-500/30'
                  : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-98 text-white shadow-emerald-600/25 disabled:opacity-50'
              }`}
            >
              {activeSyncOp?.section === 'ALL' && activeSyncOp?.mode === 'sync' ? (
                <>
                  {/* Progression Filler Bar */}
                  <div
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-400 transition-all duration-200 ease-out z-0"
                    style={{ width: `${Math.min(100, Math.max(0, activeSyncOp.percent))}%` }}
                  >
                    <div className="absolute inset-0 animate-progress-stripes opacity-35" />
                    <div className="absolute top-0 right-0 bottom-0 w-2 bg-white/80 shadow-[0_0_12px_rgba(255,255,255,0.9)]" />
                  </div>
                  {/* Progression Contents */}
                  <div className="relative z-10 flex items-center justify-between w-full">
                    <div className="flex items-center gap-2.5 text-left">
                      {activeSyncOp.isComplete ? (
                        <CheckCircleIcon className="h-5 w-5 text-emerald-300 shrink-0" />
                      ) : (
                        <ArrowPathIcon className="h-5 w-5 text-white animate-spin shrink-0" />
                      )}
                      <div className="flex flex-col">
                        <span className="font-black text-xs sm:text-sm tracking-wide text-white drop-shadow-xs">
                          {activeSyncOp.isComplete ? 'Sync Complete!' : 'Syncing from Cloud...'}
                        </span>
                        <span className="text-[10px] font-medium text-white/90 normal-case drop-shadow-xs tracking-normal">
                          {activeSyncOp.stageText || 'Cloud Vault ➔ Local Storage'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="px-2.5 py-1 rounded-xl bg-black/60 backdrop-blur-md text-white font-mono font-black text-xs sm:text-sm border border-white/20 shadow-inner">
                        {Math.round(activeSyncOp.percent)}%
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <ArrowPathIcon className={`h-5 w-5 ${isLoading || cloudMeta.status === 'syncing' ? 'animate-spin' : ''}`} />
                  <span>Sync from Cloud</span>
                </>
              )}
            </button>
          </div>

          {/* DEDICATED SECTIONS: P Manifest Section & P + D Manifest Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <ShieldCheckIcon className="h-4 w-4 text-indigo-500" />
                  <span>Section-Wise Synchronizer & Deduplicator</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Each section backs up and synchronizes its manifests and folders to the same location, automatically filtering out duplicate records.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* SECTION 1: P MANIFEST */}
              <div className="bg-white dark:bg-[#0b101e] border border-indigo-100 dark:border-slate-800 rounded-3xl p-5 shadow-md flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/80 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-black text-xs">
                        P
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-slate-900 dark:text-white">P Manifest Section</h4>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">Single parcel manifests and folders</p>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                      {localSectionStats.pCount} Manifests
                    </span>
                  </div>

                  {/* Section Stats Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 my-4">
                    <div className="bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded-xl border border-slate-200/70 dark:border-slate-800 text-center">
                      <span className="text-[10px] font-bold text-slate-400 block uppercase">Local</span>
                      <span className="text-base font-black text-slate-900 dark:text-white">{localSectionStats.pCount}</span>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded-xl border border-slate-200/70 dark:border-slate-800 text-center">
                      <span className="text-[10px] font-bold text-slate-400 block uppercase">Cloud</span>
                      <span className="text-base font-black text-indigo-600 dark:text-indigo-400">{cloudSectionStats.pCount}</span>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded-xl border border-slate-200/70 dark:border-slate-800 text-center">
                      <span className="text-[10px] font-bold text-slate-400 block uppercase">Folders</span>
                      <span className="text-base font-black text-slate-900 dark:text-white">{localSectionStats.pFolderCount}</span>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded-xl border border-slate-200/70 dark:border-slate-800 text-center">
                      <span className="text-[10px] font-bold text-slate-400 block uppercase">Storage</span>
                      <span className="text-base font-mono font-black text-indigo-600 dark:text-indigo-400">{storageStats.formattedP}</span>
                    </div>
                  </div>

                  {/* Deduplication Status Pill */}
                  <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 flex items-center gap-2 text-[11px] font-medium text-emerald-800 dark:text-emerald-300 mb-4">
                    <ShieldCheckIcon className="h-4 w-4 shrink-0 text-emerald-500" />
                    <span>Duplicate filtration active: Merges matching manifest # & dates.</span>
                  </div>
                </div>

                {/* Section Action Buttons */}
                <div className="grid grid-cols-2 gap-2 pt-2 min-h-[44px]">
                  <button
                    type="button"
                    disabled={isLoading || (activeSyncOp !== null)}
                    onClick={() => handleExecuteSync('P', 'backup')}
                    className={`relative overflow-hidden py-2.5 px-3 rounded-xl text-[11px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:cursor-not-allowed ${
                      activeSyncOp?.section === 'P' && activeSyncOp?.mode === 'backup'
                        ? 'bg-slate-950 border border-indigo-500 text-white shadow-md shadow-indigo-500/20'
                        : 'bg-slate-900 dark:bg-slate-800 hover:bg-black dark:hover:bg-slate-700 text-white disabled:opacity-50'
                    }`}
                  >
                    {activeSyncOp?.section === 'P' && activeSyncOp?.mode === 'backup' ? (
                      <>
                        <div
                          className="absolute inset-y-0 left-0 bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-500 transition-all duration-200 ease-out z-0"
                          style={{ width: `${Math.min(100, Math.max(0, activeSyncOp.percent))}%` }}
                        >
                          <div className="absolute inset-0 animate-progress-stripes opacity-30" />
                          <div className="absolute top-0 right-0 bottom-0 w-1 bg-white shadow-[0_0_8px_rgba(255,255,255,0.9)]" />
                        </div>
                        <div className="relative z-10 flex items-center justify-between w-full">
                          <div className="flex items-center gap-1.5 truncate">
                            {activeSyncOp.isComplete ? (
                              <CheckCircleIcon className="h-3.5 w-3.5 text-emerald-300 shrink-0" />
                            ) : (
                              <CloudArrowUpIcon className="h-3.5 w-3.5 text-white animate-bounce shrink-0" />
                            )}
                            <span className="truncate">{activeSyncOp.isComplete ? 'P Done' : 'Backing up P'}</span>
                          </div>
                          <span className="px-1.5 py-0.5 rounded bg-black/60 text-white font-mono font-black text-[10px] border border-white/20 ml-1 shrink-0">
                            {Math.round(activeSyncOp.percent)}%
                          </span>
                        </div>
                      </>
                    ) : (
                      <>
                        <CloudArrowUpIcon className="h-3.5 w-3.5 text-indigo-400" />
                        <span>Backup P</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    disabled={isLoading || (activeSyncOp !== null)}
                    onClick={() => handleExecuteSync('P', 'sync')}
                    className={`relative overflow-hidden py-2.5 px-3 rounded-xl text-[11px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:cursor-not-allowed ${
                      activeSyncOp?.section === 'P' && activeSyncOp?.mode === 'sync'
                        ? 'bg-slate-950 border border-emerald-500 text-white shadow-md shadow-emerald-500/20'
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50'
                    }`}
                  >
                    {activeSyncOp?.section === 'P' && activeSyncOp?.mode === 'sync' ? (
                      <>
                        <div
                          className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-400 transition-all duration-200 ease-out z-0"
                          style={{ width: `${Math.min(100, Math.max(0, activeSyncOp.percent))}%` }}
                        >
                          <div className="absolute inset-0 animate-progress-stripes opacity-30" />
                          <div className="absolute top-0 right-0 bottom-0 w-1 bg-white shadow-[0_0_8px_rgba(255,255,255,0.9)]" />
                        </div>
                        <div className="relative z-10 flex items-center justify-between w-full">
                          <div className="flex items-center gap-1.5 truncate">
                            {activeSyncOp.isComplete ? (
                              <CheckCircleIcon className="h-3.5 w-3.5 text-emerald-300 shrink-0" />
                            ) : (
                              <ArrowPathIcon className="h-3.5 w-3.5 text-white animate-spin shrink-0" />
                            )}
                            <span className="truncate">{activeSyncOp.isComplete ? 'P Done' : 'Syncing P'}</span>
                          </div>
                          <span className="px-1.5 py-0.5 rounded bg-black/60 text-white font-mono font-black text-[10px] border border-white/20 ml-1 shrink-0">
                            {Math.round(activeSyncOp.percent)}%
                          </span>
                        </div>
                      </>
                    ) : (
                      <>
                        <ArrowPathIcon className="h-3.5 w-3.5" />
                        <span>Sync P</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* SECTION 2: P + D MANIFEST */}
              <div className="bg-white dark:bg-[#0b101e] border border-amber-100 dark:border-slate-800 rounded-3xl p-5 shadow-md flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/80 border border-amber-200 dark:border-amber-800 flex items-center justify-center text-amber-600 dark:text-amber-400 font-black text-xs">
                        P+D
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-slate-900 dark:text-white">P + D Manifest Section</h4>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">Parcel and document manifests & folders</p>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                      {localSectionStats.pdCount} Manifests
                    </span>
                  </div>

                  {/* Section Stats Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 my-4">
                    <div className="bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded-xl border border-slate-200/70 dark:border-slate-800 text-center">
                      <span className="text-[10px] font-bold text-slate-400 block uppercase">Local</span>
                      <span className="text-base font-black text-slate-900 dark:text-white">{localSectionStats.pdCount}</span>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded-xl border border-slate-200/70 dark:border-slate-800 text-center">
                      <span className="text-[10px] font-bold text-slate-400 block uppercase">Cloud</span>
                      <span className="text-base font-black text-amber-500">{cloudSectionStats.pdCount}</span>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded-xl border border-slate-200/70 dark:border-slate-800 text-center">
                      <span className="text-[10px] font-bold text-slate-400 block uppercase">Folders</span>
                      <span className="text-base font-black text-slate-900 dark:text-white">{localSectionStats.pdFolderCount}</span>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded-xl border border-slate-200/70 dark:border-slate-800 text-center">
                      <span className="text-[10px] font-bold text-slate-400 block uppercase">Storage</span>
                      <span className="text-base font-mono font-black text-amber-500">{storageStats.formattedPD}</span>
                    </div>
                  </div>

                  {/* Folder Preservation Status Pill */}
                  <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 flex items-center gap-2 text-[11px] font-medium text-amber-800 dark:text-amber-300 mb-4">
                    <FolderIcon className="h-4 w-4 shrink-0 text-amber-500" />
                    <span>Exact folder synchronization: Retains folder structure in cloud & local.</span>
                  </div>
                </div>

                {/* Section Action Buttons */}
                <div className="grid grid-cols-2 gap-2 pt-2 min-h-[44px]">
                  <button
                    type="button"
                    disabled={isLoading || (activeSyncOp !== null)}
                    onClick={() => handleExecuteSync('PD', 'backup')}
                    className={`relative overflow-hidden py-2.5 px-3 rounded-xl text-[11px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:cursor-not-allowed ${
                      activeSyncOp?.section === 'PD' && activeSyncOp?.mode === 'backup'
                        ? 'bg-slate-950 border border-amber-500 text-white shadow-md shadow-amber-500/20'
                        : 'bg-slate-900 dark:bg-slate-800 hover:bg-black dark:hover:bg-slate-700 text-white disabled:opacity-50'
                    }`}
                  >
                    {activeSyncOp?.section === 'PD' && activeSyncOp?.mode === 'backup' ? (
                      <>
                        <div
                          className="absolute inset-y-0 left-0 bg-gradient-to-r from-amber-600 via-orange-500 to-amber-400 transition-all duration-200 ease-out z-0"
                          style={{ width: `${Math.min(100, Math.max(0, activeSyncOp.percent))}%` }}
                        >
                          <div className="absolute inset-0 animate-progress-stripes opacity-30" />
                          <div className="absolute top-0 right-0 bottom-0 w-1 bg-white shadow-[0_0_8px_rgba(255,255,255,0.9)]" />
                        </div>
                        <div className="relative z-10 flex items-center justify-between w-full">
                          <div className="flex items-center gap-1.5 truncate">
                            {activeSyncOp.isComplete ? (
                              <CheckCircleIcon className="h-3.5 w-3.5 text-emerald-300 shrink-0" />
                            ) : (
                              <CloudArrowUpIcon className="h-3.5 w-3.5 text-white animate-bounce shrink-0" />
                            )}
                            <span className="truncate">{activeSyncOp.isComplete ? 'P+D Done' : 'Backing up P+D'}</span>
                          </div>
                          <span className="px-1.5 py-0.5 rounded bg-black/60 text-white font-mono font-black text-[10px] border border-white/20 ml-1 shrink-0">
                            {Math.round(activeSyncOp.percent)}%
                          </span>
                        </div>
                      </>
                    ) : (
                      <>
                        <CloudArrowUpIcon className="h-3.5 w-3.5 text-amber-400" />
                        <span>Backup P+D</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    disabled={isLoading || (activeSyncOp !== null)}
                    onClick={() => handleExecuteSync('PD', 'sync')}
                    className={`relative overflow-hidden py-2.5 px-3 rounded-xl text-[11px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:cursor-not-allowed ${
                      activeSyncOp?.section === 'PD' && activeSyncOp?.mode === 'sync'
                        ? 'bg-slate-950 border border-teal-500 text-white shadow-md shadow-teal-500/20'
                        : 'bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50'
                    }`}
                  >
                    {activeSyncOp?.section === 'PD' && activeSyncOp?.mode === 'sync' ? (
                      <>
                        <div
                          className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-400 transition-all duration-200 ease-out z-0"
                          style={{ width: `${Math.min(100, Math.max(0, activeSyncOp.percent))}%` }}
                        >
                          <div className="absolute inset-0 animate-progress-stripes opacity-30" />
                          <div className="absolute top-0 right-0 bottom-0 w-1 bg-white shadow-[0_0_8px_rgba(255,255,255,0.9)]" />
                        </div>
                        <div className="relative z-10 flex items-center justify-between w-full">
                          <div className="flex items-center gap-1.5 truncate">
                            {activeSyncOp.isComplete ? (
                              <CheckCircleIcon className="h-3.5 w-3.5 text-emerald-300 shrink-0" />
                            ) : (
                              <ArrowPathIcon className="h-3.5 w-3.5 text-white animate-spin shrink-0" />
                            )}
                            <span className="truncate">{activeSyncOp.isComplete ? 'P+D Done' : 'Syncing P+D'}</span>
                          </div>
                          <span className="px-1.5 py-0.5 rounded bg-black/60 text-white font-mono font-black text-[10px] border border-white/20 ml-1 shrink-0">
                            {Math.round(activeSyncOp.percent)}%
                          </span>
                        </div>
                      </>
                    ) : (
                      <>
                        <ArrowPathIcon className="h-3.5 w-3.5" />
                        <span>Sync P+D</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Auto Cloud Backup Toggle Card (matching Screenshot 1 bottom) */}
          <div className="bg-[#0b101e] dark:bg-[#090d19] border border-slate-800 rounded-3xl p-5 text-white shadow-xl flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
                <SparklesIcon className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-sm font-black text-white">Auto Cloud Backup</h4>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                    cloudMeta.autoSyncEnabled
                      ? 'bg-emerald-950 text-emerald-400 border-emerald-700/70'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}>
                    {cloudMeta.autoSyncEnabled ? 'ON' : 'OFF'}
                  </span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-950 text-purple-300 border border-purple-800/70">
                    <CircleStackIcon className="h-3 w-3 text-purple-400" />
                    <span>{storageStats.formattedBackups} in Cloud ({cloudBackups.length} snapshots)</span>
                  </span>
                </div>
                <p className="text-xs text-slate-400">Automatically sync updates to your cloud vault when manifests are edited • Consuming {storageStats.formattedBackups} in cloud storage</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                const next = !cloudMeta.autoSyncEnabled;
                onToggleAutoSync(next);
                showNotification(`Auto Cloud Backup turned ${next ? 'ON' : 'OFF'}`);
              }}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                cloudMeta.autoSyncEnabled ? 'bg-emerald-500' : 'bg-slate-700'
              }`}
              aria-label="Toggle Auto Cloud Backup"
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  cloudMeta.autoSyncEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* OVERALL CLOUD STORAGE CONSUMED DASHBOARD (Div Component) */}
          <div className="bg-[#0b101e] dark:bg-[#090d19] border border-slate-800 rounded-3xl p-5 sm:p-6 text-white shadow-xl relative overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-800 flex items-center justify-center text-white shadow-lg shadow-indigo-600/30 shrink-0 border border-indigo-400/30">
                  <CircleStackIcon className="h-6 w-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-black uppercase tracking-wider text-white">
                      Overall Cloud Storage Consumed
                    </h3>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-950 text-emerald-400 border border-emerald-800">
                      Live Telemetry
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Total footprint across Cloud Manifest Vault, Auto Cloud Backup Archives, and Folder Meta
                  </p>
                </div>
              </div>

              <div className="flex items-baseline gap-2 bg-slate-900/90 px-4 py-2.5 rounded-2xl border border-slate-700/80 shadow-inner shrink-0">
                <span className="text-2xl sm:text-3xl font-black text-indigo-300 font-mono tracking-tight">
                  {storageStats.formattedOverall}
                </span>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">consumed</span>
              </div>
            </div>

            {/* Storage Progress & Ratio */}
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between text-xs font-medium text-slate-300">
                <span>Cloud Allocation Breakdown</span>
                <span className="font-mono text-indigo-300 font-bold">
                  {storageStats.percentUsedOfQuota.toFixed(2)}% of 100 MB Cloud Tier
                </span>
              </div>
              <div className="h-3.5 w-full bg-slate-950 rounded-full overflow-hidden flex p-0.5 border border-slate-800">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-blue-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.max(4, (storageStats.totalManifestsBytes / Math.max(1, storageStats.overallCloudStorageBytes)) * 100)}%` }}
                  title={`Manifest Vault: ${storageStats.formattedManifests}`}
                />
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-500 ml-0.5"
                  style={{ width: `${Math.max(4, (storageStats.totalBackupsBytes / Math.max(1, storageStats.overallCloudStorageBytes)) * 100)}%` }}
                  title={`Cloud Backup Archives: ${storageStats.formattedBackups}`}
                />
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full transition-all duration-500 ml-0.5"
                  style={{ width: `${Math.max(2, (storageStats.totalFoldersBytes / Math.max(1, storageStats.overallCloudStorageBytes)) * 100)}%` }}
                  title={`Folder Metadata: ${storageStats.formattedFolders}`}
                />
              </div>
            </div>

            {/* Sub-division Storage Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
              <div className="bg-[#060a14] p-3.5 rounded-2xl border border-slate-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 inline-block shadow-xs shadow-indigo-500" />
                    <span className="text-xs font-bold text-slate-200">Manifest Cloud Vault</span>
                  </div>
                  <span className="text-xs font-mono font-black text-indigo-400">{storageStats.formattedManifests}</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-2 flex items-center justify-between">
                  <span>{cloudManifests.length} manifest documents</span>
                  <span className="font-mono text-slate-300 font-semibold">P: {storageStats.formattedP} • P+D: {storageStats.formattedPD}</span>
                </div>
              </div>

              <div className="bg-[#060a14] p-3.5 rounded-2xl border border-slate-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block shadow-xs shadow-purple-500" />
                    <span className="text-xs font-bold text-slate-200">Auto Cloud Backup Archives</span>
                  </div>
                  <span className="text-xs font-mono font-black text-purple-400">{storageStats.formattedBackups}</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-2 flex items-center justify-between">
                  <span>{cloudBackups.length} cloud snapshots</span>
                  <span className="font-mono text-slate-300 font-semibold">
                    Avg {cloudBackups.length > 0 ? formatStorageBytes(Math.round(storageStats.totalBackupsBytes / cloudBackups.length)) : '0 B'}/backup
                  </span>
                </div>
              </div>

              <div className="bg-[#060a14] p-3.5 rounded-2xl border border-slate-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block shadow-xs shadow-amber-500" />
                    <span className="text-xs font-bold text-slate-200">Folder Structure Meta</span>
                  </div>
                  <span className="text-xs font-mono font-black text-amber-400">{storageStats.formattedFolders}</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-2 flex items-center justify-between">
                  <span>{localFolders.length} synchronized folders</span>
                  <span className="text-emerald-400 font-bold">Encrypted JSON</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CLOUD ITEMS (N) (matching Screenshot 2) */}
      {activeTab === 'cloud_items' && (
        <div className="space-y-4">
          {/* Sub-Filter Pills matching Screenshot 2 */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 select-none">
            <button
              type="button"
              onClick={() => setItemSectionFilter('all')}
              className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer ${
                itemSectionFilter === 'all'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-white'
              }`}
            >
              All ({totalVaultCount})
            </button>

            <button
              type="button"
              onClick={() => setItemSectionFilter('P')}
              className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer ${
                itemSectionFilter === 'P'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-white'
              }`}
            >
              P Manifest ({cloudSectionStats.pCount})
            </button>

            <button
              type="button"
              onClick={() => setItemSectionFilter('PD')}
              className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer ${
                itemSectionFilter === 'PD'
                  ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-white'
              }`}
            >
              P + D Manifest ({cloudSectionStats.pdCount})
            </button>

            <button
              type="button"
              onClick={() => setItemSectionFilter('backups')}
              className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                itemSectionFilter === 'backups'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-white'
              }`}
            >
              <CircleStackIcon className="h-3.5 w-3.5 text-purple-300" />
              <span>Cloud Archives ({cloudBackups.length})</span>
              <span className="px-1.5 py-0.5 rounded-full bg-purple-950/80 text-[10px] font-mono font-bold text-purple-200 border border-purple-700/60 ml-0.5">
                {storageStats.formattedBackups}
              </span>
            </button>
          </div>

          {/* Search bar & Selection Bar */}
          <div className="bg-white dark:bg-[#0b101e] border border-slate-200 dark:border-slate-800 rounded-2xl p-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-xs">
            <div className="relative flex-1">
              <MagnifyingGlassIcon className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search cloud vault items..."
                className="w-full pl-10 pr-8 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                >
                  <XMarkIcon className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {selectedCloudItemIds.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={handleBatchRestoreSelected}
                    className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black rounded-xl transition-colors cursor-pointer"
                  >
                    Restore ({selectedCloudItemIds.length})
                  </button>
                  <button
                    type="button"
                    onClick={handleBatchDeleteSelected}
                    className="px-3 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-black rounded-xl transition-colors cursor-pointer"
                  >
                    Delete ({selectedCloudItemIds.length})
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={onRefreshCloudData}
                className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-white border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                title="Refresh Vault Items"
              >
                <ArrowPathIcon className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Cloud Items Cards List matching Screenshot 2 */}
          <div className="space-y-3">
            {/* If Backups Filter Selected */}
            {itemSectionFilter === 'backups' ? (
              <>
                {cloudBackups.map((b) => (
                  <div
                    key={b.id}
                    className="bg-[#0b101e] border border-purple-500/40 hover:border-purple-400 rounded-2xl p-4 sm:p-5 transition-all shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-purple-950 text-purple-300 border border-purple-700">
                          Cloud Backup Archive
                        </span>
                        <span className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                          {b.createdAt
                            ? `${new Date(b.createdAt).toLocaleDateString()} ${new Date(b.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                            : 'Saved Snapshot'}
                        </span>
                        {/* Storage consumed badge in each backup division */}
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-mono font-black uppercase tracking-wider bg-purple-900/60 text-purple-200 border border-purple-500/50 shadow-xs">
                          <CircleStackIcon className="h-3 w-3 text-purple-300" />
                          <span>Storage: {formatStorageBytes(storageStats.backupSizeMap[b.id] || computeBackupSizeBytes(b))}</span>
                        </span>
                      </div>
                      <h4 className="text-sm sm:text-base font-black text-white truncate">
                        {b.name || 'Cloud Backup Snapshot'}
                      </h4>
                      <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span>{b.manifestCount ?? b.data?.manifests?.length ?? 0} Manifests</span>
                        <span>•</span>
                        <span>{b.folderCount ?? b.data?.folders?.length ?? 0} Folders</span>
                        <span>•</span>
                        <span className="font-bold text-slate-200">Total: ₹{Number(b.totalAmount ?? 0).toLocaleString('en-IN')}</span>
                        <span>•</span>
                        <span className="font-mono font-bold text-purple-300 flex items-center gap-1">
                          <CircleStackIcon className="h-3 w-3 text-purple-400" />
                          <span>{formatStorageBytes(storageStats.backupSizeMap[b.id] || computeBackupSizeBytes(b))} in Cloud</span>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      {onRestoreBackup && (
                        <button
                          type="button"
                          disabled={isActionRunning || isLoading}
                          onClick={() => {
                            setPendingAction({
                              type: 'restore_backup',
                              title: 'Restore Cloud Backup?',
                              message: `Choose how to restore "${b.name || 'Cloud Backup Snapshot'}" (${b.manifestCount ?? b.data?.manifests?.length ?? 0} manifests, ${(b.data?.manualDocEntries || []).length} doc entries, ${b.folderCount ?? b.data?.folders?.length ?? 0} folders). All P+D Doc section & edited quantities will also be restored.`,
                              backup: b,
                            });
                          }}
                          className="px-3.5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-md transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                        >
                          <ArrowPathIcon className="h-4 w-4" />
                          <span>Restore</span>
                        </button>
                      )}
                      {onDeleteBackup && (
                        <button
                          type="button"
                          disabled={isActionRunning || isLoading}
                          onClick={() => {
                            setPendingAction({
                              type: 'delete_backup',
                              title: 'Delete Cloud Backup?',
                              message: `Permanently delete backup snapshot "${b.name}" from Cloud Archives?`,
                              backup: b,
                            });
                          }}
                          className="p-2 rounded-xl bg-slate-800 hover:bg-rose-950/70 text-slate-400 hover:text-rose-400 border border-slate-700 transition-colors cursor-pointer disabled:opacity-50"
                          title="Delete Backup"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {cloudBackups.length === 0 && (
                  <div className="text-center py-12 bg-white dark:bg-[#0b101e] rounded-3xl border border-slate-200 dark:border-slate-800 p-8">
                    <CloudIcon className="h-10 w-10 text-slate-400 mx-auto mb-2" />
                    <h4 className="text-sm font-black text-slate-900 dark:text-white">No Cloud Backups Yet</h4>
                    <p className="text-xs text-slate-400 mt-1">
                      Click 'Backup to Cloud' on the Backup & Sync tab to create an automatic cloud backup.
                    </p>
                  </div>
                )}
              </>
            ) : (
              <>
                {/* 1. Manifests List */}
                {filteredCloudManifests.map((m) => {
              const isSelected = selectedCloudItemIds.includes(m.id);
              const ov = cloudOverrides[m.id] || m.pdOverride;
              const section = getManifestSectionType(m, ov);
              const folderName = m.folderId ? folderNameById.get(m.folderId) : undefined;
              const effectiveDocCount = ov?.dCount ?? (m.rows ? m.rows.filter(r => r.type === 'Document').length : 0);

              return (
                <div
                  key={m.id}
                  className={`bg-[#0b101e] border rounded-2xl p-4 sm:p-5 transition-all shadow-md relative group flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                    section === 'P'
                      ? 'border-indigo-500/40 hover:border-indigo-400'
                      : 'border-amber-500/50 hover:border-amber-400'
                  }`}
                >
                  <div className="flex items-start gap-3.5 flex-1 min-w-0">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedCloudItemIds(prev => [...prev, m.id]);
                        } else {
                          setSelectedCloudItemIds(prev => prev.filter(id => id !== m.id));
                        }
                      }}
                      className="mt-1 h-4 w-4 rounded border-slate-600 text-indigo-600 focus:ring-indigo-500 bg-slate-800 cursor-pointer"
                    />

                    <div className="space-y-1.5 min-w-0 flex-1">
                      {/* Top Badges */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider ${
                          section === 'P'
                            ? 'bg-indigo-950 text-indigo-300 border border-indigo-700'
                            : 'bg-amber-950 text-amber-300 border border-amber-700'
                        }`}>
                          {section === 'P' ? 'P Manifest' : 'P + D Manifest'}
                        </span>

                        {effectiveDocCount > 0 && (
                          <span className="px-2 py-0.5 rounded-md text-[9px] font-black bg-emerald-950 text-emerald-300 border border-emerald-700/70 flex items-center gap-1">
                            <DocumentTextIcon className="h-3 w-3" />
                            <span>Docs: {effectiveDocCount}</span>
                          </span>
                        )}

                        {folderName && (
                          <span className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1 truncate max-w-[150px]">
                            <FolderIcon className="h-3 w-3 text-slate-400 shrink-0" />
                            <span className="truncate">{folderName}</span>
                          </span>
                        )}

                        <span className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-slate-800/80 text-emerald-400 border border-emerald-900/60 flex items-center gap-1">
                          <CloudIcon className="h-3 w-3" />
                          <span>Cloud Vault</span>
                        </span>

                        <span className="px-2 py-0.5 rounded-md text-[9px] font-mono font-bold bg-slate-800 text-indigo-300 border border-slate-700 flex items-center gap-1">
                          <CircleStackIcon className="h-3 w-3 text-indigo-400" />
                          <span>{formatStorageBytes(computeManifestSizeBytes(m))}</span>
                        </span>
                      </div>

                      {/* Main Title */}
                      <h4 className="text-sm sm:text-base font-black text-white truncate">
                        {ov?.no || m.manifestNo ? `Manifest #${ov?.no || m.manifestNo}` : 'Untitled Manifest'}
                        <span className="text-xs font-normal text-slate-400 ml-2">
                          ({m.itemCount || m.rows?.length || 0} Consignments{effectiveDocCount > 0 ? ` • ${effectiveDocCount} Docs` : ''})
                        </span>
                      </h4>

                      {/* Subtitle / Details Line */}
                      <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span>Date: {ov?.date || m.manifestDate || 'N/A'}</span>
                        <span>•</span>
                        <span className="font-bold text-slate-200">Total: ₹{Number(m.totalAmount ?? 0).toLocaleString('en-IN')}</span>
                        <span>•</span>
                        <span className="text-emerald-400 flex items-center gap-1">
                          <CheckCircleIcon className="h-3.5 w-3.5" />
                          <span>Ready to Sync</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions on right matching Screenshot 2 */}
                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    <button
                      type="button"
                      disabled={isActionRunning || isLoading}
                      onClick={async () => {
                        if (onRestoreCloudManifests) {
                          await onRestoreCloudManifests([m], false);
                        } else {
                          onOpenManifest(m);
                        }
                        showNotification(`✓ Synced Manifest #${ov?.no || m.manifestNo || 'Untitled'}${effectiveDocCount > 0 ? ` (Docs: ${effectiveDocCount})` : ''} to device!`);
                      }}
                      className="px-3 py-2 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-md transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <CloudArrowDownIcon className="h-4 w-4" />
                      <span>Sync to Device</span>
                    </button>

                    {onDeleteCloudManifest && (
                      <button
                        type="button"
                        disabled={isActionRunning || isLoading}
                        onClick={() => {
                          setPendingAction({
                            type: 'delete_manifest',
                            title: 'Delete Cloud Manifest?',
                            message: `Permanently remove Manifest #${m.manifestNo || 'Untitled'} (${m.manifestDate || 'N/A'}) from Cloud Vault?`,
                            manifest: m,
                          });
                        }}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-rose-950/70 text-slate-400 hover:text-rose-400 border border-slate-700 transition-colors cursor-pointer disabled:opacity-50"
                        title="Delete from Cloud"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {/* 2. Standalone P + D Manual Document Manifest Entries */}
            {filteredCloudManualDocs.map((d) => {
              const isSelected = selectedCloudItemIds.includes(d.id);
              const ov = cloudOverrides[d.id];
              const dCount = ov?.dCount ?? d.docCount ?? 0;
              const dRate = d.documentRate ?? globalConfig.documentRate ?? 5;
              const dAmount = dCount * dRate;
              const folderName = d.folderId ? folderNameById.get(d.folderId) : undefined;

              return (
                <div
                  key={d.id}
                  className="bg-[#0b101e] border border-emerald-500/40 hover:border-emerald-400 rounded-2xl p-4 sm:p-5 transition-all shadow-md relative group flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-3.5 flex-1 min-w-0">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedCloudItemIds(prev => [...prev, d.id]);
                        } else {
                          setSelectedCloudItemIds(prev => prev.filter(id => id !== d.id));
                        }
                      }}
                      className="mt-1 h-4 w-4 rounded border-slate-600 text-indigo-600 focus:ring-indigo-500 bg-slate-800 cursor-pointer"
                    />

                    <div className="space-y-1.5 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-amber-950 text-amber-300 border border-amber-700">
                          P + D Manifest
                        </span>
                        <span className="px-2 py-0.5 rounded-md text-[9px] font-black bg-emerald-950 text-emerald-300 border border-emerald-700/70 flex items-center gap-1">
                          <DocumentTextIcon className="h-3 w-3" />
                          <span>Doc Section • {dCount} Docs</span>
                        </span>
                        {folderName && (
                          <span className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1 truncate max-w-[150px]">
                            <FolderIcon className="h-3 w-3 text-slate-400 shrink-0" />
                            <span className="truncate">{folderName}</span>
                          </span>
                        )}
                      </div>

                      <h4 className="text-sm sm:text-base font-black text-white truncate">
                        {ov?.no || d.manifestNo || 'Doc Only'}
                        <span className="text-xs font-normal text-slate-400 ml-2">
                          ({dCount} Documents @ ₹{dRate})
                        </span>
                      </h4>

                      <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span>Date: {ov?.date || d.manifestDate || 'N/A'}</span>
                        <span>•</span>
                        <span className="font-bold text-slate-200">Total: ₹{Number(dAmount ?? 0).toLocaleString('en-IN')}</span>
                        {d.remarks && (
                          <>
                            <span>•</span>
                            <span className="text-slate-300 italic truncate max-w-[200px]">{d.remarks}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    {onRestoreCloudManualDocs && (
                      <button
                        type="button"
                        disabled={isActionRunning || isLoading}
                        onClick={async () => {
                          await onRestoreCloudManualDocs([d]);
                          showNotification(`✓ Synced Document Manifest (${ov?.date || d.manifestDate}) with ${dCount} Docs to device!`);
                        }}
                        className="px-3 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-md transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <CloudArrowDownIcon className="h-4 w-4" />
                        <span>Sync to Device</span>
                      </button>
                    )}

                    {onDeleteCloudManualDoc && (
                      <button
                        type="button"
                        disabled={isActionRunning || isLoading}
                        onClick={() => {
                          setPendingAction({
                            type: 'delete_manual_doc',
                            title: 'Delete Document Manifest?',
                            message: `Permanently remove Document Manifest (${d.manifestDate}, ${dCount} Docs) from Cloud Vault?`,
                            manualDoc: d,
                          });
                        }}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-rose-950/70 text-slate-400 hover:text-rose-400 border border-slate-700 transition-colors cursor-pointer disabled:opacity-50"
                        title="Delete Document Manifest from Cloud"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {filteredCloudManifests.length === 0 && filteredCloudManualDocs.length === 0 && (
              <div className="text-center py-12 bg-white dark:bg-[#0b101e] rounded-3xl border border-slate-200 dark:border-slate-800 p-8">
                <CloudIcon className="h-10 w-10 text-slate-400 mx-auto mb-2" />
                <h4 className="text-sm font-black text-slate-900 dark:text-white">No Cloud Items Found</h4>
                <p className="text-xs text-slate-400 mt-1">
                  {searchQuery ? "Try a different search query." : "Click 'Backup to Cloud' on the Backup & Sync tab to push items here."}
                </p>
                {!searchQuery && (
                  <button
                    type="button"
                    onClick={() => handleExecuteSync(itemSectionFilter === 'PD' ? 'PD' : itemSectionFilter === 'P' ? 'P' : 'ALL', 'backup')}
                    disabled={isLoading}
                    className="mt-4 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-indigo-600/30 inline-flex items-center gap-2 cursor-pointer active:scale-95 transition-all"
                  >
                    <CloudArrowUpIcon className="h-4 w-4" />
                    <span>{itemSectionFilter === 'PD' ? 'Backup P + D Files to Cloud Vault Now' : 'Backup All Files to Cloud Vault Now'}</span>
                  </button>
                )}
              </div>
            )}
              </>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: SYNC KEYS & CONNECT */}
      {activeTab === 'connect_keys' && (
        <div className="bg-white dark:bg-[#0b101e] border border-slate-200 dark:border-slate-800 rounded-3xl p-6 md:p-8 space-y-6 shadow-xl text-slate-900 dark:text-white">
          <div className="max-w-2xl space-y-2">
            <h3 className="text-lg font-black flex items-center gap-2">
              <KeyIcon className="h-5 w-5 text-indigo-500" />
              <span>Multi-Device Channel Key & Instant Pairing</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Any phone, tablet, or desktop running with this exact Sync Channel Key shares the exact same Cloud Vault, automatically synchronizing manifests and folders.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            {/* Left: Key details */}
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Current Active Channel Key</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-base font-black text-indigo-600 dark:text-indigo-400 tracking-wider">
                    {channelKey}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyKey}
                    className="p-1.5 bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300 rounded-lg hover:bg-indigo-100 transition-colors"
                    title="Copy Key"
                  >
                    <DocumentDuplicateIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={() => setIsChangeKeyModalOpen(true)}
                  className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-sm"
                >
                  Switch / Enter Channel Key
                </button>

                <button
                  type="button"
                  onClick={() => setIsQrScannerOpen(true)}
                  className="py-3 px-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2"
                >
                  <QrCodeIcon className="h-4 w-4" />
                  <span>Scan QR Code</span>
                </button>
              </div>
            </div>

            {/* Right: QR Code for mobile connection */}
            <div className="flex flex-col items-center justify-center p-6 bg-slate-50 dark:bg-slate-900/60 rounded-3xl border border-slate-200 dark:border-slate-800 text-center">
              {qrCodeDataUrl ? (
                <div className="p-3 bg-white rounded-2xl shadow-md">
                  <img src={qrCodeDataUrl} alt="Pairing QR Code" className="w-40 h-40 object-contain" />
                </div>
              ) : (
                <div className="w-40 h-40 bg-slate-200 dark:bg-slate-800 animate-pulse rounded-2xl" />
              )}
              <span className="text-[11px] font-bold text-slate-400 mt-3">
                Scan with phone camera to connect instantly
              </span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: CONNECTED USERS / DEVICES */}
      {activeTab === 'connected_users' && (
        <div className="bg-white dark:bg-[#0b101e] border border-slate-200 dark:border-slate-800 rounded-3xl p-6 md:p-8 space-y-5 shadow-xl">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                <ComputerDesktopIcon className="h-5 w-5 text-indigo-500" />
                <span>Connected Devices in Channel</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Live list of devices active on channel <span className="font-mono font-bold text-indigo-500">{channelKey}</span>
              </p>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
              {connectedDevices.length || 1} Online
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {connectedDevices.length > 0 ? (
              connectedDevices.map((d) => (
                <div
                  key={d.id}
                  className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {d.type === 'mobile' ? (
                        <DevicePhoneMobileIcon className="h-5 w-5 text-indigo-500" />
                      ) : d.type === 'tablet' ? (
                        <DeviceTabletIcon className="h-5 w-5 text-indigo-500" />
                      ) : (
                        <ComputerDesktopIcon className="h-5 w-5 text-indigo-500" />
                      )}
                      <span className="text-xs font-black text-slate-900 dark:text-white">{d.name}</span>
                    </div>
                    {d.isCurrentDevice && (
                      <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
                        This Device
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {d.os} • {d.browser}
                  </div>
                  <div className="text-[10px] text-slate-400 flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800">
                    <span>Active: {formatLastSync(d.lastActive)}</span>
                    <span className="text-emerald-500 font-bold flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      Connected
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center gap-2">
                  <ComputerDesktopIcon className="h-5 w-5 text-indigo-500" />
                  <span className="text-xs font-black text-slate-900 dark:text-white">Current Browser Device</span>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Channel Active</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: Switch Channel Key */}
      {isChangeKeyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <KeyIcon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                <span>Switch Sync Channel Key</span>
              </h3>
              <button
                onClick={() => setIsChangeKeyModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-200"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Enter a new sync key to connect with another vault, or enter your colleagues&apos; key to share live manifests.
            </p>

            <input
              type="text"
              value={newKeyInput}
              onChange={(e) => setNewKeyInput(e.target.value.toUpperCase())}
              placeholder="e.g. QZ-CL-C1B4-B52F"
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-sm font-bold text-slate-900 dark:text-white"
            />

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsChangeKeyModalOpen(false)}
                className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (onUpdateChannelKey && newKeyInput.trim()) {
                    await onUpdateChannelKey(newKeyInput.trim().toUpperCase());
                    setIsChangeKeyModalOpen(false);
                    showNotification(`Switched to channel ${newKeyInput.trim().toUpperCase()}`);
                  }
                }}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md"
              >
                Save & Connect
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: In-App Confirmation for Restore / Delete (iFrame-safe) */}
      {pendingAction && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                  pendingAction.type === 'restore_backup'
                    ? 'bg-purple-100 dark:bg-purple-950 text-purple-600 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                    : 'bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                }`}>
                  {pendingAction.type === 'restore_backup' ? (
                    <ArrowPathIcon className="h-5 w-5" />
                  ) : (
                    <ExclamationTriangleIcon className="h-5 w-5" />
                  )}
                </div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  {pendingAction.title}
                </h3>
              </div>
              <button
                type="button"
                disabled={isActionRunning}
                onClick={() => setPendingAction(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {pendingAction.message}
            </p>

            {pendingAction.type === 'restore_backup' ? (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-2">
                <button
                  type="button"
                  disabled={isActionRunning}
                  onClick={() => setPendingAction(null)}
                  className="py-2.5 px-4 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isActionRunning}
                  onClick={() => executePendingAction('merge')}
                  className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md cursor-pointer disabled:opacity-50"
                >
                  {isActionRunning ? 'Restoring...' : 'Merge with Local'}
                </button>
                <button
                  type="button"
                  disabled={isActionRunning}
                  onClick={() => executePendingAction('replace')}
                  className="flex-1 py-2.5 px-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md cursor-pointer disabled:opacity-50"
                >
                  {isActionRunning ? 'Restoring...' : 'Replace All'}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  disabled={isActionRunning}
                  onClick={() => setPendingAction(null)}
                  className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isActionRunning}
                  onClick={() => executePendingAction()}
                  className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  <TrashIcon className="h-4 w-4" />
                  <span>{isActionRunning ? 'Deleting...' : 'Delete Permanently'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: QR Scanner */}
      {isQrScannerOpen && (
        <QrScannerModal
          isOpen={isQrScannerOpen}
          onClose={() => setIsQrScannerOpen(false)}
          onScanSuccess={async (decodedKey) => {
            setIsQrScannerOpen(false);
            if (onUpdateChannelKey && decodedKey) {
              await onUpdateChannelKey(decodedKey.trim().toUpperCase());
              showNotification(`Channel connected via QR scan!`);
            }
          }}
        />
      )}
    </div>
  );
};

export default CloudManager;
