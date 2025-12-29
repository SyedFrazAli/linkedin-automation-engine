// utils/stateStore.js
const fs = require('fs');
const path = require('path');
const { logger } = require('./logger');
const STATE_FILE = path.join(__dirname, '../state.json');

class StateStore {
  constructor() {
    this.state = this.load();
  }

  load() {
    try {
      if (!fs.existsSync(STATE_FILE)) {
        logger.info('No state file found, initializing empty state');
        return { processed: {}, executions: [], metadata: {} };
      }
      const data = fs.readFileSync(STATE_FILE, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      logger.error('Failed to load state, using empty state', { error: error.message });
      return { processed: {}, executions: [], metadata: {} };
    }
  }

  save() {
    try {
      fs.writeFileSync(STATE_FILE, JSON.stringify(this.state, null, 2));
      logger.debug('State saved successfully');
    } catch (error) {
      logger.error('Failed to save state', { error: error.message });
    }
  }

  // Deduplication: check if a signal has been processed
  hasProcessed(signalId) {
    return !!this.state.processed[signalId];
  }

  // Mark a signal as processed
  markProcessed(signalId, metadata = {}) {
    this.state.processed[signalId] = {
      timestamp: new Date().toISOString(),
      ...metadata
    };
    this.save();
    logger.info('Signal marked as processed', { signalId, metadata });
  }

  // Record execution audit trail
  recordExecution(workflow, status, details = {}) {
    const execution = {
      workflow,
      status,
      timestamp: new Date().toISOString(),
      ...details
    };
    this.state.executions.push(execution);
    // Keep only last 100 executions to prevent unbounded growth
    if (this.state.executions.length > 100) {
      this.state.executions = this.state.executions.slice(-100);
    }
    this.save();
    logger.info('Execution recorded', execution);
  }

  // Generic key-value state storage
  get(key, defaultValue = null) {
    return this.state.metadata[key] || defaultValue;
  }

  set(key, value) {
    this.state.metadata[key] = value;
    this.save();
    logger.debug('State metadata updated', { key, value });
  }

  // Get all processed signal IDs for debugging/monitoring
  getProcessedSignals() {
    return Object.keys(this.state.processed);
  }

  // Get recent executions
  getRecentExecutions(limit = 10) {
    return this.state.executions.slice(-limit);
  }
}

module.exports = new StateStore();
