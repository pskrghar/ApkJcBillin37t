import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export interface FileInput {
  data: string;
  mimeType: string;
}

export type StatusUpdateCallback = (message: string) => void;

// Define model tiers
const MODELS = {
  FAST: 'gemini-3.6-flash',
  ACCURATE: 'gemini-3-pro-preview',
  FALLBACK: 'gemini-flash-latest' // gemini-flash-latest of same type
};

async function callModel(
  modelName: string, 
  parts: any[], 
  config: any, 
  onStatusUpdate?: StatusUpdateCallback
) {
  if (onStatusUpdate) onStatusUpdate(`Sending data to AI Model (${modelName})...`);
  
  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [{ parts: parts }],
      config: config
    });
    return response;
  } catch (error: any) {
    console.warn(`Model ${modelName} failed:`, error);
    throw error;
  }
}

export async function parseBillingDocument(
  inputs: FileInput[], 
  processingInstruction: string,
  useHybridMode: boolean,
  onStatusUpdate?: StatusUpdateCallback
) {
  const prompt = `
    Analyze the provided document(s) (Images, PDF, Excel, or Word) and extract billing data into a structured format.
    ${processingInstruction ? `PROCESSING INSTRUCTION: ${processingInstruction}` : ''}
    
    CRITICAL EXTRACTION PRIORITY (High Accuracy Required):
    1. **SL NO (Serial Number)**: The sequential number in the table list.
    2. **AWB / DOCUMENT NO**: The unique identifier for the shipment. accurate extraction is vital.
    3. **WEIGHT**: The weight of the item. Look for 'kg', 'g', 'lb'. Default to 0 if not found.

    METADATA EXTRACTION:
    - Look for a "Manifest Number", "MF No", "Runsheet No", or similar unique document ID. Map to 'manifestNo'.
    - Look for a "Manifest Date". Map to 'manifestDate'.

    COLUMN MAPPING RULES:
    - Description: Content description.
    - Type: 'Document' (if desc contains doc/letter) or 'Parcel'.
    
    LOGIC RULES:
    - If multiple images are provided, treat them as sequential pages of ONE manifest.
    - Detect table structures even if grid lines are missing (OCR inference).
    - Ignore footer totals when extracting line items.
    
    ERROR DETECTION:
    - Flag missing AWB numbers.
    - Flag duplicate AWB numbers.
    
    Return the data as a JSON object matching the provided schema.
  `;

  // Construct parts
  const parts: any[] = inputs.map(input => ({
    inlineData: { data: input.data, mimeType: input.mimeType }
  }));
  
  parts.push({ text: prompt });

  const schemaConfig = {
    responseMimeType: "application/json",
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        manifestNo: { type: Type.STRING },
        manifestDate: { type: Type.STRING },
        items: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              slNo: { type: Type.NUMBER },
              serialNo: { type: Type.STRING },
              description: { type: Type.STRING },
              type: { type: Type.STRING, enum: ['Parcel', 'Document'] },
              weight: { type: Type.NUMBER }
            },
            required: ['serialNo', 'weight']
          }
        },
        errors: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              type: { type: Type.STRING },
              message: { type: Type.STRING }
            }
          }
        }
      },
      required: ['items']
    }
  };

  let response;

  if (onStatusUpdate) onStatusUpdate("Initializing document analysis...");

  // HYBRID MODE LOGIC
  // Strategy: Try the Best Model (Pro) -> Fallback to Flash -> Fallback to Lite/Stable
  if (useHybridMode) {
    try {
      if (onStatusUpdate) onStatusUpdate("Hybrid Mode: Performing high-accuracy OCR & Extraction...");
      response = await callModel(MODELS.ACCURATE, parts, schemaConfig, onStatusUpdate);
    } catch (e) {
      if (onStatusUpdate) onStatusUpdate("Primary AI busy. Activating Fallback Protocol (Gemini Flash)...");
      try {
        response = await callModel(MODELS.FAST, parts, schemaConfig, onStatusUpdate);
      } catch (e2) {
        if (onStatusUpdate) onStatusUpdate("Secondary AI busy. Trying Final Backup Model...");
        response = await callModel(MODELS.FALLBACK, parts, schemaConfig, onStatusUpdate);
      }
    }
  } else {
    // DEFAULT MODE LOGIC
    // Strategy: Try Flash (Fast) -> Fallback to Stable
    try {
      if (onStatusUpdate) onStatusUpdate("Default Mode: Standard processing...");
      response = await callModel(MODELS.FAST, parts, schemaConfig, onStatusUpdate);
    } catch (e) {
      if (onStatusUpdate) onStatusUpdate("Rate limit detected. Switching to backup model...");
      response = await callModel(MODELS.FALLBACK, parts, schemaConfig, onStatusUpdate);
    }
  }

  if (onStatusUpdate) onStatusUpdate("Parsing structured data...");
  const jsonStr = response.text.trim();
  return JSON.parse(jsonStr);
}