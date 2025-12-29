import dotenv from 'dotenv';
import { WorkflowEngine } from './workflows/workflowEngine.js';
import { CronScheduler } from './scheduler/cronScheduler.js';
import { logger } from './utils/logger.js';

dotenv.config();

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
  const scheduler = new CronScheduler();
  scheduler.start();
  
  process.on('SIGINT', () => {
    logger.info('Shutting down gracefully...');
    scheduler.stop();
    process.exit(0);
  });
};

main().catch((error) => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
