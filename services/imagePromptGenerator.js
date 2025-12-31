// services/imagePromptGenerator.js
const axios = require('axios');
const logger = require('../utils/logger')/**
 * PHASE 5: Image Generation
 * Generate AI image prompts or retrieve free stock images
 * Supports: Unsplash API (free), Pexels API (free), AI prompt generation
 * No paid image generation APIs
 */
class ImagePromptGenerator {
  constructor() {
    this.providers = {
      unsplash: {
        endpoint: 'https://api.unsplash.com/search/photos',
        accessKey: process.env.UNSPLASH_ACCESS_KEY || null
      },
      pexels: {
        endpoint: 'https://api.pexels.com/v1/search',
        apiKey: process.env.PEXELS_API_KEY || null
      }
    };
    this.rateLimitDelay = 1000; // 1s between requests
    this.lastCallTime = 0;
  }

  /**
   * Generate image prompt or retrieve free stock image URL
   * @param {Object} context - Normalized signal with metadata
   * @param {Object} postMetadata - Generated post metadata
   * @returns {Object} { type, prompt?, url?, metadata }
   */
  async generate(context, postMetadata) {
    try {
      logger.info('ImagePromptGenerator: Starting generation', {
        topic: postMetadata.topic
      });

      // Strategy 1: Try to get free stock image
      const stockImage = await this._fetchStockImage(context, postMetadata);

      if (stockImage && stockImage.url) {
        logger.info('ImagePromptGenerator: Stock image found', {
          provider: stockImage.provider,
          url: stockImage.url
        });
        return stockImage;
      }

      // Strategy 2: Generate AI image prompt for external tools
      const aiPrompt = this._generateAIPrompt(context, postMetadata);

      logger.info('ImagePromptGenerator: AI prompt generated', {
        length: aiPrompt.prompt.length
      });

      return aiPrompt;

    } catch (error) {
      logger.error('ImagePromptGenerator: Generation failed', {
        error: error.message
      });

      return {
        type: 'none',
        message: 'Image generation unavailable',
        metadata: {
          error: error.message,
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  /**
   * Fetch free stock image from Unsplash or Pexels
   */
  async _fetchStockImage(context, postMetadata) {
    // Rate limiting
    await this._enforceRateLimit();

    // Extract search keywords
    const keywords = this._extractKeywords(context, postMetadata);

    // Try Unsplash first
    if (this.providers.unsplash.accessKey) {
      const unsplashResult = await this._searchUnsplash(keywords);
      if (unsplashResult) return unsplashResult;
    }

    // Fallback to Pexels
    if (this.providers.pexels.apiKey) {
      const pexelsResult = await this._searchPexels(keywords);
      if (pexelsResult) return pexelsResult;
    }

    return null;
  }

  /**
   * Search Unsplash for relevant images
   */
  async _searchUnsplash(keywords) {
    try {
      const response = await axios.get(this.providers.unsplash.endpoint, {
        params: {
          query: keywords.join(' '),
          per_page: 1,
          orientation: 'landscape'
        },
        headers: {
          'Authorization': `Client-ID ${this.providers.unsplash.accessKey}`
        },
        timeout: 10000
      });

      if (response.data?.results && response.data.results.length > 0) {
        const image = response.data.results[0];
        return {
          type: 'stock_image',
          url: image.urls.regular,
          alt: image.alt_description || keywords.join(' '),
          provider: 'unsplash',
          attribution: {
            photographer: image.user.name,
            photographer_url: image.user.links.html,
            download_location: image.links.download_location // Required by Unsplash API terms
          },
          metadata: {
            width: image.width,
            height: image.height,
            timestamp: new Date().toISOString()
          }
        };
      }

      return null;

    } catch (error) {
      logger.warn('ImagePromptGenerator: Unsplash search failed', {
        error: error.message
      });
      return null;
    }
  }

  /**
   * Search Pexels for relevant images
   */
  async _searchPexels(keywords) {
    try {
      const response = await axios.get(this.providers.pexels.endpoint, {
        params: {
          query: keywords.join(' '),
          per_page: 1,
          orientation: 'landscape'
        },
        headers: {
          'Authorization': this.providers.pexels.apiKey
        },
        timeout: 10000
      });

      if (response.data?.photos && response.data.photos.length > 0) {
        const image = response.data.photos[0];
        return {
          type: 'stock_image',
          url: image.src.large,
          alt: keywords.join(' '),
          provider: 'pexels',
          attribution: {
            photographer: image.photographer,
            photographer_url: image.photographer_url,
            source_url: image.url
          },
          metadata: {
            width: image.width,
            height: image.height,
            timestamp: new Date().toISOString()
          }
        };
      }

      return null;

    } catch (error) {
      logger.warn('ImagePromptGenerator: Pexels search failed', {
        error: error.message
      });
      return null;
    }
  }

  /**
   * Generate AI image prompt for external tools (Stable Diffusion, DALL-E, etc.)
   * User can manually use this prompt with free services
   */
  _generateAIPrompt(context, postMetadata) {
    const { topic, signalType } = postMetadata;
    const keywords = this._extractKeywords(context, postMetadata);

    // Construct descriptive prompt
    const prompt = `Professional, modern illustration representing ${topic}. 
Style: Clean, minimalist, technology-focused. 
Theme: ${signalType === 'github' ? 'Software development, coding, open source' : 'Professional business'}. 
Keywords: ${keywords.join(', ')}. 
Color palette: Blue, white, grey tones. 
Composition: Centered, balanced, suitable for LinkedIn post. 
Quality: High resolution, 16:9 aspect ratio.`;

    return {
      type: 'ai_prompt',
      prompt: prompt,
      keywords: keywords,
      metadata: {
        topic: topic,
        signalType: signalType,
        usage: 'Copy this prompt to Stable Diffusion, Craiyon, or similar free AI image generators',
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Extract relevant keywords from context
   */
  _extractKeywords(context, postMetadata) {
    const keywords = [];

    // Add topic
    if (postMetadata.topic) {
      keywords.push(postMetadata.topic.replace(/[^a-zA-Z0-9 ]/g, '').toLowerCase());
    }

    // Add signal type specific keywords
    switch (postMetadata.signalType) {
      case 'github':
        keywords.push('coding', 'technology', 'software');
        break;
      case 'wikipedia':
        keywords.push('knowledge', 'learning', 'education');
        break;
      default:
        keywords.push('professional', 'business');
    }

    // Add context-specific keywords (extract from summary)
    if (context.summary) {
      const summaryWords = context.summary
        .toLowerCase()
        .match(/\b[a-z]{4,}\b/g); // Words with 4+ chars

      if (summaryWords && summaryWords.length > 0) {
        // Take first 2 relevant words
        keywords.push(...summaryWords.slice(0, 2));
      }
    }

    // Remove duplicates and limit to 5 keywords
    return [...new Set(keywords)].slice(0, 5);
  }

  /**
   * Rate limiting
   */
  async _enforceRateLimit() {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastCallTime;

    if (timeSinceLastCall < this.rateLimitDelay) {
      const waitTime = this.rateLimitDelay - timeSinceLastCall;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.lastCallTime = Date.now();
  }

  /**
   * Health check for API availability
   */
  async healthCheck() {
    const status = {
      unsplash: this.providers.unsplash.accessKey ? 'configured' : 'missing',
      pexels: this.providers.pexels.apiKey ? 'configured' : 'missing'
    };

    if (status.unsplash === 'missing' && status.pexels === 'missing') {
      return {
        status: 'degraded',
        providers: status,
        message: 'No stock image APIs configured, will generate AI prompts only'
      };
    }

    return {
      status: 'healthy',
      providers: status,
      message: 'At least one image provider available'
    };
  }
}

module.exports = { ImagePromptGenerator }
