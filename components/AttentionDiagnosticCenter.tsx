import React, { useState } from 'react';
import { 
  ExclamationTriangleIcon, 
  ArrowPathIcon, 
  TrashIcon, 
  ArrowRightCircleIcon,
  EyeIcon,
  DocumentMagnifyingGlassIcon,
  CheckBadgeIcon,
  FunnelIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';
import { SerialDiscrepancyReport, DiagnosticItemSummary } from '../utils/serialNumberManager';

export interface AttentionDiagnosticCenterProps {
  report: SerialDiscrepancyReport;
  activeTargetRowId: string | null;
  onJumpToRow: (rowId: string, fieldToFocus: 'awb' | 'weight' | 'slNo') => void;
  onAutoCorrectSequence: () => void;
  onRemoveUnfilledMissingRows: () => void;
  onAcceptAllInferred?: () => void;
}

export const AttentionDiagnosticCenter: React.FC<AttentionDiagnosticCenterProps> = ({
  report,
  activeTargetRowId,
  onJumpToRow,
  onAutoCorrectSequence,
  onRemoveUnfilledMissingRows,
  onAcceptAllInferred,
}) => {
  const [filterCategory, setFilterCategory] = useState<'ALL' | 'MISSING' | 'INFERRED' | 'DUPLICATE' | 'INCOMPLETE'>('ALL');

  if (!report || !report.hasIssues) return null;

  const filteredItems = filterCategory === 'ALL' 
    ? report.diagnosticItems 
    : report.diagnosticItems.filter(item => item.category === filterCategory);

  const getCategoryStyles = (category: DiagnosticItemSummary['category']) => {
    switch (category) {
      case 'MISSING':
        return {
          badgeBg: 'bg-rose-500 text-white',
          cardBorder: 'border-rose-300 dark:border-rose-900/80 hover:border-rose-500',
          activeRing: 'ring-2 ring-rose-400',
          dot: 'bg-rose-500 animate-pulse',
          icon: <ExclamationTriangleIcon className="h-3.5 w-3.5" />,
          label: 'MISSING',
        };
      case 'INFERRED':
        return {
          badgeBg: 'bg-sky-500 text-white',
          cardBorder: 'border-sky-300 dark:border-sky-900/80 hover:border-sky-500',
          activeRing: 'ring-2 ring-sky-400',
          dot: 'bg-sky-400',
          icon: <EyeIcon className="h-3.5 w-3.5" />,
          label: 'INFERRED (LOW VISIBILITY)',
        };
      case 'DUPLICATE':
        return {
          badgeBg: 'bg-orange-500 text-white',
          cardBorder: 'border-orange-300 dark:border-orange-900/80 hover:border-orange-500',
          activeRing: 'ring-2 ring-orange-400',
          dot: 'bg-orange-500',
          icon: <DocumentMagnifyingGlassIcon className="h-3.5 w-3.5" />,
          label: 'DUPLICATE',
        };
      case 'INCOMPLETE':
        return {
          badgeBg: 'bg-amber-500 text-white',
          cardBorder: 'border-amber-300 dark:border-amber-900/80 hover:border-amber-500',
          activeRing: 'ring-2 ring-amber-400',
          dot: 'bg-amber-500',
          icon: <ExclamationTriangleIcon className="h-3.5 w-3.5" />,
          label: 'INCOMPLETE',
        };
    }
  };

  return (
    <section 
      id="attention-required-diagnostic-center"
      className="mb-6 rounded-2xl md:rounded-3xl border-2 border-rose-300 dark:border-rose-900/80 bg-gradient-to-br from-rose-50/90 via-amber-50/60 to-sky-50/70 dark:from-rose-950/40 dark:via-slate-900 dark:to-slate-950/60 p-4 sm:p-6 shadow-xl shadow-rose-500/5 transition-all animate-in fade-in duration-300"
      aria-label="Attention Required Diagnostic Center"
    >
      {/* Top Header & Metrics */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-rose-200/80 dark:border-rose-900/40">
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-rose-600 text-white shadow-md shadow-rose-600/30">
              <ExclamationTriangleIcon className="h-6 w-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black text-rose-950 dark:text-rose-100 tracking-tight">
                  Attention Required Diagnostic Center
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-rose-600 text-white shadow-xs">
                  {report.diagnosticItems.length} Issue{report.diagnosticItems.length > 1 ? 's' : ''}
                </span>
              </div>
              <p className="text-xs text-rose-900/80 dark:text-slate-300 font-medium">
                Verify inferred characters, sequence gaps, duplicates, and missing values for 100% manifest accuracy.
              </p>
            </div>
          </div>
        </div>

        {/* Global Batch Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onAutoCorrectSequence}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 active:scale-95 shadow-md shadow-indigo-600/20 transition-all cursor-pointer whitespace-nowrap"
            title="Auto-resequence all row serial numbers into clean sequence 1..N top to bottom"
          >
            <ArrowPathIcon className="h-4 w-4" />
            Auto-Correct Sequence (1..N)
          </button>

          {report.missingRowsCount > 0 && (
            <button
              type="button"
              onClick={onRemoveUnfilledMissingRows}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-rose-700 dark:text-rose-300 bg-white/90 dark:bg-slate-800 hover:bg-rose-100 dark:hover:bg-rose-950/60 border border-rose-300 dark:border-rose-800 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
              title="Remove unedited missing placeholder rows"
            >
              <TrashIcon className="h-3.5 w-3.5" />
              Remove Empty Missing
            </button>
          )}

          {report.inferredRowsCount > 0 && onAcceptAllInferred && (
            <button
              type="button"
              onClick={onAcceptAllInferred}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-sky-700 dark:text-sky-300 bg-white/90 dark:bg-slate-800 hover:bg-sky-100 dark:hover:bg-sky-950/60 border border-sky-300 dark:border-sky-800 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
              title="Confirm and accept all inferred low visibility OCR rows"
            >
              <CheckBadgeIcon className="h-3.5 w-3.5" />
              Accept Inferred ({report.inferredRowsCount})
            </button>
          )}
        </div>
      </div>

      {/* Category Tabs / Filters */}
      <div className="flex flex-wrap items-center gap-2 py-3">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1 mr-1">
          <FunnelIcon className="h-3 w-3" />
          Filter:
        </span>

        <button
          type="button"
          onClick={() => setFilterCategory('ALL')}
          className={`px-3 py-1 rounded-xl text-xs font-black transition-all cursor-pointer ${
            filterCategory === 'ALL'
              ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
              : 'bg-white/80 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 hover:bg-white border border-slate-200 dark:border-slate-700'
          }`}
        >
          All Issues ({report.diagnosticItems.length})
        </button>

        {report.missingRowsCount > 0 && (
          <button
            type="button"
            onClick={() => setFilterCategory('MISSING')}
            className={`px-3 py-1 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
              filterCategory === 'MISSING'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping"></span>
            Missing ({report.missingRowsCount})
          </button>
        )}

        {report.inferredRowsCount > 0 && (
          <button
            type="button"
            onClick={() => setFilterCategory('INFERRED')}
            className={`px-3 py-1 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
              filterCategory === 'INFERRED'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'bg-sky-100 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300 border border-sky-300 dark:border-sky-800'
            }`}
          >
            <EyeIcon className="h-3.5 w-3.5" />
            Inferred / Low Vis ({report.inferredRowsCount})
          </button>
        )}

        {(report.duplicateSlNos.size > 0 || report.duplicateAwbs.size > 0) && (
          <button
            type="button"
            onClick={() => setFilterCategory('DUPLICATE')}
            className={`px-3 py-1 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
              filterCategory === 'DUPLICATE'
                ? 'bg-orange-600 text-white shadow-xs'
                : 'bg-orange-100 dark:bg-orange-950/60 text-orange-800 dark:text-orange-300 border border-orange-300 dark:border-orange-800'
            }`}
          >
            Duplicate ({report.duplicateSlNos.size + report.duplicateAwbs.size})
          </button>
        )}

        {report.incompleteRowsCount > 0 && (
          <button
            type="button"
            onClick={() => setFilterCategory('INCOMPLETE')}
            className={`px-3 py-1 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
              filterCategory === 'INCOMPLETE'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
            }`}
          >
            Incomplete ({report.incompleteRowsCount})
          </button>
        )}
      </div>

      {/* Interactive Jump-to-Action List */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-[300px] overflow-y-auto p-1">
        {filteredItems.map((item) => {
          const styles = getCategoryStyles(item.category);
          const isActive = activeTargetRowId === item.rowId;

          return (
            <div
              key={`${item.category}-${item.rowId}`}
              id={`diagnostic-card-${item.rowId}`}
              onClick={() => onJumpToRow(item.rowId, item.fieldToFocus)}
              className={`p-3 rounded-xl border bg-white dark:bg-slate-900 transition-all cursor-pointer flex flex-col justify-between gap-2 shadow-xs group ${
                styles.cardBorder
              } ${isActive ? 'ring-2 ring-amber-400 shadow-md bg-amber-50/50 dark:bg-amber-950/30' : 'hover:shadow-md'}`}
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-1">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider flex items-center gap-1 ${styles.badgeBg}`}>
                    {styles.icon}
                    {styles.label}
                  </span>
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 font-mono">
                    Row #{item.slNo}
                  </span>
                </div>

                <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                  {item.serialNo || '(Empty Reference)'}
                </div>

                <p className="text-[11px] text-slate-600 dark:text-slate-400 line-clamp-2 leading-tight">
                  {item.reason}
                </p>
              </div>

              {/* Jump Button */}
              <div className="pt-1 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 text-[11px]">
                <span className="text-slate-400 dark:text-slate-500 font-medium">
                  Focus: {item.fieldToFocus.toUpperCase()}
                </span>
                <button
                  type="button"
                  id={`jump-to-row-${item.rowId}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onJumpToRow(item.rowId, item.fieldToFocus);
                  }}
                  className="inline-flex items-center gap-1 font-bold text-indigo-600 dark:text-indigo-400 group-hover:translate-x-0.5 transition-transform"
                >
                  <span>Go to #{item.slNo}</span>
                  <ArrowRightCircleIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
