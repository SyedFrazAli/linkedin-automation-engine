// services/promptBuilder.js
const logger = require('../utils/logger');
class PromptBuilder {
    constructor() {  // LinkedIn post constraints
    this.minLength = 200;
    this.maxLength = 300;
    this.recommendedHashtags = 3;
  }

  // Build instruction blocks from normalized data
  buildInstructionBlocks(normalizedData) {
    return {
      topic: normalizedData.topic,
      context: normalizedData.context,
      signalType: normalizedData.signalType,
      category: normalizedData.category,
      sources: normalizedData.sources,
      confidence: normalizedData.confidence
    };
  }

  // Build constraints for LLM
  buildConstraints() {
    return {
      format: 'LinkedIn professional post',
      length: {
        min: this.minLength,
        max: this.maxLength,
        unit: 'words'
      },
      structure: {
        include: [
          'Opening hook or question',
          'Main content with context',
          'Key takeaway or insight',
          'Call-to-action or discussion prompt'
        ],
        avoid: [
          'Overly promotional language',
          'Clickbait phrases',
          'Excessive emojis',
          'Unsubstantiated claims'
        ]
      },
      formatting: {
        hashtags: this.recommendedHashtags,
        paragraphs: 'Use line breaks for readability',
        tone: 'Professional yet conversational'
      }
    };
  }

  // Generate system instructions for LLM
  buildSystemInstructions() {
    return {
      role: 'You are a professional LinkedIn content creator specializing in technical topics.',
      guidelines: [
        'Create engaging content based on the provided topic and context',
        'Use factual information from the context provided',
        'Write in a professional yet approachable tone',
        'Include relevant hashtags for discoverability',
        'End with a call-to-action or thought-provoking question',
        'Do not fabricate information beyond the provided context',
        'Maintain authenticity and credibility'
      ]
    };
  }

  // Build complete prompt structure
  buildPrompt(normalizedData) {
    logger.info('Building prompt from normalized data', {
      topic: normalizedData.topic,
      signalId: normalizedData.signalId
    });
    
    try {
      const prompt = {
        // Metadata for traceability
        metadata: {
          signalId: normalizedData.signalId,
          timestamp: new Date().toISOString(),
          category: normalizedData.category,
          confidence: normalizedData.confidence
        },
        
        // System instructions
        system: this.buildSystemInstructions(),
        
        // Instruction blocks
        instructions: this.buildInstructionBlocks(normalizedData),
        
        // Constraints
        constraints: this.buildConstraints(),
        
        // Optional source attribution
        attribution: normalizedData.sourceData || null
      };
      
      logger.info('Prompt built successfully', {
        signalId: normalizedData.signalId,
        topic: prompt.instructions.topic
      });
      
      return prompt;
    } catch (error) {
      logger.error('Prompt building failed', {
        signalId: normalizedData.signalId,
        error: error.message
      });
      
      throw new Error(`Prompt building failed: ${error.message}`);
    }
  }

  // Build prompts for multiple normalized signals
  buildBatch(normalizedDataArray) {
    logger.info('Batch building prompts', { count: normalizedDataArray.length });
    
    const prompts = [];
    const errors = [];
    
    for (const data of normalizedDataArray) {
      try {
        const prompt = this.buildPrompt(data);
        prompts.push(prompt);
      } catch (error) {
        logger.error('Failed to build prompt for signal', {
          signalId: data.signalId,
          error: error.message
        });
        errors.push({
          signalId: data.signalId,
          error: error.message
        });
      }
    }
    
    logger.info('Batch prompt building complete', {
      total: normalizedDataArray.length,
      successful: prompts.length,
      failed: errors.length
    });
    
    return { prompts, errors };
  }

  // Convert prompt to LLM API format (provider-agnostic)
  toAPIFormat(prompt, provider = 'openai') {
    logger.debug('Converting prompt to API format', { provider });
    
    // Build user message from instructions and constraints
    const userMessage = this.formatUserMessage(prompt);
    
    switch (provider.toLowerCase()) {
      case 'openai':
      case 'huggingface':
        return {
          messages: [
            {
              role: 'system',
              content: this.formatSystemMessage(prompt.system)
            },
            {
              role: 'user',
              content: userMessage
            }
          ],
          metadata: prompt.metadata
        };
      
      case 'anthropic':
        return {
          system: this.formatSystemMessage(prompt.system),
          messages: [
            {
              role: 'user',
              content: userMessage
            }
          ],
          metadata: prompt.metadata
        };
      
      default:
        logger.warn('Unknown provider, using default format', { provider });
        return {
          system: this.formatSystemMessage(prompt.system),
          user: userMessage,
          metadata: prompt.metadata
        };
    }
  }

  // Format system message
  formatSystemMessage(systemInstructions) {
    const { role, guidelines } = systemInstructions;
    return `${role}\n\nGuidelines:\n${guidelines.map(g => `- ${g}`).join('\n')}`;
  }

  // Format user message with all context
  formatUserMessage(prompt) {
    const { instructions, constraints } = prompt;
    
    let message = `Create a LinkedIn post about: ${instructions.topic}\n\n`;
    
    message += `Context: ${instructions.context}\n\n`;
    
    message += `Signal Type: ${instructions.signalType}\n`;
    message += `Category: ${instructions.category}\n\n`;
    
    if (instructions.sources && instructions.sources.length > 0) {
      message += `Information Sources: ${instructions.sources.join(', ')}\n\n`;
    }
    
    message += `Requirements:\n`;
    message += `- Length: ${constraints.length.min}-${constraints.length.max} ${constraints.length.unit}\n`;
    message += `- Include: ${constraints.structure.include.join(', ')}\n`;
    message += `- Tone: ${constraints.formatting.tone}\n`;
    message += `- Add ${constraints.formatting.hashtags} relevant hashtags\n\n`;
    
    message += `Generate a professional LinkedIn post following these requirements.`;
    
    return message;
  }

  // Validate prompt structure
  validatePrompt(prompt) {
    const requiredFields = ['metadata', 'system', 'instructions', 'constraints'];
    
    for (const field of requiredFields) {
      if (!(field in prompt)) {
        logger.warn('Missing required field in prompt', { field });
        return false;
      }
    }
    
    // Validate metadata
    if (!prompt.metadata.signalId || !prompt.metadata.timestamp) {
      logger.warn('Incomplete prompt metadata');
      return false;
    }
    
    // Validate instructions
    if (!prompt.instructions.topic || !prompt.instructions.context) {
      logger.warn('Incomplete prompt instructions');
      return false;
    }
    
    logger.debug('Prompt validated successfully');
    return true;
  }
}

module.exports = { PromptBuilder };
