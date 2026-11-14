import { GoogleGenAI } from "@google/genai";
import { BillingConfig, BillingRow, ItemType } from "../types";
import { reconcileImportedRows } from "../utils/serialNumberManager";

export const CUSTOM_API_KEY_STORAGE = "SMARTBILLING_GEMINI_API_KEY";
export const EXTRACTION_MODEL_PREF_STORAGE = "SMARTBILLING_EXTRACTION_MODEL_PREF";
export const FETCHED_MODELS_STORAGE = "SMARTBILLING_FETCHED_GEMINI_MODELS";

export type ExtractionEngineMode = 'auto' | 'single' | 'multiple';

export interface ExtractionModelPreference {
  mode: ExtractionEngineMode;
  selectedModels: string[]; // List of model names to use in order
}

export interface ExtractionModelSpec {
  name: string;
  shortLabel: string;
  badge: string;
  badgeColor: string;
  tierLabel: string;
  description: string;
  speed: string;
  recommended: boolean;
  isFetched?: boolean;
  inputTokenLimit?: number;
  outputTokenLimit?: number;
}

export const AVAILABLE_EXTRACTION_MODELS: ExtractionModelSpec[] = [
  {
    name: "gemini-3.6-flash",
    shortLabel: "3.6 Flash (Recommended)",
    badge: "Fast & Accurate",
    badgeColor: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800",
    tierLabel: "Primary Vision Model (gemini-3.6-flash)",
    description: "High-precision document understanding optimized for dense tabular bills & manifests.",
    speed: "Ultra-fast",
    recommended: true,
  },
  {
    name: "gemini-3.8-flash",
    shortLabel: "3.8 Flash (Latest Multi-Modal)",
    badge: "Next-Gen",
    badgeColor: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 border-purple-200 dark:border-purple-800",
    tierLabel: "Gemini 3.8 Flash (Multi-Modal Vision Engine)",
    description: "Latest vision model with superior reasoning for low-contrast or complex handwriting.",
    speed: "Fast",
    recommended: false,
  },
  {
    name: "gemini-flash-latest",
    shortLabel: "Flash Latest (Dynamic)",
    badge: "Auto Latest",
    badgeColor: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
    tierLabel: "Flash Latest Dynamic Model (gemini-flash-latest)",
    description: "Continuously updated standard Google Flash model for robust OCR transcription.",
    speed: "Ultra-fast",
    recommended: false,
  },
  {
    name: "gemini-2.5-flash",
    shortLabel: "2.5 Flash (Legacy Backup)",
    badge: "Legacy Fallback",
    badgeColor: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800",
    tierLabel: "Gemini 2.5 Flash (Tertiary Fallback)",
    description: "Proven reliable legacy fallback when higher tiers face heavy network quotas.",
    speed: "Fast",
    recommended: false,
  },
];

export const DEFAULT_MODEL_PREFERENCE: ExtractionModelPreference = {
  mode: 'auto',
  selectedModels: AVAILABLE_EXTRACTION_MODELS.map((m) => m.name),
};

export function getSavedFetchedModels(): ExtractionModelSpec[] {
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(FETCHED_MODELS_STORAGE);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.filter((m) => m && typeof m.name === "string" && m.name.trim().length > 0);
        }
      }
    } catch (e) {}
  }
  return [];
}

export function saveFetchedModels(models: ExtractionModelSpec[]): void {
  if (typeof window !== "undefined") {
    try {
      if (models.length > 0) {
        localStorage.setItem(FETCHED_MODELS_STORAGE, JSON.stringify(models));
      } else {
        localStorage.removeItem(FETCHED_MODELS_STORAGE);
      }
    } catch (e) {}
  }
}

export function getAllKnownExtractionModels(): ExtractionModelSpec[] {
  const defaultNames = new Set(AVAILABLE_EXTRACTION_MODELS.map((m) => m.name));
  const fetched = getSavedFetchedModels().filter((m) => !defaultNames.has(m.name));
  return [...AVAILABLE_EXTRACTION_MODELS, ...fetched];
}

