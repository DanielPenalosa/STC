/**
 * FREE ID Verification using Tesseract.js OCR
 * 
 * This is a completely free alternative to OpenAI-based ID verification.
 * Uses Tesseract.js (open-source OCR) to extract text from government IDs.
 * 
 * Limitations vs OpenAI:
 * - Less accurate OCR (especially with poor quality images)
 * - Cannot detect ID type automatically
 * - No image quality assessment
 * - Simpler address validation
 * 
 * Benefits:
 * - ✅ 100% FREE - No API costs
 * - ✅ Runs completely offline
 * - ✅ No external API dependencies
 * - ✅ Privacy-friendly (data never leaves your server)
 */

import { createWorker, type Worker } from 'tesseract.js';
import type { IdVerificationResult, ExtractedId, AddressValidation } from './id-verify';
import { validateStaCruzAddress, namesMatch } from './id-verify';

let worker: Worker | null = null;

async function getTesseractWorker(): Promise<Worker> {
  if (worker) return worker;
  
  worker = await createWorker('eng');
  await worker.setParameters({
    tessedit_pageseg_mode: '1', // Automatic page segmentation with OSD
    preserve_interword_spaces: '1',
  });
  
  return worker;
}

/**
 * Extract text from ID image using Tesseract OCR
 */
async function extractTextFromImage(imageBuffer: Buffer): Promise<{
  text: string;
  confidence: number;
}> {
  try {
    const tesseract = await getTesseractWorker();
    const { data } = await tesseract.recognize(imageBuffer);
    
    return {
      text: data.text,
      confidence: data.confidence / 100, // Convert 0-100 to 0-1
    };
  } catch (error) {
    console.error('[Free ID Verify] Tesseract OCR failed:', error);
    return {
      text: '',
      confidence: 0,
    };
  }
}

/**
 * Parse extracted text to find key information
 */
function parseIdText(text: string, registeredName: string): {
  extracted: ExtractedId;
  ocrConfidence: number;
} {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const fullText = text.toLowerCase();
  
  // Try to find name (look for lines with alphabetic characters)
  let foundName: string | null = null;
  for (const line of lines) {
    // Skip lines that are likely not names (too short, mostly numbers, etc.)
    if (line.length < 5) continue;
    if (/\d{4,}/.test(line)) continue; // Skip lines with long numbers
    if (/^(republic|philippines|pilipinas|id|identification)/i.test(line)) continue;
    
    // Check if this line might be a name (mostly letters)
    const alphaRatio = (line.match(/[a-zA-Z]/g) || []).length / line.length;
    if (alphaRatio > 0.7) {
      foundName = line;
      break;
    }
  }
  
  // Try to find address (look for keywords)
  let foundAddress: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase();
    if (
      line.includes('address') ||
      line.includes('residence') ||
      line.includes('laguna') ||
      /brgy|barangay/.test(line) ||
      /sta\.?\s*cruz|santa\s+cruz/.test(line)
    ) {
      // Take this line and possibly the next few lines as address
      foundAddress = lines.slice(i, Math.min(i + 4, lines.length)).join(' ');
      break;
    }
  }
  
  // Try to find ID number (look for long number sequences)
  let foundIdNumber: string | null = null;
  for (const line of lines) {
    // Look for sequences like "1234-5678-9012" or long numbers
    const numberMatch = line.match(/\d[\d\s-]{8,}/);
    if (numberMatch) {
      foundIdNumber = numberMatch[0].replace(/\s+/g, '');
      break;
    }
  }
  
  // Try to find date of birth
  let foundDob: string | null = null;
  const dobPatterns = [
    /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/, // MM/DD/YYYY or DD/MM/YYYY
    /\b(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\b/, // YYYY-MM-DD
  ];
  for (const pattern of dobPatterns) {
    const match = text.match(pattern);
    if (match) {
      foundDob = match[0];
      break;
    }
  }
  
  // Estimate confidence based on what we found
  let confidence = 0.3; // Base confidence for Tesseract
  if (foundName) confidence += 0.2;
  if (foundAddress) confidence += 0.2;
  if (foundIdNumber) confidence += 0.2;
  if (foundDob) confidence += 0.1;
  
  return {
    extracted: {
      id_type: null, // Cannot reliably detect ID type from OCR alone
      full_name: foundName,
      date_of_birth: foundDob,
      id_number: foundIdNumber,
      address: foundAddress,
      expiration_date: null, // Hard to detect reliably
    },
    ocrConfidence: Math.min(confidence, 1),
  };
}

