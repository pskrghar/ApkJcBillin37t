import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ArrowPathIcon,
  CheckIcon,
  XMarkIcon,
  ArrowUturnLeftIcon,
  SparklesIcon,
  CameraIcon,
  ArrowsPointingOutIcon,
  EyeIcon,
  AdjustmentsHorizontalIcon,
} from '@heroicons/react/24/outline';

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

export interface PostCaptureCropperProps {
  isOpen: boolean;
  imageSrc: string | null;
  rawFile?: File | null;
  pageIndex: number;
  totalCapturedPages: number;
  maxPages?: number;
  captureMode?: 'in-app' | 'native';
  onChangeCaptureMode?: (mode: 'in-app' | 'native') => void;
  onConfirmCrop: (rectifiedFile: File, rectifiedPreview: string, andNext: boolean) => void;
  onRetake: () => void;
  onClose: () => void;
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

  // Gaussian elimination
  const n = b.length;
  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(a[k][i]) > Math.abs(a[maxRow][i])) maxRow = k;
    }
    const tmpA = a[i];
    a[i] = a[maxRow];
    a[maxRow] = tmpA;

    const tmpB = b[i];
    b[i] = b[maxRow];
    b[maxRow] = tmpB;

    if (Math.abs(a[i][i]) < 1e-10) return null;

    for (let k = i + 1; k < n; k++) {
      const c = -a[k][i] / a[i][i];
      for (let j = i; j < n; j++) {
        if (i === j) a[k][j] = 0;
        else a[k][j] += c * a[i][j];
      }
      b[k] += c * b[i];
    }
  }

  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = 0;
    for (let j = i + 1; j < n; j++) sum += a[i][j] * x[j];
    x[i] = (b[i] - sum) / a[i][i];
  }

  return [...x, 1];
}

function applyHomography(m: number[], x: number, y: number): { x: number; y: number } {
  const w = m[6] * x + m[7] * y + m[8];
  return {
    x: (m[0] * x + m[1] * y + m[2]) / (w || 1),
    y: (m[3] * x + m[4] * y + m[5]) / (w || 1),
  };
}

/**
 * Mathematically exact affine triangle mapping for perspective warping.
 * Maps triangle (u0,v0)-(u1,v1)-(u2,v2) in source image canvas
 * to (x0,y0)-(x1,y0)-(x2,y2) in destination canvas.
 */
function drawTriangle(
  ctx: CanvasRenderingContext2D,
  img: HTMLCanvasElement | HTMLImageElement,
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

/**
 * Fast automated paper edge detection on HTML5 Canvas.
 * Accepts either an HTMLImageElement or HTMLCanvasElement directly without
 * allocating redundant full-resolution intermediate canvases.
 */
function detectDocumentCorners(
  source: HTMLCanvasElement | HTMLImageElement
): { corners: DocumentCorners; confidence: number } {
  const defaultCorners: DocumentCorners = {
    tl: { x: 0.05, y: 0.05 },
    tr: { x: 0.95, y: 0.05 },
    br: { x: 0.95, y: 0.95 },
    bl: { x: 0.05, y: 0.95 },
  };

  const naturalW = source instanceof HTMLImageElement ? (source.naturalWidth || source.width) : source.width;
  const naturalH = source instanceof HTMLImageElement ? (source.naturalHeight || source.height) : source.height;

  if (!naturalW || !naturalH) return { corners: defaultCorners, confidence: 0 };

  const workW = 320;
  const workH = Math.round((workW * naturalH) / naturalW);
  const workCanvas = document.createElement('canvas');
  workCanvas.width = workW;
  workCanvas.height = workH;
  const workCtx = workCanvas.getContext('2d', { alpha: false });
  if (!workCtx) return { corners: defaultCorners, confidence: 0 };

  workCtx.drawImage(source, 0, 0, workW, workH);
  const imgData = workCtx.getImageData(0, 0, workW, workH);
  // Free work canvas RAM immediately
  workCanvas.width = 1;
  workCanvas.height = 1;

  const data = imgData.data;

  const gray = new Uint8Array(workW * workH);
  let totalBrightness = 0;
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    gray[i / 4] = lum;
    totalBrightness += lum;
  }
  const avgBrightness = totalBrightness / (workW * workH);
  const threshold = Math.min(200, Math.max(120, avgBrightness * 1.15));

  let minX = workW,
    maxX = 0,
    minY = workH,
    maxY = 0;
  const topPoints: { x: number; y: number }[] = [];
  const bottomPoints: { x: number; y: number }[] = [];
  const leftPoints: { x: number; y: number }[] = [];
  const rightPoints: { x: number; y: number }[] = [];

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

  const detectedWidth = maxX - minX;
  const detectedHeight = maxY - minY;
  const areaRatio = (detectedWidth * detectedHeight) / (workW * workH);

  if (areaRatio > 0.25 && detectedWidth > workW * 0.4 && detectedHeight > workH * 0.4) {
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

  return { corners: defaultCorners, confidence: 0.5 };
}

/**
 * Perspective rectification warping to create straightened, flat rectangular document.
 * Optimized grid sampling (12x12 instead of 32x32) prevents mobile browser main-thread freezes
 * and OOM memory crashes while preserving sharp text readability.
 */
function warpPerspective(
  sourceImg: HTMLImageElement | HTMLCanvasElement,
  corners: DocumentCorners,
  outputWidth: number = 1600,
  enhanceContrast: boolean = false
): HTMLCanvasElement {
  const srcW = sourceImg instanceof HTMLImageElement ? sourceImg.naturalWidth : sourceImg.width;
  const srcH = sourceImg instanceof HTMLImageElement ? sourceImg.naturalHeight : sourceImg.height;

  const p0 = { x: Math.max(0, Math.min(1, corners.tl.x)) * srcW, y: Math.max(0, Math.min(1, corners.tl.y)) * srcH };
  const p1 = { x: Math.max(0, Math.min(1, corners.tr.x)) * srcW, y: Math.max(0, Math.min(1, corners.tr.y)) * srcH };
  const p2 = { x: Math.max(0, Math.min(1, corners.br.x)) * srcW, y: Math.max(0, Math.min(1, corners.br.y)) * srcH };
  const p3 = { x: Math.max(0, Math.min(1, corners.bl.x)) * srcW, y: Math.max(0, Math.min(1, corners.bl.y)) * srcH };

  const topWidth = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  const bottomWidth = Math.hypot(p2.x - p3.x, p2.y - p3.y);
  const leftHeight = Math.hypot(p3.x - p0.x, p3.y - p0.y);
  const rightHeight = Math.hypot(p2.x - p1.x, p2.y - p1.y);

  const avgWidth = Math.max(10, (topWidth + bottomWidth) / 2);
  const avgHeight = Math.max(10, (leftHeight + rightHeight) / 2);
  const aspect = avgHeight / avgWidth;

  const outW = Math.min(1600, Math.max(800, Math.round(avgWidth > 0 ? outputWidth : 1600)));
  const outH = Math.round(outW * aspect);

  const outCanvas = document.createElement('canvas');
  outCanvas.width = outW;
  outCanvas.height = outH;
  const outCtx = outCanvas.getContext('2d', { alpha: false });
  if (!outCtx) return outCanvas;

  // Homography matrix mapping destination pixels -> source image coordinates
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
    outCtx.drawImage(sourceImg, 0, 0, outW, outH);
    return outCanvas;
  }

  // 12x12 grid yields 288 triangles directly from sourceImg (zero intermediate full-res canvas copy)
  const gridX = 12;
  const gridY = 12;
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

      drawTriangle(outCtx, sourceImg, x0, y0, x1, y0, x0, y1, pt0.x, pt0.y, pt1.x, pt1.y, pt3.x, pt3.y);
      drawTriangle(outCtx, sourceImg, x1, y0, x1, y1, x0, y1, pt1.x, pt1.y, pt2.x, pt2.y, pt3.x, pt3.y);
    }
  }

  if (enhanceContrast) {
    const imgData = outCtx.getImageData(0, 0, outW, outH);
    const d = imgData.data;
    const factor = 1.25;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = Math.min(255, Math.max(0, (d[i] - 128) * factor + 128));
      d[i + 1] = Math.min(255, Math.max(0, (d[i + 1] - 128) * factor + 128));
      d[i + 2] = Math.min(255, Math.max(0, (d[i + 2] - 128) * factor + 128));
    }
    outCtx.putImageData(imgData, 0, 0);
  }

  return outCanvas;
}

