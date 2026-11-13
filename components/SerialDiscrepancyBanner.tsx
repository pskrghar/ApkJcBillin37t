import React from 'react';
import { 
  ExclamationTriangleIcon, 
  ArrowPathIcon, 
  TrashIcon, 
  ArrowDownCircleIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline';

interface SerialDiscrepancyBannerProps {
  missingRowsCount: number;
  duplicateSlNos: Set<number>;
  duplicateAwbs: Set<string>;
  onAutoCorrectSequence: () => void;
  onRemoveUnfilledMissingRows: () => void;
  onScrollToFirstIssue: () => void;
}

export const SerialDiscrepancyBanner: React.FC<SerialDiscrepancyBannerProps> = ({
  missingRowsCount,
  duplicateSlNos,
  duplicateAwbs,
  onAutoCorrectSequence,
  onRemoveUnfilledMissingRows,
  onScrollToFirstIssue
}) => {
  const hasIssues = missingRowsCount > 0 || duplicateSlNos.size > 0 || duplicateAwbs.size > 0;

  if (!hasIssues) return null;

  return (
    <div 
      id="serial-discrepancy-banner"
      className="mb-6 rounded-2xl md:rounded-3xl border-2 border-rose-300 dark:border-rose-900/80 bg-gradient-to-r from-rose-50/90 via-amber-50/70 to-rose-50/90 dark:from-rose-950/40 dark:via-slate-900 dark:to-rose-950/30 p-4 sm:p-6 shadow-md shadow-rose-500/5 transition-all animate-in fade-in slide-in-from-top-2 duration-300"
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Left: Alerts and descriptions */}
        <div className="space-y-2">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-rose-500 text-white shadow-xs">
              <ExclamationTriangleIcon className="h-5 w-5 animate-pulse" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-rose-950 dark:text-rose-200 tracking-tight">
                Serial Number Discrepancy Detected
              </h3>
              <p className="text-xs sm:text-sm font-medium text-rose-800/90 dark:text-rose-300/80">
                Data verification identified issues that require your attention:
              </p>
            </div>
          </div>

          {/* Issue badges */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {missingRowsCount > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-rose-600 text-white shadow-xs animate-pulse">
                <span className="w-2 h-2 rounded-full bg-white"></span>
                {missingRowsCount} Missing Serial Row{missingRowsCount > 1 ? 's' : ''} Inserted (Blinking Red)
              </span>
            )}

            {duplicateSlNos.size > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-amber-600 text-white shadow-xs">
                {duplicateSlNos.size} Repeated Serial #{duplicateSlNos.size > 1 ? 's' : ''} (Red Border)
              </span>
            )}

            {duplicateAwbs.size > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-orange-600 text-white shadow-xs">
                {duplicateAwbs.size} Repeated AWB{duplicateAwbs.size > 1 ? 's' : ''} (Red Border)
              </span>
            )}
          </div>

          <p className="text-xs text-rose-900/80 dark:text-slate-300 pt-1 leading-relaxed max-w-3xl">
            <span className="font-bold">Instructions:</span> You can manually enter values in the blinking red missing rows, or modify serial numbers with red borders. When you update a serial number or click <strong>Auto-Correct Sequence</strong>, rows are rearranged into sequence top to bottom. This notice will stay displayed until all issues are resolved.
          </p>
        </div>

        {/* Right: Quick Action Controls */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 shrink-0 pt-2 lg:pt-0">
          <button
            type="button"
            onClick={onAutoCorrectSequence}
            className="inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-black text-white bg-indigo-600 hover:bg-indigo-700 active:scale-95 shadow-md shadow-indigo-200 dark:shadow-none transition-all cursor-pointer whitespace-nowrap"
            title="Auto-resequence all row serial numbers (#) into clean sequence 1..N top to bottom"
          >
            <ArrowPathIcon className="h-4 w-4" />
            Auto-Correct Sequence (1..N)
          </button>

          {missingRowsCount > 0 && (
            <button
              type="button"
              onClick={onRemoveUnfilledMissingRows}
              className="inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-2 rounded-xl text-xs font-bold text-rose-700 dark:text-rose-300 bg-white/80 dark:bg-slate-800 hover:bg-rose-100 dark:hover:bg-rose-950/60 border border-rose-300 dark:border-rose-800 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
              title="Remove unedited missing placeholder rows"
            >
              <TrashIcon className="h-3.5 w-3.5" />
              Remove Empty Missing
            </button>
          )}

          <button
            type="button"
            onClick={onScrollToFirstIssue}
            className="inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-white/80 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
            title="Jump viewport to first highlighted row"
          >
            <ArrowDownCircleIcon className="h-3.5 w-3.5" />
            Jump to Issue
          </button>
        </div>
      </div>
    </div>
  );
};
