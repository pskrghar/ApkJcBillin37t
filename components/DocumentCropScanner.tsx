import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  CameraIcon,
  XMarkIcon,
  ArrowPathIcon,
  CheckIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
  AdjustmentsHorizontalIcon,
  SparklesIcon,
  PhotoIcon,
  EyeIcon,
  PlayIcon,
  PauseIcon,
} from "@heroicons/react/24/outline";

export interface CornerPoint {
  x: number; // 0 to 1 normalized
  y: number; // 0 to 1 normalized
}

export interface DocumentCorners {
  tl: CornerPoint;
  tr: CornerPoint;
  br: CornerPoint;
  bl: CornerPoint;
}

export interface CapturedDocumentPage {
  file: File;
  preview: string;
  base64: string;
  pageNumber: number;
  width: number;
  height: number;
  isAutoStraightened: boolean;
}

interface DocumentCropScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (pages: CapturedDocumentPage[]) => void;
  maxPages?: number;
  initialPages?: CapturedDocumentPage[];
}

/**
 * Fast client-side automated edge detection on HTML5 Canvas.
 * Finds the 4 corners of a white paper document against background.
 */
function detectDocumentCorners(
  canvas: HTMLCanvasElement
): { corners: DocumentCorners; confidence: number } {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return {
      corners: {
        tl: { x: 0.05, y: 0.05 },
        tr: { x: 0.95, y: 0.05 },
        br: { x: 0.95, y: 0.95 },
        bl: { x: 0.05, y: 0.95 },
      },
      confidence: 0,
    };
  }

  // Downscale to 320x240 for 5ms edge detection
  const workW = 320;
  const workH = Math.round((workW * canvas.height) / canvas.width);
  const workCanvas = document.createElement("canvas");
  workCanvas.width = workW;
  workCanvas.height = workH;
  const workCtx = workCanvas.getContext("2d");
  if (!workCtx) {
    return {
      corners: {
        tl: { x: 0.05, y: 0.05 },
        tr: { x: 0.95, y: 0.05 },
        br: { x: 0.95, y: 0.95 },
        bl: { x: 0.05, y: 0.95 },
      },
      confidence: 0,
    };
  }

  workCtx.drawImage(canvas, 0, 0, workW, workH);
  const imgData = workCtx.getImageData(0, 0, workW, workH);
  const data = imgData.data;

  // Convert to grayscale & compute brightness threshold
  const gray = new Uint8Array(workW * workH);
  let totalBrightness = 0;
  for (let i = 0; i < data.length; i += 4) {
    // Luminance formula
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    gray[i / 4] = lum;
    totalBrightness += lum;
  }
  const avgBrightness = totalBrightness / (workW * workH);
  // White document paper is typically brighter than surrounding background
  const threshold = Math.min(200, Math.max(120, avgBrightness * 1.15));

  // Scan inward from 4 directions to find paper boundaries
  let minX = workW,
    maxX = 0,
    minY = workH,
    maxY = 0;
  let topPoints: { x: number; y: number }[] = [];
  let bottomPoints: { x: number; y: number }[] = [];
  let leftPoints: { x: number; y: number }[] = [];
  let rightPoints: { x: number; y: number }[] = [];

  // Vertical scan
  for (let x = 10; x < workW - 10; x += 6) {
    for (let y = 10; y < workH - 10; y += 4) {
      if (gray[y * workW + x] > threshold) {
        topPoints.push({ x, y });
        if (y < minY) minY = y;
        break;
      }
    }
    for (let y = workH - 11; y >= 10; y -= 4) {
      if (gray[y * workW + x] > threshold) {
        bottomPoints.push({ x, y });
        if (y > maxY) maxY = y;
        break;
      }
    }
  }

  // Horizontal scan
  for (let y = 10; y < workH - 10; y += 6) {
    for (let x = 10; x < workW - 10; x += 4) {
      if (gray[y * workW + x] > threshold) {
        leftPoints.push({ x, y });
        if (x < minX) minX = x;
        break;
      }
    }
    for (let x = workW - 11; x >= 10; x -= 4) {
      if (gray[y * workW + x] > threshold) {
        rightPoints.push({ x, y });
        if (x > maxX) maxX = x;
        break;
      }
    }
  }

  // Calculate bounding region coverage
  const detectedWidth = maxX - minX;
  const detectedHeight = maxY - minY;
  const areaRatio = (detectedWidth * detectedHeight) / (workW * workH);

  if (areaRatio > 0.25 && detectedWidth > workW * 0.4 && detectedHeight > workH * 0.4) {
    // Refine 4 corners from detected extreme points
    // Top-Left: point minimizing (x + y)
    // Top-Right: point minimizing (-x + y)
    // Bottom-Right: point maximizing (x + y)
    // Bottom-Left: point maximizing (-x + y)
    const allPts = [...topPoints, ...bottomPoints, ...leftPoints, ...rightPoints];
    if (allPts.length >= 8) {
      let tlPt = allPts[0],
        trPt = allPts[0],
        brPt = allPts[0],
        blPt = allPts[0];
      let minSum = Infinity,
        minDiff = Infinity,
        maxSum = -Infinity,
        maxDiff = -Infinity;

      for (const pt of allPts) {
        const sum = pt.x + pt.y;
        const diff = pt.y - pt.x;
        if (sum < minSum) {
          minSum = sum;
          tlPt = pt;
        }
        if (sum > maxSum) {
          maxSum = sum;
          brPt = pt;
        }
        if (diff < minDiff) {
          minDiff = diff;
          trPt = pt;
        }
        if (diff > maxDiff) {
          maxDiff = diff;
          blPt = pt;
        }
      }

      // Add a safe 1% outward padding to prevent cutting text
      const pad = 0.01;
      return {
        corners: {
          tl: {
            x: Math.max(0.01, tlPt.x / workW - pad),
            y: Math.max(0.01, tlPt.y / workH - pad),
          },
          tr: {
            x: Math.min(0.99, trPt.x / workW + pad),
            y: Math.max(0.01, trPt.y / workH - pad),
          },
          br: {
            x: Math.min(0.99, brPt.x / workW + pad),
            y: Math.min(0.99, brPt.y / workH + pad),
          },
          bl: {
            x: Math.max(0.01, blPt.x / workW - pad),
            y: Math.min(0.99, blPt.y / workH + pad),
          },
        },
        confidence: Math.min(0.95, areaRatio + 0.3),
      };
    }
  }

  // Smart Inward 5% border margin default
  return {
    corners: {
      tl: { x: 0.05, y: 0.05 },
      tr: { x: 0.95, y: 0.05 },
      br: { x: 0.95, y: 0.95 },
      bl: { x: 0.05, y: 0.95 },
    },
    confidence: 0.5,
  };
}

