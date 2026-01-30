# Entity Editing Sidebar Design

**Date:** 2026-01-29
**Status:** Approved
**Branch:** feature/entity-editing-sidebar

## Overview

Add a collapsible sidebar to the REVIEW state that allows users to manage detected entities. Users can edit entity text (e.g., fix "Mad" → "Mads"), delete false positives, bulk toggle all instances of an entity, and manually add entities the ML missed.

## Problem Statement

**Current issues:**
- ML sometimes truncates names ("Mad" instead of "Mads")
- No way to fix entity text once detected
- Can't bulk select/deselect all instances of an entity (must click each one)
- No way to add entities the ML completely missed
- Manual selection feature (click-and-mark) was never implemented

**User needs:**
- "I want to fix 'Mad' to 'Mads' and have all 24 instances update at once"
- "I want to quickly redact/keep all instances of 'Nigel' with one click"
- "I want to delete 'Magic Note' entirely since it's not actually PII"
- "I want to add 'John' manually since the ML missed it"

## Solution Design

### Overall Layout

The REVIEW state gets a collapsible right sidebar that displays all unique entities:

```
┌─────────────────────────────────────────────────┐
│ [Filename] [42 entities] [Download] [☰ Entities]│  ← Header with toggle
├──────────────────────────┬──────────────────────┤
│                          │                      │
│  Document Area           │   Entity Sidebar     │
│  (with highlighted PII)  │   (collapsible)      │
│                          │                      │
│  The report was written  │  📝 Entity Manager   │
│  by [Nigel] and [Mads]   │                      │
│  from [Kent County       │  🔍 [Search box]     │
│  Council]...             │  ➕ Add Entity       │
│                          │                      │
│                          │  📋 14 Entities (A-Z)│
│                          │  ─────────────────── │
│                          │  □ County Council    │
│                          │     ORG • 3 instances│
│                          │     [Edit][Toggle][X]│
│                          │                      │
│                          │  ☑ Kent              │
│                          │     ORG • 4 instances│
│                          │     [Edit][Toggle][X]│
│  (scrollable)            │                      │
│                          │  (scrollable list)   │
└──────────────────────────┴──────────────────────┘
```

**Layout behavior:**
- Sidebar toggles open/close via "☰ Entities" button in header
- When open: sidebar 350px wide, document area flexes to fill remaining space
- When closed: document expands to full width
- Smooth CSS transition on toggle (0.3s)

---

## Entity List Design

### Entity List Item

Each unique entity displayed as a card with controls:

```
┌────────────────────────────────────┐
│ ☑ Nigel                            │  ← Checkbox (redact/keep all)
│   PERSON • 77 instances            │  ← Type badge • Count
│   ┌──────┬──────────┬────┐        │
│   │ Edit │ All On/Off│ ✕  │        │  ← Action buttons
│   └──────┴──────────┴────┘        │
└────────────────────────────────────┘
```

**Checkbox behavior:**
- **Checked (☑)** = All instances will be redacted (shown red in document)
- **Unchecked (☐)** = All instances will be kept (shown gray in document)
- Click checkbox to toggle ALL instances of this entity at once
- Updates `App.redactFlags` for all instances

**Action buttons:**
1. **Edit** - Enter edit mode to change entity text
2. **All On/Off** - Quick toggle (same as clicking checkbox)
3. **✕ Delete** - Remove entity entirely from list

