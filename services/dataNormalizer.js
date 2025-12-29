// services/dataNormalizer.js
const logger = require('../utils/logger');

class DataNormalizer {
  constructor() {
    this.maxContextLength = 500;
    this.maxTopicLength = 100;
  }

  // Sanitize and truncate text
  sanitizeText(text, maxLength) {
    if (!text) return '';
    
    // Remove excessive whitespace
    const cleaned = text
      .replace(/\s+/g, ' ')
      .trim();
    
    // Truncate if needed
    if (cleaned.length > maxLength) {
      return cleaned.substring(0, maxLength - 3) + '...';
    }
    
    return cleaned;
  }

  // Normalize a single enriched signal
  normalize(enrichedSignal) {
    logger.info('Normalizing enriched signal', {
      topic: enrichedSignal.topic,
      category: enrichedSignal.category
    });
    
    try {
      const normalized = {
        // Core identification
        topic: this.sanitizeText(enrichedSignal.topic, this.maxTopicLength),
        category: enrichedSignal.category || 'unknown',
        signalType: enrichedSignal.signalType,
        
        // Context information
        context: this.sanitizeText(enrichedSignal.context, this.maxContextLength),
        
        // Metadata
        confidence: parseFloat(enrichedSignal.confidence.toFixed(2)),
        sources: Array.isArray(enrichedSignal.sources) 
          ? enrichedSignal.sources 
          : [],
        
        // Timestamp
        timestamp: new Date().toISOString(),
        
        // Original signal reference (for traceability)
        signalId: enrichedSignal.originalSignal?.id || 'unknown'
      };
      
      // Add optional fields if present
      if (enrichedSignal.originalSignal?.data) {
        normalized.sourceData = {
          author: enrichedSignal.originalSignal.data.author || null,
          date: enrichedSignal.originalSignal.data.date || 
                enrichedSignal.originalSignal.data.created_at || null,
          url: enrichedSignal.originalSignal.data.url || null
        };
      }
      
      logger.info('Signal normalized successfully', {
        topic: normalized.topic,
        confidence: normalized.confidence,
        contextLength: normalized.context.length
      });
      
      return normalized;
    } catch (error) {
      logger.error('Normalization failed', {
        error: error.message,
        signal: enrichedSignal
      });
      
      // Return minimal normalized structure on failure
      return {
        topic: 'Normalization Failed',
        category: 'unknown',
        signalType: enrichedSignal.signalType || 'unknown',
        context: 'Failed to normalize enriched data',
        confidence: 0.3,
        sources: [],
        timestamp: new Date().toISOString(),
        signalId: 'error'
      };
    }
  }

  // Normalize multiple enriched signals
  normalizeBatch(enrichedSignals) {
    logger.info('Batch normalizing signals', { count: enrichedSignals.length });
    
    const normalized = enrichedSignals.map(signal => this.normalize(signal));
    
    logger.info('Batch normalization complete', {
      total: enrichedSignals.length,
      normalized: normalized.length
    });
    
    return normalized;
  }

  // Merge context from multiple sources (if needed)
  mergeContext(contexts) {
    if (!Array.isArray(contexts) || contexts.length === 0) {
      return '';
    }
    
    // Join contexts with delimiter, respecting max length
    const merged = contexts
      .filter(ctx => ctx && ctx.trim())
      .join(' | ');
    
    return this.sanitizeText(merged, this.maxContextLength);
  }

  // Validate normalized data structure
  validate(normalizedData) {
    const requiredFields = [
      'topic',
      'category',
      'signalType',
      'context',
      'confidence',
      'sources',
      'timestamp',
      'signalId'
    ];
    
    for (const field of requiredFields) {
      if (!(field in normalizedData)) {
        logger.warn('Missing required field in normalized data', { field });
        return false;
      }
    }
    
    // Validate types
    if (typeof normalizedData.confidence !== 'number' ||
        normalizedData.confidence < 0 ||
        normalizedData.confidence > 1) {
      logger.warn('Invalid confidence value', {
        confidence: normalizedData.confidence
      });
      return false;
    }
    
    if (!Array.isArray(normalizedData.sources)) {
      logger.warn('Sources must be an array');
      return false;
    }
    
    logger.debug('Normalized data validated successfully');
    return true;
  }

  // Create a summary report of normalized data
  summarize(normalizedDataArray) {
    if (!Array.isArray(normalizedDataArray) || normalizedDataArray.length === 0) {
      return {
        total: 0,
        categories: {},
        signalTypes: {},
        avgConfidence: 0,
        totalSources: 0
      };
    }
    
    const summary = {
      total: normalizedDataArray.length,
      categories: {},
      signalTypes: {},
      avgConfidence: 0,
      totalSources: 0
    };
    
    let confidenceSum = 0;
    
    for (const data of normalizedDataArray) {
      // Count categories
      summary.categories[data.category] = 
        (summary.categories[data.category] || 0) + 1;
      
      // Count signal types
      summary.signalTypes[data.signalType] = 
        (summary.signalTypes[data.signalType] || 0) + 1;
      
      // Sum confidence
      confidenceSum += data.confidence;
      
      // Count sources
      summary.totalSources += data.sources.length;
    }
    
    summary.avgConfidence = parseFloat(
      (confidenceSum / normalizedDataArray.length).toFixed(2)
    );
    
    logger.info('Normalized data summary', summary);
    return summary;
  }
}

module.exports = { DataNormalizer };
