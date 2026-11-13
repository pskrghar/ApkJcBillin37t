import React, { useState, useMemo } from 'react';
import { 
  FolderIcon, 
  CheckCircleIcon, 
  PencilSquareIcon, 
  PlusIcon, 
  TrashIcon, 
  ArrowPathIcon, 
  DocumentTextIcon, 
  CalendarDaysIcon, 
  ChevronRightIcon, 
  InformationCircleIcon, 
  XMarkIcon, 
  MagnifyingGlassIcon,
  CalculatorIcon,
  ArrowTopRightOnSquareIcon,
  DocumentDuplicateIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon
} from '@heroicons/react/24/outline';
import { Folder, ManifestHistory, BillingConfig, ManifestOverride, ManualDocManifest } from '../types';

interface FinalManifestSectionProps {
  folders: Folder[];
  selectedFolderIds: string[];
  onToggleFolder: (folderId: string) => void;
  onSelectAllFolders?: () => void;
  onClearFolderSelection?: () => void;
  report: {
    lines: Array<{
      isManualDoc?: boolean;
      manifest: ManifestHistory;
      summary: any;
      overrides?: ManifestOverride;
    }>;
    totals: any;
    folderName: string;
  } | null;
  overrides: Record<string, ManifestOverride>;
  onUpdateOverride: (manifestId: string, override: ManifestOverride) => void;
  onResetOverride: (manifestId: string) => void;
  manualDocEntries: ManualDocManifest[];
  onAddManualDocEntry: (entry: Omit<ManualDocManifest, 'id' | 'createdAt'>) => void;
  onDeleteManualDocEntry: (id: string) => void;
  onUpdateManualDocEntry: (id: string, updates: Partial<ManualDocManifest>) => void;
  config: BillingConfig;
  onNavigateToFinalBill: () => void;
}

