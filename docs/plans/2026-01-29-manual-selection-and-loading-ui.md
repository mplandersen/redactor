# Manual Selection & Loading UI Design

**Date:** 2026-01-29
**Status:** Approved
**Branch:** feature/manual-selection-and-loading-ui

## Overview

Add two UX improvements to the PII redactor:
1. **Loading UI** - Visual feedback while ML detection runs
2. **Manual Selection** - Allow users to mark text for redaction that ML missed

## Problem Statement

**Current issues:**
- No visual feedback between file upload and review state (appears frozen during ML detection)
- ML model isn't perfect - users have no way to mark missed PII
- Users expect to manually add entities they spot during review

**User need:**
- "I want to see progress while my file is being analyzed"
- "I want to select text the ML missed and mark it for redaction"

## Solution Design

### 1. Loading UI

**Where:** Between UPLOAD and REVIEW states (while ML detection runs)

**Visual Design:**
```
┌─────────────────────────────────────┐
│   [Semi-transparent overlay]        │
│                                     │
│   ┌───────────────────┐            │
│   │   [Spinner]       │            │
│   │                   │            │
│   │ Analyzing         │            │
│   │ document...       │            │
│   │                   │            │
│   │ Running ML        │            │
│   │ detection...      │            │
│   │                   │            │
│   │ document.txt      │            │
│   └───────────────────┘            │
│                                     │
└─────────────────────────────────────┘
```

**State Flow:**
```
UPLOAD → [file selected] → LOADING → [detection complete] → REVIEW
```

**Progress Messages:**
1. "Reading file..." (immediate)
2. "Running ML detection..." (after file read)
3. "Detecting patterns..." (during pattern detection)
4. "Processing results..." (during merge)

**Components:**
- Full-screen overlay (semi-transparent black)
- Centered white card
- CSS-animated spinner (no images)
- Dynamic message text
- Filename display
- Prevents user interaction while processing

---

### 2. Manual Selection Feature

**Location:** REVIEW state (alongside auto-detected entities)

**User Interaction Flow:**

```
1. User selects text with mouse (native browser selection)
   ↓
2. Popup button appears: "Mark for Redaction"
   ↓
3. User clicks button
   ↓
4. Text added to entities list (highlighted, clickable)
   ↓
5. User can toggle/remove like any auto-detected entity
```

**Visual Design:**

```
Document text with highlighted entities:

The report was written by [John Smith] and...  ← Auto-detected (blue)
                           ^^^^^^^^^^^
                         [Mark for Redaction]  ← Popup appears

After clicking:

The report was written by [John Smith] and...  ← Now highlighted (amber)
                           ^^^^^^^^^^^
                             Manual 📝
```

**Entity Visual Distinction:**
- **Auto-detected:** Blue (PERSON), Purple (ORG), Green (LOC), Orange (MISC)
- **Manual:** Amber/Yellow background with 📝 badge
- Both can be toggled redact/keep the same way

**Interaction Details:**

| Scenario | Behavior |
|----------|----------|
| Valid selection | Popup appears near selection end |
| Empty/whitespace selection | No popup |
| Overlapping existing entity | Show warning or prevent |
| Click away from popup | Popup disappears |
| Multi-line selection | Allowed (some PII spans lines) |

---

## Technical Implementation

### State Management

**New state:**
```javascript
App.state // Add 'LOADING' state
// States: 'UPLOAD' | 'LOADING' | 'REVIEW' | 'DOWNLOAD'
```

**No new entity tracking needed:**
- Manual entities stored in same `App.entities` array
- Distinguished by `type: 'MANUAL'` and `source: 'manual'`

### Data Structures

**Manual Entity Object:**
```javascript
{
  text: "selected text",
  start: 145,              // Character position in original text
  end: 158,
  type: "MANUAL",          // Distinguishes from auto-detected
  confidence: 1.0,         // Always 1.0 for manual
  source: "manual",        // vs "ml_model" or "pattern"
  index: 12                // Position in entities array
}
```

### New Functions

**Loading UI:**
```javascript
App.updateLoadingMessage(message)
  - Updates loading screen text
  - Called during detection phases

App.setState('LOADING')
  - Shows loading overlay
  - Hides other states
```

**Manual Selection:**
```javascript
App.setupTextSelection()
  - Called when entering REVIEW state
  - Adds mouseup listener
  - Checks for valid text selection
  - Shows popup if valid

App.showSelectionPopup(rect)
  - Positions popup near selection
  - Handles screen boundary edges
  - Shows "Mark for Redaction" button

App.addManualEntity()
  - Gets selected text and range
  - Calculates start/end positions in original text
  - Creates entity object
  - Adds to entities array
  - Re-renders review UI
  - Clears selection and hides popup

App.hideSelectionPopup()
  - Hides popup (on click-away or after adding)

App.checkEntityOverlap(start, end)
  - Returns true if selection overlaps existing entity
  - Used to prevent duplicate/overlapping entities
```

### Modified Functions

