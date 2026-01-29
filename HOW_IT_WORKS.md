# How Redactor Works: A Complete Technical Walkthrough

This document explains exactly how the PII redactor tool works, step by step, from upload to download.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [System Components](#system-components)
3. [The Complete Flow](#the-complete-flow)
4. [ML Detection Deep Dive](#ml-detection-deep-dive)
5. [Pattern Detection Deep Dive](#pattern-detection-deep-dive)
6. [Entity Merging Strategy](#entity-merging-strategy)
7. [Privacy & GDPR Compliance](#privacy--gdpr-compliance)
8. [Performance Considerations](#performance-considerations)

---

## Architecture Overview

### The Big Picture

```
┌─────────────────────────────────────────────────────────────┐
│                        User's Browser                        │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐         ┌──────────────────────────┐      │
│  │   index.html │◄────────│   Flask Server           │      │
│  │   (UI)       │         │   (app.py)               │      │
│  └──────┬───────┘         │   - Serves static files  │      │
│         │                 │   - No data processing   │      │
│         ▼                 └──────────────────────────┘      │
│  ┌──────────────┐                                            │
│  │   app.js     │  ◄── Main Application Logic               │
│  │              │                                            │
│  │  Coordinates:│                                            │
│  │  - UI states │                                            │
│  │  - File I/O  │                                            │
│  │  - Detection │                                            │
│  └──────┬───────┘                                            │
│         │                                                    │
│    ┌────┴──────┬──────────────┐                             │
│    ▼           ▼              ▼                              │
│  ┌────────┐ ┌─────────────┐ ┌──────────────┐               │
│  │file-   │ │ml-pii-      │ │Transformers. │               │
│  │handler │ │detector.js  │ │js (CDN)      │               │
│  │.js     │ │             │ │              │               │
│  │        │ │- ML model   │ │- BERT model  │               │
│  │- Read  │ │- Patterns   │ │- Tokenizer   │               │
│  │- Write │ │- Merging    │ │- Inference   │               │
│  └────────┘ └─────────────┘ └──────────────┘               │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Key Principle: **Everything Happens in the Browser**

- Flask serves HTML/JS files once
- User uploads file → **stays in browser memory**
- ML model runs → **in browser via WebAssembly**
- User downloads result → **created in browser**
- **Zero data leaves the device**

---

## System Components

### 1. Flask Server (`app.py`)

**Role**: Static file server only

```python
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/health')
def health_check():
    return jsonify({'status': 'healthy'})
```

**What it does**:
- Serves `index.html` when you visit `http://localhost:8080`
- Serves JavaScript files from `static/js/`
- Provides health check endpoint
- **Does NOT process any user data**

**What it does NOT do**:
- No PII detection (that's client-side)
- No file processing
- No database
- No user data storage

---

### 2. User Interface (`templates/index.html`)

**Role**: Single-page application with 3 states

#### State 1: UPLOAD
```
┌─────────────────────────────────┐
│   Drop file here or click to    │
│   select a .txt file            │
│                                 │
│   [Drop Zone]                   │
│                                 │
│   Model Status: Ready           │
└─────────────────────────────────┘
```

#### State 2: REVIEW
```
┌─────────────────────────────────┐
│   Found 5 entities:             │
│                                 │
│   [John Smith]     PERSON ✓     │
│   [Microsoft]      ORG    ✓     │
│   [john@email.com] EMAIL  ✓     │
│                                 │
│   Click to toggle redact/keep   │
│                                 │
│   [Proceed to Download]         │
└─────────────────────────────────┘
```

#### State 3: DOWNLOAD
```
┌─────────────────────────────────┐
│   Ready to download!            │
│                                 │
│   Original:  500 words          │
│   Redacted:  3 entities         │
│                                 │
│   [Download Redacted File]      │
│   [Start Over]                  │
└─────────────────────────────────┘
```

**How state management works**:
- `App.state` tracks current state: `'UPLOAD'`, `'REVIEW'`, or `'DOWNLOAD'`
- `App.setState(newState)` shows/hides relevant DOM elements
- CSS classes toggle visibility

---

### 3. Main Application Logic (`static/js/app.js`)

**Role**: Orchestrates the entire workflow

#### Initialization

```javascript
App.initApp()
  ├─ Initialize ML detector
  ├─ Initialize file handler
  ├─ Setup event listeners
  └─ Set initial state to UPLOAD
```

#### Key Functions

**`handleFile(file)`**
1. Validates file is `.txt`
2. Reads file using FileReader API
3. Stores original text and filename
4. Triggers PII detection
5. Transitions to REVIEW state

**`showReviewState(entities)`**
1. Displays all detected entities
2. Initializes redact flags (all `true` by default)
3. Adds click handlers to toggle redaction
4. Shows "Proceed to Download" button

**`showDownloadState()`**
1. Generates redacted text based on flags
2. Replaces entities with `[REDACTED]`
3. Shows download statistics
4. Enables download button

**`handleDownload()`**
1. Creates Blob from redacted text
2. Generates download URL
3. Triggers browser download
4. Cleans up Blob URL

---

### 4. File Handler (`static/js/file-handler.js`)

**Role**: Browser-based file I/O

#### Reading Files

```javascript
FileHandler.readFile(file)
  ├─ Creates FileReader
  ├─ Reads file as text
  ├─ Returns Promise with content
  └─ Handles errors
```

**Uses**: [FileReader API](https://developer.mozilla.org/en-US/docs/Web/API/FileReader)
- Built into all modern browsers
- Reads files from user's computer
- **Data stays in browser memory**

#### Writing Files

```javascript
FileHandler.downloadFile(content, filename)
  ├─ Creates Blob from text
  ├─ Creates Object URL
  ├─ Creates temporary <a> element
  ├─ Triggers download
  └─ Cleans up Object URL
```

**Uses**: [Blob API](https://developer.mozilla.org/en-US/docs/Web/API/Blob)
- Creates in-memory file
- Generates temporary download URL
- **No server upload needed**

---

### 5. ML PII Detector (`static/js/ml-pii-detector.js`)

**Role**: Dual detection system (ML + Patterns)

#### Architecture

```javascript
class MLPIIDetector {
  ├─ nerPipeline      // Transformers.js NER model
  ├─ modelLoaded      // Ready state flag
  ├─ initialize()     // Load ML model
  ├─ detectPII()      // Main detection function
  ├─ detectPatterns() // Regex detection
  └─ mergeEntities()  // Combine results
}
```

---

## The Complete Flow

### Step-by-Step: Upload to Download

#### 1. User Visits Page

```
Browser → GET http://localhost:8080/
       ← Flask returns index.html

Browser → Loads JavaScript files
       → Loads Transformers.js from CDN
       → Initializes ML model (takes 5-10 seconds)
```

**What happens during ML model initialization**:
```javascript
TransformersJS.pipeline('token-classification', 'Xenova/bert-base-NER')
  ├─ Downloads model from HuggingFace CDN (~100MB)
  ├─ Caches in browser's IndexedDB
  ├─ Loads into WebAssembly runtime
  └─ Sets modelLoaded = true
```

**Note**: Model only downloads once, then cached permanently

---

#### 2. User Uploads File

```
User drops "document.txt"
  ↓
FileHandler.readFile(file)
  ├─ FileReader reads entire file into memory
  ├─ Returns text content as string
  └─ Stores in App.originalText

App.handleFile(file)
  ├─ Stores filename: "document.txt"
  ├─ Calls MLPIIDetector.detectPII(text)
  └─ Waits for results...
```

---

#### 3. PII Detection Runs (The Magic!)

```javascript
MLPIIDetector.detectPII(text)
  ├─ Part A: ML Detection
  │   ├─ Tokenize text using BERT tokenizer
  │   ├─ Run inference through neural network
  │   ├─ Get predictions for each token
  │   ├─ Merge B-/I- tags into complete entities
  │   └─ Returns: [{text: "John Smith", type: "PERSON", start: 0, end: 10}]
  │
  ├─ Part B: Pattern Detection
  │   ├─ Run regex for emails
  │   ├─ Run regex for phone numbers
  │   ├─ Run regex for SSNs
  │   ├─ Run regex for credit cards
  │   └─ Returns: [{text: "john@email.com", type: "EMAIL", start: 50, end: 65}]
  │
  └─ Part C: Merge Results
      ├─ Combine ML + pattern entities
      ├─ Remove duplicates (same position)
      ├─ Sort by position in text
      └─ Returns final entity list
```

---

## ML Detection Deep Dive

### How BERT-based NER Works

#### 1. Tokenization

**Input text**: "John Smith works at Microsoft"

**Tokenization process**:
```
Text → Tokenizer → Token IDs
"John Smith works at Microsoft"
   ↓
["John", "Smith", "works", "at", "Microsoft"]
   ↓
[2198, 3726, 2573, 2012, 7513]  ← Numerical IDs
```

#### 2. Neural Network Inference

```
Token IDs → BERT Model → Predictions per token

Input:  [2198,  3726,  2573,  2012,  7513]
         ↓       ↓      ↓      ↓      ↓
Model:  [BERT Neural Network - 12 layers, 110M parameters]
         ↓       ↓      ↓      ↓      ↓
Output: [B-PER, I-PER,  O,     O,   B-ORG]
Score:  [0.98,  0.97,  0.99,  0.99,  0.96]
```

**Tag meanings**:
- `B-PER` = Beginning of PERSON entity
- `I-PER` = Inside (continuation) of PERSON entity
- `B-ORG` = Beginning of ORGANIZATION entity
- `O` = Outside (not an entity)

#### 3. Entity Merging

```javascript
// Raw tokens with B-/I- tags
[
  {token: "John",      tag: "B-PER", score: 0.98},
  {token: "Smith",     tag: "I-PER", score: 0.97},
  {token: "works",     tag: "O",     score: 0.99},
  {token: "at",        tag: "O",     score: 0.99},
  {token: "Microsoft", tag: "B-ORG", score: 0.96}
]

// After merging
[
  {text: "John Smith", type: "PERSON", confidence: 0.97},
  {text: "Microsoft",  type: "ORG",    confidence: 0.96}
]
```

**Merging algorithm**:
1. Start with first token
2. If `B-` tag → start new entity
3. If `I-` tag → add to current entity
4. If `O` tag → close current entity (if any)
5. Find exact positions in original text
6. Filter by confidence threshold (default: 0.5)

#### 4. Position Finding

```javascript
// Problem: We have "John Smith" but need to find it in original text
// Solution: Search for exact match

function findPosition(text, entity) {
  const index = text.indexOf(entity);
  return {
    start: index,
    end: index + entity.length
  };
}

// Example:
text = "John Smith works at Microsoft"
entity = "John Smith"
→ {start: 0, end: 10}
```

---

## Pattern Detection Deep Dive

### Regex Patterns for Structured PII

#### Email Detection

```javascript
const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;

// Matches:
// ✓ john.doe@example.com
// ✓ jane_smith123@company.co.uk
// ✓ user+tag@domain.org

// Doesn't match:
// ✗ @username (no local part)
// ✗ email@domain (no TLD)
// ✗ spaces in@email.com (invalid format)
```

#### Phone Number Detection

```javascript
const phonePattern = /(\+\d{1,3}[-.]?)?\(?\d{3}\)?[-.]?\d{3}[-.]?\d{4}/g;

// Matches:
// ✓ (555) 123-4567
// ✓ 555-123-4567
// ✓ +1-555-123-4567
// ✓ 5551234567

// Flexible with separators: -, ., space, none
```

#### Social Security Number (SSN)

```javascript
const ssnPattern = /\b\d{3}-\d{2}-\d{4}\b/g;

// Matches:
// ✓ 123-45-6789

// Strict format to avoid false positives
```

#### Credit Card Numbers

```javascript
const creditCardPattern = /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g;

// Matches:
// ✓ 1234 5678 9012 3456
// ✓ 1234-5678-9012-3456
// ✓ 1234567890123456
```

### Pattern Detection Process

```javascript
function detectPatterns(text) {
  const entities = [];

  // 1. Email detection
  let match;
  while ((match = emailPattern.exec(text)) !== null) {
    entities.push({
      type: 'EMAIL',
      text: match[0],
      start: match.index,
      end: match.index + match[0].length,
      source: 'pattern',
      confidence: 1.0  // Regex is deterministic
    });
  }

  // 2. Phone detection
  // 3. SSN detection
  // 4. Credit card detection
  // ... (same pattern for each type)

  return entities;
}
```

---

## Entity Merging Strategy

### Why Merge ML + Pattern Results?

**ML Model strengths**:
- Great at names (John Smith, Maria Garcia)
- Good at organizations (Microsoft, Red Cross)
- Good at locations (New York, Paris)

**ML Model weaknesses**:
- Sometimes misses emails
- Inconsistent with phone numbers
- Can't detect SSNs or credit cards

**Pattern strengths**:
- 100% accurate for structured formats (emails, phones)
- Fast (no neural network needed)
- Deterministic

**Pattern weaknesses**:
- Can't detect names
- Can't detect unstructured PII

**Solution**: Use both and merge!

### Merge Algorithm

```javascript
function mergeEntities(mlEntities, patternEntities) {
  // Step 1: Combine both lists
  const allEntities = [...mlEntities, ...patternEntities];

  // Step 2: Sort by position
  allEntities.sort((a, b) => a.start - b.start);

  // Step 3: Remove overlaps (prefer pattern over ML)
  const merged = [];
  for (const entity of allEntities) {
    const overlaps = merged.some(existing =>
      entity.start < existing.end && entity.end > existing.start
    );

    if (!overlaps) {
      merged.push(entity);
    } else if (entity.source === 'pattern') {
      // Pattern detection is more reliable, replace ML
      merged = merged.filter(e => !overlaps(e, entity));
      merged.push(entity);
    }
  }

  return merged;
}
```

### Example Merge

**Input text**: "Contact John Smith at john@email.com or 555-1234"

**ML Results**:
```javascript
[
  {text: "John Smith", type: "PERSON", start: 8, end: 18, source: "ml_model"},
  {text: "john@email.com", type: "MISC", start: 22, end: 36, source: "ml_model"}
]
```

**Pattern Results**:
```javascript
[
  {text: "john@email.com", type: "EMAIL", start: 22, end: 36, source: "pattern"},
  {text: "555-1234", type: "PHONE", start: 40, end: 48, source: "pattern"}
]
```

**Merged Results**:
```javascript
[
  {text: "John Smith",     type: "PERSON", start: 8,  end: 18, source: "ml_model"},
  {text: "john@email.com", type: "EMAIL",  start: 22, end: 36, source: "pattern"},  // Preferred over ML
  {text: "555-1234",       type: "PHONE",  start: 40, end: 48, source: "pattern"}
]
```

---

## Privacy & GDPR Compliance

### How We Achieve Zero Data Transmission

#### 1. File Upload (FileReader API)

```javascript
// Traditional upload (NOT what we do):
form.submit()  →  Server receives file  ✗

// Our approach:
FileReader.readAsText(file)  →  Stays in browser  ✓
```

**Key point**: FileReader is a browser API that reads files locally. The file never leaves the device.

#### 2. ML Inference (WebAssembly)

```javascript
// Traditional approach (NOT what we do):
fetch('/api/detect', {body: text})  →  Server processes  ✗

// Our approach:
TransformersJS.pipeline(text)  →  Runs in browser via WASM  ✓
```

**How it works**:
- BERT model compiled to WebAssembly
- Runs in browser's JavaScript engine
- Uses CPU/GPU through WebAssembly runtime
- **No network calls for inference**

#### 3. File Download (Blob API)

```javascript
// Traditional approach (NOT what we do):
fetch('/download')  →  Server generates file  ✗

// Our approach:
new Blob([text])  →  Creates file in browser  ✓
URL.createObjectURL(blob)  →  Temporary download link  ✓
```

### Network Calls Breakdown

**What gets sent to network**:
1. Initial page load: `GET /` → receives HTML
2. JavaScript files: `GET /static/js/app.js`, etc.
3. ML model (first time only): Download from HuggingFace CDN
4. Health check (optional): `GET /health`

**What NEVER gets sent**:
- ✗ User's uploaded file
- ✗ File content
- ✗ Detected entities
- ✗ Redacted text
- ✗ Any user data whatsoever

### GDPR Compliance Checklist

- ✅ **Data minimization**: We collect zero data
- ✅ **Purpose limitation**: N/A (no data collection)
- ✅ **Storage limitation**: N/A (no storage)
- ✅ **Right to erasure**: Automatic (data never stored)
- ✅ **Data portability**: User downloads their own file
- ✅ **Security**: No transmission = no interception risk
- ✅ **Transparency**: Open source, auditable code

---

## Performance Considerations

### ML Model Loading

**First visit**:
```
Load page (200ms)
  ↓
Load Transformers.js from CDN (500ms)
  ↓
Download BERT model (~100MB) (5-10 seconds)
  ↓
Cache in IndexedDB
  ↓
Ready to use
```

**Subsequent visits**:
```
Load page (200ms)
  ↓
Load Transformers.js from cache (50ms)
  ↓
Load model from IndexedDB (1-2 seconds)
  ↓
Ready to use
```

### Detection Performance

**For a typical document (1000 words)**:

```
ML Detection:    2-5 seconds   (neural network inference)
Pattern Detection: 5-50ms      (regex matching)
Merging:          <1ms         (simple array operations)
Total:           ~2-5 seconds
```

**Factors affecting speed**:
- CPU speed (faster CPU = faster inference)
- Document length (longer = more tokens = slower)
- Number of entities (doesn't significantly impact speed)

### Memory Usage

```
ML Model in memory:     ~200MB (loaded once, reused)
Document text:          ~1KB per 1000 chars
Entities array:         ~1KB for 100 entities
Total for typical use:  ~201MB
```

**Note**: Model stays loaded in memory for the session, enabling fast repeated use.

### Optimizations Used

1. **Quantized model**: Uses INT8 instead of FP32 (smaller, faster)
2. **WebAssembly**: Near-native performance in browser
3. **IndexedDB caching**: Model persists between sessions
4. **Lazy loading**: Model only loads when needed
5. **Pattern detection first**: Fast fallback while ML loads

---

## Summary: The Complete Picture

### What Makes This Special

1. **Privacy-First Architecture**
   - All processing in browser
   - Zero data transmission
   - GDPR compliant by design

2. **Hybrid Detection System**
   - ML for unstructured PII (names, orgs)
   - Patterns for structured PII (emails, phones)
   - Best of both worlds

3. **Modern Web Technologies**
   - Transformers.js brings ML to browser
   - WebAssembly for performance
   - FileReader/Blob for file handling

4. **Simple Deployment**
   - Just Flask serving static files
   - No database needed
   - No complex infrastructure

### The Magic Ingredients

- **Transformers.js**: Brings 110M parameter BERT model to browser
- **WebAssembly**: Runs neural networks at near-native speed
- **FileReader API**: Reads files without uploading
- **Blob API**: Creates files without server
- **Flask**: Minimal server, maximum simplicity

---

## Further Reading

- [Transformers.js Documentation](https://huggingface.co/docs/transformers.js)
- [BERT: Pre-training of Deep Bidirectional Transformers](https://arxiv.org/abs/1810.04805)
- [Named Entity Recognition (NER) Overview](https://en.wikipedia.org/wiki/Named-entity_recognition)
- [FileReader API](https://developer.mozilla.org/en-US/docs/Web/API/FileReader)
- [WebAssembly](https://webassembly.org/)
- [GDPR Overview](https://gdpr.eu/)

---

**You now understand every single piece of how Redactor works!** 🎉
