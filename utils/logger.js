// PHASE 1.1: Logger - Observability Foundation
// No external dependencies, production-ready logging

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

class Logger {
  constructor() {
    this.level = LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase()] ?? LOG_LEVELS.INFO;
  }

  _format(level, message, meta = {}) {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...meta
    });
  }

  error(message, meta) {
    if (this.level >= LOG_LEVELS.ERROR) {
      console.error(this._format('ERROR', message, meta));
    }
  }

  warn(message, meta) {
    if (this.level >= LOG_LEVELS.WARN) {
      console.warn(this._format('WARN', message, meta));
    }
  }

  info(message, meta) {
    if (this.level >= LOG_LEVELS.INFO) {
      console.log(this._format('INFO', message, meta));
    }
  }

  debug(message, meta) {
    if (this.level >= LOG_LEVELS.DEBUG) {
      console.log(this._format('DEBUG', message, meta));
    }
  }
}

const  logger = new Logger();
module.exports = logger;