/**
 * Performs high-precision perspective transformation warping to create a straightened,
 * flat rectangular document output (1600px width).
 */
function warpPerspective(
  sourceImg: HTMLImageElement | HTMLCanvasElement,
  corners: DocumentCorners,
  outputWidth: number = 1600
): HTMLCanvasElement {
  const srcW = sourceImg instanceof HTMLImageElement ? sourceImg.naturalWidth : sourceImg.width;
  const srcH = sourceImg instanceof HTMLImageElement ? sourceImg.naturalHeight : sourceImg.height;

  // Convert normalized corner points to source pixels
  const p0 = { x: corners.tl.x * srcW, y: corners.tl.y * srcH };
  const p1 = { x: corners.tr.x * srcW, y: corners.tr.y * srcH };
  const p2 = { x: corners.br.x * srcW, y: corners.br.y * srcH };
  const p3 = { x: corners.bl.x * srcW, y: corners.bl.y * srcH };

  // Calculate target aspect ratio based on average width and height of quadrilateral
  const topWidth = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  const bottomWidth = Math.hypot(p2.x - p3.x, p2.y - p3.y);
  const leftHeight = Math.hypot(p3.x - p0.x, p3.y - p0.y);
  const rightHeight = Math.hypot(p2.x - p1.x, p2.y - p1.y);

  const avgWidth = (topWidth + bottomWidth) / 2;
  const avgHeight = (leftHeight + rightHeight) / 2;
  const aspect = avgHeight > 0 && avgWidth > 0 ? avgHeight / avgWidth : 1.414; // Default A4 aspect ratio

  const outW = outputWidth;
  const outH = Math.round(outW * aspect);

  // High performance canvas projective warping using subdivision grid or inverse sampling
  const outCanvas = document.createElement("canvas");
  outCanvas.width = outW;
  outCanvas.height = outH;
  const outCtx = outCanvas.getContext("2d");
  if (!outCtx) return outCanvas;

  // Render source to an in-memory canvas for pixel sampling
  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = srcW;
  srcCanvas.height = srcH;
  const srcCtx = srcCanvas.getContext("2d");
  if (!srcCtx) return outCanvas;
  srcCtx.drawImage(sourceImg, 0, 0);

  // Compute Homography (Projective Matrix) mapping (x, y) in outCanvas to (u, v) in srcCanvas
  // Target points: (0,0), (outW,0), (outW,outH), (0,outH)
  // Source points: p0, p1, p2, p3
  const matrix = getPerspectiveTransform(
    [
      { x: 0, y: 0 },
      { x: outW, y: 0 },
      { x: outW, y: outH },
      { x: 0, y: outH },
    ],
    [p0, p1, p2, p3]
  );

  if (!matrix) {
    // Fallback: simple drawImage
    outCtx.drawImage(sourceImg, 0, 0, outW, outH);
    return outCanvas;
  }

  // For fast, high-quality rendering: subdivide into triangular patches
  // 32x32 grid subdivision produces flawless smoothness with hardware acceleration
  const gridX = 32;
  const gridY = 32;

  const dx = outW / gridX;
  const dy = outH / gridY;

  for (let gx = 0; gx < gridX; gx++) {
    for (let gy = 0; gy < gridY; gy++) {
      const x0 = gx * dx;
      const y0 = gy * dy;
      const x1 = (gx + 1) * dx;
      const y1 = (gy + 1) * dy;

      const pt0 = applyHomography(matrix, x0, y0);
      const pt1 = applyHomography(matrix, x1, y0);
      const pt2 = applyHomography(matrix, x1, y1);
      const pt3 = applyHomography(matrix, x0, y1);

      // Upper triangle: (x0,y0)-(x1,y0)-(x0,y1) -> pt0-pt1-pt3
      drawTriangle(outCtx, srcCanvas, x0, y0, x1, y0, x0, y1, pt0.x, pt0.y, pt1.x, pt1.y, pt3.x, pt3.y);

      // Lower triangle: (x1,y0)-(x1,y1)-(x0,y1) -> pt1-pt2-pt3
      drawTriangle(outCtx, srcCanvas, x1, y0, x1, y1, x0, y1, pt1.x, pt1.y, pt2.x, pt2.y, pt3.x, pt3.y);
    }
  }

  return outCanvas;
}

