import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import {
  CloudIcon,
  ArrowPathIcon,
  CheckIcon,
  DocumentDuplicateIcon,
  DevicePhoneMobileIcon,
  DeviceTabletIcon,
  ComputerDesktopIcon,
  QrCodeIcon,
  LinkIcon,
  PencilSquareIcon,
  CheckCircleIcon,
  SignalIcon,
  KeyIcon,
  XMarkIcon,
  SparklesIcon,
  InformationCircleIcon,
  LockClosedIcon,
  CameraIcon,
  ArrowRightOnRectangleIcon,
  ShieldCheckIcon
} from '@heroicons/react/24/outline';
import { SyncedDevice, DeviceType } from '../types';
import { generateRandomSyncKey } from '../utils/deviceDetector';
import { QrScannerModal } from './QrScannerModal';

interface MultiDeviceSyncCardProps {
  currentDevice: SyncedDevice;
  connectedDevices: SyncedDevice[];
  channelKey: string;
  isCloudActivated: boolean;
  isOnline?: boolean;
  onActivateCloud: (initialKey?: string) => Promise<void>;
  onLinkWithExistingCloud: (existingKey: string) => Promise<void>;
  onDeactivateCloud: () => void;
  onUpdateChannelKey: (newKey: string) => Promise<void>;
  onUpdateDeviceName: (newName: string) => Promise<void>;
  onSyncNow: () => Promise<void>;
  isSyncing: boolean;
  lastSyncTimestamp: number | null;
  lastSyncMessage?: string;
  autoSyncEnabled: boolean;
  onToggleAutoSync: (enabled: boolean) => void;
  manifestCount: number;
}

