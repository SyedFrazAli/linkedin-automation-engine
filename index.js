// index.js - Entry point for LinkedIn Automation Engine
require('dotenv').config();
const WorkflowEngine = require('./workflows/workflowEngine');
const scheduler = require('./scheduler/cronScheduler');
const logger = require('./utils/logger');
const main = async () => {
  logger.info('LinkedIn Automation Engine starting...');

  const args = process.argv.slice(2);
  const isWorkflowMode = args.includes('--workflow');

  if (isWorkflowMode) {
    logger.info('Running in single workflow execution mode');
    const engine = new WorkflowEngine();
    await engine.executeWorkflow();
    process.exit(0);
  }

  logger.info('Starting scheduler mode');

  // Schedule the LinkedIn automation workflow to run every day at 9 AM
  scheduler.schedule(
    'linkedin-automation-workflow',
    '0 9 * * *',
    async () => {
      logger.info('Executing scheduled LinkedIn automation workflow');
      const engine = new WorkflowEngine();
      await engine.executeWorkflow();
    }
  );

  scheduler.startAll();
  logger.info('Scheduler started. Automation engine is running.');

  process.on('SIGINT', () => {
    logger.info('Shutting down gracefully...');
    scheduler.stopAll();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    logger.info('Received SIGTERM signal. Shutting down...');
    scheduler.stopAll();
    process.exit(0);
  });
};

main().catch((error) => {
  logger.error('Fatal error in main process', { error: error.message });
  process.exit(1);
});