**Visual states:**
- **Redacted**: Checkbox checked, light red background (#fee2e2)
- **Kept**: Checkbox unchecked, neutral gray background (#f3f4f6)
- **Hover**: Lighter background highlight
- **Editing**: Shows inline input field with Save/Cancel buttons

**Sorting:**
- Alphabetical A-Z (case-insensitive)
- Example order: "County Council", "Greenland", "Kent", "Magic Note", "Mads", "Margaret", "Nigel"

---

## Core Features

### 1. Edit Entity

**Use case:** Fix ML mistakes like "Mad" → "Mads"

**UI Flow:**

```
Before edit:
┌────────────────────────────────────┐
│ ☑ Mad                              │
│   PERSON • 24 instances            │
│   [Edit] [All On/Off] [✕]         │
└────────────────────────────────────┘

Click "Edit":
┌────────────────────────────────────┐
│ ☑ [Mad____________] PERSON         │  ← Inline text input
│   24 instances                     │
│   [✓ Save] [✕ Cancel]             │  ← Save/Cancel buttons
└────────────────────────────────────┘

After save:
┌────────────────────────────────────┐
│ ☑ Mads                             │
│   PERSON • 24 instances            │
│   [Edit] [All On/Off] [✕]         │
└────────────────────────────────────┘
```

**Implementation:**
1. Click "Edit" → Entity text becomes editable input field
2. Type new text (e.g., "Mads")
3. Press Enter or click "✓ Save":
   - Update `entity.text` for all instances of this entity in `App.entities`
   - Re-render document to show updated text in highlights
   - Update sidebar to show new text
   - Close edit mode
4. Press Escape or click "✕ Cancel" → Revert to original text, close edit mode

**Validation:**
- Cannot save empty text (disable Save button)
- Trim whitespace from input
- Check for duplicate entity names: if "Mads" already exists, show warning
- Min length: 1 character

**Technical approach:**
- Simple text replacement in existing entity objects
- No re-scanning the document (keeps it fast)
- All instances with the same original text get updated

---

### 2. Delete Entity

**Use case:** Remove false positives like "Magic Note" that aren't actually PII

**UI Flow:**

```
Click ✕ button:
┌────────────────────────────────────┐
│ ⚠️  Delete Entity?                 │
│                                    │
│ Remove "Magic Note" from the list? │
│                                    │
│ • 3 instances will be un-highlighted │
│ • You can add it back later        │
│                                    │
│ [Delete] [Cancel]                  │
└────────────────────────────────────┘
```

**Implementation:**
1. Click ✕ → Show confirmation modal/popup
2. Click "Delete":
   - Remove all instances of this entity from `App.entities` array
   - Remove corresponding entries from `App.redactFlags`
   - Re-render document (those spans no longer highlighted)
   - Remove entity from sidebar list
   - Update entity count
3. Click "Cancel" → Close modal, no changes

**Edge cases:**
- If last entity is deleted, show message: "No entities detected"
- Deletion is permanent (until page reload)

---

### 3. Toggle All Instances

**Use case:** Quickly redact/keep all 77 instances of "Nigel" with one click

**Implementation:**
- Click checkbox or "All On/Off" button
- Updates `App.redactFlags` for ALL indices of this entity
- If currently mixed (some redacted, some kept): sets all to redacted
- Re-renders document to show updated states
- Updates entity item visual state in sidebar

---

### 4. Add Entity

**Use case:** Manually add "John" that the ML completely missed

**UI Flow:**

```
Click "➕ Add Entity":
┌────────────────────────────────────┐
│ ➕ Add New Entity                  │
│                                    │
│ Entity text:                       │
│ [John_________________]            │  ← Text input
│                                    │
│ Entity type:                       │
│ [PERSON ▼]                         │  ← Dropdown
│   └─ PERSON                        │
│      ORGANIZATION                  │
│      LOCATION                      │
│      MISC                          │
│      EMAIL                         │
│      PHONE                         │
│      DATE                          │
│      POSTCODE                      │
│                                    │
│ [✓ Add Entity] [✕ Cancel]         │
└────────────────────────────────────┘

After adding:
┌────────────────────────────────────┐
│ ☑ John                             │  ← New entity in list
│   PERSON • 5 instances             │
│   [Edit] [All On/Off] [✕]         │
└────────────────────────────────────┘
```

**Implementation:**
1. Click "➕ Add Entity" → Show add form above entity list
2. User types entity text (e.g., "John")
3. User selects type from dropdown (default: PERSON)
4. Click "✓ Add Entity":
   - Search entire `App.originalText` for all occurrences of "John" (case-insensitive)
   - For each occurrence found:
     - Create entity object: `{ text, type, start, end, confidence: 1.0, source: 'manual' }`
     - Add to `App.entities` array
     - Add `true` to `App.redactFlags` (default: redact)
   - Highlight all instances in document (red)
   - Add to sidebar list (sorted alphabetically)
   - Close add form
   - Show success message: "Added 'John' - 5 instances found"
5. Click "✕ Cancel" → Close form without adding

**Edge cases:**
- **Not found:** Show message "No instances of 'John' found in document"
- **Duplicate:** Show warning "Entity 'John' already exists"
- **Empty text:** Disable "Add Entity" button
- **Whitespace only:** Trim and validate

**Search algorithm:**
- Case-insensitive `indexOf()` in a loop
- Find ALL occurrences, not just first
- Same approach as `findAllOccurrences()` in ML detector

---

### 5. Search/Filter Entities

**Use case:** Find entities quickly in a long list

**UI:**
```
┌────────────────────────────────────┐
│ 🔍 [Search entities...]            │  ← Search input at top
└────────────────────────────────────┘

Typing "nig" shows only:
  ☑ Nigel (PERSON • 77 instances)

Typing "org" shows only:
  □ County Council (ORGANIZATION • 3)
  □ Kent (ORGANIZATION • 4)
  □ Magic Note (ORGANIZATION • 3)
```

**Implementation:**
- Real-time filter as user types
- Search matches:
  - Entity text (case-insensitive)
  - Entity type (case-insensitive)
- Show filtered count: "Showing 3 of 14 entities"
- Empty search → show all entities

---

## Data Structures

### Unique Entity View

Since `App.entities` contains multiple instances of the same entity text, we need to group them for the sidebar:

```javascript
// Raw entities (current structure):
App.entities = [
  { text: "Nigel", type: "PERSON", start: 0, end: 5, ... },   // index 0
  { text: "Mad", type: "PERSON", start: 20, end: 23, ... },   // index 1
  { text: "Nigel", type: "PERSON", start: 50, end: 55, ... }, // index 2
  // ... 77 total "Nigel" instances
]

// Unique entity view (for sidebar):
{
  text: "Nigel",
  type: "PERSON",
  count: 77,
  indices: [0, 2, 7, 9, ...],  // Indices in App.entities array
  allRedacted: true,  // Are all instances marked for redaction?
  someRedacted: false // Are some (but not all) redacted?
}
```

**Function to generate:**
```javascript
App.getUniqueEntities() {
  const uniqueMap = new Map();

  this.entities.forEach((entity, index) => {
    const key = entity.text.toLowerCase();
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, {
        text: entity.text,
        type: entity.type,
        count: 0,
        indices: [],
        allRedacted: true,
        someRedacted: false
      });
    }

    const unique = uniqueMap.get(key);
    unique.count++;
    unique.indices.push(index);

    // Track redaction state
    if (!this.redactFlags[index]) {
      unique.allRedacted = false;
    }
    if (this.redactFlags[index]) {
      unique.someRedacted = true;
    }
  });

  // Convert to array and sort alphabetically
  return Array.from(uniqueMap.values())
    .sort((a, b) => a.text.localeCompare(b.text));
}
```

---

## State Management

**New state variables:**
```javascript
App.sidebarOpen = true;  // Sidebar visibility (default: open)
App.searchQuery = '';    // Entity filter text
App.editingEntityText = null;  // Which entity text is being edited (null = none, "new" = adding)
App.editingOriginalText = '';  // Original text before editing (for cancel)
```

**New functions:**

```javascript
// Sidebar management
App.toggleSidebar()
  - Toggle App.sidebarOpen
  - Add/remove 'hidden' class from sidebar
  - Adjust document area width

App.filterEntities(query)
  - Update App.searchQuery
  - Re-render entity list with filtered results

// Entity operations
App.editEntity(entityText)
  - Set App.editingEntityText = entityText
  - Store original text in App.editingOriginalText
  - Re-render entity item in edit mode

App.saveEntityEdit(oldText, newText)
  - Validate newText (not empty, not duplicate, trimmed)
  - Update all entities with text === oldText:
    - entity.text = newText
  - Re-render document
  - Re-render sidebar
  - Clear App.editingEntityText

App.cancelEntityEdit()
  - Clear App.editingEntityText
  - Re-render entity item (back to normal mode)

App.deleteEntity(entityText)
  - Show confirmation modal
  - If confirmed:
    - Filter out all entities where entity.text === entityText
    - Remove corresponding redactFlags
    - Re-render document
    - Re-render sidebar

App.toggleAllInstances(entityText)
  - Find all indices where entity.text === entityText
  - Get current redaction state (all redacted, all kept, or mixed)
  - If mixed or all kept: set all to redacted (true)
  - If all redacted: set all to kept (false)
  - Update App.redactFlags for all indices
  - Re-render document
  - Re-render sidebar entity item

App.addNewEntity(text, type)
  - Validate text (not empty, not duplicate)
  - Search App.originalText for all occurrences (case-insensitive)
  - If found:
    - Create entity objects for each occurrence
    - Add to App.entities
    - Add to App.redactFlags (default: true)
    - Re-render document
    - Re-render sidebar
    - Show success message
  - If not found:
    - Show error: "No instances found"

App.getUniqueEntities()
  - Group entities by text (case-insensitive)
  - Return array of unique entities with counts and indices
  - Sort alphabetically

App.renderSidebar()
  - Get unique entities
  - Filter by searchQuery if present
  - Render each entity item
  - Update entity count display
```

---

## HTML Structure

**Added to REVIEW state:**

```html
<!-- REVIEW STATE -->
<div id="review-state" class="hidden">
    <div class="review-header">
        <div class="file-info">
            <span class="filename" id="review-filename">document.txt</span>
            <span class="entity-count" id="entity-count">0 entities found</span>
        </div>
        <div class="review-actions">
            <button class="btn btn-secondary" id="toggle-sidebar-btn">
                ☰ Entities
            </button>
            <button class="btn btn-primary" id="proceed-download-btn">Download</button>
        </div>
    </div>

    <div class="review-content">
        <!-- Document area (left) -->
        <div id="document-content" class="document-area" role="document">
            <!-- Document text with PII spans inserted here -->
        </div>

        <!-- Entity sidebar (right) -->
        <div id="entity-sidebar" class="entity-sidebar">
            <!-- Sidebar header -->
            <div class="sidebar-header">
                <h3>📝 Entity Manager</h3>

                <!-- Search box -->
                <input type="text"
                       id="entity-search"
                       class="entity-search"
                       placeholder="🔍 Search entities..."
                       aria-label="Search entities">

                <!-- Add entity button -->
                <button id="add-entity-btn" class="btn btn-primary btn-block">
                    ➕ Add Entity
                </button>
            </div>

            <!-- Add entity form (hidden by default) -->
            <div id="add-entity-form" class="add-entity-form hidden">
                <h4>➕ Add New Entity</h4>

                <label for="new-entity-text">Entity text:</label>
                <input type="text"
                       id="new-entity-text"
                       class="form-input"
                       placeholder="e.g., John"
                       aria-label="Entity text">

                <label for="new-entity-type">Entity type:</label>
                <select id="new-entity-type"
                        class="form-select"
                        aria-label="Entity type">
                    <option value="PERSON">PERSON</option>
                    <option value="ORGANIZATION">ORGANIZATION</option>
                    <option value="LOCATION">LOCATION</option>
                    <option value="MISC">MISC</option>
                    <option value="EMAIL">EMAIL</option>
                    <option value="PHONE">PHONE</option>
                    <option value="DATE">DATE</option>
                    <option value="POSTCODE">POSTCODE</option>
                </select>

                <div class="form-actions">
                    <button id="save-new-entity-btn" class="btn btn-primary">
                        ✓ Add Entity
                    </button>
                    <button id="cancel-new-entity-btn" class="btn btn-secondary">
                        ✕ Cancel
                    </button>
                </div>

                <div id="add-entity-message" class="form-message hidden"></div>
            </div>

            <!-- Entity list header -->
            <div class="entity-list-header">
                <span id="entity-list-count">0 Entities</span>
            </div>

            <!-- Entity list -->
            <div id="entity-list" class="entity-list">
                <!-- Entity items rendered here dynamically -->
            </div>
        </div>
    </div>
</div>
```

**Entity item template (rendered dynamically):**

```html
<div class="entity-item" data-entity-text="Nigel">
    <!-- Normal mode -->
    <div class="entity-item-normal">
        <div class="entity-header">
            <input type="checkbox"
                   class="entity-checkbox"
                   checked
                   aria-label="Toggle all instances of Nigel">
            <span class="entity-text">Nigel</span>
        </div>
        <div class="entity-meta">
            <span class="entity-type-badge">PERSON</span>
            <span class="entity-count">77 instances</span>
        </div>
        <div class="entity-actions">
            <button class="btn-edit">Edit</button>
            <button class="btn-toggle-all">All On/Off</button>
            <button class="btn-delete">✕</button>
        </div>
    </div>

    <!-- Edit mode (shown when editing) -->
    <div class="entity-item-edit hidden">
        <div class="entity-header">
            <input type="checkbox" checked disabled>
            <input type="text"
                   class="entity-text-input"
                   value="Nigel"
                   aria-label="Edit entity text">
            <span class="entity-type-badge">PERSON</span>
        </div>
        <div class="entity-meta">
            <span class="entity-count">77 instances</span>
        </div>
        <div class="entity-actions">
            <button class="btn-save">✓ Save</button>
            <button class="btn-cancel">✕ Cancel</button>
        </div>
    </div>
</div>
```

---

## CSS Styling

```css
/* Review content layout */
.review-content {
    display: flex;
    gap: 1rem;
    margin-top: 1rem;
}

/* Document area - flexible width */
.document-area {
    flex: 1;
    background: #fff;
    padding: 1.5rem;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    white-space: pre-wrap;
    word-wrap: break-word;
    line-height: 1.8;
    min-height: 400px;
    transition: margin-right 0.3s ease;
}

/* Entity sidebar */
.entity-sidebar {
    width: 350px;
    background: #fff;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    display: flex;
    flex-direction: column;
    max-height: calc(100vh - 250px);
    transition: all 0.3s ease;
}

.entity-sidebar.hidden {
    display: none;
}

/* Sidebar header */
.sidebar-header {
    padding: 1rem;
    border-bottom: 1px solid #e5e7eb;
}

.sidebar-header h3 {
    margin: 0 0 1rem 0;
    font-size: 1.1rem;
    color: #1a1a1a;
}

/* Entity search */
.entity-search {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 0.9rem;
    margin-bottom: 0.75rem;
}

.entity-search:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

/* Add entity form */
.add-entity-form {
    padding: 1rem;
    border-bottom: 1px solid #e5e7eb;
    background: #f9fafb;
}

.add-entity-form h4 {
    margin: 0 0 0.75rem 0;
    font-size: 1rem;
    color: #1a1a1a;
}

.add-entity-form label {
    display: block;
    margin-bottom: 0.25rem;
    font-size: 0.85rem;
    font-weight: 500;
    color: #4b5563;
}

.add-entity-form .form-input,
.add-entity-form .form-select {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 0.9rem;
    margin-bottom: 0.75rem;
}

.add-entity-form .form-actions {
    display: flex;
    gap: 0.5rem;
}

.add-entity-form .form-actions button {
    flex: 1;
}

.form-message {
    margin-top: 0.5rem;
    padding: 0.5rem;
    border-radius: 4px;
    font-size: 0.85rem;
}

.form-message.success {
    background: #d1fae5;
    color: #065f46;
}

.form-message.error {
    background: #fee2e2;
    color: #991b1b;
}

/* Entity list header */
.entity-list-header {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid #e5e7eb;
    background: #f9fafb;
    font-size: 0.85rem;
    font-weight: 500;
    color: #6b7280;
}

/* Entity list */
.entity-list {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
}

/* Entity item */
.entity-item {
    padding: 0.75rem;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    margin-bottom: 0.5rem;
    transition: background 0.2s, border-color 0.2s;
}

.entity-item:hover {
    background: #f9fafb;
}

/* Entity item states */
.entity-item.redacted {
    background: #fee2e2;
    border-color: #fca5a5;
}

.entity-item.kept {
    background: #f3f4f6;
    border-color: #d1d5db;
}

/* Entity header */
.entity-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
}

.entity-checkbox {
    width: 18px;
    height: 18px;
    cursor: pointer;
}

.entity-text {
    font-weight: 600;
    color: #1a1a1a;
    font-size: 1rem;
    flex: 1;
}

.entity-text-input {
    flex: 1;
    padding: 0.25rem 0.5rem;
    border: 1px solid #3b82f6;
    border-radius: 4px;
    font-size: 1rem;
    font-weight: 600;
}

.entity-text-input:focus {
    outline: none;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

/* Entity meta */
.entity-meta {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
    font-size: 0.85rem;
}

.entity-type-badge {
    padding: 0.15rem 0.5rem;
    background: #e0e7ff;
    color: #3730a3;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 500;
    text-transform: uppercase;
}

.entity-count {
    color: #6b7280;
}

/* Entity actions */
.entity-actions {
    display: flex;
    gap: 0.5rem;
}

.entity-actions button {
    flex: 1;
    padding: 0.35rem 0.5rem;
    font-size: 0.85rem;
    border: 1px solid #d1d5db;
    background: #fff;
    color: #374151;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
}

.entity-actions button:hover {
    background: #f3f4f6;
    border-color: #9ca3af;
}

.entity-actions .btn-edit:hover {
    background: #dbeafe;
    border-color: #3b82f6;
    color: #1e40af;
}

.entity-actions .btn-delete:hover {
    background: #fee2e2;
    border-color: #dc2626;
    color: #991b1b;
}

.entity-actions .btn-save {
    background: #3b82f6;
    color: #fff;
    border-color: #3b82f6;
}

.entity-actions .btn-save:hover {
    background: #2563eb;
    border-color: #2563eb;
}

/* Responsive */
@media (max-width: 768px) {
    .review-content {
        flex-direction: column;
    }

    .entity-sidebar {
        width: 100%;
        max-height: 400px;
    }

    .entity-sidebar.hidden {
        display: none;
    }
}
```

---

## Implementation Plan

### Phase 1: Sidebar Structure (30-45 min)
1. Add sidebar HTML to `templates/index.html`
2. Add sidebar CSS styles
3. Implement `App.toggleSidebar()` function
4. Wire up toggle button in header
5. Test sidebar show/hide

### Phase 2: Display Unique Entities (45-60 min)
1. Implement `App.getUniqueEntities()` function
2. Implement `App.renderSidebar()` function
3. Render entity list items (read-only first)
4. Show entity counts, types, checkboxes
5. Test with existing detected entities

### Phase 3: Toggle All Functionality (30 min)
1. Implement `App.toggleAllInstances(entityText)`
2. Wire up checkbox click handlers
3. Wire up "All On/Off" button
4. Update document highlights on toggle
5. Test bulk toggle behavior

### Phase 4: Edit Entity (45-60 min)
1. Implement `App.editEntity(entityText)` to enter edit mode
2. Implement `App.saveEntityEdit(oldText, newText)`
3. Implement `App.cancelEntityEdit()`
4. Add validation (empty, duplicate check)
5. Wire up Edit/Save/Cancel buttons
6. Test editing and document updates

### Phase 5: Delete Entity (30 min)
1. Implement `App.deleteEntity(entityText)`
2. Create confirmation modal/dialog
3. Wire up delete button
4. Test entity removal and document updates

### Phase 6: Add Entity (60 min)
1. Implement `App.addNewEntity(text, type)`
2. Implement `App.findAllOccurrences(text)` search
3. Wire up Add Entity form
4. Add form validation
5. Show success/error messages
6. Test adding entities and highlighting

### Phase 7: Search/Filter (30 min)
1. Implement `App.filterEntities(query)`
2. Wire up search input
3. Filter entity list in real-time
4. Show filtered count
5. Test search behavior

### Phase 8: Polish & Testing (30 min)
1. Test all features together
2. Test edge cases (empty lists, duplicates, not found)
3. Mobile responsive testing
4. Keyboard shortcuts (Enter to save, Escape to cancel)
5. Final UI polish

**Total estimated time:** 5-7 hours

---

## Testing Checklist

### Sidebar Basic Functionality
- [ ] Sidebar toggles open/close with button
- [ ] Document area adjusts width when sidebar opens/closes
- [ ] Sidebar shows correct entity count
- [ ] Entities sorted alphabetically (A-Z)
- [ ] Entities show correct type badges
- [ ] Entities show correct instance counts

### Toggle All Instances
- [ ] Checkbox reflects current state (all redacted, all kept, mixed)
- [ ] Clicking checkbox toggles all instances
- [ ] "All On/Off" button works same as checkbox
- [ ] Document highlights update immediately
- [ ] Sidebar visual state updates (red/gray background)

### Edit Entity
- [ ] Click "Edit" enters edit mode
- [ ] Text input appears with current text
- [ ] Enter key saves changes
- [ ] Escape key cancels
- [ ] Save button updates all instances in document
- [ ] Cancel button reverts to original text
- [ ] Empty text cannot be saved
- [ ] Duplicate entity names show warning
- [ ] Whitespace is trimmed

### Delete Entity
- [ ] Click ✕ shows confirmation dialog
- [ ] Cancel keeps entity
- [ ] Delete removes all instances from document
- [ ] Entity removed from sidebar list
- [ ] Entity count updates

### Add Entity
- [ ] Click "Add Entity" shows form
- [ ] Can type entity text
- [ ] Can select entity type
- [ ] Add button searches and highlights all instances
- [ ] Shows success message with count
- [ ] Shows error if not found
- [ ] Shows warning if duplicate
- [ ] Cancel closes form without adding
- [ ] Empty text disables Add button
- [ ] New entity appears in alphabetical order

### Search/Filter
- [ ] Search input filters entity list in real-time
- [ ] Matches entity text (case-insensitive)
- [ ] Matches entity type (case-insensitive)
- [ ] Shows filtered count
- [ ] Empty search shows all entities

### Edge Cases
- [ ] Works with 0 entities (shows empty state)
- [ ] Works with 100+ entities (scrolling)
- [ ] Works with very long entity names
- [ ] Works with special characters in entity text
- [ ] Mobile responsive (sidebar becomes overlay)
- [ ] Keyboard navigation works
- [ ] All actions update entity count correctly

---

## Success Metrics

**User efficiency:**
- Fixing "Mad" → "Mads" takes 5 seconds (vs. manually clicking 24 instances)
- Bulk toggling "Nigel" takes 1 click (vs. 77 clicks)
- Adding missed entity takes 10 seconds

**Accuracy:**
- 100% of edited entities update correctly
- 0% chance of missing instances when editing
- Clear visual feedback on all actions

**Usability:**
- Sidebar provides clear overview of all detected entities
- Actions are obvious and intuitive
- No learning curve - immediately useful

---

## Future Enhancements (Not in Scope)

- Merge similar entities ("Mad" + "Mads" → "Mads")
- Undo/redo for entity changes
- Keyboard shortcuts (Ctrl+E to edit, Ctrl+D to delete)
- Export entity list as JSON
- Import entity list from previous session
- Group by type view (collapsible sections)
- Entity type color coding in document
- Regex-based entity addition
- Bulk operations (delete all MISC, toggle all PERSON, etc.)

---

## Design Complete ✅

This design is ready for implementation on branch: `feature/entity-editing-sidebar`
