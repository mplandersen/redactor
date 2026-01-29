# Redactor

A privacy-first PII (Personally Identifiable Information) redaction tool that runs entirely in your browser. No data ever leaves your device.

## Features

- **100% Client-Side Processing** - All PII detection and redaction happens in your browser using Transformers.js
- **GDPR Compliant by Design** - Zero network calls for user data
- **ML-Powered Detection** - Uses BERT-based NER model for accurate entity recognition
- **Hybrid Detection** - Combines ML model with regex patterns for comprehensive coverage
- **Interactive Review** - Click detected entities to toggle redact/keep
- **Multiple Entity Types** - Detects PERSON, ORGANIZATION, LOCATION, and MISC entities
- **Simple Workflow** - Upload .txt file → Review entities → Download redacted version

## Quick Start

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Run the Application

```bash
python3 app.py
```

Navigate to `http://localhost:8080`

That's it! The ML model loads automatically from CDN on first use and is cached by your browser.

## How It Works

```
User uploads .txt file
       ↓
Browser reads file (FileReader API)
       ↓
ML model detects PII (Transformers.js in-browser)
       ↓
Regex patterns detect structured PII (emails, phones, etc.)
       ↓
User reviews detected entities (click to toggle)
       ↓
User downloads redacted file (Blob URL)
```

**Zero data transmission** - Flask only serves static files. All processing happens client-side.

## Project Structure

```
redactor/
├── app.py                           # Minimal Flask server (static files only)
├── requirements.txt                 # Runtime dependencies
├── CLAUDE.md                        # Developer instructions
├── templates/
│   └── index.html                   # Single-page UI with inline styles
└── static/
    └── js/
        ├── app.js                   # Main application logic
        ├── file-handler.js          # File I/O utilities (FileReader/Blob)
        └── ml-pii-detector.js       # Transformers.js ML wrapper
```

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/` | GET | Main UI |
| `/health` | GET | Health check |

All PII detection and redaction is handled client-side in JavaScript.

## Supported Entity Types

- **PERSON** - Names of individuals
- **ORGANIZATION** - Company and organization names
- **LOCATION** - Geographic locations
- **MISC** - Other named entities

## Technical Stack

- **Backend**: Flask (static file server only)
- **ML Framework**: [Transformers.js](https://huggingface.co/docs/transformers.js) by Hugging Face
- **ML Model**: `Xenova/bert-base-NER` (BERT-based Named Entity Recognition)
- **Model Size**: ~100MB (cached by browser after first load)
- **Pattern Detection**: Regex for emails, phones, SSNs, credit cards
- **Expected Performance**: 95-96% F1 score on NER tasks

## Browser Console Testing

```javascript
// Check if ML model is loaded
App.mlDetector.modelLoaded

// Test detection manually
App.mlDetector.detectPII("John Smith works at Microsoft in Seattle")
  .then(entities => console.log(entities))
```

## Privacy & Security

- **No Server-Side Processing** - Flask serves static files only
- **No Data Transmission** - Files never leave your browser
- **Local ML Inference** - Transformers.js runs entirely client-side
- **No Analytics** - Zero tracking or data collection
- **Model Caching** - ML model cached locally by browser after first download

## Development

The application runs on port 8080 by default. To change the port or enable debug mode:

```python
# In app.py
if __name__ == '__main__':
    app.run(
        host='0.0.0.0',
        port=8080,  # Change this
        debug=True  # Enable for development
    )
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see LICENSE file for details

---

**Privacy-first PII redaction, powered by browser-based ML**
