// workflows/workflowEngine.js
const logger = require('../utils/logger');
const stateStore = require('../utils/stateStore');
const GitHubTrigger = require('../triggers/githubTrigger');
const SignalClassifier = require('../triggers/signalClassifier');
const DataFetcher = require('../services/dataFetcher');
const DataNormalizer = require('../services/dataNormalizer');
const PromptBuilder = require('../services/promptBuilder');
const ContentGenerator = require('../services/contentGenerator');
const ImagePromptGenerator = require('../services/imagePromptGenerator');
const LinkedInPublisher = require('../services/linkedinPublisher');

/**
 * WORKFLOW ENGINE - FULLY INTEGRATED
 * Orchestrates the complete automation pipeline:
 * 1. GitHub signal detection → 2. Signal classification
 * 3. Data fetching & normalization → 4. Prompt building
 * 5. Content generation → 6. Image generation → 7. LinkedIn publishing
 */
class WorkflowEngine {
  constructor() {
    this.githubTrigger = new GitHubTrigger();
    this.signalClassifier = new SignalClassifier();
    this.dataFetcher = new DataFetcher();
    this.dataNormalizer = new DataNormalizer();
    this.promptBuilder = new PromptBuilder();
    this.contentGenerator = new ContentGenerator();
    this.imageGenerator = new ImagePromptGenerator();
    this.linkedinPublisher = new LinkedInPublisher();
  }

  /**
   * Execute complete automation workflow
   * @returns {Object} Workflow execution result
   */
  async executeWorkflow() {
    const startTime = Date.now();
    logger.info('WorkflowEngine: Starting complete automation pipeline');

    try {
      // PHASE 2.1: Detect GitHub signals
      logger.info('Phase 2.1: Detecting GitHub signals');
      const signals = await this.githubTrigger.detectSignals();

      if (!signals || signals.length === 0) {
        logger.info('WorkflowEngine: No new signals detected');
        return {
          status: 'no_signals',
          message: 'No new GitHub activity to process',
          timestamp: new Date().toISOString()
        };
      }

      logger.info(`WorkflowEngine: Found ${signals.length} signal(s)`);

      // Process each signal independently
      const results = [];
      for (const signal of signals) {
        try {
          const result = await this._processSingleSignal(signal);
          results.push(result);
        } catch (error) {
          logger.error('WorkflowEngine: Signal processing failed', {
            signal: signal.type,
            error: error.message
          });
          results.push({
            signal: signal,
            status: 'error',
            error: error.message
          });
        }
      }

      // Record execution
      const duration = Date.now() - startTime;
      await stateStore.recordExecution('workflow-engine', 'success', {
        signalsProcessed: signals.length,
        duration: `${duration}ms`,
        results: results
      });

      logger.info('WorkflowEngine: Pipeline complete', {
        duration: `${duration}ms`,
        total: signals.length,
        success: results.filter(r => r.status === 'published' || r.status === 'queued').length,
        failed: results.filter(r => r.status === 'error').length
      });

      return {
        status: 'success',
        signalsProcessed: signals.length,
        duration: `${duration}ms`,
        results: results,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error('WorkflowEngine: Pipeline failed', {
        error: error.message,
        stack: error.stack
      });

      await stateStore.recordExecution('workflow-engine', 'error', {
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Process a single signal through complete pipeline
   */
  async _processSingleSignal(signal) {
    const signalId = `${signal.type}_${Date.now()}`;
    logger.info(`Processing signal: ${signalId}`);

    // PHASE 2.2: Classify signal
    logger.info('Phase 2.2: Classifying signal');
    const classified = await this.signalClassifier.classify(signal);

    if (!classified || !classified.shouldProcess) {
      logger.info('Signal filtered out', { reason: classified.reason });
      return {
        signal: signal,
        status: 'filtered',
        reason: classified.reason
      };
    }

    // PHASE 3.1: Fetch additional context
    logger.info('Phase 3.1: Fetching context data');
    const contextData = await this.dataFetcher.fetch(classified);

    // PHASE 3.2: Normalize data
    logger.info('Phase 3.2: Normalizing data');
    const normalized = await this.dataNormalizer.normalize(
      classified,
      contextData
    );

    // PHASE 4: Build prompt
    logger.info('Phase 4: Building LLM prompt');
    const prompt = await this.promptBuilder.buildPrompt(normalized);

    // PHASE 5.1: Generate content
    logger.info('Phase 5.1: Generating content');
    const content = await this.contentGenerator.generate(prompt);

    if (!content || !content.text) {
      throw new Error('Content generation failed - no text produced');
    }

    // PHASE 5.2: Generate image
    logger.info('Phase 5.2: Generating image prompt/URL');
    const image = await this.imageGenerator.generate(
      normalized,
      prompt.metadata
    );

    // PHASE 6: Publish to LinkedIn
    logger.info('Phase 6: Publishing to LinkedIn');
    const publishPayload = {
      text: content.text,
      image: image,
      metadata: {
        topic: prompt.metadata.topic,
        signalType: classified.type,
        timestamp: new Date().toISOString()
      }
    };

    const publishResult = await this.linkedinPublisher.publish(publishPayload);

    logger.info('Signal processing complete', {
      signalId: signalId,
      status: publishResult.status
    });

    return {
      signal: signal,
      status: publishResult.status,
      queueId: publishResult.queueId,
      postId: publishResult.postId,
      content: {
        text: content.text.substring(0, 100) + '...',
        imageType: image.type
      }
    };
  }

  /**
   * Get workflow health status
   */
  async getHealthStatus() {
    const services = {
      github: await this.githubTrigger.healthCheck(),
      contentGenerator: await this.contentGenerator.healthCheck(),
      imageGenerator: await this.imageGenerator.healthCheck(),
      linkedinPublisher: await this.linkedinPublisher.healthCheck()
    };

    const allHealthy = Object.values(services).every(
      s => s.status === 'healthy'
    );

    return {
      overall: allHealthy ? 'healthy' : 'degraded',
      services: services,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get queued LinkedIn posts
   */
  getQueue() {
    return this.linkedinPublisher.getQueue('pending');
  }

  /**
   * Manually publish from queue
   */
  async publishFromQueue(queueId) {
    return await this.linkedinPublisher.publishFromQueue(queueId);
  }
}

module.exports = WorkflowEngine;
