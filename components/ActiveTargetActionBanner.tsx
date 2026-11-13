import React from 'react';
import { 
  SparklesIcon, 
  XMarkIcon, 
  ArrowRightIcon, 
  CheckCircleIcon,
  ExclamationCircleIcon
} from '@heroicons/react/24/outline';
import { DiagnosticItemSummary } from '../utils/serialNumberManager';

interface ActiveTargetActionBannerProps {
  targetItem: DiagnosticItemSummary | null;
  onNextIssue: () => void;
  onDismiss: () => void;
}

export const ActiveTargetActionBanner: React.FC<ActiveTargetActionBannerProps> = ({
  targetItem,
  onNextIssue,
  onDismiss,
}) => {
  if (!targetItem) return null;

  return (
    <div
      id="table-active-target-helper-banner"
      className="mb-3 px-4 py-2.5 rounded-xl border-2 border-amber-400 dark:border-amber-500 bg-amber-50/95 dark:bg-amber-950/80 shadow-md shadow-amber-500/10 flex flex-wrap items-center justify-between gap-3 text-amber-950 dark:text-amber-200 animate-in fade-in duration-200"
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-3 w-3 relative">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
        </span>
        <div className="text-xs">
          <span className="font-black uppercase tracking-wider text-amber-900 dark:text-amber-100 mr-1.5">
            🎯 Active Target: Row #{targetItem.slNo}
          </span>
          <span className="font-semibold text-amber-800 dark:text-amber-300">
            [{targetItem.category}] {targetItem.reason}
          </span>
          <span className="hidden sm:inline text-amber-700/80 dark:text-amber-400/80 ml-2">
            (Editing field: <code className="font-mono font-bold text-amber-900 dark:text-amber-100">{targetItem.fieldToFocus.toUpperCase()}</code>)
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 ml-auto">
        <button
          type="button"
          onClick={onNextIssue}
          className="px-3 py-1 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
        >
          <span>Next Issue</span>
          <ArrowRightIcon className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="p-1 text-amber-700 dark:text-amber-300 hover:text-amber-950 dark:hover:text-white rounded-lg hover:bg-amber-200/50 dark:hover:bg-amber-900/50 transition-colors cursor-pointer"
          title="Dismiss Target Highlight"
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