/**
 * FREE ID Verification using Tesseract.js
 * 
 * This function provides a completely free alternative to OpenAI-based verification.
 * It uses Tesseract OCR to extract text and validates address for Sta. Cruz, Laguna.
 */
export async function verifyIdPhotoFree(input: {
  imageBuffer: Buffer;
  registeredFullName: string;
}): Promise<IdVerificationResult> {
  const reasons: string[] = [];
  
  try {
    // Step 1: Extract text using OCR
    console.log('[Free ID Verify] Starting OCR extraction...');
    const { text, confidence: rawConfidence } = await extractTextFromImage(input.imageBuffer);
    
    if (!text || text.length < 20) {
      return {
        ok: false,
        detected: false,
        quality: null,
        extracted: null,
        addressValidation: null,
        ocr_confidence: rawConfidence,
        verification_score: 0,
        status: "failed",
        reasons: ["Could not extract readable text from ID - please upload a clearer photo"],
        model_used: "tesseract.js",
        raw: { text },
      };
    }
    
    console.log('[Free ID Verify] OCR extracted', text.length, 'characters');
    
    // Step 2: Parse the extracted text
    const { extracted, ocrConfidence } = parseIdText(text, input.registeredFullName);
    
    // Step 3: Validate required fields
    if (!extracted.full_name) {
      reasons.push("Could not find name on ID - text may be unclear");
    }
    
    if (!extracted.address) {
      reasons.push("Could not find address on ID");
    }
    
    if (!extracted.id_number) {
      reasons.push("Could not find ID number");
    }
    
    // Step 4: Name matching
    const nameMatch = namesMatch({
      registeredFullName: input.registeredFullName,
      extractedFullName: extracted.full_name,
    });
    
    if (!nameMatch.matched && extracted.full_name) {
      reasons.push("Name on ID does not match registered name");
    }
    
    // Step 5: Address validation
    const addressValidation = validateStaCruzAddress(extracted.address);
    
    if (!addressValidation.isStaCruz) {
      if (addressValidation.confidence === "high") {
        reasons.push(`Address verification failed: ${addressValidation.reason}`);
      } else {
        reasons.push(`Address needs verification: ${addressValidation.reason}`);
      }
    } else if (addressValidation.confidence === "medium") {
      reasons.push(`Address verification uncertain: ${addressValidation.reason}`);
    }
    
    // Step 6: Calculate score
    let score = ocrConfidence;
    if (extracted.full_name && extracted.id_number) score += 0.05;
    if (nameMatch.matched) score += 0.1;
    if (addressValidation.isStaCruz && addressValidation.confidence === "high") score += 0.15;
    else if (addressValidation.isStaCruz && addressValidation.confidence === "medium") score += 0.05;
    if (!addressValidation.isStaCruz && addressValidation.confidence === "high") score -= 0.3;
    score = Math.max(0, Math.min(1, score));
    
    // Step 7: Determine status
    let status: "passed" | "needs_review" | "failed";
    
    if (!addressValidation.isStaCruz && addressValidation.confidence === "high") {
      status = "failed";
    } else if (
      reasons.length === 0 &&
      score >= 0.65 && // Lower threshold for free OCR
      addressValidation.isStaCruz &&
      addressValidation.confidence === "high"
    ) {
      status = "passed";
    } else {
      status = "needs_review";
    }
    
    if (status === "needs_review" && reasons.length === 0) {
      reasons.push("OCR confidence below auto-approval threshold - manual review recommended");
    }
    
    console.log('[Free ID Verify] Result:', status, 'Score:', score.toFixed(2));
    
    return {
      ok: true,
      detected: true,
      quality: null,
      extracted,
      addressValidation,
      ocr_confidence: ocrConfidence,
      verification_score: score,
      status,
      reasons,
      model_used: "tesseract.js-free",
      raw: { text, parsed: extracted },
    };
    
  } catch (error) {
    console.error('[Free ID Verify] Error:', error);
    return {
      ok: false,
      detected: false,
      quality: null,
      extracted: null,
      addressValidation: null,
      ocr_confidence: 0,
      verification_score: 0,
      status: "needs_review",
      reasons: [
        error instanceof Error
          ? `OCR processing failed: ${error.message}`
          : "OCR processing failed - manual review required",
      ],
      model_used: "tesseract.js-free",
      raw: {},
    };
  }
}

/**
 * Cleanup Tesseract worker when shutting down
 */
export async function cleanupTesseract() {
  if (worker) {
    await worker.terminate();
    worker = null;
  }
}