export function getExtractionModelPreference(): ExtractionModelPreference {
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(EXTRACTION_MODEL_PREF_STORAGE);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && (parsed.mode === 'auto' || parsed.mode === 'single' || parsed.mode === 'multiple')) {
          const knownNames = new Set(getAllKnownExtractionModels().map((m) => m.name));
          const validModels = (parsed.selectedModels || []).filter(
            (m: string) => typeof m === 'string' && m.trim().length > 0 && (knownNames.has(m) || m.startsWith('gemini-'))
          );
          return {
            mode: parsed.mode,
            selectedModels:
              validModels.length > 0
                ? validModels
                : parsed.mode === 'auto'
                ? AVAILABLE_EXTRACTION_MODELS.map((m) => m.name)
                : ['gemini-3.6-flash'],
          };
        }
      }
    } catch (e) {}
  }
  return DEFAULT_MODEL_PREFERENCE;
}

export function saveExtractionModelPreference(pref: ExtractionModelPreference): void {
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(EXTRACTION_MODEL_PREF_STORAGE, JSON.stringify(pref));
    } catch (e) {}
  }
}

export function getEffectiveGeminiApiKey(customKeyOverride?: string): string {
  if (customKeyOverride && customKeyOverride.trim()) {
    return customKeyOverride.trim();
  }
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem(CUSTOM_API_KEY_STORAGE);
      if (stored && stored.trim()) {
        return stored.trim();
      }
    } catch (e) {}
  }
  return process.env.API_KEY || "";
}

export function saveCustomGeminiApiKey(key: string): void {
  if (typeof window !== "undefined") {
    try {
      if (key && key.trim()) {
        localStorage.setItem(CUSTOM_API_KEY_STORAGE, key.trim());
      } else {
        localStorage.removeItem(CUSTOM_API_KEY_STORAGE);
      }
    } catch (e) {}
  }
}

export async function testGeminiApiKey(apiKey: string): Promise<{ success: boolean; message: string; model?: string }> {
  try {
    const keyToTest = apiKey.trim() || getEffectiveGeminiApiKey();
    if (!keyToTest) {
      return { success: false, message: "No API key provided. Please enter a valid Gemini API key." };
    }

    const ai = new GoogleGenAI({ apiKey: keyToTest });
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: "Respond with the single word: OK",
      config: {
        temperature: 0.1,
      },
    });

    if (response && response.text) {
      return { success: true, message: "API key is active and connected successfully!", model: "gemini-3.6-flash" };
    }
    return { success: true, message: "Connection successful!", model: "gemini-3.6-flash" };
  } catch (error: any) {
    console.error("Test API Key Error:", error);
    const errMsg = error?.message || error?.toString() || "Unknown error";
    if (errMsg.includes("403") || errMsg.includes("API_KEY_INVALID") || errMsg.includes("invalid")) {
      return { success: false, message: "Invalid API key. Please check your Google AI Studio credentials." };
    }
    if (errMsg.includes("429") || errMsg.includes("RESOURCE_EXHAUSTED")) {
      return { success: false, message: "Rate limit reached (429). The key is valid but quota is exhausted." };
    }
    return { success: false, message: `Connection test failed: ${errMsg}` };
  }
}

