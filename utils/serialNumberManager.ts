import { BillingRow, BillingConfig, ItemType } from '../types';
import { calculateRow } from './billingLogic';

export interface DiagnosticItemSummary {
  rowId: string;
  slNo: number;
  serialNo: string;
  category: 'MISSING' | 'INFERRED' | 'DUPLICATE' | 'INCOMPLETE';
  badgeColor: 'rose' | 'sky' | 'orange' | 'amber';
  fieldToFocus: 'awb' | 'weight' | 'slNo';
  title: string;
  reason: string;
}

export interface SerialDiscrepancyReport {
  missingRowsCount: number;
  duplicateSlNos: Set<number>;
  duplicateAwbs: Set<string>;
  inferredRowsCount: number;
  incompleteRowsCount: number;
  diagnosticItems: DiagnosticItemSummary[];
  hasIssues: boolean;
}

/**
 * Reconciles imported rows by detecting missing serial numbers and inserting
 * placeholder rows marked with blinking red at the exact missing positions.
 */
export function reconcileImportedRows(rawItems: any[], config: BillingConfig): {
  rows: BillingRow[];
  missingCount: number;
  duplicateSlNoCount: number;
  duplicateAwbCount: number;
  inferredCount: number;
} {
  if (!rawItems || rawItems.length === 0) {
    return { rows: [], missingCount: 0, duplicateSlNoCount: 0, duplicateAwbCount: 0, inferredCount: 0 };
  }

  // Pre-process raw items into basic objects
  const parsedItems = rawItems.map((item, index) => {
    let slNo = typeof item.slNo === 'number' && !isNaN(item.slNo) && item.slNo > 0 ? item.slNo : 0;
    const serialNo = (item.serialNo || '').toString().trim();
    const description = (item.description || '').toString().trim();
    const type = item.type === 'Document' ? ItemType.DOCUMENT : ItemType.PARCEL;
    const weight = typeof item.weight === 'number' && !isNaN(item.weight) ? item.weight : 0;
    const isInferred = Boolean(item.isInferred || serialNo.includes('?') || serialNo.toLowerCase().includes('[unclear]'));
    const inferenceReason = item.inferenceReason || (isInferred ? 'Low visibility text inferred from scan context' : undefined);

    return {
      slNo,
      serialNo,
      description,
      type,
      weight,
      isInferred,
      inferenceReason,
      originalIndex: index
    };
  });

  // Check if items provided slNo sequence
  const hasSlNos = parsedItems.filter(p => p.slNo > 0).length >= Math.ceil(parsedItems.length * 0.4);

  let workingList: Array<{
    id: string;
    slNo: number;
    serialNo: string;
    description: string;
    type: ItemType;
    weight: number;
    isManualRate: boolean;
    isMissingPlaceholder?: boolean;
    isInferred?: boolean;
    inferenceReason?: string;
  }> = [];

  let missingCount = 0;
  let inferredCount = 0;

  if (hasSlNos) {
    let runningSlNo = 1;
    for (let i = 0; i < parsedItems.length; i++) {
      const current = parsedItems[i];
      const targetSlNo = current.slNo > 0 ? current.slNo : runningSlNo;

      if (targetSlNo > runningSlNo && (targetSlNo - runningSlNo) <= 50) {
        for (let missingNum = runningSlNo; missingNum < targetSlNo; missingNum++) {
          workingList.push({
            id: crypto.randomUUID(),
            slNo: missingNum,
            serialNo: '',
            description: '',
            type: ItemType.PARCEL,
            weight: 0,
            isManualRate: false,
            isMissingPlaceholder: true
          });
          missingCount++;
        }
      }

      if (current.isInferred) inferredCount++;

      workingList.push({
        id: crypto.randomUUID(),
        slNo: targetSlNo,
        serialNo: current.serialNo,
        description: current.description || 'Processed Item',
        type: current.type,
        weight: current.weight,
        isManualRate: false,
        isMissingPlaceholder: false,
        isInferred: current.isInferred,
        inferenceReason: current.inferenceReason
      });

      runningSlNo = targetSlNo + 1;
    }
  } else {
    let detectedGapInAwb = false;
    const awbNumbers: Array<{ prefix: string; num: number; digits: number; index: number }> = [];

    parsedItems.forEach((p, idx) => {
      const match = p.serialNo.match(/^(.*?)(\d+)$/);
      if (match) {
        awbNumbers.push({
          prefix: match[1],
          num: parseInt(match[2], 10),
          digits: match[2].length,
          index: idx
        });
      }
    });

    if (awbNumbers.length >= 2 && awbNumbers.length === parsedItems.length) {
      const firstPrefix = awbNumbers[0].prefix;
      const samePrefix = awbNumbers.every(a => a.prefix === firstPrefix);
      if (samePrefix) {
        for (let i = 1; i < awbNumbers.length; i++) {
          const diff = awbNumbers[i].num - awbNumbers[i - 1].num;
          if (diff > 1 && diff <= 25) {
            detectedGapInAwb = true;
            break;
          }
        }
      }
    }

    if (detectedGapInAwb) {
      let currentSeq = 1;
      for (let i = 0; i < parsedItems.length; i++) {
        if (i > 0) {
          const prevAwb = awbNumbers[i - 1];
          const currAwb = awbNumbers[i];
          if (prevAwb && currAwb && currAwb.prefix === prevAwb.prefix) {
            const diff = currAwb.num - prevAwb.num;
            if (diff > 1 && diff <= 25) {
              for (let fillNum = prevAwb.num + 1; fillNum < currAwb.num; fillNum++) {
                workingList.push({
                  id: crypto.randomUUID(),
                  slNo: currentSeq++,
                  serialNo: '',
                  description: '',
                  type: ItemType.PARCEL,
                  weight: 0,
                  isManualRate: false,
                  isMissingPlaceholder: true
                });
                missingCount++;
              }
            }
          }
        }

        if (parsedItems[i].isInferred) inferredCount++;

        workingList.push({
          id: crypto.randomUUID(),
          slNo: currentSeq++,
          serialNo: parsedItems[i].serialNo,
          description: parsedItems[i].description || 'Processed Item',
          type: parsedItems[i].type,
          weight: parsedItems[i].weight,
          isManualRate: false,
          isMissingPlaceholder: false,
          isInferred: parsedItems[i].isInferred,
          inferenceReason: parsedItems[i].inferenceReason
        });
      }
    } else {
      workingList = parsedItems.map((item, index) => {
        if (item.isInferred) inferredCount++;
        return {
          id: crypto.randomUUID(),
          slNo: index + 1,
          serialNo: item.serialNo,
          description: item.description || 'Processed Item',
          type: item.type,
          weight: item.weight,
          isManualRate: false,
          isMissingPlaceholder: false,
          isInferred: item.isInferred,
          inferenceReason: item.inferenceReason
        };
      });
    }
  }

  // Calculate pricing
  const rows = workingList.map(r => calculateRow(r, config));

  // Count duplicates
  const slNoMap = new Map<number, number>();
  const awbMap = new Map<string, number>();

  rows.forEach(r => {
    if (r.slNo) slNoMap.set(r.slNo, (slNoMap.get(r.slNo) || 0) + 1);
    const awb = r.serialNo.trim().toUpperCase();
    if (awb) awbMap.set(awb, (awbMap.get(awb) || 0) + 1);
  });

  let duplicateSlNoCount = 0;
  slNoMap.forEach(cnt => { if (cnt > 1) duplicateSlNoCount += (cnt - 1); });

  let duplicateAwbCount = 0;
  awbMap.forEach(cnt => { if (cnt > 1) duplicateAwbCount += (cnt - 1); });

  return {
    rows,
    missingCount,
    duplicateSlNoCount,
    duplicateAwbCount,
    inferredCount
  };
}