**`App.handleFile()`:**
```javascript
async handleFile(file) {
  this.originalFilename = file.name;

  // NEW: Set loading state
  this.setState('LOADING');
  this.updateLoadingMessage('Reading file...');

  this.originalText = await this.fileHandler.readFile(file);

  // NEW: Update message
  this.updateLoadingMessage('Running ML detection...');

  const result = await this.mlDetector.detectPII(this.originalText);

  // NEW: Update message
  this.updateLoadingMessage('Processing results...');

  this.entities = result.entities || [];
  this.redactFlags = this.entities.map(() => true);

  // Transition to review
  this.setState('REVIEW');
}
```

**`App.setState(newState)`:**
```javascript
setState(newState) {
  this.state = newState;

  // Show/hide sections based on state
  document.getElementById('upload-section').classList.toggle('hidden', newState !== 'UPLOAD');
  document.getElementById('loading-overlay').classList.toggle('hidden', newState !== 'LOADING');  // NEW
  document.getElementById('review-section').classList.toggle('hidden', newState !== 'REVIEW');
  document.getElementById('download-section').classList.toggle('hidden', newState !== 'DOWNLOAD');

  // NEW: Setup text selection in REVIEW state
  if (newState === 'REVIEW') {
    this.renderReview(this.originalText, this.entities);
    this.setupTextSelection();  // NEW
  }

  // NEW: Clean up text selection when leaving REVIEW
  if (this.state !== 'REVIEW') {
    this.cleanupTextSelection();
  }
}
```

### Event Listeners

```javascript
// In setupTextSelection()
document.getElementById('document-content').addEventListener('mouseup', (e) => {
  const selection = window.getSelection();
  const text = selection.toString().trim();

  if (text.length > 0) {
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    App.showSelectionPopup(rect);
  }
});

// Hide popup on click-away
document.addEventListener('mousedown', (e) => {
  if (!e.target.closest('#selection-popup')) {
    App.hideSelectionPopup();
  }
});
```

---

## HTML Structure

### Loading Overlay

```html
<!-- Add after upload-section -->
<div id="loading-overlay" class="loading-overlay hidden">
  <div class="loading-card">
    <div class="spinner"></div>
    <h3>Analyzing document...</h3>
    <p id="loading-message" class="loading-message">Reading file...</p>
    <p id="loading-filename" class="loading-filename"></p>
  </div>
</div>
```

### Selection Popup

```html
<!-- Add at end of body, before scripts -->
<div id="selection-popup" class="selection-popup hidden">
  <button onclick="App.addManualEntity()">
    🔒 Mark for Redaction
  </button>
</div>
```

---

## CSS Styles

### Loading UI

```css
.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.loading-overlay.hidden {
  display: none;
}

.loading-card {
  background: white;
  padding: 2rem;
  border-radius: 12px;
  text-align: center;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
  min-width: 300px;
}

.loading-card h3 {
  font-size: 1.25rem;
  margin-bottom: 0.5rem;
  color: #1a1a1a;
}

.loading-message {
  color: #6b7280;
  margin-bottom: 0.5rem;
}

.loading-filename {
  color: #3b82f6;
  font-weight: 500;
  font-size: 0.9rem;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #e5e7eb;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 1rem;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
```

### Selection Popup

```css
.selection-popup {
  position: absolute;
  background: white;
  border: 2px solid #3b82f6;
  border-radius: 8px;
  padding: 0.5rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 100;
  pointer-events: all;
}

.selection-popup.hidden {
  display: none;
}

.selection-popup button {
  background: #3b82f6;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 500;
  white-space: nowrap;
  transition: background 0.2s;
}

.selection-popup button:hover {
  background: #2563eb;
}

.selection-popup button:active {
  background: #1d4ed8;
}
```

### Manual Entity Styling

```css
/* Manual entity - amber/yellow theme */
.pii-entity[data-type="MANUAL"] {
  background: #fef3c7 !important;
  color: #92400e !important;
  border: 2px solid #f59e0b;
}

/* Add badge to manual entities */
.pii-entity[data-type="MANUAL"]::after {
  content: " 📝";
  font-size: 0.7em;
  opacity: 0.8;
}

/* Update legend */
.legend-color.manual {
  background: #fef3c7;
  border: 1px solid #f59e0b;
}
```

---

## Implementation Plan

### Phase 1: Loading UI (30 minutes)

**Steps:**
1. Add loading overlay HTML to `index.html`
2. Add loading CSS styles
3. Add `updateLoadingMessage()` function to `app.js`
4. Modify `setState()` to handle `LOADING` state
5. Update `handleFile()` to:
   - Set state to LOADING immediately
   - Update messages at each step
   - Transition to REVIEW when done
6. Test with various file sizes

**Success Criteria:**
- ✅ Loading screen appears immediately after file selection
- ✅ Messages update during detection process
- ✅ Filename displays correctly
- ✅ Spinner animates smoothly
- ✅ Transitions to review state when complete

---

