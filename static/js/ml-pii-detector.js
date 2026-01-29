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

        // Always run pattern detection (reliable)
        const patternEntities = this.detectPatterns(text);
        console.log('Pattern entities found:', patternEntities);

        // Try ML detection if model is loaded
        let mlEntities = [];
        if (this.modelLoaded && this.nerPipeline) {
            try {
                // Get raw token predictions with positions
                const results = await this.nerPipeline(text);

                console.log('Raw NER results:', results);

                // Debug: show first few results with positions
                console.log('Sample entities with positions:');
                results.slice(0, 5).forEach(r => {
                    console.log(`  "${r.word}" at [${r.start}-${r.end}], type: ${r.entity}, score: ${r.score.toFixed(3)}`);
                });

                // Merge B-/I- tokens into complete entities
                mlEntities = this.mergeTokensToEntities(results, text, minConfidence);

                console.log('Merged ML entities:', mlEntities);
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
     * Merge B-/I- tagged tokens into complete entities and find their positions
     */
    mergeTokensToEntities(tokens, text, minConfidence) {
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

        // Now find positions for each entity in the text
        return this.findEntityPositions(entities, text);
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

        console.log('Positioned entities:', positioned.map(e => `"${e.text}" at [${e.start}-${e.end}]`));
        return positioned;
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
