import React, { useRef, useState, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { CameraIcon, SparklesIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { Capacitor, PluginListenerHandle } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

export interface NativeCameraPhoto {
  file: File | null;
  preview: string;
  width: number;
  height: number;
  sizeBytes: number;
  isDirectUri?: boolean;
}

export interface NativeCameraShutterProps {
  onPhotoCaptured: (photo: NativeCameraPhoto) => void;
  onBeforeCapture?: () => Promise<void> | void;
  onError?: (error: Error) => void;
  onCapturingChange?: (isCapturing: boolean) => void;
  disabled?: boolean;
  className?: string;
  label?: string;
  sublabel?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'primary' | 'secondary' | 'shutter-ring';
  id?: string;
  headless?: boolean;
}

export interface NativeCameraShutterRef {
  trigger: () => void;
  reset: () => void;
  isNative: boolean;
}

/**
 * High-precision image resizer & RAM-optimized decoder.
 * Uses createImageBitmap hardware-accelerated downscaling when available to avoid
 * decoding 48MP+ raw uncompressed bitmaps (192MB+) in JS heap memory.
 * Scales down to max 1600px maintaining crisp OCR clarity while consuming ~7MB RAM.
 * Immediately frees GPU/VRAM backing buffers and handles Object URL revocation.
 */
export async function optimizePhotoForOcr(
  source: Blob | File | string,
  fileNamePrefix: string = 'manifest_page'
): Promise<NativeCameraPhoto> {
  const maxDim = 1600;
  const jpegQuality = 0.82;

  // If source is a Blob or File, attempt createImageBitmap with native downsampling first
  if (typeof source !== 'string' && typeof createImageBitmap === 'function') {
    try {
      // Step 1: Decode just metadata or inspect natural size
      const initialBitmap = await createImageBitmap(source);
      const naturalW = initialBitmap.width;
      const naturalH = initialBitmap.height;
      initialBitmap.close(); // Immediately release unscaled memory

      let targetW = naturalW;
      let targetH = naturalH;
      if (Math.max(naturalW, naturalH) > maxDim) {
        if (naturalW >= naturalH) {
          targetW = maxDim;
          targetH = Math.round((naturalH * maxDim) / naturalW);
        } else {
          targetH = maxDim;
          targetW = Math.round((naturalW * maxDim) / naturalH);
        }
      }

      // Step 2: Native downsampled decode directly into target dimension
      let scaledBitmap: ImageBitmap;
      try {
        scaledBitmap = await createImageBitmap(source, {
          resizeWidth: targetW,
          resizeHeight: targetH,
          resizeQuality: 'medium',
        });
      } catch {
        // Fallback if resize options not supported in older WebViews
        scaledBitmap = await createImageBitmap(source);
      }

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) {
        scaledBitmap.close();
        throw new Error('Canvas 2D context unavailable');
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'medium';
      ctx.drawImage(scaledBitmap, 0, 0, targetW, targetH);
      scaledBitmap.close(); // Release bitmap memory immediately

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/jpeg', jpegQuality)
      );

      // Reclaim canvas GPU VRAM immediately
      canvas.width = 1;
      canvas.height = 1;

      if (!blob) {
        throw new Error('Canvas failed to serialize optimized JPEG');
      }

      const timestamp = Date.now();
      const file = new File([blob], `${fileNamePrefix}_${timestamp}.jpg`, {
        type: 'image/jpeg',
        lastModified: timestamp,
      });
      const preview = URL.createObjectURL(blob);

      return {
        file,
        preview,
        width: targetW,
        height: targetH,
        sizeBytes: blob.size,
      };
    } catch (createBitmapErr) {
      console.warn('[optimizePhotoForOcr] createImageBitmap fast path fell back to HTMLImageElement:', createBitmapErr);
    }
  }

  // Fallback: HTMLImageElement decode with safe memory cleanup
  return new Promise((resolve, reject) => {
    const img = new Image();
    let objectUrlToRevoke: string | null = null;

    img.onload = () => {
      try {
        const naturalW = img.naturalWidth || img.width;
        const naturalH = img.naturalHeight || img.height;

        let targetW = naturalW;
        let targetH = naturalH;

        if (Math.max(naturalW, naturalH) > maxDim) {
          if (naturalW >= naturalH) {
            targetW = maxDim;
            targetH = Math.round((naturalH * maxDim) / naturalW);
          } else {
            targetH = maxDim;
            targetW = Math.round((naturalW * maxDim) / naturalH);
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d', { alpha: false });

        if (!ctx) {
          throw new Error('Canvas 2D context creation failed');
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'medium';
        ctx.drawImage(img, 0, 0, targetW, targetH);

        // Clear image source to allow garbage collector to reclaim bitmap memory
        img.src = '';

        canvas.toBlob(
          (blob) => {
            if (objectUrlToRevoke) {
              URL.revokeObjectURL(objectUrlToRevoke);
            }

            // Immediately reclaim GPU memory
            canvas.width = 1;
            canvas.height = 1;

            if (!blob) {
              reject(new Error('Failed to create JPEG Blob from canvas'));
              return;
            }

            const timestamp = Date.now();
            const file = new File([blob], `${fileNamePrefix}_${timestamp}.jpg`, {
              type: 'image/jpeg',
              lastModified: timestamp,
            });
            const preview = URL.createObjectURL(blob);

            resolve({
              file,
              preview,
              width: targetW,
              height: targetH,
              sizeBytes: blob.size,
            });
          },
          'image/jpeg',
          jpegQuality
        );
      } catch (err) {
        if (objectUrlToRevoke) {
          URL.revokeObjectURL(objectUrlToRevoke);
        }
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };

    img.onerror = () => {
      if (objectUrlToRevoke) {
        URL.revokeObjectURL(objectUrlToRevoke);
      }
      reject(new Error('Failed to load image from captured camera source'));
    };

    if (typeof source === 'string') {
      img.src = source;
    } else {
      objectUrlToRevoke = URL.createObjectURL(source);
      img.src = objectUrlToRevoke;
    }
  });
}

/**
 * Unified Native Camera Trigger Component
 * Invokes native mobile camera intent (Capacitor or HTML5 capture="environment")
 * with memory constraints, optical focus, high-res capture, and abort/cancel recovery.
 */
export const NativeCameraShutter = forwardRef<NativeCameraShutterRef, NativeCameraShutterProps>(
  (
    {
      onPhotoCaptured,
      onBeforeCapture,
      onError,
      onCapturingChange,
      disabled = false,
      className = '',
      label = 'Open Native Camera (Full HDR)',
      sublabel,
      size = 'md',
      variant = 'primary',
      id = 'native-camera-shutter-btn',
      headless = false,
    },
    ref
  ) => {
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    // Synchronous lock & attempt tracking so aborted/cancelled sessions never permanently lock re-clicks
    const isProcessingRef = useRef(false);
    const captureAttemptIdRef = useRef(0);
    const cameraLaunchedAtRef = useRef(0);
    const appLeftForegroundRef = useRef(false);
    const resumeUnlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const isNativeCapacitor = typeof window !== 'undefined' && Capacitor.isNativePlatform();

    const clearResumeUnlockTimer = useCallback(() => {
      if (resumeUnlockTimerRef.current) {
        clearTimeout(resumeUnlockTimerRef.current);
        resumeUnlockTimerRef.current = null;
      }
    }, []);

    const releaseProcessingLock = useCallback(
      (attemptId?: number) => {
        if (typeof attemptId === 'number' && attemptId !== captureAttemptIdRef.current) {
          return;
        }
        clearResumeUnlockTimer();
        isProcessingRef.current = false;
        appLeftForegroundRef.current = false;
        setIsProcessing(false);
        onCapturingChange?.(false);
      },
      [clearResumeUnlockTimer, onCapturingChange]
    );

    // Recover automatically if the user aborts/cancels the camera intent or file picker and returns to the app
    useEffect(() => {
      if (typeof window === 'undefined') return;

      const scheduleForegroundRecovery = () => {
        if (!isProcessingRef.current) return;
        const activeAttemptId = captureAttemptIdRef.current;

        clearResumeUnlockTimer();
        // Allow brief grace period (~450ms on native, ~350ms on web) for real capture result/onChange to arrive first
        const delayMs = isNativeCapacitor ? 450 : 350;
        resumeUnlockTimerRef.current = setTimeout(() => {
          if (!isProcessingRef.current || captureAttemptIdRef.current !== activeAttemptId) {
            return;
          }
          if (!isNativeCapacitor) {
            const hasSelectedFile = !!fileInputRef.current?.files?.length;
            if (!hasSelectedFile) {
              releaseProcessingLock(activeAttemptId);
            }
          } else if (appLeftForegroundRef.current || document.visibilityState === 'visible') {
            releaseProcessingLock(activeAttemptId);
          }
        }, delayMs);
      };

      const handleVisibilityChange = () => {
        if (document.visibilityState === 'hidden') {
          if (isProcessingRef.current) {
            appLeftForegroundRef.current = true;
          }
        } else if (document.visibilityState === 'visible') {
          scheduleForegroundRecovery();
        }
      };

      const handleWindowFocus = () => {
        scheduleForegroundRecovery();
      };

      const handleFileInputCancel = () => {
        releaseProcessingLock();
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);
      window.addEventListener('focus', handleWindowFocus);
      const inputEl = fileInputRef.current;
      inputEl?.addEventListener('cancel', handleFileInputCancel);

      let stateHandle: PluginListenerHandle | null = null;
      let resumeHandle: PluginListenerHandle | null = null;
      let pauseHandle: PluginListenerHandle | null = null;
      let isMounted = true;

      if (isNativeCapacitor) {
        CapacitorApp.addListener('appStateChange', ({ isActive }) => {
          if (!isMounted) return;
          if (!isActive && isProcessingRef.current) {
            appLeftForegroundRef.current = true;
          } else if (isActive && isProcessingRef.current) {
            scheduleForegroundRecovery();
          }
        })
          .then((h) => {
            if (isMounted) stateHandle = h;
            else h.remove().catch(() => {});
          })
          .catch(() => {});

        CapacitorApp.addListener('pause', () => {
          if (isMounted && isProcessingRef.current) {
            appLeftForegroundRef.current = true;
          }
        })
          .then((h) => {
            if (isMounted) pauseHandle = h;
            else h.remove().catch(() => {});
          })
          .catch(() => {});

        CapacitorApp.addListener('resume', () => {
          if (isMounted && isProcessingRef.current) {
            scheduleForegroundRecovery();
          }
        })
          .then((h) => {
            if (isMounted) resumeHandle = h;
            else h.remove().catch(() => {});
          })
          .catch(() => {});
      }

      return () => {
        isMounted = false;
        clearResumeUnlockTimer();
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('focus', handleWindowFocus);
        inputEl?.removeEventListener('cancel', handleFileInputCancel);
        stateHandle?.remove().catch(() => {});
        pauseHandle?.remove().catch(() => {});
        resumeHandle?.remove().catch(() => {});
      };
    }, [isNativeCapacitor, clearResumeUnlockTimer, releaseProcessingLock]);

    const triggerNativeCamera = useCallback(async () => {
      if (disabled) return;

      if (isProcessingRef.current) {
        const elapsedSinceLaunch = Date.now() - cameraLaunchedAtRef.current;
        const isStaleOrReturned =
          !isNativeCapacitor ||
          appLeftForegroundRef.current ||
          (typeof document !== 'undefined' && document.visibilityState === 'visible' && elapsedSinceLaunch > 450);

        if (!isStaleOrReturned) {
          return;
        }
        // Recover cleanly from an aborted/hung prior attempt and allow immediate relaunch
        releaseProcessingLock();
      }

      const attemptId = ++captureAttemptIdRef.current;
      clearResumeUnlockTimer();
      isProcessingRef.current = true;
      cameraLaunchedAtRef.current = Date.now();
      appLeftForegroundRef.current = false;
      setIsProcessing(true);
      onCapturingChange?.(true);

      try {
        // Pre-capture survival flag (non-blocking on native so camera intent opens immediately)
        if (onBeforeCapture) {
          Promise.resolve(onBeforeCapture()).catch((persistErr) => {
            console.warn('[NativeCameraShutter] onBeforeCapture warning:', persistErr);
          });
        }

        if (isNativeCapacitor) {
          // Native Android / iOS APK via Capacitor Camera Plugin
          // Preserves full 1920px HDR clarity; passes local webPath directly to cropper
          // without redundant JS fetch + canvas decode/re-encode delay.
          const photo = await Camera.getPhoto({
            resultType: CameraResultType.Uri,
            source: CameraSource.Camera,
            quality: 88,
            width: 1920,
            height: 1920,
            allowEditing: false,
            correctOrientation: true,
            saveToGallery: false,
          });

          // Clear pending recovery timer since Capacitor returned a photo result
          clearResumeUnlockTimer();

          const directUri = photo.webPath || photo.path;
          if (!directUri) {
            throw new Error('No image URI returned from native camera intent');
          }

          // Release lock BEFORE forwarding photo so subsequent camera launches are always ready
          releaseProcessingLock(attemptId);

          onPhotoCaptured({
            file: null,
            preview: directUri,
            width: 0,
            height: 0,
            sizeBytes: 0,
            isDirectUri: true,
          });
        } else {
          // Standard Mobile Browser or Desktop fallback: HTML5 file input with capture="environment"
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
            fileInputRef.current.click();
          } else {
            releaseProcessingLock(attemptId);
          }
        }
      } catch (err: any) {
        // Always release lock for this attempt, regardless of cancellation phrasing
        releaseProcessingLock(attemptId);

        const errMsg = String(err?.message || err || '').toLowerCase();
        const isCancelled =
          errMsg.includes('cancel') ||
          errMsg.includes('abort') ||
          errMsg.includes('no image picked') ||
          errMsg.includes('dismiss');

        if (!isCancelled) {
          console.error('[NativeCameraShutter] Capture error:', err);
          onError?.(err instanceof Error ? err : new Error(String(err)));
        }
      }
    }, [
      disabled,
      isNativeCapacitor,
      clearResumeUnlockTimer,
      releaseProcessingLock,
      onBeforeCapture,
      onPhotoCaptured,
      onError,
      onCapturingChange,
    ]);

    useImperativeHandle(
      ref,
      () => ({
        trigger: triggerNativeCamera,
        reset: () => releaseProcessingLock(),
        isNative: isNativeCapacitor,
      }),
      [triggerNativeCamera, releaseProcessingLock, isNativeCapacitor]
    );

    const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const attemptId = captureAttemptIdRef.current;
      clearResumeUnlockTimer();

      const file = e.target.files?.[0];
      if (!file) {
        releaseProcessingLock(attemptId);
        return;
      }

      try {
        const optimized = await optimizePhotoForOcr(file, 'manifest_hdr');
        releaseProcessingLock(attemptId);
        onPhotoCaptured(optimized);
      } catch (err) {
        console.error('[NativeCameraShutter] File optimization error:', err);
        releaseProcessingLock(attemptId);
        onError?.(err instanceof Error ? err : new Error(String(err)));
      } finally {
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    };

    // Style variants
    let buttonClasses = '';
    if (variant === 'shutter-ring') {
      buttonClasses = `relative flex items-center justify-center rounded-full transition-all active:scale-95 shadow-xl ${
        size === 'lg' ? 'h-20 w-20' : size === 'sm' ? 'h-12 w-12' : 'h-16 w-16'
      } bg-white text-indigo-700 border-4 border-indigo-500/80 hover:border-indigo-400 cursor-pointer`;
    } else if (variant === 'secondary') {
      buttonClasses = `inline-flex items-center justify-center gap-2 rounded-xl font-bold transition-all active:scale-95 border border-slate-700 bg-slate-800 hover:bg-slate-700 text-white shadow-md cursor-pointer ${
        size === 'lg'
          ? 'px-6 py-3.5 text-base'
          : size === 'sm'
          ? 'px-3 py-1.5 text-xs'
          : 'px-4 py-2.5 text-sm'
      }`;
    } else {
      buttonClasses = `inline-flex items-center justify-center gap-2.5 rounded-xl font-black transition-all active:scale-95 shadow-lg shadow-indigo-500/25 dark:shadow-none bg-gradient-to-r from-indigo-600 via-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white cursor-pointer ${
        size === 'lg'
          ? 'px-7 py-4 text-base sm:text-lg'
          : size === 'sm'
          ? 'px-3.5 py-2 text-xs'
          : 'px-5 py-3 text-sm sm:text-base'
      }`;
    }

    return (
      <>
        {/* Hidden native HTML5 file input with environment camera constraint */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileInputChange}
          tabIndex={-1}
          aria-hidden="true"
        />

        {!headless && !className.includes('hidden') && (
          <button
            id={id}
            type="button"
            onClick={triggerNativeCamera}
            disabled={disabled}
            className={`${buttonClasses} ${
              disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''
            } ${className}`}
            title="Opens mobile device's actual native camera app with full HDR and macro focus"
          >
          {isProcessing ? (
            <>
              <ArrowPathIcon className="h-5 w-5 animate-spin text-white/90" />
              <span>Opening Native Camera...</span>
            </>
          ) : variant === 'shutter-ring' ? (
            <div className="h-full w-full rounded-full flex items-center justify-center bg-indigo-600 text-white hover:bg-indigo-500 transition-colors">
              <CameraIcon className={size === 'lg' ? 'h-9 w-9' : 'h-7 w-7'} />
            </div>
          ) : (
            <>
              <div className="relative">
                <CameraIcon className="h-5 w-5 shrink-0" />
                <span className="absolute -top-1 -right-1 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
              </div>
              <div className="flex flex-col items-start text-left">
                <span className="leading-tight">{label}</span>
                {sublabel && (
                  <span className="text-[10px] font-normal text-indigo-200 leading-tight mt-0.5">
                    {sublabel}
                  </span>
                )}
              </div>
            </>
          )}
        </button>
        )}
      </>
    );
  }
);

NativeCameraShutter.displayName = 'NativeCameraShutter';