### Phase 2: Manual Selection (1-2 hours)

**Steps:**
1. Add selection popup HTML to `index.html`
2. Add selection popup CSS
3. Add manual entity CSS styling
4. Implement `setupTextSelection()`:
   - Add mouseup event listener
   - Get selection from `window.getSelection()`
   - Validate selection (not empty, not whitespace)
5. Implement `showSelectionPopup()`:
   - Calculate popup position from selection rect
   - Handle screen edge cases
   - Show popup
6. Implement `addManualEntity()`:
   - Get selection text
   - Calculate start/end positions in original text
   - Check for overlaps with existing entities
   - Create entity object with type 'MANUAL'
   - Add to entities array
   - Re-render review
   - Clear selection
   - Hide popup
7. Implement `checkEntityOverlap()`:
   - Check if new selection overlaps existing entity
   - Return true/false
8. Implement `cleanupTextSelection()`:
   - Remove event listeners
   - Hide popup
9. Update legend to include "Manual" entity type
10. Test edge cases:
    - Multi-line selections
    - Overlapping entities
    - Click-away behavior
    - Very long selections

**Success Criteria:**
- ✅ Popup appears on text selection
- ✅ Popup positioned correctly (not off-screen)
- ✅ Manual entity added correctly
- ✅ Manual entity appears with amber styling
- ✅ Manual entity shows 📝 badge
- ✅ Manual entity can be toggled like auto-detected
- ✅ Manual entity gets redacted in final output
- ✅ Overlapping selections prevented or handled
- ✅ Popup disappears on click-away
- ✅ Multi-line selections work
- ✅ Legend shows "Manual" type

---

## Testing Checklist

### Loading UI Tests
- [ ] Loading screen appears immediately after file selection
- [ ] Spinner animates continuously
- [ ] Message updates: "Reading file..."
- [ ] Message updates: "Running ML detection..."
- [ ] Message updates: "Processing results..."
- [ ] Filename displays correctly
- [ ] Screen prevents interaction while loading
- [ ] Transitions to review state when complete
- [ ] Works with small files (<1KB)
- [ ] Works with large files (>100KB)
- [ ] Handles errors gracefully

### Manual Selection Tests
- [ ] Popup appears when selecting text
- [ ] Popup positioned near selection
- [ ] Popup doesn't go off-screen (top/bottom/left/right edges)
- [ ] Clicking "Mark for Redaction" adds entity
- [ ] Manual entity appears with correct styling (amber)
- [ ] Manual entity shows 📝 badge
- [ ] Manual entity can be toggled redact/keep
- [ ] Toggling manual entity updates count
- [ ] Manual entity gets redacted in final output
- [ ] Popup disappears on click-away
- [ ] Popup disappears after adding entity
- [ ] Empty selection doesn't show popup
- [ ] Whitespace selection doesn't show popup
- [ ] Multi-line selection works
- [ ] Very long selection works (>500 chars)
- [ ] Overlapping entity selection prevented/warned
- [ ] Selection within existing entity handled
- [ ] Multiple manual entities can be added
- [ ] Manual entities persist through toggle operations
- [ ] Legend shows "Manual" entity type
- [ ] Browser selection clears after adding entity

### Integration Tests
- [ ] Both features work together without conflicts
- [ ] Manual selection available immediately after loading completes
- [ ] Manual entities included in entity count
- [ ] Manual entities included in redaction statistics
- [ ] Manual entities appear in correct order (by position)
- [ ] Manual and auto entities don't duplicate/overlap
- [ ] Workflow: Upload → Loading → Review → Manual Add → Download works end-to-end

---

## Edge Cases & Handling

| Edge Case | Solution |
|-----------|----------|
| Selection overlaps existing entity | Prevent addition, show subtle message: "Already marked" |
| Selection is only whitespace | Don't show popup |
| Selection spans entire document | Allow it (user might want to redact everything) |
| Popup would go off-screen | Reposition to stay within viewport |
| User selects during loading | Prevent selection in loading state |
| ML detection fails | Loading shows error, returns to upload state |
| Very slow ML detection (>30s) | Loading screen continues showing (no timeout) |
| User adds 100+ manual entities | Works (no limit), but might slow render |

---

## Future Enhancements (Not in Scope)

- Keyboard shortcut for manual selection (Ctrl+R)
- Entity type picker for manual entities (PERSON, ORG, etc.)
- Undo last manual addition
- Edit manual entity text
- Bulk select mode (add multiple in sequence)
- Progress percentage in loading UI
- Cancel detection button
- Save manual selections for future sessions

---

## Success Metrics

**Loading UI:**
- User understands file is being processed (not frozen)
- No confused user behavior during detection
- Professional, polished feel

**Manual Selection:**
- Users can successfully add missed PII
- Interaction feels natural and intuitive
- Manual entities behave identically to auto-detected ones
- 100% of manually added entities get redacted

---

## Design Complete ✅

This design is ready for implementation on branch: `feature/manual-selection-and-loading-ui`
