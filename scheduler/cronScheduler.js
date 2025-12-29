// scheduler/cronScheduler.js
const cron = require('node-cron');
const logger = require('../utils/logger');
const stateStore = require('../utils/stateStore');

class CronScheduler {
  constructor() {
    this.tasks = [];
  }

  // Schedule a task with cron expression
  schedule(name, cronExpression, taskFunction) {
    logger.info('Scheduling task', { name, cronExpression });
    
    const task = cron.schedule(cronExpression, async () => {
      const startTime = new Date();
      logger.info('Task started', { name, startTime });
      
      try {
        await taskFunction();
        
        stateStore.recordExecution(name, 'success', {
          duration: new Date() - startTime,
          startTime: startTime.toISOString()
        });
        
        logger.info('Task completed successfully', { name, duration: new Date() - startTime });
      } catch (error) {
        stateStore.recordExecution(name, 'error', {
          error: error.message,
          stack: error.stack,
          startTime: startTime.toISOString()
        });
        
        logger.error('Task failed', { name, error: error.message, stack: error.stack });
      }
    }, {
      scheduled: false
    });
    
    this.tasks.push({ name, task, cronExpression });
    return task;
  }

  // Start all scheduled tasks
  startAll() {
    logger.info('Starting all scheduled tasks', { count: this.tasks.length });
    this.tasks.forEach(({ name, task }) => {
      task.start();
      logger.info('Task started', { name });
    });
  }

  // Stop all scheduled tasks
  stopAll() {
    logger.info('Stopping all scheduled tasks');
    this.tasks.forEach(({ name, task }) => {
      task.stop();
      logger.info('Task stopped', { name });
    });
  }

  // Get all scheduled tasks info
  getTasks() {
    return this.tasks.map(({ name, cronExpression }) => ({
      name,
      cronExpression
    }));
  }
}

module.exports = new CronScheduler();