export const MultiDeviceSyncCard: React.FC<MultiDeviceSyncCardProps> = ({
  currentDevice,
  connectedDevices,
  channelKey,
  isCloudActivated,
  isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true,
  onActivateCloud,
  onLinkWithExistingCloud,
  onDeactivateCloud,
  onUpdateChannelKey,
  onUpdateDeviceName,
  onSyncNow,
  isSyncing,
  lastSyncTimestamp,
  lastSyncMessage,
  autoSyncEnabled,
  onToggleAutoSync,
  manifestCount,
}) => {
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isPairModalOpen, setIsPairModalOpen] = useState(false);
  const [isScannerModalOpen, setIsScannerModalOpen] = useState(false);
  const [isChangeKeyModalOpen, setIsChangeKeyModalOpen] = useState(false);

  // States for Inactive/Locked Setup
  const [initialProposedKey, setInitialProposedKey] = useState<string>(() =>
    channelKey && channelKey !== 'REMIX-CLOUD-SYNC' ? channelKey : generateRandomSyncKey()
  );
  const [linkKeyInput, setLinkKeyInput] = useState<string>('');
  const [activeSetupMode, setActiveSetupMode] = useState<'activate' | 'link'>('link');

  // Change key modal input
  const [newKeyInput, setNewKeyInput] = useState(channelKey);

  // Device renaming state
  const [isEditingDeviceName, setIsEditingDeviceName] = useState(false);
  const [deviceNameInput, setDeviceNameInput] = useState(currentDevice.name);

  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');

  // Generate pairing URL: same origin with ?syncKey=KEY
  const pairingUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${window.location.pathname}?syncKey=${encodeURIComponent(channelKey)}`
    : `?syncKey=${channelKey}`;

  // Generate QR code whenever channelKey or pairingUrl changes
  useEffect(() => {
    let isMounted = true;
    QRCode.toDataURL(pairingUrl, {
      width: 260,
      margin: 2,
      color: {
        dark: '#1e1b4b', // deep indigo
        light: '#ffffff',
      },
    })
      .then((url) => {
        if (isMounted) setQrCodeDataUrl(url);
      })
      .catch((err) => {
        console.error('Failed to generate QR Code:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [pairingUrl, channelKey]);

  useEffect(() => {
    setDeviceNameInput(currentDevice.name);
  }, [currentDevice.name]);

  useEffect(() => {
    setNewKeyInput(channelKey);
  }, [channelKey]);

  const handleCopyKey = async () => {
    try {
      await navigator.clipboard.writeText(channelKey);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    } catch (e) {}
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(pairingUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch (e) {}
  };

  const handleSaveDeviceName = async () => {
    if (deviceNameInput.trim() && deviceNameInput.trim() !== currentDevice.name) {
      await onUpdateDeviceName(deviceNameInput.trim());
    }
    setIsEditingDeviceName(false);
  };

  const handleApplyNewKey = async () => {
    if (newKeyInput.trim() && newKeyInput.trim() !== channelKey) {
      await onUpdateChannelKey(newKeyInput.trim().toUpperCase());
      setIsChangeKeyModalOpen(false);
    }
  };

  const handleScanSuccess = async (scannedKey: string) => {
    setIsScannerModalOpen(false);
    if (!scannedKey) return;

    if (!isCloudActivated) {
      setLinkKeyInput(scannedKey);
      await onLinkWithExistingCloud(scannedKey);
    } else {
      setNewKeyInput(scannedKey);
      await onUpdateChannelKey(scannedKey);
      setIsChangeKeyModalOpen(false);
    }
  };

  const getDeviceIcon = (type: DeviceType) => {
    switch (type) {
      case 'mobile':
        return <DevicePhoneMobileIcon className="h-5 w-5" />;
      case 'tablet':
        return <DeviceTabletIcon className="h-5 w-5" />;
      case 'desktop':
      default:
        return <ComputerDesktopIcon className="h-5 w-5" />;
    }
  };

  const formatRelativeTime = (timestamp: number) => {
    if (!timestamp) return 'Offline';
    const diffSeconds = Math.floor((Date.now() - timestamp) / 1000);
    if (diffSeconds < 60) return 'Active just now';
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  // Ensure current device is present in display list
  const displayDevices = [...connectedDevices];
  if (!displayDevices.some((d) => d.id === currentDevice.id)) {
    displayDevices.unshift({ ...currentDevice, isCurrentDevice: true });
  }

  // =========================================================================
  // VIEW 1: INITIALLY DEACTIVATED / LOCKED CLOUD (Setup & Pairing Options)
  // =========================================================================
  if (!isCloudActivated) {
    return (
      <div className="bg-white dark:bg-slate-800 p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-5 transition-all">
        {/* Header: Locked status */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-700/60">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-slate-100 dark:bg-slate-700/70 rounded-2xl text-slate-500 dark:text-slate-400">
              <LockClosedIcon className="h-6 w-6 text-indigo-500" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
                  Cloud Storage Setup
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
                  Locked / Inactive
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Activate new cloud workspace or link with an existing device
              </p>
            </div>
          </div>
        </div>

        {/* Setup Selection Tabs: Link vs Activate */}
        <div className="grid grid-cols-2 p-1 bg-slate-100 dark:bg-slate-900 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveSetupMode('link')}
            className={`py-2 px-3 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeSetupMode === 'link'
                ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <LinkIcon className="h-4 w-4" />
            <span>Link Existing Cloud</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSetupMode('activate')}
            className={`py-2 px-3 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeSetupMode === 'activate'
                ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <SparklesIcon className="h-4 w-4" />
            <span>Activate New Cloud</span>
          </button>
        </div>

        {/* MODE A: LINK WITH EXISTING CLOUD (Enter code or Scan code) */}
        {activeSetupMode === 'link' && (
          <div className="space-y-4 animate-in fade-in duration-150">
            <div className="p-4 bg-indigo-50/60 dark:bg-indigo-950/40 rounded-2xl border border-indigo-100 dark:border-indigo-900/40 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-indigo-900 dark:text-indigo-200">
                <ShieldCheckIcon className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <span>Connect this device to your existing cloud workspace</span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                Scan the QR code displayed on your other PC/phone, or manually enter its Cloud Sync Key below:
              </p>

              {/* Fast Camera QR Code Scanner Button */}
              <button
                type="button"
                onClick={() => setIsScannerModalOpen(true)}
                className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
              >
                <CameraIcon className="h-4 w-4" />
                <span>Scan QR Code with Camera</span>
              </button>

              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-indigo-200/60 dark:border-indigo-800/60" />
                <span className="flex-shrink mx-3 text-[10px] font-bold text-indigo-400 dark:text-indigo-400 uppercase tracking-widest">
                  OR ENTER CODE MANUALLY
                </span>
                <div className="flex-grow border-t border-indigo-200/60 dark:border-indigo-800/60" />
              </div>

              {/* Cloud Key Text Input */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                  Cloud Sync Key:
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={linkKeyInput}
                    onChange={(e) => setLinkKeyInput(e.target.value.toUpperCase())}
                    placeholder="e.g. REMIX-8A2F-9C1D"
                    className="flex-1 px-3 py-2.5 text-xs font-black font-mono tracking-wider bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-800 dark:text-white uppercase outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => onLinkWithExistingCloud(linkKeyInput.trim())}
                    disabled={!linkKeyInput.trim() || isSyncing}
                    className="px-5 py-2.5 bg-slate-900 dark:bg-indigo-600 hover:bg-black dark:hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all disabled:opacity-40 cursor-pointer flex items-center gap-1.5 shrink-0"
                  >
                    {isSyncing ? (
                      <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <LinkIcon className="h-3.5 w-3.5" />
                    )}
                    <span>Connect</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Helper */}
            <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 flex items-start gap-2">
              <InformationCircleIcon className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
              <span>
                On your other device, go to <strong>Settings → Cloud Settings</strong> and click <strong>"Pair Mobile / Tab"</strong> to view its QR code and Cloud Key.
              </span>
            </div>
          </div>
        )}

        {/* MODE B: ACTIVATE NEW CLOUD */}
        {activeSetupMode === 'activate' && (
          <div className="space-y-4 animate-in fade-in duration-150">
            <div className="p-4 bg-slate-50 dark:bg-slate-900/80 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
              <div>
                <span className="text-xs font-black text-slate-800 dark:text-slate-200 block uppercase tracking-wider">
                  Initial Cloud Sync Key
                </span>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  This key will be assigned to your new cloud database space. You can pair other phones and tablets to this key afterwards.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={initialProposedKey}
                  onChange={(e) => setInitialProposedKey(e.target.value.toUpperCase())}
                  className="flex-1 px-3 py-2.5 text-xs font-black font-mono tracking-wider bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-indigo-600 dark:text-indigo-400 uppercase outline-none"
                />
                <button
                  type="button"
                  onClick={() => setInitialProposedKey(generateRandomSyncKey())}
                  className="px-3 py-2.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 shrink-0"
                  title="Generate new unique key"
                >
                  <SparklesIcon className="h-3.5 w-3.5 text-indigo-500" />
                  <span>Regenerate</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => onActivateCloud(initialProposedKey)}
                disabled={isSyncing}
                className="w-full py-3 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 active:scale-[0.99] text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
              >
                {isSyncing ? (
                  <ArrowPathIcon className="h-4 w-4 animate-spin" />
                ) : (
                  <SparklesIcon className="h-4 w-4" />
                )}
                <span>Activate New Cloud Workspace</span>
              </button>
            </div>
          </div>
        )}

        {/* QR Scanner Modal */}
        <QrScannerModal
          isOpen={isScannerModalOpen}
          onClose={() => setIsScannerModalOpen(false)}
          onScanSuccess={handleScanSuccess}
        />
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: ACTIVATED & CONNECTED CLOUD WORKSPACE
  // =========================================================================
  return (
    <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200/90 dark:border-slate-700 shadow-sm space-y-4 transition-all">
      {/* 1. Header with Cloud & Multi-Device Sync Indicator */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-700/60">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-xl text-white shadow-xs">
            <CloudIcon className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
                Common Cloud Storage
              </span>
              {isOnline ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Connected & Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60" title="Operating offline; auto-sync paused until internet is restored">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  Offline Mode (Local Storage Active)
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">
              {isOnline
                ? 'Syncing Mobile, Tablet & PC on a common real-time workspace'
                : 'Internet unavailable. Auto-sync will reconnect automatically once online.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={onSyncNow}
            disabled={isSyncing}
            className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50 cursor-pointer border border-indigo-200 dark:border-indigo-800"
            title="Sync all connected devices now"
          >
            <ArrowPathIcon className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin text-indigo-600' : ''}`} />
            <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
          </button>
        </div>
      </div>

      {/* 2. Common Cloud Sync Key Box & Pairing / Scanning Triggers */}
      <div className="p-3.5 bg-slate-50/90 dark:bg-slate-900/80 rounded-xl border border-slate-200/80 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider">
            <KeyIcon className="h-3.5 w-3.5 text-indigo-500" />
            <span>Active Cloud Sync Key</span>
          </div>
          <div className="flex items-center gap-2">
            <code className="text-sm font-black font-mono tracking-wider text-indigo-600 dark:text-indigo-400 bg-white dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
              {channelKey}
            </code>
            <button
              type="button"
              onClick={handleCopyKey}
              className="p-1.5 text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-white rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              title="Copy Sync Key"
            >
              {copiedKey ? (
                <CheckIcon className="h-4 w-4 text-emerald-600" />
              ) : (
                <DocumentDuplicateIcon className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
          {/* Show QR Code for other devices */}
          <button
            type="button"
            onClick={() => setIsPairModalOpen(true)}
            className="flex-1 sm:flex-none px-3 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
          >
            <QrCodeIcon className="h-4 w-4" />
            <span>Pair Mobile / Tab</span>
          </button>

          {/* Scan code or change key */}
          <button
            type="button"
            onClick={() => setIsChangeKeyModalOpen(true)}
            className="px-2.5 py-2 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 transition-all cursor-pointer"
            title="Connect with another cloud key or scan code"
          >
            Enter / Switch Key
          </button>

          {/* Lock / Deactivate */}
          <button
            type="button"
            onClick={onDeactivateCloud}
            className="p-2 text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
            title="Lock / Disconnect Cloud on this device"
          >
            <ArrowRightOnRectangleIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 3. This Device Identity Card */}
      <div className="p-3 bg-indigo-50/50 dark:bg-indigo-950/30 rounded-xl border border-indigo-100/80 dark:border-indigo-900/40 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2 bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 rounded-lg shadow-xs border border-indigo-100 dark:border-indigo-900 shrink-0">
            {getDeviceIcon(currentDevice.type)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {isEditingDeviceName ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={deviceNameInput}
                    onChange={(e) => setDeviceNameInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveDeviceName()}
                    className="px-2 py-0.5 text-xs font-bold bg-white dark:bg-slate-900 border border-indigo-300 dark:border-indigo-700 rounded-lg outline-none text-slate-800 dark:text-slate-200"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleSaveDeviceName}
                    className="p-1 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-xs"
                  >
                    <CheckIcon className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <>
                  <span className="text-xs font-black text-slate-900 dark:text-white truncate">
                    {currentDevice.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsEditingDeviceName(true)}
                    className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                    title="Rename this device"
                  >
                    <PencilSquareIcon className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
              <span className="px-1.5 py-0.2 rounded-md bg-indigo-100 dark:bg-indigo-900/70 text-indigo-800 dark:text-indigo-300 text-[9px] font-black uppercase tracking-wider shrink-0">
                This Device
              </span>
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium truncate">
              {currentDevice.os} • {currentDevice.browser} • Active Now
            </p>
          </div>
        </div>

        <div className="text-right shrink-0">
          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold block uppercase tracking-wider">
            Manifests
          </span>
          <span className="text-xs font-black text-slate-800 dark:text-slate-200">
            {manifestCount}
          </span>
        </div>
      </div>

      {/* 4. Connected Devices Section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-black uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
            <SignalIcon className="h-3.5 w-3.5 text-emerald-500" />
            <span>Connected Devices ({displayDevices.length})</span>
          </span>
          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
            Mobile, Tablet & PC sync automatically
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
          {displayDevices.map((dev) => {
            const isCurrent = dev.id === currentDevice.id;
            const isRecent = Date.now() - dev.lastActive < 300000; // active in last 5 mins

            return (
              <div
                key={dev.id}
                className={`p-3 rounded-xl border transition-all text-xs space-y-1.5 ${
                  isCurrent
                    ? 'bg-indigo-50/40 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-800/80 shadow-xs'
                    : 'bg-white dark:bg-slate-800/70 border-slate-200/80 dark:border-slate-700/80'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className={`p-1.5 rounded-lg ${
                        isCurrent
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {getDeviceIcon(dev.type)}
                    </div>
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white truncate max-w-[120px]">
                        {dev.name}
                      </div>
                      <div className="text-[9px] text-slate-400 capitalize">
                        {dev.type === 'desktop' ? 'PC / Laptop' : dev.type} • {dev.os}
                      </div>
                    </div>
                  </div>

                  <span
                    className={`h-2 w-2 rounded-full ${
                      isCurrent || isRecent
                        ? 'bg-emerald-500 animate-pulse'
                        : 'bg-slate-300 dark:bg-slate-600'
                    }`}
                    title={isCurrent ? 'Active Now (This Device)' : isRecent ? 'Active recently' : 'Inactive'}
                  />
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-700/50">
                  <span>{isCurrent ? 'This Device' : formatRelativeTime(dev.lastActive)}</span>
                  <span className="font-mono text-[9px] text-slate-400">
                    {dev.browser}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 5. Sync Activity Log / Status Banner */}
      <div className="bg-slate-50 dark:bg-slate-900/80 p-3 rounded-xl border border-slate-100 dark:border-slate-800 text-[11px] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
            <span>Last Synced:</span>
            <span className="font-bold text-slate-800 dark:text-slate-200">
              {lastSyncTimestamp ? new Date(lastSyncTimestamp).toLocaleString() : 'Never'}
            </span>
          </div>
          {lastSyncMessage && (
            <p className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium">
              {lastSyncMessage}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
            Auto-Sync:
          </span>
          <button
            type="button"
            onClick={() => onToggleAutoSync(!autoSyncEnabled)}
            className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              autoSyncEnabled ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                autoSyncEnabled ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* ================= MODAL 1: PAIR MOBILE / TABLET VIA QR CODE ================= */}
      {isPairModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-indigo-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 bg-gradient-to-r from-indigo-600 to-indigo-800 text-white flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-white/20 rounded-xl">
                  <QrCodeIcon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black tracking-tight">Connect Mobile or Tablet</h3>
                  <p className="text-[10px] text-indigo-200 uppercase tracking-wider font-semibold">
                    Instant Multi-Device Pairing
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPairModalOpen(false)}
                className="p-1.5 bg-white/10 hover:bg-white/20 rounded-xl transition-colors cursor-pointer text-white"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 text-center">
              {/* QR Code Container */}
              <div className="flex flex-col items-center justify-center p-4 bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700">
                {qrCodeDataUrl ? (
                  <img
                    src={qrCodeDataUrl}
                    alt="Scan to pair mobile/tablet"
                    className="w-52 h-52 rounded-xl shadow-md bg-white p-2"
                  />
                ) : (
                  <div className="w-52 h-52 flex items-center justify-center bg-slate-100 rounded-xl text-xs text-slate-400 animate-pulse">
                    Generating QR Code...
                  </div>
                )}
                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mt-3">
                  Scan with your phone or tablet camera
                </span>
                <p className="text-[10px] text-slate-400 max-w-xs mt-0.5">
                  Opens the billing workspace and connects with this device's common cloud storage.
                </p>
              </div>

              {/* Sync Key & Direct Link */}
              <div className="space-y-2 text-left">
                <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                  Pairing Link (Open on Mobile / Tab)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={pairingUrl}
                    className="flex-1 px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-300 font-mono select-all outline-none truncate"
                  />
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
                  >
                    {copiedLink ? <CheckIcon className="h-4 w-4" /> : <LinkIcon className="h-4 w-4" />}
                    <span>{copiedLink ? 'Copied!' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              {/* How it works simple cards */}
              <div className="grid grid-cols-3 gap-2 text-left pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="p-2.5 bg-indigo-50/60 dark:bg-indigo-950/40 rounded-xl border border-indigo-100 dark:border-indigo-900/40">
                  <span className="text-[9px] font-black text-indigo-700 dark:text-indigo-300 uppercase block">Step 1</span>
                  <p className="text-[10px] text-slate-600 dark:text-slate-400 mt-0.5">Scan QR on phone or tablet</p>
                </div>
                <div className="p-2.5 bg-emerald-50/60 dark:bg-emerald-950/40 rounded-xl border border-emerald-100 dark:border-emerald-900/40">
                  <span className="text-[9px] font-black text-emerald-700 dark:text-emerald-300 uppercase block">Step 2</span>
                  <p className="text-[10px] text-slate-600 dark:text-slate-400 mt-0.5">Device pairs automatically</p>
                </div>
                <div className="p-2.5 bg-amber-50/60 dark:bg-amber-950/40 rounded-xl border border-amber-100 dark:border-amber-900/40">
                  <span className="text-[9px] font-black text-amber-700 dark:text-amber-300 uppercase block">Step 3</span>
                  <p className="text-[10px] text-slate-600 dark:text-slate-400 mt-0.5">Bills sync in real time</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsPairModalOpen(false)}
                className="w-full py-3 bg-slate-900 dark:bg-indigo-600 hover:bg-black dark:hover:bg-indigo-500 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL 2: ENTER CODE OR SCAN CODE TO SWITCH/LINK ================= */}
      {isChangeKeyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-indigo-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 bg-slate-900 text-white flex justify-between items-center border-b border-slate-800">
              <div className="flex items-center gap-2">
                <KeyIcon className="h-5 w-5 text-indigo-400" />
                <h3 className="text-sm font-black tracking-tight">Connect Common Storage Key</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsChangeKeyModalOpen(false)}
                className="p-1.5 bg-white/10 hover:bg-white/20 rounded-xl transition-colors cursor-pointer text-white"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Enter the Sync Key displayed on your other PC, laptop, tablet, or phone, or scan its QR code:
              </p>

              {/* Scan code with camera button */}
              <button
                type="button"
                onClick={() => {
                  setIsScannerModalOpen(true);
                }}
                className="w-full py-2.5 px-3 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 border border-indigo-200 dark:border-indigo-800 transition-all cursor-pointer"
              >
                <CameraIcon className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                <span>Scan QR Code with Camera</span>
              </button>

              <div className="relative flex py-0.5 items-center">
                <div className="flex-grow border-t border-slate-200 dark:border-slate-700" />
                <span className="flex-shrink mx-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  OR TYPE KEY
                </span>
                <div className="flex-grow border-t border-slate-200 dark:border-slate-700" />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">
                  Device Sync Key
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={newKeyInput}
                    onChange={(e) => setNewKeyInput(e.target.value.toUpperCase())}
                    placeholder="e.g. REMIX-ABCD-1234"
                    className="w-full px-3 py-2.5 text-sm font-black font-mono tracking-wider bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 uppercase"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => setNewKeyInput(generateRandomSyncKey())}
                  className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline cursor-pointer flex items-center gap-1 text-[11px]"
                >
                  <SparklesIcon className="h-3.5 w-3.5" />
                  Generate New Unique Key
                </button>
              </div>

              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800/40 text-[10px] text-amber-800 dark:text-amber-300 flex items-start gap-2">
                <InformationCircleIcon className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                <span>
                  Switching to another device key will load and synchronize all manifests and folders shared under that key.
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsChangeKeyModalOpen(false)}
                  className="py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleApplyNewKey}
                  disabled={!newKeyInput.trim() || newKeyInput.trim() === channelKey}
                  className="py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer"
                >
                  Connect Key
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QR Code Scanner Camera Modal */}
      <QrScannerModal
        isOpen={isScannerModalOpen}
        onClose={() => setIsScannerModalOpen(false)}
        onScanSuccess={handleScanSuccess}
      />
    </div>
  );
};