export const FinalManifestSection: React.FC<FinalManifestSectionProps> = ({
  folders,
  selectedFolderIds,
  onToggleFolder,
  report,
  overrides,
  onUpdateOverride,
  onResetOverride,
  manualDocEntries,
  onAddManualDocEntry,
  onDeleteManualDocEntry,
  config,
  onNavigateToFinalBill,
}) => {
  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  const [isAddDocModalOpen, setIsAddDocModalOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isMobileInfoDismissed, setIsMobileInfoDismissed] = useState<boolean>(false);

  // Add Document Manifest Form State
  const [docDate, setDocDate] = useState<string>(() => {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    return `${day}/${month}/${year}`;
  });
  const [docCountInput, setDocCountInput] = useState<string>('');
  const [docTargetFolderId, setDocTargetFolderId] = useState<string>(() => {
    return selectedFolderIds.length > 0 ? selectedFolderIds[0] : (folders[0]?.id || '');
  });
  const [docRemarks, setDocRemarks] = useState<string>('');
  const [docCustomRate, setDocCustomRate] = useState<string>(config.documentRate.toString());

  // Inline editing state for quick edits
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [rowDraft, setRowDraft] = useState<ManifestOverride>({});

  // Expand / collapse for parcel breakdown details in consolidated calculation
  const [expandedRowIds, setExpandedRowIds] = useState<Record<string, boolean>>({});
  const [expandAllDetails, setExpandAllDetails] = useState<boolean>(false);

  const toggleRowExpand = (rowId: string) => {
    setExpandedRowIds(prev => ({
      ...prev,
      [rowId]: !prev[rowId]
    }));
  };

  // Filtered lines based on search
  const filteredLines = useMemo(() => {
    if (!report) return [];
    if (!searchQuery.trim()) return report.lines;
    const q = searchQuery.toLowerCase().trim();
    return report.lines.filter(l => 
      l.manifest.manifestDate.toLowerCase().includes(q) ||
      (l.manifest.manifestNo && l.manifest.manifestNo.toLowerCase().includes(q))
    );
  }, [report, searchQuery]);

  const handleOpenAddDocModal = () => {
    setDocCountInput('');
    setDocRemarks('');
    setDocCustomRate(config.documentRate.toString());
    if (selectedFolderIds.length > 0) {
      setDocTargetFolderId(selectedFolderIds[0]);
    } else if (folders.length > 0) {
      setDocTargetFolderId(folders[0].id);
    }
    setIsAddDocModalOpen(true);
  };

  const handleSubmitAddDoc = (e: React.FormEvent) => {
    e.preventDefault();
    const count = parseInt(docCountInput, 10);
    if (isNaN(count) || count <= 0) return;
    if (!docTargetFolderId) return;

    onAddManualDocEntry({
      folderId: docTargetFolderId,
      manifestDate: docDate.trim(),
      manifestNo: 'Doc Only',
      docCount: count,
      documentRate: parseFloat(docCustomRate) || config.documentRate,
      remarks: docRemarks.trim() || undefined,
    });

    // Ensure target folder is selected so user immediately sees their added entry
    if (!selectedFolderIds.includes(docTargetFolderId)) {
      onToggleFolder(docTargetFolderId);
    }

    setIsAddDocModalOpen(false);
  };

  const handleStartRowEdit = (line: typeof report['lines'][0]) => {
    setEditingRowId(line.manifest.id);
    setRowDraft({
      date: line.manifest.manifestDate,
      no: line.manifest.manifestNo,
      pCount: line.summary.smallParcelCount,
      PCount: line.summary.bigParcelCount,
      dCount: line.summary.docCount,
      pWeight: line.summary.smallParcelTotalWeight,
      PDetail: line.overrides?.PDetail !== undefined ? line.overrides.PDetail : (line.summary.heavyWeights.length > 0 ? line.summary.heavyWeights.join('+') : ''),
    });
  };

  const handleSaveRowEdit = (manifestId: string) => {
    onUpdateOverride(manifestId, rowDraft);
    setEditingRowId(null);
    setRowDraft({});
  };

  const handleCancelRowEdit = () => {
    setEditingRowId(null);
    setRowDraft({});
  };

  return (
    <div className="p-3 sm:p-4 md:p-8 animate-in fade-in duration-300">
      {/* Informative Header / Synchronization Architecture Banner (Ultra-compact one-liner on mobile) */}
      {!isMobileInfoDismissed && (
        <div 
          id="final-manifest-info-tab"
          data-component="info-tab"
          className="mb-3 sm:mb-6 bg-gradient-to-r from-indigo-900/90 via-slate-900 to-indigo-950 text-white rounded-xl sm:rounded-2xl px-2.5 py-1.5 sm:p-5 shadow-xs sm:shadow-lg border border-indigo-500/30 flex flex-row items-center justify-between gap-2 transition-all animate-in fade-in duration-200"
        >
          {/* Mobile version: Ultra-compact one-liner */}
          <div className="flex sm:hidden items-center gap-1.5 min-w-0 flex-1">
            <InformationCircleIcon className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
            <span className="text-[11px] font-medium text-slate-200 truncate">
              <strong className="text-white font-bold">P+D Sync:</strong> Linked with P Manifest & Final Bill
            </span>
          </div>

          {/* Desktop version: Full descriptive header */}
          <div className="hidden sm:flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-600/30 border border-indigo-400/40 text-indigo-300 shrink-0 mt-0.5">
              <CalculatorIcon className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg sm:text-xl font-black tracking-tight">P + D Manifest Management</h2>
                <span className="text-[10px] uppercase font-black tracking-wider bg-indigo-500/30 text-indigo-200 px-2 py-0.5 rounded-full border border-indigo-400/30">
                  P Manifest ↔ P + D Manifest ↔ Final Bill Linking
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-3xl leading-relaxed">
                Folders from <strong className="text-white">P Manifest</strong> are linked here as a synchronized base. Add dated <strong className="text-indigo-200">Document Manifests</strong> or adjust consolidated parcel entries. Any edits here reflect into <strong className="text-white">Final Bill</strong> (and vice versa), while keeping P Manifest’s raw files intact.
              </p>
            </div>
          </div>

          {/* Action / Dismiss Buttons */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0 justify-end">
            <button
              onClick={onNavigateToFinalBill}
              className="px-2 sm:px-4 py-1 sm:py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-black flex items-center gap-1 sm:gap-1.5 shadow-sm sm:shadow-md shadow-indigo-900/50 transition-all cursor-pointer whitespace-nowrap active:scale-95"
              title="Switch directly to Final Bill Monthly Statement"
            >
              <span>Final Bill</span>
              <ChevronRightIcon className="h-3 w-3 sm:h-4 sm:w-4" />
            </button>
            {/* Optional close button on mobile so user can dismiss it completely */}
            <button
              onClick={() => setIsMobileInfoDismissed(true)}
              className="sm:hidden text-slate-400 hover:text-white p-1 rounded-md transition-colors"
              title="Dismiss information tab"
              aria-label="Dismiss information tab"
            >
              <XMarkIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Folder Selection Grid (Linked from Explorer) */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FolderIcon className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-xs sm:text-sm font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Select Folders to Consolidate ({folders.length} Available)
            </h3>
          </div>
          {folders.length > 0 && (
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
              {selectedFolderIds.length} of {folders.length} selected
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5 sm:gap-3">
          {folders.map(folder => {
            const isSelected = selectedFolderIds.includes(folder.id);
            return (
              <button
                key={folder.id}
                onClick={() => onToggleFolder(folder.id)}
                className={`p-3 sm:p-3.5 rounded-xl border-2 text-left transition-all cursor-pointer ${
                  isSelected
                    ? 'border-indigo-600 bg-indigo-50/80 dark:bg-indigo-950/70 ring-2 ring-indigo-200 dark:ring-indigo-900 shadow-sm'
                    : 'border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-indigo-300 dark:hover:border-slate-700'
                }`}
              >
                <div className={`flex items-center justify-between mb-1.5 ${isSelected ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-600'}`}>
                  <FolderIcon className="h-4 w-4 sm:h-5 sm:w-5" />
                  {isSelected ? (
                    <CheckCircleIcon className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-600 dark:text-indigo-400" />
                  ) : (
                    <div className="h-4 w-4 sm:h-5 sm:w-5 rounded-full border border-slate-300 dark:border-slate-700" />
                  )}
                </div>
                <div className={`font-bold text-xs sm:text-sm truncate ${isSelected ? 'text-indigo-950 dark:text-indigo-100' : 'text-slate-700 dark:text-slate-300'}`}>
                  {folder.name}
                </div>
              </button>
            );
          })}
        </div>
        {folders.length === 0 && (
          <div className="p-6 text-center bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 text-slate-500 text-xs italic">
            No folders created yet in P Manifest. Create a folder in P Manifest to group manifests.
          </div>
        )}
      </div>

      {/* Main Final Manifest Content */}
      {report ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-xl border border-slate-200/80 dark:border-slate-800 overflow-hidden">
          {/* Top Control & Action Bar */}
          <div className="p-3.5 sm:p-5 border-b border-slate-200/80 dark:border-slate-800 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-slate-50/70 dark:bg-slate-800/40">
            {/* Search & Folder Label */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 flex-1">
              <div className="relative w-full sm:w-64">
                <MagnifyingGlassIcon className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter by Date or Manifest #..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg text-xs focus:outline-none focus:border-indigo-500"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <XMarkIcon className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate">
                Folder: <strong className="text-slate-800 dark:text-slate-200">{report.folderName}</strong>
              </div>
            </div>

            {/* Actions: Add Document Manifest, Toggle Edit Mode */}
            <div className="flex items-center gap-2 shrink-0 flex-wrap sm:flex-nowrap justify-end">
              <button
                type="button"
                onClick={handleOpenAddDocModal}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer whitespace-nowrap active:scale-95"
                title="Add manual document entry for dates with documents only"
              >
                <PlusIcon className="h-3.5 w-3.5 stroke-[2.5]" />
                <span>Add Document Manifest</span>
              </button>

              <button
                type="button"
                onClick={() => setIsEditMode(!isEditMode)}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap active:scale-95 ${
                  isEditMode
                    ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-200 ring-1 ring-amber-400'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
                title="Toggle inline editing for all manifest values"
              >
                <PencilSquareIcon className="h-3.5 w-3.5" />
                <span>{isEditMode ? 'Finish Editing' : 'Edit Values'}</span>
              </button>

              <button
                type="button"
                onClick={onNavigateToFinalBill}
                className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/70 rounded-lg font-bold text-xs flex items-center gap-1 transition-all cursor-pointer whitespace-nowrap"
                title="View Final Bill Statement and Generate PDF"
              >
                <span>Final Bill</span>
                <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-slate-200/80 dark:divide-slate-800 bg-slate-50/50 dark:bg-slate-800/30 border-b border-slate-200/80 dark:border-slate-800">
            <div className="p-3 sm:px-4 text-center sm:text-left">
              <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total Entries</div>
              <div className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100 mt-0.5">
                {report.lines.length} <span className="text-xs font-medium text-slate-400">manifests/days</span>
              </div>
            </div>
            <div className="p-3 sm:px-4 text-center sm:text-left">
              <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Parcels (p / P)</div>
              <div className="text-base sm:text-lg font-black text-indigo-600 dark:text-indigo-400 mt-0.5">
                {report.totals.p_small + report.totals.P_big} <span className="text-xs font-medium text-slate-400">({report.totals.p_small}p + {report.totals.P_big}P)</span>
              </div>
            </div>
            <div className="p-3 sm:px-4 text-center sm:text-left">
              <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Documents (D)</div>
              <div className="text-base sm:text-lg font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                {report.totals.d} <span className="text-xs font-medium text-slate-400">docs</span>
              </div>
            </div>
            <div className="p-3 sm:px-4 text-center sm:text-left">
              <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Consolidated Total</div>
              <div className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100 mt-0.5">
                ₹{report.totals.grand.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Consolidated Manifest Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100/90 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                  <th className="p-3 text-[10px] font-black uppercase tracking-widest text-center w-12">#</th>
                  <th className="p-3 text-[10px] font-black uppercase tracking-widest w-32 sm:w-36">Dated</th>
                  <th className="p-3 text-[10px] font-black uppercase tracking-widest w-52 sm:w-60">
                    <div className="flex flex-col">
                      <span>Manifest No</span>
                      <span className="text-[9px] normal-case font-medium text-slate-500 dark:text-slate-400">
                        P Manifest &amp; Doc Manifest
                      </span>
                    </div>
                  </th>
                  <th className="p-3 text-[10px] font-black uppercase tracking-widest w-44 sm:w-52">
                    <div className="flex items-center justify-between gap-1">
                      <span>Consolidated Calculation</span>
                      <button
                        type="button"
                        onClick={() => {
                          const next = !expandAllDetails;
                          setExpandAllDetails(next);
                          const all: Record<string, boolean> = {};
                          if (next && report) {
                            report.lines.forEach(l => { all[l.manifest.id] = true; });
                          }
                          setExpandedRowIds(all);
                        }}
                        className="text-[9px] normal-case font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer tracking-normal bg-indigo-50 dark:bg-indigo-950/60 px-1.5 py-0.5 rounded border border-indigo-200 dark:border-indigo-800"
                        title={expandAllDetails ? "Minimize all details" : "Expand all details"}
                      >
                        {expandAllDetails ? "Collapse" : "Expand"}
                      </button>
                    </div>
                  </th>
                  <th className="p-3 text-[10px] font-black uppercase tracking-widest text-right w-28">
                    Total Amount
                  </th>
                  <th className="p-3 text-[10px] font-black uppercase tracking-widest text-center w-20">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredLines.map((line, idx) => {
                  const mId = line.manifest.id;
                  const isRowEditing = editingRowId === mId || isEditMode;
                  const override = line.overrides || {};
                  const isManualDoc = line.isManualDoc || line.manifest.id.startsWith('doc-manual-');
                  const hasOverride = Object.keys(override).length > 0;

                  return (
                    <tr 
                      key={mId} 
                      className={`hover:bg-indigo-50/20 dark:hover:bg-slate-800/40 transition-colors ${
                        isManualDoc ? 'bg-emerald-50/20 dark:bg-emerald-950/10' : ''
                      }`}
                    >
                      {/* Sl No */}
                      <td className="p-3 text-center text-xs font-bold text-slate-400 dark:text-slate-500 border-r border-slate-100 dark:border-slate-800">
                        {idx + 1}
                      </td>

                      {/* Dated */}
                      <td className="p-3 border-r border-slate-100 dark:border-slate-800 align-top">
                        {isRowEditing ? (
                          <input
                            type="text"
                            value={rowDraft.date !== undefined && editingRowId === mId ? rowDraft.date : line.manifest.manifestDate}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (editingRowId === mId) {
                                setRowDraft({ ...rowDraft, date: val });
                              } else {
                                onUpdateOverride(mId, { ...override, date: val });
                              }
                            }}
                            className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white rounded px-2 py-1 text-xs font-medium focus:outline-none focus:border-indigo-500"
                            placeholder="DD/MM/YYYY"
                          />
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <CalendarDaysIcon className="h-4 w-4 text-slate-400 shrink-0" />
                            <span className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm">
                              {line.manifest.manifestDate}
                            </span>
                          </div>
                        )}
                        {hasOverride && !isRowEditing && (
                          <span className="inline-block mt-0.5 text-[9px] font-semibold text-amber-600 dark:text-amber-400">
                            Edited in Final
                          </span>
                        )}
                      </td>

                      {/* Manifest No: Divided into two halves horizontally (1st half: P Manifest No, 2nd half: Documents / Doc Manifest) */}
                      <td className="p-0 border-r border-slate-100 dark:border-slate-800 align-top">
                        <div className="flex flex-col h-full divide-y divide-slate-200/80 dark:divide-slate-700/80">
                          {/* 1st Half: P Manifest No */}
                          <div className="p-2.5 space-y-1">
                            <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 block">
                              1. P Manifest No
                            </span>
                            {isRowEditing ? (
                              <input
                                type="text"
                                value={rowDraft.no !== undefined && editingRowId === mId ? rowDraft.no : line.manifest.manifestNo}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (editingRowId === mId) {
                                    setRowDraft({ ...rowDraft, no: val });
                                  } else {
                                    onUpdateOverride(mId, { ...override, no: val });
                                  }
                                }}
                                className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white rounded px-2 py-1 text-xs font-medium focus:outline-none focus:border-indigo-500"
                                placeholder="P Manifest #"
                              />
                            ) : (
                              <div>
                                {isManualDoc ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 text-[11px] font-bold">
                                    <DocumentTextIcon className="h-3 w-3" />
                                    {line.manifest.manifestNo || 'Doc Only'}
                                  </span>
                                ) : (
                                  <div className="font-bold text-slate-800 dark:text-slate-200 text-xs sm:text-sm">
                                    #{line.manifest.manifestNo || 'N/A'}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* 2nd Half: Documents (Doc Manifest) feature & function */}
                          <div className="p-2.5 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-1.5">
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-[9px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                                <DocumentTextIcon className="h-3 w-3 shrink-0" />
                                2. Documents (Doc Manifest)
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400">Docs:</span>
                              <input
                                type="number"
                                min={0}
                                value={rowDraft.dCount !== undefined && editingRowId === mId ? rowDraft.dCount : line.summary.docCount}
                                onChange={(e) => {
                                  const count = parseInt(e.target.value, 10) || 0;
                                  if (editingRowId === mId) {
                                    setRowDraft({ ...rowDraft, dCount: count });
                                  } else {
                                    onUpdateOverride(mId, { ...override, dCount: count });
                                  }
                                }}
                                className="w-16 bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 text-slate-900 dark:text-white rounded px-1.5 py-0.5 text-xs font-bold text-center focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                title="Enter total number of documents for this dated manifest"
                              />
                              <span className="text-[11px] font-medium text-slate-500">nos</span>
                            </div>

                            {/* Rate calculation preview */}
                            <div className="text-[10px] sm:text-[11px] text-emerald-800 dark:text-emerald-300 font-semibold">
                              {line.summary.docCount} × ₹{line.manifest.config.documentRate} = <strong className="font-black">₹{line.summary.docTotal}</strong>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Consolidated Calculation (Only calculations needed for final bill) */}
                      <td className="p-3 border-r border-slate-100 dark:border-slate-800 align-top">
                        {isRowEditing && !isManualDoc ? (
                          <div className="space-y-2 p-2 bg-slate-50 dark:bg-slate-800/80 rounded-lg border border-slate-200 dark:border-slate-700 text-xs">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[9px] font-black uppercase text-slate-400 block">Small (p) Count</label>
                                <input
                                  type="number"
                                  value={rowDraft.pCount !== undefined && editingRowId === mId ? rowDraft.pCount : line.summary.smallParcelCount}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value, 10) || 0;
                                    if (editingRowId === mId) setRowDraft({ ...rowDraft, pCount: val });
                                    else onUpdateOverride(mId, { ...override, pCount: val });
                                  }}
                                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-1.5 py-0.5 text-xs"
                                />
                              </div>
                              <div>
                                <label className="text-[9px] font-black uppercase text-slate-400 block">Small (p) Wt (kg)</label>
                                <input
                                  type="number"
                                  value={rowDraft.pWeight !== undefined && editingRowId === mId ? rowDraft.pWeight : line.summary.smallParcelTotalWeight}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value) || 0;
                                    if (editingRowId === mId) setRowDraft({ ...rowDraft, pWeight: val });
                                    else onUpdateOverride(mId, { ...override, pWeight: val });
                                  }}
                                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-1.5 py-0.5 text-xs"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="text-[9px] font-black uppercase text-amber-700 dark:text-amber-400 block">Heavy (P) Weights Detail (e.g. 15+20+35)</label>
                              <input
                                type="text"
                                value={rowDraft.PDetail !== undefined && editingRowId === mId ? rowDraft.PDetail : (override.PDetail !== undefined ? override.PDetail : line.summary.heavyWeights.join('+'))}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (editingRowId === mId) setRowDraft({ ...rowDraft, PDetail: val });
                                  else onUpdateOverride(mId, { ...override, PDetail: val });
                                }}
                                placeholder="e.g. 15+20+35"
                                className="w-full bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 rounded px-1.5 py-0.5 text-xs font-mono"
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1 text-xs">
                            {/* Other Information: Parcels summary breakdown (Expandable / Hidden in default minimized mode) */}
                            <div className="w-full">
                              {!isManualDoc && (
                                <div>
                                  <div className="flex items-center justify-between">
                                    <button
                                      type="button"
                                      onClick={() => toggleRowExpand(mId)}
                                      className="text-[9px] font-bold text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-0.5 cursor-pointer py-0.5 px-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                      title={(expandedRowIds[mId] ?? expandAllDetails) ? "Hide parcel weight breakdown" : "Expand parcel weight breakdown"}
                                    >
                                      <span>{(expandedRowIds[mId] ?? expandAllDetails) ? 'Hide weights ▲' : '+ p/P weights'}</span>
                                      <ChevronDownIcon className={`h-2.5 w-2.5 transition-transform ${(expandedRowIds[mId] ?? expandAllDetails) ? 'rotate-180' : ''}`} />
                                    </button>
                                  </div>

                                  {(expandedRowIds[mId] ?? expandAllDetails) && (
                                    <div className="mt-1 p-2 rounded-md bg-slate-50 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 text-[11px] text-slate-700 dark:text-slate-300 space-y-1">
                                      <div>
                                        <strong className="text-indigo-600 dark:text-indigo-400 font-bold mr-1">p:</strong>
                                        {line.summary.smallParcelCount} ({line.summary.smallParcelTotalWeight} kg)
                                      </div>
                                      <div>
                                        <strong className="text-amber-600 dark:text-amber-400 font-bold mr-1">P:</strong>
                                        {line.summary.bigParcelCount}
                                        {line.summary.heavyWeights.length > 0 && (
                                          <span className="text-[10px] text-slate-500 font-mono ml-1">
                                            ({line.summary.heavyWeights.join('+')} = {line.summary.heavyTotal}kg)
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-slate-500 text-[10px] pt-0.5 border-t border-slate-200 dark:border-slate-700">
                                        Total Wt: <strong className="text-slate-700 dark:text-slate-300">{line.summary.totalWeight}kg</strong>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Slab calculations used for final billing: 4 horizontal lines one after below */}
                            <div className="flex flex-col gap-1 w-full max-w-[210px]">
                              {/* Span 1: S1 */}
                              <span className="flex items-center justify-between gap-1.5 px-2 py-0.5 rounded bg-indigo-50/80 dark:bg-indigo-950/40 text-[10px] font-bold text-indigo-900 dark:text-indigo-200 border border-indigo-100/80 dark:border-indigo-900/60 whitespace-nowrap">
                                <span>S1 ({line.summary.s1w || 0}kg * ₹{line.manifest.config.parcelSlab1Rate})</span>
                                <span className="font-black text-indigo-700 dark:text-indigo-300 ml-auto">= ₹{line.summary.slab1Total || 0}</span>
                              </span>

                              {/* Span 2: S2 */}
                              <span className="flex items-center justify-between gap-1.5 px-2 py-0.5 rounded bg-indigo-50/80 dark:bg-indigo-950/40 text-[10px] font-bold text-indigo-900 dark:text-indigo-200 border border-indigo-100/80 dark:border-indigo-900/60 whitespace-nowrap">
                                <span>S2 ({line.summary.s2w || 0}kg * ₹{line.manifest.config.parcelSlab2Rate})</span>
                                <span className="font-black text-indigo-700 dark:text-indigo-300 ml-auto">= ₹{line.summary.slab2Total || 0}</span>
                              </span>

                              {/* Span 3: S3 */}
                              <span className="flex items-center justify-between gap-1.5 px-2 py-0.5 rounded bg-indigo-50/80 dark:bg-indigo-950/40 text-[10px] font-bold text-indigo-900 dark:text-indigo-200 border border-indigo-100/80 dark:border-indigo-900/60 whitespace-nowrap">
                                <span>S3 ({line.summary.s3w || 0}kg * ₹{line.manifest.config.parcelSlab3Rate})</span>
                                <span className="font-black text-indigo-700 dark:text-indigo-300 ml-auto">= ₹{line.summary.slab3Total || 0}</span>
                              </span>

                              {/* Span 4: Doc */}
                              <span className="flex items-center justify-between gap-1.5 px-2 py-0.5 rounded bg-emerald-50/80 dark:bg-emerald-950/40 text-[10px] font-bold text-emerald-900 dark:text-emerald-200 border border-emerald-100/80 dark:border-emerald-900/60 whitespace-nowrap">
                                <span>Doc ({line.summary.docCount || 0} * ₹{line.manifest.config.documentRate})</span>
                                <span className="font-black text-emerald-700 dark:text-emerald-300 ml-auto">= ₹{line.summary.docTotal || 0}</span>
                              </span>
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Total Amount */}
                      <td className="p-3 align-top text-right">
                        <div className="text-sm font-black text-slate-900 dark:text-white">
                          ₹{line.summary.totalAmount.toLocaleString()}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="p-3 align-top text-center">
                        <div className="flex items-center justify-center gap-1">
                          {editingRowId === mId ? (
                            <>
                              <button
                                onClick={() => handleSaveRowEdit(mId)}
                                className="p-1 bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 rounded hover:bg-emerald-200"
                                title="Save changes"
                              >
                                <CheckIcon className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={handleCancelRowEdit}
                                className="p-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded hover:bg-slate-200"
                                title="Cancel"
                              >
                                <XMarkIcon className="h-3.5 w-3.5" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => handleStartRowEdit(line)}
                                className="p-1 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 rounded transition-colors"
                                title="Edit this row"
                              >
                                <PencilSquareIcon className="h-4 w-4" />
                              </button>

                              {isManualDoc ? (
                                <button
                                  onClick={() => onDeleteManualDocEntry(mId)}
                                  className="p-1 text-red-500 hover:text-red-700 rounded transition-colors"
                                  title="Delete manual document manifest"
                                >
                                  <TrashIcon className="h-4 w-4" />
                                </button>
                              ) : (
                                hasOverride && (
                                  <button
                                    onClick={() => onResetOverride(mId)}
                                    className="p-1 text-amber-500 hover:text-amber-700 rounded transition-colors"
                                    title="Revert to P Manifest's original values"
                                  >
                                    <ArrowPathIcon className="h-3.5 w-3.5" />
                                  </button>
                                )
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* Grand Totals Footer */}
              <tfoot className="bg-slate-900 text-white border-t border-slate-700">
                <tr>
                  <td colSpan={2} className="py-2.5 px-3 text-right uppercase tracking-wider text-xs font-bold text-slate-300">
                    Grand Totals ({report.lines.length} Manifests)
                  </td>
                  <td className="py-2.5 px-3 text-xs bg-emerald-950/50 border-x border-slate-800">
                    <div className="font-black text-emerald-300 flex items-center gap-1">
                      <DocumentTextIcon className="h-3 w-3 inline" />
                      Docs: {report.totals.d} nos
                    </div>
                    <div className="text-[11px] text-emerald-200/90 font-bold">Doc Sum: ₹{report.totals.dt.toLocaleString()}</div>
                  </td>
                  <td className="py-2.5 px-3 text-xs w-44 sm:w-52">
                    <div className="flex flex-col gap-0.5 text-[10px] text-slate-300 max-w-[210px]">
                      <div className="flex justify-between">
                        <span>S1:</span>
                        <span className="text-white font-bold font-mono">₹{report.totals.s1}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>S2:</span>
                        <span className="text-white font-bold font-mono">₹{report.totals.s2}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>S3:</span>
                        <span className="text-white font-bold font-mono">₹{report.totals.s3}</span>
                      </div>
                      <div className="pt-0.5 mt-0.5 border-t border-slate-700/80 flex justify-between text-slate-400 text-[9px]">
                        <span>p:{report.totals.p_small} | P:{report.totals.P_big}</span>
                        <span>{report.totals.w} kg</span>
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-right text-base sm:text-lg font-black text-white">
                    ₹{report.totals.grand.toLocaleString()}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : (
        <div className="text-center py-16 bg-slate-50 dark:bg-slate-900/40 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl">
          <CalculatorIcon className="h-14 w-14 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <h3 className="text-lg font-black text-slate-700 dark:text-slate-300">No Folders Selected</h3>
          <p className="text-slate-500 text-xs mt-1">Select one or more folders above to inspect and edit the consolidated Final Manifest.</p>
        </div>
      )}

      {/* Add Document Manifest Modal */}
      {isAddDocModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/60">
              <div className="flex items-center gap-2">
                <DocumentTextIcon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                <h3 className="font-black text-slate-900 dark:text-white text-sm">
                  Add Dated Document Manifest
                </h3>
              </div>
              <button onClick={() => setIsAddDocModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitAddDoc} className="p-4 sm:p-5 space-y-4">
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-800/50 text-xs text-emerald-900 dark:text-emerald-200 flex items-start gap-2">
                <InformationCircleIcon className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  Record document deliveries for a specific date without a parcel manifest number. This will be linked to the selected folder and flow directly into the Final Bill.
                </span>
              </div>

              <div>
                <label className="text-xs font-black uppercase tracking-wider text-slate-500 block mb-1">
                  Manifest Date
                </label>
                <input
                  type="text"
                  required
                  placeholder="DD/MM/YYYY (e.g. 05/10/2026)"
                  value={docDate}
                  onChange={(e) => setDocDate(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-3 py-2 text-xs font-bold focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs font-black uppercase tracking-wider text-slate-500 block mb-1">
                  Assign to Folder
                </label>
                <select
                  value={docTargetFolderId}
                  onChange={(e) => setDocTargetFolderId(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-3 py-2 text-xs font-bold focus:outline-none focus:border-emerald-500"
                >
                  {folders.map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-black uppercase tracking-wider text-slate-500 block mb-1">
                    Total No. of Docs
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    placeholder="e.g. 15"
                    value={docCountInput}
                    onChange={(e) => setDocCountInput(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-3 py-2 text-xs font-bold focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-black uppercase tracking-wider text-slate-500 block mb-1">
                    Rate per Doc (₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={docCustomRate}
                    onChange={(e) => setDocCustomRate(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-3 py-2 text-xs font-bold focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-black uppercase tracking-wider text-slate-500 block mb-1">
                  Remarks / Description (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Local bank mailers, corporate documents"
                  value={docRemarks}
                  onChange={(e) => setDocRemarks(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddDocModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold hover:bg-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-black shadow-md transition-all cursor-pointer"
                >
                  Save to P + D Manifest
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
