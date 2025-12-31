// tests/testLinkedInPublish.js
const logger = require('../utils/logger');
const stateStore = require('../utils/stateStore');
const linkedinPublisher = require('../services/linkedinPublisher');

async function runSinglePostTest() {
  try {
    logger.info('Starting LinkedIn single-post test');

    // Load queued signals
    const queuedSignals = await stateStore.getQueuedSignals();
    if (!queuedSignals || queuedSignals.length === 0) {
      logger.warn('No queued signals available for publishing');
      return;
    }

    // Pick the first queued signal
    const signal = queuedSignals[0];
    logger.info(`Selected signalId=${signal.signalId} for test publishing`);

    // Publish to LinkedIn (queue-first, single post)
    const result = await linkedinPublisher.publish(signal);
    if (result.success) {
      logger.info(`Test post successfully published to LinkedIn: postId=${result.postId}`);
      // Mark as published in stateStore
      await stateStore.markAsPublished(signal.signalId);
    } else {
      logger.error('LinkedIn publishing failed', { error: result.error });
    }

  } catch (err) {
    logger.error('Error in LinkedIn single-post test', { error: err });
  } finally {
    logger.info('LinkedIn single-post test complete');
    process.exit(0);
  }
}

runSinglePostTest();
