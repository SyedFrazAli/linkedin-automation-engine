// services/contentGenerator.js
const axios = require('axios');
const logger = require('../utils/logger');

/**
 * PHASE 5: Content Generation
 * LLM-agnostic API wrapper for free inference providers
 * Supports: HuggingFace Inference API (free tier)
 * Fallback: Local mock generation if API unavailable
 */
class ContentGenerator {
  constructor() {
    this.providers = {
      huggingface: {
        endpoint: 'https://api-inference.huggingface.co/models',
        models: {
          text: 'mistralai/Mistral-7B-Instruct-v0.2', // Free inference
          fallback: 'gpt2' // Lightweight fallback
        }
      }
    };
    this.hfToken = process.env.HUGGINGFACE_TOKEN || null;
    this.rateLimitDelay = 2000; // 2s between requests
    this.lastCallTime = 0;
  }

  /**
   * Generate LinkedIn post from structured prompt
   * @param {Object} prompt - From PromptBuilder.buildPrompt()
   * @returns {Object} { text, metadata, error }
   */
  async generate(prompt) {
    try {
      logger.info('ContentGenerator: Starting generation', {
        provider: 'huggingface',
        model: this.providers.huggingface.models.text
      });

      // Validate prompt structure
      if (!this._validatePrompt(prompt)) {
        throw new Error('Invalid prompt structure');
      }

      // Rate limiting
      await this._enforceRateLimit();

      // Attempt HuggingFace generation
      let result = await this._generateWithHuggingFace(prompt);

      // Fallback to mock if HF fails
      if (!result || result.error) {
        logger.warn('ContentGenerator: HuggingFace failed, using fallback');
        result = this._generateFallback(prompt);
      }

      // Validate output
      const validated = this._validateOutput(result);

      logger.info('ContentGenerator: Generation complete', {
        length: validated.text.length,
        provider: validated.provider
      });

      return validated;

    } catch (error) {
      logger.error('ContentGenerator: Generation failed', { error: error.message });
      return {
        text: null,
        metadata: { error: error.message },
        provider: 'error'
      };
    }
  }

  /**
   * Call HuggingFace Inference API
   */
  async _generateWithHuggingFace(prompt) {
    if (!this.hfToken) {
      logger.warn('ContentGenerator: No HuggingFace token, skipping API call');
      return null;
    }

    const model = this.providers.huggingface.models.text;
    const endpoint = `${this.providers.huggingface.endpoint}/${model}`;

    try {
      // Format prompt for Mistral instruction format
      const formattedPrompt = this._formatMistralPrompt(prompt);

      const response = await axios.post(
        endpoint,
        {
          inputs: formattedPrompt,
          parameters: {
            max_new_tokens: 500,
            temperature: 0.7,
            top_p: 0.9,
            return_full_text: false
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${this.hfToken}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000 // 30s timeout
        }
      );

      if (response.data && response.data[0] && response.data[0].generated_text) {
        return {
          text: this._cleanGeneratedText(response.data[0].generated_text),
          provider: 'huggingface',
          model: model,
          metadata: {
            tokens: response.data[0].generated_text.length,
            timestamp: new Date().toISOString()
          }
        };
      }

      return null;

    } catch (error) {
      if (error.response?.status === 503) {
        logger.warn('ContentGenerator: HuggingFace model loading, retry later');
      } else if (error.response?.status === 429) {
        logger.warn('ContentGenerator: Rate limit hit');
      } else {
        logger.error('ContentGenerator: HuggingFace API error', {
          status: error.response?.status,
          message: error.message
        });
      }
      return null;
    }
  }

  /**
   * Format prompt for Mistral instruction template
   */
  _formatMistralPrompt(prompt) {
    const { system, instructions, context, constraints } = prompt;

    return `<s>[INST] ${system}

Task: ${instructions.task}

Context:
${instructions.context.map(ctx => `- ${ctx}`).join('\n')}

Guidelines:
${instructions.guidelines.map(g => `- ${g}`).join('\n')}

Constraints:
- Length: ${constraints.length.min}-${constraints.length.max} ${constraints.length.unit}
- Tone: ${constraints.formatting.tone}
- Include: ${constraints.structure.include.join(', ')}
- Relevant hashtags: ${constraints.formatting.hashtags}

Generate a professional LinkedIn post. [/INST]`;
  }

  /**
   * Fallback: Generate structured placeholder text
   * CRITICAL: Does NOT generate real content, returns structured template
   */
  _generateFallback(prompt) {
    const { metadata, context } = prompt;

    // Template structure only - NOT real content
    const template = {
      text: `[PLACEHOLDER: LinkedIn post about ${metadata.topic}]\n\n[Hook: Opening statement]\n\n[Context: ${context.summary?.substring(0, 50) || 'Details about signal'}...]\n\n[Call-to-action]\n\n#${metadata.topic.replace(/\s+/g, '')} #Automation`,
      provider: 'fallback',
      model: 'template',
      metadata: {
        warning: 'Fallback template used - requires manual editing',
        timestamp: new Date().toISOString()
      }
    };

    logger.warn('ContentGenerator: Using fallback template');
    return template;
  }

  /**
   * Clean and format generated text
   */
  _cleanGeneratedText(text) {
    return text
      .trim()
      .replace(/\[INST\]|\[\/INST\]|<s>|<\/s>/g, '') // Remove instruction tags
      .replace(/\n{3,}/g, '\n\n') // Max 2 line breaks
      .substring(0, 3000); // LinkedIn character limit
  }

  /**
   * Validate prompt structure
   */
  _validatePrompt(prompt) {
    const required = ['metadata', 'system', 'instructions', 'context', 'constraints'];
    return required.every(field => prompt[field]);
  }

  /**
   * Validate output structure
   */
  _validateOutput(result) {
    if (!result || !result.text || result.text.includes('[PLACEHOLDER')) {
      logger.warn('ContentGenerator: Output is placeholder or invalid');
    }

    return {
      text: result.text || null,
      provider: result.provider || 'unknown',
      model: result.model || 'unknown',
      metadata: {
        ...result.metadata,
        validated: true,
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Rate limiting to respect free tier limits
   */
  async _enforceRateLimit() {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastCallTime;

    if (timeSinceLastCall < this.rateLimitDelay) {
      const waitTime = this.rateLimitDelay - timeSinceLastCall;
      logger.debug(`ContentGenerator: Rate limit wait ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.lastCallTime = Date.now();
  }

  /**
   * Health check for API availability
   */
  async healthCheck() {
    if (!this.hfToken) {
      return {
        status: 'degraded',
        provider: 'huggingface',
        message: 'No API token configured, using fallback'
      };
    }

    try {
      // Test API with minimal request
      const response = await axios.post(
        `${this.providers.huggingface.endpoint}/${this.providers.huggingface.models.fallback}`,
        { inputs: 'test' },
        {
          headers: { 'Authorization': `Bearer ${this.hfToken}` },
          timeout: 5000
        }
      );

      return {
        status: 'healthy',
        provider: 'huggingface',
        models: this.providers.huggingface.models
      };

    } catch (error) {
      return {
        status: 'unhealthy',
        provider: 'huggingface',
        error: error.message
      };
    }
  }
}

module.exports = ContentGenerator;
