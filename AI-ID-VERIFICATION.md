# AI-Powered ID Verification System

## Overview

SCOUT now uses AI to automatically verify newly registered users by scanning their government-issued ID and validating residency in Sta. Cruz, Laguna.

## How It Works

### 1. ID Upload
When a user registers, they upload a photo of their government-issued ID.

### 2. AI Processing Pipeline
The system processes the ID through multiple stages:

#### Stage 1: Image Quality Check
- Detects blur, darkness, glare, or cropping issues
- Rejects poor quality images automatically

#### Stage 2: Document Detection
- Verifies the image contains an actual ID document
- Rejects non-ID images

#### Stage 3: OCR & Information Extraction
Extracts the following fields:
- Full name
- Date of birth
- ID number
- **Residential address**
- Expiration date (for IDs that expire)
- ID type

#### Stage 4: Name Matching
- Compares extracted name with registered name
- Uses fuzzy matching (tolerates OCR errors, typos)
- Requires 60% token match to pass

#### Stage 5: **Address Validation** (NEW)
Validates the extracted address belongs to Sta. Cruz, Laguna:

**High Confidence Approval:**
- Address contains "Sta. Cruz" or "Santa Cruz"
- Province is "Laguna"
- Barangay matches one of the 26 official barangays

**High Confidence Rejection:**
- Address clearly belongs to another municipality (Manila, Calamba, Quezon City, etc.)
- Province is not Laguna

**Needs Manual Review:**
- Address mentions "Santa Cruz" but province is unclear (could be another Santa Cruz)
- Barangay found but municipality not explicitly stated
- Address is blurry, incomplete, or unreadable

### 3. Verification Outcomes

#### ✅ PASSED (Auto-Approved)
Account is **automatically verified** when ALL conditions are met:
- High quality image
- Valid government ID detected
- Name matches registration
- **Address confirmed as Sta. Cruz, Laguna** (with barangay)
- ID not expired
- Verification score ≥ 0.75

#### ❌ FAILED (Auto-Rejected)
Account is **automatically rejected** when:
- No ID document detected
- **Address clearly belongs to another municipality/province**

#### ⚠️ NEEDS REVIEW (Manual Admin Review)
Account requires manual review when:
- Image quality is poor but document is detectable
- Name match is uncertain
- **Address verification is unclear or ambiguous**
- ID type is unsupported or unreadable
- Verification score < 0.75
- Any uncertainty in validation

## Supported ID Types

- PhilSys National ID
- Driver's License
- Passport
- UMID
- PhilHealth ID
- Voter's ID
- Postal ID
- PRC ID
- Senior Citizen ID
- TIN ID

## Official Barangays of Sta. Cruz, Laguna

The system validates against these 26 official barangays:

1. Alipit
2. Bagumbayan
3. Bubukal
4. Calios
5. Duhat
6. Gatid
7. Jasaan
8. Labuin
9. Malinao
10. Oogong
11. Pagsawitan
12. Palasan
13. Patimbao
14. Poblacion I
15. Poblacion II
16. Poblacion III
17. Poblacion IV
18. Poblacion V
19. San Jose
20. San Juan
21. San Pablo Norte
22. San Pablo Sur
23. Santisima Cruz
24. Santo Angel Central
25. Santo Angel Norte
26. Santo Angel Sur

## Address Validation Examples

### ✅ Auto-Approved
```
"123 Main St, Brgy. Alipit, Sta. Cruz, Laguna"
"Poblacion II, Santa Cruz, Laguna"
"San Juan, Sta Cruz Laguna"
```

### ❌ Auto-Rejected
```
"456 Street, Calamba City, Laguna" (different municipality)
"789 Road, Manila" (different province)
"Quezon City, Metro Manila" (different region)
```

### ⚠️ Needs Review
```
"Santa Cruz" (no province mentioned - could be another Santa Cruz)
"Brgy. Alipit" (barangay found but municipality unclear)
"[blurry/unreadable address]"
```

## Verification Scoring

The system calculates a score from 0 to 1:

- Base OCR confidence: 0-1
- Valid ID type: +0.05
- Name & ID number readable: +0.05
- Name matches registration: +0.10
- **Address verified (high confidence): +0.15**
- **Address verified (medium confidence): +0.05**
- Poor image quality: -0.20
- **Non-resident (high confidence): -0.30**

**Auto-approval threshold: 0.75**

## Admin Interface

Admins can see AI verification results in the Users management dashboard:

- 🤖 **AI verified** badge for passed accounts
- 🤖 **AI needs review** badge for uncertain cases
- 🤖 **AI failed** badge for rejected cases

Admins can:
- View the uploaded ID photo
- See extracted information (name, address, ID type)
- Review AI reasoning (why it passed/failed/needs review)
- Manually approve or reject any account
- Override AI decisions when necessary

## Configuration

### Required Environment Variable

```env
OPENAI_API_KEY=sk-...
```

The system uses OpenAI's GPT-4o-mini with vision for OCR and extraction.

### Optional: Custom OCR Provider

```env
AI_OCR_ENDPOINT=https://your-custom-ocr-service.com/extract
AI_OCR_API_KEY=your-api-key
```

## Security & Privacy

- ID photos are stored in private storage buckets
- Only admins can view ID photos
- Service role access required to read verification data
- Citizens cannot modify their verification status
- AI verification never bypasses human oversight for uncertain cases
- Failed verifications notify admins for manual review

## Testing the System

1. Register a new citizen account
2. Upload a clear photo of a government ID with a Sta. Cruz, Laguna address
3. Wait a few seconds for AI processing
4. If address is verified and all checks pass → account is automatically approved
5. If uncertain → admin receives notification for manual review
6. If clearly non-resident → account is automatically rejected

## Files Modified

- `lib/ai/id-verify.ts` - Main verification logic with address validation
- `supabase/functions/verify-id/index.ts` - Edge function for Supabase-stored IDs
- `app/api/upload-id/route.ts` - Upload handler with auto-approval logic

## Benefits

✅ **Faster onboarding** - Residents get instant access
✅ **Reduced admin workload** - Only uncertain cases need review
✅ **Improved accuracy** - AI validates address + barangay
✅ **Prevents fraud** - Rejects non-residents automatically
✅ **Transparent** - Full reasoning shown to admins

---

**Note**: The AI assists human decision-making but doesn't replace it. Admins can always override AI decisions and manually verify any account.