// 3x3 Homography Matrix Solver
function getPerspectiveTransform(
  src: { x: number; y: number }[],
  dst: { x: number; y: number }[]
): number[] | null {
  const a: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const sx = src[i].x;
    const sy = src[i].y;
    const dx = dst[i].x;
    const dy = dst[i].y;

    a.push([sx, sy, 1, 0, 0, 0, -sx * dx, -sy * dx]);
    b.push(dx);

    a.push([0, 0, 0, sx, sy, 1, -sx * dy, -sy * dy]);
    b.push(dy);
  }

  const h = solveLinearSystem(a, b);
  if (!h) return null;
  return [...h, 1];
}

function applyHomography(m: number[], x: number, y: number): { x: number; y: number } {
  const w = m[6] * x + m[7] * y + m[8];
  return {
    x: (m[0] * x + m[1] * y + m[2]) / (w || 1),
    y: (m[3] * x + m[4] * y + m[5]) / (w || 1),
  };
}

// Gaussian elimination linear system solver
function solveLinearSystem(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) {
        maxRow = k;
      }
    }
    const tmpA = A[i];
    A[i] = A[maxRow];
    A[maxRow] = tmpA;

    const tmpB = b[i];
    b[i] = b[maxRow];
    b[maxRow] = tmpB;

    if (Math.abs(A[i][i]) < 1e-10) return null;

    for (let k = i + 1; k < n; k++) {
      const c = -A[k][i] / A[i][i];
      for (let j = i; j < n; j++) {
        if (i === j) {
          A[k][j] = 0;
        } else {
          A[k][j] += c * A[i][j];
        }
      }
      b[k] += c * b[i];
    }
  }

  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = 0;
    for (let j = i + 1; j < n; j++) {
      sum += A[i][j] * x[j];
    }
    x[i] = (b[i] - sum) / A[i][i];
  }
  return x;
}

// Affine triangle texture mapping
function drawTriangle(
  ctx: CanvasRenderingContext2D,
  img: HTMLCanvasElement,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  u0: number,
  v0: number,
  u1: number,
  v1: number,
  u2: number,
  v2: number
) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.closePath();
  ctx.clip();

  // Compute affine transform from UV (source image) to XY (destination canvas)
  const denom = u0 * (v1 - v2) - u1 * (v0 - v2) + u2 * (v0 - v1);
  if (Math.abs(denom) > 1e-6) {
    const a = (x0 * (v1 - v2) - x1 * (v0 - v2) + x2 * (v0 - v1)) / denom;
    const b = (y0 * (v1 - v2) - y1 * (v0 - v2) + y2 * (v0 - v1)) / denom;
    const c = (u0 * (x1 - x2) - u1 * (x0 - x2) + u2 * (x0 - x1)) / denom;
    const d = (u0 * (y1 - y2) - u1 * (y0 - y2) + u2 * (y0 - y1)) / denom;
    const e = (x0 * (u1 * v2 - u2 * v1) + x1 * (u2 * v0 - u0 * v2) + x2 * (u0 * v1 - u1 * v0)) / denom;
    const f = (y0 * (u1 * v2 - u2 * v1) + y1 * (u2 * v0 - u0 * v2) + y2 * (u0 * v1 - u1 * v0)) / denom;

    ctx.transform(a, b, c, d, e, f);
    ctx.drawImage(img, 0, 0);
  }
  ctx.restore();
}

