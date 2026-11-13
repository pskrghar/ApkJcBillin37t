import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import {
  XMarkIcon,
  CameraIcon,
  PhotoIcon,
  ArrowPathIcon,
  ExclamationCircleIcon,
  CheckCircleIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';
import { extractSyncKeyFromText } from '../utils/deviceDetector';

interface QrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (scannedKey: string) => void;
}

export const QrScannerModal: React.FC<QrScannerModalProps> = ({
  isOpen,
  onClose,
  onScanSuccess,
}) => {
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [scannedResult, setScannedResult] = useState<string | null>(null);
  const [availableCameras, setAvailableCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isStoppingRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;
    setIsInitializing(true);
    setScannerError(null);
    setScannedResult(null);
    isStoppingRef.current = false;

    // Small delay to ensure DOM element is mounted
    const timer = setTimeout(async () => {
      try {
        const qrContainer = document.getElementById('qr-reader-target');
        if (!qrContainer) return;

        const html5QrCode = new Html5Qrcode('qr-reader-target', {
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          verbose: false,
        });
        scannerRef.current = html5QrCode;

        // Query available cameras
        let cameras: Array<{ id: string; label: string }> = [];
        try {
          cameras = await Html5Qrcode.getCameras();
          if (mounted) {
            setAvailableCameras(cameras);
            if (cameras.length > 0) {
              // Prefer back camera if found
              const backCam = cameras.find((c) =>
                c.label.toLowerCase().includes('back') || c.label.toLowerCase().includes('rear')
              );
              setSelectedCameraId(backCam ? backCam.id : cameras[0].id);
            }
          }
        } catch (camErr) {
          console.warn('Could not enumerate cameras, falling back to facingMode environment', camErr);
        }

        const cameraConfig = cameras.length > 0 ? (selectedCameraId || cameras[0].id) : { facingMode: 'environment' };

        await html5QrCode.start(
          cameraConfig,
          {
            fps: 12,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
          },
          (decodedText) => {
            if (!mounted || isStoppingRef.current) return;
            handleSuccess(decodedText);
          },
          () => {
            // Frame search error - normal while searching for QR code
          }
        );

        if (mounted) {
          setIsInitializing(false);
        }
      } catch (err: any) {
        console.error('QR Scanner start error:', err);
        if (mounted) {
          setIsInitializing(false);
          setScannerError(
            err?.message ||
              'Unable to access camera. Please allow camera permissions or upload an image of the QR code.'
          );
        }
      }
    }, 200);

    return () => {
      mounted = false;
      clearTimeout(timer);
      stopScanner();
    };
  }, [isOpen]);

  const stopScanner = async () => {
    if (scannerRef.current && !isStoppingRef.current) {
      isStoppingRef.current = true;
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        await scannerRef.current.clear();
      } catch (e) {
        console.warn('Scanner stop error:', e);
      } finally {
        scannerRef.current = null;
      }
    }
  };

  const handleSuccess = async (rawText: string) => {
    const key = extractSyncKeyFromText(rawText);
    if (key) {
      setScannedResult(key);
      await stopScanner();
      setTimeout(() => {
        onScanSuccess(key);
        onClose();
      }, 400);
    }
  };

  const handleSwitchCamera = async (newCamId: string) => {
    setSelectedCameraId(newCamId);
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        setIsInitializing(true);
        await scannerRef.current.start(
          newCamId,
          {
            fps: 12,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
          },
          (decodedText) => {
            if (!isStoppingRef.current) handleSuccess(decodedText);
          },
          () => {}
        );
      } catch (err: any) {
        setScannerError('Failed to switch camera: ' + (err.message || 'Unknown error'));
      } finally {
        setIsInitializing(false);
      }
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsInitializing(true);
      setScannerError(null);
      let scanner = scannerRef.current;
      if (!scanner) {
        scanner = new Html5Qrcode('qr-reader-target');
        scannerRef.current = scanner;
      }
      if (scanner.isScanning) {
        await scanner.stop();
      }
      const result = await scanner.scanFile(file, true);
      handleSuccess(result);
    } catch (err: any) {
      setScannerError('Could not find a valid QR Code in the selected image. Please try another photo.');
    } finally {
      setIsInitializing(false);
    }
  };

  const handleClose = async () => {
    await stopScanner();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-indigo-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-indigo-600 to-indigo-800 text-white flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/20 rounded-xl">
              <CameraIcon className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-black tracking-tight">Scan Cloud Sync QR Code</h3>
              <p className="text-[10px] text-indigo-200 uppercase tracking-wider font-semibold">
                Point camera at other device's screen
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 bg-white/10 hover:bg-white/20 rounded-xl transition-colors cursor-pointer text-white"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1 text-center">
          {/* Camera Viewport Container */}
          <div className="relative rounded-2xl overflow-hidden bg-black border-2 border-indigo-500/40 shadow-inner flex flex-col items-center justify-center min-h-[280px]">
            <div id="qr-reader-target" className="w-full h-full min-h-[280px]" />

            {isInitializing && (
              <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-xs flex flex-col items-center justify-center text-white gap-2 p-4">
                <ArrowPathIcon className="h-8 w-8 animate-spin text-indigo-400" />
                <span className="text-xs font-bold">Starting Camera...</span>
                <span className="text-[10px] text-slate-300 max-w-xs">
                  Please allow camera access when prompted by the browser.
                </span>
              </div>
            )}

            {scannedResult && (
              <div className="absolute inset-0 bg-emerald-950/90 backdrop-blur-xs flex flex-col items-center justify-center text-white gap-2 p-4 animate-in zoom-in-95">
                <CheckCircleIcon className="h-12 w-12 text-emerald-400" />
                <span className="text-sm font-black">Sync Key Detected!</span>
                <code className="text-xs font-mono font-bold bg-white/20 px-3 py-1 rounded-lg">
                  {scannedResult}
                </code>
                <span className="text-[11px] text-emerald-200">Connecting cloud workspace...</span>
              </div>
            )}

            {/* Viewfinder Target Graphic */}
            {!isInitializing && !scannedResult && !scannerError && (
              <div className="absolute pointer-events-none inset-0 flex items-center justify-center">
                <div className="w-48 h-48 border-2 border-indigo-400/80 rounded-2xl relative shadow-lg">
                  <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-white -mt-1 -ml-1 rounded-tl-lg" />
                  <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-white -mt-1 -mr-1 rounded-tr-lg" />
                  <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-white -mb-1 -ml-1 rounded-bl-lg" />
                  <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-white -mb-1 -mr-1 rounded-br-lg" />
                  <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-indigo-400 to-transparent absolute top-1/2 -translate-y-1/2 animate-pulse" />
                </div>
              </div>
            )}
          </div>

          {/* Scanner Error Display */}
          {scannerError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 rounded-xl border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-300 text-xs text-left flex items-start gap-2.5">
              <ExclamationCircleIcon className="h-4 w-4 shrink-0 mt-0.5 text-rose-500" />
              <div className="flex-1">
                <div className="font-bold">Camera Access Notice</div>
                <div className="text-[11px] mt-0.5">{scannerError}</div>
              </div>
            </div>
          )}

          {/* Camera switcher if multiple cameras */}
          {availableCameras.length > 1 && (
            <div className="flex items-center justify-between text-xs px-1">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Select Camera:</span>
              <select
                value={selectedCameraId}
                onChange={(e) => handleSwitchCamera(e.target.value)}
                className="px-2.5 py-1 text-xs font-medium bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 outline-none"
              >
                {availableCameras.map((cam) => (
                  <option key={cam.id} value={cam.id}>
                    {cam.label || `Camera ${cam.id.substring(0, 5)}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Alternative: Upload Image of QR code */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              className="hidden"
              onChange={handleFileUpload}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 py-2 px-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <PhotoIcon className="h-4 w-4 text-indigo-500" />
              <span>Scan from Image / Photo</span>
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="py-2 px-4 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-800 dark:text-slate-100 rounded-xl text-xs font-bold cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
