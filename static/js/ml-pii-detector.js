/**
 * ML PII Detector using Transformers.js
 * Uses Hugging Face's browser-based NER pipeline
 * GDPR compliant - all processing happens in browser
 */

class MLPIIDetector {
    constructor() {
        this.nerPipeline = null;
        this.modelLoaded = false;
        this.modelName = 'Xenova/bert-base-NER';
    }

    async initialize() {
        console.log('Initializing ML PII Detector with Transformers.js...');

        try {
            // Wait for Transformers.js to be ready
            if (!window.TransformersJS) {
                console.log('Waiting for Transformers.js to load...');
                await new Promise((resolve) => {
                    if (window.TransformersJS) {
                        resolve();
                    } else {
                        window.addEventListener('transformers-ready', resolve, { once: true });
                    }
                });
            }

            console.log('Loading NER model:', this.modelName);

            // Create NER pipeline - this downloads and caches the model
            this.nerPipeline = await window.TransformersJS.pipeline(
                'token-classification',
                this.modelName,
                { quantized: true } // Use quantized model for faster loading
            );

            this.modelLoaded = true;
            console.log('ML PII Detector initialized successfully');

            return true;
        } catch (error) {
            console.error('Failed to initialize ML detector:', error);
            this.modelLoaded = false;
            return false;
        }
    }

    async detectPII(text, options = {}) {
        const { minConfidence = 0.5 } = options;
        const startTime = performance.now();

        console.log(`\n🔍 Starting PII Detection`);
        console.log(`Text length: ${text.length} chars (~${Math.round(text.length / 5)} words)`);
        console.log(`Min confidence threshold: ${minConfidence}`);

        // Always run pattern detection (reliable)
        const patternEntities = this.detectPatterns(text);
        console.log('Pattern entities found:', patternEntities);

        // Try ML detection if model is loaded
        let mlEntities = [];
        if (this.modelLoaded && this.nerPipeline) {
            try {
                // PHASE 1: Learn - Discover unique entities from all chunks
                const chunks = this.chunkText(text, 150);
                console.log(`\n📚 PHASE 1: Learning entities from ${chunks.length} chunks...`);

                const discoveredEntities = new Map(); // text -> {type, confidence, sources}

                for (let i = 0; i < chunks.length; i++) {
                    const { text: chunkText } = chunks[i];

                    // Update progress (15% to 80% during learning phase)
                    const progress = 15 + (65 * (i + 1) / chunks.length);
                    if (window.App) {
                        if (window.App.updateLoadingMessage) {
                            window.App.updateLoadingMessage(`Learning entities... (chunk ${i + 1} of ${chunks.length})`);
                        }
                        if (window.App.updateProgress) {
                            window.App.updateProgress(progress);
                        }
                        if (window.App.updateStats) {
                            window.App.updateStats(i + 1, discoveredEntities.size);
                        }
                    }

                    console.log(`\nChunk ${i + 1}/${chunks.length}: "${chunkText.substring(0, 100)}..."`);

                    const results = await this.nerPipeline(chunkText);
                    const chunkEntities = this.mergeTokensToEntities(results, chunkText, minConfidence, false); // false = don't find positions yet

                    // Add discovered entities to our learned set
                    chunkEntities.forEach(e => {
                        const key = e.text.toLowerCase();
                        if (!discoveredEntities.has(key)) {
                            discoveredEntities.set(key, {
                                text: e.text,
                                type: e.type,
                                confidence: e.confidence,
                                foundInChunks: [i + 1]
                            });
                            console.log(`  ✅ Learned: "${e.text}" (${e.type})`);
                        } else {
                            // Already know this entity, update metadata
                            const existing = discoveredEntities.get(key);
                            existing.foundInChunks.push(i + 1);
                            existing.confidence = Math.max(existing.confidence, e.confidence);
                        }
                    });

                    // Browser breathing room
                    if (i % 3 === 0 && i > 0) {
                        await new Promise(resolve => setTimeout(resolve, 10));
                    }
                }

                console.log(`\n📝 Learned ${discoveredEntities.size} unique entities`);
                discoveredEntities.forEach((meta, key) => {
                    console.log(`  "${meta.text}" (${meta.type}) - found in chunks: ${meta.foundInChunks.join(', ')}`);
                });

                // PHASE 2: Apply - Find ALL occurrences of discovered entities in original text
                console.log(`\n🔍 PHASE 2: Applying learned entities to entire document...`);
                if (window.App) {
                    if (window.App.updateLoadingMessage) {
                        window.App.updateLoadingMessage(`Applying entities to document...`);
                    }
                    if (window.App.updateProgress) {
                        window.App.updateProgress(85);
                    }
                }

                mlEntities = this.findAllOccurrences(text, Array.from(discoveredEntities.values()));
                console.log(`✅ Found ${mlEntities.length} total occurrences`);

                // Update final stats
                if (window.App) {
                    if (window.App.updateProgress) {
                        window.App.updateProgress(95);
                    }
                    if (window.App.updateStats) {
                        window.App.updateStats(chunks.length, mlEntities.length);
                    }
                }

            } catch (error) {
                console.error('ML detection error:', error);
            }
        }

        // Merge ML and pattern entities
        const entities = this.mergeEntities(mlEntities, patternEntities);

        const processingTime = performance.now() - startTime;
        console.log(`Detection complete: ${mlEntities.length} ML, ${patternEntities.length} pattern, ${entities.length} total (${processingTime.toFixed(0)}ms)`);

        return {
            entities,
            processingTime,
            stats: {
                totalEntities: entities.length,
                mlEntities: mlEntities.length,
                patternEntities: patternEntities.length,
                byType: this.groupByType(entities)
            }
        };
    }

