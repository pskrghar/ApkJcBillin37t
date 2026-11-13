import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  XMarkIcon,
  BoltIcon,
  ArrowPathIcon,
  SparklesIcon,
  ArrowsPointingOutIcon,
  SunIcon,
  ViewfinderCircleIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';

export interface HighResInAppCameraPhoto {
  file: File;
  preview: string;
  width: number;
  height: number;
}

export interface HighResInAppCameraProps {
  isOpen: boolean;
  pageIndex?: number;
  maxPages?: number;
  stagedCount?: number;
  onPhotoCaptured: (photo: HighResInAppCameraPhoto) => void;
  onClose: () => void;
}

export const HighResInAppCamera: React.FC<HighResInAppCameraProps> = ({
  isOpen,
  pageIndex = 1,
  maxPages = 5,
  stagedCount = 0,
  onPhotoCaptured,
  onClose,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [streamActive, setStreamActive] = useState<boolean>(false);
  const [activeResolution, setActiveResolution] = useState<{ width: number; height: number; is4K: boolean }>({
    width: 0,
    height: 0,
    is4K: false,
  });
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [shutterPulse, setShutterPulse] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasTorch, setHasTorch] = useState<boolean>(false);
  const [isTorchOn, setIsTorchOn] = useState<boolean>(false);
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number; current: number } | null>(null);
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number; active: boolean } | null>(null);
  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [captureMethodUsed, setCaptureMethodUsed] = useState<'ImageCapture' | 'OffscreenCanvas' | null>(null);

  // Audio shutter sound generator (Zero external asset dependency)
  const playShutterSound = useCallback(() => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(800, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(120, audioCtx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.08);

      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.09);

      if (navigator.vibrate) {
        navigator.vibrate([40, 20, 50]);
      }
    } catch {
      // Audio autoplay constraints
    }
  }, []);

  // Stop camera stream tracks cleanly
  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStreamActive(false);
    setIsTorchOn(false);
  }, []);

  // Initialize hardware camera with fallback ladders
  const startCamera = useCallback(async (deviceId?: string | null) => {
    stopStream();
    setErrorMessage(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setErrorMessage('Camera access is not supported in this browser environment.');
      return;
    }

    // List available video devices
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevs = devices.filter((d) => d.kind === 'videoinput');
      setAvailableDevices(videoDevs);
    } catch (e) {
      console.warn('Could not enumerate devices:', e);
    }

    // Hardware-Optimized 1080p FHD Constraint Ladder (Optimized for PDF document scanning)
    const constraintTiers: MediaStreamConstraints[] = [
      // Tier 1: 1080p FHD with Continuous Macro Auto-Focus & Auto-Exposure
      {
        audio: false,
        video: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          facingMode: deviceId ? undefined : { ideal: 'environment' },
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
          aspectRatio: { ideal: 16 / 9 },
          // @ts-ignore - Chromium / Android continuous macro focus
          advanced: [{ focusMode: 'continuous' }, { exposureMode: 'continuous' }],
        },
      },
      // Tier 2: 720p HD with Continuous Focus
      {
        audio: false,
        video: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          facingMode: deviceId ? undefined : { ideal: 'environment' },
          width: { ideal: 1280, min: 960 },
          height: { ideal: 720, min: 540 },
          // @ts-ignore
          advanced: [{ focusMode: 'continuous' }],
        },
      },
      // Tier 3: Standard Environmental Rear Camera
      {
        audio: false,
        video: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          facingMode: deviceId ? undefined : { ideal: 'environment' },
        },
      },
      // Tier 4: Fallback Base Camera
      {
        audio: false,
        video: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
        },
      },
    ];

    let activeStream: MediaStream | null = null;
    let successfulTier = -1;

    for (let i = 0; i < constraintTiers.length; i++) {
      try {
        activeStream = await navigator.mediaDevices.getUserMedia(constraintTiers[i]);
        successfulTier = i;
        break;
      } catch (err: any) {
        console.warn(`Camera tier ${i + 1} rejected:`, err?.message || err);
      }
    }

    if (!activeStream) {
      setErrorMessage(
        'Unable to access rear camera. Please ensure camera permissions are granted in your browser settings.'
      );
      return;
    }

    streamRef.current = activeStream;
    const videoTrack = activeStream.getVideoTracks()[0];

    if (videoRef.current) {
      videoRef.current.srcObject = activeStream;
      try {
        await videoRef.current.play();
      } catch (playErr) {
        console.warn('Video play interrupted:', playErr);
      }
    }

    // Inspect capabilities & settings
    if (videoTrack) {
      const settings = videoTrack.getSettings ? videoTrack.getSettings() : ({} as any);
      const caps = (videoTrack.getCapabilities ? videoTrack.getCapabilities() : {}) as any;

      const trackWidth = settings.width || videoRef.current?.videoWidth || 1920;
      const trackHeight = settings.height || videoRef.current?.videoHeight || 1080;

      setActiveResolution({
        width: trackWidth,
        height: trackHeight,
        is4K: trackWidth >= 2560 || trackHeight >= 1440,
      });

      // Check Torch capability
      if (caps && caps.torch) {
        setHasTorch(true);
      } else {
        setHasTorch(false);
      }

      // Check Zoom capability
      if (caps && caps.zoom) {
        setZoomRange({
          min: caps.zoom.min || 1,
          max: caps.zoom.max || 5,
          current: settings.zoom || 1,
        });
      }
    }

    setStreamActive(true);
  }, [stopStream]);

  useEffect(() => {
    if (isOpen) {
      startCamera(selectedDeviceId);
    } else {
      stopStream();
    }
    return () => {
      stopStream();
    };
  }, [isOpen, selectedDeviceId, startCamera, stopStream]);

  // Toggle Hardware Torch / Flash
  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;

    try {
      const nextState = !isTorchOn;
      // @ts-ignore
      await track.applyConstraints({
        advanced: [{ torch: nextState }],
      });
      setIsTorchOn(nextState);
    } catch (err) {
      console.warn('Could not toggle hardware torch:', err);
    }
  };

  // Zoom control
  const handleZoomChange = async (newZoom: number) => {
    if (!streamRef.current || !zoomRange) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;

    try {
      // @ts-ignore
      await track.applyConstraints({
        advanced: [{ zoom: newZoom }],
      });
      setZoomRange((prev) => (prev ? { ...prev, current: newZoom } : null));
    } catch (e) {
      console.warn('Zoom constraint error:', e);
    }
  };

  // Tap-to-Focus trigger
  const handleTapToFocus = async (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    setFocusPoint({ x: e.clientX - rect.left, y: e.clientY - rect.top, active: true });

    setTimeout(() => {
      setFocusPoint((prev) => (prev ? { ...prev, active: false } : null));
    }, 1200);

    if (streamRef.current) {
      const track = streamRef.current.getVideoTracks()[0];
      if (track && (track as any).applyConstraints) {
        try {
          // @ts-ignore
          await track.applyConstraints({
            advanced: [
              {
                focusMode: 'continuous',
                pointsOfInterest: [{ x, y }],
              },
            ],
          });
        } catch {
          // Fallback: re-apply continuous
          try {
            // @ts-ignore
            await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
          } catch {}
        }
      }
    }
  };

  // ==========================================
  // DUAL-LAYER ULTRA-SHARP CAPTURE PIPELINE
  // ==========================================
  const triggerCapture = async () => {
    if (isCapturing || !streamRef.current) return;
    setIsCapturing(true);

    // Step 1: Trigger physical auto-focus pulse & viewfinder animation
    setShutterPulse(true);
    playShutterSound();

    const videoTrack = streamRef.current.getVideoTracks()[0];

    // Attempt physical focus lock/stabilization on the hardware sensor
    if (videoTrack && (videoTrack as any).applyConstraints) {
      try {
        // @ts-ignore
        await videoTrack.applyConstraints({
          advanced: [{ focusMode: 'continuous' }, { exposureMode: 'continuous' }],
        });
      } catch {}
    }

    // Step 2: 200ms hardware stabilization delay to let physical lens settle
    await new Promise((resolve) => setTimeout(resolve, 200));

    try {
      let finalBlob: Blob | null = null;
      let finalWidth = 0;
      let finalHeight = 0;

      // Pipeline A: Native ImageCapture API (Highest optical fidelity, 1080p document still shot)
      const ImageCaptureConstructor = (window as any).ImageCapture;
      if (ImageCaptureConstructor && videoTrack && videoTrack.readyState === 'live') {
        try {
          const imageCapture = new ImageCaptureConstructor(videoTrack);
          // Command camera sensor for crisp 1080p document still frame matching the viewfinder FOV
          const photoBlob = await imageCapture.takePhoto({
            imageWidth: 1920,
            imageHeight: 1080,
          });

          if (photoBlob && photoBlob.size > 20000) {
            finalBlob = photoBlob;
            setCaptureMethodUsed('ImageCapture');

            // Determine dimensions from bitmap
            try {
              const bmp = await createImageBitmap(photoBlob);
              finalWidth = bmp.width;
              finalHeight = bmp.height;
              bmp.close();
            } catch {
              finalWidth = activeResolution.width || 1920;
              finalHeight = activeResolution.height || 1080;
            }
          }
        } catch (imgCaptureErr) {
          console.warn('ImageCapture takePhoto failed, switching to high-res offscreen canvas:', imgCaptureErr);
        }
      }

      // Pipeline B: High-Precision Offscreen Canvas Fallback
      if (!finalBlob) {
        const video = videoRef.current;
        if (!video) throw new Error('Video stream unavailable');

        const trackSettings = videoTrack.getSettings ? videoTrack.getSettings() : ({} as any);
        const sourceWidth = video.videoWidth || trackSettings.width || 1920;
        const sourceHeight = video.videoHeight || trackSettings.height || 1080;

        const offscreenCanvas = document.createElement('canvas');
        offscreenCanvas.width = sourceWidth;
        offscreenCanvas.height = sourceHeight;

        const ctx = offscreenCanvas.getContext('2d', {
          alpha: false,
          desynchronized: false,
        });

        if (!ctx) throw new Error('Failed to create 2D graphics context');

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(video, 0, 0, sourceWidth, sourceHeight);

        finalBlob = await new Promise<Blob | null>((resolve) => {
          offscreenCanvas.toBlob(
            (b) => resolve(b),
            'image/jpeg',
            0.98 // Maximum JPEG quality for pristine OCR digit edges
          );
        });

        finalWidth = sourceWidth;
        finalHeight = sourceHeight;
        setCaptureMethodUsed('OffscreenCanvas');
      }

      if (!finalBlob) {
        throw new Error('Could not generate image file from camera sensor.');
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `manifest_page_${pageIndex}_${timestamp}.jpg`;
      const file = new File([finalBlob], fileName, { type: 'image/jpeg', lastModified: Date.now() });
      const preview = URL.createObjectURL(finalBlob);

      setTimeout(() => {
        setShutterPulse(false);
        setIsCapturing(false);

        // Pass high-res photo directly to review & multi-page cropper
        onPhotoCaptured({
          file,
          preview,
          width: finalWidth,
          height: finalHeight,
        });
      }, 150);
    } catch (captureErr: any) {
      console.error('Capture pipeline failed:', captureErr);
      setShutterPulse(false);
      setIsCapturing(false);
      setErrorMessage(`Capture failed: ${captureErr?.message || 'Unknown error'}`);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      id="high-res-in-app-camera-modal"
      className="fixed inset-0 z-50 flex flex-col bg-black text-white select-none overflow-hidden"
    >
      {/* Top Controls Bar */}
      <div className="relative z-20 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/80 via-black/40 to-transparent">
        <div className="flex items-center gap-3">
          <button
            type="button"
            id="close-high-res-camera-btn"
            onClick={onClose}
            className="p-2.5 rounded-full bg-slate-900/80 hover:bg-slate-800 text-white backdrop-blur-md transition-all active:scale-95 cursor-pointer border border-white/10"
            title="Exit Camera"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>

          {/* Page Badge */}
          <div className="flex items-center gap-1.5 px-3 py-1 bg-indigo-600/90 text-white text-xs font-black uppercase tracking-wider rounded-full backdrop-blur-md border border-indigo-400/40 shadow-lg">
            <span>Page {pageIndex}</span>
            <span className="text-indigo-200">/ {maxPages}</span>
          </div>
        </div>

        {/* Resolution & Sensor Stats */}
        <div className="flex items-center gap-2">
          <div
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-mono font-bold backdrop-blur-md border bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
          >
            <SparklesIcon className="h-3.5 w-3.5" />
            <span>
              1080p FHD ({activeResolution.width > 0 ? `${activeResolution.width}×${activeResolution.height}` : '1920×1080'})
            </span>
          </div>

          {/* Flash/Torch Switch */}
          {hasTorch && (
            <button
              type="button"
              id="torch-toggle-btn"
              onClick={toggleTorch}
              className={`p-2.5 rounded-full backdrop-blur-md transition-all active:scale-95 cursor-pointer border ${
                isTorchOn
                  ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-lg shadow-amber-400/30'
                  : 'bg-slate-900/80 text-white hover:bg-slate-800 border-white/10'
              }`}
              title="Toggle Torch"
            >
              <BoltIcon className="h-5 w-5" />
            </button>
          )}

          {/* Camera Switcher (if multiple lenses) */}
          {availableDevices.length > 1 && (
            <button
              type="button"
              id="switch-lens-btn"
              onClick={() => {
                const currentIndex = availableDevices.findIndex((d) => d.deviceId === selectedDeviceId);
                const nextDevice = availableDevices[(currentIndex + 1) % availableDevices.length];
                setSelectedDeviceId(nextDevice.deviceId);
              }}
              className="p-2.5 rounded-full bg-slate-900/80 hover:bg-slate-800 text-white backdrop-blur-md transition-all active:scale-95 cursor-pointer border border-white/10"
              title="Switch Camera Lens"
            >
              <ArrowPathIcon className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {/* Viewfinder Main Stage */}
      <div
        className="relative flex-1 w-full bg-black overflow-hidden flex items-center justify-center cursor-crosshair"
        onClick={handleTapToFocus}
      >
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="w-full h-full object-cover sm:object-contain transition-opacity duration-300"
        />

        {/* Shutter White Pulse Flash Overlay */}
        {shutterPulse && (
          <div className="absolute inset-0 z-40 bg-white animate-out fade-out duration-300 pointer-events-none" />
        )}

        {/* Optical Document Framing Overlay & Grid */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-6 md:p-12">
          {/* Subtle 3x3 Rule-of-Thirds Grid */}
          <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-15">
            <div className="border-r border-b border-white" />
            <div className="border-r border-b border-white" />
            <div className="border-b border-white" />
            <div className="border-r border-b border-white" />
            <div className="border-r border-b border-white" />
            <div className="border-b border-white" />
            <div className="border-r border-white" />
            <div className="border-r border-white" />
            <div />
          </div>

          {/* Document Alignment Bounds */}
          <div className="relative w-full max-w-lg aspect-[1/1.414] max-h-[78vh] rounded-2xl border-2 border-dashed border-indigo-400/60 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] flex flex-col justify-between p-4">
            {/* Corner L-Guides */}
            <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-indigo-400 rounded-tl-lg" />
            <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-indigo-400 rounded-tr-lg" />
            <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-indigo-400 rounded-bl-lg" />
            <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-indigo-400 rounded-br-lg" />

            {/* Top Prompt Badge */}
            <div className="self-center px-3 py-1 bg-black/75 backdrop-blur-md rounded-full text-[11px] font-semibold text-indigo-300 border border-indigo-500/30 shadow-md">
              Align Manifest / Receipt inside box
            </div>

            {/* Bottom Hint */}
            <div className="self-center text-center px-3 py-1 bg-black/75 backdrop-blur-md rounded-full text-[10px] text-slate-300 border border-white/10">
              Continuous macro auto-focus active • Tap anywhere to focus
            </div>
          </div>
        </div>

        {/* Tap-to-Focus Reticle Indicator */}
        {focusPoint && focusPoint.active && (
          <div
            className="absolute z-30 pointer-events-none transform -translate-x-1/2 -translate-y-1/2 w-14 h-14 border-2 border-amber-400 rounded-full animate-ping"
            style={{ left: `${focusPoint.x}px`, top: `${focusPoint.y}px` }}
          />
        )}
        {focusPoint && (
          <div
            className="absolute z-30 pointer-events-none transform -translate-x-1/2 -translate-y-1/2 w-12 h-12 border-2 border-amber-400 rounded-lg flex items-center justify-center transition-opacity"
            style={{ left: `${focusPoint.x}px`, top: `${focusPoint.y}px` }}
          >
            <div className="w-1.5 h-1.5 bg-amber-400 rounded-full" />
          </div>
        )}

        {/* Error Notification */}
        {errorMessage && (
          <div className="absolute inset-x-4 top-1/2 transform -translate-y-1/2 z-30 p-4 bg-rose-950/90 text-rose-200 border border-rose-600 rounded-2xl backdrop-blur-md text-center max-w-md mx-auto space-y-3">
            <p className="text-sm font-bold">{errorMessage}</p>
            <button
              type="button"
              onClick={() => startCamera(selectedDeviceId)}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl transition-all active:scale-95 cursor-pointer"
            >
              Retry Camera Access
            </button>
          </div>
        )}
      </div>

      {/* Optical Zoom Slider (if hardware supported) */}
      {zoomRange && zoomRange.max > zoomRange.min && (
        <div className="relative z-20 flex items-center justify-center gap-3 px-6 py-1.5 bg-black/80">
          <span className="text-[11px] font-mono text-slate-400">{zoomRange.min}×</span>
          <input
            type="range"
            min={zoomRange.min}
            max={zoomRange.max}
            step={0.1}
            value={zoomRange.current}
            onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
            className="w-48 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
          />
          <span className="text-[11px] font-mono text-indigo-400 font-bold">{zoomRange.current.toFixed(1)}×</span>
        </div>
      )}

      {/* Bottom Shutter & Controls Dock */}
      <div className="relative z-20 flex items-center justify-around px-6 py-5 bg-gradient-to-t from-black via-black/90 to-transparent">
        {/* Staged Pages Counter */}
        <div className="flex flex-col items-center justify-center min-w-[70px]">
          <span className="text-xs font-bold text-slate-400">Captured</span>
          <span className="text-base font-black text-indigo-400 font-mono">
            {stagedCount} / {maxPages}
          </span>
        </div>

        {/* Main High-Res Hardware Shutter Button */}
        <div className="relative flex items-center justify-center">
          <button
            type="button"
            id="high-res-shutter-trigger-btn"
            disabled={isCapturing || !streamActive}
            onClick={triggerCapture}
            className={`relative group w-20 h-20 rounded-full flex items-center justify-center transition-all cursor-pointer ${
              isCapturing ? 'scale-90 opacity-70' : 'hover:scale-105 active:scale-95'
            }`}
            title="Snap High-Res Photo"
          >
            {/* Outer Ring */}
            <div className="absolute inset-0 rounded-full border-4 border-white/80 group-hover:border-indigo-400 transition-colors shadow-2xl" />

            {/* Inner Core Shutter */}
            <div
              className={`w-15 h-15 rounded-full transition-all shadow-inner ${
                isCapturing
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-white group-hover:bg-indigo-500 active:bg-indigo-600'
              }`}
            />
          </button>
        </div>

        {/* Quick Close / Finish */}
        <div className="flex flex-col items-center justify-center min-w-[70px]">
          <button
            type="button"
            id="finish-camera-session-btn"
            onClick={onClose}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 text-xs font-bold rounded-xl border border-white/10 transition-all cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
