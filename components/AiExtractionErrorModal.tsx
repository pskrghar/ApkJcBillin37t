import React from 'react';
import { 
  ExclamationTriangleIcon, 
  XMarkIcon, 
  ArrowPathIcon, 
  Cog6ToothIcon, 
  ServerStackIcon, 
  ClockIcon, 
  ShieldExclamationIcon, 
  PhotoIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline';
import { ExtractionDiagnosticReport } from '../services/manifestExtractor';

interface AiExtractionErrorModalProps {
  isOpen: boolean;
  diagnostic: ExtractionDiagnosticReport | null;
  onRetry: () => void;
  onOpenAiSettings: () => void;
  onClose: () => void;
  isRetrying?: boolean;
}

export const AiExtractionErrorModal: React.FC<AiExtractionErrorModalProps> = ({
  isOpen,
  diagnostic,
  onRetry,
  onOpenAiSettings,
  onClose,
  isRetrying = false,
}) => {
  if (!isOpen || !diagnostic) return null;

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'rate_limits':
        return {
          label: 'Rate Limit Exceeded (429 / Quota)',
          bgColor: 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700',
        };
      case 'api_key_status':
        return {
          label: 'API Key Authentication Error',
          bgColor: 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-700',
        };
      case 'network_timeout':
        return {
          label: 'Network Timeout / Upload Disruption',
          bgColor: 'bg-sky-100 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300 border-sky-300 dark:border-sky-700',
        };
      case 'model_discontinued_or_unavailable':
        return {
          label: 'Model Unavailable / Discontinued',
          bgColor: 'bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 border-purple-300 dark:border-purple-700',
        };
      default:
        return {
          label: 'OCR Processing Discrepancy',
          bgColor: 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700',
        };
    }
  };

  const badge = getCategoryBadge(diagnostic.failureCategory);

  return (
    <div 
      id="ai-extraction-error-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-diagnostic-title"
    >
      <div 
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden text-left"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400">
              <ExclamationTriangleIcon className="h-6 w-6" />
            </div>
            <div>
              <h2 id="ai-diagnostic-title" className="text-base font-bold text-slate-900 dark:text-white">
                AI Document Extraction Diagnostic
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Actionable analysis & fallback protocol status
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200/50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Primary Failure Reason Box */}
          <div className="p-4 rounded-xl border bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className={`px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider rounded-lg border ${badge.bgColor}`}>
                {badge.label}
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                Primary Model: {diagnostic.primaryModel}
              </span>
            </div>

            <div className="space-y-1">
              <div className="text-sm font-semibold text-slate-900 dark:text-white">
                {diagnostic.friendlyFailureReason}
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                💡 <span className="font-medium">Action Advice:</span> {diagnostic.actionAdvice}
              </div>
            </div>
          </div>

          {/* Cached Frames Status Banner */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 text-xs text-indigo-900 dark:text-indigo-200">
            <PhotoIcon className="h-5 w-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <div className="flex-1">
              <span className="font-bold">
                {diagnostic.cachedFramesCount} Document Frame{diagnostic.cachedFramesCount > 1 ? 's' : ''} Cached in Memory
              </span>
              <p className="text-[11px] text-indigo-700 dark:text-indigo-300">
                You do not need to retake photos or re-upload your document. 1-Click Retry re-transmits the cached scans immediately.
              </p>
            </div>
          </div>

          {/* Fallback Protocol Trace */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <ServerStackIcon className="h-4 w-4 text-indigo-500" />
                Fallback Protocol Trace
              </h3>
              <span className="text-[10px] text-slate-400">
                {diagnostic.fallbackProtocolTrace.length} Tier{diagnostic.fallbackProtocolTrace.length > 1 ? 's' : ''} Evaluated
              </span>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden bg-white dark:bg-slate-900">
              {diagnostic.fallbackProtocolTrace.length > 0 ? (
                diagnostic.fallbackProtocolTrace.map((trace, idx) => {
                  const isSuccess = trace.status === 'success';
                  return (
                    <div key={idx} className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            {trace.attemptNumber}
                          </span>
                          <span className="text-xs font-bold text-slate-900 dark:text-white">
                            {trace.tierLabel}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {trace.durationMs > 0 && (
                            <span className="text-[10px] text-slate-400 flex items-center gap-1">
                              <ClockIcon className="h-3 w-3" />
                              {(trace.durationMs / 1000).toFixed(1)}s
                            </span>
                          )}
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              isSuccess
                                ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                                : 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                            }`}
                          >
                            {isSuccess ? 'Success' : `Failed (${trace.statusCode || 'ERR'})`}
                          </span>
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 ml-7 leading-relaxed">
                        {trace.friendlyReason || trace.failureReason}
                      </p>
                    </div>
                  );
                })
              ) : (
                <div className="p-4 text-center text-xs text-slate-400">
                  Authentication check halted execution before model dispatch.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons Footer */}
        <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex flex-wrap items-center justify-between gap-2.5">
          <button
            type="button"
            onClick={onOpenAiSettings}
            className="px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Cog6ToothIcon className="h-4 w-4 text-purple-500" />
            <span>AI Settings & API Key</span>
          </button>

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2.5 rounded-xl text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-xs font-medium transition-colors cursor-pointer"
            >
              Dismiss
            </button>
            <button
              type="button"
              disabled={isRetrying}
              onClick={onRetry}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-bold shadow-md hover:shadow-indigo-500/20 flex items-center gap-2 transition-all cursor-pointer"
            >
              <ArrowPathIcon className={`h-4 w-4 ${isRetrying ? 'animate-spin' : ''}`} />
              <span>{isRetrying ? 'Retrying Extraction...' : '1-Click Retry Extraction'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