/**
 * Evaluates current rows and returns duplicate sets, missing count, inferred items, and jump summaries.
 */
export function analyzeSerialDiscrepancies(rows: BillingRow[]): SerialDiscrepancyReport {
  const slNoCounts = new Map<number, number>();
  const awbCounts = new Map<string, number>();
  let missingRowsCount = 0;
  let inferredRowsCount = 0;
  let incompleteRowsCount = 0;

  for (const r of rows) {
    if (r.isMissingPlaceholder || !r.serialNo?.trim()) {
      missingRowsCount++;
    }
    if (r.isInferred) {
      inferredRowsCount++;
    }
    if (r.weight <= 0 && r.type === ItemType.PARCEL && !r.isMissingPlaceholder) {
      incompleteRowsCount++;
    }
    if (r.slNo > 0) {
      slNoCounts.set(r.slNo, (slNoCounts.get(r.slNo) || 0) + 1);
    }
    const trimmedAwb = (r.serialNo || '').trim().toUpperCase();
    if (trimmedAwb) {
      awbCounts.set(trimmedAwb, (awbCounts.get(trimmedAwb) || 0) + 1);
    }
  }

  const duplicateSlNos = new Set<number>();
  slNoCounts.forEach((count, slNo) => {
    if (count > 1) duplicateSlNos.add(slNo);
  });

  const duplicateAwbs = new Set<string>();
  awbCounts.forEach((count, awb) => {
    if (count > 1) duplicateAwbs.add(awb);
  });

  // Build ordered diagnostic list for Jump-to-Action
  const diagnosticItems: DiagnosticItemSummary[] = [];

  rows.forEach((r) => {
    const isMissing = Boolean(r.isMissingPlaceholder) || !r.serialNo?.trim();
    const isDuplicateAwb = Boolean(r.serialNo && duplicateAwbs.has(r.serialNo.trim().toUpperCase()));
    const isDuplicateSlNo = duplicateSlNos.has(r.slNo);
    const isIncomplete = r.weight <= 0 && r.type === ItemType.PARCEL && !isMissing;
    const isInferred = Boolean(r.isInferred);

    if (isMissing) {
      diagnosticItems.push({
        rowId: r.id,
        slNo: r.slNo,
        serialNo: r.serialNo || 'BLANK AWB',
        category: 'MISSING',
        badgeColor: 'rose',
        fieldToFocus: 'awb',
        title: `Row #${r.slNo} Missing Sequence Item`,
        reason: r.isMissingPlaceholder 
          ? `Sequence gap at #${r.slNo}. Consignment number not detected in scan.`
          : `Blank AWB/Reference detected on row #${r.slNo}.`
      });
    } else if (isDuplicateAwb || isDuplicateSlNo) {
      diagnosticItems.push({
        rowId: r.id,
        slNo: r.slNo,
        serialNo: r.serialNo || `#${r.slNo}`,
        category: 'DUPLICATE',
        badgeColor: 'orange',
        fieldToFocus: isDuplicateAwb ? 'awb' : 'slNo',
        title: `Row #${r.slNo} Duplicate Reference`,
        reason: isDuplicateAwb 
          ? `AWB "${r.serialNo}" is repeated across multiple manifest rows.`
          : `Serial sequence #${r.slNo} is duplicated.`
      });
    } else if (isInferred) {
      diagnosticItems.push({
        rowId: r.id,
        slNo: r.slNo,
        serialNo: r.serialNo,
        category: 'INFERRED',
        badgeColor: 'sky',
        fieldToFocus: 'awb',
        title: `Row #${r.slNo} Inferred (Low Visibility)`,
        reason: r.inferenceReason || `Faint text or low-contrast characters inferred from page context.`
      });
    } else if (isIncomplete) {
      diagnosticItems.push({
        rowId: r.id,
        slNo: r.slNo,
        serialNo: r.serialNo,
        category: 'INCOMPLETE',
        badgeColor: 'amber',
        fieldToFocus: 'weight',
        title: `Row #${r.slNo} Incomplete Weight`,
        reason: `Parcel item has zero weight recorded (0.00 kg). Expected valid weight value.`
      });
    }
  });

  const hasIssues = diagnosticItems.length > 0;

  return {
    missingRowsCount,
    duplicateSlNos,
    duplicateAwbs,
    inferredRowsCount,
    incompleteRowsCount,
    diagnosticItems,
    hasIssues
  };
}

/**
 * Auto-corrects serial numbers from top to bottom into sequential 1..N.
 * If user modified a row's serial number, this re-sorts and re-sequences rows smoothly.
 */
export function autoCorrectSequenceTopToBottom(rows: BillingRow[]): BillingRow[] {
  // Sort rows primarily by existing slNo, preserving stability
  const sorted = [...rows].sort((a, b) => (a.slNo || 0) - (b.slNo || 0));

  // Map each row to strict sequence 1, 2, 3, ... N
  return sorted.map((row, index) => {
    // If the missing placeholder row now has user data entered, mark as resolved
    const hasData = Boolean(row.serialNo && row.serialNo.trim()) || row.weight > 0 || Boolean(row.description && row.description.trim());
    return {
      ...row,
      slNo: index + 1,
      isMissingPlaceholder: row.isMissingPlaceholder && !hasData ? true : false
    };
  });
}