export const PostCaptureCropper: React.FC<PostCaptureCropperProps> = ({
  isOpen,
  imageSrc,
  rawFile,
  pageIndex,
  totalCapturedPages,
  maxPages = 5,
  captureMode = 'in-app',
  onChangeCaptureMode,
  onConfirmCrop,
  onRetake,
  onClose,
}) => {
  const [currentImageSrc, setCurrentImageSrc] = useState<string | null>(null);
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null);
  const [rotationAngle, setRotationAngle] = useState<number>(0);
  const [isProcessingWarp, setIsProcessingWarp] = useState<boolean>(false);
  const [enhanceContrast, setEnhanceContrast] = useState<boolean>(false);
  const [previewResultUrl, setPreviewResultUrl] = useState<string | null>(null);
  const [selectedCaptureMode, setSelectedCaptureMode] = useState<'in-app' | 'native'>(captureMode);

  useEffect(() => {
    if (captureMode) {
      setSelectedCaptureMode(captureMode);
    }
  }, [captureMode]);

  const [corners, setCorners] = useState<DocumentCorners>({
    tl: { x: 0.05, y: 0.05 },
    tr: { x: 0.95, y: 0.05 },
    br: { x: 0.95, y: 0.95 },
    bl: { x: 0.05, y: 0.95 },
  });

  const [activeCorner, setActiveCorner] = useState<keyof DocumentCorners | null>(null);
  const [activeEdge, setActiveEdge] = useState<'top' | 'bottom' | 'left' | 'right' | null>(null);
  const [activePointerPos, setActivePointerPos] = useState<{ x: number; y: number } | null>(null);
  const edgeDragStartRef = useRef<{ clientX: number; clientY: number; initialCorners: DocumentCorners } | null>(null);
  const [containerDimensions, setContainerDimensions] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  const [isImageLoading, setIsImageLoading] = useState<boolean>(Boolean(isOpen && imageSrc));
  const [imageLoadError, setImageLoadError] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const loupeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const skipAutoDetectOnNextLoadRef = useRef<boolean>(false);

  // Initialize or reset when imageSrc changes or modal opens (single-decode via rendered <img>)
  useEffect(() => {
    if (!isOpen || !imageSrc) {
      setCurrentImageSrc(null);
      setLoadedImage(null);
      setIsImageLoading(false);
      setImageLoadError(false);
      setRotationAngle(0);
      setIsProcessingWarp(false);
      setPreviewResultUrl(null);
      skipAutoDetectOnNextLoadRef.current = false;
      return;
    }

    skipAutoDetectOnNextLoadRef.current = false;
    setLoadedImage(null);
    setIsImageLoading(true);
    setImageLoadError(false);
    setCurrentImageSrc(imageSrc);
    setRotationAngle(0);
    setIsProcessingWarp(false);
    setPreviewResultUrl(null);
  }, [isOpen, imageSrc]);

  const handleImageElementLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const imgEl = e.currentTarget;
    setLoadedImage(imgEl);
    setIsImageLoading(false);
    setImageLoadError(false);

    if (skipAutoDetectOnNextLoadRef.current) {
      skipAutoDetectOnNextLoadRef.current = false;
      return;
    }

    requestAnimationFrame(() => {
      const { corners: detectedCorners } = detectDocumentCorners(imgEl);
      setCorners(detectedCorners);
    });
  }, []);

  const handleImageElementError = useCallback(() => {
    setIsImageLoading(false);
    setImageLoadError(true);
  }, []);

  // Monitor container size for pixel mapping
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setContainerDimensions({ width, height });
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [isOpen]);

  // Calculate rendered image bounds within container (object-fit: contain)
  const getImageRenderRect = useCallback(() => {
    if (!loadedImage || containerDimensions.width === 0 || containerDimensions.height === 0) {
      return { x: 0, y: 0, width: containerDimensions.width, height: containerDimensions.height };
    }

    const containerW = containerDimensions.width;
    const containerH = containerDimensions.height;
    const imgW = loadedImage.naturalWidth;
    const imgH = loadedImage.naturalHeight;

    const containerAspect = containerW / containerH;
    const imgAspect = imgW / imgH;

    let renderW = containerW;
    let renderH = containerH;
    let offsetX = 0;
    let offsetY = 0;

    if (containerAspect > imgAspect) {
      renderH = containerH;
      renderW = containerH * imgAspect;
      offsetX = (containerW - renderW) / 2;
    } else {
      renderW = containerW;
      renderH = containerW / imgAspect;
      offsetY = (containerH - renderH) / 2;
    }

    return { x: offsetX, y: offsetY, width: renderW, height: renderH };
  }, [loadedImage, containerDimensions]);

  // Update Loupe Magnifier canvas
  useEffect(() => {
    if (!activeCorner || !loadedImage || !loupeCanvasRef.current) return;
    const canvas = loupeCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cornerPt = corners[activeCorner];
    const srcX = cornerPt.x * loadedImage.naturalWidth;
    const srcY = cornerPt.y * loadedImage.naturalHeight;

    const zoom = 3.0;
    const loupeW = canvas.width;
    const loupeH = canvas.height;
    const sampleW = loupeW / zoom;
    const sampleH = loupeH / zoom;

    ctx.clearRect(0, 0, loupeW, loupeH);
    ctx.drawImage(
      loadedImage,
      srcX - sampleW / 2,
      srcY - sampleH / 2,
      sampleW,
      sampleH,
      0,
      0,
      loupeW,
      loupeH
    );

    // Crosshair in Loupe
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(loupeW / 2, 0);
    ctx.lineTo(loupeW / 2, loupeH);
    ctx.moveTo(0, loupeH / 2);
    ctx.lineTo(loupeW, loupeH / 2);
    ctx.stroke();

    // Center target dot
    ctx.fillStyle = '#f43f5e';
    ctx.beginPath();
    ctx.arc(loupeW / 2, loupeH / 2, 4, 0, Math.PI * 2);
    ctx.fill();
  }, [activeCorner, corners, loadedImage]);

  // Rotate image 90 degrees clockwise
  const handleRotateClockwise = useCallback(() => {
    if (!loadedImage) return;

    const oldW = loadedImage.naturalWidth;
    const oldH = loadedImage.naturalHeight;

    const canvas = document.createElement('canvas');
    canvas.width = oldH;
    canvas.height = oldW;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.translate(canvas.width, 0);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(loadedImage, 0, 0);

    const rotatedDataUrl = canvas.toDataURL('image/jpeg', 0.90);
    canvas.width = 1;
    canvas.height = 1;

    // Rotate corners 90 deg clockwise: (x, y) -> (1 - y, x) and let single <img> reload handle decode
    skipAutoDetectOnNextLoadRef.current = true;
    setCorners((prev) => ({
      tl: { x: Number((1 - prev.bl.y).toFixed(4)), y: Number(prev.bl.x.toFixed(4)) },
      tr: { x: Number((1 - prev.tl.y).toFixed(4)), y: Number(prev.tl.x.toFixed(4)) },
      br: { x: Number((1 - prev.tr.y).toFixed(4)), y: Number(prev.tr.x.toFixed(4)) },
      bl: { x: Number((1 - prev.br.y).toFixed(4)), y: Number(prev.br.x.toFixed(4)) },
    }));
    setRotationAngle((prev) => (prev + 90) % 360);
    setCurrentImageSrc(rotatedDataUrl);
  }, [loadedImage]);

  // Reset corners to 5% inward default
  const handleResetCorners = () => {
    setCorners({
      tl: { x: 0.05, y: 0.05 },
      tr: { x: 0.95, y: 0.05 },
      br: { x: 0.95, y: 0.95 },
      bl: { x: 0.05, y: 0.95 },
    });
  };

  // Auto detect edges
  const handleAutoDetectEdges = () => {
    if (!loadedImage) return;
    const { corners: detectedCorners } = detectDocumentCorners(loadedImage);
    setCorners(detectedCorners);
  };

  // Full 100% boundary
  const handleSnapFullImage = () => {
    setCorners({
      tl: { x: 0.005, y: 0.005 },
      tr: { x: 0.995, y: 0.005 },
      br: { x: 0.995, y: 0.995 },
      bl: { x: 0.005, y: 0.995 },
    });
  };

  // Live preview cropped result
  const handleGeneratePreview = () => {
    if (!loadedImage) return;
    try {
      const warpedCanvas = warpPerspective(loadedImage, corners, 1200, enhanceContrast);
      setPreviewResultUrl(warpedCanvas.toDataURL('image/jpeg', 0.92));
    } catch (e) {
      console.warn('Preview error:', e);
    }
  };

  // Convert pointer/touch position to normalized (0 to 1) image coordinates
  const getNormalizedPoint = useCallback(
    (clientX: number, clientY: number) => {
      if (!svgRef.current) return null;
      const rect = getImageRenderRect();
      const svgBox = svgRef.current.getBoundingClientRect();

      const screenX = clientX - svgBox.left;
      const screenY = clientY - svgBox.top;

      const normX = Math.max(0.005, Math.min(0.995, (screenX - rect.x) / rect.width));
      const normY = Math.max(0.005, Math.min(0.995, (screenY - rect.y) / rect.height));

      return { x: Number(normX.toFixed(4)), y: Number(normY.toFixed(4)) };
    },
    [getImageRenderRect]
  );

  const handlePointerDown = (cornerKey: keyof DocumentCorners, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveEdge(null);
    setActiveCorner(cornerKey);
    setActivePointerPos({ x: e.clientX, y: e.clientY });
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const handleEdgePointerDown = (edge: 'top' | 'bottom' | 'left' | 'right', e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveCorner(null);
    setActivePointerPos(null);
    setActiveEdge(edge);
    edgeDragStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      initialCorners: { ...corners },
    };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (activeCorner) {
      setActivePointerPos({ x: e.clientX, y: e.clientY });
      const pt = getNormalizedPoint(e.clientX, e.clientY);
      if (!pt) return;

      setCorners((prev) => ({
        ...prev,
        [activeCorner]: pt,
      }));
      return;
    }

    if (activeEdge && edgeDragStartRef.current) {
      const rect = getImageRenderRect();
      if (!rect.width || !rect.height) return;

      const dx = (e.clientX - edgeDragStartRef.current.clientX) / rect.width;
      const dy = (e.clientY - edgeDragStartRef.current.clientY) / rect.height;
      const init = edgeDragStartRef.current.initialCorners;

      if (activeEdge === 'top') {
        const maxTopAllowed = Math.min(init.bl.y, init.br.y) - 0.05;
        const newTlY = Math.max(0.005, Math.min(maxTopAllowed, init.tl.y + dy));
        const newTrY = Math.max(0.005, Math.min(maxTopAllowed, init.tr.y + dy));
        setCorners((prev) => ({
          ...prev,
          tl: { ...prev.tl, y: Number(newTlY.toFixed(4)) },
          tr: { ...prev.tr, y: Number(newTrY.toFixed(4)) },
        }));
      } else if (activeEdge === 'bottom') {
        const minBottomAllowed = Math.max(init.tl.y, init.tr.y) + 0.05;
        const newBlY = Math.min(0.995, Math.max(minBottomAllowed, init.bl.y + dy));
        const newBrY = Math.min(0.995, Math.max(minBottomAllowed, init.br.y + dy));
        setCorners((prev) => ({
          ...prev,
          bl: { ...prev.bl, y: Number(newBlY.toFixed(4)) },
          br: { ...prev.br, y: Number(newBrY.toFixed(4)) },
        }));
      } else if (activeEdge === 'left') {
        const maxLeftAllowed = Math.min(init.tr.x, init.br.x) - 0.05;
        const newTlX = Math.max(0.005, Math.min(maxLeftAllowed, init.tl.x + dx));
        const newBlX = Math.max(0.005, Math.min(maxLeftAllowed, init.bl.x + dx));
        setCorners((prev) => ({
          ...prev,
          tl: { ...prev.tl, x: Number(newTlX.toFixed(4)) },
          bl: { ...prev.bl, x: Number(newBlX.toFixed(4)) },
        }));
      } else if (activeEdge === 'right') {
        const minRightAllowed = Math.max(init.tl.x, init.bl.x) + 0.05;
        const newTrX = Math.min(0.995, Math.max(minRightAllowed, init.tr.x + dx));
        const newBrX = Math.min(0.995, Math.max(minRightAllowed, init.br.x + dx));
        setCorners((prev) => ({
          ...prev,
          tr: { ...prev.tr, x: Number(newTrX.toFixed(4)) },
          br: { ...prev.br, x: Number(newBrX.toFixed(4)) },
        }));
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (activeCorner) {
      try {
        (e.target as Element).releasePointerCapture?.(e.pointerId);
      } catch (err) {}
      setActiveCorner(null);
      setActivePointerPos(null);
    }
    if (activeEdge) {
      try {
        (e.target as Element).releasePointerCapture?.(e.pointerId);
      } catch (err) {}
      setActiveEdge(null);
      edgeDragStartRef.current = null;
    }
  };

  // Confirm crop and execute perspective rectification
  const handleConfirmAndProcess = useCallback(
    (andNext: boolean) => {
      if (!loadedImage || isProcessingWarp) return;

      setIsProcessingWarp(true);

      // Yield a single animation frame so the spinner renders, then run zero-copy warp immediately
      requestAnimationFrame(() => {
        try {
          const warpedCanvas = warpPerspective(loadedImage, corners, 1600, enhanceContrast);
          warpedCanvas.toBlob(
            (blob) => {
              // Immediately release warped canvas GPU VRAM
              warpedCanvas.width = 1;
              warpedCanvas.height = 1;

              if (!blob) {
                setIsProcessingWarp(false);
                return;
              }

              const timestamp = Date.now();
              const fileName = `manifest_rectified_p${pageIndex}_${timestamp}.jpg`;
              const rectifiedFile = new File([blob], fileName, { type: 'image/jpeg' });
              const rectifiedPreview = URL.createObjectURL(blob);

              setIsProcessingWarp(false);
              onConfirmCrop(rectifiedFile, rectifiedPreview, andNext);
            },
            'image/jpeg',
            0.88
          );
        } catch (err) {
          console.error('[PostCaptureCropper] Warp error:', err);
          setIsProcessingWarp(false);
        }
      });
    },
    [loadedImage, corners, enhanceContrast, isProcessingWarp, pageIndex, onConfirmCrop]
  );

  if (!isOpen || !imageSrc) return null;

  const renderRect = getImageRenderRect();

  // Convert normalized corner coordinates to SVG screen coordinates
  const cTL = {
    x: renderRect.x + corners.tl.x * renderRect.width,
    y: renderRect.y + corners.tl.y * renderRect.height,
  };
  const cTR = {
    x: renderRect.x + corners.tr.x * renderRect.width,
    y: renderRect.y + corners.tr.y * renderRect.height,
  };
  const cBR = {
    x: renderRect.x + corners.br.x * renderRect.width,
    y: renderRect.y + corners.br.y * renderRect.height,
  };
  const cBL = {
    x: renderRect.x + corners.bl.x * renderRect.width,
    y: renderRect.y + corners.bl.y * renderRect.height,
  };

  const hasReadyBounds = !!loadedImage && containerDimensions.width > 0 && containerDimensions.height > 0;
  const showPhotoLoader = (isImageLoading || !loadedImage) && !imageLoadError;
  const polyPath = `M ${cTL.x},${cTL.y} L ${cTR.x},${cTR.y} L ${cBR.x},${cBR.y} L ${cBL.x},${cBL.y} Z`;
  const maskW = containerDimensions.width > 0 ? containerDimensions.width : 4000;
  const maskH = containerDimensions.height > 0 ? containerDimensions.height : 4000;
  const maskPath = hasReadyBounds
    ? `M 0,0 H ${maskW} V ${maskH} H 0 Z ${polyPath}`
    : `M 0,0 H ${maskW} V ${maskH} H 0 Z`;

  const cornerEntries: { key: keyof DocumentCorners; label: string; pt: { x: number; y: number } }[] = [
    { key: 'tl', label: 'TL', pt: cTL },
    { key: 'tr', label: 'TR', pt: cTR },
    { key: 'br', label: 'BR', pt: cBR },
    { key: 'bl', label: 'BL', pt: cBL },
  ];

  return (
    <div
      id="post-capture-cropper-modal"
      className="fixed inset-0 h-[100dvh] z-50 flex flex-col bg-slate-950 text-white select-none animate-in fade-in duration-200 overflow-hidden"
    >
      {/* Top Header Bar */}
      <header className="shrink-0 flex items-center justify-between px-3 sm:px-4 pt-[max(0.75rem,env(safe-area-inset-top,0px))] pb-2.5 sm:py-3 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 z-20">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md">
            <SparklesIcon className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-black text-white">
                Adjust Document Corners & Straighten
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Page {pageIndex} of {maxPages}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">
              Drag corners to align paper boundaries • Saved image will be straightened
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Moved Confirm & Finish Button to Header */}
          <button
            id="cropper-confirm-finish-btn"
            type="button"
            onClick={() => handleConfirmAndProcess(false)}
            disabled={isProcessingWarp}
            className="px-3.5 sm:px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-black text-xs sm:text-sm rounded-xl shadow-lg shadow-emerald-900/50 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            title="Confirm all pages and save"
          >
            <CheckIcon className="h-4 w-4" />
            <span>
              {pageIndex >= maxPages
                ? 'Confirm All 5 Pages'
                : totalCapturedPages === 0
                ? 'Confirm & Save Page'
                : `Confirm & Finish (${totalCapturedPages + 1} Pages)`}
            </span>
          </button>

          <button
            type="button"
            onClick={handleGeneratePreview}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 active:scale-95 text-indigo-300 border border-indigo-500/30 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
            title="Preview straightened document"
          >
            <EyeIcon className="h-4 w-4 text-indigo-400" />
            <span className="hidden sm:inline">Preview Crop</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Cancel and Exit Cropper"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>
      </header>

      {/* Main Interactive Canvas Area */}
      <main
        ref={containerRef}
        className="relative flex-1 w-full overflow-hidden bg-black flex items-center justify-center cursor-crosshair touch-none"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {currentImageSrc && (
          <img
            ref={imgRef}
            src={currentImageSrc}
            alt="Captured Manifest"
            decoding="async"
            crossOrigin={
              currentImageSrc.startsWith('http') &&
              typeof window !== 'undefined' &&
              !currentImageSrc.startsWith(window.location.origin)
                ? 'anonymous'
                : undefined
            }
            onLoad={handleImageElementLoad}
            onError={handleImageElementError}
            className={`w-full h-full object-contain pointer-events-none transition-opacity duration-200 ${
              loadedImage ? 'opacity-100' : 'opacity-0'
            }`}
            style={{ filter: isProcessingWarp ? 'brightness(0.6)' : 'none' }}
          />
        )}

        {/* Responsive Overlay with Polygon Mask & Corner Handles */}
        <svg
          ref={svgRef}
          className="absolute inset-0 w-full h-full pointer-events-auto"
          style={{ touchAction: 'none' }}
        >
          {/* Dimmed backdrop outside document boundary (stays full-area while image loads) */}
          <path
            d={maskPath}
            fill={hasReadyBounds ? 'rgba(0, 0, 0, 0.55)' : 'rgba(2, 6, 23, 0.78)'}
            fillRule="evenodd"
            className="transition-all duration-200"
          />

          {hasReadyBounds && (
            <>
              {/* Glowing polygon document outline */}
              <polygon
                points={`${cTL.x},${cTL.y} ${cTR.x},${cTR.y} ${cBR.x},${cBR.y} ${cBL.x},${cBL.y}`}
                fill="rgba(99, 102, 241, 0.15)"
                stroke="#6366f1"
                strokeWidth="2.5"
                strokeDasharray="6 4"
              />

          {/* Diagonal guidelines for optical alignment */}
          <line
            x1={cTL.x}
            y1={cTL.y}
            x2={cBR.x}
            y2={cBR.y}
            stroke="rgba(255, 255, 255, 0.2)"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
          <line
            x1={cTR.x}
            y1={cTR.y}
            x2={cBL.x}
            y2={cBL.y}
            stroke="rgba(255, 255, 255, 0.2)"
            strokeWidth="1"
            strokeDasharray="3 3"
          />

          {/* 4 Interactive Edge Lines with Wide Hitboxes and Highlight Feedback */}
          {/* Top Edge (TL -> TR) */}
          <line
            x1={cTL.x}
            y1={cTL.y}
            x2={cTR.x}
            y2={cTR.y}
            stroke="transparent"
            strokeWidth="28"
            className="cursor-ns-resize"
            onPointerDown={(e) => handleEdgePointerDown('top', e)}
          />
          {activeEdge === 'top' && (
            <line
              x1={cTL.x}
              y1={cTL.y}
              x2={cTR.x}
              y2={cTR.y}
              stroke="#10b981"
              strokeWidth="4"
              pointerEvents="none"
              className="drop-shadow-md"
            />
          )}

          {/* Bottom Edge (BL -> BR) */}
          <line
            x1={cBL.x}
            y1={cBL.y}
            x2={cBR.x}
            y2={cBR.y}
            stroke="transparent"
            strokeWidth="28"
            className="cursor-ns-resize"
            onPointerDown={(e) => handleEdgePointerDown('bottom', e)}
          />
          {activeEdge === 'bottom' && (
            <line
              x1={cBL.x}
              y1={cBL.y}
              x2={cBR.x}
              y2={cBR.y}
              stroke="#10b981"
              strokeWidth="4"
              pointerEvents="none"
              className="drop-shadow-md"
            />
          )}

          {/* Left Edge (TL -> BL) */}
          <line
            x1={cTL.x}
            y1={cTL.y}
            x2={cBL.x}
            y2={cBL.y}
            stroke="transparent"
            strokeWidth="28"
            className="cursor-ew-resize"
            onPointerDown={(e) => handleEdgePointerDown('left', e)}
          />
          {activeEdge === 'left' && (
            <line
              x1={cTL.x}
              y1={cTL.y}
              x2={cBL.x}
              y2={cBL.y}
              stroke="#10b981"
              strokeWidth="4"
              pointerEvents="none"
              className="drop-shadow-md"
            />
          )}

          {/* Right Edge (TR -> BR) */}
          <line
            x1={cTR.x}
            y1={cTR.y}
            x2={cBR.x}
            y2={cBR.y}
            stroke="transparent"
            strokeWidth="28"
            className="cursor-ew-resize"
            onPointerDown={(e) => handleEdgePointerDown('right', e)}
          />
          {activeEdge === 'right' && (
            <line
              x1={cTR.x}
              y1={cTR.y}
              x2={cBR.x}
              y2={cBR.y}
              stroke="#10b981"
              strokeWidth="4"
              pointerEvents="none"
              className="drop-shadow-md"
            />
          )}

          {/* Midpoint Grip Capsules for 4 Edges */}
          {/* Top Edge Midpoint Grip */}
          <g
            transform={`translate(${(cTL.x + cTR.x) / 2}, ${(cTL.y + cTR.y) / 2})`}
            className="cursor-ns-resize select-none"
            onPointerDown={(e) => handleEdgePointerDown('top', e)}
          >
            <rect x="-24" y="-14" width="48" height="28" fill="transparent" />
            <rect
              x="-18"
              y="-7"
              width="36"
              height="14"
              rx="7"
              fill={activeEdge === 'top' ? '#10b981' : '#4f46e5'}
              stroke="#ffffff"
              strokeWidth="2"
              className="shadow-lg transition-colors"
            />
            <line x1="-7" y1="-3" x2="-7" y2="3" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="0" y1="-3" x2="0" y2="3" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="7" y1="-3" x2="7" y2="3" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
          </g>

          {/* Bottom Edge Midpoint Grip */}
          <g
            transform={`translate(${(cBL.x + cBR.x) / 2}, ${(cBL.y + cBR.y) / 2})`}
            className="cursor-ns-resize select-none"
            onPointerDown={(e) => handleEdgePointerDown('bottom', e)}
          >
            <rect x="-24" y="-14" width="48" height="28" fill="transparent" />
            <rect
              x="-18"
              y="-7"
              width="36"
              height="14"
              rx="7"
              fill={activeEdge === 'bottom' ? '#10b981' : '#4f46e5'}
              stroke="#ffffff"
              strokeWidth="2"
              className="shadow-lg transition-colors"
            />
            <line x1="-7" y1="-3" x2="-7" y2="3" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="0" y1="-3" x2="0" y2="3" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="7" y1="-3" x2="7" y2="3" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
          </g>

          {/* Left Edge Midpoint Grip */}
          <g
            transform={`translate(${(cTL.x + cBL.x) / 2}, ${(cTL.y + cBL.y) / 2})`}
            className="cursor-ew-resize select-none"
            onPointerDown={(e) => handleEdgePointerDown('left', e)}
          >
            <rect x="-14" y="-24" width="28" height="48" fill="transparent" />
            <rect
              x="-7"
              y="-18"
              width="14"
              height="36"
              rx="7"
              fill={activeEdge === 'left' ? '#10b981' : '#4f46e5'}
              stroke="#ffffff"
              strokeWidth="2"
              className="shadow-lg transition-colors"
            />
            <line x1="-3" y1="-7" x2="3" y2="-7" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="-3" y1="0" x2="3" y2="0" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="-3" y1="7" x2="3" y2="7" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
          </g>

          {/* Right Edge Midpoint Grip */}
          <g
            transform={`translate(${(cTR.x + cBR.x) / 2}, ${(cTR.y + cBR.y) / 2})`}
            className="cursor-ew-resize select-none"
            onPointerDown={(e) => handleEdgePointerDown('right', e)}
          >
            <rect x="-14" y="-24" width="28" height="48" fill="transparent" />
            <rect
              x="-7"
              y="-18"
              width="14"
              height="36"
              rx="7"
              fill={activeEdge === 'right' ? '#10b981' : '#4f46e5'}
              stroke="#ffffff"
              strokeWidth="2"
              className="shadow-lg transition-colors"
            />
            <line x1="-3" y1="-7" x2="3" y2="-7" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="-3" y1="0" x2="3" y2="0" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="-3" y1="7" x2="3" y2="7" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
          </g>

          {/* 4 Interactive Corner Handles */}
          {cornerEntries.map(({ key, label, pt }) => {
            const isCurrentActive = activeCorner === key;
            return (
              <g
                key={key}
                transform={`translate(${pt.x}, ${pt.y})`}
                className="cursor-pointer"
                onPointerDown={(e) => handlePointerDown(key, e)}
              >
                {/* Large 60px invisible hit-target for thumbs */}
                <circle r="30" fill="transparent" />

                {/* Outer animated halo when active */}
                {isCurrentActive && (
                  <circle
                    r="24"
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="3"
                    className="animate-ping opacity-75"
                  />
                )}

                {/* Outer high-contrast ring */}
                <circle
                  r={isCurrentActive ? 18 : 14}
                  fill="#ffffff"
                  stroke="#4f46e5"
                  strokeWidth={isCurrentActive ? 4 : 3}
                  className="shadow-xl transition-all"
                />

                {/* Inner colored dot */}
                <circle r={isCurrentActive ? 7 : 5} fill={isCurrentActive ? '#10b981' : '#4f46e5'} />

                {/* Corner Label Badge (TL, TR, BR, BL) */}
                <rect
                  x="-12"
                  y={key.startsWith('t') ? '-26' : '15'}
                  width="24"
                  height="14"
                  rx="4"
                  fill="rgba(15, 23, 42, 0.9)"
                  stroke="#475569"
                  strokeWidth="1"
                />
                <text
                  x="0"
                  y={key.startsWith('t') ? '-16' : '25'}
                  textAnchor="middle"
                  fill="#f8fafc"
                  fontSize="9"
                  fontWeight="bold"
                  fontFamily="sans-serif"
                >
                  {label}
                </text>
              </g>
            );
          })}
            </>
          )}
        </svg>

        {/* User-Friendly Sand Hourglass Loader over SVG Path Backdrop */}
        {showPhotoLoader && (
          <div
            role="status"
            aria-live="polite"
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-20 pointer-events-none px-4 animate-in fade-in duration-150"
          >
            <div className="px-6 py-5 rounded-3xl bg-slate-900/90 border border-amber-400/30 shadow-2xl shadow-black/70 flex flex-col items-center gap-3 backdrop-blur-md max-w-[260px] text-center">
              <div className="relative h-16 w-16 flex items-center justify-center rounded-2xl bg-slate-950/80 border border-amber-400/20 shadow-inner">
                <svg
                  viewBox="0 0 64 80"
                  className="h-14 w-12 overflow-visible drop-shadow-[0_2px_10px_rgba(251,191,36,0.28)]"
                  aria-hidden="true"
                >
                  <defs>
                    <linearGradient id="cropperSandGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#fde68a" />
                      <stop offset="55%" stopColor="#fbbf24" />
                      <stop offset="100%" stopColor="#d97706" />
                    </linearGradient>
                    <clipPath id="cropperHourglassTopClip">
                      <path d="M 20,12 H 44 V 20 C 44,30 33,36 32,39 C 31,36 20,30 20,20 Z" />
                    </clipPath>
                    <clipPath id="cropperHourglassBottomClip">
                      <path d="M 32,41 C 33,44 44,50 44,60 V 68 H 20 V 60 C 20,50 31,44 32,41 Z" />
                    </clipPath>
                  </defs>

                  <g className="animate-hourglass-flip">
                    {/* Top & bottom caps */}
                    <rect x="14" y="6" width="36" height="4.5" rx="2.25" fill="#94a3b8" />
                    <rect x="14" y="69.5" width="36" height="4.5" rx="2.25" fill="#94a3b8" />

                    {/* Soft inner glass tint */}
                    <path
                      d="M 18,10.5 H 46 V 20 C 46,32 34,37 33,40 C 34,43 46,48 46,60 V 69.5 H 18 V 60 C 18,48 30,43 31,40 C 30,37 18,32 18,20 Z"
                      fill="rgba(148, 163, 184, 0.08)"
                    />

                    {/* Upper sand draining smoothly */}
                    <g clipPath="url(#cropperHourglassTopClip)">
                      <rect
                        x="18"
                        y="12"
                        width="28"
                        height="27"
                        fill="url(#cropperSandGradient)"
                        className="animate-hourglass-sand-top"
                      />
                    </g>

                    {/* Trickling falling sand stream */}
                    <line
                      x1="32"
                      y1="39"
                      x2="32"
                      y2="67.5"
                      stroke="#fbbf24"
                      strokeWidth="2.2"
                      strokeDasharray="3 3"
                      strokeLinecap="round"
                      className="animate-hourglass-stream"
                    />

                    {/* Lower sand filling smoothly */}
                    <g clipPath="url(#cropperHourglassBottomClip)">
                      <rect
                        x="18"
                        y="41"
                        width="28"
                        height="27"
                        fill="url(#cropperSandGradient)"
                        className="animate-hourglass-sand-bottom"
                      />
                    </g>

                    {/* Outer glass frame */}
                    <path
                      d="M 18,10.5 H 46 V 20 C 46,32 34,37 33,40 C 34,43 46,48 46,60 V 69.5 H 18 V 60 C 18,48 30,43 31,40 C 30,37 18,32 18,20 Z"
                      fill="none"
                      stroke="#cbd5e1"
                      strokeWidth="2"
                      strokeLinejoin="round"
                    />
                  </g>
                </svg>
              </div>
              <div>
                <p className="text-sm font-black text-white tracking-wide">
                  Loading Your Photo...
                </p>
                <p className="text-[11px] text-slate-300 mt-0.5 leading-snug">
                  Please wait a moment while the full-resolution photo opens
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Friendly Retry State if Photo Could Not Be Decoded */}
        {imageLoadError && !loadedImage && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-20 px-4">
            <div className="px-5 py-4 rounded-2xl bg-slate-900/95 border border-rose-500/40 shadow-2xl flex flex-col items-center gap-3 text-center max-w-xs">
              <p className="text-sm font-bold text-white">Could not load captured photo</p>
              <p className="text-xs text-slate-400">
                Please tap Retake to capture the page again.
              </p>
              <button
                type="button"
                onClick={onRetake}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black cursor-pointer"
              >
                Retake Photo
              </button>
            </div>
          </div>
        )}

        {/* Active Corner Magnifier Loupe Floating Box */}
        {activeCorner && activePointerPos && (
          <div
            className="absolute z-40 pointer-events-none rounded-full overflow-hidden border-3 border-indigo-400 shadow-2xl shadow-black/90 bg-black flex items-center justify-center"
            style={{
              width: 120,
              height: 120,
              left: Math.max(16, Math.min(containerDimensions.width - 136, activePointerPos.x - 60)),
              top: Math.max(16, activePointerPos.y - 140),
            }}
          >
            <canvas
              ref={loupeCanvasRef}
              width={120}
              height={120}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Processing Indicator */}
        {isProcessingWarp && (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-30 animate-in fade-in duration-150">
            <ArrowPathIcon className="h-10 w-10 animate-spin text-indigo-400" />
            <p className="text-white font-black text-sm tracking-wide">
              Rectifying & Straightening Document...
            </p>
            <p className="text-slate-400 text-xs">Producing flat, high-contrast image for Gemini OCR</p>
          </div>
        )}

        {/* Live Rectified Preview Modal */}
        {previewResultUrl && (
          <div className="absolute inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="relative max-w-lg w-full max-h-[80vh] flex flex-col bg-slate-900 rounded-2xl border border-slate-700 overflow-hidden shadow-2xl">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950">
                <div className="flex items-center gap-2">
                  <EyeIcon className="h-5 w-5 text-indigo-400" />
                  <span className="text-sm font-bold text-white">Cropped & Straightened Result</span>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewResultUrl(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>
              <div className="flex-1 p-3 overflow-auto flex items-center justify-center bg-slate-950">
                <img
                  src={previewResultUrl}
                  alt="Rectified Preview"
                  className="max-h-[60vh] object-contain rounded-lg border border-slate-800 shadow-md"
                />
              </div>
              <div className="p-3 bg-slate-900 border-t border-slate-800 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setPreviewResultUrl(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl"
                >
                  Back to Adjust
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPreviewResultUrl(null);
                    handleConfirmAndProcess(false);
                  }}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-xl flex items-center gap-1.5"
                >
                  <CheckIcon className="h-4 w-4" />
                  <span>Looks Good, Save</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Bottom Action Control Bar */}
      <footer className="shrink-0 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 px-3 pt-2.5 sm:px-4 sm:pt-4 pb-[max(1rem,calc(env(safe-area-inset-bottom,0px)+0.75rem))] z-20">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-3">
          {/* Helper Tools: Retake, Rotate, Auto-Detect, Full, Reset */}
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-center">
            <button
              id="cropper-retake-btn"
              type="button"
              onClick={onRetake}
              disabled={isProcessingWarp}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 hover:text-white border border-slate-700 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
              title={`Discard photo and reopen ${selectedCaptureMode === 'native' ? 'Native Camera' : 'In-App Camera'}`}
            >
              <CameraIcon className="h-4 w-4 text-amber-400" />
              <span>Retake ({selectedCaptureMode === 'native' ? 'Native' : 'In-App'})</span>
            </button>

            <button
              id="cropper-rotate-btn"
              type="button"
              onClick={handleRotateClockwise}
              disabled={isProcessingWarp}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 hover:text-white border border-slate-700 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
              title="Rotate 90 degrees clockwise"
            >
              <ArrowPathIcon className="h-4 w-4 text-indigo-400" />
              <span>Rotate</span>
            </button>

            <button
              id="cropper-autodetect-btn"
              type="button"
              onClick={handleAutoDetectEdges}
              disabled={isProcessingWarp}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 hover:text-white border border-slate-700 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
              title="Auto-detect paper boundaries"
            >
              <SparklesIcon className="h-4 w-4 text-emerald-400" />
              <span>Auto-Edge</span>
            </button>

            <button
              id="cropper-full-btn"
              type="button"
              onClick={handleSnapFullImage}
              disabled={isProcessingWarp}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 hover:text-white border border-slate-700 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
              title="Snap to 100% full bounds"
            >
              <ArrowsPointingOutIcon className="h-4 w-4 text-cyan-400" />
              <span>100%</span>
            </button>

            <button
              id="cropper-reset-btn"
              type="button"
              onClick={handleResetCorners}
              disabled={isProcessingWarp}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 hover:text-white border border-slate-700 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
              title="Reset corners to default 5% border"
            >
              <ArrowUturnLeftIcon className="h-4 w-4 text-slate-400" />
              <span>Reset</span>
            </button>
          </div>

          {/* Single-Page & Sequential Actions Exclusively in Footer */}
          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            {pageIndex < maxPages ? (
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  id="cropper-confirm-next-btn"
                  type="button"
                  onClick={() => handleConfirmAndProcess(true)}
                  disabled={isProcessingWarp}
                  className="flex-1 sm:flex-none px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-black text-xs sm:text-sm rounded-xl shadow-lg shadow-indigo-900/50 flex items-center justify-center gap-2 transition-all cursor-pointer"
                  title={`Confirm this page and launch ${selectedCaptureMode === 'native' ? 'Native Camera' : 'In-App Camera'} for Page ${pageIndex + 1}`}
                >
                  <CameraIcon className="h-4 w-4" />
                  <span>
                    Confirm & Next Page ({selectedCaptureMode === 'native' ? 'Native Camera' : 'In-App Camera'} • Page {pageIndex + 1})
                  </span>
                </button>

                {/* Camera Mode Toggle for Next Page */}
                <div
                  className="flex items-center bg-slate-800/90 p-1 rounded-xl border border-slate-700 text-[10px] font-bold"
                  title="Switch camera mode for next page"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCaptureMode('in-app');
                      onChangeCaptureMode?.('in-app');
                    }}
                    className={`px-2 py-1 rounded-lg transition-all cursor-pointer ${
                      selectedCaptureMode === 'in-app'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title="Load In-App Camera for next page"
                  >
                    In-App
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCaptureMode('native');
                      onChangeCaptureMode?.('native');
                    }}
                    className={`px-2 py-1 rounded-lg transition-all cursor-pointer ${
                      selectedCaptureMode === 'native'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title="Load Native Camera for next page"
                  >
                    Native
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-xs font-bold text-slate-400 flex items-center gap-1.5 py-2 px-3 bg-slate-800/80 rounded-xl border border-slate-700">
                <SparklesIcon className="h-4 w-4 text-emerald-400" />
                <span>Final Page 5 reached — confirm and save in the top header</span>
              </div>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
};