export async function fetchAvailableGeminiModels(customApiKeyOverride?: string): Promise<{
  success: boolean;
  models: ExtractionModelSpec[];
  totalDiscovered: number;
  error?: string;
}> {
  try {
    const apiKey = getEffectiveGeminiApiKey(customApiKeyOverride);
    if (!apiKey) {
      return {
        success: false,
        models: [],
        totalDiscovered: 0,
        error: "No API key configured. Enter a Gemini API key above or ensure the system key is set.",
      };
    }

    const ai = new GoogleGenAI({ apiKey });
    const pager = await ai.models.list({ config: { pageSize: 100 } });

    const defaultNames = new Set(AVAILABLE_EXTRACTION_MODELS.map((m) => m.name));
    const discoveredAll: ExtractionModelSpec[] = [];
    const seen = new Set<string>();
    let safetyCount = 0;

    for await (const rawModel of pager) {
      if (safetyCount++ > 200) break;
      const modelId = (rawModel.name || "").replace(/^models\//, "").trim();
      if (!modelId || seen.has(modelId)) continue;

      const lower = modelId.toLowerCase();
      // Only include Gemini text/vision models supporting generateContent
      if (!lower.includes("gemini")) continue;
      if (
        lower.includes("embedding") ||
        lower.includes("aqa") ||
        lower.includes("imagen") ||
        lower.includes("veo") ||
        lower.includes("lyria") ||
        lower.includes("-tts") ||
        lower.includes("transcribe") ||
        lower.includes("live") ||
        lower.includes("robotics")
      ) {
        continue;
      }

      if (
        Array.isArray(rawModel.supportedActions) &&
        rawModel.supportedActions.length > 0 &&
        !rawModel.supportedActions.includes("generateContent")
      ) {
        continue;
      }

      seen.add(modelId);

      const isPro = lower.includes("pro") || lower.includes("argon") || lower.includes("carbon");
      const isLite = lower.includes("lite");
      const isPreview = lower.includes("preview") || lower.includes("exp");

      const badge = isPro
        ? "Pro / High Precision"
        : isLite
        ? "Lite / Fast"
        : isPreview
        ? "Fetched Preview"
        : "Fetched Live";

      const badgeColor = isPro
        ? "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300 border-violet-200 dark:border-violet-800"
        : isLite
        ? "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300 border-teal-200 dark:border-teal-800"
        : isPreview
        ? "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300 border-sky-200 dark:border-sky-800"
        : "bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800";

      discoveredAll.push({
        name: modelId,
        shortLabel: rawModel.displayName || modelId,
        badge,
        badgeColor,
        tierLabel: `${rawModel.displayName || modelId} (${modelId})`,
        description:
          (rawModel.description || "").trim() ||
          "Live Gemini vision/text model fetched from your Google AI Studio account.",
        speed: isLite ? "Ultra-fast" : lower.includes("flash") ? "Fast" : "Balanced",
        recommended: false,
        isFetched: true,
        inputTokenLimit: rawModel.inputTokenLimit,
        outputTokenLimit: rawModel.outputTokenLimit,
      });
    }

    // Exclude the 4 built-in defaults so the fetched list below has no duplicate cards
    const fetchedExtras = discoveredAll
      .filter((m) => !defaultNames.has(m.name))
      .sort((a, b) => b.name.localeCompare(a.name));

    saveFetchedModels(fetchedExtras);

    return {
      success: true,
      models: fetchedExtras,
      totalDiscovered: discoveredAll.length,
    };
  } catch (error: any) {
    console.error("Fetch Gemini Models Error:", error);
    const errMsg = error?.message || error?.toString() || "Unknown error";
    if (errMsg.includes("403") || errMsg.includes("API_KEY_INVALID") || errMsg.includes("401")) {
      return {
        success: false,
        models: [],
        totalDiscovered: 0,
        error: "Invalid or unauthorized API key. Please check your Gemini API key above.",
      };
    }
    return {
      success: false,
      models: [],
      totalDiscovered: 0,
      error: `Failed to fetch models: ${errMsg}`,
    };
  }
}

export interface ManifestImageInput {
  data: string; // Base64 string without data URL prefix
  mimeType: string;
}

export interface ModelAttemptTrace {
  modelName: string;
  tierLabel: string;
  attemptNumber: number;
  status: 'success' | 'failed' | 'skipped';
  timestamp: string;
  durationMs: number;
  statusCode?: number | string;
  failureCategory?: 'rate_limits' | 'api_key_status' | 'network_timeout' | 'model_discontinued_or_unavailable' | 'document_error';
  failureReason?: string;
  friendlyReason?: string;
}

export interface ExtractionDiagnosticReport {
  timestamp: number;
  primaryModel: string;
  overallReason: string;
  failureCategory: 'rate_limits' | 'api_key_status' | 'network_timeout' | 'model_discontinued_or_unavailable' | 'document_error';
  friendlyFailureReason: string;
  actionAdvice: string;
  fallbackProtocolTrace: ModelAttemptTrace[];
  cachedFramesCount: number;
  canRetry: boolean;
}

export class ExtractionDiagnosticError extends Error {
  diagnostic: ExtractionDiagnosticReport;
  constructor(message: string, diagnostic: ExtractionDiagnosticReport) {
    super(message);
    this.name = "ExtractionDiagnosticError";
    this.diagnostic = diagnostic;
  }
}

export interface ExtractionResult {
  manifestNo: string;
  manifestDate: string;
  rows: BillingRow[];
  totalAmount: number;
  itemCount: number;
  missingCount: number;
  duplicateSlNoCount: number;
  duplicateAwbCount: number;
  inferredCount: number;
  errors: Array<{ type: string; message: string }>;
  modelUsed: string;
  fallbackTrace: ModelAttemptTrace[];
}

/**
 * Robust Model Cascade Hierarchy:
 * Primary: gemini-3.6-flash (high accuracy vision model)
 * Fallback 1: gemini-flash-latest (gemini flash of same type for document understanding)
 * Fallback 2: gemini-3.8-flash (modern stable multimodal fallback)
 * Fallback 3: gemini-2.5-flash (legacy stable fallback)
 */
export const MODEL_CASCADE_SPEC = [
  {
    name: "gemini-3.6-flash",
    tierLabel: "Primary Vision Model (gemini-3.6-flash)",
    description: "Default high-precision document extraction engine",
  },
  {
    name: "gemini-flash-latest",
    tierLabel: "Flash Latest Auto-Fallback (gemini-flash-latest)",
    description: "Same-type official dynamic Flash model",
  },
  {
    name: "gemini-3.8-flash",
    tierLabel: "Gemini 3.8 Flash (Secondary Fallback)",
    description: "Multi-modal vision backup engine",
  },
  {
    name: "gemini-2.5-flash",
    tierLabel: "Gemini 2.5 Flash (Tertiary Fallback)",
    description: "Stable legacy backup engine",
  },
];

export function categorizeExtractionFailure(err: any): {
  category: 'rate_limits' | 'api_key_status' | 'network_timeout' | 'model_discontinued_or_unavailable' | 'document_error';
  friendlyReason: string;
  actionAdvice: string;
  statusCode?: string | number;
} {
  const msg = (err?.message || err?.toString() || '').toLowerCase();
  const status = err?.status || err?.statusCode || (
    msg.includes('429') ? 429 : 
    msg.includes('404') ? 404 : 
    msg.includes('403') ? 403 : 
    msg.includes('401') ? 401 : undefined
  );

  if (status === 429 || msg.includes('429') || msg.includes('resource_exhausted') || msg.includes('quota') || msg.includes('rate limit') || msg.includes('too many requests')) {
    return {
      category: 'rate_limits',
      statusCode: 429,
      friendlyReason: 'Rate limit or quota threshold reached (429). The Gemini API key has exceeded request limits.',
      actionAdvice: 'Wait 30-60 seconds and click "1-Click Retry Extraction" (no photo recapture required), or provide your own API key in AI Settings for higher quota.'
    };
  }

  if (status === 403 || status === 401 || msg.includes('403') || msg.includes('401') || msg.includes('api_key_invalid') || msg.includes('unauthorized') || msg.includes('invalid api key') || msg.includes('forbidden') || msg.includes('permission_denied')) {
    return {
      category: 'api_key_status',
      statusCode: status || 403,
      friendlyReason: 'API Key Authentication Issue. The current API key is invalid, missing, or unauthorized.',
      actionAdvice: 'Click "AI Settings" below to verify or configure a valid Google AI Studio API key.'
    };
  }

  if (msg.includes('fetch failed') || msg.includes('timeout') || msg.includes('network') || msg.includes('econnrefused') || msg.includes('enotfound') || msg.includes('aborted') || msg.includes('failed to fetch')) {
    return {
      category: 'network_timeout',
      statusCode: 'NET_TIMEOUT',
      friendlyReason: 'Network connection timeout or disruption while uploading document frames to the vision servers.',
      actionAdvice: 'Verify your internet connection and click "1-Click Retry Extraction" to re-transmit the cached manifest frames.'
    };
  }

  if (status === 404 || msg.includes('404') || msg.includes('not found') || msg.includes('discontinued') || msg.includes('retired') || msg.includes('is not supported') || msg.includes('model not found')) {
    return {
      category: 'model_discontinued_or_unavailable',
      statusCode: 404,
      friendlyReason: 'Model unavailable or discontinued. Primary model could not be accessed.',
      actionAdvice: 'The engine automatically cascaded to fallback models. If all models were unavailable, click Retry or check AI Settings.'
    };
  }

  return {
    category: 'document_error',
    statusCode: status || 'ERROR',
    friendlyReason: err?.message || 'Document processing was interrupted by an unexpected parsing discrepancy.',
    actionAdvice: 'Click "1-Click Retry Extraction" to re-process with relaxed matrix parsing, or check photo clarity.'
  };
}

/**
 * Compact matrix JSON prompt with support for inferred/low-visibility line items.
 */
function buildCompactMatrixPrompt(instruction?: string): string {
  return `
You are a high-precision OCR and document manifest extraction system.
Analyze the attached consecutive manifest page image(s) and extract all consignment/billing line items with 100% factual accuracy.
${instruction ? `USER INSTRUCTIONS: ${instruction}\n` : ""}

CRITICAL EXTRACTION DIRECTIVES:
1. Manifest Meta:
   - Identify "Manifest No", "MF No", "Runsheet No", "Loading Sheet No", or top header reference as 'manifestNo'.
   - Identify "Date", "Manifest Date", "Booking Date" as 'manifestDate' (formatted as DD/MM/YYYY or DD-MM-YYYY).

2. Table Row Parsing (Continuous across all provided page images):
   - SL NO / #: Sequential index in the table (1, 2, 3, ...). Preserve printed sequence.
   - AWB / DOC NO: Consignment or tracking or document number (e.g. 745829103, 1029482, DEL89201).
   - DESCRIPTION: Contents or consignee destination (e.g. "Documents", "Garments", "Spare Parts").
   - TYPE: Strictly "Document" (if letters/envelopes/doc) or "Parcel" (goods, boxes, packets, sample).
   - WEIGHT: Numerical weight in kilograms. Parse '2.5 kg', '500 gm' -> 0.5, '12.000' -> 12.0. If missing, default to 0.
   - IS_INFERRED: Boolean (true if text was faint, low contrast, smudged, partially obscured, or inferred from context/sequence).
   - INFERENCE_REASON: String explanation if inferred (e.g. "Faint 4th digit inferred from sequential stamp", "Low contrast ink", or blank "").

OUTPUT FORMAT REQUIREMENTS:
Output ONLY a raw, valid JSON object with a compact rows 2D array:
{
  "manifestNo": "string",
  "manifestDate": "string",
  "columns": ["slNo", "awb", "description", "type", "weight", "isInferred", "inferenceReason"],
  "matrix": [
    [1, "AWB_1001", "DOCUMENTS", "Document", 0.5, false, ""],
    [2, "AWB_1002", "PARCEL BOX", "Parcel", 4.5, true, "Faint stamp over barcode"]
  ],
  "errors": [
    { "type": "warning", "message": "string" }
  ]
}

DO NOT wrap in conversational text or markdown code blocks if possible. Ensure every visible row on every page is transcribed.
`;
}

/**
 * Executes manifest extraction with automatic model fallback cascading.
 * Primary model: gemini-3.6-flash. Cascades to gemini-flash-latest and subsequent fallbacks
 * only when unavailable, discontinued, or rate-limited.
 */
export async function extractManifestWithFallback(
  inputs: ManifestImageInput[],
  config: BillingConfig,
  customApiKey?: string,
  onStatusUpdate?: (status: string) => void,
  signal?: AbortSignal,
  modelPrefOverride?: ExtractionModelPreference
): Promise<ExtractionResult> {
  if (signal?.aborted) {
    throw new DOMException("Extraction stopped by user", "AbortError");
  }

  // Determine effective model execution sequence based on preferences (supports Default + Fetched models)
  const pref = modelPrefOverride || getExtractionModelPreference();
  const allKnownModels = getAllKnownExtractionModels();
  const resolveModelSpec = (modelName: string): ExtractionModelSpec => {
    const found = allKnownModels.find((m) => m.name === modelName);
    if (found) return found;
    return {
      name: modelName,
      shortLabel: modelName,
      badge: "Fetched Live",
      badgeColor: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800",
      tierLabel: `Live Gemini Model (${modelName})`,
      description: "Live model fetched from Gemini API",
      speed: "Fast",
      recommended: false,
      isFetched: true,
    };
  };

  let executionModels: ExtractionModelSpec[] = [];

  if (pref.mode === 'single') {
    const chosenName = pref.selectedModels[0] || AVAILABLE_EXTRACTION_MODELS[0].name;
    executionModels = [resolveModelSpec(chosenName)];
  } else if (pref.mode === 'multiple') {
    const selected = (pref.selectedModels || []).filter(Boolean);
    executionModels = selected.map(resolveModelSpec);
    if (executionModels.length === 0) {
      executionModels = [AVAILABLE_EXTRACTION_MODELS[0]];
    }
  } else {
    // 'auto' mode: uses user-configured cascade (including any fetched models) or full default chain
    const selected = (pref.selectedModels || []).filter(Boolean);
    executionModels =
      selected.length > 0 ? selected.map(resolveModelSpec) : [...AVAILABLE_EXTRACTION_MODELS];
  }

  const apiKey = getEffectiveGeminiApiKey(customApiKey);
  if (!apiKey) {
    const diagnostic: ExtractionDiagnosticReport = {
      timestamp: Date.now(),
      primaryModel: executionModels[0]?.name || AVAILABLE_EXTRACTION_MODELS[0].name,
      overallReason: "No API Key Provided",
      failureCategory: "api_key_status",
      friendlyFailureReason: "Google AI Studio API key is missing or not configured.",
      actionAdvice: "Click 'AI Settings' to provide your Gemini API key.",
      fallbackProtocolTrace: [],
      cachedFramesCount: inputs.length,
      canRetry: false,
    };
    throw new ExtractionDiagnosticError("Gemini API key is not configured.", diagnostic);
  }

  const ai = new GoogleGenAI({ apiKey });
  const prompt = buildCompactMatrixPrompt();

  // Create multimodal parts array with all continuous page images
  const parts: any[] = inputs.map((img) => ({
    inlineData: {
      data: img.data,
      mimeType: img.mimeType || "image/jpeg",
    },
  }));
  parts.push({ text: prompt });

  const fallbackTrace: ModelAttemptTrace[] = [];
  let responseText: string | null = null;
  let selectedModel = executionModels[0]?.name || AVAILABLE_EXTRACTION_MODELS[0].name;
  let lastCategorizedError: ReturnType<typeof categorizeExtractionFailure> | null = null;

  // Model Execution Loop (Auto cascade, single dedicated model, or user-selected multiple models)
  for (let i = 0; i < executionModels.length; i++) {
    if (signal?.aborted) {
      throw new DOMException("Extraction stopped by user", "AbortError");
    }

    const spec = executionModels[i];
    const startTime = Date.now();
    selectedModel = spec.name;

    try {
      if (onStatusUpdate) {
        if (i === 0) {
          const modeNotice = pref.mode === 'single'
            ? `(Dedicated Model: ${spec.name})`
            : pref.mode === 'multiple'
            ? `(Custom Chain ${i + 1}/${executionModels.length}: ${spec.name})`
            : `(Auto Primary: ${spec.name})`;
          onStatusUpdate(`Analyzing ${inputs.length} document frame(s) with ${modeNotice}...`);
        } else {
          onStatusUpdate(`Notice: Model unavailable. Auto-cascading to Tier ${i + 1} (${spec.name})...`);
        }
      }

      const generatePromise = ai.models.generateContent({
        model: spec.name,
        contents: [{ parts }],
        config: {
          temperature: 0.1,
          responseMimeType: "application/json",
        },
      });

      const response = signal
        ? await Promise.race([
            generatePromise,
            new Promise<never>((_, reject) => {
              if (signal.aborted) {
                reject(new DOMException("Extraction stopped by user", "AbortError"));
              } else {
                signal.addEventListener(
                  "abort",
                  () => reject(new DOMException("Extraction stopped by user", "AbortError")),
                  { once: true }
                );
              }
            })
          ])
        : await generatePromise;

      const durationMs = Date.now() - startTime;

      if (response && response.text) {
        responseText = response.text;
        fallbackTrace.push({
          modelName: spec.name,
          tierLabel: spec.tierLabel,
          attemptNumber: i + 1,
          status: 'success',
          timestamp: new Date().toLocaleTimeString(),
          durationMs,
          statusCode: 200,
          friendlyReason: 'Extraction succeeded',
        });
        break; // Success!
      } else {
        throw new Error("Model returned an empty text payload.");
      }
    } catch (err: any) {
      if (err.name === 'AbortError' || signal?.aborted) {
        throw err;
      }
      const durationMs = Date.now() - startTime;
      const failure = categorizeExtractionFailure(err);
      lastCategorizedError = failure;

      console.warn(`Extraction attempt with model ${spec.name} failed:`, err);

      fallbackTrace.push({
        modelName: spec.name,
        tierLabel: spec.tierLabel,
        attemptNumber: i + 1,
        status: 'failed',
        timestamp: new Date().toLocaleTimeString(),
        durationMs,
        statusCode: failure.statusCode,
        failureCategory: failure.category,
        failureReason: err?.message || String(err),
        friendlyReason: failure.friendlyReason,
      });

      if (i < executionModels.length - 1) {
        if (onStatusUpdate) {
          onStatusUpdate(`Tier ${i + 1} (${spec.name}) busy or unavailable. Cascading to ${executionModels[i + 1].name}...`);
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }

  if (!responseText) {
    const failure = lastCategorizedError || {
      category: 'document_error' as const,
      friendlyReason: 'Document extraction could not complete across all configured model tiers.',
      actionAdvice: 'Click "1-Click Retry Extraction" to attempt again, or check AI Settings.',
      statusCode: 'FAIL',
    };

    const diagnostic: ExtractionDiagnosticReport = {
      timestamp: Date.now(),
      primaryModel: executionModels[0]?.name || AVAILABLE_EXTRACTION_MODELS[0].name,
      overallReason: failure.friendlyReason,
      failureCategory: failure.category,
      friendlyFailureReason: failure.friendlyReason,
      actionAdvice: failure.actionAdvice,
      fallbackProtocolTrace: fallbackTrace,
      cachedFramesCount: inputs.length,
      canRetry: true,
    };

    throw new ExtractionDiagnosticError(
      `Document extraction failed across all model tiers. ${failure.friendlyReason}`,
      diagnostic
    );
  }

  if (onStatusUpdate) {
    onStatusUpdate("Normalizing extracted rows & verifying sequence...");
  }

  // Sanitize code blocks if present
  let cleanJson = responseText.trim();
  if (cleanJson.startsWith("```json")) {
    cleanJson = cleanJson.replace(/^```json\s*/, "").replace(/\s*```$/, "");
  } else if (cleanJson.startsWith("```")) {
    cleanJson = cleanJson.replace(/^```\s*/, "").replace(/\s*```$/, "");
  }

  let parsedData: any;
  try {
    parsedData = JSON.parse(cleanJson);
  } catch (parseErr) {
    const match = cleanJson.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsedData = JSON.parse(match[0]);
      } catch (e2) {
        throw new Error("Failed to parse model output into structured JSON format.");
      }
    } else {
      throw new Error("Model returned malformed JSON response.");
    }
  }

  // Client-Side Normalizer: Translate compact matrix or object items into standard format
  const rawItems: any[] = [];

  if (Array.isArray(parsedData.matrix)) {
    // Compact matrix format: [slNo, awb, description, type, weight, isInferred, inferenceReason]
    parsedData.matrix.forEach((rowArr: any[], idx: number) => {
      if (Array.isArray(rowArr)) {
        const slNo = typeof rowArr[0] === "number" ? rowArr[0] : parseInt(rowArr[0], 10) || idx + 1;
        const serialNo = (rowArr[1] ?? "").toString().trim();
        const description = (rowArr[2] ?? "Consignment Item").toString().trim();
        const typeRaw = (rowArr[3] ?? "Parcel").toString().trim().toLowerCase();
        const type = typeRaw.includes("doc") ? ItemType.DOCUMENT : ItemType.PARCEL;
        const weightRaw = typeof rowArr[4] === "number" ? rowArr[4] : parseFloat(rowArr[4]) || 0;
        const weight = isNaN(weightRaw) ? 0 : weightRaw;
        const isInferred = Boolean(rowArr[5] || serialNo.includes('?') || serialNo.toLowerCase().includes('[unclear]'));
        const inferenceReason = (rowArr[6] ?? (isInferred ? "Low visibility text inferred from scan context" : "")).toString().trim();

        rawItems.push({ slNo, serialNo, description, type, weight, isInferred, inferenceReason });
      }
    });
  } else if (Array.isArray(parsedData.items)) {
    parsedData.items.forEach((item: any, idx: number) => {
      const serialNo = (item.serialNo || item.awb || item.docNo || "").toString().trim();
      const isInferred = Boolean(item.isInferred || serialNo.includes('?') || serialNo.toLowerCase().includes('[unclear]'));
      const inferenceReason = item.inferenceReason || (isInferred ? "Low visibility text inferred from scan context" : undefined);

      rawItems.push({
        slNo: typeof item.slNo === "number" ? item.slNo : parseInt(item.slNo, 10) || idx + 1,
        serialNo,
        description: (item.description || item.desc || "Consignment Item").toString().trim(),
        type: (item.type || "").toString().toLowerCase().includes("doc") ? ItemType.DOCUMENT : ItemType.PARCEL,
        weight: typeof item.weight === "number" ? item.weight : parseFloat(item.weight) || 0,
        isInferred,
        inferenceReason,
      });
    });
  } else if (Array.isArray(parsedData.rows)) {
    parsedData.rows.forEach((item: any, idx: number) => {
      if (Array.isArray(item)) {
        const serialNo = (item[1] ?? "").toString().trim();
        const isInferred = Boolean(item[5] || serialNo.includes('?'));
        rawItems.push({
          slNo: typeof item[0] === "number" ? item[0] : parseInt(item[0], 10) || idx + 1,
          serialNo,
          description: (item[2] ?? "").toString().trim(),
          type: (item[3] ?? "").toString().toLowerCase().includes("doc") ? ItemType.DOCUMENT : ItemType.PARCEL,
          weight: typeof item[4] === "number" ? item[4] : parseFloat(item[4]) || 0,
          isInferred,
          inferenceReason: item[6] || undefined,
        });
      } else if (typeof item === "object") {
        const serialNo = (item.serialNo || item.awb || "").toString().trim();
        const isInferred = Boolean(item.isInferred || serialNo.includes('?'));
        rawItems.push({
          slNo: typeof item.slNo === "number" ? item.slNo : parseInt(item.slNo, 10) || idx + 1,
          serialNo,
          description: (item.description || "").toString().trim(),
          type: (item.type || "").toString().toLowerCase().includes("doc") ? ItemType.DOCUMENT : ItemType.PARCEL,
          weight: typeof item.weight === "number" ? item.weight : parseFloat(item.weight) || 0,
          isInferred,
          inferenceReason: item.inferenceReason || undefined,
        });
      }
    });
  }

  // Reconcile and calculate pricing
  const reconciled = reconcileImportedRows(rawItems, config);

  const manifestNo = (parsedData.manifestNo || `MF-${Date.now().toString().slice(-6)}`).toString().trim();
  const manifestDate = (parsedData.manifestDate || new Date().toLocaleDateString("en-GB")).toString().trim();

  const totalAmount = reconciled.rows.reduce((sum, r) => sum + r.amount, 0);

  return {
    manifestNo,
    manifestDate,
    rows: reconciled.rows,
    totalAmount,
    itemCount: reconciled.rows.length,
    missingCount: reconciled.missingCount,
    duplicateSlNoCount: reconciled.duplicateSlNoCount,
    duplicateAwbCount: reconciled.duplicateAwbCount,
    inferredCount: reconciled.inferredCount || 0,
    errors: Array.isArray(parsedData.errors) ? parsedData.errors : [],
    modelUsed: selectedModel,
    fallbackTrace,
  };
}
