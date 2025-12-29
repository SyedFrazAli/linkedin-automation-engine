// services/dataFetcher.js
const axios = require('axios');
const { logger } = require('../utils/logger');

class DataFetcher {
  constructor() {
    this.wikipediaBaseUrl = 'https://en.wikipedia.org/api/rest_v1';
    this.timeout = 5000; // 5 second timeout
  }

  // Extract keywords from signal for context lookup
  extractKeywords(signal) {
    let text = '';
    
    switch (signal.type) {
      case 'commit':
        text = signal.data.message;
        break;
      case 'readme_update':
        text = signal.data.name;
        break;
      case 'issue':
        text = signal.data.title;
        break;
      default:
        text = '';
    }
    
    // Simple keyword extraction: remove common words and take significant terms
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during',
      'is', 'are', 'was', 'were', 'been', 'be', 'have', 'has', 'had',
      'add', 'update', 'fix', 'implement', 'change', 'remove', 'create'
    ]);
    
    const words = text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3 && !stopWords.has(word));
    
    // Return unique keywords, limit to 3 most relevant
    return [...new Set(words)].slice(0, 3);
  }

  // Fetch Wikipedia summary for a topic
  async fetchWikipediaSummary(topic) {
    try {
      logger.info('Fetching Wikipedia summary', { topic });
      
      const response = await axios.get(
        `${this.wikipediaBaseUrl}/page/summary/${encodeURIComponent(topic)}`,
        { timeout: this.timeout }
      );
      
      if (response.data && response.data.extract) {
        logger.info('Wikipedia summary fetched', {
          topic,
          length: response.data.extract.length
        });
        
        return {
          source: 'wikipedia',
          topic,
          content: response.data.extract,
          url: response.data.content_urls?.desktop?.page || null
        };
      }
      
      logger.warn('No Wikipedia extract found', { topic });
      return null;
    } catch (error) {
      if (error.response?.status === 404) {
        logger.debug('Wikipedia page not found', { topic });
      } else {
        logger.error('Wikipedia fetch failed', {
          topic,
          error: error.message
        });
      }
      return null;
    }
  }

  // Fetch context from multiple keywords
  async fetchContextFromKeywords(keywords) {
    logger.info('Fetching context from keywords', { keywords });
    const contexts = [];
    
    for (const keyword of keywords) {
      const wikiContext = await this.fetchWikipediaSummary(keyword);
      if (wikiContext) {
        contexts.push(wikiContext);
        break; // Use first successful match to avoid over-fetching
      }
    }
    
    return contexts;
  }

  // Main method: enrich signal with contextual data
  async enrichSignal(signal) {
    logger.info('Enriching signal with context', {
      id: signal.id,
      type: signal.type
    });
    
    try {
      // Extract keywords from signal
      const keywords = this.extractKeywords(signal);
      
      if (keywords.length === 0) {
        logger.warn('No keywords extracted from signal', { id: signal.id });
        return {
          topic: 'Unknown',
          context: 'No contextual information available',
          sources: [],
          signalType: signal.type,
          confidence: signal.confidence,
          category: signal.category
        };
      }
      
      logger.debug('Keywords extracted', { keywords });
      
      // Fetch context from external APIs
      const contexts = await this.fetchContextFromKeywords(keywords);
      
      if (contexts.length === 0) {
        logger.warn('No external context found', { keywords });
        return {
          topic: keywords[0],
          context: `Technical topic: ${keywords.join(', ')}`,
          sources: [],
          signalType: signal.type,
          confidence: signal.confidence,
          category: signal.category
        };
      }
      
      // Build enriched data object
      const enriched = {
        topic: contexts[0].topic,
        context: contexts[0].content.substring(0, 500), // Limit context length
        sources: contexts.map(c => `${c.source}:${c.topic}`),
        signalType: signal.type,
        confidence: signal.confidence,
        category: signal.category,
        originalSignal: {
          id: signal.id,
          type: signal.type,
          data: signal.data
        }
      };
      
      logger.info('Signal enriched successfully', {
        topic: enriched.topic,
        sources: enriched.sources.length,
        contextLength: enriched.context.length
      });
      
      return enriched;
    } catch (error) {
      logger.error('Signal enrichment failed', {
        id: signal.id,
        error: error.message
      });
      
      // Return minimal enriched data on failure
      return {
        topic: 'Unknown',
        context: 'Context enrichment failed',
        sources: [],
        signalType: signal.type,
        confidence: Math.max(0.3, signal.confidence - 0.2), // Reduce confidence on failure
        category: signal.category || 'unknown'
      };
    }
  }

  // Batch enrich multiple signals
  async enrichSignals(signals) {
    logger.info('Batch enriching signals', { count: signals.length });
    const enriched = [];
    
    for (const signal of signals) {
      const enrichedSignal = await this.enrichSignal(signal);
      enriched.push(enrichedSignal);
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    logger.info('Batch enrichment complete', {
      total: signals.length,
      enriched: enriched.length
    });
    
    return enriched;
  }
}

module.exports = { DataFetcher };
