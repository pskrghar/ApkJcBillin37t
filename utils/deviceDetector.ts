import { DeviceType, SyncedDevice } from '../types';

const DEVICE_ID_KEY = 'jc_device_id';
const DEVICE_NAME_KEY = 'jc_device_name';
export const SYNC_KEY_STORAGE = 'jc_cloud_sync_key';
export const DEFAULT_SYNC_KEY = 'REMIX-CLOUD-SYNC';

/**
 * Detect device type based on userAgent, screen size, and touch capabilities
 */
export function detectDeviceType(): DeviceType {
  if (typeof window === 'undefined') return 'desktop';
  const ua = navigator.userAgent.toLowerCase();
  
  // Explicit tablet checks (iPad, Android tablet)
  const isIPad = /ipad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroidTablet = /android/.test(ua) && !/mobile/.test(ua);
  const isTabletResolution = window.innerWidth >= 600 && window.innerWidth <= 1024 && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

  if (isIPad || isAndroidTablet || isTabletResolution) {
    return 'tablet';
  }

  // Mobile checks
  const isMobileUA = /mobile|iphone|ipod|android.*mobile|blackberry|phone|iemobile/.test(ua);
  const isSmallScreen = window.innerWidth < 640 && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

  if (isMobileUA || isSmallScreen) {
    return 'mobile';
  }

  return 'desktop';
}

/**
 * Detect Operating System
 */
export function detectOS(): string {
  if (typeof window === 'undefined') return 'Unknown OS';
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return 'iOS';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Mac OS X|Macintosh/.test(ua)) return 'macOS';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Desktop OS';
}

/**
 * Detect Browser
 */
export function detectBrowser(): string {
  if (typeof window === 'undefined') return 'Browser';
  const ua = navigator.userAgent;
  if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return 'Safari';
  if (/Edg\//.test(ua)) return 'Edge';
  if (/Firefox\//.test(ua)) return 'Firefox';
  return 'Web App';
}

/**
 * Get or create unique persistent device ID
 */
export function getOrCreateDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const type = detectDeviceType();
    const newId = `dev_${type}_${Math.random().toString(36).substring(2, 9)}_${Date.now().toString(36)}`;
    localStorage.setItem(DEVICE_ID_KEY, newId);
    return newId;
  } catch (e) {
    return `dev_${Math.random().toString(36).substring(2, 9)}`;
  }
}

/**
 * Get or set friendly device name
 */
export function getDeviceName(): string {
  try {
    const saved = localStorage.getItem(DEVICE_NAME_KEY);
    if (saved && saved.trim()) return saved.trim();

    const type = detectDeviceType();
    const os = detectOS();
    let defaultName = `${os} Device`;
    if (type === 'desktop') defaultName = `${os} PC / Laptop`;
    if (type === 'mobile') defaultName = `${os} Phone`;
    if (type === 'tablet') defaultName = `${os} Tablet`;

    localStorage.setItem(DEVICE_NAME_KEY, defaultName);
    return defaultName;
  } catch (e) {
    return 'My Device';
  }
}

export function saveDeviceName(name: string): void {
  try {
    localStorage.setItem(DEVICE_NAME_KEY, name.trim());
  } catch (e) {}
}

/**
 * Retrieve Active Sync Channel Key (supports URL query ?syncKey=XYZ)
 */
export function getActiveSyncKey(): string {
  try {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const urlKey = urlParams.get('syncKey');
      if (urlKey && urlKey.trim()) {
        const cleanKey = urlKey.trim().toUpperCase();
        localStorage.setItem(SYNC_KEY_STORAGE, cleanKey);
        // Clean URL parameter without page reload
        const newUrl = window.location.pathname + window.location.hash;
        window.history.replaceState({}, '', newUrl);
        return cleanKey;
      }
    }

    const saved = localStorage.getItem(SYNC_KEY_STORAGE);
    if (saved && saved.trim()) return saved.trim().toUpperCase();

    // Default common sync key
    localStorage.setItem(SYNC_KEY_STORAGE, DEFAULT_SYNC_KEY);
    return DEFAULT_SYNC_KEY;
  } catch (e) {
    return DEFAULT_SYNC_KEY;
  }
}

const CLOUD_ACTIVATED_STORAGE = 'billing_cloud_activated';

/**
 * Check if cloud is activated/unlocked on this device
 */
export function isCloudActivatedOnDevice(): boolean {
  try {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(CLOUD_ACTIVATED_STORAGE);
      if (saved === 'false') {
        return false;
      }
      return true;
    }
    return true;
  } catch (e) {
    return true;
  }
}

/**
 * Persist cloud activation status on this device
 */
export function setCloudActivatedOnDevice(active: boolean): void {
  try {
    localStorage.setItem(CLOUD_ACTIVATED_STORAGE, active ? 'true' : 'false');
  } catch (e) {}
}

/**
 * Extract Sync Key from scanned text or URL
 */
export function extractSyncKeyFromText(rawText: string): string {
  if (!rawText) return '';
  const trimmed = rawText.trim();
  try {
    // If it's a URL with ?syncKey=...
    if (trimmed.includes('?') && trimmed.includes('syncKey=')) {
      const parsedUrl = new URL(trimmed.startsWith('http') ? trimmed : `https://dummy.com/${trimmed}`);
      const key = parsedUrl.searchParams.get('syncKey');
      if (key && key.trim()) {
        return key.trim().toUpperCase();
      }
    }
  } catch (e) {
    // Not a valid URL, treat as raw text
  }

  // Look for pattern like REMIX-XXXX-YYYY
  const match = trimmed.match(/REMIX-[A-Z0-9]{3,6}-[A-Z0-9]{3,6}/i);
  if (match) {
    return match[0].toUpperCase();
  }

  // Fallback: clean non-alphanumeric except dashes
  return trimmed.replace(/[^A-Za-z0-9_-]/g, '').toUpperCase();
}

export function setActiveSyncKey(key: string): string {
  const cleanKey = key.trim().toUpperCase() || DEFAULT_SYNC_KEY;
  try {
    localStorage.setItem(SYNC_KEY_STORAGE, cleanKey);
  } catch (e) {}
  return cleanKey;
}

export const getOrCreateSyncChannelKey = getActiveSyncKey;
export const saveSyncChannelKey = setActiveSyncKey;
export const saveDeviceCustomName = saveDeviceName;

/**
 * Generate a new random memorable Sync Key
 */
export function generateRandomSyncKey(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let part1 = '';
  let part2 = '';
  for (let i = 0; i < 4; i++) {
    part1 += chars.charAt(Math.floor(Math.random() * chars.length));
    part2 += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `REMIX-${part1}-${part2}`;
}

/**
 * Construct current device model object
 */
export function getCurrentDeviceInfo(manifestCount = 0): SyncedDevice {
  return {
    id: getOrCreateDeviceId(),
    name: getDeviceName(),
    type: detectDeviceType(),
    browser: detectBrowser(),
    os: detectOS(),
    channelKey: getActiveSyncKey(),
    lastActive: Date.now(),
    isCurrentDevice: true,
    manifestCount,
  };
}
