import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfWorker'; // Initialize PDF.js worker
import {
  XMarkIcon,
  ArrowDownTrayIcon,
  PrinterIcon,
  PencilSquareIcon,
  MagnifyingGlassPlusIcon,
  MagnifyingGlassMinusIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowPathIcon,
  ViewColumnsIcon,
  ListBulletIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline';

interface PdfViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  pdfData: Uint8Array | null;
  fileName: string;
  onDownload: () => void;
  onEdit: () => void;
  fontScale?: number;
  onChangeFontScale?: (nextScale: number) => void;
}

export const PdfViewerModal: React.FC<PdfViewerModalProps> = ({
  isOpen,
  onClose,
  pdfData,
  fileName,
  onDownload,
  onEdit,
  fontScale = 1.0,
  onChangeFontScale
}) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageInputValue, setPageInputValue] = useState<string>('1');
  const [scale, setScale] = useState<number>(1.25);
  const [rotation, setRotation] = useState<number>(0);
  const [viewMode, setViewMode] = useState<'continuous' | 'single'>('continuous');
  const [showThumbnails, setShowThumbnails] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRefs = useRef<{ [key: number]: HTMLCanvasElement | null }>({});
  const thumbRefs = useRef<{ [key: number]: HTMLCanvasElement | null }>({});
  const pageContainerRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});
  const isRenderingRef = useRef<{ [key: number]: boolean }>({});
  const renderTaskRef = useRef<{ [key: number]: any }>({});

  // Reset states when opening
  useEffect(() => {
    if (isOpen) {
      setCurrentPage(1);
      setPageInputValue('1');
      setScale(1.25);
      setRotation(0);
      setLoadError(null);
    }
  }, [isOpen]);

  // Load PDF Document
  useEffect(() => {
    if (!isOpen || !pdfData) {
      pdfDocRef.current = null;
      setNumPages(0);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setLoadError(null);
    isRenderingRef.current = {};

    const loadPdf = async () => {
      try {
        // Clone byte data to prevent detached ArrayBuffer issues if transferred
        const clonedData = new Uint8Array(pdfData.slice(0));
        const loadingTask = pdfjsLib.getDocument({
          data: clonedData,
          cMapUrl: 'https://unpkg.com/pdfjs-dist@6.3.289/cmaps/',
          cMapPacked: true
        });

        const doc = await loadingTask.promise;
        if (!isMounted) return;

        pdfDocRef.current = doc;
        setNumPages(doc.numPages);
        setCurrentPage((prev) => {
          const clamped = Math.min(Math.max(1, prev), doc.numPages);
          setPageInputValue(clamped.toString());
          return clamped;
        });
        setIsLoading(false);
      } catch (err: any) {
        if (!isMounted) return;
        console.error("In-app PDF viewer error:", err);
        setLoadError(err?.message || "Failed to parse PDF document for in-app viewing.");
        setIsLoading(false);
      }
    };

    loadPdf();

    return () => {
      isMounted = false;
    };
  }, [isOpen, pdfData]);

  // Render a specific page to a canvas with High-DPI
  const renderPage = useCallback(async (
    pageNum: number,
    targetCanvas: HTMLCanvasElement | null,
    renderScale: number,
    currentRotation: number
  ) => {
    if (!pdfDocRef.current || !targetCanvas) return;
    if (renderTaskRef.current[pageNum]) {
      try {
        renderTaskRef.current[pageNum].cancel();
      } catch {}
    }

    try {
      isRenderingRef.current[pageNum] = true;
      const page = await pdfDocRef.current.getPage(pageNum);
      const viewport = page.getViewport({ scale: renderScale, rotation: currentRotation });

      const dpr = window.devicePixelRatio || 1;
      targetCanvas.width = Math.floor(viewport.width * dpr);
      targetCanvas.height = Math.floor(viewport.height * dpr);
      targetCanvas.style.width = `${Math.floor(viewport.width)}px`;
      targetCanvas.style.height = `${Math.floor(viewport.height)}px`;

      const ctx = targetCanvas.getContext('2d');
      if (!ctx) {
        isRenderingRef.current[pageNum] = false;
        return;
      }

      ctx.save();
      ctx.scale(dpr, dpr);

      const renderContext = {
        canvasContext: ctx,
        viewport: viewport
      };

      const task = page.render(renderContext as any);
      renderTaskRef.current[pageNum] = task;
      await task.promise;
      ctx.restore();
    } catch (err: any) {
      if (err?.name !== 'RenderingCancelledException') {
        console.warn(`Render error on page ${pageNum}:`, err);
      }
    } finally {
      isRenderingRef.current[pageNum] = false;
    }
  }, []);

  // Trigger render when scale, rotation, mode, or page changes
  useEffect(() => {
    if (!pdfDocRef.current || numPages === 0 || isLoading) return;

    if (viewMode === 'continuous') {
      for (let p = 1; p <= numPages; p++) {
        renderPage(p, canvasRefs.current[p], scale, rotation);
      }
    } else {
      renderPage(currentPage, canvasRefs.current[currentPage], scale, rotation);
    }
  }, [numPages, scale, rotation, viewMode, currentPage, isLoading, renderPage]);

  // Render thumbnails
  useEffect(() => {
    if (!showThumbnails || !pdfDocRef.current || numPages === 0) return;

    const thumbScale = 0.22;
    for (let p = 1; p <= numPages; p++) {
      const thumbCanvas = thumbRefs.current[p];
      if (thumbCanvas) {
        renderPage(p, thumbCanvas, thumbScale, rotation);
      }
    }
  }, [showThumbnails, numPages, rotation, renderPage]);

  // Track current page on scroll in continuous mode
  const handleScroll = () => {
    if (viewMode !== 'continuous' || !containerRef.current) return;
    const containerTop = containerRef.current.scrollTop + 120;

    for (let p = 1; p <= numPages; p++) {
      const el = pageContainerRefs.current[p];
      if (el) {
        const offsetTop = el.offsetTop;
        const offsetBottom = offsetTop + el.offsetHeight;
        if (containerTop >= offsetTop && containerTop <= offsetBottom) {
          if (currentPage !== p) {
            setCurrentPage(p);
            setPageInputValue(p.toString());
          }
          break;
        }
      }
    }
  };

  const scrollToPage = (pageNum: number) => {
    const validPage = Math.max(1, Math.min(numPages, pageNum));
    setCurrentPage(validPage);
    setPageInputValue(validPage.toString());

    if (viewMode === 'continuous') {
      const el = pageContainerRefs.current[validPage];
      if (el && containerRef.current) {
        containerRef.current.scrollTo({
          top: el.offsetTop - 16,
          behavior: 'smooth'
        });
      }
    }
  };

  const handlePageInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseInt(pageInputValue, 10);
    if (!isNaN(val)) {
      scrollToPage(val);
    } else {
      setPageInputValue(currentPage.toString());
    }
  };

  const handleZoom = (delta: number) => {
    setScale((prev) => {
      const next = Math.min(2.5, Math.max(0.6, Math.round((prev + delta) * 100) / 100));
      return next;
    });
  };

  const handleFitWidth = () => {
    if (!containerRef.current) return;
    const availableWidth = containerRef.current.clientWidth - 80;
    // Standard A4 width is 595.28 points (~8.27 in * 72)
    const baseA4Width = 595;
    const calculatedScale = Math.min(2.2, Math.max(0.7, availableWidth / baseA4Width));
    setScale(Math.round(calculatedScale * 100) / 100);
  };

  const handleResetZoom = () => {
    setScale(1.0);
  };

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  // Safe and clean In-App Printing
  const handlePrint = () => {
    if (Capacitor.isNativePlatform()) {
      onDownload();
      return;
    }

    // Generate print pages HTML from high-res rendered canvases
    try {
      const images: string[] = [];
      for (let p = 1; p <= numPages; p++) {
        const c = canvasRefs.current[p];
        if (c) {
          images.push(c.toDataURL('image/png', 1.0));
        }
      }

      if (images.length > 0) {
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.write(`
            <!DOCTYPE html>
            <html>
              <head>
                <title>${fileName}</title>
                <style>
                  @page { size: A4 portrait; margin: 0.4in; }
                  html, body { margin: 0; padding: 0; background: #fff; }
                  .page-container {
                    page-break-after: always;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    margin: 0;
                    padding: 0;
                    height: 100%;
                  }
                  .page-container:last-child {
                    page-break-after: auto;
                  }
                  img {
                    width: 100%;
                    max-width: 100%;
                    height: auto;
                    display: block;
                  }
                </style>
              </head>
              <body>
                ${images.map((img) => `<div class="page-container"><img src="${img}" /></div>`).join('')}
                <script>
                  window.onload = function() {
                    window.focus();
                    window.print();
                    window.onafterprint = function() { window.close(); };
                  };
                </script>
              </body>
            </html>
          `);
          printWindow.document.close();
          return;
        }
      }
    } catch (e) {
      console.warn("Print window open fallback:", e);
    }
    // Fallback if popup blocked by iframe
    window.print();
  };

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        if (currentPage < numPages) {
          scrollToPage(currentPage + 1);
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        if (currentPage > 1) {
          scrollToPage(currentPage - 1);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentPage, numPages, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-1 sm:p-3 md:p-6 no-print animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl md:rounded-3xl shadow-2xl w-full max-w-6xl h-[95vh] flex flex-col overflow-hidden text-slate-100">
        {/* Top Control Bar */}
        <div className="px-3 sm:px-4 md:px-6 py-2.5 sm:py-3 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2.5 shrink-0 select-none">
          {/* Left: Document Info & Status */}
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 sm:p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              <PrinterIcon className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs sm:text-sm md:text-base font-black text-white truncate max-w-[200px] sm:max-w-[320px] md:max-w-md" title={fileName}>
                  {fileName}
                </h3>
                <span className="hidden sm:inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Built-in PDF Viewer
                </span>
              </div>
              <p className="text-[10px] sm:text-xs text-slate-400 font-medium">
                {numPages > 0 ? `${numPages} Page${numPages > 1 ? 's' : ''} • A4 Portrait • Native In-App Engine` : 'Rendering PDF statement...'}
              </p>
            </div>
          </div>

          {/* Center: Interactive Viewer Controls */}
          <div className="flex items-center flex-wrap gap-1 sm:gap-1.5 bg-slate-800/80 p-1 rounded-xl border border-slate-700/70">
            {/* Page Navigation */}
            <div className="flex items-center gap-1 px-1 border-r border-slate-700">
              <button
                onClick={() => scrollToPage(currentPage - 1)}
                disabled={currentPage <= 1 || isLoading}
                className="p-1 text-slate-300 hover:text-white hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-transparent rounded cursor-pointer transition-colors"
                title="Previous Page (Left Arrow)"
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </button>

              <form onSubmit={handlePageInputSubmit} className="flex items-center gap-1">
                <input
                  type="text"
                  value={pageInputValue}
                  onChange={(e) => setPageInputValue(e.target.value)}
                  onBlur={() => setPageInputValue(currentPage.toString())}
                  disabled={numPages <= 1 || isLoading}
                  className="w-8 sm:w-10 text-center text-xs font-bold bg-slate-900 text-white rounded border border-slate-700 py-0.5 focus:border-indigo-500 focus:outline-hidden"
                />
                <span className="text-xs text-slate-400 font-medium select-none">
                  / {numPages || 1}
                </span>
              </form>

              <button
                onClick={() => scrollToPage(currentPage + 1)}
                disabled={currentPage >= numPages || isLoading}
                className="p-1 text-slate-300 hover:text-white hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-transparent rounded cursor-pointer transition-colors"
                title="Next Page (Right Arrow)"
              >
                <ChevronRightIcon className="h-4 w-4" />
              </button>
            </div>

            {/* PDF Proportional Font Size Controls (Reflows PDF Text & Auto-Adjusts Rows/Page) */}
            {onChangeFontScale && (
              <div className="flex items-center gap-0.5 px-1.5 border-r border-slate-700" title="Adjust overall PDF font size & auto-adjust rows per page">
                <span className="text-[10px] font-black uppercase tracking-wider text-indigo-300 mr-1 hidden sm:inline">Font</span>
                <button
                  type="button"
                  onClick={() => onChangeFontScale(fontScale - 0.1)}
                  disabled={fontScale <= 0.7 || isLoading}
                  className="px-1.5 py-0.5 text-xs font-black text-slate-200 hover:text-white hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-transparent rounded cursor-pointer transition-colors"
                  title="Decrease PDF Font Size"
                >
                  A-
                </button>
                <button
                  type="button"
                  onClick={() => onChangeFontScale(1.0)}
                  className={`px-1.5 py-0.5 text-xs font-mono font-bold rounded transition-colors cursor-pointer ${
                    Math.abs(fontScale - 1.0) > 0.01
                      ? 'bg-indigo-600/40 text-indigo-200 hover:bg-indigo-600/60'
                      : 'text-slate-300 hover:text-white hover:bg-slate-700'
                  }`}
                  title="Reset PDF Font Size to 100%"
                >
                  {Math.round(fontScale * 100)}%
                </button>
                <button
                  type="button"
                  onClick={() => onChangeFontScale(fontScale + 0.1)}
                  disabled={fontScale >= 1.6 || isLoading}
                  className="px-1.5 py-0.5 text-xs font-black text-slate-200 hover:text-white hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-transparent rounded cursor-pointer transition-colors"
                  title="Increase PDF Font Size (auto-adjusts rows per page)"
                >
                  A+
                </button>
              </div>
            )}

            {/* Zoom Controls */}
            <div className="flex items-center gap-1 px-1 border-r border-slate-700">
              <button
                onClick={() => handleZoom(-0.15)}
                disabled={scale <= 0.6 || isLoading}
                className="p-1 text-slate-300 hover:text-white hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-transparent rounded cursor-pointer transition-colors"
                title="Zoom Out"
              >
                <MagnifyingGlassMinusIcon className="h-4 w-4" />
              </button>
              <button
                onClick={handleResetZoom}
                className="px-1.5 py-0.5 text-xs font-mono font-bold text-slate-300 hover:text-white hover:bg-slate-700 rounded transition-colors"
                title="Reset Zoom to 100%"
              >
                {Math.round(scale * 100)}%
              </button>
              <button
                onClick={() => handleZoom(0.15)}
                disabled={scale >= 2.5 || isLoading}
                className="p-1 text-slate-300 hover:text-white hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-transparent rounded cursor-pointer transition-colors"
                title="Zoom In"
              >
                <MagnifyingGlassPlusIcon className="h-4 w-4" />
              </button>
              <button
                onClick={handleFitWidth}
                className="hidden md:inline-block px-2 py-0.5 text-[11px] font-bold text-slate-300 hover:text-white hover:bg-slate-700 rounded transition-colors"
                title="Fit to Container Width"
              >
                Fit Width
              </button>
            </div>

            {/* Mode & Rotate Controls */}
            <div className="flex items-center gap-1 px-1">
              <button
                onClick={() => setViewMode((m) => (m === 'continuous' ? 'single' : 'continuous'))}
                className={`p-1 rounded cursor-pointer transition-colors ${
                  viewMode === 'continuous'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700'
                }`}
                title={viewMode === 'continuous' ? 'Continuous Scroll View' : 'Single Page View'}
              >
                {viewMode === 'continuous' ? (
                  <ListBulletIcon className="h-4 w-4" />
                ) : (
                  <ViewColumnsIcon className="h-4 w-4" />
                )}
              </button>

              <button
                onClick={() => setShowThumbnails((t) => !t)}
                className={`hidden lg:block p-1 rounded cursor-pointer transition-colors ${
                  showThumbnails
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700'
                }`}
                title="Toggle Page Thumbnails Sidebar"
              >
                <ViewColumnsIcon className="h-4 w-4" />
              </button>

              <button
                onClick={handleRotate}
                className="p-1 text-slate-300 hover:text-white hover:bg-slate-700 rounded cursor-pointer transition-colors"
                title="Rotate 90° Clockwise"
              >
                <ArrowPathIcon className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => {
                onClose();
                onEdit();
              }}
              className="px-2.5 sm:px-3 py-1.5 text-xs font-bold rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Close viewer and edit table rows"
            >
              <PencilSquareIcon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Edit / Modify</span>
            </button>

            <button
              onClick={handlePrint}
              className="px-2.5 sm:px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
              title="Print PDF statement"
            >
              <PrinterIcon className="h-3.5 w-3.5 text-indigo-400" />
              <span>Print</span>
            </button>

            <button
              onClick={onDownload}
              className="px-3 sm:px-4 py-1.5 text-xs font-black rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors flex items-center gap-1.5 shadow-md shadow-indigo-950 cursor-pointer"
              title="Download PDF File"
            >
              <ArrowDownTrayIcon className="h-3.5 w-3.5" />
              <span>Download PDF</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors ml-1 cursor-pointer"
              title="Close Viewer (Esc)"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Informational Sub-Strip */}
        <div className="px-4 py-1.5 bg-indigo-950/60 border-b border-indigo-900/40 flex items-center justify-between text-[11px] text-indigo-300 shrink-0">
          <div className="flex items-center gap-2">
            <InformationCircleIcon className="h-4 w-4 text-indigo-400 shrink-0" />
            <span>
              <strong>Independent In-App PDF Viewer:</strong> Renders multi-page statement canvas natively in the app without requiring browser PDF viewer plugins or popups.
            </span>
          </div>
          <div className="hidden sm:flex items-center gap-3 text-slate-400">
            <span>Scroll to navigate</span>
            <span>•</span>
            <span>PDF Font: {Math.round(fontScale * 100)}%</span>
            <span>•</span>
            <span>Zoom: {Math.round(scale * 100)}%</span>
            <span>•</span>
            <span>View: {viewMode === 'continuous' ? 'Continuous' : 'Single Page'}</span>
          </div>
        </div>

        {/* Main Canvas Stage & Optional Sidebar */}
        <div className="flex-1 flex overflow-hidden bg-slate-950">
          {/* Thumbnails Sidebar */}
          {showThumbnails && numPages > 1 && (
            <div className="w-48 bg-slate-900/90 border-r border-slate-800 p-3 overflow-y-auto shrink-0 flex flex-col gap-3 custom-scrollbar">
              <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-1">
                Pages ({numPages})
              </div>
              {Array.from({ length: numPages }, (_, i) => i + 1).map((p) => (
                <div
                  key={`thumb-${p}`}
                  onClick={() => scrollToPage(p)}
                  className={`p-2 rounded-xl border transition-all cursor-pointer flex flex-col items-center gap-1.5 ${
                    currentPage === p
                      ? 'border-indigo-500 bg-indigo-950/40 shadow-md shadow-indigo-950'
                      : 'border-slate-800 hover:border-slate-700 bg-slate-950/60'
                  }`}
                >
                  <div className="overflow-hidden rounded border border-slate-700 bg-white flex justify-center items-center">
                    <canvas
                      ref={(el) => {
                        thumbRefs.current[p] = el;
                      }}
                      className="w-full h-auto block"
                    />
                  </div>
                  <span className={`text-[11px] font-bold ${currentPage === p ? 'text-indigo-400' : 'text-slate-400'}`}>
                    Page {p}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Document Canvas Container */}
          <div
            ref={containerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-auto p-4 sm:p-6 md:p-8 flex flex-col items-center custom-scrollbar select-none"
          >
            {isLoading && (
              <div className="my-auto flex flex-col items-center gap-3 text-slate-300 py-16">
                <div className="w-10 h-10 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm font-bold tracking-wide">Rendering in-app PDF pages...</span>
                <span className="text-xs text-slate-500">Preparing high-resolution vector canvas</span>
              </div>
            )}

            {loadError && !isLoading && (
              <div className="my-auto max-w-md p-6 bg-red-950/50 border border-red-800/80 rounded-2xl text-center flex flex-col items-center gap-3">
                <div className="p-3 bg-red-900/40 text-red-300 rounded-full">
                  <XMarkIcon className="h-6 w-6" />
                </div>
                <h4 className="text-base font-bold text-white">Error Rendering In-App PDF</h4>
                <p className="text-xs text-red-200">{loadError}</p>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={onDownload}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold"
                  >
                    Direct Download File
                  </button>
                  <button
                    onClick={onClose}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}

            {!isLoading && !loadError && numPages > 0 && (
              <div className="flex flex-col items-center gap-8 py-2 w-full">
                {viewMode === 'continuous' ? (
                  // Continuous Scroll: Stack of all pages
                  Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
                    <div
                      key={`page-${pageNum}`}
                      ref={(el) => {
                        pageContainerRefs.current[pageNum] = el;
                      }}
                      className="flex flex-col items-center group relative"
                    >
                      {/* Page Label Badge */}
                      <div className="mb-2 self-start flex items-center gap-2">
                        <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                          Page {pageNum} of {numPages}
                        </span>
                      </div>

                      {/* Canvas Surface with A4 sheet styling */}
                      <div className="bg-white rounded-md shadow-2xl shadow-black/80 border border-slate-800 overflow-hidden flex justify-center items-center">
                        <canvas
                          ref={(el) => {
                            canvasRefs.current[pageNum] = el;
                          }}
                          className="block max-w-none"
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  // Single Page Mode: Show only currentPage
                  <div
                    ref={(el) => {
                      pageContainerRefs.current[currentPage] = el;
                    }}
                    className="flex flex-col items-center relative"
                  >
                    {/* Floating Page Navigators */}
                    {currentPage > 1 && (
                      <button
                        onClick={() => scrollToPage(currentPage - 1)}
                        className="absolute left-[-50px] top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-slate-800/90 text-white hover:bg-indigo-600 transition-colors shadow-xl cursor-pointer hidden md:flex items-center justify-center"
                        title="Previous Page"
                      >
                        <ChevronLeftIcon className="h-5 w-5" />
                      </button>
                    )}

                    {currentPage < numPages && (
                      <button
                        onClick={() => scrollToPage(currentPage + 1)}
                        className="absolute right-[-50px] top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-slate-800/90 text-white hover:bg-indigo-600 transition-colors shadow-xl cursor-pointer hidden md:flex items-center justify-center"
                        title="Next Page"
                      >
                        <ChevronRightIcon className="h-5 w-5" />
                      </button>
                    )}

                    <div className="mb-2 self-start flex items-center gap-2">
                      <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                        Page {currentPage} of {numPages}
                      </span>
                    </div>

                    <div className="bg-white rounded-md shadow-2xl shadow-black/80 border border-slate-800 overflow-hidden flex justify-center items-center">
                      <canvas
                        ref={(el) => {
                          canvasRefs.current[currentPage] = el;
                        }}
                        className="block max-w-none"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
