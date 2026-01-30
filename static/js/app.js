/**
 * Main Application Logic - Browser-only PII Redactor MVP
 * Integrates with: ml-pii-detector.js, file-handler.js
 */

const App = {
    // Application state
    state: 'UPLOAD', // UPLOAD | REVIEW | DOWNLOAD
    mlDetector: null,
    fileHandler: null,

    // Current document data
    originalText: '',
    originalFilename: '',
    entities: [],
    redactFlags: [], // true = will redact, false = keep

    // Sidebar state
    sidebarOpen: true,
    searchQuery: '',
    editingEntityText: null,
    editingOriginalText: '',

    /**
     * Initialize the application
     */
    async initApp() {
        this.mlDetector = new MLPIIDetector();
        this.fileHandler = FileHandler; // FileHandler is an object, not a class

        const statusEl = document.getElementById('model-status');

        // Initialize ML model
        try {
            if (statusEl) {
                statusEl.className = 'model-status loading';
                statusEl.textContent = 'Loading ML model...';
            }

            await this.mlDetector.initialize();
            console.log('ML detector initialized');

            if (statusEl) {
                statusEl.className = 'model-status ready';
                statusEl.textContent = 'ML model ready';
            }
        } catch (error) {
            console.error('Failed to initialize ML detector:', error);
            if (statusEl) {
                statusEl.className = 'model-status error';
                statusEl.textContent = 'Failed to load ML model';
            }
        }

        this.setupEventListeners();
        this.setState('UPLOAD');
    },

    /**
     * Setup DOM event listeners
     */
    setupEventListeners() {
        const dropZone = document.getElementById('drop-zone');
        const fileInput = document.getElementById('file-input');
        const downloadBtn = document.getElementById('download-btn');
        const proceedBtn = document.getElementById('proceed-download-btn');
        const startOverBtn = document.getElementById('start-over-btn');

        // File drop handlers
        if (dropZone) {
            dropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropZone.classList.add('drag-over');
            });
            dropZone.addEventListener('dragleave', () => {
                dropZone.classList.remove('drag-over');
            });
            dropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropZone.classList.remove('drag-over');
                const file = e.dataTransfer.files[0];
                if (file) this.handleFile(file);
            });
            dropZone.addEventListener('click', () => fileInput?.click());
        }

        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) this.handleFile(file);
            });
        }

        // Proceed to download from review state
        if (proceedBtn) {
            proceedBtn.addEventListener('click', () => this.showDownloadState());
        }

        // Final download button
        if (downloadBtn) {
            downloadBtn.addEventListener('click', () => this.handleDownload());
        }

        // Start over button
        if (startOverBtn) {
            startOverBtn.addEventListener('click', () => this.setState('UPLOAD'));
        }

        // Sidebar toggle button
        const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');
        if (toggleSidebarBtn) {
            toggleSidebarBtn.addEventListener('click', () => this.toggleSidebar());
        }
    },

    /**
     * Handle file upload - read and process
     */
    async handleFile(file) {
        console.log('handleFile called with:', file.name);
        try {
            this.originalFilename = file.name;

            // Show loading state
            this.setState('LOADING');

            // Reset progress UI
            this.updateProgress(0);
            this.updateStats(0, 0);

            // Update filename in loading screen
            const filenameEl = document.getElementById('loading-filename');
            if (filenameEl) {
                filenameEl.textContent = file.name;
            }

            // Step 1: Read file
            this.updateLoadingMessage('Reading file...');
            this.updateProgress(10);
            console.log('Reading file...');
            this.originalText = await this.fileHandler.readFile(file);
            console.log('File read, length:', this.originalText.length);

            // Step 2: Run ML detection
            this.updateLoadingMessage('Running ML detection...');
            console.log('Detecting PII...');
            const result = await this.mlDetector.detectPII(this.originalText);
            console.log('Detection result:', result);

            // Step 3: Process results
            this.updateLoadingMessage('Processing results...');
            this.updateProgress(100);
            this.entities = result.entities || [];
            this.redactFlags = this.entities.map(() => true); // Default: redact all
            console.log('Entities found:', this.entities.length);

            // Transition to review
            console.log('Setting state to REVIEW...');
            this.setState('REVIEW');
            console.log('State set to REVIEW');
        } catch (error) {
            console.error('Error processing file:', error);
            alert('Error processing file: ' + error.message);
            // Return to upload state on error
            this.setState('UPLOAD');
        }
    },

    /**
     * Render review UI with highlighted entities
     */
    renderReview(text, entities) {
        console.log('renderReview called, text length:', text?.length, 'entities:', entities?.length);
        console.log('Entity types:', entities?.map(e => `${e.text}: ${e.type}`));
        const container = document.getElementById('document-content');
        if (!container) {
            console.error('document-content element not found!');
            return;
        }

        // Update filename display
        const filenameEl = document.getElementById('review-filename');
        if (filenameEl) {
            filenameEl.textContent = this.originalFilename;
        }

        // Sort entities by start position for rendering
        const sorted = entities
            .map((e, i) => ({ ...e, index: i }))
            .sort((a, b) => a.start - b.start);

        let html = '';
        let lastEnd = 0;

        sorted.forEach((entity) => {
            // Add text before this entity
            html += this.escapeHtml(text.slice(lastEnd, entity.start));

            // Add highlighted entity
            const willRedact = this.redactFlags[entity.index];
            const redactClass = willRedact ? 'redacted' : 'kept';
            html += `<span class="pii-entity ${redactClass}" data-type="${entity.type}" data-index="${entity.index}" onclick="App.toggleEntity(${entity.index})" title="${entity.type} (${Math.round(entity.confidence * 100)}% confidence)">`;
            html += this.escapeHtml(entity.text);
            html += '</span>';

            lastEnd = entity.end;
        });

        // Add remaining text
        html += this.escapeHtml(text.slice(lastEnd));

        container.innerHTML = html;

        // Update entity count
        const redactCount = this.redactFlags.filter(f => f).length;
        const countEl = document.getElementById('entity-count');
        if (countEl) {
            countEl.textContent = `${entities.length} entities found (${redactCount} to redact)`;
        }
    },

    /**
     * Toggle redact/keep for an entity
     */
    toggleEntity(index) {
        this.redactFlags[index] = !this.redactFlags[index];
        this.renderReview(this.originalText, this.entities);
    },

    /**
     * Generate redacted text output with numbered entity types
     */
    generateRedactedText() {
        let result = this.originalText;

        // First pass: assign numbers to unique entities by type
        // Same text = same number (e.g., "John Smith" appearing twice = PERSON 1 both times)
        const typeCounters = {};  // { PERSON: 1, ORGANIZATION: 1, ... }
        const entityNumbers = {}; // { "PERSON:John Smith": 1, "PERSON:Sarah Wilson": 2, ... }

        // Get entities to redact, sorted by appearance order (ascending)
        const toRedact = this.entities
            .map((e, i) => ({ ...e, index: i }))
            .filter((e) => this.redactFlags[e.index])
            .sort((a, b) => a.start - b.start);

        // Assign numbers in order of first appearance
        toRedact.forEach((entity) => {
            const key = `${entity.type}:${entity.text}`;
            if (!entityNumbers[key]) {
                typeCounters[entity.type] = (typeCounters[entity.type] || 0) + 1;
                entityNumbers[key] = typeCounters[entity.type];
            }
        });

        // Sort descending for replacement (to preserve positions)
        const sorted = toRedact.sort((a, b) => b.start - a.start);

        sorted.forEach((entity) => {
            const key = `${entity.type}:${entity.text}`;
            const num = entityNumbers[key];
            const replacement = `[${entity.type} ${num}]`;
            result = result.slice(0, entity.start) + replacement + result.slice(entity.end);
        });

        return result;
    },

    /**
     * Handle download button click
     */
    /**
     * Show download state with preview
     */
    showDownloadState() {
        const redactedText = this.generateRedactedText();

        // Show preview
        const previewEl = document.getElementById('preview-content');
        if (previewEl) {
            previewEl.textContent = redactedText;
        }

        this.setState('DOWNLOAD');
    },

    /**
     * Handle final download
     */
    handleDownload() {
        const redactedText = this.generateRedactedText();

        // Get redaction style
        const styleSelect = document.getElementById('redaction-style');
        const style = styleSelect ? styleSelect.value : '[TYPE]';

        // Apply selected redaction style
        let finalText = redactedText;
        // Match [TYPE N] format (e.g., [PERSON 1], [ORGANIZATION 2])
        const typePattern = /\[(PERSON|ORGANIZATION|LOCATION|MISC|EMAIL|PHONE|DATE|POSTCODE)\s+\d+\]/g;
        if (style === '[REDACTED]') {
            finalText = redactedText.replace(typePattern, '[REDACTED]');
        } else if (style === 'blocks') {
            finalText = redactedText.replace(typePattern, '████████');
        }
        // [TYPE] is the default - keeps numbered format like [PERSON 1]

        // Update preview with final style
        const previewEl = document.getElementById('preview-content');
        if (previewEl) {
            previewEl.textContent = finalText;
        }

        // Generate filename and download
        const nameParts = this.originalFilename.split('.');
        const ext = nameParts.length > 1 ? '.' + nameParts.pop() : '';
        const baseName = nameParts.join('.');
        const newFilename = `${baseName}.redacted${ext}`;

        this.fileHandler.downloadFile(finalText, newFilename);
    },

    /**
     * Switch between application states
     */
    setState(state) {
        console.log('setState called with:', state);
        this.state = state;

        // Hide all states
        const states = ['upload-state', 'review-state', 'download-state', 'loading-overlay'];
        states.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.classList.add('hidden');
                console.log('Hidden:', id);
            } else {
                console.warn('Element not found:', id);
            }
        });

        // Show current state
        const viewMap = {
            'UPLOAD': 'upload-state',
            'LOADING': 'loading-overlay',
            'REVIEW': 'review-state',
            'DOWNLOAD': 'download-state'
        };

        const targetId = viewMap[state];
        const viewEl = document.getElementById(targetId);
        if (viewEl) {
            viewEl.classList.remove('hidden');
            console.log('Showing:', targetId);
        } else {
            console.error('Target view not found:', targetId);
        }

        // State-specific rendering
        if (state === 'REVIEW') {
            console.log('Calling renderReview...');
            this.renderReview(this.originalText, this.entities);
            this.renderSidebar();
        }
    },

    /**
     * Update loading message during file processing
     */
    updateLoadingMessage(message) {
        const messageEl = document.getElementById('loading-message');
        if (messageEl) {
            messageEl.textContent = message;
        }
    },

    /**
     * Update loading progress bar (0-100)
     */
    updateProgress(percent) {
        const progressBar = document.getElementById('progress-bar');
        if (progressBar) {
            progressBar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
        }
    },

    /**
     * Update loading stats
     */
    updateStats(chunks, entities) {
        console.log(`📊 updateStats called: chunks=${chunks}, entities=${entities}`);
        const chunksEl = document.getElementById('chunks-processed');
        const entitiesEl = document.getElementById('entities-found');
        console.log('DOM elements found:', { chunksEl: !!chunksEl, entitiesEl: !!entitiesEl });
        if (chunksEl) {
            chunksEl.textContent = chunks;
            console.log(`✅ Updated chunks display to: ${chunks}`);
        } else {
            console.error('❌ chunks-processed element not found!');
        }
        if (entitiesEl) {
            entitiesEl.textContent = entities;
            console.log(`✅ Updated entities display to: ${entities}`);
        } else {
            console.error('❌ entities-found element not found!');
        }
    },

    /**
     * Toggle sidebar visibility
     */
    toggleSidebar() {
        this.sidebarOpen = !this.sidebarOpen;
        const sidebar = document.getElementById('entity-sidebar');
        if (sidebar) {
            if (this.sidebarOpen) {
                sidebar.classList.remove('hidden');
            } else {
                sidebar.classList.add('hidden');
            }
        }
    },

    /**
     * Get unique entities grouped by text
     * Returns array of {text, type, count, indices, allRedacted, someRedacted}
     */
    getUniqueEntities() {
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
            .sort((a, b) => a.text.localeCompare(b.text, undefined, { sensitivity: 'base' }));
    },

    /**
     * Render entity sidebar
     */
    renderSidebar() {
        const uniqueEntities = this.getUniqueEntities();
        const entityList = document.getElementById('entity-list');
        const entityCountEl = document.getElementById('entity-list-count');

        if (!entityList) return;

        // Update count
        if (entityCountEl) {
            entityCountEl.textContent = `${uniqueEntities.length} ${uniqueEntities.length === 1 ? 'Entity' : 'Entities'} (A-Z)`;
        }

        // Filter by search query if present
        const filtered = this.searchQuery ?
            uniqueEntities.filter(e =>
                e.text.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
                e.type.toLowerCase().includes(this.searchQuery.toLowerCase())
            ) : uniqueEntities;

        // Render entity items
        entityList.innerHTML = filtered.map(entity => this.renderEntityItem(entity)).join('');
    },

    /**
     * Render a single entity item
     */
    renderEntityItem(entity) {
        const redactedClass = entity.allRedacted ? 'redacted' : 'kept';
        const checked = entity.allRedacted ? 'checked' : '';
        const isEditing = this.editingEntityText && this.editingEntityText.toLowerCase() === entity.text.toLowerCase();

        if (isEditing) {
            // Edit mode
            return `
                <div class="entity-item ${redactedClass}" data-entity-text="${this.escapeHtml(entity.text)}">
                    <div class="entity-header">
                        <input type="checkbox" ${checked} disabled>
                        <input type="text"
                               class="entity-text-input"
                               id="edit-entity-input"
                               value="${this.escapeHtml(entity.text)}"
                               aria-label="Edit entity text">
                        <span class="entity-type-badge">${entity.type}</span>
                    </div>
                    <div class="entity-meta">
                        <span class="entity-count-text">${entity.count} ${entity.count === 1 ? 'instance' : 'instances'}</span>
                    </div>
                    <div class="entity-actions">
                        <button class="btn-save" onclick="App.saveEntityEdit()">✓ Save</button>
                        <button class="btn-cancel" onclick="App.cancelEntityEdit()">✕ Cancel</button>
                    </div>
                </div>
            `;
        }

        // Normal mode
        return `
            <div class="entity-item ${redactedClass}" data-entity-text="${this.escapeHtml(entity.text)}">
                <div class="entity-header">
                    <input type="checkbox"
                           class="entity-checkbox"
                           ${checked}
                           onchange="App.toggleAllInstances('${this.escapeHtml(entity.text)}')"
                           aria-label="Toggle all instances of ${this.escapeHtml(entity.text)}">
                    <span class="entity-text">${this.escapeHtml(entity.text)}</span>
                </div>
                <div class="entity-meta">
                    <span class="entity-type-badge">${entity.type}</span>
                    <span class="entity-count-text">${entity.count} ${entity.count === 1 ? 'instance' : 'instances'}</span>
                </div>
                <div class="entity-actions">
                    <button class="btn-edit" onclick="App.editEntity('${this.escapeHtml(entity.text)}')">Edit</button>
                    <button class="btn-toggle-all" onclick="App.toggleAllInstances('${this.escapeHtml(entity.text)}')">All On/Off</button>
                    <button class="btn-delete" onclick="App.deleteEntity('${this.escapeHtml(entity.text)}')">✕</button>
                </div>
            </div>
        `;
    },

    /**
     * Toggle all instances of an entity
     */
    toggleAllInstances(entityText) {
        console.log('toggleAllInstances called for:', entityText);

        // Find all indices where entity.text matches (case-insensitive)
        const indices = [];
        this.entities.forEach((entity, index) => {
            if (entity.text.toLowerCase() === entityText.toLowerCase()) {
                indices.push(index);
            }
        });

        if (indices.length === 0) {
            console.warn('No entities found with text:', entityText);
            return;
        }

        // Determine current state
        const allRedacted = indices.every(i => this.redactFlags[i] === true);
        const allKept = indices.every(i => this.redactFlags[i] === false);

        // Toggle logic:
        // - If all redacted: set all to kept (false)
        // - If all kept or mixed: set all to redacted (true)
        const newValue = allRedacted ? false : true;

        // Update redactFlags
        indices.forEach(i => {
            this.redactFlags[i] = newValue;
        });

        console.log(`Toggled ${indices.length} instances of "${entityText}" to ${newValue ? 'redacted' : 'kept'}`);

        // Re-render document and sidebar
        this.renderReview(this.originalText, this.entities);
        this.renderSidebar();
    },

    /**
     * Enter edit mode for an entity
     */
    editEntity(entityText) {
        console.log('editEntity called for:', entityText);
        this.editingEntityText = entityText;
        this.editingOriginalText = entityText;
        this.renderSidebar();

        // Focus the input after render
        setTimeout(() => {
            const input = document.getElementById('edit-entity-input');
            if (input) {
                input.focus();
                input.select();
            }
        }, 0);
    },

    /**
     * Save entity edit
     */
    saveEntityEdit() {
        const input = document.getElementById('edit-entity-input');
        if (!input) return;

        const newText = input.value.trim();
        const oldText = this.editingOriginalText;

        // Validation
        if (!newText) {
            alert('Entity text cannot be empty');
            return;
        }

        if (newText.toLowerCase() === oldText.toLowerCase()) {
            // No change, just cancel
            this.cancelEntityEdit();
            return;
        }

        // Check for duplicate
        const duplicate = this.entities.find(e =>
            e.text.toLowerCase() === newText.toLowerCase() &&
            e.text.toLowerCase() !== oldText.toLowerCase()
        );
        if (duplicate) {
            alert(`Entity "${newText}" already exists`);
            return;
        }

        // Update all entities with matching text
        this.entities.forEach(entity => {
            if (entity.text.toLowerCase() === oldText.toLowerCase()) {
                entity.text = newText;
            }
        });

        console.log(`Updated entity from "${oldText}" to "${newText}"`);

        // Clear editing state
        this.editingEntityText = null;
        this.editingOriginalText = '';

        // Re-render document and sidebar
        this.renderReview(this.originalText, this.entities);
        this.renderSidebar();
    },

    /**
     * Cancel entity edit
     */
    cancelEntityEdit() {
        this.editingEntityText = null;
        this.editingOriginalText = '';
        this.renderSidebar();
    },

    /**
     * Placeholder: Delete entity
     */
    deleteEntity(entityText) {
        console.log('deleteEntity called for:', entityText);
        // Will implement in Phase 5
    },

    /**
     * Escape HTML special characters
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

// Expose App to window so ML detector can access it
window.App = App;

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => App.initApp());
