export enum ItemType {
  PARCEL = 'Parcel',
  DOCUMENT = 'Document'
}

export interface BillingRow {
  id: string;
  slNo: number;      // Table sequence index
  serialNo: string;  // Maps to AWB No, Doc No, etc.
  description: string;
  type: ItemType;
  weight: number;
  rate: number; 
  isManualRate: boolean;
  amount: number;    // calculated
  breakdown: string; // "10kg @ 3 + 5kg @ 2"
  isMissingPlaceholder?: boolean; // Inserted missing serial number placeholder row
  isInferred?: boolean; // Extracted via OCR inference or low visibility detection
  inferenceReason?: string; // Reason e.g. "Low contrast / faint handwriting inferred from context"
}

export interface BillingConfig {
  parcelSlab1Rate: number; // <= 10kg
  parcelSlab2Rate: number; // 10-100kg
  parcelSlab3Rate: number; // > 100kg
  documentRate: number; // Flat rate for documents
}

export interface ParsingError {
  type: 'missing' | 'duplicate' | 'invalid';
  message: string;
  rowId?: string;
}

export interface SlabSummary {
  slab1Weight: number;
  slab2Weight: number;
  slab3Weight: number;
  parcelCount: number;
  parcelCountS1: number;      // Count of parcels <= 10kg
  parcelCountS2Plus: number;  // Count of parcels > 10kg
  docCount: number;
  docTotal: number;
  heavyParcelWeightsList: number[]; // Weights for p > 10kg
  lightParcelsTotalWeight: number;  // Combined weight for p <= 10kg
}

export interface ManifestMetadata {
  manifestNo: string;
  manifestDate: string;
}

export interface ManifestOverride {
  date?: string;
  no?: string;
  pCount?: number;
  PCount?: number;
  dCount?: number;
  pWeight?: number;
  PDetail?: string; // Stores the string like "12+15+30"
  updatedAt?: number;
}

export interface ManualDocManifest {
  id: string;
  folderId: string;
  manifestDate: string;
  manifestNo?: string;
  docCount: number;
  documentRate?: number;
  remarks?: string;
  createdAt: number;
  updatedAt?: number;
}

export interface Folder {
  id: string;
  name: string;
  createdAt: number;
}

export interface ManifestHistory extends ManifestMetadata {
  id: string;
  rows: BillingRow[];
  config: BillingConfig;
  totalAmount: number;
  itemCount: number;
  createdAt: number;
  updatedAt?: number;
  folderId?: string; // Optional reference to a folder
  sectionType?: 'P' | 'PD';
  pdOverride?: ManifestOverride;
  cloudDocId?: string;
}

export interface RecycleBinItem {
  id: string;
  originalId: string;
  itemType: 'manifest' | 'folder';
  name: string;
  deletedAt: number;
  manifestData?: ManifestHistory;
  folderData?: Folder;
  associatedManifests?: ManifestHistory[];
  itemCount?: number;
  totalAmount?: number;
}

export interface CloudBackupFile {
  id: string;
  cloudDocId?: string;
  name: string;
  type: 'full_backup' | 'manifest' | 'folder';
  createdAt: number;
  updatedAt: number;
  manifestCount: number;
  folderCount: number;
  totalAmount: number;
  itemCount: number;
  sizeBytes?: number;
  description?: string;
  data: {
    manifests: ManifestHistory[];
    folders: Folder[];
    globalConfig?: BillingConfig;
    finalBillOverrides?: Record<string, ManifestOverride>;
    manualDocEntries?: ManualDocManifest[];
    appTheme?: 'light' | 'dark' | 'reading';
    appScale?: number;
    appZoom?: number;
  };
}

export interface CloudSyncMeta {
  lastSyncTimestamp: number | null;
  autoSyncEnabled: boolean;
  isOnline: boolean;
  status: 'idle' | 'syncing' | 'error' | 'success';
  lastSyncMessage: string;
}

export type DeviceType = 'desktop' | 'tablet' | 'mobile';

export interface SyncedDevice {
  id: string;
  name: string;
  type: DeviceType;
  browser: string;
  os: string;
  channelKey: string;
  lastActive: number;
  isCurrentDevice?: boolean;
  manifestCount?: number;
}

export interface MultiDeviceSyncState {
  channelKey: string;
  currentDevice: SyncedDevice;
  connectedDevices: SyncedDevice[];
  isLiveSyncActive: boolean;
  lastRemoteUpdate: number | null;
}