const EMPTY_INITIAL_PAGES: CapturedDocumentPage[] = [];

export const DocumentCropScanner: React.FC<DocumentCropScannerProps> = ({
  isOpen,
  onClose,
  onComplete,
  maxPages = 5,
  initialPages = EMPTY_INITIAL_PAGES,
}) => {
  // State machine: 'camera' -> 'review' (corner adjustment) -> 'preview'
  const [scannerMode, setScannerMode] = useState<"camera" | "review" | "preview">("camera");

  // Multi-page filmstrip state
  const [capturedPages, setCapturedPages] = useState<CapturedDocumentPage[]>([]);

  // Current working snapshot image
  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);
  const [rawImageElement, setRawImageElement] = useState<HTMLImageElement | null>(null);
  const [corners, setCorners] = useState<DocumentCorners>({
    tl: { x: 0.05, y: 0.05 },
    tr: { x: 0.95, y: 0.05 },
    br: { x: 0.95, y: 0.95 },
    bl: { x: 0.05, y: 0.95 },
  });
  const [detectionConfidence, setDetectionConfidence] = useState<number>(0);
  const [isAutoStraightened, setIsAutoStraightened] = useState<boolean>(true);

  // Rectified warped preview
  const [rectifiedPreviewSrc, setRectifiedPreviewSrc] = useState<string | null>(null);

  // Auto-Commit Timer (5.0 seconds countdown)
  const [countdown, setCountdown] = useState<number>(5.0);
  const [isTimerPaused, setIsTimerPaused] = useState<boolean>(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Double-commit & snap prevention guards
  const isCommittingRef = useRef<boolean>(false);
  const isSnappingRef = useRef<boolean>(false);
  const prevIsOpenRef = useRef<boolean>(false);

  // Store latest state values in refs for stable timer access
  const rawImageElementRef = useRef<HTMLImageElement | null>(null);
  rawImageElementRef.current = rawImageElement;
  const cornersRef = useRef<DocumentCorners>(corners);
  cornersRef.current = corners;
  const capturedPagesRef = useRef<CapturedDocumentPage[]>(capturedPages);
  capturedPagesRef.current = capturedPages;
  const isAutoStraightenedRef = useRef<boolean>(isAutoStraightened);
  isAutoStraightenedRef.current = isAutoStraightened;
  const maxPagesRef = useRef<number>(maxPages);
  maxPagesRef.current = maxPages;
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Camera stream refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");

  // Corner dragging state
  const [activeHandle, setActiveHandle] = useState<"tl" | "tr" | "br" | "bl" | null>(null);
  const svgOverlayRef = useRef<SVGSVGElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Clean reset ONLY when modal transitions from closed to open or open to closed
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      setCapturedPages(initialPages && initialPages.length > 0 ? [...initialPages] : []);
      setRawImageSrc(null);
      setRawImageElement(null);
      setRectifiedPreviewSrc(null);
      setScannerMode("camera");
      setCountdown(5.0);
      setIsTimerPaused(false);
      isCommittingRef.current = false;
      isSnappingRef.current = false;
    } else if (!isOpen && prevIsOpenRef.current) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setCapturedPages([]);
      setRawImageSrc(null);
      setRawImageElement(null);
      setRectifiedPreviewSrc(null);
      isCommittingRef.current = false;
      isSnappingRef.current = false;
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen]);

  // Initialize and clean up camera stream
  const startCamera = useCallback(async () => {
    setCameraError(null);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 2560, min: 1280 },
          height: { ideal: 1440, min: 720 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsCameraActive(true);
      }
    } catch (err: any) {
      console.warn("High-res camera error, attempting standard fallback:", err);
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode },
          audio: false,
        });
        streamRef.current = fallbackStream;
        if (videoRef.current) {
          videoRef.current.srcObject = fallbackStream;
          await videoRef.current.play();
          setIsCameraActive(true);
        }
      } catch (err2: any) {
        console.error("Camera access failed:", err2);
        setCameraError(
          "Camera access was blocked or is unavailable. Please check camera permissions or upload an image from your device."
        );
        setIsCameraActive(false);
      }
    }
  }, [facingMode]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  }, []);

  useEffect(() => {
    if (isOpen && scannerMode === "camera") {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, scannerMode, startCamera, stopCamera]);

  // Capture current camera frame onto offscreen canvas
  const handleSnapPhoto = () => {
    if (!videoRef.current || !isCameraActive || isSnappingRef.current) return;
    isSnappingRef.current = true;

    const video = videoRef.current;
    const vW = video.videoWidth || 1920;
    const vH = video.videoHeight || 1080;

    const canvas = document.createElement("canvas");
    canvas.width = vW;
    canvas.height = vH;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      isSnappingRef.current = false;
      return;
    }

    ctx.drawImage(video, 0, 0, vW, vH);

    // Run auto-edge detection
    const { corners: detected, confidence } = detectDocumentCorners(canvas);
    setCorners(detected);
    setDetectionConfidence(confidence);
    setIsAutoStraightened(confidence > 0.4);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setRawImageSrc(dataUrl);

    const img = new Image();
    img.onload = () => {
      setRawImageElement(img);
      stopCamera();
      setScannerMode("review");
      // 5-second countdown timer
      setCountdown(5.0);
      setIsTimerPaused(false);
      isCommittingRef.current = false;
      isSnappingRef.current = false;
    };
    img.onerror = () => {
      isSnappingRef.current = false;
    };
    img.src = dataUrl;
  };

  // Handle manual file selection (gallery)
  const handleManualFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setRawImageSrc(dataUrl);

      const img = new Image();
      img.onload = () => {
        setRawImageElement(img);

        // Run auto-edge detection on uploaded image
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const { corners: detected, confidence } = detectDocumentCorners(canvas);
          setCorners(detected);
          setDetectionConfidence(confidence);
          setIsAutoStraightened(confidence > 0.4);
        }

        stopCamera();
        setScannerMode("review");
        setCountdown(5.0);
        setIsTimerPaused(false);
        isCommittingRef.current = false;
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // 5-Second Countdown Timer Effect with synchronous cleanup
  useEffect(() => {
    if (scannerMode !== "review" || isTimerPaused) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 0.15) {
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          // Auto-commit current single page using latest state
          handleCommitCurrentPage(false);
          return 0;
        }
        return Number((prev - 0.1).toFixed(1));
      });
    }, 100);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [scannerMode, isTimerPaused]);

  // Pause timer when user touches/interacts with corners
  const pauseAutoCommitTimer = () => {
    setIsTimerPaused(true);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // Pointer drag events for corner handles
  const handlePointerDown = (handle: "tl" | "tr" | "br" | "bl", e: React.PointerEvent) => {
    pauseAutoCommitTimer();
    setActiveHandle(handle);
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!activeHandle || !svgOverlayRef.current) return;

    const rect = svgOverlayRef.current.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    const normX = Math.max(0.01, Math.min(0.99, clientX / rect.width));
    const normY = Math.max(0.01, Math.min(0.99, clientY / rect.height));

    setCorners((prev) => ({
      ...prev,
      [activeHandle]: { x: normX, y: normY },
    }));
    setIsAutoStraightened(false);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (activeHandle) {
      (e.target as Element).releasePointerCapture?.(e.pointerId);
      setActiveHandle(null);
    }
  };

  // Generate warped 1600px JPEG Blob and commit EXACTLY ONE page
  const handleCommitCurrentPage = (andNext: boolean = false) => {
    const rawImg = rawImageElementRef.current || rawImageElement;
    if (!rawImg || isCommittingRef.current) return;
    isCommittingRef.current = true;

    pauseAutoCommitTimer();

    const currentCorners = cornersRef.current || corners;
    const currentCaptured = capturedPagesRef.current || capturedPages;
    const currentIsAuto = isAutoStraightenedRef.current;
    const currentMaxPages = maxPagesRef.current;
    const currentOnComplete = onCompleteRef.current;

    // Perform perspective rectification warp to 1600px width
    const warpedCanvas = warpPerspective(rawImg, currentCorners, 1600);
    const dataUrl = warpedCanvas.toDataURL("image/jpeg", 0.82);
    const base64Data = dataUrl.replace(/^data:image\/jpeg;base64,/, "");

    // Convert to File object
    warpedCanvas.toBlob(
      (blob) => {
        if (!blob) {
          isCommittingRef.current = false;
          return;
        }

        const pageNum = currentCaptured.length + 1;
        const pageFile = new File([blob], `manifest_page_${pageNum}_${Date.now()}.jpg`, {
          type: "image/jpeg",
        });

        const newPage: CapturedDocumentPage = {
          file: pageFile,
          preview: dataUrl,
          base64: base64Data,
          pageNumber: pageNum,
          width: warpedCanvas.width,
          height: warpedCanvas.height,
          isAutoStraightened: currentIsAuto,
        };

        const updatedPages = [...currentCaptured, newPage];
        setCapturedPages(updatedPages);

        if (andNext && updatedPages.length < currentMaxPages) {
          // Proceed to next page in sequence
          setRawImageSrc(null);
          setRawImageElement(null);
          setRectifiedPreviewSrc(null);
          setScannerMode("camera");
          setCountdown(5.0);
          setIsTimerPaused(false);
          isCommittingRef.current = false;
          startCamera();
        } else {
          // Finished all pages or requested complete
          isCommittingRef.current = false;
          currentOnComplete(updatedPages);
        }
      },
      "image/jpeg",
      0.82
    );
  };

  // Remove a captured page from sequence
  const handleRemovePage = (index: number) => {
    const updated = capturedPages.filter((_, i) => i !== index).map((p, idx) => ({ ...p, pageNumber: idx + 1 }));
    setCapturedPages(updated);
  };

  // Completely clear all captured pages in the scanner
  const handleClearAllCapturedPages = () => {
    pauseAutoCommitTimer();
    setCapturedPages([]);
    setRawImageSrc(null);
    setRawImageElement(null);
    setRectifiedPreviewSrc(null);
    isCommittingRef.current = false;
    setScannerMode("camera");
    startCamera();
  };

  // Toggle straightened preview modal
  const handleTogglePreviewMode = () => {
    pauseAutoCommitTimer();
    if (scannerMode === "review" && rawImageElement) {
      const warpedCanvas = warpPerspective(rawImageElement, corners, 1200);
      setRectifiedPreviewSrc(warpedCanvas.toDataURL("image/jpeg", 0.85));
      setScannerMode("preview");
    } else if (scannerMode === "preview") {
      setScannerMode("review");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl bg-slate-950 rounded-3xl border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[96vh]">
        {/* Top Header Bar */}
        <div className="px-4 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-white shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-900/40">
              <CameraIcon className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black tracking-tight text-white flex items-center gap-2">
                <span>Document Viewfinder & Auto-Crop</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-900/60 text-indigo-300 border border-indigo-700/60">
                  Page {capturedPages.length + 1} of {maxPages}
                </span>
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all cursor-pointer"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Page Sequence Step Indicators */}
        <div className="px-4 py-2 bg-slate-900/70 border-b border-slate-800 flex items-center justify-between gap-1.5 overflow-x-auto shrink-0">
          <div className="flex items-center gap-2 text-xs font-bold">
            {Array.from({ length: maxPages }).map((_, idx) => {
              const isSaved = idx < capturedPages.length;
              const isCurrent = idx === capturedPages.length;
              return (
                <div
                  key={idx}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-black transition-all ${
                    isSaved
                      ? "bg-emerald-950/60 border-emerald-500/50 text-emerald-400"
                      : isCurrent
                      ? "bg-indigo-950 border-indigo-500 text-indigo-300 ring-2 ring-indigo-500/30"
                      : "bg-slate-900/50 border-slate-800 text-slate-500"
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      isSaved ? "bg-emerald-400" : isCurrent ? "bg-indigo-400 animate-pulse" : "bg-slate-700"
                    }`}
                  />
                  <span>Page {idx + 1}</span>
                  {isSaved && <CheckIcon className="h-3 w-3" />}
                </div>
              );
            })}
          </div>
          <span className="text-[11px] text-slate-400 font-medium hidden sm:inline">
            Sequential Manifest Scanner
          </span>
        </div>

        {/* Main View Area */}
        <div className="relative flex-1 bg-black flex items-center justify-center min-h-[320px] sm:min-h-[460px] overflow-hidden">
          {/* VIEW 1: Camera Viewfinder */}
          {scannerMode === "camera" && (
            <div className="relative w-full h-full flex items-center justify-center">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-contain max-h-[60vh] sm:max-h-[500px]"
              />

              {/* Viewfinder Target Framing Overlay */}
              <div className="absolute inset-4 sm:inset-8 pointer-events-none border-2 border-indigo-500/40 rounded-2xl flex flex-col justify-between p-3">
                <div className="flex justify-between">
                  <div className="w-6 h-6 border-t-4 border-l-4 border-indigo-400 rounded-tl-lg" />
                  <div className="w-6 h-6 border-t-4 border-r-4 border-indigo-400 rounded-tr-lg" />
                </div>
                <div className="text-center">
                  <span className="bg-slate-900/80 backdrop-blur-md text-indigo-300 text-[11px] sm:text-xs font-bold px-3 py-1 rounded-full border border-indigo-500/30">
                    Align white manifest paper inside frame
                  </span>
                </div>
                <div className="flex justify-between">
                  <div className="w-6 h-6 border-b-4 border-l-4 border-indigo-400 rounded-bl-lg" />
                  <div className="w-6 h-6 border-b-4 border-r-4 border-indigo-400 rounded-br-lg" />
                </div>
              </div>

              {cameraError && (
                <div className="absolute inset-4 bg-slate-900/95 backdrop-blur-md rounded-2xl flex flex-col items-center justify-center p-6 text-center text-white space-y-4">
                  <p className="text-amber-400 font-bold text-sm max-w-md">{cameraError}</p>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs rounded-xl flex items-center gap-2"
                    >
                      <PhotoIcon className="h-4 w-4" />
                      Upload from Device
                    </button>
                    <button
                      type="button"
                      onClick={startCamera}
                      className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl flex items-center gap-2"
                    >
                      <ArrowPathIcon className="h-4 w-4" />
                      Retry Camera
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* VIEW 2: Interactive Corner Adjustment & Auto-Crop Review */}
          {scannerMode === "review" && rawImageSrc && (
            <div className="relative w-full h-full flex items-center justify-center p-2">
              <div className="relative inline-block max-w-full max-h-[60vh] sm:max-h-[500px] select-none">
                <img
                  src={rawImageSrc}
                  alt="Captured Document"
                  className="max-w-full max-h-[60vh] sm:max-h-[500px] object-contain rounded-xl shadow-2xl"
                />

                {/* SVG Interactive Corner Overlay */}
                <svg
                  ref={svgOverlayRef}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  className="absolute inset-0 w-full h-full overflow-visible touch-none cursor-crosshair"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                >
                  {/* Highlighted warped document quadrilateral polygon */}
                  <polygon
                    points={`${corners.tl.x * 100},${corners.tl.y * 100} ${corners.tr.x * 100},${
                      corners.tr.y * 100
                    } ${corners.br.x * 100},${corners.br.y * 100} ${corners.bl.x * 100},${
                      corners.bl.y * 100
                    }`}
                    className="fill-indigo-500/25 stroke-indigo-400 stroke-[1.5] transition-colors"
                  />

                  {/* Corner Draggable Handles */}
                  {(["tl", "tr", "br", "bl"] as const).map((handle) => {
                    const pt = corners[handle];
                    const isActive = activeHandle === handle;
                    return (
                      <g key={handle}>
                        <circle
                          cx={pt.x * 100}
                          cy={pt.y * 100}
                          r={isActive ? 5 : 4}
                          onPointerDown={(e) => handlePointerDown(handle, e)}
                          className={`cursor-grab active:cursor-grabbing transition-all ${
                            isActive
                              ? "fill-amber-400 stroke-white stroke-2 shadow-lg"
                              : "fill-indigo-500 stroke-white stroke-[1.5]"
                          }`}
                        />
                        <text
                          x={pt.x * 100}
                          y={pt.y * 100 - (handle.includes("t") ? 5 : -7)}
                          textAnchor="middle"
                          className="text-[3.5px] font-black fill-white pointer-events-none drop-shadow-md select-none uppercase"
                        >
                          {handle}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>

              {/* Zero-Friction Auto-Commit Floating Badge */}
              <div className="absolute top-4 inset-x-0 flex justify-center pointer-events-none">
                <div className="bg-slate-900/90 backdrop-blur-md border border-indigo-500/50 text-white rounded-2xl px-4 py-2 shadow-2xl flex items-center gap-3 pointer-events-auto">
                  <div className="flex items-center gap-2">
                    <SparklesIcon className="h-4 w-4 text-emerald-400 animate-pulse" />
                    <div>
                      <span className="text-xs font-black text-white block leading-tight">
                        {isAutoStraightened ? "Auto-Straightened Document" : "Custom Adjusted Crop"}
                      </span>
                      <span className="text-[10px] text-slate-300">
                        {isTimerPaused ? "Auto-commit paused (adjust freely)" : `Auto-accepting in ${countdown}s`}
                      </span>
                    </div>
                  </div>

                  {!isTimerPaused ? (
                    <button
                      type="button"
                      onClick={pauseAutoCommitTimer}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-indigo-300 font-bold text-[11px] rounded-lg border border-slate-700 flex items-center gap-1 cursor-pointer"
                    >
                      <PauseIcon className="h-3 w-3" />
                      Adjust
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsTimerPaused(false)}
                      className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] rounded-lg flex items-center gap-1 cursor-pointer"
                    >
                      <PlayIcon className="h-3 w-3" />
                      Resume
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* VIEW 3: Straightened Preview Mode */}
          {scannerMode === "preview" && rectifiedPreviewSrc && (
            <div className="relative w-full h-full flex items-center justify-center p-4">
              <div className="relative bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[60vh] sm:max-h-[500px]">
                <img
                  src={rectifiedPreviewSrc}
                  alt="Rectified Straightened Document"
                  className="max-w-full max-h-[60vh] sm:max-h-[500px] object-contain"
                />
                <div className="absolute top-2 left-2 bg-emerald-600 text-white text-[10px] font-black px-2.5 py-1 rounded-full shadow">
                  ✓ Straightened 1600px Output
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Hidden manual file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleManualFileUpload}
        />

        {/* Bottom Control Actions */}
        <div className="px-4 py-3 bg-slate-900 border-t border-slate-800 flex flex-col gap-2.5 shrink-0">
          {scannerMode === "camera" ? (
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <PhotoIcon className="h-4 w-4 text-indigo-400" />
                Gallery
              </button>

              {/* Shutter Snap Button */}
              <button
                type="button"
                onClick={handleSnapPhoto}
                className="h-14 w-14 rounded-full bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white flex items-center justify-center shadow-lg shadow-indigo-900/60 ring-4 ring-indigo-500/30 transition-all cursor-pointer"
                title="Snap Document Photo"
              >
                <CameraIcon className="h-7 w-7" />
              </button>

              <button
                type="button"
                onClick={() => setFacingMode((prev) => (prev === "environment" ? "user" : "environment"))}
                className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <ArrowPathIcon className="h-4 w-4 text-amber-400" />
                Flip
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {/* Retake */}
              <button
                type="button"
                onClick={() => {
                  pauseAutoCommitTimer();
                  setRawImageSrc(null);
                  setRawImageElement(null);
                  setScannerMode("camera");
                  startCamera();
                }}
                className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <ArrowPathIcon className="h-4 w-4 text-amber-400" />
                Retake
              </button>

              {/* Toggle Rectified Preview */}
              <button
                type="button"
                onClick={handleTogglePreviewMode}
                className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <EyeIcon className="h-4 w-4 text-indigo-400" />
                {scannerMode === "preview" ? "Edit Corners" : "Preview Warp"}
              </button>

              {/* Save & Next (if pages < maxPages) */}
              {capturedPages.length + 1 < maxPages ? (
                <button
                  type="button"
                  onClick={() => handleCommitCurrentPage(true)}
                  className="py-2.5 px-3 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-black text-xs rounded-xl shadow-md shadow-indigo-900/40 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <CameraIcon className="h-4 w-4" />
                  Next (Page {capturedPages.length + 2})
                </button>
              ) : null}

              {/* Done & Finalize */}
              <button
                type="button"
                onClick={() => handleCommitCurrentPage(false)}
                className={`py-2.5 px-3 ${
                  capturedPages.length + 1 >= maxPages ? "col-span-2" : ""
                } bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-black text-xs rounded-xl shadow-md shadow-emerald-900/40 flex items-center justify-center gap-1.5 transition-all cursor-pointer`}
              >
                <CheckIcon className="h-4 w-4" />
                Done (Save {capturedPages.length + 1} {capturedPages.length === 0 ? "Page" : "Pages"})
              </button>
            </div>
          )}

          {/* Captured Pages Filmstrip (at bottom) */}
          {capturedPages.length > 0 && (
            <div className="pt-2 border-t border-slate-800/80 flex items-center gap-2 overflow-x-auto pb-1">
              <span className="text-[10px] font-bold text-slate-400 shrink-0">Captured:</span>
              {capturedPages.map((page, idx) => (
                <div
                  key={idx}
                  className="relative shrink-0 w-16 h-18 rounded-lg bg-slate-800 border border-slate-700 overflow-hidden group shadow-sm"
                >
                  <img src={page.preview} alt={`Page ${idx + 1}`} className="w-full h-full object-cover" />
                  <div className="absolute top-0.5 left-0.5 bg-black/80 text-white text-[8px] font-black px-1 rounded">
                    P{idx + 1}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemovePage(idx)}
                    className="absolute top-0.5 right-0.5 p-0.5 bg-red-600/90 text-white rounded hover:bg-red-600 cursor-pointer"
                    title="Remove page"
                  >
                    <XMarkIcon className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
