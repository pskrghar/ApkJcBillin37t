import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import type jsPDF from 'jspdf';

export function isNativePlatform(): boolean {
  try {
    return typeof window !== 'undefined' && Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function isNativeAndroid(): boolean {
  try {
    return typeof window !== 'undefined' && Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

/**
 * Converts a Blob, Uint8Array, or UTF-8 string into a raw Base64 string (without data URL prefix).
 */
async function toBase64Data(data: Blob | Uint8Array | string): Promise<string> {
  if (typeof data === 'string') {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(data);
    return uint8ArrayToBase64(bytes);
  }

  if (data instanceof Uint8Array) {
    return uint8ArrayToBase64(data);
  }

  // Blob
  const buffer = await data.arrayBuffer();
  return uint8ArrayToBase64(new Uint8Array(buffer));
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const sub = bytes.subarray(i, i + chunkSize);
    chunks.push(String.fromCharCode(...sub));
  }
  return btoa(chunks.join(''));
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/\s+/g, '_');
}

export interface ExportShareResult {
  exported: boolean;
  cancelled?: boolean;
  nativeShare?: boolean;
}

/**
 * Unified export helper:
 * - On Android/iOS APK: writes to Capacitor Cache directory and opens the native Share Sheet.
 * - On Web browsers: triggers standard file download via temporary anchor URL.
 */
export async function exportAndShareFile(options: {
  fileName: string;
  data: Blob | Uint8Array | string;
  mimeType: string;
  dialogTitle?: string;
}): Promise<ExportShareResult> {
  const safeFileName = sanitizeFileName(options.fileName);

  if (isNativePlatform()) {
    try {
      const base64Data = await toBase64Data(options.data);
      const cachePath = `exports/${safeFileName}`;

      const writeResult = await Filesystem.writeFile({
        path: cachePath,
        data: base64Data,
        directory: Directory.Cache,
        recursive: true,
      });

      await Share.share({
        title: safeFileName,
        text: options.dialogTitle || safeFileName,
        url: writeResult.uri,
        dialogTitle: options.dialogTitle || `Share ${safeFileName}`,
      });

      return { exported: true, nativeShare: true };
    } catch (err: any) {
      const msg = (err?.message || String(err || '')).toLowerCase();
      if (msg.includes('cancel') || msg.includes('dismiss') || msg.includes('abort')) {
        return { exported: false, cancelled: true, nativeShare: true };
      }
      console.error('[nativeBridge] Native export/share failed:', err);
      throw err;
    }
  }

  // Standard Web Browser Download Fallback
  let blob: Blob;
  if (options.data instanceof Blob) {
    blob = options.data;
  } else if (options.data instanceof Uint8Array) {
    const bufferCopy = new Uint8Array(options.data).buffer;
    blob = new Blob([bufferCopy], { type: options.mimeType });
  } else {
    blob = new Blob([options.data], { type: options.mimeType });
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', safeFileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  }, 1500);

  return { exported: true, nativeShare: false };
}

/**
 * Exports a jsPDF document natively via Android Share Sheet on APK, or doc.save() on Web.
 */
export async function exportJsPdfDocument(
  doc: jsPDF,
  fileName: string,
  dialogTitle?: string
): Promise<ExportShareResult> {
  const safeFileName = sanitizeFileName(fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`);

  if (isNativePlatform()) {
    const arrayBuffer = doc.output('arraybuffer');
    return exportAndShareFile({
      fileName: safeFileName,
      data: new Uint8Array(arrayBuffer),
      mimeType: 'application/pdf',
      dialogTitle: dialogTitle || `Share ${safeFileName}`,
    });
  }

  doc.save(safeFileName);
  return { exported: true, nativeShare: false };
}

/**
 * Syncs Android/iOS native StatusBar color & icon contrast with the active app theme.
 */
export async function syncNativeStatusBar(theme: 'light' | 'dark' | 'reading'): Promise<void> {
  if (!isNativePlatform()) return;

  try {
    await StatusBar.setOverlaysWebView({ overlay: false });
    if (theme === 'dark') {
      await StatusBar.setBackgroundColor({ color: '#090d16' });
      await StatusBar.setStyle({ style: Style.Dark });
    } else if (theme === 'reading') {
      await StatusBar.setBackgroundColor({ color: '#f5f0e6' });
      await StatusBar.setStyle({ style: Style.Light });
    } else {
      await StatusBar.setBackgroundColor({ color: '#1e1b4b' });
      await StatusBar.setStyle({ style: Style.Dark });
    }
  } catch (err) {
    console.warn('[nativeBridge] StatusBar sync skipped:', err);
  }
}

/**
 * Safely hides the native SplashScreen after initial React hydration.
 */
export async function hideNativeSplashScreen(): Promise<void> {
  if (!isNativePlatform()) return;

  try {
    await SplashScreen.hide({ fadeOutDuration: 250 });
  } catch {
    // Non-fatal if already auto-hidden
  }
}