    /**
     * Split long text into chunks for processing
     * BERT models have ~512 token limit (roughly 400 words safe)
     */
    chunkText(text, wordsPerChunk = 400) {
        const words = text.split(/\s+/);
        const chunks = [];

        for (let i = 0; i < words.length; i += wordsPerChunk) {
            const chunkWords = words.slice(i, i + wordsPerChunk);
            const chunkText = chunkWords.join(' ');

            // Calculate character offset in original text
            const previousWords = words.slice(0, i);
            const offset = previousWords.join(' ').length + (i > 0 ? 1 : 0); // +1 for space

            chunks.push({
                text: chunkText,
                offset: offset,
                wordStart: i,
                wordEnd: i + chunkWords.length
            });
        }

        return chunks;
    }

    /**
     * Merge B-/I- tagged tokens into complete entities
     * @param {Array} tokens - Raw model output tokens
     * @param {string} text - The chunk text
     * @param {number} minConfidence - Minimum confidence threshold
     * @param {boolean} findPositions - Whether to find positions in text (default: true, set false for learning phase)
     */
    mergeTokensToEntities(tokens, text, minConfidence, findPositions = true) {
        const entities = [];
        let currentEntity = null;

        for (const token of tokens) {
            // Skip low confidence and 'O' tags
            if (token.score < minConfidence || token.entity === 'O') {
                if (currentEntity) {
                    entities.push(currentEntity);
                    currentEntity = null;
                }
                continue;
            }

            const isBegin = token.entity.startsWith('B-');
            const isContinue = token.entity.startsWith('I-');
            const entityType = token.entity.substring(2); // Remove B-/I- prefix

            if (isBegin) {
                // Start new entity
                if (currentEntity) {
                    entities.push(currentEntity);
                }
                currentEntity = {
                    type: this.mapEntityType(entityType),
                    text: token.word.replace(/^##/, ''), // Remove WordPiece prefix
                    start: null,
                    end: null,
                    confidence: token.score,
                    source: 'ml_model'
                };
            } else if (isContinue && currentEntity) {
                // Extend current entity
                const tokenText = token.word.replace(/^##/, '');
                // Check if this is a subword (starts with ##) or new word
                if (token.word.startsWith('##')) {
                    currentEntity.text += tokenText;
                } else {
                    currentEntity.text += ' ' + tokenText;
                }
                currentEntity.confidence = Math.min(currentEntity.confidence, token.score);
            }
        }

        // Don't forget last entity
        if (currentEntity) {
            entities.push(currentEntity);
        }

        // Filter out junk entities (abbreviations, common words, etc.)
        const beforeFilter = entities.length;
        const cleanedEntities = entities.filter(e => {
            const text = e.text.trim();
            const lower = text.toLowerCase();

            // Basic checks: must have length > 1 and contain letters
            if (text.length < 2 || !/[a-zA-Z]/.test(text)) {
                console.log(`  ❌ Filtered out: "${e.text}" (too short or no letters)`);
                return false;
            }

            // Reject common filler words
            const fillers = ['yeah', 'okay', 'ok', 'mhmm', 'hmm', 'uh', 'um', 'oh', 'ah'];
            if (fillers.includes(lower)) {
                console.log(`  ❌ Filtered out: "${e.text}" (filler word)`);
                return false;
            }

            // Reject very short entities (2-3 chars) unless they look like proper names
            // Proper names: capitalized and marked as PERSON
            if (text.length <= 3) {
                const isProperName = e.type === 'PERSON' && /^[A-Z][a-z]*$/.test(text);
                if (!isProperName) {
                    console.log(`  ❌ Filtered out: "${e.text}" (too short, not a proper name)`);
                    return false;
                }
            }

            // Reject common words that aren't PII
            const commonWords = ['english', 'teams', 'met', 'team', 'group', 'call', 'meeting'];
            if (commonWords.includes(lower)) {
                console.log(`  ❌ Filtered out: "${e.text}" (common word)`);
                return false;
            }

            return true;
        });
        const afterFilter = cleanedEntities.length;
        if (beforeFilter !== afterFilter) {
            console.log(`Filtered ${beforeFilter - afterFilter} junk entities, keeping ${afterFilter}`);
        }

        // Find positions if requested (skip during learning phase)
        if (findPositions) {
            return this.findEntityPositions(cleanedEntities, text);
        } else {
            return cleanedEntities; // Just return entity texts and types
        }
    }

    /**
     * Find the positions of entities in the original text
     */
    findEntityPositions(entities, text) {
        const positioned = [];
        const usedRanges = []; // Track used positions to avoid duplicates

        for (const entity of entities) {
            // Search for entity text in the document (case-insensitive)
            const searchText = entity.text;
            let searchStart = 0;

            while (searchStart < text.length) {
                const index = text.indexOf(searchText, searchStart);
                if (index === -1) {
                    // Try case-insensitive search
                    const lowerIndex = text.toLowerCase().indexOf(searchText.toLowerCase(), searchStart);
                    if (lowerIndex === -1) break;

                    // Check if this range is already used
                    const rangeKey = `${lowerIndex}-${lowerIndex + searchText.length}`;
                    if (!usedRanges.includes(rangeKey)) {
                        usedRanges.push(rangeKey);
                        positioned.push({
                            ...entity,
                            text: text.substring(lowerIndex, lowerIndex + searchText.length),
                            start: lowerIndex,
                            end: lowerIndex + searchText.length
                        });
                    }
                    searchStart = lowerIndex + searchText.length;
                } else {
                    // Check if this range is already used
                    const rangeKey = `${index}-${index + searchText.length}`;
                    if (!usedRanges.includes(rangeKey)) {
                        usedRanges.push(rangeKey);
                        positioned.push({
                            ...entity,
                            text: text.substring(index, index + searchText.length),
                            start: index,
                            end: index + searchText.length
                        });
                    }
                    searchStart = index + searchText.length;
                }
            }
        }

        // Only log if we found actual entities
        if (positioned.length > 0) {
            console.log('Positioned entities:', positioned.map(e => `"${e.text}" (${e.type})`));
        }
        return positioned;
    }

    /**
     * Find ALL occurrences of learned entities in the full text
     * This ensures consistency - if "Nigel" is found once, ALL instances are found
     */
    findAllOccurrences(text, learnedEntities) {
        const allOccurrences = [];

        for (const entity of learnedEntities) {
            const searchText = entity.text;
            let searchStart = 0;

            while (searchStart < text.length) {
                // Case-insensitive search
                const lowerText = text.toLowerCase();
                const lowerSearch = searchText.toLowerCase();
                const index = lowerText.indexOf(lowerSearch, searchStart);

                if (index === -1) break;

                // Found an occurrence - add it
                allOccurrences.push({
                    text: text.substring(index, index + searchText.length), // Preserve original case
                    type: entity.type,
                    confidence: entity.confidence,
                    start: index,
                    end: index + searchText.length,
                    source: 'ml_model'
                });

                searchStart = index + searchText.length;
            }
        }

        // Sort by position
        allOccurrences.sort((a, b) => a.start - b.start);

        console.log(`Applied ${learnedEntities.length} learned entities, found ${allOccurrences.length} total occurrences`);
        return allOccurrences;
    }

    /**
     * Map NER labels to our entity types
     */
    mapEntityType(label) {
        // Remove B- or I- prefix if present
        const cleanLabel = label.replace(/^[BI]-/, '');

        const mapping = {
            'PER': 'PERSON',
            'PERSON': 'PERSON',
            'ORG': 'ORGANIZATION',
            'ORGANIZATION': 'ORGANIZATION',
            'LOC': 'LOCATION',
            'LOCATION': 'LOCATION',
            'GPE': 'LOCATION', // Geo-political entity
            'MISC': 'MISC'
        };
        return mapping[cleanLabel] || cleanLabel;
    }

    /**
     * Pattern-based detection for reliable PII types
     */
    detectPatterns(text) {
        const entities = [];

        const patterns = [
            {
                type: 'EMAIL',
                regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g
            },
            {
                type: 'PHONE',
                regex: /\b(?:\+44\s?|0)(?:\d\s?){10,11}\b/g
            },
            {
                type: 'DATE',
                regex: /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/gi
            },
            {
                type: 'POSTCODE',
                regex: /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/gi
            }
        ];

        for (const pattern of patterns) {
            let match;
            while ((match = pattern.regex.exec(text)) !== null) {
                entities.push({
                    type: pattern.type,
                    text: match[0],
                    start: match.index,
                    end: match.index + match[0].length,
                    confidence: 0.95,
                    source: 'pattern'
                });
            }
        }

        return entities;
    }

    /**
     * Merge ML and pattern entities, removing duplicates
     */
    mergeEntities(mlEntities, patternEntities) {
        // Start with pattern entities (they're reliable)
        const merged = [...patternEntities];

        // Add ML entities that don't overlap with patterns
        for (const mlEntity of mlEntities) {
            const overlapsWithPattern = patternEntities.some(p =>
                (mlEntity.start < p.end && mlEntity.end > p.start)
            );
            if (!overlapsWithPattern) {
                merged.push(mlEntity);
            }
        }

        // Sort by start position
        merged.sort((a, b) => a.start - b.start);

        console.log(`Merge: ${patternEntities.length} patterns + ${mlEntities.length} ML = ${merged.length} total`);
        return merged;
    }

    /**
     * Group entities by type for stats
     */
    groupByType(entities) {
        const groups = {};
        for (const entity of entities) {
            groups[entity.type] = (groups[entity.type] || 0) + 1;
        }
        return groups;
    }
}
