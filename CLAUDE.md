# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A browser-only PII (Personally Identifiable Information) redaction tool. Uses BERT-based NER models via Transformers.js for client-side inference. **GDPR compliant by design** - no user data ever leaves the browser.

## Commands

### Setup & Run
```bash
# Install dependencies
pip install -r requirements.txt

# Run application (serves on http://localhost:8080)
python3 app.py
```

No model preparation needed - Transformers.js loads the model from CDN automatically.

## Architecture

### GDPR Compliance
- Flask serves static files only (no data processing)
- ML model runs entirely in browser via Transformers.js
- File reading via FileReader API (browser)
- Download via Blob URL (browser)
- **Zero network calls** for user data (after initial model load from CDN)

### Application Flow
```
User uploads .txt file
       ↓
Browser reads file (FileReader API)
       ↓
ML model detects PII (Transformers.js in-browser)
       ↓
Regex patterns detect structured PII (emails, phones, etc.)
       ↓
User reviews entities (click to toggle redact/keep)
       ↓
User downloads redacted file
```

### Key Files
- `app.py` - Minimal Flask server (serves static files only)
- `static/js/app.js` - Main application logic, UI state management
- `static/js/file-handler.js` - FileReader/Blob download utilities
- `static/js/ml-pii-detector.js` - Transformers.js ML wrapper + regex patterns
- `templates/index.html` - Single-page UI with three states (Upload, Review, Download)

### Supported Entity Types
- PERSON - Names
- ORGANIZATION - Company/org names
- LOCATION - Places
- MISC - Other entities

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/` | GET | Main UI |
| `/health` | GET | Health check |

All other functionality is client-side JavaScript.

## Browser Console Testing
```javascript
// Check ML model status
App.mlDetector.modelLoaded

// Test detection manually
App.mlDetector.detectPII("John Smith works at Microsoft").then(console.log)
```
